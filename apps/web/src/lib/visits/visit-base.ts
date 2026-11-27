/**
 * Lógica pura de la pestaña «Visitas» de B-00 (sin React ni red): pasar el balance de una visita a S1, detectar si S1 o la clasificación
 * quedaron con otra base y preparar el archivo que se carga a una visita. Diseño: docs/visitas-auditoria-financiera-propuesta.md (§8.3).
 */

export type VisitKind = 'PLANNING' | 'INTERIM' | 'FINAL';
export type VisitStatus = 'PLANNED' | 'IN_PROGRESS' | 'CLOSED';

export const VISIT_KINDS: readonly VisitKind[] = ['PLANNING', 'INTERIM', 'FINAL'];
export const VISIT_KIND_LABEL: Record<VisitKind, string> = { PLANNING: 'Planificación', INTERIM: 'Interina', FINAL: 'Final' };
export const VISIT_STATUS_LABEL: Record<VisitStatus, string> = { PLANNED: 'Planificada', IN_PROGRESS: 'En curso', CLOSED: 'Cerrada' };

/** Las filas de S1 (balance de comprobación) tal como las guarda B-00. */
export interface S1Row {
  cuenta: string;
  descripcion: string;
  saldo_actual: number;
  saldo_anterior: number;
  saldo_anterior2: number;
}

/** Una cuenta del balance vigente de una visita (la API ya las trae normalizadas: una fila por código, saldo neto). */
export interface VisitAccount {
  code: string;
  name: string;
  balance: number;
}

const cents = (n: unknown): number => Math.round((Number(n) || 0) * 100);
const key = (code: unknown): string => String(code ?? '').trim();

// ── Copiar la visita a S1 ─────────────────────────────────────────────────────────────────────────

export interface CopyStats {
  /** Cuentas de S1 que recibieron el saldo de la visita. */
  updated: number;
  /** Cuentas de la visita que no estaban en S1 y se agregaron (con histórico en cero). */
  added: number;
  /** Cuentas de S1 que la visita no trae: su saldo actual pasa a cero (sus saldos de años anteriores se conservan). */
  zeroed: number;
}

/**
 * Pone el balance de la visita en la columna `saldo_actual` de S1. Los históricos (`saldo_anterior`, `saldo_anterior2`) y las
 * descripciones ya escritas NO se tocan. Una cuenta de S1 que la visita no trae queda con saldo actual cero (no se borra: puede tener
 * histórico y es una baja que el auditor debe ver). Un código repetido en S1 recibe el saldo una sola vez para no duplicarlo.
 */
export function buildS1FromVisit(existing: S1Row[], accounts: VisitAccount[]): { rows: S1Row[]; stats: CopyStats } {
  const byCode = new Map<string, VisitAccount>();
  for (const a of accounts) byCode.set(key(a.code), a);

  const used = new Set<string>();
  const stats: CopyStats = { updated: 0, added: 0, zeroed: 0 };
  const rows: S1Row[] = existing.map((r) => {
    const code = key(r.cuenta);
    const hit = byCode.get(code);
    if (hit && !used.has(code)) {
      used.add(code);
      stats.updated++;
      return { ...r, descripcion: r.descripcion?.trim() ? r.descripcion : hit.name, saldo_actual: hit.balance };
    }
    if (cents(r.saldo_actual) !== 0) stats.zeroed++;
    return { ...r, saldo_actual: 0 };
  });

  for (const a of accounts) {
    const code = key(a.code);
    if (used.has(code)) continue;
    used.add(code);
    stats.added++;
    rows.push({ cuenta: code, descripcion: a.name, saldo_actual: a.balance, saldo_anterior: 0, saldo_anterior2: 0 });
  }
  return { rows, stats };
}

// ── ¿Coinciden S1 / la clasificación con la visita base? ──────────────────────────────────────────

function totalsByCode<T>(rows: T[], code: (r: T) => unknown, amount: (r: T) => unknown): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) {
    const k = key(code(r));
    if (k === '') continue;
    m.set(k, (m.get(k) ?? 0) + cents(amount(r)));
  }
  return m;
}

/** Cuántos códigos tienen un saldo distinto entre dos mapas (en centavos). Un código ausente vale cero. */
function differingCodes(a: Map<string, number>, b: Map<string, number>): number {
  let n = 0;
  for (const k of new Set([...a.keys(), ...b.keys()])) if ((a.get(k) ?? 0) !== (b.get(k) ?? 0)) n++;
  return n;
}

