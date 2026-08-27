import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/jwt.strategy';
import { AssignEqrReviewerDto, UpdateEqrChecklistDto, CompleteEqrDto } from './dto/eqr.dto';

const EQR_INCLUDE = {
  reviewer: { select: { id: true, name: true } },
  completedBy: { select: { id: true, name: true } },
  audit: { select: { id: true, title: true, requiresEqr: true, team: { select: { userId: true } } } },
} as const;

@Injectable()
export class EqrService {
  constructor(private readonly prisma: PrismaService) {}

  private async getAuditOrThrow(auditId: string, user: AuthUser) {
    const audit = await this.prisma.audit.findUnique({ where: { id: auditId }, select: { id: true, organizationId: true } });
    if (!audit) throw new NotFoundException('Auditoría no encontrada');
    if (audit.organizationId !== user.organizationId) throw new ForbiddenException();
    return audit;
  }

  async get(auditId: string, user: AuthUser) {
    await this.getAuditOrThrow(auditId, user);
    return this.prisma.engagementQualityReview.findUnique({ where: { auditId }, include: EQR_INCLUDE });
  }

  /** Marca el encargo como que requiere EQR y crea el registro (idempotente). */
  async require(auditId: string, user: AuthUser) {
    await this.getAuditOrThrow(auditId, user);
    await this.prisma.audit.update({ where: { id: auditId }, data: { requiresEqr: true } });
    return this.prisma.engagementQualityReview.upsert({
      where: { auditId },
      create: { auditId },
      update: {},
      include: EQR_INCLUDE,
    });
  }

  /**
   * Asigna el revisor — valida independencia contra AuditTeam (dato real). Si
   * el revisor fue socio/gerente del encargo, exige justificación explícita
   * en vez de calcular un enfriamiento de 2 años que el producto no puede
   * verificar hoy (no rastrea histórico de rol por período/cliente).
   */
  async assignReviewer(auditId: string, dto: AssignEqrReviewerDto, user: AuthUser) {
    await this.getAuditOrThrow(auditId, user);
    const audit = await this.prisma.audit.findUnique({
      where: { id: auditId },
      select: { team: { select: { userId: true } } },
    });
    if (audit?.team.some(t => t.userId === dto.reviewerId)) {
      throw new BadRequestException(
        'El revisor de calidad del encargo debe ser independiente del equipo — no puede ser miembro del equipo asignado a este encargo.',
      );
    }
    if (dto.wasEngagementPartner && !dto.independenceJustification?.trim()) {
      throw new BadRequestException(
        'Si el revisor fue socio/gerente de este encargo, se requiere una justificación explícita del enfriamiento (NIGC 2) — no se calcula automáticamente.',
      );
    }

    return this.prisma.engagementQualityReview.upsert({
      where: { auditId },
      create: {
        auditId,
        reviewerId: dto.reviewerId,
        wasEngagementPartner: dto.wasEngagementPartner ?? false,
        independenceJustification: dto.independenceJustification,
      },
      update: {
        reviewerId: dto.reviewerId,
        wasEngagementPartner: dto.wasEngagementPartner ?? false,
        independenceJustification: dto.independenceJustification,
      },
      include: EQR_INCLUDE,
    });
  }

  async updateChecklist(auditId: string, dto: UpdateEqrChecklistDto, user: AuthUser) {
    await this.getAuditOrThrow(auditId, user);
    const eqr = await this.prisma.engagementQualityReview.findUnique({ where: { auditId } });
    if (!eqr) throw new NotFoundException('Esta auditoría no tiene una EQR iniciada — llame a require() primero');
    if (eqr.completedAt) throw new BadRequestException('La EQR ya fue completada — es de solo lectura');

    return this.prisma.engagementQualityReview.update({
      where: { auditId },
      data: {
        ...(dto.checklist != null && { checklist: dto.checklist as any }),
        ...(dto.notes != null && { notes: dto.notes }),
      },
      include: EQR_INCLUDE,
    });
  }

  async complete(auditId: string, dto: CompleteEqrDto, user: AuthUser) {
    await this.getAuditOrThrow(auditId, user);
    const eqr = await this.prisma.engagementQualityReview.findUnique({ where: { auditId } });
    if (!eqr) throw new NotFoundException('Esta auditoría no tiene una EQR iniciada');
    if (!eqr.reviewerId) throw new BadRequestException('Asigne un revisor independiente antes de completar la EQR');
    if (eqr.wasEngagementPartner && !eqr.independenceJustification?.trim()) {
      throw new BadRequestException('Falta la justificación de independencia del revisor');
    }

    return this.prisma.engagementQualityReview.update({
      where: { auditId },
      data: {
        result: dto.result,
        notes: dto.notes,
        completedById: user.id,
        completedAt: new Date(),
      },
      include: EQR_INCLUDE,
    });
  }
}
