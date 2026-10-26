import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/jwt.strategy';
import { assertInOrg } from '../common/utils/tenant.util';
import { hiddenAuditIds, visibleAuditWhere } from '../common/utils/investigation-scope.util';
import { computeCoverage, withLiveCoverage } from './coverage.util';
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

@Injectable()
export class AuditUniverseService {
  constructor(private prisma: PrismaService) {}

  // ─── AuditEntity (legado — mantener compatibilidad) ─────────────────────────

  async create(dto: LegacyCreateDto, user: AuthUser) {
    await this.assertEntityRefs(dto, user);
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
          // Modo investigación (2026-10-25): el conteo de auditorías no incluye investigaciones ajenas al equipo.
          _count: { select: { audits: { where: visibleAuditWhere(user) }, auditableUnits: true } },
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
          where: visibleAuditWhere(user),
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
    await this.assertEntityRefs(dto, user);
    if (dto.parentEntityId && dto.parentEntityId === id) {
      throw new BadRequestException('Una entidad no puede ser su propia entidad padre.');
    }
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
        _count: { select: { auditableUnits: true, audits: { where: visibleAuditWhere(user) } } },
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

  /** Aislamiento multi-organización (auditoría de seguridad 2026-10-18): la
   *  entidad padre y el responsable deben ser de la propia organización. */
  private async assertEntityRefs(dto: { parentEntityId?: string | null; ownerId?: string | null }, user: AuthUser) {
    const scope = { organizationId: user.organizationId };
    await assertInOrg(this.prisma.auditEntity, dto.parentEntityId, scope, 'La entidad padre');
    await assertInOrg(this.prisma.user, dto.ownerId, scope, 'El responsable');
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
    await assertInOrg(this.prisma.strategicLine, dto.strategicLineId, { organizationId: user.organizationId }, 'La línea estratégica');

    return this.prisma.auditableUnit.create({
      data: {
        organizationId: user.organizationId,
        auditEntityId: dto.auditEntityId,
        auditProcessId: dto.auditProcessId,
        name: dto.name,
        auditType: dto.auditType ?? 'OPERATIONAL',
        isMandatory: dto.isMandatory ?? false,
        mandatoryBasis: dto.mandatoryBasis,
        strategicLineId: dto.strategicLineId || null, // '' (formulario) = sin línea: la FK no admite cadenas vacías
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
    const units = await this.prisma.auditableUnit.findMany({
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
    // La brecha de cobertura se recalcula al leer (la guardada quedaba congelada al día de la evaluación).
    const now = new Date();
    return units.map((u) => ({ ...u, assessments: u.assessments.map((a) => withLiveCoverage(a, now)) }));
  }

  async updateUnit(id: string, dto: UpdateAuditableUnitDto, user: AuthUser) {
    const unit = await this.prisma.auditableUnit.findFirst({ where: { id, organizationId: user.organizationId } });
    if (!unit) throw new NotFoundException('Unidad auditable no encontrada');
    const scope = { organizationId: user.organizationId };
    await assertInOrg(this.prisma.strategicLine, dto.strategicLineId, scope, 'La línea estratégica');
    await assertInOrg(this.prisma.auditEntity, (dto as { auditEntityId?: string }).auditEntityId, scope, 'La entidad');
    await assertInOrg(this.prisma.auditProcess, (dto as { auditProcessId?: string }).auditProcessId, scope, 'El proceso');
    return this.prisma.auditableUnit.update({
      where: { id },
      data: { ...dto, ...(dto.strategicLineId !== undefined && { strategicLineId: dto.strategicLineId || null }) },
    });
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
    // Nunca auditada: la brecha queda null (antes 9999). La lectura la recalcula cada vez; esto solo mantiene las columnas al día.
    const { nextRecommendedDate, coverageGapDays } = computeCoverage(lastAuditDate, freqMonths);

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
    const now = new Date();

    const units = await this.prisma.auditableUnit.findMany({
      where: { organizationId: user.organizationId, active: true },
      include: {
        auditEntity: { select: { id: true, name: true, entityType: true } },
        auditProcess: { select: { id: true, code: true, name: true, category: true } },
        strategicLine: { select: { id: true, code: true, name: true } },
        // La evaluación del año pedido o, si ese año aún no se evalúa, la más reciente anterior (marcada como no vigente):
        // al planear el año siguiente todas las unidades aparecían «sin evaluar».
        assessments: {
          where: { assessmentYear: { lte: currentYear } },
          orderBy: { assessmentYear: 'desc' },
          take: 1,
        },
        planItems: {
          include: { plan: { select: { year: true, status: true } } },
          orderBy: { plan: { year: 'desc' } },
          take: 3,
        },
      },
    });

    // Lo que ya está en el plan del año (no cerrado). Un ítem puede nombrar la unidad (`auditableUnitId`), venir de un proyecto del
    // Banco promovido desde ella (mismo nombre y misma entidad responsable) o ser de la entidad completa (ítem manual). Los ítems
    // ligados a una investigación ajena no cuentan: no se debe revelar por aquí que existe.
    const planItems = await this.prisma.auditPlanItem.findMany({
      where: { plan: { organizationId: user.organizationId, year: currentYear, status: { not: 'CLOSED' } } },
      select: {
        auditId: true, auditableUnitId: true, auditEntityId: true, auditProjectId: true,
        auditProject: { select: { name: true, responsibleEntityId: true } },
      },
    });
    const hidden = await hiddenAuditIds(this.prisma, planItems.map((i) => i.auditId), user);
    const itemsInPlan = planItems.filter((i) => !i.auditId || !hidden.has(i.auditId));
    const planMatchOf = (u: { id: string; name: string | null; auditEntityId: string; auditEntity?: { name: string } | null; auditProcess?: { name: string } | null }) => {
      if (itemsInPlan.some((i) => i.auditableUnitId === u.id)) return 'UNIT' as const;
      const unitName = (u.name ?? `${u.auditEntity?.name ?? ''} — ${u.auditProcess?.name ?? ''}`).trim().toLowerCase();
      if (itemsInPlan.some((i) => i.auditProject?.responsibleEntityId === u.auditEntityId && i.auditProject.name.trim().toLowerCase() === unitName)) return 'PROJECT' as const;
      if (itemsInPlan.some((i) => !i.auditableUnitId && !i.auditProjectId && i.auditEntityId === u.auditEntityId)) return 'ENTITY' as const;
      return null;
    };

    // Última auditoría CERRADA de cada entidad (sugerencia para quien llena «última auditoría»). Sin investigaciones: su fecha no se muestra.
    const closed = await this.prisma.audit.groupBy({
      by: ['auditEntityId'],
      where: { ...visibleAuditWhere(user), status: 'CLOSED', isInvestigationMode: false, auditEntityId: { not: null } },
      _max: { endDate: true },
    });
    const closedByEntity = new Map(closed.map((c) => [c.auditEntityId as string, c._max.endDate]));

    const mapped = units.map((u) => {
      const raw = u.assessments[0] ?? null;
      const assessment = raw ? withLiveCoverage(raw, now) : null;
      const planMatch = planMatchOf(u);
      return {
        ...u,
        assessment,
        assessmentIsStale: !!assessment && assessment.assessmentYear < currentYear,
        // «Sin evaluar»: antes aparecía como riesgo Medio con puntaje 0, mezclado con las unidades realmente medianas.
        scored: !!assessment,
        alreadyInCurrentPlan: planMatch !== null,
        planMatch,
        totalScore: assessment?.totalScore ?? null,
        riskLevel: assessment?.riskLevel ?? null,
        coverageGapDays: assessment?.coverageGapDays ?? null,
        neverAudited: assessment ? assessment.neverAudited : null,
        isOverdue: assessment ? assessment.neverAudited || (assessment.coverageGapDays ?? 0) > 0 : false,
        entityLastClosedAt: closedByEntity.get(u.auditEntityId) ?? null,
      };
    });

    // Mandatorias primero; luego las evaluadas por puntaje; después la que más urge (nunca auditada, luego mayor brecha); las sin evaluar al final.
    const urgency = (u: (typeof mapped)[number]) => (u.neverAudited ? Number.POSITIVE_INFINITY : u.coverageGapDays ?? Number.NEGATIVE_INFINITY);
    mapped.sort((a, b) => {
      if (a.isMandatory !== b.isMandatory) return a.isMandatory ? -1 : 1;
      if (a.scored !== b.scored) return a.scored ? -1 : 1;
      const sa = a.totalScore ?? 0; const sb = b.totalScore ?? 0;
      if (sb !== sa) return sb - sa;
      const ua = urgency(a); const ub = urgency(b);
      return ua === ub ? 0 : ub > ua ? 1 : -1;
    });

    return {
      year: currentYear,
      total: mapped.length,
      mandatory: mapped.filter((u) => u.isMandatory).length,
      overdue: mapped.filter((u) => u.isOverdue).length,
      unscored: mapped.filter((u) => !u.scored).length,
      candidates: mapped,
    };
  }
}
