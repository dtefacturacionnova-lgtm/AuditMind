import {
  Injectable, NotFoundException, ForbiddenException, BadRequestException, ConflictException,
} from '@nestjs/common';
import {
  AcceptanceCheck, AcceptanceRating, ClientStatus, EngagementKind, EngagementLetterStatus, EngagementStatus, Prisma, ProposalStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/jwt.strategy';
import { AiService } from '../ai/ai.service';
import { ClientsService } from './clients.service';
import { UpdateAcceptanceCheckDto, DecideAcceptanceDto, ReopenAcceptanceDto, ReviewScreeningMatchDto } from './dto/acceptance.dto';
import { mergeChecklist, reviewChecklist } from './acceptance-checklist.util';
import { presentAcceptanceCheck } from './acceptance-present.util';
import { carryOverReviews, screeningMatches, screeningReviewProblems, ScreeningReview } from './screening-review.util';
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

  private present<T extends AcceptanceCheck>(check: T) {
    return presentAcceptanceCheck(check);
  }

  /** Año del último encargo de auditoría aprobado del cliente en un ejercicio anterior (cliente de continuidad), o null. */
  private async continuityYear(clientId: string, organizationId: string): Promise<number | null> {
    const prior = await this.prisma.engagement.findFirst({
      where: {
        organizationId, clientId, kind: EngagementKind.AUDIT, status: EngagementStatus.APPROVED,
        fiscalYear: { lt: new Date().getFullYear() },
      },
      orderBy: { fiscalYear: 'desc' },
      select: { fiscalYear: true },
    });
    return prior?.fiscalYear ?? null;
  }

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
    if (!check.decidedAt && (
      client.status === ClientStatus.PROSPECT || client.status === ClientStatus.DECLINED || client.status === ClientStatus.INACTIVE
    )) {
      await this.prisma.client.update({
        where: { id: clientId },
        data:  { status: ClientStatus.IN_ACCEPTANCE },
      });
    }

    // Un Radar sin decidir lleva sus tres verificaciones previas (auditor predecesor, conflictos, servicios previos). Un cliente de
    // continuidad trae la del predecesor como «No aplica». Se guarda solo si cambió, para que un doble clic no escriba dos veces.
    if (!check.decidedAt) {
      const merged = mergeChecklist(check.checklist, undefined, { continuityYear: await this.continuityYear(clientId, user.organizationId) });
      if (JSON.stringify(merged) !== JSON.stringify(check.checklist)) {
        const seeded = await this.prisma.acceptanceCheck.updateMany({
          where: { id: check.id, decidedAt: null },
          data:  { checklist: merged as unknown as Prisma.InputJsonValue },
        });
        if (seeded.count === 1) return this.present(await this.prisma.acceptanceCheck.findUniqueOrThrow({ where: { id: check.id }, include: CHECK_INCLUDE }));
      }
    }

    return this.present(check);
  }

  // ── Actualizar dimensiones / checklist ────────────────────────────────────
  async update(id: string, dto: UpdateAcceptanceCheckDto, user: AuthUser) {
    const stored = await this.getCheckOrThrow(id, user);
    this.assertOpen(stored);

    // Los ítems fijos del checklist se completan con el texto del servidor; uno marcado «Hecho» o «No aplica» exige su constancia.
    const checklist = dto.checklist != null ? mergeChecklist(stored.checklist, dto.checklist) : null;
    if (checklist) {
      const { invalid } = reviewChecklist(checklist);
      if (invalid.length > 0) throw new BadRequestException(invalid.join(' '));
    }

    return this.present(await this.prisma.acceptanceCheck.update({
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
        ...(checklist && { checklist: checklist as unknown as Prisma.InputJsonValue }),
      },
      include: CHECK_INCLUDE,
    }));
  }

  /** La decisión del Radar es definitiva: ya no se editan las calificaciones, no se vuelve a decidir ni a correr el screening. */
  private assertOpen(check: AcceptanceCheck) {
    if (check.decidedAt) {
      throw new BadRequestException(
        'Este Radar de Aceptación ya fue decidido y es definitivo. Si cambió la información, un CAE puede reabrirlo indicando el motivo.',
      );
    }
  }

  /**
   * Decisión de aceptación/continuidad: consolida las 4 dimensiones en
   * `overallResult` (la peor) y deja constancia de quién y cuándo decidió.
   * Si el resultado es RED, el cliente queda DECLINED.
   */
  async decide(id: string, dto: DecideAcceptanceDto, user: AuthUser) {
    const stored = await this.getCheckOrThrow(id, user);
    this.assertOpen(stored);

    // Se decide con lo que el usuario tiene en pantalla: las calificaciones y notas recibidas pisan lo guardado.
    const check = {
      ...stored,
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
    };

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

    // Sanciones/PLD: la nota documenta si el despacho es sujeto obligado para este cliente (Art. 7.7) y la revisión del screening.
    // Sin esa constancia un «Verde» no distingue «revisado» de «no aplica»; con coincidencias, una nota que las descarte es obligatoria.
    const screening = check.sanctionsScreeningResult as { findings?: unknown[] } | null;
    const hasMatches = (screening?.findings?.length ?? 0) > 0;
    if (!check.sanctionsNotes?.trim()) {
      throw new BadRequestException(
        hasMatches
          ? 'El screening de sanciones tiene coincidencias: documenta en las notas de Sanciones/PLD por qué se descartan o qué se resolvió.'
          : 'Documenta en las notas de Sanciones/PLD si el despacho es sujeto obligado para este cliente (Art. 7.7) y la revisión realizada.',
      );
    }

    // Coincidencias del screening: cada una revisada (falso positivo / confirmada, con motivo); una confirmada obliga a Sanciones en Rojo.
    const screeningProblems = screeningReviewProblems(check.sanctionsScreeningResult as never, check.sanctionsStatus);
    if (screeningProblems.length > 0) throw new BadRequestException(screeningProblems.join(' '));

    // Verificaciones previas (auditor predecesor, conflictos, servicios previos): resueltas para aceptar o continuar. Si se declina
    // al cliente (Rojo) no hace falta completarlas, pero lo que se haya escrito sí debe ser válido.
    const checklist = mergeChecklist(stored.checklist, dto.checklist);
    const checklistReview = reviewChecklist(checklist);
    if (checklistReview.invalid.length > 0) throw new BadRequestException(checklistReview.invalid.join(' '));
    if (overallResult !== AcceptanceRating.RED && checklistReview.pending.length > 0) {
      throw new BadRequestException(
        `Antes de aceptar o continuar con el cliente hay que resolver las verificaciones previas: ${checklistReview.pending.join('; ')}. ` +
        'Márcalas como hechas (con lo que se encontró) o «No aplica» (con el motivo).',
      );
    }

    // La decisión se reclama de forma condicional: dos personas decidiendo a la vez no se pisan.
    const claimed = await this.prisma.$transaction(async (tx) => {
      const res = await tx.acceptanceCheck.updateMany({
        where: { id, organizationId: user.organizationId, decidedAt: null },
        data: {
          independenceStatus: check.independenceStatus, independenceNotes: check.independenceNotes,
          competenceStatus:   check.competenceStatus,   competenceNotes:   check.competenceNotes,
          integrityStatus:    check.integrityStatus,    integrityNotes:    check.integrityNotes,
          riskStatus:         check.riskStatus,         riskNotes:         check.riskNotes,
          sanctionsStatus:    check.sanctionsStatus,    sanctionsNotes:    check.sanctionsNotes,
          checklist: checklist as unknown as Prisma.InputJsonValue,
          overallResult,
          overallJustification: dto.overallJustification,
          decidedById:          user.id,
          decidedAt:            new Date(),
        },
      });
      if (res.count === 0) return null;
      if (overallResult === AcceptanceRating.RED) {
        await tx.client.update({ where: { id: check.clientId }, data: { status: ClientStatus.DECLINED } });
        // Declinar al cliente cierra lo que estaba abierto: las propuestas por responder y las cartas por firmar ya no pueden
        // aceptarse ni firmarse (firmar una carta reactivaría al cliente Declinado).
        await tx.proposal.updateMany({
          where: { clientId: check.clientId, status: { in: [ProposalStatus.DRAFT, ProposalStatus.SENT] } },
          data:  { status: ProposalStatus.REJECTED, respondedAt: new Date() },
        });
        await tx.engagementLetter.updateMany({
          where: { clientId: check.clientId, status: { in: [EngagementLetterStatus.DRAFT, EngagementLetterStatus.SENT] } },
          data:  { status: EngagementLetterStatus.DECLINED, declineReason: 'El cliente fue declinado en la evaluación de aceptación.' },
        });
      }
      return tx.acceptanceCheck.findUniqueOrThrow({ where: { id }, include: CHECK_INCLUDE });
    });
    if (!claimed) this.assertOpen(await this.getCheckOrThrow(id, user));
    return this.present(claimed!);
  }

  /**
   * Reabre un Radar decidido (solo CAE o superior, lo exige el controlador). La decisión anterior queda copiada en la justificación
   * junto con el motivo, quién y cuándo; si el cliente había quedado Declinado por este Radar vuelve a «En aceptación».
   */
  async reopen(id: string, dto: ReopenAcceptanceDto, user: AuthUser) {
    const check = await this.getCheckOrThrow(id, user);
    if (!check.decidedAt) throw new BadRequestException('Este Radar todavía no se ha decidido.');
    const previous = `Decisión anterior: ${check.overallResult} (${check.decidedAt.toISOString().slice(0, 10)}). ${check.overallJustification ?? ''}`.trim();
    const trace = `[Reabierto por ${user.name} el ${new Date().toISOString().slice(0, 10)}: ${dto.reason.trim()}]\n${previous}`;

    const reopened = await this.prisma.$transaction(async (tx) => {
      const res = await tx.acceptanceCheck.updateMany({
        where: { id, organizationId: user.organizationId, decidedAt: { not: null } },
        data: { overallResult: AcceptanceRating.PENDING, overallJustification: trace, decidedById: null, decidedAt: null },
      });
      if (res.count === 0) throw new BadRequestException('Este Radar todavía no se ha decidido.');
      if (check.overallResult === AcceptanceRating.RED) {
        await tx.client.updateMany({
          where: { id: check.clientId, status: ClientStatus.DECLINED },
          data:  { status: ClientStatus.IN_ACCEPTANCE },
        });
      }
      return tx.acceptanceCheck.findUniqueOrThrow({ where: { id }, include: CHECK_INCLUDE });
    });
    return this.present(reopened);
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
    this.assertOpen(check);
    const client = await this.clients.getClientOrThrow(check.clientId, user);

    const owners = (client.beneficialOwners as unknown as Array<{ name?: string }>) ?? [];
    const records: Array<{ vendor_name: string }> = [
      { vendor_name: client.legalName },
      ...(client.legalRepName ? [{ vendor_name: client.legalRepName }] : []),
      ...owners.filter(o => o?.name).map(o => ({ vendor_name: o.name as string })),
    ];

    const result = await this.aiService.runCaats('sanctions_screening', { records });

    // Constancia del screening (Art. 15 DDC): quién lo corrió, cuándo y qué nombres se revisaron (con y sin coincidencia).
    const evidence: Record<string, unknown> = {
      ...(result as Record<string, unknown>),
      screenedAt:     new Date().toISOString(),
      screenedById:   user.id,
      screenedByName: user.name,
      namesChecked:   records.map((r) => r.vendor_name),
    };
    // Volver a correr el screening no borra lo ya revisado: se conserva la revisión de las coincidencias que siguen siendo las mismas.
    const carried = carryOverReviews(check.sanctionsScreeningResult as never, evidence as never);
    if (Object.keys(carried).length > 0) evidence.reviews = carried;

    return this.present(await this.prisma.acceptanceCheck.update({
      where: { id },
      data:  { sanctionsScreeningResult: evidence as Prisma.InputJsonValue },
      include: CHECK_INCLUDE,
    }));
  }

  /**
   * Revisión de UNA coincidencia del screening: falso positivo o confirmada, con el motivo, quién y cuándo. Bajo el candado de la
   * fila, para que dos revisiones simultáneas de coincidencias distintas no se pisen.
   */
  async reviewScreeningMatch(id: string, dto: ReviewScreeningMatchDto, user: AuthUser) {
    await this.getCheckOrThrow(id, user); // 404 / 403 antes de tomar el candado
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM acceptance_checks WHERE id = ${id} FOR UPDATE`;
      const fresh = await tx.acceptanceCheck.findUniqueOrThrow({ where: { id } });
      this.assertOpen(fresh);
      const result = fresh.sanctionsScreeningResult as Record<string, unknown> | null;
      if (!result) throw new BadRequestException('Todavía no se corrió el screening de sanciones de este cliente.');
      if (result.screenedAt !== dto.screenedAt) {
        throw new ConflictException('El screening se volvió a correr mientras revisabas: recarga la pantalla y revisa de nuevo.');
      }
      if (!screeningMatches(result as never).some((m) => m.key === dto.matchKey)) {
        throw new NotFoundException('Esa coincidencia ya no está en el screening.');
      }
      const review: ScreeningReview = {
        decision: dto.decision, reason: dto.reason.trim(), byId: user.id, byName: user.name, at: new Date().toISOString(),
      };
      const reviews = { ...((result.reviews as Record<string, ScreeningReview> | undefined) ?? {}), [dto.matchKey]: review };
      return tx.acceptanceCheck.update({
        where: { id },
        data:  { sanctionsScreeningResult: { ...result, reviews } as unknown as Prisma.InputJsonValue },
        include: CHECK_INCLUDE,
      });
    });
    return this.present(updated);
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
