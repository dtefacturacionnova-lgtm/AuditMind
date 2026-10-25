import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { assertInOrg } from '../common/utils/tenant.util';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/jwt.strategy';
import { CreateAuditProjectDto, UpdateAuditProjectDto } from './dto/audit-project.dto';
import { AuditStatus, Prisma } from '@prisma/client';
import { visibleAuditWhere } from '../common/utils/investigation-scope.util';
import { computeProjectRisk, RISK_FACTOR_KEYS } from './project-risk.util';

const FK_KEYS = ['strategicObjectiveId', 'strategicLineId', 'responsibleEntityId', 'supportEntityId'] as const;

/**
 * Para la cobertura por ÁREA (respaldo): solo cuentan las auditorías que no son de un proyecto del Banco. Una auditoría ligada por el
 * plan a un proyecto cubre a ESE proyecto; si también contara para el área, auditar un proyecto «cubriría» a todos los demás de la gerencia.
 */
const NOT_A_PROJECT_AUDIT: Prisma.AuditWhereInput = { OR: [{ planItem: null }, { planItem: { auditProjectId: null } }] };

/** '' (formularios) = sin valor: en una clave foránea el vacío debe ser NULL, no una cadena que viola la FK (500). */
function emptyFksToNull<T extends Record<string, any>>(dto: T): T {
  const out: Record<string, any> = { ...dto };
  for (const k of FK_KEYS) if (k in out && out[k] === '') out[k] = null;
  return out as T;
}

const INCLUDE = {
  strategicObjective: { select: { id: true, code: true, name: true, color: true, icon: true } },
  strategicLine:      { select: { id: true, code: true, name: true } },
  responsibleEntity:  { select: { id: true, name: true, entityType: true } },
  supportEntity:      { select: { id: true, name: true, entityType: true } },
};

@Injectable()
export class AuditProjectsService {
  constructor(private prisma: PrismaService) {}

  async findAll(user: AuthUser, year?: number, riskLevel?: string, search?: string) {
    const projects = await this.prisma.auditProject.findMany({
      where: {
        organizationId: user.organizationId,
        active: true,
        ...(year       && { planYear:        year }),
        ...(riskLevel  && { finalRiskLevel:  riskLevel }),
        ...(search     && { name: { contains: search, mode: 'insensitive' } }),
      },
      include: INCLUDE,
      orderBy: [{ planYear: 'desc' }, { correlative: 'asc' }],
    });
    return this.enrichWithCoverage(projects, user);
  }

  async findOne(id: string, user: AuthUser) {
    const project = await this.prisma.auditProject.findFirst({
      where: { id, organizationId: user.organizationId }, include: INCLUDE,
    });
    if (!project) return null;
    const [enriched] = await this.enrichWithCoverage([project], user);
    return enriched;
  }

  async create(dto: CreateAuditProjectDto, user: AuthUser) {
    await this.assertRefsInOrg(dto, user);
    const data = emptyFksToNull(dto);
    // El puntaje y el nivel final los fija el servidor con los 10 factores (lo que mande la pantalla se ignora si hay factores).
    const risk = computeProjectRisk(data);
    return this.prisma.auditProject.create({
      data: { ...data, ...(risk && { finalRiskScore: risk.score, finalRiskLevel: risk.level }), organizationId: user.organizationId },
      include: INCLUDE,
    });
  }

  async update(id: string, dto: UpdateAuditProjectDto, user: AuthUser) {
    const current = await this.assertOwned(id, user);
    await this.assertRefsInOrg(dto, user);
    const data = emptyFksToNull(dto);
    // Riesgo con los factores resultantes (los que llegan sobre los guardados).
    const merged: Record<string, number | null | undefined> = {};
    for (const k of RISK_FACTOR_KEYS) merged[k] = (data as any)[k] !== undefined ? (data as any)[k] : (current as any)[k];
    const risk = computeProjectRisk(merged);
    return this.prisma.auditProject.update({
      where: { id },
      data: { ...data, ...(risk && { finalRiskScore: risk.score, finalRiskLevel: risk.level }) },
      include: INCLUDE,
    });
  }

  async remove(id: string, user: AuthUser) {
    await this.assertOwned(id, user);
    // Borrar un proyecto suelta sus ítems de plan (SET NULL), incluso los de planes ya aprobados o cerrados: el ítem quedaría sin
    // proyecto ni área y sus horas seguirían sumando. Con ítems de plan se archiva en vez de borrar.
    const inPlans = await this.prisma.auditPlanItem.count({ where: { auditProjectId: id } });
    if (inPlans > 0) {
      throw new ConflictException(
        `El proyecto está en ${inPlans} ítem(s) de plan anual: no se puede eliminar. Márcalo como archivado (inactivo) para sacarlo del Banco.`,
      );
    }
    return this.prisma.auditProject.delete({ where: { id } });
  }

