import {
  Injectable, NotFoundException, ForbiddenException, BadRequestException,
} from '@nestjs/common';
import { TimeEntryCategory } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/jwt.strategy';
import {
  CreateTimesheetEntryDto, BulkCreateTimesheetEntryDto,
  QueryTimesheetEntriesDto, QueryTimesheetReportDto, TimesheetReportGroupBy,
} from './dto/timesheet.dto';

// Mismo criterio de jerarquía que RolesGuard (apps/api/src/common/guards/roles.guard.ts).
// Se replica aquí (en vez de importarlo) porque el guard no lo exporta — solo lo usa internamente.
const ROLE_HIERARCHY: Record<string, number> = {
  SUPER_ADMIN: 100,
  ADMIN: 90,
  CAE: 80,
  AUDIT_MANAGER: 70,
  SENIOR_AUDITOR: 60,
  AUDITOR: 50,
  AUDITEE: 20,
  READ_ONLY: 10,
};

// Categorías que cuelgan de un encargo/ítem de plan (facturables o no al cliente).
const AUDIT_LINKED_CATEGORIES = new Set<TimeEntryCategory>([
  TimeEntryCategory.CLIENT_BILLABLE,
  TimeEntryCategory.CLIENT_NON_BILLABLE,
]);

@Injectable()
export class TimesheetService {
  constructor(private prisma: PrismaService) {}

  // ── Helpers ────────────────────────────────────────────────────────────────
  private isManagerOrAbove(user: AuthUser): boolean {
    return (ROLE_HIERARCHY[user.role] ?? 0) >= ROLE_HIERARCHY.AUDIT_MANAGER;
  }

  /**
   * Regla XOR de negocio (no se puede expresar en el esquema Prisma):
   * - Categorías ligadas a cliente (CLIENT_BILLABLE / CLIENT_NON_BILLABLE) requieren
   *   al menos un ancla (auditId o planItemId).
   * - El resto de categorías (ADMIN, TRAINING, VACATION, etc.) no puede traer ninguna
   *   de las dos — esas horas no cuelgan de ningún encargo.
   * Devuelve un mensaje de error si la entrada es inválida, o null si es válida.
   */
  private validateCategoryLinkage(dto: {
    category: TimeEntryCategory; auditId?: string; planItemId?: string;
  }): string | null {
    const hasAnchor = !!dto.auditId || !!dto.planItemId;
    if (AUDIT_LINKED_CATEGORIES.has(dto.category)) {
      if (!hasAnchor) {
        return `La categoría ${dto.category} requiere auditId o planItemId`;
      }
    } else if (hasAnchor) {
      return `La categoría ${dto.category} no admite auditId ni planItemId (horas no ligadas a un encargo)`;
    }
    return null;
  }

