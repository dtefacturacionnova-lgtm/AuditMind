import {
  BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException,
} from '@nestjs/common';
import {
  NonBillableReason, Prisma, TimeAdjustmentAction, TimeAdjustmentStatus, TimeEntryCategory, TimeEntryLogAction,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService, escHtml } from '../email/email.service';
import { AuthUser } from '../auth/jwt.strategy';
import { hiddenAuditIds, RESTRICTED_AUDIT_TITLE } from '../common/utils/investigation-scope.util';
import { recalculateAuditActualHours } from '../audits/audit-hours.util';
import { assertEntryNotInvoiced, assertPersonMonthNotInvoiced, lockPersonMonthEntries, lockTimeEntryRows } from '../collections/invoiced-hours.guard';
import { assertDailyHoursCap, assertTimeAnchorsInOrg, assertValidHours, completeTimeAnchors } from './daily-hours-cap.util';
import {
  ClosePeriodDto, CreateAdjustmentDto, DecideAdjustmentDto, HoursCloseSettingsDto, QueryAdjustmentsDto, RemindPeriodDto,
  ReopenPeriodDto,
} from './dto/timesheet.dto';
import {
  CLIENT_CATEGORIES, Db, HoursCloseSettingsView, MANAGER_RANK, PeriodKey, TX_OPTIONS, assertCanCloseFor, assertPeriodsOpen,
  entrySnapshot, loadCloseSettings, lockPeriods, logEntryChange, mergeEntryChanges, periodKeyOf, periodLabel, periodRange,
  rankOf, validateCategoryLinkage, validateEntryRules, DIRECTION_RANK, ENTRY_PUBLIC_SELECT, loadHolidaySet,
} from './hours-close.util';
import {
  businessDaysOf, isPeriodFinished, nextPeriod, nthBusinessDay, todayInSalvador,
} from './hours-close.calendar';

const LEAVE_CATEGORIES = new Set<TimeEntryCategory>([
  TimeEntryCategory.VACATION, TimeEntryCategory.SICK_LEAVE, TimeEntryCategory.PERSONAL_LEAVE,
]);
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const LONG_DAY_HOURS = 12;
const LOW_RATIO = 0.8;
const HIGH_RATIO = 1.2;
/** Roles que registran horas: de auditor para arriba. */
const TIME_TRACKING_RANK = 50;

export type WarningCode =
  | 'MISSING_DAYS' | 'HOURS_LOW' | 'HOURS_HIGH' | 'LONG_DAYS' | 'NO_DESCRIPTION' | 'NO_COST_PROFILE' | 'NO_AVAILABILITY_PROFILE';
export interface PeriodWarning { code: WarningCode; detail: string }

export interface PeriodPersonRow {
  userId: string; name: string; email: string; role: string; active: boolean;
  businessDays: number; daysWithHours: number; missingDays: string[];
  totalHours: number; billableHours: number; clientNonBillableHours: number; adminHours: number; leaveHours: number;
  availableHours: number | null; billableUtilizationPct: number | null;
  warnings: PeriodWarning[];
  status: 'OPEN' | 'CLOSED'; closedAt: Date | null; closedByName: string | null; reopenedAt: Date | null;
  pendingAdjustments: number; canClose: boolean; canReopen: boolean;
}

@Injectable()
export class HoursCloseService {
  private readonly logger = new Logger(HoursCloseService.name);

  constructor(private readonly prisma: PrismaService, private readonly email: EmailService) {}

  // ── Parámetros ─────────────────────────────────────────────────────────────
  getSettings(user: AuthUser): Promise<HoursCloseSettingsView> {
    return loadCloseSettings(this.prisma, user.organizationId);
  }

  async updateSettings(dto: HoursCloseSettingsDto, user: AuthUser): Promise<HoursCloseSettingsView> {
    if (rankOf(user.role) < DIRECTION_RANK) throw new ForbiddenException('Solo la dirección cambia los parámetros del cierre de horas.');
    if (dto.closeDeadlineDay < dto.entryDeadlineDay) {
      throw new BadRequestException('El plazo del gerente no puede ser anterior al plazo del auditor.');
    }
    // Apagar el cierre soltaría la protección de las horas ya facturadas (se podrían editar por la captura normal).
    if (!dto.enabled) {
      const invoiced = await this.prisma.clientInvoiceHour.count({ where: { organizationId: user.organizationId, releasedAt: null } });
      if (invoiced > 0) {
        throw new ConflictException(`Hay ${invoiced} hora(s) en facturas vigentes: anula esas facturas antes de apagar el cierre de horas.`);
      }
    }
    const row = await this.prisma.hoursCloseSettings.upsert({
      where: { organizationId: user.organizationId },
      create: { organizationId: user.organizationId, enabled: dto.enabled, entryDeadlineDay: dto.entryDeadlineDay, closeDeadlineDay: dto.closeDeadlineDay, updatedById: user.id },
      update: { enabled: dto.enabled, entryDeadlineDay: dto.entryDeadlineDay, closeDeadlineDay: dto.closeDeadlineDay, updatedById: user.id },
    });
    return { enabled: row.enabled, entryDeadlineDay: row.entryDeadlineDay, closeDeadlineDay: row.closeDeadlineDay };
  }