  // Aislamiento multi-organización (auditoría de seguridad 2026-10-18): antes
  // update/remove/findOne operaban por id sin comprobar la organización, y las
  // referencias del body (objetivo, línea, áreas) podían ser de otra.
  private async assertOwned(id: string, user: AuthUser) {
    const found = await this.prisma.auditProject.findFirst({
      where: { id, organizationId: user.organizationId },
    });
    if (!found) throw new NotFoundException('Proyecto no encontrado');
    return found;
  }

  private async assertRefsInOrg(
    dto: { strategicObjectiveId?: string; strategicLineId?: string; responsibleEntityId?: string; supportEntityId?: string },
    user: AuthUser,
  ) {
    const scope = { organizationId: user.organizationId };
    await assertInOrg(this.prisma.strategicObjective, dto.strategicObjectiveId, scope, 'El objetivo estratégico');
    await assertInOrg(this.prisma.strategicLine, dto.strategicLineId, scope, 'La línea estratégica');
    await assertInOrg(this.prisma.auditEntity, dto.responsibleEntityId, scope, 'El área responsable');
    await assertInOrg(this.prisma.auditEntity, dto.supportEntityId, scope, 'El área de apoyo');
  }

  async getStats(user: AuthUser) {
    const projects = await this.prisma.auditProject.findMany({
      where: { organizationId: user.organizationId, active: true },
      select: {
        finalRiskLevel: true, includeInPlan: true, planYear: true,
        totalBudget: true, responsibleEntityId: true,
      },
    });
    const years = [...new Set(projects.map(p => p.planYear))].sort((a, b) => b - a);

    // Coverage: projects that have a responsibleEntity assigned
    const withEntity = projects.filter(p => p.responsibleEntityId).length;

    return {
      total:       projects.length,
      inPlan:      projects.filter(p => p.includeInPlan).length,
      critico:     projects.filter(p => p.finalRiskLevel === 'CRITICO').length,
      alto:        projects.filter(p => p.finalRiskLevel === 'ALTO').length,
      medio:       projects.filter(p => p.finalRiskLevel === 'MEDIO').length,
      bajo:        projects.filter(p => p.finalRiskLevel === 'BAJO').length,
      withEntity,
      years,
      totalBudget: projects.reduce((s, p) => s + (p.totalBudget ?? 0), 0),
    };
  }

