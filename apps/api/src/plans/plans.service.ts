import {
  Injectable, NotFoundException, ForbiddenException, ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/jwt.strategy';
import {
  CreatePlanDto, UpdatePlanDto, CreatePlanItemDto, UpdatePlanItemDto,
} from './dto/plan.dto';

const ITEM_INCLUDE = {
  auditEntity: {
    select: { id: true, name: true, category: true, inherentRiskScore: true, responsible: true },
  },
} as const;

const PLAN_INCLUDE = {
  items: { include: ITEM_INCLUDE, orderBy: { priority: 'asc' as const } },
} as const;

@Injectable()
export class PlansService {
  constructor(private prisma: PrismaService) {}

  // ── Helpers ────────────────────────────────────────────────────────────────
  private calcCapacity(totalHours: number, items: { estimatedHours: number }[]) {
    const allocatedHours = items.reduce((s, i) => s + i.estimatedHours, 0);
    const remainingHours = totalHours - allocatedHours;
    const utilizationPct = totalHours > 0 ? Math.round((allocatedHours / totalHours) * 100) : 0;
    return { allocatedHours, remainingHours, utilizationPct };
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
}