  // ── Mi estado (la captura de horas) ───────────────────────────────────────
  async getMyPeriods(dateFrom: string, dateTo: string, user: AuthUser) {
    const settings = await loadCloseSettings(this.prisma, user.organizationId);
    const from = periodKeyOf(dateFrom);
    const to = periodKeyOf(dateTo);
    const closed = settings.enabled
      ? await this.prisma.hoursPeriodClose.findMany({
        where: {
          organizationId: user.organizationId, userId: user.id, status: 'CLOSED',
          OR: this.monthsBetween(from, to).map((p) => ({ year: p.year, month: p.month })),
        },
        select: { year: true, month: true, closedAt: true, closedById: true },
        orderBy: [{ year: 'asc' }, { month: 'asc' }],
      })
      : [];
    const pendingAdjustments = settings.enabled
      ? await this.prisma.timeAdjustmentRequest.count({ where: { organizationId: user.organizationId, userId: user.id, status: 'PENDING' } })
      : 0;
    return { ...settings, closed, pendingAdjustments };
  }

  private monthsBetween(from: PeriodKey, to: PeriodKey): PeriodKey[] {
    const out: PeriodKey[] = [];
    let cur = from;
    for (let i = 0; i < 24; i++) {
      out.push(cur);
      if (periodLabel(cur) >= periodLabel(to)) break;
      cur = nextPeriod(cur);
    }
    return out;
  }

  // ── Resumen del mes para el gerente ───────────────────────────────────────
  async overview(year: number, month: number, user: AuthUser) {
    this.assertManager(user);
    const period = { year, month };
    const today = todayInSalvador();
    const { rows, settings, entryDeadline, closeDeadline } = await this.buildRows(user, period, today);
    const summary = {
      people: rows.length,
      closed: rows.filter((r) => r.status === 'CLOSED').length,
      withWarnings: rows.filter((r) => r.warnings.length > 0).length,
      pendingAdjustments: rows.reduce((n, r) => n + r.pendingAdjustments, 0),
    };
    return {
      year, month, enabled: settings.enabled, finished: isPeriodFinished(period, today),
      entryDeadline, closeDeadline, today, summary, rows,
    };
  }

  /** Construye la fila de cada persona del mes. Lo usan el resumen, los recordatorios y la tarea programada. */
  async buildRows(actor: { id: string; role: string; organizationId: string }, period: PeriodKey, today: string) {
    const orgId = actor.organizationId;
    const range = periodRange(period);
    const nextRange = periodRange(nextPeriod(period));
    const settings = await loadCloseSettings(this.prisma, orgId);

    const [entries, holidaySet, availability, costProfiles, closes, pending] = await Promise.all([
      this.prisma.timeEntry.findMany({
        where: { organizationId: orgId, workDate: { gte: range.gte, lt: range.lt } },
        select: { userId: true, workDate: true, hours: true, category: true, description: true },
      }),
      loadHolidaySet(this.prisma, orgId, { gte: range.gte, lt: nextRange.lt }),
      this.prisma.userAvailabilityProfile.findMany({
        where: { organizationId: orgId, year: period.year }, select: { userId: true, standardDailyHours: true },
      }),
      this.prisma.userCostProfile.findMany({
        where: { organizationId: orgId, year: period.year }, select: { userId: true },
      }),
      this.prisma.hoursPeriodClose.findMany({
        where: { organizationId: orgId, year: period.year, month: period.month },
      }),
      this.prisma.timeAdjustmentRequest.groupBy({
        by: ['userId'], where: { organizationId: orgId, status: 'PENDING', year: period.year, month: period.month }, _count: { _all: true },
      }),
    ]);

    const userIdsWithEntries = new Set(entries.map((e) => e.userId));
    const users = await this.prisma.user.findMany({
      where: {
        organizationId: orgId,
        OR: [{ active: true }, { id: { in: [...userIdsWithEntries] } }],
      },
      select: { id: true, name: true, email: true, role: true, active: true },
      orderBy: { name: 'asc' },
    });
    const people = users.filter((u) => rankOf(u.role) >= TIME_TRACKING_RANK);

    const closerIds = [...new Set(closes.map((c) => c.closedById).filter((v): v is string => !!v))];
    const closers = closerIds.length > 0
      ? await this.prisma.user.findMany({ where: { id: { in: closerIds }, organizationId: orgId }, select: { id: true, name: true } })
      : [];
    const closerName = new Map(closers.map((u) => [u.id, u.name]));

    const businessDays = businessDaysOf(period, holidaySet);
    const dueDays = businessDays.filter((d) => d <= today);
    const dailyHours = new Map(availability.map((a) => [a.userId, a.standardDailyHours]));
    const withCost = new Set(costProfiles.map((c) => c.userId));
    const closeByUser = new Map(closes.map((c) => [c.userId, c]));
    const pendingByUser = new Map(pending.map((p) => [p.userId, p._count._all]));

    const entriesByUser = new Map<string, typeof entries>();
    for (const e of entries) {
      const list = entriesByUser.get(e.userId) ?? [];
      list.push(e);
      entriesByUser.set(e.userId, list);
    }

    const rows: PeriodPersonRow[] = people.map((person) => {
      const mine = entriesByUser.get(person.id) ?? [];
      const hoursByDay = new Map<string, number>();
      let billable = 0, clientNonBillable = 0, admin = 0, leave = 0, noDescription = 0;
      for (const e of mine) {
        const key = e.workDate.toISOString().slice(0, 10);
        hoursByDay.set(key, (hoursByDay.get(key) ?? 0) + e.hours);
        if (e.category === TimeEntryCategory.CLIENT_BILLABLE) billable += e.hours;
        else if (e.category === TimeEntryCategory.CLIENT_NON_BILLABLE) clientNonBillable += e.hours;
        else if (LEAVE_CATEGORIES.has(e.category)) leave += e.hours;
        else admin += e.hours;
        if (CLIENT_CATEGORIES.has(e.category) && (e.description ?? '').trim().length === 0) noDescription++;
      }
      const totalHours = billable + clientNonBillable + admin + leave;
      const missingDays = dueDays.filter((d) => !(hoursByDay.get(d) ?? 0));
      const daysWithHours = businessDays.filter((d) => (hoursByDay.get(d) ?? 0) > 0).length;
      const longDays = [...hoursByDay.values()].filter((h) => h > LONG_DAY_HOURS).length;
      const daily = dailyHours.get(person.id);
      const availableHours = daily !== undefined ? round2(businessDays.length * daily) : null;

      const warnings: PeriodWarning[] = [];
      if (missingDays.length > 0) warnings.push({ code: 'MISSING_DAYS', detail: `${missingDays.length} día(s) hábil(es) sin horas` });
      if (availableHours === null) {
        if (totalHours > 0) warnings.push({ code: 'NO_AVAILABILITY_PROFILE', detail: 'Sin perfil de disponibilidad de ese año: no se puede comparar contra las horas disponibles' });
      } else if (availableHours > 0 && totalHours < availableHours * LOW_RATIO) {
        warnings.push({ code: 'HOURS_LOW', detail: `${round2(totalHours)} h de ${availableHours} h disponibles (menos del 80 %)` });
      } else if (availableHours > 0 && totalHours > availableHours * HIGH_RATIO) {
        warnings.push({ code: 'HOURS_HIGH', detail: `${round2(totalHours)} h de ${availableHours} h disponibles (más del 120 %)` });
      }
      if (longDays > 0) warnings.push({ code: 'LONG_DAYS', detail: `${longDays} día(s) con más de ${LONG_DAY_HOURS} h` });
      if (noDescription > 0) warnings.push({ code: 'NO_DESCRIPTION', detail: `${noDescription} registro(s) de cliente sin descripción` });
      // Solo avisa si la organización costea a alguien ese año: la auditoría interna no se costea (solo existe la planilla de pago)
      // y avisarle a toda la plantilla sería ruido.
      if (totalHours > 0 && withCost.size > 0 && !withCost.has(person.id)) {
        warnings.push({ code: 'NO_COST_PROFILE', detail: 'Sin perfil de costeo de ese año: las horas quedarían sin costear' });
      }

      const close = closeByUser.get(person.id);
      // Cerrar y reabrir siguen la misma regla de "quién cierra a quién"; cada botón aparece según el estado del mes.
      let allowed = false;
      if (settings.enabled) {
        try { assertCanCloseFor(actor, person); allowed = true; } catch { allowed = false; }
      }
      const isClosed = close?.status === 'CLOSED';
      const canClose = allowed && !isClosed;
      const canReopen = allowed && isClosed;
      return {
        userId: person.id, name: person.name, email: person.email, role: person.role, active: person.active,
        businessDays: businessDays.length, daysWithHours, missingDays,
        totalHours: round2(totalHours), billableHours: round2(billable), clientNonBillableHours: round2(clientNonBillable),
        adminHours: round2(admin), leaveHours: round2(leave), availableHours,
        billableUtilizationPct: availableHours && availableHours > 0 ? round2((billable / availableHours) * 100) : null,
        warnings,
        status: close?.status === 'CLOSED' ? 'CLOSED' : 'OPEN',
        closedAt: close?.status === 'CLOSED' ? close.closedAt : null,
        closedByName: close?.closedById ? closerName.get(close.closedById) ?? null : null,
        reopenedAt: close?.reopenedAt ?? null,
        pendingAdjustments: pendingByUser.get(person.id) ?? 0,
        canClose, canReopen,
      };
    });

    const entryDeadline = nthBusinessDay(nextPeriod(period), settings.entryDeadlineDay, holidaySet);
    const closeDeadline = nthBusinessDay(nextPeriod(period), settings.closeDeadlineDay, holidaySet);
    return { rows, settings, entryDeadline, closeDeadline, holidaySet };
  }

