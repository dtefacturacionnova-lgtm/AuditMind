import {
  Injectable, NotFoundException, ForbiddenException, ConflictException, BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/jwt.strategy';
import { recalculateAuditActualHours } from '../audits/audit-hours.util';
import { assertDailyHoursCap } from '../timesheet/daily-hours-cap.util';
import {
  CreatePlanDto, UpdatePlanDto, CreatePlanItemDto, UpdatePlanItemDto, ImportFromProjectsDto,
  CreateTimeEntryDto, LinkAuditDto,
} from './dto/plan.dto';

const ITEM_INCLUDE = {
  auditEntity: {
    select: { id: true, name: true, category: true, inherentRiskScore: true, responsible: true },
  },
  auditProject: {
    select: {
      id: true, correlative: true, name: true,
      finalRiskScore: true, finalRiskLevel: true,
      totalBudget: true, plannedHours: true,
      riskCategory: true,
    },
  },
  // Horas reales — solo se llena una vez que el ítem se vincula a un encargo real
  // vía linkAudit(). `actualHours` ya se mantiene sincronizado con TimeEntry desde
  // Fase 1 de "Horas y Rentabilidad" (apps/api/src/audits/audit-hours.util.ts).
  audit: {
    select: { id: true, title: true, status: true, actualHours: true },
  },
} as const;

const PLAN_INCLUDE = {
  items: { include: ITEM_INCLUDE, orderBy: { priority: 'asc' as const } },
} as const;

@Injectable()
export class PlansService {
  constructor(private prisma: PrismaService) {}

  // ── Helpers ────────────────────────────────────────────────────────────────
  private calcCapacity(
    totalHours: number,
    items: { estimatedHours: number; audit?: { actualHours: number } | null }[],
  ) {
    const allocatedHours = items.reduce((s, i) => s + i.estimatedHours, 0);
    const remainingHours = totalHours - allocatedHours;
    const utilizationPct = totalHours > 0 ? Math.round((allocatedHours / totalHours) * 100) : 0;
    // Horas reales: 0 para un ítem que aún no se vincula a un encargo (no es "desconocido"
    // — genuinamente no se ha trabajado nada todavía), a diferencia de costoReal en
    // getBudgetReport donde null sí significa "no se puede saber".
    const startedItems = items.filter((i) => i.audit).length;
    const realHours = items.reduce((s, i) => s + (i.audit?.actualHours ?? 0), 0);
    return { allocatedHours, remainingHours, utilizationPct, startedItems, realHours };
  }

  private async getPlanOrThrow(id: string, user: AuthUser) {
    const plan = await this.prisma.auditPlan.findUnique({
      where: { id },
      include: PLAN_INCLUDE,
    });
    if (!plan) throw new NotFoundException('Plan no encontrado');
    if (plan.organizationId !== user.organizationId) throw new ForbiddenException();
    return plan;
  }

  // ── Create plan ────────────────────────────────────────────────────────────
  async create(dto: CreatePlanDto, user: AuthUser) {
    const existing = await this.prisma.auditPlan.findUnique({
      where: { organizationId_year: { organizationId: user.organizationId, year: dto.year } },
    });
    if (existing) throw new ConflictException(`Ya existe un plan para el año ${dto.year}`);

    const plan = await this.prisma.auditPlan.create({
      data: {
        organizationId: user.organizationId,
        year:       dto.year,
        name:       dto.name,
        totalHours: dto.totalHours ?? 0,
        objectives: (dto.objectives ?? []) as any,
        status:     'DRAFT',
      },
      include: PLAN_INCLUDE,
    });

    return { ...plan, ...this.calcCapacity(plan.totalHours, plan.items) };
  }

  // ── List plans ─────────────────────────────────────────────────────────────
  async findAll(user: AuthUser) {
    const plans = await this.prisma.auditPlan.findMany({
      where:   { organizationId: user.organizationId },
      include: PLAN_INCLUDE,
      orderBy: { year: 'desc' },
    });
    return plans.map(p => ({ ...p, ...this.calcCapacity(p.totalHours, p.items) }));
  }

  // ── Get one ────────────────────────────────────────────────────────────────
  async findOne(id: string, user: AuthUser) {
    const plan = await this.getPlanOrThrow(id, user);
    return { ...plan, ...this.calcCapacity(plan.totalHours, plan.items) };
  }

  // ── Update plan ────────────────────────────────────────────────────────────
  async update(id: string, dto: UpdatePlanDto, user: AuthUser) {
    const plan = await this.getPlanOrThrow(id, user);
    if (plan.status === 'CLOSED') throw new ForbiddenException('No se puede modificar un plan cerrado');

    const updated = await this.prisma.auditPlan.update({
      where: { id },
      data: {
        ...(dto.name       != null && { name:       dto.name }),
        ...(dto.totalHours != null && { totalHours: dto.totalHours }),
        ...(dto.objectives != null && { objectives: dto.objectives as any }),
        ...(dto.amendments != null && { amendments: dto.amendments as any }),
      },
      include: PLAN_INCLUDE,
    });
    return { ...updated, ...this.calcCapacity(updated.totalHours, updated.items) };
  }

  // ── Approve plan ───────────────────────────────────────────────────────────
  async approve(id: string, user: AuthUser) {
    const plan = await this.getPlanOrThrow(id, user);
    if (plan.status !== 'DRAFT') throw new ForbiddenException('Solo se puede aprobar un plan en DRAFT');

    const updated = await this.prisma.auditPlan.update({
      where: { id },
      data:  { status: 'APPROVED', approvedById: user.id, approvedAt: new Date() },
      include: PLAN_INCLUDE,
    });
    return { ...updated, ...this.calcCapacity(updated.totalHours, updated.items) };
  }

  // ── Activate plan ──────────────────────────────────────────────────────────
  async activate(id: string, user: AuthUser) {
    const plan = await this.getPlanOrThrow(id, user);
    if (plan.status !== 'APPROVED') throw new ForbiddenException('Solo se puede activar un plan APPROVED');

    const updated = await this.prisma.auditPlan.update({
      where: { id },
      data:  { status: 'ACTIVE' },
      include: PLAN_INCLUDE,
    });
    return { ...updated, ...this.calcCapacity(updated.totalHours, updated.items) };
  }

  // ── Close plan ─────────────────────────────────────────────────────────────
  async close(id: string, user: AuthUser) {
    const plan = await this.getPlanOrThrow(id, user);
    if (plan.status !== 'ACTIVE') throw new ForbiddenException('Solo se puede cerrar un plan ACTIVE');

    const updated = await this.prisma.auditPlan.update({
      where: { id },
      data:  { status: 'CLOSED' },
      include: PLAN_INCLUDE,
    });
    return { ...updated, ...this.calcCapacity(updated.totalHours, updated.items) };
  }

  // ── Add item ───────────────────────────────────────────────────────────────
  async addItem(planId: string, dto: CreatePlanItemDto, user: AuthUser) {
    const plan = await this.getPlanOrThrow(planId, user);
    if (plan.status === 'CLOSED') throw new ForbiddenException('No se puede modificar un plan cerrado');

    // Check entity belongs to org
    const entity = await this.prisma.auditEntity.findFirst({
      where: { id: dto.auditEntityId, organizationId: user.organizationId },
    });
    if (!entity) throw new NotFoundException('Entidad no encontrada');

    // Check not already in plan
    const existing = plan.items.find(i => i.auditEntityId === dto.auditEntityId);
    if (existing) throw new ConflictException('Esta entidad ya está en el plan');

    await this.prisma.auditPlanItem.create({
      data: {
        planId,
        auditEntityId:     dto.auditEntityId,
        estimatedHours:    dto.estimatedHours,
        priority:          dto.priority ?? 2,
        notes:             dto.notes,
        tentativeStartDate: dto.tentativeStartDate ? new Date(dto.tentativeStartDate) : null,
        tentativeEndDate:   dto.tentativeEndDate   ? new Date(dto.tentativeEndDate)   : null,
      },
    });

    return this.findOne(planId, user);
  }

  // ── Update item ────────────────────────────────────────────────────────────
  async updateItem(planId: string, itemId: string, dto: UpdatePlanItemDto, user: AuthUser) {
    const plan = await this.getPlanOrThrow(planId, user);
    if (plan.status === 'CLOSED') throw new ForbiddenException('No se puede modificar un plan cerrado');

    const item = plan.items.find(i => i.id === itemId);
    if (!item) throw new NotFoundException('Item no encontrado en el plan');

    await this.prisma.auditPlanItem.update({
      where: { id: itemId },
      data: {
        ...(dto.estimatedHours    != null && { estimatedHours:    dto.estimatedHours }),
        ...(dto.priority          != null && { priority:          dto.priority }),
        ...(dto.notes             != null && { notes:             dto.notes }),
        ...(dto.tentativeStartDate != null && { tentativeStartDate: new Date(dto.tentativeStartDate) }),
        ...(dto.tentativeEndDate   != null && { tentativeEndDate:   new Date(dto.tentativeEndDate) }),
        ...(dto.responsibleName   != null && { responsibleName:   dto.responsibleName }),
        ...(dto.teamNotes         != null && { teamNotes:         dto.teamNotes }),
      },
    });

    return this.findOne(planId, user);
  }

  // ── Remove item ────────────────────────────────────────────────────────────
  async removeItem(planId: string, itemId: string, user: AuthUser) {
    const plan = await this.getPlanOrThrow(planId, user);
    if (plan.status === 'CLOSED') throw new ForbiddenException('No se puede modificar un plan cerrado');

    const item = plan.items.find(i => i.id === itemId);
    if (!item) throw new NotFoundException('Item no encontrado en el plan');

    await this.prisma.auditPlanItem.delete({ where: { id: itemId } });
    return this.findOne(planId, user);
  }

  // ── Vincular a un encargo real — conecta el ítem del plan con horas reales ──
  // `AuditPlanItem.auditId` tiene @unique en el schema — la constraint de BD ya
  // evita que dos ítems apunten al mismo encargo, capturado aquí como P2002.
  async linkAudit(planId: string, itemId: string, dto: LinkAuditDto, user: AuthUser) {
    const plan = await this.getPlanOrThrow(planId, user);
    if (plan.status === 'CLOSED') throw new ForbiddenException('No se puede modificar un plan cerrado');

    const item = plan.items.find((i) => i.id === itemId);
    if (!item) throw new NotFoundException('Item no encontrado en el plan');

    const audit = await this.prisma.audit.findFirst({
      where: { id: dto.auditId, organizationId: user.organizationId },
      select: { id: true },
    });
    if (!audit) throw new NotFoundException('Encargo no encontrado en esta organización');

    try {
      await this.prisma.auditPlanItem.update({
        where: { id: itemId },
        data: { auditId: dto.auditId },
      });
    } catch (e: any) {
      if (e?.code === 'P2002') {
        throw new BadRequestException('Ese encargo ya está vinculado a otro ítem del plan');
      }
      throw e;
    }

    return this.findOne(planId, user);
  }

  async unlinkAudit(planId: string, itemId: string, user: AuthUser) {
    const plan = await this.getPlanOrThrow(planId, user);
    if (plan.status === 'CLOSED') throw new ForbiddenException('No se puede modificar un plan cerrado');

    const item = plan.items.find((i) => i.id === itemId);
    if (!item) throw new NotFoundException('Item no encontrado en el plan');

    await this.prisma.auditPlanItem.update({
      where: { id: itemId },
      data: { auditId: null },
    });
    return this.findOne(planId, user);
  }

  /** Encargos de la organización que se pueden vincular a un ítem — sin dueño
   *  todavía (`planItem` es la relación inversa 1:1 vía @unique en AuditPlanItem.auditId),
   *  para que el selector no ofrezca uno que ya está tomado por otro ítem del plan. */
  async getLinkableAudits(planId: string, user: AuthUser) {
    await this.getPlanOrThrow(planId, user);
    return this.prisma.audit.findMany({
      where: { organizationId: user.organizationId, planItem: null },
      select: { id: true, title: true, status: true, actualHours: true },
      orderBy: { title: 'asc' },
    });
  }

  // ── Import from Banco de Proyectos ─────────────────────────────────────────
  async importFromProjects(planId: string, dto: ImportFromProjectsDto, user: AuthUser) {
    const plan = await this.getPlanOrThrow(planId, user);
    if (plan.status === 'CLOSED') throw new ForbiddenException('No se puede modificar un plan cerrado');

    // Fetch the requested projects, verifying org ownership
    const projects = await this.prisma.auditProject.findMany({
      where: {
        id:             { in: dto.projectIds },
        organizationId: user.organizationId,
        active:         true,
      },
    });

    const alreadyImported = new Set(
      plan.items
        .map(i => (i as any).auditProjectId as string | undefined)
        .filter((v): v is string => !!v),
    );

    let imported = 0;
    let skipped  = 0;

    for (const project of projects) {
      if (alreadyImported.has(project.id)) { skipped++; continue; }

      // Map risk level → priority (CRITICO/ALTO → 1, MEDIO → 2, BAJO → 3)
      const priority =
        project.finalRiskLevel === 'CRITICO' || project.finalRiskLevel === 'ALTO' ? 1
        : project.finalRiskLevel === 'MEDIO' ? 2
        : 3;

      await this.prisma.auditPlanItem.create({
        data: {
          planId,
          auditProjectId: project.id,
          estimatedHours: project.plannedHours ?? 80,
          priority,
          originScore:    project.finalRiskScore ?? undefined,
          isMandatory:    false,
        },
      });
      imported++;
    }

    const updated = await this.findOne(planId, user);
    return { ...updated, importResult: { imported, skipped, notFound: dto.projectIds.length - projects.length } };
  }

  // ── Get project candidates for a plan year ─────────────────────────────────
  async getProjectCandidates(planId: string, user: AuthUser) {
    const plan = await this.getPlanOrThrow(planId, user);

    const projects = await this.prisma.auditProject.findMany({
      where: {
        organizationId: user.organizationId,
        includeInPlan:  true,
        // No targetPlanYear filter — show all marked projects regardless of intended year.
        // The frontend shows the targetPlanYear tag so the user can decide.
        active:         true,
      },
      include: {
        strategicObjective: { select: { id: true, code: true, name: true, color: true } },
        strategicLine:      { select: { id: true, code: true, name: true } },
        responsibleEntity:  { select: { id: true, name: true } },
      },
      orderBy: [{ finalRiskScore: 'desc' }, { name: 'asc' }],
    });

    // Tag which are already in the plan
    const importedIds = new Set(
      plan.items
        .map(i => (i as any).auditProjectId as string | undefined)
        .filter((v): v is string => !!v),
    );

    return projects.map(p => ({ ...p, alreadyInPlan: importedIds.has(p.id) }));
  }

  // ── L2.8: Timesheet — create time entry ──────────────────────────────────────
  async createTimeEntry(dto: CreateTimeEntryDto, user: AuthUser) {
    await assertDailyHoursCap(this.prisma, user.id, new Map([[dto.workDate, dto.hours]]));

    const entry = await this.prisma.timeEntry.create({
      data: {
        organizationId: user.organizationId,
        userId:         user.id,
        auditId:        dto.auditId,
        planItemId:     dto.planItemId,
        workDate:       new Date(dto.workDate),
        hours:          dto.hours,
        description:    dto.description,
      },
    });
    await recalculateAuditActualHours(this.prisma, dto.auditId);
    return entry;
  }

  // ── L2.8: Timesheet — list entries for an audit ──────────────────────────────
  async getTimeEntries(auditId: string, user: AuthUser) {
    return this.prisma.timeEntry.findMany({
      where:   { auditId, organizationId: user.organizationId },
      orderBy: { workDate: 'asc' },
    });
  }

  // ── L2.8: Timesheet — list entries for a plan item ───────────────────────────
  async getPlanItemTimeEntries(planItemId: string, user: AuthUser) {
    return this.prisma.timeEntry.findMany({
      where:   { planItemId, organizationId: user.organizationId },
      orderBy: { workDate: 'asc' },
    });
  }

  // ── L2.8: Timesheet — delete entry ───────────────────────────────────────────
  async deleteTimeEntry(id: string, user: AuthUser) {
    const entry = await this.prisma.timeEntry.findUnique({ where: { id } });
    if (!entry || entry.organizationId !== user.organizationId) throw new NotFoundException();
    if (entry.userId !== user.id) throw new ForbiddenException('Solo puedes eliminar tus propias entradas');
    await this.prisma.timeEntry.delete({ where: { id } });
    await recalculateAuditActualHours(this.prisma, entry.auditId);
    return { deleted: true };
  }

  // ── L2.7: Findings linked to a project (via audit history) ───────────────────
  async getProjectFindings(projectId: string, user: AuthUser) {
    // Find all audits linked to this project's planItems
    const planItems = await this.prisma.auditPlanItem.findMany({
      where:   { auditProjectId: projectId },
      select:  { auditId: true },
    });
    const auditIds = planItems.map(i => i.auditId).filter(Boolean) as string[];

    if (auditIds.length === 0) return [];

    return this.prisma.finding.findMany({
      where:   { auditId: { in: auditIds }, organizationId: user.organizationId },
      orderBy: { createdAt: 'desc' },
      select:  {
        id: true, title: true, condition: true, severity: true,
        status: true, createdAt: true,
        audit: { select: { id: true, title: true, createdAt: true } },
      },
    });
  }
}
