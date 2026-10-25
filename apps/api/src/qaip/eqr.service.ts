import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/jwt.strategy';
import { assertInOrg } from '../common/utils/tenant.util';
import { canSeeAudit, INVESTIGATION_SELECT } from '../common/utils/investigation-scope.util';
import { AssignEqrReviewerDto, UpdateEqrChecklistDto, CompleteEqrDto } from './dto/eqr.dto';

const EQR_INCLUDE = {
  reviewer: { select: { id: true, name: true } },
  completedBy: { select: { id: true, name: true } },
  audit: { select: { id: true, title: true, requiresEqr: true, team: { select: { userId: true } } } },
} as const;

@Injectable()
export class EqrService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Modo investigación (2026-10-25): una EQR de una investigación solo la ve y la mueve el equipo (más CAE, ADMIN, SUPER_ADMIN)
   * y, en lo que le toca (leerla, llenar el checklist y completarla), el REVISOR asignado: por independencia (NIGC 2) el revisor
   * no puede ser del equipo, así que sin esta excepción no podría hacer su trabajo. Pedir la EQR o asignar el revisor sí
   * queda solo para quien ve la investigación. Devuelve si el usuario ve la auditoría completa (`full`).
   */
  private async getAuditOrThrow(auditId: string, user: AuthUser, opts: { reviewerMayAct?: boolean } = {}) {
    const audit = await this.prisma.audit.findUnique({
      where: { id: auditId }, select: { id: true, organizationId: true, ...INVESTIGATION_SELECT },
    });
    if (!audit) throw new NotFoundException('Auditoría no encontrada');
    if (audit.organizationId !== user.organizationId) throw new ForbiddenException();
    if (canSeeAudit(audit, user)) return { audit, full: true };
    if (opts.reviewerMayAct) {
      const eqr = await this.prisma.engagementQualityReview.findUnique({ where: { auditId }, select: { reviewerId: true } });
      if (eqr?.reviewerId === user.id) return { audit, full: false };
    }
    throw new ForbiddenException('Acceso restringido — modo investigación');
  }

  /** Quien no ve la auditoría completa (el revisor de una investigación) no recibe la lista del equipo. */
  private present<T extends { audit?: { team?: unknown } | null }>(eqr: T | null, full: boolean): T | null {
    if (!eqr || full || !eqr.audit) return eqr;
    return { ...eqr, audit: { ...eqr.audit, team: [] } };
  }

  async get(auditId: string, user: AuthUser) {
    const { full } = await this.getAuditOrThrow(auditId, user, { reviewerMayAct: true });
    return this.present(await this.prisma.engagementQualityReview.findUnique({ where: { auditId }, include: EQR_INCLUDE }), full);
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
    await assertInOrg(this.prisma.user, dto.reviewerId, { organizationId: user.organizationId }, 'El revisor');
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
    const { full } = await this.getAuditOrThrow(auditId, user, { reviewerMayAct: true });
    const eqr = await this.prisma.engagementQualityReview.findUnique({ where: { auditId } });
    if (!eqr) throw new NotFoundException('Esta auditoría no tiene una EQR iniciada — llame a require() primero');
    if (eqr.completedAt) throw new BadRequestException('La EQR ya fue completada — es de solo lectura');

    return this.present(await this.prisma.engagementQualityReview.update({
      where: { auditId },
      data: {
        ...(dto.checklist != null && { checklist: dto.checklist as any }),
        ...(dto.notes != null && { notes: dto.notes }),
      },
      include: EQR_INCLUDE,
    }), full);
  }

  async complete(auditId: string, dto: CompleteEqrDto, user: AuthUser) {
    const { full } = await this.getAuditOrThrow(auditId, user, { reviewerMayAct: true });
    const eqr = await this.prisma.engagementQualityReview.findUnique({ where: { auditId } });
    if (!eqr) throw new NotFoundException('Esta auditoría no tiene una EQR iniciada');
    if (!eqr.reviewerId) throw new BadRequestException('Asigne un revisor independiente antes de completar la EQR');
    if (eqr.wasEngagementPartner && !eqr.independenceJustification?.trim()) {
      throw new BadRequestException('Falta la justificación de independencia del revisor');
    }

    return this.present(await this.prisma.engagementQualityReview.update({
      where: { auditId },
      data: {
        result: dto.result,
        notes: dto.notes,
        completedById: user.id,
        completedAt: new Date(),
      },
      include: EQR_INCLUDE,
    }), full);
  }
}