  // ── Detalle de una persona para revisar antes de cerrar ──────────────────
  /**
   * Las horas de una persona en un mes, con descripción y encargo. NO incluye costo ni tarifa congelados: el gerente revisa
   * el trabajo, no el salario de nadie (la rentabilidad con costos es de la dirección).
   */
  async personEntries(userId: string, year: number, month: number, user: AuthUser) {
    this.assertManager(user);
    const target = await this.findTarget(userId, user.organizationId);
    const range = periodRange({ year, month });
    const entries = await this.prisma.timeEntry.findMany({
      where: { organizationId: user.organizationId, userId: target.id, workDate: { gte: range.gte, lt: range.lt } },
      orderBy: [{ workDate: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true, workDate: true, hours: true, category: true, description: true, auditId: true, planItemId: true,
        nonBillableReason: true, afterClose: true,
      },
    });
    const auditIds = [...new Set(entries.map((e) => e.auditId).filter((v): v is string => !!v))];
    const audits = auditIds.length > 0
      ? await this.prisma.audit.findMany({ where: { id: { in: auditIds }, organizationId: user.organizationId }, select: { id: true, title: true } })
      : [];
    const titles = new Map(audits.map((a) => [a.id, a.title]));
    // Modo investigación (2026-10-25): las horas de una investigación ajena se ven sin título ni descripción. Una hora anclada
    // solo a un ítem de plan hereda el encargo del ítem.
    const auditOf = await this.auditOfEntries(entries);
    const hidden = await hiddenAuditIds(this.prisma, entries.map(auditOf), user);
    return {
      user: { id: target.id, name: target.name },
      year, month,
      entries: entries.map((e) => {
        const a = auditOf(e);
        return a && hidden.has(a)
          ? { ...e, description: null, auditTitle: RESTRICTED_AUDIT_TITLE }
          : { ...e, auditTitle: e.auditId ? titles.get(e.auditId) ?? null : null };
      }),
    };
  }

  /** Encargo efectivo de cada hora: el suyo, o el del ítem de plan al que está anclada (una consulta para todas). */
  private async auditOfEntries(
    entries: Array<{ auditId?: string | null; planItemId?: string | null }>,
  ): Promise<(e: { auditId?: string | null; planItemId?: string | null }) => string | null> {
    const itemIds = [...new Set(entries.filter((e) => !e.auditId && e.planItemId).map((e) => e.planItemId as string))];
    const items = itemIds.length > 0
      ? await this.prisma.auditPlanItem.findMany({ where: { id: { in: itemIds } }, select: { id: true, auditId: true } })
      : [];
    const byItem = new Map(items.map((i) => [i.id, i.auditId]));
    return (e) => e.auditId ?? (e.planItemId ? byItem.get(e.planItemId) ?? null : null);
  }

  // ── Cerrar ────────────────────────────────────────────────────────────────
  async closePeriod(dto: ClosePeriodDto, user: AuthUser) {
    this.assertManager(user);
    const settings = await loadCloseSettings(this.prisma, user.organizationId);
    if (!settings.enabled) throw new BadRequestException('El cierre de horas no está activado en tu organización.');
    const period = { year: dto.year, month: dto.month };
    if (!isPeriodFinished(period, todayInSalvador())) {
      throw new BadRequestException('Solo se cierran meses terminados.');
    }
    const target = await this.findTarget(dto.userId, user.organizationId);
    assertCanCloseFor(user, target);

    const result = await this.prisma.$transaction(async (tx) => {
      await lockPeriods(tx, user.organizationId, target.id, [period]);
      const existing = await tx.hoursPeriodClose.findUnique({
        where: { organizationId_userId_year_month: { organizationId: user.organizationId, userId: target.id, year: period.year, month: period.month } },
      });
      if (existing?.status === 'CLOSED') throw new ConflictException('Ese mes de esta persona ya está cerrado.');

      const range = periodRange(period);
      const entries = await tx.timeEntry.findMany({
        where: { organizationId: user.organizationId, userId: target.id, workDate: { gte: range.gte, lt: range.lt } },
        select: { id: true, hours: true, auditId: true, category: true },
      });
      const now = new Date();
      const snapshots = await this.loadSnapshots(tx, user.organizationId, target.id, period.year, entries.map((e) => e.auditId));
      await this.freezeEntries(tx, user.organizationId, target.id, period, snapshots, now);

      const totalHours = round2(entries.reduce((n, e) => n + e.hours, 0));
      const row = await tx.hoursPeriodClose.upsert({
        where: { organizationId_userId_year_month: { organizationId: user.organizationId, userId: target.id, year: period.year, month: period.month } },
        create: {
          organizationId: user.organizationId, userId: target.id, year: period.year, month: period.month, status: 'CLOSED',
          closedById: user.id, closedAt: now, closeNote: dto.note ?? null, entryCount: entries.length, totalHours,
          costRateSnapshot: snapshots.costRate,
        },
        update: {
          status: 'CLOSED', closedById: user.id, closedAt: now, closeNote: dto.note ?? null, entryCount: entries.length, totalHours,
          costRateSnapshot: snapshots.costRate,
        },
      });
      await logEntryChange(tx, {
        organizationId: user.organizationId, userId: target.id, actorId: user.id, action: TimeEntryLogAction.PERIOD_CLOSED,
        after: { period: periodLabel(period), entryCount: entries.length, totalHours, withoutCostRate: snapshots.costRate === null ? entries.length : 0 },
        note: dto.note ?? null,
      });
      return { row, entryCount: entries.length, totalHours, withoutCostRate: snapshots.costRate === null ? entries.length : 0 };
    }, TX_OPTIONS);

    return {
      closed: true, year: period.year, month: period.month, userId: target.id,
      entryCount: result.entryCount, totalHours: result.totalHours, entriesWithoutCostRate: result.withoutCostRate,
    };
  }

  /** Costo/hora del perfil de costeo del año y tarifa pactada de cada encargo: lo que se congela al cerrar. */
  async loadSnapshots(db: Db, organizationId: string, userId: string, year: number, auditIds: (string | null)[]) {
    const ids = [...new Set(auditIds.filter((v): v is string => !!v))];
    const [cost, teams] = await Promise.all([
      db.userCostProfile.findFirst({ where: { organizationId, userId, year }, select: { costRatePerHour: true } }),
      ids.length > 0
        ? db.auditTeam.findMany({ where: { userId, auditId: { in: ids } }, select: { auditId: true, agreedRatePerHour: true } })
        : Promise.resolve([] as { auditId: string; agreedRatePerHour: Prisma.Decimal | null }[]),
    ]);
    const billRateByAudit = new Map<string, Prisma.Decimal>();
    for (const t of teams) if (t.agreedRatePerHour !== null) billRateByAudit.set(t.auditId, t.agreedRatePerHour);
    return { costRate: cost?.costRatePerHour ?? null, billRateByAudit };
  }

  private async freezeEntries(
    tx: Db, organizationId: string, userId: string, period: PeriodKey,
    snapshots: { costRate: Prisma.Decimal | null; billRateByAudit: Map<string, Prisma.Decimal> }, now: Date,
  ) {
    const range = periodRange(period);
    const where = { organizationId, userId, workDate: { gte: range.gte, lt: range.lt } };
    await tx.timeEntry.updateMany({ where, data: { costRateSnapshot: snapshots.costRate, closedAt: now, billRateSnapshot: null } });
    for (const [auditId, rate] of snapshots.billRateByAudit) {
      await tx.timeEntry.updateMany({
        where: { ...where, auditId, category: { in: [...CLIENT_CATEGORIES] } },
        data: { billRateSnapshot: rate },
      });
    }
  }

  // ── Reabrir ───────────────────────────────────────────────────────────────
  async reopenPeriod(dto: ReopenPeriodDto, user: AuthUser) {
    this.assertManager(user);
    const settings = await loadCloseSettings(this.prisma, user.organizationId);
    if (!settings.enabled) throw new BadRequestException('El cierre de horas no está activado en tu organización.');
    const period = { year: dto.year, month: dto.month };
    const target = await this.findTarget(dto.userId, user.organizationId);
    assertCanCloseFor(user, target);

    await this.prisma.$transaction(async (tx) => {
      await lockPeriods(tx, user.organizationId, target.id, [period]);
      const existing = await tx.hoursPeriodClose.findUnique({
        where: { organizationId_userId_year_month: { organizationId: user.organizationId, userId: target.id, year: period.year, month: period.month } },
      });
      if (!existing || existing.status !== 'CLOSED') throw new ConflictException('Ese mes de esta persona no está cerrado.');
      const range = periodRange(period);
      // Horas ya facturadas (Fase 4): reabrir soltaría su tarifa congelada. Primero se bloquean las filas, después se buscan las líneas.
      await lockPersonMonthEntries(tx, user.organizationId, target.id, range);
      await assertPersonMonthNotInvoiced(tx, user.organizationId, target.id, range);
      // Vuelve a ser provisional: se sueltan el costo y la tarifa congelados (afterClose se conserva como historia).
      await tx.timeEntry.updateMany({
        where: { organizationId: user.organizationId, userId: target.id, workDate: { gte: range.gte, lt: range.lt } },
        data: { costRateSnapshot: null, billRateSnapshot: null, closedAt: null },
      });
      await tx.hoursPeriodClose.update({
        where: { id: existing.id },
        data: { status: 'OPEN', reopenedById: user.id, reopenedAt: new Date(), reopenReason: dto.reason },
      });
      // Con el mes abierto la persona edita directo: los pedidos de ajuste que quedaron pendientes ya no tienen sentido
      // (y aprobarlos más tarde tocaría horas que pudieron cambiar de mes).
      await tx.timeAdjustmentRequest.updateMany({
        where: { organizationId: user.organizationId, userId: target.id, year: period.year, month: period.month, status: 'PENDING' },
        data: { status: 'REJECTED', decidedById: user.id, decidedAt: new Date(), decisionNote: 'Se reabrió el mes: edita tus horas directamente.' },
      });
      await logEntryChange(tx, {
        organizationId: user.organizationId, userId: target.id, actorId: user.id, action: TimeEntryLogAction.PERIOD_REOPENED,
        before: { period: periodLabel(period), closedAt: existing.closedAt?.toISOString() ?? null }, note: dto.reason,
      });
    }, TX_OPTIONS);
    return { reopened: true, year: period.year, month: period.month, userId: target.id };
  }

  // ── Ajustes de un mes cerrado ─────────────────────────────────────────────
  async createAdjustment(dto: CreateAdjustmentDto, user: AuthUser) {
    const settings = await loadCloseSettings(this.prisma, user.organizationId);
    if (!settings.enabled) throw new BadRequestException('El cierre de horas no está activado en tu organización.');

    let period: PeriodKey;
    let payload: Prisma.InputJsonObject | undefined;
    let timeEntryId: string | undefined;

    if (dto.action === TimeAdjustmentAction.ADD) {
      if (!dto.entry) throw new BadRequestException('Para agregar horas indica la hora completa en "entry".');
      this.assertEntryFields(dto.entry);
      await assertTimeAnchorsInOrg(this.prisma, user, [dto.entry]);
      await completeTimeAnchors(this.prisma, dto.entry); // un ítem de plan de otro encargo se rechaza ahora, no al aprobar
      period = periodKeyOf(dto.entry.workDate);
      payload = { ...dto.entry } as Prisma.InputJsonObject;
    } else {
      if (!dto.timeEntryId) throw new BadRequestException('Indica la hora a cambiar o borrar en "timeEntryId".');
      const entry = await this.prisma.timeEntry.findUnique({ where: { id: dto.timeEntryId } });
      if (!entry || entry.organizationId !== user.organizationId) throw new NotFoundException('Hora no encontrada.');
      if (entry.userId !== user.id) throw new ForbiddenException('Solo puedes pedir ajustes de tus propias horas.');
      timeEntryId = entry.id;
      period = periodKeyOf(entry.workDate);
      await assertEntryNotInvoiced(this.prisma, entry.id, { showInvoice: false });
      if (dto.action === TimeAdjustmentAction.EDIT) {
        if (!dto.changes || Object.keys(dto.changes).length === 0) throw new BadRequestException('Indica qué cambia en "changes".');
        if (dto.changes.workDate && periodLabel(periodKeyOf(dto.changes.workDate)) !== periodLabel(period)) {
          throw new BadRequestException('Un ajuste no puede mover la hora a otro mes: pide borrarla y agregarla.');
        }
        const merged = mergeEntryChanges(entry, dto.changes);
        this.assertEntryFields(merged);
        await assertTimeAnchorsInOrg(this.prisma, user, [merged]);
        await completeTimeAnchors(this.prisma, merged);
        payload = { ...dto.changes } as Prisma.InputJsonObject;
      }
    }

    const closed = await this.prisma.hoursPeriodClose.findFirst({
      where: { organizationId: user.organizationId, userId: user.id, year: period.year, month: period.month, status: 'CLOSED' },
    });
    if (!closed) throw new BadRequestException('Ese mes está abierto: edita tus horas directamente, no hace falta un ajuste.');

    const row = await this.prisma.timeAdjustmentRequest.create({
      data: {
        organizationId: user.organizationId, userId: user.id, year: period.year, month: period.month,
        action: dto.action, timeEntryId, payload, reason: dto.reason,
      },
    });
    return row;
  }

  /**
   * Modo investigación (2026-10-25): al aprobar un ajuste se vuelve a comprobar que QUIEN LO PIDIÓ todavía puede ver el
   * encargo al que apunta (pudo salir del equipo, o el encargo pasar a investigación, entre el pedido y la decisión).
   * Se valida con la visibilidad del solicitante, no la del gerente que decide.
   */
  private async assertRequesterCanStillSee(req: {
    organizationId: string; userId: string; action: TimeAdjustmentAction; timeEntryId: string | null; payload: unknown; user: { id: string; role: string };
  }) {
    if (req.action === TimeAdjustmentAction.DELETE) return;
    const requester = { id: req.userId, role: req.user.role, organizationId: req.organizationId };
    const payload = (req.payload ?? {}) as { auditId?: string | null; planItemId?: string | null };
    if (req.action === TimeAdjustmentAction.ADD) {
      await assertTimeAnchorsInOrg(this.prisma, requester, [payload]);
      return;
    }
    const entry = req.timeEntryId ? await this.prisma.timeEntry.findUnique({ where: { id: req.timeEntryId } }) : null;
    if (!entry) return; // «la hora ya no existe» lo resuelve la transacción
    await assertTimeAnchorsInOrg(this.prisma, requester, [mergeEntryChanges(entry, payload as Record<string, never>)]);
  }

  /** Reglas del registro que valen igual para una hora nueva que para una editada. */
  private assertEntryFields(e: {
    category: TimeEntryCategory; hours: number; description?: string | null; auditId?: string | null; planItemId?: string | null;
    nonBillableReason?: NonBillableReason | null; workDate: string;
  }) {
    const linkError = validateCategoryLinkage(e);
    if (linkError) throw new BadRequestException(linkError);
    assertValidHours(e.hours);
    const ruleError = validateEntryRules(e, true); // un ajuste siempre exige descripción: el cierre está activo
    if (ruleError) throw new BadRequestException(ruleError);
  }

  async listAdjustments(query: QueryAdjustmentsDto, user: AuthUser) {
    const isManager = rankOf(user.role) >= MANAGER_RANK;
    const onlyMine = !isManager || query.mine === 'true';
    const where: Prisma.TimeAdjustmentRequestWhereInput = {
      organizationId: user.organizationId,
      ...(onlyMine ? { userId: user.id } : {}),
      ...(query.status ? { status: query.status as TimeAdjustmentStatus } : {}),
    };
    const rows = await this.prisma.timeAdjustmentRequest.findMany({
      where, orderBy: { createdAt: 'desc' }, take: 200, include: { user: { select: { id: true, name: true, role: true } } },
    });
    const entryIds = rows.map((r) => r.timeEntryId).filter((v): v is string => !!v);
    const entries = entryIds.length > 0
      ? await this.prisma.timeEntry.findMany({ where: { id: { in: entryIds }, organizationId: user.organizationId }, select: ENTRY_PUBLIC_SELECT })
      : [];
    const byId = new Map(entries.map((e) => [e.id, e]));
    // Modo investigación (2026-10-25): el gerente que no ve la investigación no lee la descripción de las horas de otros en ella
    // (ni la del cambio pedido). El pedido propio se muestra completo.
    const payloadAnchor = (r: { payload: unknown }) => {
      const p = (r.payload ?? {}) as { auditId?: string | null; planItemId?: string | null };
      return { auditId: p.auditId ?? null, planItemId: p.planItemId ?? null };
    };
    const auditOf = await this.auditOfEntries([...entries, ...rows.map(payloadAnchor)]);
    const hidden = await hiddenAuditIds(this.prisma, [...entries.map(auditOf), ...rows.map((r) => auditOf(payloadAnchor(r)))], user);
    return rows.map((r) => {
      const entry = r.timeEntryId ? byId.get(r.timeEntryId) ?? null : null;
      const entryAudit = entry ? auditOf(entry) : null;
      const payloadAudit = auditOf(payloadAnchor(r));
      const redact = r.userId !== user.id
        && ((!!entryAudit && hidden.has(entryAudit)) || (!!payloadAudit && hidden.has(payloadAudit)));
      return {
        ...r,
        payload: redact && r.payload && typeof r.payload === 'object' ? { ...(r.payload as object), description: null } : r.payload,
        entry: redact && entry ? { ...entry, description: null } : entry,
        // El motivo del pedido y la nota de quien lo resolvió también cuentan lo que se hizo en la investigación.
        ...(redact ? { reason: null, decisionNote: r.decidedById === user.id ? r.decisionNote : null } : {}),
      };
    });
  }

  async decideAdjustment(id: string, dto: DecideAdjustmentDto, user: AuthUser) {
    this.assertManager(user);
    const req = await this.prisma.timeAdjustmentRequest.findUnique({ where: { id }, include: { user: { select: { id: true, role: true } } } });
    if (!req || req.organizationId !== user.organizationId) throw new NotFoundException('Pedido de ajuste no encontrado.');
    const settings = await loadCloseSettings(this.prisma, user.organizationId);
    if (!settings.enabled) throw new BadRequestException('El cierre de horas no está activado en tu organización.');
    if (req.status !== 'PENDING') throw new ConflictException('Ese pedido ya fue resuelto.');
    assertCanCloseFor(user, req.user);
    await this.assertRequesterCanStillSee(req);
    const period = { year: req.year, month: req.month };
    const now = new Date();

    const touchedAudits = new Set<string>();
    await this.prisma.$transaction(async (tx) => {
      await lockPeriods(tx, req.organizationId, req.userId, [period]);

      // Una sola decisión por pedido: el estado se reclama de forma atómica dentro de la transacción. Leerlo antes (arriba) no
      // alcanza: dos gerentes, o un doble clic, verían PENDING a la vez y el segundo duplicaría la hora.
      const claimed = await tx.timeAdjustmentRequest.updateMany({
        where: { id, organizationId: req.organizationId, status: 'PENDING' },
        data: { status: dto.approve ? 'APPROVED' : 'REJECTED', decidedById: user.id, decidedAt: now, decisionNote: dto.note ?? null },
      });
      if (claimed.count !== 1) throw new ConflictException('Ese pedido ya fue resuelto.');
      if (!dto.approve) return;

      const closed = await tx.hoursPeriodClose.findFirst({
        where: { organizationId: req.organizationId, userId: req.userId, year: period.year, month: period.month, status: 'CLOSED' },
      });
      if (!closed) throw new ConflictException('Ese mes fue reabierto: la persona puede editar sus horas directamente. Rechaza el pedido.');

      if (req.action === TimeAdjustmentAction.ADD) {
        const e = req.payload as unknown as {
          workDate: string; hours: number; category: TimeEntryCategory; description?: string; auditId?: string;
          planItemId?: string; nonBillableReason?: NonBillableReason;
        };
        if (periodLabel(periodKeyOf(e.workDate)) !== periodLabel(period)) throw new ConflictException('La fecha del pedido no está en ese mes.');
        assertValidHours(e.hours);
        await assertDailyHoursCap(tx, req.userId, new Map([[e.workDate, e.hours]]));
        // Una sola definición de encargo/ítem de plan (ver completeTimeAnchors): una hora que trae solo el ítem recibe su encargo, y
        // la que trae solo el encargo recibe su ítem; si no, el plan y el encargo contaban horas distintas.
        const anchors = await completeTimeAnchors(tx, e);
        const snapshots = await this.loadSnapshots(tx, req.organizationId, req.userId, period.year, [anchors.auditId ?? null]);
        const created = await tx.timeEntry.create({
          data: {
            organizationId: req.organizationId, userId: req.userId, auditId: anchors.auditId, planItemId: anchors.planItemId,
            workDate: new Date(e.workDate), hours: e.hours, description: e.description, category: e.category,
            nonBillableReason: e.nonBillableReason ?? null, afterClose: true, closedAt: now,
            // El costo es el que se congeló al cerrar el mes (no el perfil de hoy): todas las horas del mes valen igual.
            costRateSnapshot: closed.costRateSnapshot,
            billRateSnapshot: anchors.auditId && CLIENT_CATEGORIES.has(e.category) ? snapshots.billRateByAudit.get(anchors.auditId) ?? null : null,
          },
        });
        if (created.auditId) touchedAudits.add(created.auditId);
        await logEntryChange(tx, {
          organizationId: req.organizationId, userId: req.userId, actorId: user.id, action: TimeEntryLogAction.ADJUSTMENT_APPROVED,
          timeEntryId: created.id, after: entrySnapshot(created), note: req.reason,
        });
        await tx.timeAdjustmentRequest.update({ where: { id }, data: { timeEntryId: created.id } });
      } else {
        const entry = req.timeEntryId ? await tx.timeEntry.findUnique({ where: { id: req.timeEntryId } }) : null;
        if (!entry || entry.organizationId !== req.organizationId) throw new ConflictException('La hora del pedido ya no existe.');
        // La hora pudo cambiar de dueña o de mes desde que se pidió el ajuste (p. ej. el mes se reabrió y se volvió a cerrar):
        // el candado y la comprobación de arriba son del mes del pedido, así que solo se toca una hora que siga en él.
        if (entry.userId !== req.userId || periodLabel(periodKeyOf(entry.workDate)) !== periodLabel(period)) {
          throw new ConflictException('La hora del pedido ya no está en ese mes. Rechaza el pedido y pide uno nuevo.');
        }
        // Una hora ya facturada (Fase 4) no se cambia ni se borra: se bloquea la fila y se buscan las líneas vigentes. Para rechazar el pedido no hace falta.
        await lockTimeEntryRows(tx, req.organizationId, [entry.id]);
        await assertEntryNotInvoiced(tx, entry.id, { showInvoice: true });
        if (entry.auditId) touchedAudits.add(entry.auditId);
        if (req.action === TimeAdjustmentAction.DELETE) {
          // Las líneas liberadas de una factura anulada dejarían la clave foránea como obstáculo del borrado.
          await tx.clientInvoiceHour.deleteMany({ where: { timeEntryId: entry.id, releasedAt: { not: null } } });
          await tx.timeEntry.delete({ where: { id: entry.id } });
          await logEntryChange(tx, {
            organizationId: req.organizationId, userId: req.userId, actorId: user.id, action: TimeEntryLogAction.ADJUSTMENT_APPROVED,
            timeEntryId: entry.id, before: entrySnapshot(entry), note: req.reason,
          });
        } else {
          const merged = mergeEntryChanges(entry, (req.payload ?? {}) as Record<string, never>);
          if (periodLabel(periodKeyOf(merged.workDate)) !== periodLabel(period)) throw new ConflictException('El cambio mueve la hora a otro mes.');
          this.assertEntryFields(merged);
          const anchors = await completeTimeAnchors(tx, merged);
          merged.auditId = anchors.auditId ?? null;
          merged.planItemId = anchors.planItemId ?? null;
          await assertDailyHoursCap(tx, req.userId, new Map([[merged.workDate, merged.hours]]), [entry.id]);
          // El costo del mes no se recalcula; la tarifa solo si cambió el encargo o dejó de ser una hora de cliente.
          const sameRate = merged.auditId === entry.auditId
            && CLIENT_CATEGORIES.has(merged.category) === CLIENT_CATEGORIES.has(entry.category);
          const billRate = sameRate
            ? entry.billRateSnapshot
            : merged.auditId && CLIENT_CATEGORIES.has(merged.category)
              ? (await this.loadSnapshots(tx, req.organizationId, req.userId, period.year, [merged.auditId])).billRateByAudit.get(merged.auditId) ?? null
              : null;
          const updated = await tx.timeEntry.update({
            where: { id: entry.id },
            data: {
              workDate: new Date(merged.workDate), hours: merged.hours, category: merged.category, description: merged.description,
              auditId: merged.auditId, planItemId: merged.planItemId, nonBillableReason: merged.nonBillableReason,
              afterClose: true, closedAt: now, costRateSnapshot: closed.costRateSnapshot, billRateSnapshot: billRate,
            },
          });
          if (updated.auditId) touchedAudits.add(updated.auditId);
          await logEntryChange(tx, {
            organizationId: req.organizationId, userId: req.userId, actorId: user.id, action: TimeEntryLogAction.ADJUSTMENT_APPROVED,
            timeEntryId: entry.id, before: entrySnapshot(entry), after: entrySnapshot(updated), note: req.reason,
          });
        }
      }

      // El cierre guarda cuántas horas y registros congeló: se mantiene al día con el ajuste.
      const range = periodRange(period);
      const totals = await tx.timeEntry.aggregate({
        where: { organizationId: req.organizationId, userId: req.userId, workDate: { gte: range.gte, lt: range.lt } },
        _sum: { hours: true }, _count: { _all: true },
      });
      await tx.hoursPeriodClose.update({
        where: { id: closed.id }, data: { entryCount: totals._count._all, totalHours: round2(totals._sum.hours ?? 0) },
      });
    }, TX_OPTIONS);

    await Promise.all([...touchedAudits].map((auditId) => recalculateAuditActualHours(this.prisma, auditId)));
    return this.prisma.timeAdjustmentRequest.findUnique({ where: { id } });
  }

  // ── Recordatorios ─────────────────────────────────────────────────────────
  /** Recordatorio por correo a quienes tienen días hábiles sin horas. Lo usan el botón del gerente y la tarea programada. */
  async sendReminders(
    actor: { id: string; role: string; organizationId: string }, period: PeriodKey, stage: 'manual' | 1 | 2, userIds?: string[],
  ) {
    const today = todayInSalvador();
    const { rows, entryDeadline } = await this.buildRows(actor, period, today);
    const targets = rows.filter((r) => r.active && r.status === 'OPEN' && r.missingDays.length > 0 && (!userIds || userIds.includes(r.userId)));
    const monthName = new Intl.DateTimeFormat('es-SV', { month: 'long', year: 'numeric', timeZone: 'UTC' })
      .format(new Date(Date.UTC(period.year, period.month - 1, 1)));
    let sent = 0;
    const failed: string[] = [];
    for (const person of targets) {
      const dates = person.missingDays.slice(0, 12).join(', ') + (person.missingDays.length > 12 ? '…' : '');
      const urgent = stage === 2 && today === entryDeadline
        ? `Hoy vence el plazo para registrar tus horas de ${monthName}.`
        : stage === 2 && today > entryDeadline
          ? `El plazo para registrar tus horas de ${monthName} venció el ${entryDeadline}.`
          : `Tienes hasta el ${entryDeadline} para registrar tus horas de ${monthName}.`;
      const result = await this.email.send({
        to: person.email,
        subject: `Horas pendientes de ${monthName}`,
        body: {
          heading: `Hola ${person.name}`,
          paragraphs: [
            `Te faltan horas en <strong>${person.missingDays.length} día(s) hábil(es)</strong> de ${escHtml(monthName)}: ${escHtml(dates)}.`,
            escHtml(urgent),
            'Si algún día no trabajaste (vacaciones, permiso, incapacidad), regístralo con su categoría para que el mes cuadre.',
          ],
          ctaLabel: 'Registrar mis horas',
          ctaUrl: `${this.appUrl()}/dashboard/timesheet`,
        },
      });
      if (result.sent) sent++; else failed.push(person.email);
    }
    return { candidates: targets.length, sent, failed: failed.length };
  }

  async remind(dto: RemindPeriodDto, user: AuthUser) {
    this.assertManager(user);
    const settings = await loadCloseSettings(this.prisma, user.organizationId);
    if (!settings.enabled) throw new BadRequestException('El cierre de horas no está activado en tu organización.');
    return this.sendReminders(user, { year: dto.year, month: dto.month }, 'manual', dto.userIds);
  }

  private appUrl(): string {
    return (process.env.WEB_URL ?? process.env.APP_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
  }

  // ── Utilidades ────────────────────────────────────────────────────────────
  private assertManager(user: AuthUser) {
    if (rankOf(user.role) < MANAGER_RANK) throw new ForbiddenException('Solo un gerente o un rol superior puede hacer esto.');
  }

  private async findTarget(userId: string, organizationId: string) {
    const target = await this.prisma.user.findFirst({ where: { id: userId, organizationId }, select: { id: true, role: true, name: true } });
    if (!target) throw new NotFoundException('Persona no encontrada en tu organización.');
    return target;
  }
}