  // Actualiza coverageHistoryScore (1-5) en todos los proyectos usando el historial real
  // de auditorías cerradas. Mayor score = más tiempo sin auditar = mayor riesgo.
  // Banda → score: <365d→1, 365-730d→2, 730-1095d→3, 1095-1460d→4, >1460d/nunca→5
  async syncCoverage(user: AuthUser) {
    const projects = await this.prisma.auditProject.findMany({
      where: {
        organizationId: user.organizationId,
        active: true,
        responsibleEntityId: { not: null },
      },
    });

    const entityIds = [...new Set(projects.map(p => p.responsibleEntityId!))];
    const closedAudits = await this.prisma.audit.findMany({
      where: {
        organizationId: user.organizationId,
        auditEntityId: { in: entityIds },
        status: AuditStatus.CLOSED,
        AND: [NOT_A_PROJECT_AUDIT],
      },
      select: { auditEntityId: true, endDate: true, updatedAt: true },
      orderBy: { endDate: 'desc' },
    });

    const lastAuditMap = new Map<string, Date>();
    for (const audit of closedAudits) {
      if (!audit.auditEntityId) continue;
      if (!lastAuditMap.has(audit.auditEntityId)) {
        lastAuditMap.set(audit.auditEntityId, audit.endDate ?? audit.updatedAt);
      }
    }

    // Cobertura POR PROYECTO: la última auditoría cerrada de los ítems de plan que apuntan al proyecto; el área responsable solo
    // sirve de respaldo cuando el proyecto no tiene ninguna (si no, auditar un proyecto de la gerencia «cubría» a todos los demás).
    const byProject = await this.lastClosedByProject(projects.map(p => p.id), { organizationId: user.organizationId });

    const now = new Date();
    const updates: Array<{ id: string; correlative: string; name: string; oldValue: number | null; newValue: number }> = [];

    for (const p of projects) {
      const lastDate = byProject.get(p.id) ?? lastAuditMap.get(p.responsibleEntityId!);
      // No audit found: maximum risk score (5)
      const newScore = !lastDate ? 5 : (() => {
        const days = Math.floor((now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
        if (days < 365)  return 1;
        if (days < 730)  return 2;
        if (days < 1095) return 3;
        if (days < 1460) return 4;
        return 5;
      })();
      if (p.coverageHistoryScore !== newScore) {
        updates.push({ id: p.id, correlative: p.correlative, name: p.name, oldValue: p.coverageHistoryScore, newValue: newScore });
      }
    }

    if (updates.length > 0) {
      const byId = new Map(projects.map(p => [p.id, p]));
      await Promise.all(
        updates.map(u => {
          // El factor de cobertura cambió: el puntaje y el nivel de riesgo se recalculan con él (antes quedaban los viejos).
          const risk = computeProjectRisk({ ...(byId.get(u.id) as any), coverageHistoryScore: u.newValue });
          return this.prisma.auditProject.update({
            where: { id: u.id },
            data: { coverageHistoryScore: u.newValue, ...(risk && { finalRiskScore: risk.score, finalRiskLevel: risk.level }) },
          });
        })
      );
    }

    return { updated: updates.length, changes: updates };
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  /** Fecha de la última auditoría CERRADA de cada proyecto, por los ítems de plan que apuntan a él. */
  private async lastClosedByProject(projectIds: string[], auditScope: Prisma.AuditWhereInput): Promise<Map<string, Date>> {
    if (projectIds.length === 0) return new Map();
    const items = await this.prisma.auditPlanItem.findMany({
      where: { auditProjectId: { in: projectIds }, audit: { ...auditScope, status: AuditStatus.CLOSED } },
      select: { auditProjectId: true, audit: { select: { endDate: true, updatedAt: true } } },
    });
    const out = new Map<string, Date>();
    for (const i of items) {
      if (!i.auditProjectId || !i.audit) continue;
      const d = i.audit.endDate ?? i.audit.updatedAt;
      const prev = out.get(i.auditProjectId);
      if (!prev || d > prev) out.set(i.auditProjectId, d);
    }
    return out;
  }

  private async enrichWithCoverage(projects: any[], user: AuthUser) {
    const entityIds = [
      ...new Set(projects.map(p => p.responsibleEntityId).filter(Boolean) as string[]),
    ];

    if (entityIds.length === 0) {
      return projects.map(p => ({
        ...p, coverageGapDays: null, lastAuditDate: null, lastAuditAgeDynamic: null,
      }));
    }

    // Single query: most recent CLOSED audit per entity (ordered desc → first seen = latest)
    // Modo investigación (2026-10-25): la última auditoría cerrada que se muestra no incluye investigaciones ajenas al equipo
    // (la fecha de cierre revelaría que existió una). El puntaje de cobertura de `syncCoverage` sí las considera: es de toda la organización.
    const closedAudits = await this.prisma.audit.findMany({
      where: {
        ...visibleAuditWhere(user),
        auditEntityId: { in: entityIds },
        status: AuditStatus.CLOSED,
        AND: [NOT_A_PROJECT_AUDIT],
      },
      select: { auditEntityId: true, endDate: true, updatedAt: true },
      orderBy: { endDate: 'desc' },
    });

    const lastAuditMap = new Map<string, Date>();
    for (const audit of closedAudits) {
      if (!audit.auditEntityId) continue;
      if (!lastAuditMap.has(audit.auditEntityId)) {
        lastAuditMap.set(audit.auditEntityId, audit.endDate ?? audit.updatedAt);
      }
    }

    const byProject = await this.lastClosedByProject(projects.map(p => p.id), visibleAuditWhere(user));
    const now = new Date();
    return projects.map(p => {
      const lastDate = byProject.get(p.id) ?? (p.responsibleEntityId ? lastAuditMap.get(p.responsibleEntityId) : undefined);
      if (!lastDate) {
        return { ...p, coverageGapDays: null, lastAuditDate: null, lastAuditAgeDynamic: null };
      }
      const days = Math.floor((now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
      // Bands: 1=<365d, 2=365-730d, 3=730-1095d, 4=>1095d/Nunca
      const band = days < 365 ? 1 : days < 730 ? 2 : days < 1095 ? 3 : 4;
      return { ...p, coverageGapDays: days, lastAuditDate: lastDate, lastAuditAgeDynamic: band };
    });
  }
}
