import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { NonBillableReason, Prisma, TimeEntryCategory, TimeEntryLogAction } from '@prisma/client';
import { ROLE_HIERARCHY } from '../common/guards/roles.guard';

/**
 * Cierre de horas por persona y mes (Fase 1, docs/horas-cierre-y-honorarios-propuesta.md).
 * Todo lo que escribe, edita o borra horas pasa por estas comprobaciones — TimesheetService y PlansService.
 */

/** Cliente de base de datos o transacción: las comprobaciones corren dentro de la transacción de la escritura. */
export type Db = Prisma.TransactionClient;

// Misma jerarquía que RolesGuard: se importa, no se copia, para que no se desfasen.
export const ROLE_RANK = ROLE_HIERARCHY;
export const MANAGER_RANK = ROLE_RANK.AUDIT_MANAGER;
export const DIRECTION_RANK = ROLE_RANK.CAE;
export const rankOf = (role: string) => ROLE_RANK[role] ?? 0;

export const MIN_DESCRIPTION_LENGTH = 5;
export const CLIENT_CATEGORIES = new Set<TimeEntryCategory>([
  TimeEntryCategory.CLIENT_BILLABLE, TimeEntryCategory.CLIENT_NON_BILLABLE,
]);

// ── Períodos (persona + mes, en UTC como el resto del módulo: workDate se guarda a medianoche UTC) ──
export interface PeriodKey { year: number; month: number }

export function periodKeyOf(date: string | Date): PeriodKey {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) throw new BadRequestException('Fecha inválida.');
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}
export const periodLabel = (p: PeriodKey) => `${p.year}-${String(p.month).padStart(2, '0')}`;

export function uniquePeriods(dates: (string | Date)[]): PeriodKey[] {
  const seen = new Map<string, PeriodKey>();
  for (const date of dates) {
    const p = periodKeyOf(date);
    seen.set(periodLabel(p), p);
  }
  return [...seen.values()].sort((a, b) => periodLabel(a).localeCompare(periodLabel(b)));
}

export function periodRange(p: PeriodKey): { gte: Date; lt: Date } {
  return { gte: new Date(Date.UTC(p.year, p.month - 1, 1)), lt: new Date(Date.UTC(p.year, p.month, 1)) };
}

// ── Parámetros por organización ────────────────────────────────────────────
export interface HoursCloseSettingsView {
  enabled: boolean;
  entryDeadlineDay: number;
  closeDeadlineDay: number;
}
export const DEFAULT_CLOSE_SETTINGS: HoursCloseSettingsView = { enabled: false, entryDeadlineDay: 5, closeDeadlineDay: 10 };

export async function loadCloseSettings(db: Db, organizationId: string): Promise<HoursCloseSettingsView> {
  const row = await db.hoursCloseSettings.findUnique({ where: { organizationId } });
  if (!row) return { ...DEFAULT_CLOSE_SETTINGS };
  return { enabled: row.enabled, entryDeadlineDay: row.entryDeadlineDay, closeDeadlineDay: row.closeDeadlineDay };
}

// ── Candado por persona y mes ──────────────────────────────────────────────
/**
 * Serializa las escrituras y el cierre de la MISMA persona y mes con un candado de transacción de Postgres, para que
 * un registro no se cuele en medio del cierre (entre comprobar que el mes está abierto y guardarlo). Se piden en orden
 * para no provocar bloqueos cruzados. Solo vale dentro de una transacción.
 */
