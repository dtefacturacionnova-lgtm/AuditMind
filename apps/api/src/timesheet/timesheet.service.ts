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
import { recalculateAuditActualHours } from '../audits/audit-hours.util';
import { assertDailyHoursCap } from './daily-hours-cap.util';

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

// Ausencias — no cuentan como "trabajo administrativo" en la vista de asistencia.
const LEAVE_CATEGORIES = new Set<TimeEntryCategory>([
  TimeEntryCategory.VACATION,
  TimeEntryCategory.SICK_LEAVE,
  TimeEntryCategory.PERSONAL_LEAVE,
]);

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

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
        category:       dto.category,
      },
    });
    await recalculateAuditActualHours(this.prisma, dto.auditId);
    return entry;
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

    const hoursByDate = new Map<string, number>();
    for (const entry of dto.entries) {
      hoursByDate.set(entry.workDate, (hoursByDate.get(entry.workDate) ?? 0) + entry.hours);
    }
    await assertDailyHoursCap(this.prisma, user.id, hoursByDate);

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

    const affectedAuditIds = [...new Set(dto.entries.map((e) => e.auditId).filter((v): v is string => !!v))];
    await Promise.all(affectedAuditIds.map((id) => recalculateAuditActualHours(this.prisma, id)));

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
    await recalculateAuditActualHours(this.prisma, entry.auditId);
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

  // ── GET /timesheet/attendance — calendario diario: encargos, administrativas y festivos ──
  async getAttendance(targetUserId: string | undefined, year: number, month: number, user: AuthUser) {
    if (!year || !month) throw new BadRequestException('Los parámetros "year" y "month" son requeridos');

    // Igual criterio que getReport: managers+ pueden ver a cualquiera de la org,
    // el resto solo se ve a sí mismo (se ignora cualquier userId ajeno del query).
    const isManagerPlus = this.isManagerOrAbove(user);
    const userId = isManagerPlus && targetUserId ? targetUserId : user.id;

    const targetUser = await this.prisma.user.findFirst({
      where: { id: userId, organizationId: user.organizationId },
      select: { id: true, name: true },
    });
    if (!targetUser) throw new NotFoundException('Usuario no encontrado en esta organización');

    const monthStart = new Date(Date.UTC(year, month - 1, 1));
    const monthEnd = new Date(Date.UTC(year, month, 1));
    const daysInMonth = Math.round((monthEnd.getTime() - monthStart.getTime()) / 86_400_000);

    const [entries, holidays] = await Promise.all([
      this.prisma.timeEntry.findMany({
        where: { organizationId: user.organizationId, userId, workDate: { gte: monthStart, lt: monthEnd } },
        select: { workDate: true, hours: true, category: true },
      }),
      this.prisma.holidayConfig.findMany({
        where: { organizationId: user.organizationId, active: true, date: { gte: monthStart, lt: monthEnd } },
        select: { date: true, label: true },
      }),
    ]);

    const holidayByDate = new Map(holidays.map((h) => [h.date.toISOString().slice(0, 10), h.label]));
    const entriesByDate = new Map<string, { billable: number; admin: number; leave: number }>();
    for (const e of entries) {
      const key = e.workDate.toISOString().slice(0, 10);
      const bucket = entriesByDate.get(key) ?? { billable: 0, admin: 0, leave: 0 };
      if (AUDIT_LINKED_CATEGORIES.has(e.category)) bucket.billable += e.hours;
      else if (LEAVE_CATEGORIES.has(e.category)) bucket.leave += e.hours;
      else bucket.admin += e.hours;
      entriesByDate.set(key, bucket);
    }

    const todayKey = new Date().toISOString().slice(0, 10);

    const days: {
      date: string; dayOfWeek: number; isWeekend: boolean; isHoliday: boolean; holidayLabel: string | null;
      isFuture: boolean; billableHours: number; adminHours: number; leaveHours: number; totalHours: number; hasGap: boolean;
    }[] = [];
    let totalBillable = 0, totalAdmin = 0, totalLeave = 0, gapDays = 0, holidayDays = 0, weekendDays = 0;

    for (let i = 0; i < daysInMonth; i++) {
      const d = new Date(Date.UTC(year, month - 1, 1 + i));
      const dateKey = d.toISOString().slice(0, 10);
      const dayOfWeek = d.getUTCDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      const isFuture = dateKey > todayKey;
      const holidayLabel = holidayByDate.get(dateKey) ?? null;
      const isHoliday = holidayLabel !== null;
      const bucket = entriesByDate.get(dateKey) ?? { billable: 0, admin: 0, leave: 0 };
      const totalHours = bucket.billable + bucket.admin + bucket.leave;
      const hasGap = !isWeekend && !isHoliday && !isFuture && totalHours === 0;

      totalBillable += bucket.billable;
      totalAdmin += bucket.admin;
      totalLeave += bucket.leave;
      if (isHoliday) holidayDays++;
      else if (isWeekend) weekendDays++;
      if (hasGap) gapDays++;

      days.push({
        date: dateKey, dayOfWeek, isWeekend, isHoliday, holidayLabel, isFuture,
        billableHours: round2(bucket.billable), adminHours: round2(bucket.admin), leaveHours: round2(bucket.leave),
        totalHours: round2(totalHours), hasGap,
      });
    }

    return {
      userId: targetUser.id, userName: targetUser.name, year, month,
      days,
      summary: {
        totalBillable: round2(totalBillable), totalAdmin: round2(totalAdmin), totalLeave: round2(totalLeave),
        holidayDays, weekendDays, gapDays,
      },
    };
  }

  // ── GET /timesheet/distribution — 3 secciones + % para un rango de fechas ───
  // Sección 1 "A Clientes": AUDIT_LINKED_CATEGORIES. Sección 2 "Administrativas":
  // ADMIN/TRAINING/BUSINESS_DEVELOPMENT/OTHER_NON_BILLABLE. Sección 3 "Otras":
  // LEAVE_CATEGORIES + festivos convertidos a horas-equivalente. Mapeo confirmado
  // explícitamente por el usuario (2026-08-22) — Capacitación y Desarrollo de
  // Negocio van en Administrativas, no en Otras.
  async getDistribution(targetUserId: string | undefined, dateFrom: string, dateTo: string, user: AuthUser) {
    if (!dateFrom || !dateTo) throw new BadRequestException('Los parámetros "dateFrom" y "dateTo" son requeridos');

    const isManagerPlus = this.isManagerOrAbove(user);
    const userId = isManagerPlus && targetUserId ? targetUserId : user.id;

    const targetUser = await this.prisma.user.findFirst({
      where: { id: userId, organizationId: user.organizationId },
      select: { id: true, name: true },
    });
    if (!targetUser) throw new NotFoundException('Usuario no encontrado en esta organización');

    const rangeStart = new Date(`${dateFrom}T00:00:00.000Z`);
    const rangeEnd = new Date(`${dateTo}T00:00:00.000Z`);
    rangeEnd.setUTCDate(rangeEnd.getUTCDate() + 1); // inclusivo del último día

    const [entries, holidays] = await Promise.all([
      this.prisma.timeEntry.findMany({
        where: { organizationId: user.organizationId, userId, workDate: { gte: rangeStart, lt: rangeEnd } },
        select: { hours: true, category: true },
      }),
      this.prisma.holidayConfig.findMany({
        where: { organizationId: user.organizationId, active: true, date: { gte: rangeStart, lt: rangeEnd } },
        select: { date: true },
      }),
    ]);

    let clienteHours = 0, administrativasHours = 0, leaveHours = 0;
    for (const e of entries) {
      if (AUDIT_LINKED_CATEGORIES.has(e.category)) clienteHours += e.hours;
      else if (LEAVE_CATEGORIES.has(e.category)) leaveHours += e.hours;
      else administrativasHours += e.hours;
    }

    // Festivos → horas-equivalente, usando standardDailyHours del perfil de
    // disponibilidad del AÑO de cada festivo. Nunca se inventa un default — un
    // festivo cuyo año no tiene perfil configurado se cuenta aparte, no se
    // fuerza a 8h, para no fabricar un número que no está respaldado por datos.
    const holidayYears = [...new Set(holidays.map((h) => h.date.getUTCFullYear()))];
    const profiles = holidayYears.length > 0
      ? await this.prisma.userAvailabilityProfile.findMany({
          where: { organizationId: user.organizationId, userId, year: { in: holidayYears } },
          select: { year: true, standardDailyHours: true },
        })
      : [];
    const dailyHoursByYear = new Map(profiles.map((p) => [p.year, p.standardDailyHours]));

    let holidayHours = 0;
    let holidayDaysWithoutProfile = 0;
    for (const h of holidays) {
      const daily = dailyHoursByYear.get(h.date.getUTCFullYear());
      if (daily !== undefined) holidayHours += daily;
      else holidayDaysWithoutProfile++;
    }

    const otrasHours = leaveHours + holidayHours;
    const totalHours = clienteHours + administrativasHours + otrasHours;
    const pct = (n: number) => (totalHours > 0 ? round2((n / totalHours) * 100) : null);

    return {
      userId: targetUser.id, userName: targetUser.name, dateFrom, dateTo,
      clienteHours: round2(clienteHours),
      administrativasHours: round2(administrativasHours),
      otrasHours: round2(otrasHours),
      otrasBreakdown: {
        leaveHours: round2(leaveHours), holidayHours: round2(holidayHours),
        holidayDays: holidays.length, holidayDaysWithoutProfile,
      },
      totalHours: round2(totalHours),
      pctCliente: pct(clienteHours),
      pctAdministrativas: pct(administrativasHours),
      pctOtras: pct(otrasHours),
    };
  }
}
