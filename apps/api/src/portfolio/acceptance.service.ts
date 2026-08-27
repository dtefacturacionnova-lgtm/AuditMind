import {
  Injectable, NotFoundException, ForbiddenException, BadRequestException,
} from '@nestjs/common';
import { AcceptanceCheck, AcceptanceRating, ClientStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/jwt.strategy';
import { AiService } from '../ai/ai.service';
import { ClientsService } from './clients.service';
import { UpdateAcceptanceCheckDto, DecideAcceptanceDto } from './dto/acceptance.dto';
import { DEFAULT_MIN_CPE_HOURS_YEAR } from '../common/constants/competency.constants';

/**
 * Severidad relativa de las 5 dimensiones del Radar (NIA 220 / ISQM 1 +
 * Sanciones/PLD). `overallResult` = la PEOR de las cinco. PENDING es el valor
 * más bajo porque no representa una evaluación: `decide()` lo rechaza antes
 * de comparar.
 */
const SEVERITY: Record<AcceptanceRating, number> = {
  [AcceptanceRating.PENDING]: 0,
  [AcceptanceRating.GREEN]:   1,
  [AcceptanceRating.YELLOW]:  2,
  [AcceptanceRating.RED]:     3,
};

const DIMENSION_LABELS: Record<string, string> = {
  independenceStatus: 'Independencia',
  competenceStatus:   'Competencia y recursos',
  integrityStatus:    'Integridad de la administración',
  riskStatus:         'Riesgo del encargo',
  sanctionsStatus:    'Sanciones / PLD',
};

const CHECK_INCLUDE = {
  client:    { select: { id: true, legalName: true, status: true } },
  decidedBy: { select: { id: true, name: true } },
} satisfies Prisma.AcceptanceCheckInclude;

@Injectable()
export class AcceptanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clients: ClientsService,
    private readonly aiService: AiService,
  ) {}

  private async getCheckOrThrow(id: string, user: AuthUser): Promise<AcceptanceCheck> {
    const check = await this.prisma.acceptanceCheck.findUnique({ where: { id } });
    if (!check) throw new NotFoundException('Radar de aceptación no encontrado');
    if (check.organizationId !== user.organizationId) throw new ForbiddenException();
    return check;
  }

  /**
   * Arranca (o recupera) el Radar de Aceptación del año en curso.
   * Idempotente: `AcceptanceCheck` tiene @@unique([clientId, year]), así que si
   * ya existe se devuelve tal cual en vez de duplicar.
   */
  async startAcceptance(clientId: string, user: AuthUser) {
    const client = await this.clients.getClientOrThrow(clientId, user);
    const year = new Date().getFullYear();

    // upsert con update vacío: si ya existe se devuelve intacto (no se pisa
    // ninguna calificación ya hecha) y un doble clic no produce P2002.
    const check = await this.prisma.acceptanceCheck.upsert({
      where:  { clientId_year: { clientId, year } },
      create: { organizationId: user.organizationId, clientId, year },
      update: {},
      include: CHECK_INCLUDE,
    });

    // El prospecto entra formalmente en evaluación. Si ya estaba más adelante en
    // el pipeline (o fue declinado) no se retrocede el estado.
    if (client.status === ClientStatus.PROSPECT) {
      await this.prisma.client.update({
        where: { id: clientId },
        data:  { status: ClientStatus.IN_ACCEPTANCE },
      });
    }

    return check;
  }

  // ── Actualizar dimensiones / checklist ────────────────────────────────────
  async update(id: string, dto: UpdateAcceptanceCheckDto, user: AuthUser) {
    await this.getCheckOrThrow(id, user);

    return this.prisma.acceptanceCheck.update({
      where: { id },
      data: {
        ...(dto.independenceStatus != null && { independenceStatus: dto.independenceStatus }),
        ...(dto.independenceNotes  != null && { independenceNotes:  dto.independenceNotes }),
        ...(dto.competenceStatus   != null && { competenceStatus:   dto.competenceStatus }),
        ...(dto.competenceNotes    != null && { competenceNotes:    dto.competenceNotes }),
        ...(dto.integrityStatus    != null && { integrityStatus:    dto.integrityStatus }),
        ...(dto.integrityNotes     != null && { integrityNotes:     dto.integrityNotes }),
        ...(dto.riskStatus         != null && { riskStatus:         dto.riskStatus }),
        ...(dto.riskNotes          != null && { riskNotes:          dto.riskNotes }),
        ...(dto.sanctionsStatus    != null && { sanctionsStatus:    dto.sanctionsStatus }),
        ...(dto.sanctionsNotes     != null && { sanctionsNotes:     dto.sanctionsNotes }),
        ...(dto.checklist          != null && { checklist: dto.checklist as unknown as Prisma.InputJsonValue }),
      },
      include: CHECK_INCLUDE,
    });
  }

  /**
   * Decisión de aceptación/continuidad: consolida las 4 dimensiones en
   * `overallResult` (la peor) y deja constancia de quién y cuándo decidió.
   * Si el resultado es RED, el cliente queda DECLINED.
   */
  async decide(id: string, dto: DecideAcceptanceDto, user: AuthUser) {
    const check = await this.getCheckOrThrow(id, user);

    const dimensions: Array<[string, AcceptanceRating]> = [
      ['independenceStatus', check.independenceStatus],
      ['competenceStatus',   check.competenceStatus],
      ['integrityStatus',    check.integrityStatus],
      ['riskStatus',         check.riskStatus],
      ['sanctionsStatus',    check.sanctionsStatus],
    ];

    const pending = dimensions.filter(([, rating]) => rating === AcceptanceRating.PENDING);
    if (pending.length > 0) {
      const names = pending.map(([key]) => DIMENSION_LABELS[key] ?? key).join(', ');
      throw new BadRequestException(
        `No se puede decidir el Radar de Aceptación con dimensiones sin evaluar: ${names}. ` +
        'Califique las 5 dimensiones (GREEN / YELLOW / RED) antes de decidir.',
      );
    }

    const overallResult = dimensions.reduce<AcceptanceRating>(
      (worst, [, rating]) => (SEVERITY[rating] > SEVERITY[worst] ? rating : worst),
      AcceptanceRating.GREEN,
    );

    const updated = await this.prisma.acceptanceCheck.update({
      where: { id },
      data: {
        overallResult,
        overallJustification: dto.overallJustification,
        decidedById:          user.id,
        decidedAt:            new Date(),
      },
      include: CHECK_INCLUDE,
    });

    if (overallResult === AcceptanceRating.RED) {
      await this.prisma.client.update({
        where: { id: check.clientId },
        data:  { status: ClientStatus.DECLINED },
      });
    }

    return updated;
  }

  /**
   * Corre el mismo motor CAATs de `PT-PLD` (sanctions_screening — OFAC SDN +
   * Lista Consolidada ONU + UK), pero sobre la identidad del CLIENTE en vez
   * de sus proveedores: razón social + representante legal + beneficiarios
   * finales declarados. Cubre la obligación de DDC (Art. 15, Ley PLD/FT/FP
   * Decreto 426/2025) cuando el propio despacho es sujeto obligado para este
   * cliente (Art. 7.7) — no reemplaza esa determinación, que el auditor deja
   * en `sanctionsNotes`; solo aporta la evidencia del screening.
   *
   * No fija `sanctionsStatus` automáticamente: igual que las otras 4
   * dimensiones, la calificación final la da el auditor tras revisar el
   * resultado (el matching difuso puede dar falsos positivos/negativos).
   */
  async screenSanctions(id: string, user: AuthUser) {
    const check = await this.getCheckOrThrow(id, user);
    const client = await this.clients.getClientOrThrow(check.clientId, user);

    const owners = (client.beneficialOwners as unknown as Array<{ name?: string }>) ?? [];
    const records: Array<{ vendor_name: string }> = [
      { vendor_name: client.legalName },
      ...(client.legalRepName ? [{ vendor_name: client.legalRepName }] : []),
      ...owners.filter(o => o?.name).map(o => ({ vendor_name: o.name as string })),
    ];

    const result = await this.aiService.runCaats('sanctions_screening', { records });

    return this.prisma.acceptanceCheck.update({
      where: { id },
      data:  { sanctionsScreeningResult: result as Prisma.InputJsonValue },
      include: CHECK_INCLUDE,
    });
  }

  /**
   * Resumen de competencia/recursos REALES de la firma para respaldar la
   * dimensión "Competencia y Recursos" (NIA 220/ISQM 1 componente de
   * Aceptación) — no fija `competenceStatus` automáticamente, igual que el
   * screening de sanciones: es evidencia de referencia, la calificación la
   * da el auditor. Es org-wide (no depende de un `AcceptanceCheck`
   * específico), por eso no toma `:id` — la pregunta que responde es "¿tiene
   * el despacho, hoy, la competencia y capacidad para atender un cliente
   * más?", no algo propio de un cliente en particular.
   */
  async getCompetenceSummary(user: AuthUser) {
    const year = new Date().getFullYear();
    const staff = await this.prisma.user.findMany({
      where: { organizationId: user.organizationId, active: true },
      select: {
        certifications: { where: { isActive: true }, select: { type: true } },
        competencies: { select: { area: true, expertiseLevel: true } },
        cpeRecords: { where: { year }, select: { hours: true } },
      },
    });

    const staffTotal = staff.length;
    const staffCompliant = staff.filter(
      (u) => u.cpeRecords.reduce((s, r) => s + r.hours, 0) >= DEFAULT_MIN_CPE_HOURS_YEAR,
    ).length;

    const certByType = new Map<string, number>();
    for (const u of staff) {
      for (const c of u.certifications) {
        certByType.set(c.type, (certByType.get(c.type) ?? 0) + 1);
      }
    }

    const areaCount = new Map<string, number>();
    for (const u of staff) {
      for (const c of u.competencies) {
        // Cuenta personas con nivel 3+ ("competente" en adelante) por área —
        // un nivel 1-2 no respalda aceptar un cliente que requiera esa área.
        if (c.expertiseLevel >= 3) areaCount.set(c.area, (areaCount.get(c.area) ?? 0) + 1);
      }
    }

    return {
      year,
      staffTotal,
      staffCompliant,
      cpeCompliancePct: staffTotal > 0 ? Math.round((staffCompliant / staffTotal) * 100) : null,
      minRequiredHours: DEFAULT_MIN_CPE_HOURS_YEAR,
      certifications: Array.from(certByType.entries())
        .map(([type, count]) => ({ type, count }))
        .sort((a, b) => b.count - a.count),
      competencyAreas: Array.from(areaCount.entries())
        .map(([area, count]) => ({ area, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
    };
  }
}