export async function lockPeriods(db: Db, organizationId: string, userId: string, periods: PeriodKey[]): Promise<void> {
  const keys = periods.map((p) => `hours-close:${organizationId}:${userId}:${periodLabel(p)}`).sort();
  for (const key of keys) {
    // ::text porque pg_advisory_xact_lock devuelve `void` y Prisma no sabe leer columnas de ese tipo ($queryRaw fallaría en producción).
    await db.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))::text AS locked`;
  }
}

/**
 * Rechaza la escritura si algún mes de esa persona está cerrado. Con el cierre apagado en la organización no bloquea nada.
 * Devuelve los parámetros para que quien llama decida otras reglas que dependen del interruptor (p. ej. la descripción).
 */
export async function assertPeriodsOpen(
  db: Db, organizationId: string, userId: string, dates: (string | Date)[],
): Promise<HoursCloseSettingsView> {
  const settings = await loadCloseSettings(db, organizationId);
  if (!settings.enabled || dates.length === 0) return settings;
  const periods = uniquePeriods(dates);
  await lockPeriods(db, organizationId, userId, periods);
  const closed = await db.hoursPeriodClose.findMany({
    where: {
      organizationId, userId, status: 'CLOSED',
      OR: periods.map((p) => ({ year: p.year, month: p.month })),
    },
    select: { year: true, month: true },
  });
  if (closed.length > 0) {
    const meses = closed.map((c) => periodLabel(c)).sort().join(', ');
    throw new ConflictException(
      `El mes ${meses} de estas horas está cerrado. Pide un ajuste a tu gerente para cambiarlo.`,
    );
  }
  return settings;
}

// ── Quién cierra a quién ────────────────────────────────────────────────────
/**
 * Un gerente (o más) cierra a un auditor o auditor sénior; nadie cierra sus propias horas; las de un gerente, o de
 * alguien por encima, las cierra la dirección (CAE o más).
 */
export function assertCanCloseFor(closer: { id: string; role: string }, target: { id: string; role: string }): void {
  if (rankOf(closer.role) < MANAGER_RANK) {
    throw new ForbiddenException('Solo un gerente o un rol superior puede cerrar horas.');
  }
  if (closer.id === target.id) {
    throw new ForbiddenException('Nadie cierra sus propias horas: pídele a otro gerente o a la dirección.');
  }
  if (rankOf(target.role) >= MANAGER_RANK && rankOf(closer.role) < DIRECTION_RANK) {
    throw new ForbiddenException('Las horas de un gerente las cierra la dirección (CAE o superior).');
  }
}

// ── Reglas del registro ─────────────────────────────────────────────────────
export interface EntryRuleInput {
  category: TimeEntryCategory;
  description?: string | null;
  nonBillableReason?: string | null;
}

/** Devuelve el mensaje de error o null. La descripción solo se exige con el cierre activo (compatibilidad con la captura vieja). */
export function validateEntryRules(
  e: EntryRuleInput, requireDescription: boolean, opts: { allowMissingReason?: boolean } = {},
): string | null {
  if (e.category === TimeEntryCategory.CLIENT_NON_BILLABLE) {
    // Una hora no facturable ANTERIOR a este cambio no tiene motivo: se puede seguir editando (horas, fecha) sin inventarle uno.
    if (!e.nonBillableReason && !opts.allowMissingReason) return 'Una hora de cliente no facturable necesita un motivo (sobrepresupuesto, retrabajo, cortesía u otro).';
  } else if (e.nonBillableReason) {
    return 'Solo las horas de cliente no facturables llevan motivo de no facturación.';
  }
  if (requireDescription && CLIENT_CATEGORIES.has(e.category)) {
    if ((e.description ?? '').trim().length < MIN_DESCRIPTION_LENGTH) {
      return `Las horas de cliente necesitan una descripción de al menos ${MIN_DESCRIPTION_LENGTH} caracteres: es el respaldo para facturar y revisar.`;
    }
  }
  return null;
}

// ── Bitácora ────────────────────────────────────────────────────────────────
export interface EntryLike {
  id?: string;
  workDate: Date | string;
  hours: number;
  category: TimeEntryCategory | string;
  description?: string | null;
  auditId?: string | null;
  planItemId?: string | null;
  nonBillableReason?: string | null;
}

/** Foto del registro para la bitácora (solo lo que importa, fecha como AAAA-MM-DD). */
export function entrySnapshot(e: EntryLike): Prisma.InputJsonObject {
  const wd = typeof e.workDate === 'string' ? e.workDate.slice(0, 10) : e.workDate.toISOString().slice(0, 10);
  return {
    workDate: wd, hours: e.hours, category: String(e.category),
    description: e.description ?? null, auditId: e.auditId ?? null, planItemId: e.planItemId ?? null,
    nonBillableReason: e.nonBillableReason ?? null,
  };
}

export interface EntryLogInput {
  organizationId: string; userId: string; actorId: string; action: TimeEntryLogAction;
  timeEntryId?: string | null; before?: Prisma.InputJsonObject | null; after?: Prisma.InputJsonObject | null; note?: string | null;
}

function logData(p: EntryLogInput) {
  return {
    organizationId: p.organizationId, userId: p.userId, actorId: p.actorId, action: p.action,
    timeEntryId: p.timeEntryId ?? null, note: p.note ?? null,
    ...(p.before ? { before: p.before } : {}),
    ...(p.after ? { after: p.after } : {}),
  };
}

export async function logEntryChange(db: Db, p: EntryLogInput): Promise<void> {
  await db.timeEntryLog.create({ data: logData(p) });
}

export async function logEntryChanges(db: Db, rows: EntryLogInput[]): Promise<void> {
  if (rows.length === 0) return;
  await db.timeEntryLog.createMany({ data: rows.map(logData) });
}

/** Transacciones con ciclos de escrituras pequeñas: el tiempo por defecto (5 s) se queda corto (lección #32). */
export const TX_OPTIONS = { timeout: 30_000, maxWait: 10_000 } as const;

// ── Reglas puras compartidas con el servicio de captura ─────────────────────
/**
 * Regla XOR de negocio: las categorías de cliente requieren encargo o ítem de plan; las demás no pueden traer ninguno.
 * Devuelve el mensaje de error o null.
 */
export function validateCategoryLinkage(dto: {
  category: TimeEntryCategory; auditId?: string | null; planItemId?: string | null;
}): string | null {
  const hasAnchor = !!dto.auditId || !!dto.planItemId;
  if (CLIENT_CATEGORIES.has(dto.category)) {
    if (!hasAnchor) return `La categoría ${dto.category} requiere auditId o planItemId`;
  } else if (hasAnchor) {
    return `La categoría ${dto.category} no admite auditId ni planItemId (horas no ligadas a un encargo)`;
  }
  return null;
}

export interface EntryChanges {
  workDate?: string; hours?: number; category?: TimeEntryCategory;
  description?: string | null; auditId?: string | null; planItemId?: string | null; nonBillableReason?: NonBillableReason | null;
}
export interface MergedEntry {
  workDate: string; hours: number; category: TimeEntryCategory; description: string | null;
  auditId: string | null; planItemId: string | null; nonBillableReason: NonBillableReason | null;
}

/**
 * Aplica cambios parciales sobre el registro actual. Al pasar a una categoría que no es de cliente se sueltan el encargo
 * y el motivo; al pasar a una que no es "no facturable" se suelta el motivo.
 */
export function mergeEntryChanges(
  entry: {
    workDate: Date; hours: number; category: TimeEntryCategory; description: string | null;
    auditId: string | null; planItemId: string | null; nonBillableReason: NonBillableReason | null;
  },
  dto: EntryChanges,
): MergedEntry {
  const merged: MergedEntry = {
    workDate:    dto.workDate ?? entry.workDate.toISOString().slice(0, 10),
    hours:       dto.hours ?? entry.hours,
    category:    dto.category ?? entry.category,
    description: dto.description === undefined ? entry.description : dto.description,
    auditId:     dto.auditId === undefined ? entry.auditId : dto.auditId,
    planItemId:  dto.planItemId === undefined ? entry.planItemId : dto.planItemId,
    nonBillableReason: dto.nonBillableReason === undefined ? entry.nonBillableReason : dto.nonBillableReason,
  };
  if (dto.category && !CLIENT_CATEGORIES.has(dto.category)) {
    if (dto.auditId === undefined) merged.auditId = null;
    if (dto.planItemId === undefined) merged.planItemId = null;
  }
  if (dto.category && dto.category !== TimeEntryCategory.CLIENT_NON_BILLABLE && dto.nonBillableReason === undefined) {
    merged.nonBillableReason = null;
  }
  return merged;
}

// ── Lo que se devuelve de una hora ──────────────────────────────────────────
/**
 * Campos de una hora que se pueden mostrar. Deja fuera `costRateSnapshot` y `billRateSnapshot`: el costo por hora sale del
 * salario de la persona y no lo debe ver quien consulta horas (ni siquiera las suyas ni las de un encargo del equipo).
 */
export const ENTRY_PUBLIC_SELECT = {
  id: true, organizationId: true, auditId: true, planItemId: true, userId: true, workDate: true, hours: true,
  description: true, category: true, nonBillableReason: true, closedAt: true, afterClose: true, createdAt: true, updatedAt: true,
} as const;

// ── Meses cerrados y operaciones masivas (restaurar / borrar un encargo completo) ──
/**
 * Rechaza una operación que crearía o borraría horas dentro de un mes cerrado de alguna persona. Las restauraciones de copias
 * de seguridad y el borrado completo de un encargo no pasan por la captura de horas; sin esto esquivarían el cierre.
 * Con el cierre apagado no hace nada.
 */
export async function assertNoClosedHours(
  db: Db, organizationId: string, rows: { userId?: string | null; workDate?: Date | string | null }[], action: string,
): Promise<void> {
  const settings = await loadCloseSettings(db, organizationId);
  if (!settings.enabled) return;
  const pairs = new Map<string, { userId: string; year: number; month: number }>();
  for (const r of rows) {
    if (!r.userId || !r.workDate) continue;
    const p = periodKeyOf(r.workDate);
    pairs.set(`${r.userId}|${periodLabel(p)}`, { userId: r.userId, ...p });
  }
  if (pairs.size === 0) return;
  const closed = await db.hoursPeriodClose.findMany({
    where: { organizationId, status: 'CLOSED', OR: [...pairs.values()].map((p) => ({ userId: p.userId, year: p.year, month: p.month })) },
    select: { userId: true, year: true, month: true },
  });
  if (closed.length > 0) {
    const meses = [...new Set(closed.map((c) => periodLabel(c)))].sort().join(', ');
    throw new ConflictException(
      `${action} tocaría horas de meses ya cerrados (${meses}). Reabre esos meses en «Cierre de Horas» y vuelve a intentarlo.`,
    );
  }
}

// ── Feriados ────────────────────────────────────────────────────────────────
/**
 * Fechas feriadas (AAAA-MM-DD) que caen en el rango, con los feriados recurrentes aplicados a cada año como en Capacidad
 * (un feriado `recurring` guardado como 2025-12-25 vale también el 2026-12-25).
 */
export async function loadHolidaySet(db: Db, organizationId: string, range: { gte: Date; lt: Date }): Promise<Set<string>> {
  const holidays = await db.holidayConfig.findMany({
    where: { organizationId, active: true },
    select: { date: true, recurring: true },
  });
  const out = new Set<string>();
  const recurring = new Set<string>();
  for (const h of holidays) {
    const key = h.date.toISOString().slice(0, 10);
    if (h.recurring) recurring.add(key.slice(5)); // MM-DD
    else if (h.date >= range.gte && h.date < range.lt) out.add(key);
  }
  if (recurring.size > 0) {
    for (let d = new Date(range.gte); d < range.lt; d.setUTCDate(d.getUTCDate() + 1)) {
      if (recurring.has(d.toISOString().slice(5, 10))) out.add(d.toISOString().slice(0, 10));
    }
  }
  return out;
}