  // ── POST /timesheet/entries ───────────────────────────────────────────────
  async createEntry(dto: CreateTimesheetEntryDto, user: AuthUser) {
    const error = this.validateCategoryLinkage(dto);
    if (error) throw new BadRequestException(error);

    return this.prisma.timeEntry.create({
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
  }

  // ── POST /timesheet/entries/bulk ──────────────────────────────────────────
  async createEntriesBulk(dto: BulkCreateTimesheetEntryDto, user: AuthUser) {
    const errors: { index: number; error: string }[] = [];
    dto.entries.forEach((entry, index) => {
      const error = this.validateCategoryLinkage(entry);
      if (error) errors.push({ index, error });
    });

    if (errors.length > 0) {
      throw new BadRequestException({
        message: 'Una o más entradas del lote son inválidas',
        errors,
      });
    }

    const result = await this.prisma.timeEntry.createMany({
      data: dto.entries.map((entry) => ({
        organizationId: user.organizationId,
        userId:         user.id,
        auditId:        entry.auditId,
        planItemId:     entry.planItemId,
        workDate:       new Date(entry.workDate),
        hours:          entry.hours,
        description:    entry.description,
        category:       entry.category,
      })),
    });

    return { created: result.count };
  }

  // ── GET /timesheet/entries ────────────────────────────────────────────────
  async getMyEntries(query: QueryTimesheetEntriesDto, user: AuthUser) {
    const where: any = {
      organizationId: user.organizationId,
      userId:         user.id,
    };
    if (query.dateFrom || query.dateTo) {
      where.workDate = {};
      if (query.dateFrom) where.workDate.gte = new Date(query.dateFrom);
      if (query.dateTo)   where.workDate.lte = new Date(query.dateTo);
    }
    if (query.category) where.category = query.category;
    if (query.auditId)  where.auditId = query.auditId;

    return this.prisma.timeEntry.findMany({ where, orderBy: { workDate: 'desc' } });
  }

  // ── DELETE /timesheet/entries/:id ─────────────────────────────────────────
  async deleteEntry(id: string, user: AuthUser) {
    const entry = await this.prisma.timeEntry.findUnique({ where: { id } });
    if (!entry || entry.organizationId !== user.organizationId) throw new NotFoundException();
    if (entry.userId !== user.id) throw new ForbiddenException('Solo puedes eliminar tus propias entradas');
    await this.prisma.timeEntry.delete({ where: { id } });
    return { deleted: true };
  }

  // ── GET /timesheet/my-assignments ─────────────────────────────────────────
  async getMyAssignments(user: AuthUser) {
    return this.prisma.auditTeam.findMany({
      where:   { userId: user.id },
      include: { audit: { select: { id: true, title: true } } },
      orderBy: { assignedAt: 'desc' },
    });
  }

  // ── GET /timesheet/report ─────────────────────────────────────────────────
  async getReport(query: QueryTimesheetReportDto, user: AuthUser) {
    const isManagerPlus = this.isManagerOrAbove(user);

    const where: any = { organizationId: user.organizationId };
    if (isManagerPlus) {
      if (query.userId) where.userId = query.userId;
    } else {
      // Auditores rasos solo ven su propio consolidado — se ignora cualquier userId del query.
      where.userId = user.id;
    }
    if (query.dateFrom || query.dateTo) {
      where.workDate = {};
      if (query.dateFrom) where.workDate.gte = new Date(query.dateFrom);
      if (query.dateTo)   where.workDate.lte = new Date(query.dateTo);
    }
    if (query.category) where.category = query.category;
    if (query.auditId)  where.auditId = query.auditId;

    if (query.groupBy === TimesheetReportGroupBy.PLAN) {
      if (!query.planId) throw new BadRequestException('planId es requerido para groupBy=plan');
      const planItems = await this.prisma.auditPlanItem.findMany({
        where:  { planId: query.planId },
        select: { id: true },
      });
      where.planItemId = { in: planItems.map((i) => i.id) };
    }

    // Totales generales (facturable vs no facturable) sobre el mismo filtro,
    // independientes de la dimensión de agrupación elegida.
    const categoryTotals = await this.prisma.timeEntry.groupBy({
      by: ['category'],
      where,
      _sum: { hours: true },
    });
    let billableHours = 0;
    let nonBillableHours = 0;
    for (const row of categoryTotals) {
      const hours = row._sum.hours ?? 0;
      if (row.category === TimeEntryCategory.CLIENT_BILLABLE) billableHours += hours;
      else nonBillableHours += hours;
    }
    const totals = {
      billableHours,
      nonBillableHours,
      totalHours: billableHours + nonBillableHours,
    };

    let breakdown: any[];

    switch (query.groupBy) {
      case TimesheetReportGroupBy.USER: {
        const rows = await this.prisma.timeEntry.groupBy({
          by: ['userId', 'category'],
          where,
          _sum: { hours: true },
        });
        const userIds = [...new Set(rows.map((r) => r.userId))];
        const users = await this.prisma.user.findMany({
          where:  { id: { in: userIds } },
          select: { id: true, name: true, email: true },
        });
        breakdown = rows.map((r) => ({
          userId:   r.userId,
          userName: users.find((u) => u.id === r.userId)?.name ?? r.userId,
          category: r.category,
          hours:    r._sum.hours ?? 0,
        }));
        break;
      }

      case TimesheetReportGroupBy.AUDIT: {
        const rows = await this.prisma.timeEntry.groupBy({
          by: ['auditId', 'category'],
          where,
          _sum: { hours: true },
        });
        const auditIds = [...new Set(rows.map((r) => r.auditId).filter((v): v is string => !!v))];
        const audits = await this.prisma.audit.findMany({
          where:  { id: { in: auditIds } },
          select: { id: true, title: true },
        });
        breakdown = rows.map((r) => ({
          auditId:    r.auditId,
          auditTitle: r.auditId ? (audits.find((a) => a.id === r.auditId)?.title ?? r.auditId) : 'Sin encargo',
          category:   r.category,
          hours:      r._sum.hours ?? 0,
        }));
        break;
      }

      case TimesheetReportGroupBy.PLAN: {
        const rows = await this.prisma.timeEntry.groupBy({
          by: ['planItemId', 'category'],
          where,
          _sum: { hours: true },
        });
        const planItemIds = [...new Set(rows.map((r) => r.planItemId).filter((v): v is string => !!v))];
        const planItems = await this.prisma.auditPlanItem.findMany({
          where:  { id: { in: planItemIds } },
          include: {
            auditEntity:  { select: { id: true, name: true } },
            auditProject: { select: { id: true, name: true, correlative: true } },
          },
        });
        breakdown = rows.map((r) => {
          const item = r.planItemId ? planItems.find((p) => p.id === r.planItemId) : undefined;
          const label = item
            ? (item.auditProject?.name ?? item.auditEntity?.name ?? item.id)
            : 'Sin ítem de plan';
          return {
            planItemId:    r.planItemId,
            planItemLabel: label,
            category:      r.category,
            hours:         r._sum.hours ?? 0,
          };
        });
        break;
      }

      case TimesheetReportGroupBy.DATE:
      default: {
        const entries = await this.prisma.timeEntry.findMany({
          where,
          select: { workDate: true, hours: true, category: true },
        });
        const map = new Map<string, Map<TimeEntryCategory, number>>();
        for (const e of entries) {
          const dateKey = e.workDate.toISOString().slice(0, 10);
          if (!map.has(dateKey)) map.set(dateKey, new Map());
          const catMap = map.get(dateKey)!;
          catMap.set(e.category, (catMap.get(e.category) ?? 0) + e.hours);
        }
        breakdown = [];
        for (const [date, catMap] of [...map.entries()].sort(([a], [b]) => a.localeCompare(b))) {
          for (const [category, hours] of catMap.entries()) {
            breakdown.push({ date, category, hours });
          }
        }
        break;
      }
    }

    return { groupBy: query.groupBy, breakdown, totals };
  }
}
