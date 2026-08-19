import {
  Injectable, NotFoundException, ForbiddenException, BadRequestException,
} from '@nestjs/common';
import { AcceptanceCheck, AcceptanceRating, ClientStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/jwt.strategy';
import { ClientsService } from './clients.service';
import { UpdateAcceptanceCheckDto, DecideAcceptanceDto } from './dto/acceptance.dto';

/**
 * Severidad relativa de las 4 dimensiones del Radar (NIA 220 / ISQM 1).
 * `overallResult` = la PEOR de las cuatro. PENDING es el valor más bajo porque
 * no representa una evaluación: `decide()` lo rechaza antes de comparar.
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
    ];

    const pending = dimensions.filter(([, rating]) => rating === AcceptanceRating.PENDING);
    if (pending.length > 0) {
      const names = pending.map(([key]) => DIMENSION_LABELS[key] ?? key).join(', ');
      throw new BadRequestException(
        `No se puede decidir el Radar de Aceptación con dimensiones sin evaluar: ${names}. ` +
        'Califique las 4 dimensiones (GREEN / YELLOW / RED) antes de decidir.',
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
}
