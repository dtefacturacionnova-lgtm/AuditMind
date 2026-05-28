import {
  Injectable, NotFoundException, ForbiddenException, UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFindingDto, UpdateFindingDto, AssignResponsibleDto, RejectFindingDto, CreateActionDto, UpdateActionDto } from './dto/create-finding.dto';
import { AuthUser } from '../auth/jwt.strategy';
import { FindingStatus, UserRole, EscalationLevel, Finding } from '@prisma/client';

// ─── Quality Score Engine ────────────────────────────────────────────────────
function computeQualityScore(data: {
  condition?: string;
  criteria?: string;
  cause?: string;
  effect?: string;
  recommendation?: string;
  normativeReference?: string;
  effectAmount?: number | null;
}): number {
  let score = 0;

  // Completitud (25 pts)
  const condWords = (data.condition ?? '').split(/\s+/).filter(Boolean).length;
  const causeWords = (data.cause ?? '').split(/\s+/).filter(Boolean).length;
  const effectWords = (data.effect ?? '').split(/\s+/).filter(Boolean).length;
  if (condWords >= 50) score += 10;
  else if (condWords >= 20) score += 5;
  if (data.criteria && data.criteria.trim().length > 10) score += 5;
  if (causeWords >= 30) score += 5;
  else if (causeWords >= 10) score += 2;
  if (effectWords >= 30) score += 5;
  else if (effectWords >= 10) score += 2;

  // Especificidad — contiene datos concretos (25 pts)
  const hasNumbers = /\d+[\.,]?\d*\s*(%|CLP|USD|UF|€|\$|días|horas|años|meses|veces)/i.test(
    `${data.condition} ${data.effect}`,
  );
  const hasDates = /\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\b/i.test(
    `${data.condition} ${data.effect}`,
  );
  if (hasNumbers) score += 15;
  if (hasDates) score += 10;

  // Soporte normativo (20 pts)
  if (data.normativeReference && data.normativeReference.trim().length > 2) score += 20;

  // Cuantificación económica (15 pts)
  if (data.effectAmount && data.effectAmount > 0) score += 15;

  // Accionabilidad de la recomendación (15 pts)
  const recWords = (data.recommendation ?? '').split(/\s+/).filter(Boolean).length;
  if (recWords >= 40) score += 15;
  else if (recWords >= 20) score += 8;
  else if (recWords >= 5) score += 3;

  return Math.min(100, score);
}

// ─── Severity order for sorting ──────────────────────────────────────────────
const SEVERITY_ORDER: Record<string, number> = {
  CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFORMATIONAL: 4,
};

@Injectable()
export class FindingsService {
  constructor(private prisma: PrismaService) {}

  // ─── Guards ────────────────────────────────────────────────────────────────
  private async assertAuditAccess(auditId: string, user: AuthUser) {
    const audit = await this.prisma.audit.findFirst({
      where: { id: auditId, organizationId: user.organizationId },
    });
    if (!audit) throw new NotFoundException('Auditoría no encontrada');
    return audit;
  }

  private async assertFindingAccess(id: string, user: AuthUser) {
    const finding = await this.prisma.finding.findUnique({
      where: { id },
      include: { audit: { select: { id: true, organizationId: true, materiality: true } } },
    });
    if (!finding) throw new NotFoundException('Hallazgo no encontrado');
    if (finding.audit.organizationId !== user.organizationId) throw new ForbiddenException();
    return finding;
  }

  // ─── CRUD ──────────────────────────────────────────────────────────────────
  async create(dto: CreateFindingDto, user: AuthUser) {
    await this.assertAuditAccess(dto.auditId, user);

    const score = computeQualityScore(dto);
    const isMaterial = dto.isMaterial ??
      (dto.effectAmount != null && dto.effectAmount > 0 ? null : null);

    const finding = await this.prisma.finding.create({
      data: {
        title: dto.title,
        severity: dto.severity,
        auditId: dto.auditId,
        workingPaperId: dto.workingPaperId ?? null,
        organizationId: user.organizationId,
        condition: dto.condition,
        criteria: dto.criteria,
        cause: dto.cause,
        effect: dto.effect,
        risk: dto.risk ?? dto.effect,
        recommendation: dto.recommendation ?? '',
        effectAmount: dto.effectAmount as any ?? null,
        isMaterial: isMaterial ?? null,
        normativeReference: dto.normativeReference ?? null,
        normativeArticle: dto.normativeArticle ?? null,
        isRecurring: dto.isRecurring ?? false,
        escalationLevel: EscalationLevel.NONE,
        qualityScore: score,
        aiDraftUsed: false,
        status: FindingStatus.DRAFT,
      },
    });

    // Auto-check materiality if audit has materiality set
    await this.autoCheckMateriality(finding.id, dto.auditId, dto.effectAmount);

    // Auto-check recurrence
    if (dto.title) {
      await this.checkRecurrence(finding.id, dto.auditId, dto.title, user.organizationId);
    }

    return finding;
  }

