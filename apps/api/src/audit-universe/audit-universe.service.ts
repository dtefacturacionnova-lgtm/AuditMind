import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/jwt.strategy';
import { CreateAuditableUnitDto as LegacyCreateDto } from './dto/create-auditable-unit.dto';
import { UpdateAuditableUnitDto as LegacyUpdateDto } from './dto/update-auditable-unit.dto';
import {
  CreateAuditProcessDto, UpdateAuditProcessDto,
  CreateAuditableUnitDto, UpdateAuditableUnitDto,
  UpsertAssessmentDto,
} from './dto/auditable-unit.dto';

// ─── Weights para el scoring engine ───────────────────────────────────────────
// Metodología IIA/Big 4: Group A = Riesgo Residual (30%), Group B = Factores Contextuales (70%)
const WEIGHT_A = 0.30; // Riesgo Residual
const WEIGHT_B = 0.70; // Factores Contextuales

// Pesos internos de Grupo B (suman 1.0)
const GROUP_B_WEIGHTS: Record<string, number> = {
  materialityScore:      0.20, // Materialidad Financiera
  strategicAlignScore:   0.20, // Alineación Plan Estratégico
  operationalAlignScore: 0.15, // Alineación Plan Operativo
  fraudHistoryScore:     0.15, // Antecedentes de Fraude / Denuncias
  managementReqScore:    0.10, // Solicitud de la Dirección
  staffTurnoverScore:    0.10, // Rotación de Personal / Cambios de Gestión
  coverageHistoryScore:  0.10, // Historial de Cobertura
};

function computeScores(data: {
  impactScore: number; likelihoodScore: number; controlMaturityScore: number;
  materialityScore: number; strategicAlignScore: number; operationalAlignScore: number;
  fraudHistoryScore: number; managementReqScore: number;
  staffTurnoverScore: number; coverageHistoryScore: number;
}) {
  const inherent = data.impactScore * data.likelihoodScore; // 1–25
  const residual = inherent * (1 - data.controlMaturityScore / 5);
  const residualNorm = (residual / 25) * 100; // 0–100

  // Grupo B: suma ponderada de 7 factores normalizados a 0–100
  let secondaryWeighted = 0;
  for (const [key, weight] of Object.entries(GROUP_B_WEIGHTS)) {
    const score = (data as Record<string, number>)[key] ?? 1;
    const norm = ((score - 1) / 4) * 100; // 0–100
    secondaryWeighted += norm * weight;
  }

  const total = residualNorm * WEIGHT_A + secondaryWeighted * WEIGHT_B;

  const riskLevel =
    total >= 75 ? 'CRITICAL' :
    total >= 55 ? 'HIGH' :
    total >= 35 ? 'MEDIUM' : 'LOW';

  return { inherentRiskScore: inherent, residualRiskScore: residual, totalScore: total, riskLevel };
}

function computeCoverageGap(lastAuditDate: Date | null, freqMonths: number) {
  const nextDate = lastAuditDate
    ? new Date(lastAuditDate.getTime() + freqMonths * 30.44 * 24 * 3600 * 1000)
    : null;
  const gapDays = nextDate
    ? Math.round((Date.now() - nextDate.getTime()) / (24 * 3600 * 1000))
    : 9999; // nunca auditada = máxima urgencia
  return { nextRecommendedDate: nextDate, coverageGapDays: gapDays };
}

@Injectable()
export class AuditUniverseService {
  constructor(private prisma: PrismaService) {}

  // ─── AuditEntity (legado — mantener compatibilidad) ─────────────────────────

  async create(dto: LegacyCreateDto, user: AuthUser) {
    return this.prisma.auditEntity.create({
      data: {
        organizationId: user.organizationId,
        name: dto.name,
        description: dto.description,
        category: dto.division,
        location: dto.location,
        responsible: dto.responsible ?? dto.responsibleId ?? null,
        inherentRiskScore: dto.riskScore ?? 0,
        active: dto.isActive ?? true,
        parentEntityId: dto.parentEntityId ?? null,
        entityType: dto.entityType ?? 'AREA',
        applicableRegulations: dto.applicableRegulations ?? [],
        ownerId: dto.ownerId ?? null,
        objective: dto.objective ?? null,
        status: dto.status ?? 'ACTIVE',
        employeeCount: dto.employeeCount ?? null,
        contactEmail: dto.contactEmail ?? null,
        contactPhone: dto.contactPhone ?? null,
        budget: dto.budget ?? null,
        sector: dto.sector ?? null,
      },
    });
  }

