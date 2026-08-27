import {
  Injectable, NotFoundException, ForbiddenException, BadRequestException,
} from '@nestjs/common';
import { AcceptanceRating, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/jwt.strategy';
import { StandardsService } from './standards.service';
import { StartQaipAssessmentDto, UpdateQaipAssessmentItemDto, DecideQaipAssessmentDto } from './dto/assessment.dto';

const ASSESSMENT_INCLUDE = {
  decidedBy: { select: { id: true, name: true } },
  items: {
    include: { standard: true },
    orderBy: { standard: { sortOrder: 'asc' as const } },
  },
} satisfies Prisma.QaipAssessmentInclude;

@Injectable()
export class AssessmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly standards: StandardsService,
  ) {}

  private async getAssessmentOrThrow(id: string, user: AuthUser) {
    const a = await this.prisma.qaipAssessment.findUnique({ where: { id } });
    if (!a) throw new NotFoundException('Evaluación QAIP no encontrada');
    if (a.organizationId !== user.organizationId) throw new ForbiddenException();
    return a;
  }

  async list(user: AuthUser, track?: string) {
    return this.prisma.qaipAssessment.findMany({
      where: { organizationId: user.organizationId, ...(track && { track: track as any }) },
      include: ASSESSMENT_INCLUDE,
      orderBy: [{ track: 'asc' }, { period: 'desc' }],
    });
  }

  async findOne(id: string, user: AuthUser) {
    await this.getAssessmentOrThrow(id, user);
    return this.prisma.qaipAssessment.findUnique({ where: { id }, include: ASSESSMENT_INCLUDE });
  }

  /**
   * Arranca (o recupera) la autoevaluación del track/período en curso —
   * idempotente vía @@unique([organizationId, track, period]), igual patrón
   * que AcceptanceService.startAcceptance(). Al crearla, siembra una
   * QaipAssessmentItem PENDING por cada standard activo del track, para que
   * la UI tenga de inmediato todas las filas a calificar.
   */
  async start(dto: StartQaipAssessmentDto, user: AuthUser) {
    const period = dto.period ?? String(new Date().getFullYear());
    const standards = await this.standards.listByTrack(dto.track);
    if (standards.length === 0) {
      throw new BadRequestException('No hay standards activos para este track — contacte al administrador');
    }

    const assessment = await this.prisma.qaipAssessment.upsert({
      where: { organizationId_track_period: { organizationId: user.organizationId, track: dto.track, period } },
      create: {
        organizationId: user.organizationId,
        track: dto.track,
        kind: dto.kind ?? 'AUTOEVALUACION',
        period,
        assessorName: dto.assessorName,
      },
      update: {},
      include: ASSESSMENT_INCLUDE,
    });

    // Completar items faltantes (standards nuevos desde la última siembra, o
    // primera creación) sin pisar los que ya tienen calificación.
    const existingStandardIds = new Set(assessment.items.map(i => i.standardId));
    const missing = standards.filter(s => !existingStandardIds.has(s.id));
    if (missing.length > 0) {
      await this.prisma.qaipAssessmentItem.createMany({
        data: missing.map(s => ({ assessmentId: assessment.id, standardId: s.id })),
        skipDuplicates: true,
      });
      return this.prisma.qaipAssessment.findUnique({ where: { id: assessment.id }, include: ASSESSMENT_INCLUDE });
    }

    return assessment;
  }

  async updateItem(itemId: string, dto: UpdateQaipAssessmentItemDto, user: AuthUser) {
    const item = await this.prisma.qaipAssessmentItem.findUnique({
      where: { id: itemId },
      include: { assessment: true },
    });
    if (!item) throw new NotFoundException('Ítem de evaluación no encontrado');
    if (item.assessment.organizationId !== user.organizationId) throw new ForbiddenException();
    if (item.assessment.decidedAt) throw new BadRequestException('La evaluación ya fue decidida — es de solo lectura');

    return this.prisma.qaipAssessmentItem.update({
      where: { id: itemId },
      data: {
        ...(dto.rating != null && { rating: dto.rating }),
        ...(dto.evidence != null && { evidence: dto.evidence }),
        ...(dto.notes != null && { notes: dto.notes }),
      },
      include: { standard: true },
    });
  }

  /**
   * Decide la evaluación: overallResult = la peor calificación de todos los
   * items (mismo patrón SEVERITY que AcceptanceService.decide()).
   */
  async decide(id: string, dto: DecideQaipAssessmentDto, user: AuthUser) {
    const assessment = await this.getAssessmentOrThrow(id, user);
    const items = await this.prisma.qaipAssessmentItem.findMany({
      where: { assessmentId: id },
      include: { standard: true },
    });

    const pending = items.filter(i => i.rating === AcceptanceRating.PENDING);
    if (pending.length > 0) {
      const names = pending.map(i => i.standard.code).join(', ');
      throw new BadRequestException(
        `No se puede decidir con standards sin calificar: ${names}. Califique todos antes de decidir.`,
      );
    }

    const SEVERITY: Record<AcceptanceRating, number> = {
      PENDING: 0, GREEN: 1, YELLOW: 2, RED: 3,
    };
    const overallResult = items.reduce<AcceptanceRating>(
      (worst, i) => (SEVERITY[i.rating] > SEVERITY[worst] ? i.rating : worst),
      AcceptanceRating.GREEN,
    );

    return this.prisma.qaipAssessment.update({
      where: { id },
      data: {
        overallResult,
        overallJustification: dto.overallJustification,
        nextDueAt: dto.nextDueAt ? new Date(dto.nextDueAt) : assessment.nextDueAt,
        decidedById: user.id,
        decidedAt: new Date(),
      },
      include: ASSESSMENT_INCLUDE,
    });
  }
}