  async update(id: string, dto: UpdateFindingDto, user: AuthUser) {
    const existing = await this.assertFindingAccess(id, user);

    if (existing.status === FindingStatus.CLOSED || existing.status === FindingStatus.APPROVED) {
      throw new ForbiddenException('No se puede editar un hallazgo cerrado o aprobado');
    }

    const merged = {
      condition: dto.condition ?? existing.condition,
      criteria: dto.criteria ?? existing.criteria,
      cause: dto.cause ?? existing.cause,
      effect: dto.effect ?? existing.effect,
      recommendation: dto.recommendation ?? (existing.recommendation ?? ''),
      normativeReference: dto.normativeReference ?? existing.normativeReference ?? undefined,
      effectAmount: dto.effectAmount ?? (existing.effectAmount as any),
    };

    const score = computeQualityScore(merged);

    return this.prisma.finding.update({
      where: { id },
      data: {
        ...Object.fromEntries(
          Object.entries(dto).filter(([, v]) => v !== undefined),
        ),
        risk: dto.risk ?? dto.effect ?? undefined,
        qualityScore: score,
      },
    });
  }

  async findAllForAudit(
    auditId: string,
    user: AuthUser,
    severity?: string,
    status?: string,
  ) {
    await this.assertAuditAccess(auditId, user);
    const findings = await this.prisma.finding.findMany({
      where: {
        auditId,
        ...(severity && { severity: severity as any }),
        ...(status && { status: status as any }),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        workingPaper: { select: { id: true, code: true } },
        responsible: { select: { id: true, name: true, avatarUrl: true } },
        _count: { select: { actions: true, comments: true } },
      },
    });

    return findings.sort((a, b) =>
      (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9),
    );
  }