  async findAll(user: AuthUser, page = 1, limit = 20, search?: string) {
    const skip = (page - 1) * limit;
    const where = {
      organizationId: user.organizationId,
      active: true,
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' as const } },
          { description: { contains: search, mode: 'insensitive' as const } },
        ],
      }),
    };

    const [entities, total] = await Promise.all([
      this.prisma.auditEntity.findMany({
        where, skip, take: limit,
        orderBy: [{ inherentRiskScore: 'desc' }, { name: 'asc' }],
        include: {
          owner: { select: { id: true, name: true } },
          _count: { select: { audits: true, auditableUnits: true } },
          children: { select: { id: true, name: true } },
        },
      }),
      this.prisma.auditEntity.count({ where }),
    ]);

    return {
      data: entities,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string, user: AuthUser) {
    const entity = await this.prisma.auditEntity.findFirst({
      where: { id, organizationId: user.organizationId },
      include: {
        owner: { select: { id: true, name: true, email: true } },
        children: { select: { id: true, name: true, entityType: true } },
        parent: { select: { id: true, name: true } },
        auditableUnits: {
          include: {
            auditProcess: { select: { id: true, code: true, name: true } },
            assessments: { orderBy: { assessmentYear: 'desc' }, take: 1 },
          },
        },
        audits: {
          orderBy: { createdAt: 'desc' }, take: 5,
          select: { id: true, title: true, status: true, startDate: true, endDate: true, auditOpinion: true },
        },
      },
    });
    if (!entity) throw new NotFoundException('Entidad no encontrada');
    return entity;
  }

  async update(id: string, dto: LegacyUpdateDto, user: AuthUser) {
    await this.findOne(id, user);
    return this.prisma.auditEntity.update({
      where: { id },
      data: {
        ...(dto.name !== undefined              && { name: dto.name }),
        ...(dto.description !== undefined       && { description: dto.description }),
        ...(dto.division !== undefined          && { category: dto.division }),
        ...(dto.location !== undefined          && { location: dto.location }),
        ...(dto.responsible !== undefined        && { responsible: dto.responsible }),
        ...(dto.responsibleId !== undefined     && { responsible: dto.responsibleId }),
        ...(dto.riskScore !== undefined         && { inherentRiskScore: dto.riskScore }),
        ...(dto.isActive !== undefined          && { active: dto.isActive }),
        ...(dto.parentEntityId !== undefined    && { parentEntityId: dto.parentEntityId }),
        ...(dto.entityType !== undefined        && { entityType: dto.entityType }),
        ...(dto.applicableRegulations !== undefined && { applicableRegulations: dto.applicableRegulations }),
        ...(dto.ownerId !== undefined           && { ownerId: dto.ownerId }),
        ...(dto.objective !== undefined         && { objective: dto.objective }),
        ...(dto.status !== undefined            && { status: dto.status }),
        ...(dto.employeeCount !== undefined     && { employeeCount: dto.employeeCount }),
        ...(dto.contactEmail !== undefined      && { contactEmail: dto.contactEmail }),
        ...(dto.contactPhone !== undefined      && { contactPhone: dto.contactPhone }),
        ...(dto.budget !== undefined            && { budget: dto.budget }),
        ...(dto.sector !== undefined            && { sector: dto.sector }),
      },
    });
  }

  async remove(id: string, user: AuthUser) {
    await this.findOne(id, user);
    return this.prisma.auditEntity.update({ where: { id }, data: { active: false } });
  }

  async getRiskSummary(user: AuthUser) {
    const [critical, high, medium, low] = await Promise.all([
      this.prisma.auditEntity.count({ where: { organizationId: user.organizationId, active: true, inherentRiskScore: { gte: 80 } } }),
      this.prisma.auditEntity.count({ where: { organizationId: user.organizationId, active: true, inherentRiskScore: { gte: 60, lt: 80 } } }),
      this.prisma.auditEntity.count({ where: { organizationId: user.organizationId, active: true, inherentRiskScore: { gte: 40, lt: 60 } } }),
      this.prisma.auditEntity.count({ where: { organizationId: user.organizationId, active: true, inherentRiskScore: { lt: 40 } } }),
    ]);
    return { CRITICAL: critical, HIGH: high, MEDIUM: medium, LOW: low };
  }

  // ─── Entity Tree ──────────────────────────────────────────────────────────
  // Retorna TODAS las entidades de la org con jerarquía para el árbol.

  async getEntityTree(user: AuthUser) {
    const all = await this.prisma.auditEntity.findMany({
      where: { organizationId: user.organizationId, active: true },
      orderBy: { name: 'asc' },
      include: {
        owner: { select: { id: true, name: true } },
        _count: { select: { auditableUnits: true, audits: true } },
      },
    });

    // Construir árbol en memoria
    type NodeType = typeof all[0] & { children: NodeType[] };
    const map = new Map<string, NodeType>(
      all.map((e) => [e.id, { ...e, children: [] }]),
    );
    const roots: NodeType[] = [];
    for (const node of map.values()) {
      if (node.parentEntityId && map.has(node.parentEntityId)) {
        map.get(node.parentEntityId)!.children.push(node);
      } else {
        roots.push(node);
      }
    }
    return roots;
  }

  // ─── AuditProcess ─────────────────────────────────────────────────────────

  async createProcess(dto: CreateAuditProcessDto, user: AuthUser) {
    return this.prisma.auditProcess.create({
      data: {
        organizationId: user.organizationId,
        code: dto.code,
        name: dto.name,
        description: dto.description,
        category: dto.category,
        apqcCode: dto.apqcCode,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
  }

  async findAllProcesses(user: AuthUser) {
    return this.prisma.auditProcess.findMany({
      where: { organizationId: user.organizationId, active: true },
      orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { auditableUnits: true } } },
    });
  }

  async updateProcess(id: string, dto: UpdateAuditProcessDto, user: AuthUser) {
    const proc = await this.prisma.auditProcess.findFirst({
      where: { id, organizationId: user.organizationId },
    });
    if (!proc) throw new NotFoundException('Proceso no encontrado');
    return this.prisma.auditProcess.update({ where: { id }, data: dto });
  }

  async removeProcess(id: string, user: AuthUser) {
    const proc = await this.prisma.auditProcess.findFirst({
      where: { id, organizationId: user.organizationId },
    });
    if (!proc) throw new NotFoundException('Proceso no encontrado');
    return this.prisma.auditProcess.update({ where: { id }, data: { active: false } });
  }

  // ─── AuditableUnit ────────────────────────────────────────────────────────

  async createUnit(dto: CreateAuditableUnitDto, user: AuthUser) {
    // Verificar que la entidad y el proceso pertenecen a la org
    const [entity, process] = await Promise.all([
      this.prisma.auditEntity.findFirst({ where: { id: dto.auditEntityId, organizationId: user.organizationId } }),
      this.prisma.auditProcess.findFirst({ where: { id: dto.auditProcessId, organizationId: user.organizationId } }),
    ]);
    if (!entity) throw new NotFoundException('Entidad no encontrada');
    if (!process) throw new NotFoundException('Proceso no encontrado');

    return this.prisma.auditableUnit.create({
      data: {
        organizationId: user.organizationId,
        auditEntityId: dto.auditEntityId,
        auditProcessId: dto.auditProcessId,
        name: dto.name,
        auditType: dto.auditType ?? 'OPERATIONAL',
        isMandatory: dto.isMandatory ?? false,
        mandatoryBasis: dto.mandatoryBasis,
        strategicLineId: dto.strategicLineId ?? null,
        riskType: dto.riskType ?? null,
        notes: dto.notes,
      },
      include: {
        auditEntity: { select: { id: true, name: true, entityType: true } },
        auditProcess: { select: { id: true, code: true, name: true } },
      },
    });
  }

  async findAllUnits(user: AuthUser, entityId?: string, year?: number) {
    const currentYear = year ?? new Date().getFullYear();
    return this.prisma.auditableUnit.findMany({
      where: {
        organizationId: user.organizationId,
        active: true,
        ...(entityId && { auditEntityId: entityId }),
      },
      include: {
        auditEntity: { select: { id: true, name: true, entityType: true, parentEntityId: true } },
        auditProcess: { select: { id: true, code: true, name: true, category: true } },
        assessments: {
          where: { assessmentYear: currentYear },
          take: 1,
        },
      },
      orderBy: [{ auditEntity: { name: 'asc' } }, { auditProcess: { sortOrder: 'asc' } }],
    });
  }

  async updateUnit(id: string, dto: UpdateAuditableUnitDto, user: AuthUser) {
    const unit = await this.prisma.auditableUnit.findFirst({ where: { id, organizationId: user.organizationId } });
    if (!unit) throw new NotFoundException('Unidad auditable no encontrada');
    return this.prisma.auditableUnit.update({ where: { id }, data: dto });
  }

  async removeUnit(id: string, user: AuthUser) {
    const unit = await this.prisma.auditableUnit.findFirst({ where: { id, organizationId: user.organizationId } });
    if (!unit) throw new NotFoundException('Unidad auditable no encontrada');
    return this.prisma.auditableUnit.update({ where: { id }, data: { active: false } });
  }

  // ─── Scoring Engine ───────────────────────────────────────────────────────

  async upsertAssessment(unitId: string, dto: UpsertAssessmentDto, user: AuthUser) {
    const unit = await this.prisma.auditableUnit.findFirst({ where: { id: unitId, organizationId: user.organizationId } });
    if (!unit) throw new NotFoundException('Unidad auditable no encontrada');

    const year = dto.assessmentYear ?? new Date().getFullYear();

    // Leer existente o usar defaults
    const existing = await this.prisma.auditableUnitAssessment.findUnique({
      where: { auditableUnitId_assessmentYear: { auditableUnitId: unitId, assessmentYear: year } },
    });

    const merged = {
      impactScore:           dto.impactScore           ?? existing?.impactScore           ?? 3,
      likelihoodScore:       dto.likelihoodScore       ?? existing?.likelihoodScore       ?? 3,
      controlMaturityScore:  dto.controlMaturityScore  ?? existing?.controlMaturityScore  ?? 3,
      materialityScore:      dto.materialityScore      ?? existing?.materialityScore      ?? 3,
      strategicAlignScore:   dto.strategicAlignScore   ?? existing?.strategicAlignScore   ?? 1,
      operationalAlignScore: dto.operationalAlignScore ?? existing?.operationalAlignScore ?? 1,
      fraudHistoryScore:     dto.fraudHistoryScore     ?? existing?.fraudHistoryScore     ?? 1,
      managementReqScore:    dto.managementReqScore    ?? existing?.managementReqScore    ?? 1,
      staffTurnoverScore:    dto.staffTurnoverScore    ?? (existing as any)?.staffTurnoverScore    ?? 1,
      coverageHistoryScore:  dto.coverageHistoryScore  ?? (existing as any)?.coverageHistoryScore  ?? 1,
    };

    const { inherentRiskScore, residualRiskScore, totalScore, riskLevel } = computeScores(merged);

    const lastAuditDate = dto.lastAuditDate
      ? new Date(dto.lastAuditDate)
      : existing?.lastAuditDate ?? null;
    const freqMonths = dto.recommendedFreqMonths ?? existing?.recommendedFreqMonths ?? 12;
    const { nextRecommendedDate, coverageGapDays } = computeCoverageGap(lastAuditDate, freqMonths);

    return this.prisma.auditableUnitAssessment.upsert({
      where: { auditableUnitId_assessmentYear: { auditableUnitId: unitId, assessmentYear: year } },
      create: {
        auditableUnitId: unitId,
        assessmentYear: year,
        assessedById: user.id,
        ...merged,
        inherentRiskScore,
        residualRiskScore,
        totalScore,
        riskLevel,
        lastAuditDate,
        lastAuditOpinion: dto.lastAuditOpinion ?? existing?.lastAuditOpinion,
        recommendedFreqMonths: freqMonths,
        nextRecommendedDate,
        coverageGapDays,
        notes: dto.notes,
      },
      update: {
        assessedById: user.id,
        ...merged,
        inherentRiskScore,
        residualRiskScore,
        totalScore,
        riskLevel,
        lastAuditDate,
        lastAuditOpinion: dto.lastAuditOpinion ?? existing?.lastAuditOpinion,
        recommendedFreqMonths: freqMonths,
        nextRecommendedDate,
        coverageGapDays,
        notes: dto.notes,
      },
    });
  }

  // ─── Plan Builder: candidatas rankeadas ───────────────────────────────────
  // Retorna unidades auditables rankeadas por score para el año dado.
  // Las mandatorias siempre aparecen primero. Las demás ordenadas por totalScore desc.
  async getPlanCandidates(user: AuthUser, year?: number) {
    const currentYear = year ?? new Date().getFullYear();

    const units = await this.prisma.auditableUnit.findMany({
      where: { organizationId: user.organizationId, active: true },
      include: {
        auditEntity: { select: { id: true, name: true, entityType: true } },
        auditProcess: { select: { id: true, code: true, name: true, category: true } },
        assessments: {
          where: { assessmentYear: currentYear },
          take: 1,
        },
        planItems: {
          include: { plan: { select: { year: true, status: true } } },
          orderBy: { plan: { year: 'desc' } },
          take: 3,
        },
      },
    });

    const mapped = units.map((u) => {
      const assessment = u.assessments[0] ?? null;
      const alreadyInCurrentPlan = u.planItems.some(
        (pi) => pi.plan.year === currentYear && pi.plan.status !== 'CLOSED',
      );
      return {
        ...u,
        assessment,
        alreadyInCurrentPlan,
        totalScore: assessment?.totalScore ?? 0,
        riskLevel: assessment?.riskLevel ?? 'MEDIUM',
        coverageGapDays: assessment?.coverageGapDays ?? null,
        isOverdue: (assessment?.coverageGapDays ?? 0) > 0,
      };
    });

    // Mandatorias primero, luego por score desc, luego por coverageGapDays desc
    mapped.sort((a, b) => {
      if (a.isMandatory !== b.isMandatory) return a.isMandatory ? -1 : 1;
      if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
      return (b.coverageGapDays ?? 0) - (a.coverageGapDays ?? 0);
    });

    return {
      year: currentYear,
      total: mapped.length,
      mandatory: mapped.filter((u) => u.isMandatory).length,
      overdue: mapped.filter((u) => u.isOverdue).length,
      candidates: mapped,
    };
  }
}
