/**
 * Lógica pura de la captura semanal de horas (sin React): fechas, borrador, validación, copia de la semana anterior
 * y estado de los meses. Va aparte de la pantalla para poder probarla.
 */

export const MAX_DAILY_HOURS = 20;
export const HOUR_STEP = 0.25;
export const MIN_DESCRIPTION_LENGTH = 5; // igual que el servidor (hours-close.util.ts)

export type EntryCategory =
  | 'CLIENT_BILLABLE' | 'CLIENT_NON_BILLABLE' | 'ADMIN' | 'TRAINING' | 'BUSINESS_DEVELOPMENT'
  | 'SICK_LEAVE' | 'PERSONAL_LEAVE' | 'VACATION' | 'OTHER_NON_BILLABLE';
export type NonBillableReason = 'OVER_BUDGET' | 'REWORK' | 'COURTESY' | 'OTHER';

export const NON_BILLABLE_REASON_LABELS: Record<NonBillableReason, string> = {
  OVER_BUDGET: 'Sobrepresupuesto',
  REWORK: 'Retrabajo',
  COURTESY: 'Cortesía',
  OTHER: 'Otro',
};

// ── Fechas (siempre AAAA-MM-DD en horario local para la captura) ─────────────
export function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Mediodía local: evita que un cambio de hora mueva el día. */
export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
}

export function addDays(key: string, n: number): string {
  const d = parseDateKey(key);
  d.setDate(d.getDate() + n);
  return toDateKey(d);
}

/** Lunes de la semana que contiene la fecha. */
export function weekStart(key: string): string {
  const d = parseDateKey(key);
  const back = (d.getDay() + 6) % 7; // lunes = 0
  d.setDate(d.getDate() - back);
  return toDateKey(d);
}