/** Cuántas cuentas tienen en S1 un saldo actual distinto al de la visita. 0 = S1 ya está sobre esa base. */
export function s1DiffersFromVisit(s1: S1Row[], accounts: VisitAccount[]): number {
  return differingCodes(
    totalsByCode(s1, (r) => r.cuenta, (r) => r.saldo_actual),
    totalsByCode(accounts, (a) => a.code, (a) => a.balance),
  );
}

/** Cuántas cuentas tienen en S2 (clasificación) un saldo actual distinto al de S1. > 0 = la clasificación y lo propagado quedaron viejos. */
export function classificationDiffersFromS1(s1: S1Row[], s2: Array<{ cuenta: string; saldo_actual: number }>): number {
  return differingCodes(
    totalsByCode(s1, (r) => r.cuenta, (r) => r.saldo_actual),
    totalsByCode(s2, (r) => r.cuenta, (r) => r.saldo_actual),
  );
}

// ── Archivo de saldos → cuentas de la visita ──────────────────────────────────────────────────────

export const MAX_VISIT_ACCOUNTS = 20000;

export interface VisitAccountInput {
  code: string;
  name: string;
  debit: number;
  credit: number;
  balance: number;
}

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Las filas leídas del archivo (las mismas de S1: cuenta, descripción, saldo) a lo que recibe la API. El saldo es neto: positivo va al
 * débito y negativo al crédito, así que un balance que cuadra suma cero.
 */
export function toVisitAccounts(rows: Array<{ cuenta: string; descripcion: string; saldo_actual: number }>): VisitAccountInput[] {
  return rows.map((r) => {
    const balance = round2(Number(r.saldo_actual) || 0);
    return {
      code: key(r.cuenta).slice(0, 60),
      name: String(r.descripcion ?? '').trim().slice(0, 300),
      debit: balance > 0 ? balance : 0,
      credit: balance < 0 ? -balance : 0,
      balance,
    };
  });
}

export function balanceTotals(accounts: VisitAccountInput[]): { totalDebit: number; totalCredit: number; balanced: boolean } {
  const totalDebit = round2(accounts.reduce((s, a) => s + a.debit, 0));
  const totalCredit = round2(accounts.reduce((s, a) => s + a.credit, 0));
  // En centavos enteros: restar decimales deja 0.00999… en una diferencia de un centavo y la daría por cuadrada.
  return { totalDebit, totalCredit, balanced: cents(totalDebit) === cents(totalCredit) };
}

// ── Fechas y estados ──────────────────────────────────────────────────────────────────────────────

/** Fechas de corte propuestas al activar las visitas (el auditor las ajusta): marzo, septiembre y diciembre del año. */
export function defaultCutoffs(year: number): { planning: string; interim: string; final: string } {
  return { planning: `${year}-03-31`, interim: `${year}-09-30`, final: `${year}-12-31` };
}

/** Las tres fechas deben ser `AAAA-MM-DD` reales y estar en orden estricto. Devuelve el mensaje del problema o `null`. */
export function cutoffsProblem(d: { planning: string; interim: string; final: string }): string | null {
  const real = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(`${s}T00:00:00.000Z`).toISOString().slice(0, 10) === s;
  if (![d.planning, d.interim, d.final].every((s) => real(s))) return 'Escribe las tres fechas de corte completas.';
  if (!(d.planning < d.interim && d.interim < d.final)) return 'Las fechas deben ir en orden: planificación, luego interina, luego final.';
  return null;
}

export interface StatusAction {
  to: VisitStatus;
  label: string;
}

/** Los cambios de estado que se ofrecen en pantalla (la API acepta además volver de «en curso» a «planificada»). */
export function statusActions(status: VisitStatus): StatusAction[] {
  if (status === 'PLANNED') return [{ to: 'IN_PROGRESS', label: 'Iniciar' }, { to: 'CLOSED', label: 'Cerrar' }];
  if (status === 'IN_PROGRESS') return [{ to: 'CLOSED', label: 'Cerrar' }];
  return [{ to: 'IN_PROGRESS', label: 'Reabrir' }];
}

/** `2026-09-30` → `30/09/2026` (sin pasar por Date: no hay corrimiento por zona horaria). */
export function fmtDay(iso: string | null | undefined): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return '—';
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}