  async findAllForOrg(
    user: AuthUser,
    filters?: { severity?: string; status?: string; page?: number; limit?: number },
  ) {
    const page = filters?.page ?? 1;
    const limit = filters?.limit ?? 20;
    const skip = (page - 1) * limit;

    const where = {
      organizationId: user.organizationId,
      ...(filters?.severity && { severity: filters.severity as any }),
      ...(filters?.status && { status: filters.status as any }),
    };

    const [findings, total] = await Promise.all([
      this.prisma.finding.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ severity: 'asc' }, { createdAt: 'desc' }],
        include: {
          audit: { select: { id: true, title: true } },
          responsible: { select: { id: true, name: true, avatarUrl: true } },
        },
      }),
      this.prisma.finding.count({ where }),
    ]);

    return {
      data: findings,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string, user: AuthUser) {
    const finding = await this.assertFindingAccess(id, user);
    return this.prisma.finding.findUnique({
      where: { id },
      include: {
        audit: { select: { id: true, title: true, materiality: true, materialityExecution: true } },
        workingPaper: { select: { id: true, code: true, title: true } },
        responsible: { select: { id: true, name: true, avatarUrl: true, email: true } },
        actions: {
          orderBy: { createdAt: 'asc' },
        },
        comments: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  }

  // ─── Workflow ──────────────────────────────────────────────────────────────
  async submitForReview(id: string, user: AuthUser) {
    const finding = await this.assertFindingAccess(id, user);

    if (finding.status !== FindingStatus.DRAFT) {
      throw new ForbiddenException('Solo se pueden enviar a revisión hallazgos en borrador');
    }

    const score = computeQualityScore({
      condition: finding.condition,
      criteria: finding.criteria,
      cause: finding.cause,
      effect: finding.effect,
      recommendation: finding.recommendation ?? '',
      normativeReference: finding.normativeReference ?? undefined,
      effectAmount: finding.effectAmount as any,
    });

    if (score < 60) {
      const missing: string[] = [];
      const cWords = finding.condition.split(/\s+/).length;
      if (cWords < 50) missing.push(`Condición muy corta (${cWords} palabras, mínimo 50)`);
      if (!finding.criteria || finding.criteria.length < 10) missing.push('Criterio normativo incompleto');
      if (!finding.recommendation || finding.recommendation.split(/\s+/).length < 20)
        missing.push('Recomendación insuficiente (mínimo 20 palabras)');
      if (!finding.normativeReference) missing.push('Falta referencia normativa');
      if (!finding.effectAmount) missing.push('Falta cuantificación del efecto económico');

      throw new UnprocessableEntityException({
        message: `Score de calidad insuficiente: ${score}/100 (mínimo 60 para enviar a revisión)`,
        currentScore: score,
        minimumScore: 60,
        improvements: missing,
      });
    }

    return this.prisma.finding.update({
      where: { id },
      data: { status: FindingStatus.IN_REVIEW, qualityScore: score },
    });
  }

  async approve(id: string, user: AuthUser) {
    const finding = await this.assertFindingAccess(id, user);
    const managerRoles: string[] = [UserRole.AUDIT_MANAGER, UserRole.CAE, UserRole.ADMIN, UserRole.SUPER_ADMIN];
    if (!managerRoles.includes(user.role as UserRole)) {
      throw new ForbiddenException('Solo gerentes de auditoría o superiores pueden aprobar hallazgos');
    }
    if (finding.status !== FindingStatus.IN_REVIEW) {
      throw new ForbiddenException('Solo se pueden aprobar hallazgos en estado IN_REVIEW');
    }
    return this.prisma.finding.update({
      where: { id },
      data: { status: FindingStatus.APPROVED },
    });
  }

  async reject(id: string, dto: RejectFindingDto, user: AuthUser) {
    const finding = await this.assertFindingAccess(id, user);
    const managerRoles: string[] = [UserRole.AUDIT_MANAGER, UserRole.CAE, UserRole.ADMIN, UserRole.SUPER_ADMIN];
    if (!managerRoles.includes(user.role as UserRole)) {
      throw new ForbiddenException('Solo gerentes o superiores pueden rechazar hallazgos');
    }
    if (finding.status !== FindingStatus.IN_REVIEW) {
      throw new ForbiddenException('Solo se pueden rechazar hallazgos en estado IN_REVIEW');
    }

    // Add rejection reason as internal comment
    await this.prisma.findingComment.create({
      data: { findingId: id, authorId: user.id, content: `[RECHAZO] ${dto.reason}`, isInternal: true },
    });

    return this.prisma.finding.update({
      where: { id },
      data: { status: FindingStatus.DRAFT },
    });
  }

  async assignResponsible(id: string, dto: AssignResponsibleDto, user: AuthUser) {
    const finding = await this.assertFindingAccess(id, user);
    if (finding.status !== FindingStatus.APPROVED) {
      throw new ForbiddenException('Solo se puede asignar responsable a hallazgos aprobados');
    }

    const dueDate = new Date(dto.dueDate);

    const [updated] = await this.prisma.$transaction([
      this.prisma.finding.update({
        where: { id },
        data: {
          responsibleId: dto.responsibleId,
          dueDate,
          status: FindingStatus.IN_PROGRESS,
        },
      }),
      this.prisma.findingAction.create({
        data: {
          findingId: id,
          organizationId: user.organizationId,
          description: dto.actionDescription ?? 'Plan de acción por definir',
          responsibleId: dto.responsibleId,
          dueDate,
          status: 'PENDING',
          progressPct: 0,
          evidenceUrls: [],
        },
      }),
    ]);

    return updated;
  }

  // ─── FindingAction CRUD ────────────────────────────────────────────────────
  async createAction(findingId: string, dto: CreateActionDto, user: AuthUser) {
    await this.assertFindingAccess(findingId, user);
    return this.prisma.findingAction.create({
      data: {
        findingId,
        organizationId: user.organizationId,
        description: dto.description,
        responsibleId: dto.responsibleId ?? null,
        dueDate: new Date(dto.dueDate),
        status: 'PENDING',
        progressPct: dto.progressPct ?? 0,
        evidenceUrls: [],
      },
    });
  }

  async updateAction(actionId: string, dto: UpdateActionDto, user: AuthUser) {
    const action = await this.prisma.findingAction.findUnique({ where: { id: actionId } });
    if (!action) throw new NotFoundException('Acción no encontrada');
    if (action.organizationId !== user.organizationId) throw new ForbiddenException();

    const data: Record<string, unknown> = {};
    if (dto.status      !== undefined) data.status      = dto.status;
    if (dto.progressPct !== undefined) data.progressPct = dto.progressPct;
    if (dto.comments    !== undefined) data.comments    = dto.comments;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.completionDate !== undefined) {
      data.completionDate = dto.completionDate ? new Date(dto.completionDate) : null;
    }

    // Auto-complete when marking COMPLETED
    if (dto.status === 'COMPLETED') {
      if (!data.completionDate) data.completionDate = new Date();
      if (data.progressPct === undefined) data.progressPct = 100;
    }

    return this.prisma.findingAction.update({ where: { id: actionId }, data });
  }

  async addComment(id: string, content: string, isInternal: boolean, user: AuthUser) {
    await this.assertFindingAccess(id, user);
    return this.prisma.findingComment.create({
      data: { findingId: id, authorId: user.id, content, isInternal },
    });
  }

  async close(id: string, user: AuthUser) {
    const finding = await this.assertFindingAccess(id, user);
    const managerRoles: string[] = [UserRole.AUDIT_MANAGER, UserRole.CAE, UserRole.ADMIN, UserRole.SUPER_ADMIN];
    if (!managerRoles.includes(user.role as UserRole)) {
      throw new ForbiddenException('Solo gerentes o superiores pueden cerrar hallazgos');
    }
    return this.prisma.finding.update({
      where: { id },
      data: { status: FindingStatus.CLOSED, closedAt: new Date(), closedById: user.id },
    });
  }

  // ─── Analytics & Summaries ─────────────────────────────────────────────────
  async getSummaryByAudit(auditId: string, user: AuthUser) {
    await this.assertAuditAccess(auditId, user);
    const [bySeverity, byStatus, materialCount, overdueCount, avgScore] = await Promise.all([
      this.prisma.finding.groupBy({
        by: ['severity'],
        where: { auditId },
        _count: { id: true },
      }),
      this.prisma.finding.groupBy({
        by: ['status'],
        where: { auditId },
        _count: { id: true },
      }),
      this.prisma.finding.count({ where: { auditId, isMaterial: true } }),
      this.prisma.finding.count({
        where: { auditId, status: FindingStatus.OVERDUE },
      }),
      this.prisma.finding.aggregate({
        where: { auditId },
        _avg: { qualityScore: true },
      }),
    ]);
    return { bySeverity, byStatus, materialCount, overdueCount, avgQualityScore: avgScore._avg.qualityScore };
  }

  async getOverdueByOrg(user: AuthUser) {
    return this.prisma.finding.findMany({
      where: {
        organizationId: user.organizationId,
        status: { in: [FindingStatus.OVERDUE, FindingStatus.IN_PROGRESS] },
        dueDate: { lt: new Date() },
      },
      include: {
        audit: { select: { id: true, title: true } },
        responsible: { select: { id: true, name: true } },
      },
      orderBy: { dueDate: 'asc' },
    });
  }

  async getRecurringFindings(user: AuthUser) {
    return this.prisma.finding.findMany({
      where: { organizationId: user.organizationId, isRecurring: true },
      include: {
        audit: { select: { id: true, title: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ─── Internal helpers ──────────────────────────────────────────────────────
  private async autoCheckMateriality(
    findingId: string,
    auditId: string,
    effectAmount?: number,
  ) {
    if (!effectAmount) return;
    const audit = await this.prisma.audit.findUnique({
      where: { id: auditId },
      select: { materiality: true },
    });
    if (!audit?.materiality) return;
    const materialityNum = Number(audit.materiality);
    if (effectAmount >= materialityNum) {
      await this.prisma.finding.update({
        where: { id: findingId },
        data: { isMaterial: true },
      });
    }
  }

  private async checkRecurrence(
    findingId: string,
    auditId: string,
    title: string,
    organizationId: string,
  ) {
    // Look for similar findings in the same org (case-insensitive partial match)
    const keywords = title.toLowerCase().split(/\s+/).filter(w => w.length > 4);
    if (keywords.length === 0) return;

    const similar = await this.prisma.finding.findFirst({
      where: {
        organizationId,
        id: { not: findingId },
        title: { contains: keywords[0], mode: 'insensitive' },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (similar) {
      await this.prisma.finding.update({
        where: { id: findingId },
        data: {
          isRecurring: true,
          previousFindingId: similar.id,
        },
      });
    }
  }

  // ─── Cron: mark overdue + escalation ──────────────────────────────────────
  async processOverdueEscalation(organizationId: string) {
    const now = new Date();
    const overdue = await this.prisma.finding.findMany({
      where: {
        organizationId,
        status: { in: [FindingStatus.IN_PROGRESS, FindingStatus.OVERDUE] },
        dueDate: { lt: now },
      },
    });

    const results = [];
    for (const f of overdue) {
      if (!f.dueDate) continue;
      const daysOverdue = Math.floor((now.getTime() - f.dueDate.getTime()) / 86400000);

      let escalation = f.escalationLevel;
      if (daysOverdue >= 30) escalation = EscalationLevel.COMMITTEE;
      else if (daysOverdue >= 15) escalation = EscalationLevel.CAE;
      else if (daysOverdue >= 7) escalation = EscalationLevel.MANAGER;
      else if (daysOverdue >= 1) escalation = EscalationLevel.MANAGER; // min escalation

      await this.prisma.finding.update({
        where: { id: f.id },
        data: { status: FindingStatus.OVERDUE, escalationLevel: escalation },
      });
      results.push({ id: f.id, title: f.title, daysOverdue, escalation });
    }
    return { processed: results.length, findings: results };
  }
}