/** Los 7 días (lunes a domingo) de la semana que contiene la fecha. */
export function weekDays(key: string): string[] {
  const start = weekStart(key);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export interface MonthKey { year: number; month: number }
export const monthOf = (dateKey: string): MonthKey => ({ year: Number(dateKey.slice(0, 4)), month: Number(dateKey.slice(5, 7)) });
export const monthLabel = (m: MonthKey) => `${m.year}-${String(m.month).padStart(2, '0')}`;
export const MONTH_NAMES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const monthName = (m: MonthKey) => `${MONTH_NAMES[m.month - 1]} de ${m.year}`;

export function monthsOfDays(days: string[]): MonthKey[] {
  const seen = new Map<string, MonthKey>();
  for (const d of days) { const m = monthOf(d); seen.set(monthLabel(m), m); }
  return [...seen.values()];
}

export function isClosedDay(dateKey: string, closed: MonthKey[]): boolean {
  const m = monthLabel(monthOf(dateKey));
  return closed.some((c) => monthLabel(c) === m);
}

// ── Horas ────────────────────────────────────────────────────────────────────
/** Redondea al cuarto de hora más cercano. Devuelve null si no es un número positivo. */
export function snapHours(raw: string | number): number | null {
  const n = typeof raw === 'number' ? raw : parseFloat(String(raw).replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n / HOUR_STEP) * HOUR_STEP || HOUR_STEP;
}

export const formatHours = (h: number) => `${Number.isInteger(h) ? h : h.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}h`;

// ── Filas y borrador ─────────────────────────────────────────────────────────
export interface WeekRow {
  key: string; // 'audit:<id>' | 'cat:<CATEGORY>'
  label: string;
  category: EntryCategory; // CLIENT_BILLABLE para encargos
  auditId?: string;
  client: boolean; // fila de encargo: lleva descripción, facturable/no facturable y motivo
}

export interface RowMeta {
  description: string;
  billable: boolean;
  reason: NonBillableReason | '';
}
export const emptyMeta = (): RowMeta => ({ description: '', billable: true, reason: '' });

/** values[filaKey][AAAA-MM-DD] = texto del campo */
export type DraftValues = Record<string, Record<string, string>>;

export interface NewEntry {
  workDate: string;
  hours: number;
  category: EntryCategory;
  description?: string;
  auditId?: string;
  nonBillableReason?: NonBillableReason;
}

export interface DraftResult {
  entries: NewEntry[];
  errors: string[];
}

/**
 * Convierte el borrador en horas para guardar. `requireDescription` viene del servidor (cierre activo).
 * Los días de un mes cerrado se ignoran con aviso: ahí solo se pide un ajuste.
 */
export function buildEntries(
  rows: WeekRow[], values: DraftValues, meta: Record<string, RowMeta>, closed: MonthKey[], requireDescription: boolean,
): DraftResult {
  const entries: NewEntry[] = [];
  const errors: string[] = [];
  for (const row of rows) {
    const m = meta[row.key] ?? emptyMeta();
    const days = Object.entries(values[row.key] ?? {}).filter(([, raw]) => String(raw ?? '').trim() !== '');
    if (days.length === 0) continue;
    if (row.client) {
      if (requireDescription && m.description.trim().length < MIN_DESCRIPTION_LENGTH) {
        errors.push(`«${row.label}»: escribe una descripción de al menos ${MIN_DESCRIPTION_LENGTH} caracteres.`);
      }
      if (!m.billable && !m.reason) errors.push(`«${row.label}»: indica por qué no se factura.`);
    }
    for (const [workDate, raw] of days.sort(([a], [b]) => a.localeCompare(b))) {
      if (isClosedDay(workDate, closed)) {
        errors.push(`${workDate}: ese mes está cerrado, pide un ajuste.`);
        continue;
      }
      const hours = snapHours(raw);
      if (hours === null) { errors.push(`«${row.label}» ${workDate}: horas inválidas.`); continue; }
      if (hours > MAX_DAILY_HOURS) { errors.push(`«${row.label}» ${workDate}: más de ${MAX_DAILY_HOURS}h en un registro.`); continue; }
      entries.push({
        workDate, hours,
        category: row.client ? (m.billable ? 'CLIENT_BILLABLE' : 'CLIENT_NON_BILLABLE') : row.category,
        ...(row.client && m.description.trim() ? { description: m.description.trim() } : {}),
        ...(row.auditId ? { auditId: row.auditId } : {}),
        ...(row.client && !m.billable && m.reason ? { nonBillableReason: m.reason } : {}),
      });
    }
  }
  return { entries, errors };
}

/** Horas por día: lo ya guardado + el borrador. Sirve para el aviso del tope diario. */
export function dayTotals(
  days: string[], saved: { workDate: string; hours: number }[], draft: NewEntry[],
): Record<string, { saved: number; draft: number; total: number }> {
  const out: Record<string, { saved: number; draft: number; total: number }> = {};
  for (const d of days) out[d] = { saved: 0, draft: 0, total: 0 };
  for (const e of saved) { const k = e.workDate.slice(0, 10); if (out[k]) out[k].saved += e.hours; }
  for (const e of draft) if (out[e.workDate]) out[e.workDate].draft += e.hours;
  for (const d of days) out[d].total = out[d].saved + out[d].draft;
  return out;
}

export function overCapDays(totals: Record<string, { total: number }>): string[] {
  return Object.entries(totals).filter(([, t]) => t.total > MAX_DAILY_HOURS).map(([d]) => d).sort();
}

// ── Copiar la semana anterior ────────────────────────────────────────────────
export interface SavedEntryLike {
  workDate: string; hours: number; category: EntryCategory; description?: string | null;
  auditId?: string | null; nonBillableReason?: NonBillableReason | null;
}

/** Llave de la fila a la que pertenece una hora guardada, si esa fila existe esta semana. */
export function rowKeyOf(e: SavedEntryLike, rows: WeekRow[]): string | null {
  const key = e.auditId ? `audit:${e.auditId}` : `cat:${e.category}`;
  return rows.some((r) => r.key === key) ? key : null;
}

/**
 * Pasa las horas de la semana anterior al borrador de esta (mismo día de la semana). Lo que ya tiene horas guardadas ese día
 * en esa fila no se pisa, y los días de meses cerrados se saltan. Devuelve también cuántas horas no encontraron fila.
 */
export function copyPreviousWeek(
  previous: SavedEntryLike[], rows: WeekRow[], days: string[], saved: SavedEntryLike[], closed: MonthKey[],
): { values: DraftValues; meta: Record<string, RowMeta>; copied: number; skipped: number } {
  const values: DraftValues = {};
  const meta: Record<string, RowMeta> = {};
  const dayIndex = new Map(days.map((d, i) => [d, i]));
  const prevStart = addDays(days[0], -7);
  const occupied = new Set(saved.map((e) => `${rowKeyOf(e, rows) ?? '?'}|${e.workDate.slice(0, 10)}`));
  let copied = 0; let skipped = 0;
  for (const e of previous) {
    const key = rowKeyOf(e, rows);
    const offset = Math.round((parseDateKey(e.workDate.slice(0, 10)).getTime() - parseDateKey(prevStart).getTime()) / 86_400_000);
    const target = days[offset];
    if (!key || !target || !dayIndex.has(target) || isClosedDay(target, closed) || occupied.has(`${key}|${target}`)) { skipped++; continue; }
    const cell = values[key] ?? (values[key] = {});
    cell[target] = String(((parseFloat(cell[target] ?? '0') || 0) + e.hours));
    const row = rows.find((r) => r.key === key)!;
    if (row.client) {
      const m = meta[key] ?? (meta[key] = emptyMeta());
      if (!m.description && e.description) m.description = e.description;
      if (e.category === 'CLIENT_NON_BILLABLE') { m.billable = false; m.reason = e.nonBillableReason ?? ''; }
    }
    copied++;
  }
  return { values, meta, copied, skipped };
}

// ── Filas de la captura ──────────────────────────────────────────────────────
/** Una fila por encargo asignado (lleva descripción y facturable/no facturable) y una por categoría no ligada a un encargo. */
export function buildWeekRows(
  assignments: { audit: { id: string; title: string } }[],
  categories: { category: EntryCategory; label: string }[],
): WeekRow[] {
  return [
    ...assignments.map((a): WeekRow => ({
      key: `audit:${a.audit.id}`, label: a.audit.title, category: 'CLIENT_BILLABLE', auditId: a.audit.id, client: true,
    })),
    ...categories.map((c): WeekRow => ({ key: `cat:${c.category}`, label: c.label, category: c.category, client: false })),
  ];
}

/** Datos de un formulario de una sola hora (edición y ajustes) convertidos al formato del servidor. */
export interface SingleEntryForm {
  workDate: string;
  hours: string;
  rowKey: string;
  description: string;
  billable: boolean;
  reason: NonBillableReason | '';
}

export function buildSingleEntry(
  form: SingleEntryForm, rows: WeekRow[], requireDescription: boolean,
): { entry?: NewEntry; error?: string } {
  const row = rows.find((r) => r.key === form.rowKey);
  if (!row) return { error: 'Elige el encargo o la actividad.' };
  const hours = snapHours(form.hours);
  if (hours === null) return { error: 'Escribe las horas (por ejemplo 2 o 1.5).' };
  if (hours > MAX_DAILY_HOURS) return { error: `No se pueden registrar más de ${MAX_DAILY_HOURS}h en un registro.` };
  if (!form.workDate) return { error: 'Elige la fecha.' };
  if (row.client) {
    if (requireDescription && form.description.trim().length < MIN_DESCRIPTION_LENGTH) {
      return { error: `Escribe una descripción de al menos ${MIN_DESCRIPTION_LENGTH} caracteres.` };
    }
    if (!form.billable && !form.reason) return { error: 'Indica por qué no se factura.' };
  }
  return {
    entry: {
      workDate: form.workDate, hours,
      category: row.client ? (form.billable ? 'CLIENT_BILLABLE' : 'CLIENT_NON_BILLABLE') : row.category,
      ...(row.client && form.description.trim() ? { description: form.description.trim() } : {}),
      ...(row.auditId ? { auditId: row.auditId } : {}),
      ...(row.client && !form.billable && form.reason ? { nonBillableReason: form.reason } : {}),
    },
  };
}
