import {
  Injectable, NotFoundException, ForbiddenException, ConflictException, BadRequestException,
} from '@nestjs/common';
import { TimeEntryCategory, TimeEntryLogAction } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/jwt.strategy';
import { recalculateAuditActualHours } from '../audits/audit-hours.util';
import { Prisma } from '@prisma/client';
import {
  assertAuditVisible, assertInvestigationAccess, AUDIT_ACCESS_SELECT, canSeeAudit, RESTRICTED_AUDIT_TITLE, visibleAuditWhere,
} from '../common/utils/investigation-scope.util';
import { assertDailyHoursCap, assertValidHours, assertTimeAnchorsInOrg, completeTimeAnchors } from '../timesheet/daily-hours-cap.util';
import { prepareEntryDeletion } from '../collections/invoiced-hours.guard';
import {
  assertPeriodsOpen, validateEntryRules, validateCategoryLinkage, entrySnapshot, logEntryChange, TX_OPTIONS, ENTRY_PUBLIC_SELECT,
} from '../timesheet/hours-close.util';
import {
  CreatePlanDto, UpdatePlanDto, CreatePlanItemDto, UpdatePlanItemDto, ImportFromProjectsDto,
  CreateTimeEntryDto, LinkAuditDto, AddPlanAmendmentDto,
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
      riskCategory: true, legalBasis: true,
    },
  },
  // Horas reales — solo se llena una vez que el ítem se vincula a un encargo real
  // vía linkAudit(). `actualHours` ya se mantiene sincronizado con TimeEntry desde
  // Fase 1 de "Horas y Rentabilidad" (apps/api/src/audits/audit-hours.util.ts).
  audit: {
    // isInvestigationMode + team: solo para decidir si se enmascara (ver `present`); no salen en la respuesta.
    select: { id: true, title: true, status: true, actualHours: true, isInvestigationMode: true, team: { select: { userId: true } } },
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

  /**
   * Modo investigación (2026-10-25): el ítem del plan vinculado a una investigación ajena al equipo del usuario muestra
   * solo «Encargo restringido» (sin estado ni horas reales); el equipo, CAE, ADMIN y SUPER_ADMIN ven el encargo completo.
   * Siempre se quita la lista del equipo de la respuesta.
   */
  private present<P extends { totalHours: number; items: Array<{ estimatedHours: number; audit?: any }> }>(plan: P, user: AuthUser) {
    const items = plan.items.map((i) => {
      const a = i.audit;
      if (!a) return i;
      if (!canSeeAudit(a, user)) return { ...i, audit: { id: a.id, title: RESTRICTED_AUDIT_TITLE, restricted: true } };
      const { team: _team, ...visible } = a;
      return { ...i, audit: visible };
    });
    // Los totales se calculan con lo que este usuario ve: las horas reales de una investigación ajena no suman (si no, restar lo
    // visible del total delataría cuántas horas lleva). Las horas asignadas sí cuentan todas: son del plan, no del encargo.
    const capacity = this.calcCapacity(plan.totalHours, items.map((i) => ({ estimatedHours: i.estimatedHours, audit: i.audit?.restricted ? null : i.audit })));
    return { ...plan, items, ...capacity };
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

    let plan;
    try {
      plan = await this.prisma.auditPlan.create({
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
    } catch (e) {
      if ((e as { code?: string })?.code === 'P2002') throw new ConflictException(`Ya existe un plan para el año ${dto.year}`);
      throw e;
    }

    return this.present(plan, user);
  }

  // ── List plans ─────────────────────────────────────────────────────────────
  async findAll(user: AuthUser) {
    const plans = await this.prisma.auditPlan.findMany({
      where:   { organizationId: user.organizationId },
      include: PLAN_INCLUDE,
      orderBy: { year: 'desc' },
    });
    return plans.map(p => this.present(p, user));
  }

  // ── Get one ────────────────────────────────────────────────────────────────
  async findOne(id: string, user: AuthUser) {
    const plan = await this.getPlanOrThrow(id, user);
    return this.present(plan, user);
  }

  // ── Update plan ────────────────────────────────────────────────────────────
  async update(id: string, dto: UpdatePlanDto, user: AuthUser) {
    const plan = await this.getPlanOrThrow(id, user);
    if (plan.status === 'CLOSED') throw new ForbiddenException('No se puede modificar un plan cerrado');

    const hoursChanged = dto.totalHours != null && dto.totalHours !== plan.totalHours;
    const objectivesChanged = dto.objectives != null && JSON.stringify(dto.objectives) !== JSON.stringify(plan.objectives);

    await this.prisma.$transaction(async (tx) => {
      await tx.auditPlan.update({
        where: { id },
        data: {
          ...(dto.name       != null && { name:       dto.name }),
          ...(dto.totalHours != null && { totalHours: dto.totalHours }),
          ...(dto.objectives != null && { objectives: dto.objectives as any }),
        },
      });
      // Una vez aprobado, lo que cambia deja huella en el historial (antes se podía cambiar la capacidad y los objetivos sin rastro).
      if (plan.status !== 'DRAFT') {
        if (hoursChanged) await this.recordAmendment(tx, id, user, `Horas totales del plan: ${plan.totalHours} → ${dto.totalHours}`, true);
        if (objectivesChanged) await this.recordAmendment(tx, id, user, 'Se modificaron los objetivos del plan', true);
      }
    });
    const updated = await this.prisma.auditPlan.findUniqueOrThrow({ where: { id }, include: PLAN_INCLUDE });
    return this.present(updated, user);
  }

  /** Solo un plan en borrador se puede borrar (con un año equivocado no había forma de corregirlo: la unicidad es por año). */
  async remove(id: string, user: AuthUser) {
    const plan = await this.getPlanOrThrow(id, user);
    if (plan.status !== 'DRAFT') throw new ForbiddenException('Solo se puede eliminar un plan en borrador.');
    const res = await this.prisma.auditPlan.deleteMany({ where: { id, organizationId: user.organizationId, status: 'DRAFT' } });
    if (res.count === 0) throw new ConflictException('El plan cambió de estado y ya no se puede eliminar.');
    return { deleted: true };
  }

  // ── Historial de cambios ───────────────────────────────────────────────────
  /**
   * Agrega un renglón al historial con la fecha del servidor y la persona real. El historial lo escribe SOLO el servidor y se
   * lee-modifica-escribe bajo candado de la fila, así dos gerentes registrando a la vez no se pisan.
   */
  private async recordAmendment(tx: Prisma.TransactionClient, planId: string, user: AuthUser, description: string, auto = false) {
    await tx.$queryRaw`SELECT id FROM audit_plans WHERE id = ${planId} FOR UPDATE`;
    const row = await tx.auditPlan.findUniqueOrThrow({ where: { id: planId }, select: { amendments: true, version: true } });
    const list = Array.isArray(row.amendments) ? (row.amendments as unknown[]) : [];
    const entry = {
      date: new Date().toISOString(), description, approvedBy: user.name, approvedById: user.id, role: user.role, ...(auto && { auto: true }),
    };
    await tx.auditPlan.update({
      where: { id: planId },
      data: { amendments: [...list, entry] as unknown as Prisma.InputJsonValue, version: row.version + 1 },
    });
  }

  async addAmendment(id: string, dto: AddPlanAmendmentDto, user: AuthUser) {
    const plan = await this.getPlanOrThrow(id, user);
    if (plan.status === 'CLOSED') throw new ForbiddenException('No se puede modificar un plan cerrado');
    await this.prisma.$transaction((tx) => this.recordAmendment(tx, id, user, dto.description.trim()));
    return this.findOne(id, user);
  }

  /** Cambio de estado atómico: solo si el plan sigue en el estado esperado (un doble clic o dos gerentes a la vez no lo hacen dos veces). */
  private async transition(id: string, from: string, data: Prisma.AuditPlanUpdateManyMutationInput, user: AuthUser, message: string) {
    const res = await this.prisma.auditPlan.updateMany({ where: { id, organizationId: user.organizationId, status: from }, data });
    if (res.count === 0) throw new ConflictException(message);
    const updated = await this.prisma.auditPlan.findUniqueOrThrow({ where: { id }, include: PLAN_INCLUDE });
    return this.present(updated, user);
  }

  // ── Approve plan ───────────────────────────────────────────────────────────
  async approve(id: string, user: AuthUser) {
    const plan = await this.getPlanOrThrow(id, user);
    if (plan.status !== 'DRAFT') throw new ForbiddenException('Solo se puede aprobar un plan en DRAFT');
    return this.transition(id, 'DRAFT', { status: 'APPROVED', approvedById: user.id, approvedAt: new Date() }, user, 'El plan ya fue aprobado.');
  }

  // ── Activate plan ──────────────────────────────────────────────────────────
  async activate(id: string, user: AuthUser) {
    const plan = await this.getPlanOrThrow(id, user);
    if (plan.status !== 'APPROVED') throw new ForbiddenException('Solo se puede activar un plan APPROVED');
    return this.transition(id, 'APPROVED', { status: 'ACTIVE' }, user, 'El plan ya fue activado.');
  }

  // ── Close plan ─────────────────────────────────────────────────────────────
  async close(id: string, user: AuthUser) {
    const plan = await this.getPlanOrThrow(id, user);
    if (plan.status !== 'ACTIVE') throw new ForbiddenException('Solo se puede cerrar un plan ACTIVE');
    return this.transition(id, 'ACTIVE', { status: 'CLOSED' }, user, 'El plan ya fue cerrado.');
  }

  // ── Add item ───────────────────────────────────────────────────────────────
  async addItem(planId: string, dto: CreatePlanItemDto, user: AuthUser) {
    const plan = await this.getPlanOrThrow(planId, user);
    if (plan.status === 'CLOSED') throw new ForbiddenException('No se puede modificar un plan cerrado');
    this.assertDates(dto.tentativeStartDate, dto.tentativeEndDate);

    // Check entity belongs to org
    const entity = await this.prisma.auditEntity.findFirst({
      where: { id: dto.auditEntityId, organizationId: user.organizationId },
    });
    if (!entity) throw new NotFoundException('Entidad no encontrada');

    // Bajo candado del plan: dos altas a la vez de la misma entidad no crean dos ítems.
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM audit_plans WHERE id = ${planId} FOR UPDATE`;
      const existing = await tx.auditPlanItem.findFirst({ where: { planId, auditEntityId: dto.auditEntityId }, select: { id: true } });
      if (existing) throw new ConflictException('Esta entidad ya está en el plan');
      await tx.auditPlanItem.create({
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
      if (plan.status !== 'DRAFT') await this.recordAmendment(tx, planId, user, `Se agregó «${entity.name}» al plan (${dto.estimatedHours} h)`, true);
    });

    return this.findOne(planId, user);
  }

  /** La fecha de fin no puede ser anterior a la de inicio. */
  private assertDates(start?: string | null, end?: string | null) {
    if (start && end && new Date(end) < new Date(start)) {
      throw new BadRequestException('La fecha de fin no puede ser anterior a la de inicio.');
    }
  }

  // ── Update item ────────────────────────────────────────────────────────────
  async updateItem(planId: string, itemId: string, dto: UpdatePlanItemDto, user: AuthUser) {
    const plan = await this.getPlanOrThrow(planId, user);
    if (plan.status === 'CLOSED') throw new ForbiddenException('No se puede modificar un plan cerrado');

    const item = plan.items.find(i => i.id === itemId);
    if (!item) throw new NotFoundException('Item no encontrado en el plan');
    this.assertDates(
      dto.tentativeStartDate ?? item.tentativeStartDate?.toISOString(),
      dto.tentativeEndDate ?? item.tentativeEndDate?.toISOString(),
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.auditPlanItem.update({
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
      if (plan.status !== 'DRAFT' && dto.estimatedHours != null && dto.estimatedHours !== item.estimatedHours) {
        const name = item.auditProject?.name ?? item.auditEntity?.name ?? 'un ítem';
        await this.recordAmendment(tx, planId, user, `Horas de «${name}»: ${item.estimatedHours} → ${dto.estimatedHours}`, true);
      }
    });

    return this.findOne(planId, user);
  }

  // ── Remove item ────────────────────────────────────────────────────────────
  async removeItem(planId: string, itemId: string, user: AuthUser) {
    const plan = await this.getPlanOrThrow(planId, user);
    if (plan.status === 'CLOSED') throw new ForbiddenException('No se puede modificar un plan cerrado');

    const item = plan.items.find(i => i.id === itemId);
    if (!item) throw new NotFoundException('Item no encontrado en el plan');
    // Borrar el ítem soltaría la investigación del plan: lo mismo que desvincularla.
    if (item.audit) assertInvestigationAccess(item.audit, user);

    await this.prisma.$transaction(async (tx) => {
      await tx.auditPlanItem.delete({ where: { id: itemId } });
      if (plan.status !== 'DRAFT') {
        const name = item.auditProject?.name ?? item.auditEntity?.name ?? 'un ítem';
        await this.recordAmendment(tx, planId, user, `Se quitó «${name}» del plan (${item.estimatedHours} h)`, true);
      }
    });
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
    // Reemplazar el vínculo de una investigación ajena la sacaría del plan sin que quien lo hace pueda ni verla.
    if (item.audit) assertInvestigationAccess(item.audit, user);

    const audit = await this.prisma.audit.findFirst({
      where: { id: dto.auditId, ...visibleAuditWhere(user) }, // una investigación ajena se trata como si no existiera
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
    // Una sola definición de «horas del ítem»: las anotadas al ítem pasan al encargo y las del encargo al ítem (solo en meses abiertos:
    // un mes cerrado no se toca). Antes el plan mostraba las horas del encargo y el reporte «por plan» las del ítem, y no coincidían.
    await this.prisma.timeEntry.updateMany({ where: { planItemId: itemId, auditId: null, closedAt: null }, data: { auditId: dto.auditId } });
    await this.prisma.timeEntry.updateMany({ where: { auditId: dto.auditId, planItemId: null, closedAt: null }, data: { planItemId: itemId } });
    await recalculateAuditActualHours(this.prisma, dto.auditId);

    return this.findOne(planId, user);
  }

  async unlinkAudit(planId: string, itemId: string, user: AuthUser) {
    const plan = await this.getPlanOrThrow(planId, user);
    if (plan.status === 'CLOSED') throw new ForbiddenException('No se puede modificar un plan cerrado');

    const item = plan.items.find((i) => i.id === itemId);
    if (!item) throw new NotFoundException('Item no encontrado en el plan');
    // Desvincular una investigación ajena la sacaría del plan sin que quien lo hace pueda ni verla.
    if (item.audit) assertInvestigationAccess(item.audit, user);

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
      where: { ...visibleAuditWhere(user), planItem: null, status: { notIn: ['CLOSED', 'CANCELLED'] } },
      select: { id: true, title: true, status: true, actualHours: true },
      orderBy: { title: 'asc' },
    });
  }

  // ── Import from Banco de Proyectos ─────────────────────────────────────────
  async importFromProjects(planId: string, dto: ImportFromProjectsDto, user: AuthUser) {
    const plan = await this.getPlanOrThrow(planId, user);
    if (plan.status === 'CLOSED') throw new ForbiddenException('No se puede modificar un plan cerrado');

    const projectIds = [...new Set(dto.projectIds)];
    // Fetch the requested projects, verifying org ownership
    const projects = await this.prisma.auditProject.findMany({
      where: {
        id:             { in: projectIds },
        organizationId: user.organizationId,
        active:         true,
      },
    });

    // Bajo candado del plan y releyendo los ítems DENTRO: dos importaciones a la vez del mismo proyecto no lo duplican
    // (antes se sumaban sus horas dos veces en la capacidad).
    const { imported, skipped } = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM audit_plans WHERE id = ${planId} FOR UPDATE`;
      const current = await tx.auditPlanItem.findMany({ where: { planId, auditProjectId: { not: null } }, select: { auditProjectId: true } });
      const alreadyImported = new Set(current.map((i) => i.auditProjectId as string));

      let imported = 0;
      let skipped = 0;
      for (const project of projects) {
        if (alreadyImported.has(project.id)) { skipped++; continue; }

        // Map risk level → priority (CRITICO/ALTO → 1, MEDIO → 2, BAJO → 3)
        const priority =
          project.finalRiskLevel === 'CRITICO' || project.finalRiskLevel === 'ALTO' ? 1
          : project.finalRiskLevel === 'MEDIO' ? 2
          : 3;

        await tx.auditPlanItem.create({
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
      if (plan.status !== 'DRAFT' && imported > 0) {
        await this.recordAmendment(tx, planId, user, `Se importaron ${imported} proyecto(s) del Banco al plan`, true);
      }
      return { imported, skipped };
    });

    const updated = await this.findOne(planId, user);
    return { ...updated, importResult: { imported, skipped, notFound: projectIds.length - projects.length } };
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
      orderBy: [{ finalRiskScore: { sort: 'desc', nulls: 'last' } }, { name: 'asc' }],
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
  async createTimeEntry(rawDto: CreateTimeEntryDto, user: AuthUser) {
    const category = rawDto.category ?? TimeEntryCategory.CLIENT_BILLABLE;
    // Mismas reglas que la captura general: una hora de cliente necesita encargo o ítem de plan (antes se guardaba sin ninguno), y la
    // categoría que declara el cuerpo se respeta (antes se ignoraba y siempre quedaba como facturable).
    const linkError = validateCategoryLinkage({ category, auditId: rawDto.auditId, planItemId: rawDto.planItemId });
    if (linkError) throw new BadRequestException(linkError);
    assertValidHours(rawDto.hours);
    await assertTimeAnchorsInOrg(this.prisma, user, [rawDto]);
    const anchors = await completeTimeAnchors(this.prisma, rawDto);
    const dto = { ...rawDto, ...anchors, category };
    await assertDailyHoursCap(this.prisma, user.id, new Map([[dto.workDate, dto.hours]]));

    // Misma comprobación de mes cerrado y misma bitácora que la captura general (TimesheetService): son las dos rutas que escriben horas.
    const entry = await this.prisma.$transaction(async (tx) => {
      const settings = await assertPeriodsOpen(tx, user.organizationId, user.id, [dto.workDate]);
      const ruleError = validateEntryRules({ category: dto.category, description: dto.description }, settings.enabled);
      if (ruleError) throw new BadRequestException(ruleError);
      const created = await tx.timeEntry.create({
        data: {
          organizationId: user.organizationId,
          userId:         user.id,
          auditId:        dto.auditId,
          planItemId:     dto.planItemId,
          workDate:       new Date(dto.workDate),
          hours:          dto.hours,
          description:    dto.description,
          category:       dto.category,
        },
      });
      await logEntryChange(tx, {
        organizationId: user.organizationId, userId: user.id, actorId: user.id,
        action: TimeEntryLogAction.CREATE, timeEntryId: created.id, after: entrySnapshot(created),
      });
      return created;
    }, TX_OPTIONS);
    await recalculateAuditActualHours(this.prisma, dto.auditId);
    return entry;
  }

  // ── L2.8: Timesheet — list entries for an audit ──────────────────────────────
  async getTimeEntries(auditId: string, user: AuthUser) {
    await assertAuditVisible(this.prisma, auditId, user); // modo investigación (2026-10-25): quién trabajó y qué hizo
    return this.prisma.timeEntry.findMany({
      where:   { auditId, organizationId: user.organizationId },
      orderBy: { workDate: 'asc' },
      select:  ENTRY_PUBLIC_SELECT, // sin costo/tarifa congelados: el costo por hora sale del salario de cada persona
    });
  }

  // ── L2.8: Timesheet — list entries for a plan item ───────────────────────────
  async getPlanItemTimeEntries(planItemId: string, user: AuthUser) {
    const item = await this.prisma.auditPlanItem.findUnique({
      where: { id: planItemId }, select: { plan: { select: { organizationId: true } }, audit: { select: AUDIT_ACCESS_SELECT } },
    });
    if (!item || item.plan.organizationId !== user.organizationId) throw new NotFoundException('Item no encontrado');
    if (item.audit) assertInvestigationAccess(item.audit, user);
    return this.prisma.timeEntry.findMany({
      where:   { planItemId, organizationId: user.organizationId },
      orderBy: { workDate: 'asc' },
      select:  ENTRY_PUBLIC_SELECT,
    });
  }

  // ── L2.8: Timesheet — delete entry ───────────────────────────────────────────
  async deleteTimeEntry(id: string, user: AuthUser) {
    const entry = await this.prisma.timeEntry.findUnique({ where: { id } });
    if (!entry || entry.organizationId !== user.organizationId) throw new NotFoundException();
    if (entry.userId !== user.id) throw new ForbiddenException('Solo puedes eliminar tus propias entradas');
    await this.prisma.$transaction(async (tx) => {
      await assertPeriodsOpen(tx, user.organizationId, user.id, [entry.workDate]);
      await prepareEntryDeletion(tx, user.organizationId, [id], { showInvoice: false });
      await tx.timeEntry.delete({ where: { id } });
      await logEntryChange(tx, {
        organizationId: user.organizationId, userId: user.id, actorId: user.id,
        action: TimeEntryLogAction.DELETE, timeEntryId: id, before: entrySnapshot(entry),
      });
    }, TX_OPTIONS);
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
      // Modo investigación (2026-10-25): los hallazgos de una investigación ajena no se listan por el proyecto.
      where:   { auditId: { in: auditIds }, organizationId: user.organizationId, audit: visibleAuditWhere(user) },
      orderBy: { createdAt: 'desc' },
      select:  {
        id: true, title: true, condition: true, severity: true,
        status: true, createdAt: true,
        audit: { select: { id: true, title: true, createdAt: true } },
      },
    });
  }
}
