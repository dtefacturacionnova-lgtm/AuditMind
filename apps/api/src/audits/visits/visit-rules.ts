/**
 * Reglas puras de las visitas de una auditoría financiera externa (planificación, interina y final):
 * orden de las fechas de corte, qué balance es el vigente de una visita, qué visita alimenta los análisis de B-00,
 * comparación entre dos balances y puente interina → final.
 *
 * Sin base de datos ni red: todo lo que entra y sale son datos simples, para poder probarlo a fondo.
 * Diseño: docs/visitas-auditoria-financiera-propuesta.md (§8).
 *
 * Los importes se comparan en CENTAVOS enteros (nunca restando decimales de coma flotante) para que 0.1 + 0.2 no invente un desvío.
 */

export const VISIT_KINDS = ['PLANNING', 'INTERIM', 'FINAL'] as const;
export type VisitKind = (typeof VISIT_KINDS)[number];

/** Una cuenta de un balance de comprobación, tal como la guarda `TrialBalance.accounts`. */
export interface BalanceAccount {
  code: string;
  name?: string;
  debit?: number;
  credit?: number;
  balance?: number;
}

export interface VisitLite {
  kind: VisitKind;
  cutoffDate: Date | string;
}

const toDate = (d: Date | string): Date => (d instanceof Date ? d : new Date(d));
const dayKey = (d: Date | string): string => toDate(d).toISOString().slice(0, 10);
export const toCents = (n: number): number => Math.round(n * 100);
export const fromCents = (c: number): number => c / 100;

// ── Orden de las visitas ─────────────────────────────────────────────────────────────────────────

export interface CutoffIssue {
  code: 'FECHA_INVALIDA' | 'VISITA_REPETIDA' | 'ORDEN_FECHAS';
  message: string;
}

/**
 * Las fechas de corte deben ir en orden estricto: planificación < interina < final. Una visita sin fecha de corte válida o repetida
 * es un error. Con solo 2 visitas (p. ej. interina y final) se valida lo que haya.
 */
export function validateVisitCutoffs(visits: VisitLite[]): CutoffIssue[] {
  const issues: CutoffIssue[] = [];
  const seen = new Set<VisitKind>();
  for (const v of visits) {
    if (seen.has(v.kind)) issues.push({ code: 'VISITA_REPETIDA', message: `Ya existe una visita de tipo ${v.kind} en este encargo.` });
    seen.add(v.kind);
    if (Number.isNaN(toDate(v.cutoffDate).getTime())) issues.push({ code: 'FECHA_INVALIDA', message: `La fecha de corte de la visita ${v.kind} no es válida.` });
  }
  if (issues.length > 0) return issues;
  const ordered = [...visits].sort((a, b) => VISIT_KINDS.indexOf(a.kind) - VISIT_KINDS.indexOf(b.kind));
  for (let i = 1; i < ordered.length; i++) {
    const prev = ordered[i - 1];
    const cur = ordered[i];
    if (dayKey(cur.cutoffDate) <= dayKey(prev.cutoffDate)) {
      issues.push({ code: 'ORDEN_FECHAS', message: `La fecha de corte de la visita ${cur.kind} debe ser posterior a la de ${prev.kind}.` });
    }
  }
  return issues;
}

// ── Balance vigente de una visita y base de análisis ──────────────────────────────────────────────

export interface ImportedBalanceLite<T = unknown> {
  importedAt: Date | string;
  data: T;
}

/** De varias cargas de la misma visita, la vigente es la más reciente (corregir un balance crea otra carga, no pisa la anterior). */
export function currentBalance<T>(balances: ImportedBalanceLite<T>[]): ImportedBalanceLite<T> | null {
  let best: ImportedBalanceLite<T> | null = null;
  for (const b of balances) {
    if (best === null || toDate(b.importedAt).getTime() > toDate(best.importedAt).getTime()) best = b;
  }
  return best;
}

/**
 * Qué visita debe alimentar el `saldo_actual` de B-00 por defecto: la final si ya tiene balance; si no, la visita con balance
 * y fecha de corte más reciente. `null` si ninguna tiene balance.
 */
export function defaultAnalysisBase(visits: Array<VisitLite & { hasBalance: boolean }>): VisitKind | null {
  const withBalance = visits.filter((v) => v.hasBalance);
  if (withBalance.length === 0) return null;
  const final = withBalance.find((v) => v.kind === 'FINAL');
  if (final) return final.kind;
  return [...withBalance].sort((a, b) => toDate(b.cutoffDate).getTime() - toDate(a.cutoffDate).getTime())[0].kind;
}

// ── Cuentas ───────────────────────────────────────────────────────────────────────────────────────

export type AccountNature = 'BALANCE' | 'RESULTADOS' | 'SIN_CLASIFICAR';

/**
 * Naturaleza de la cuenta por el primer dígito del código (catálogo salvadoreño usado por B-00: 1 activo, 2 pasivo, 3 patrimonio,
 * 4–7 resultados). Un código que no empieza con dígito (o empieza con 0, 8 o 9) queda «sin clasificar»: se compara el movimiento
 * pero no se proyecta un saldo esperado.
 */
export function accountNature(code: string): AccountNature {
  const first = code.trim().charAt(0);
  if (first >= '1' && first <= '3') return 'BALANCE';
  if (first >= '4' && first <= '7') return 'RESULTADOS';
  return 'SIN_CLASIFICAR';
}

export interface NormalizedAccount {
  code: string;
  name: string;
  balanceCents: number;
}

/** Saldo de la cuenta: `balance` si viene; si no, débito − crédito. Cuentas repetidas en un mismo balance se suman. */
export function normalizeAccounts(accounts: BalanceAccount[]): Map<string, NormalizedAccount> {
  const out = new Map<string, NormalizedAccount>();
  for (const a of accounts) {
    const code = String(a.code ?? '').trim();
    if (code === '') continue;
    const raw = a.balance !== undefined && a.balance !== null ? a.balance : (a.debit ?? 0) - (a.credit ?? 0);
    const cents = Number.isFinite(raw) ? toCents(raw) : 0;
    const prev = out.get(code);
    if (prev) {
      prev.balanceCents += cents;
      if (!prev.name && a.name) prev.name = a.name;
    } else {
      out.set(code, { code, name: a.name ?? '', balanceCents: cents });
    }
  }
  return out;
}

// ── Comparación entre dos balances ────────────────────────────────────────────────────────────────

/** Variación porcentual con signo (+ sube, − baja) sobre el valor absoluto de la base, a 2 decimales. Evita `-0`. */
function signedPct(deltaCents: number, baseCents: number): number {
  const v = Math.round((deltaCents / Math.abs(baseCents)) * 10000) / 100;
  return v === 0 ? 0 : v;
}

export type CompareStatus = 'NUEVA' | 'DESAPARECIDA' | 'EN_CERO' | 'CAMBIO' | 'SIN_CAMBIO';

export interface CompareRow {
  code: string;
  name: string;
  status: CompareStatus;
  fromBalance: number | null;
  toBalance: number | null;
  delta: number;
  /** Variación porcentual sobre el saldo de origen (valor absoluto); `null` si el saldo de origen es cero o no existe. */
  deltaPct: number | null;
}

export interface CompareResult {
  rows: CompareRow[];
  summary: Record<CompareStatus, number>;
}

/**
 * Compara dos balances por código de cuenta.
 * - NUEVA: solo existe en `to`. DESAPARECIDA: solo existe en `from`.
 * - EN_CERO: existía con saldo y ahora está en cero (posible baja no documentada).
 * - CAMBIO / SIN_CAMBIO: existe en ambos.
 * Una cuenta que ya estaba en cero y sigue en cero es SIN_CAMBIO. Orden de salida: por código.
 */
export function compareBalances(from: BalanceAccount[], to: BalanceAccount[]): CompareResult {
  const a = normalizeAccounts(from);
  const b = normalizeAccounts(to);
  const codes = [...new Set([...a.keys(), ...b.keys()])].sort((x, y) => x.localeCompare(y, 'es', { numeric: true }));
  const rows: CompareRow[] = [];
  const summary: Record<CompareStatus, number> = { NUEVA: 0, DESAPARECIDA: 0, EN_CERO: 0, CAMBIO: 0, SIN_CAMBIO: 0 };
  for (const code of codes) {
    const x = a.get(code);
    const y = b.get(code);
    const fromC = x?.balanceCents ?? 0;
    const toC = y?.balanceCents ?? 0;
    let status: CompareStatus;
    if (!x) status = 'NUEVA';
    else if (!y) status = 'DESAPARECIDA';
    else if (fromC !== 0 && toC === 0) status = 'EN_CERO';
    else if (fromC === toC) status = 'SIN_CAMBIO';
    else status = 'CAMBIO';
    summary[status]++;
    rows.push({
      code,
      name: y?.name || x?.name || '',
      status,
      fromBalance: x ? fromCents(fromC) : null,
      toBalance: y ? fromCents(toC) : null,
      delta: fromCents(toC - fromC),
      deltaPct: x && fromC !== 0 ? signedPct(toC - fromC, fromC) : null,
    });
  }
  return { rows, summary };
}

// ── Puente interina → final ───────────────────────────────────────────────────────────────────────

export const DEFAULT_BRIDGE_PCT = 20;

export type BridgeAlertReason = 'MOVIMIENTO_SOBRE_ME' | 'DESVIO_SOBRE_ESPERADO' | 'CUENTA_NUEVA_MATERIAL' | 'CUENTA_DESAPARECIDA_MATERIAL';
export type BridgePresence = 'AMBAS' | 'SOLO_INTERINA' | 'SOLO_FINAL';

export interface BridgeRow {
  code: string;
  name: string;
  nature: AccountNature;
  presence: BridgePresence;
  interimBalance: number | null;
  finalBalance: number | null;
  /** final − interina. */
  movement: number;
  /** Solo cuentas de resultados con ambas presencias: saldo interina anualizado al cierre. */
  expectedFinal: number | null;
  /** final − esperado (solo cuentas de resultados). */
  deviation: number | null;
  /** |desvío| ÷ |esperado| × 100; `null` si el esperado es cero. */
  deviationPct: number | null;
  alert: boolean;
  reason: BridgeAlertReason | null;
  /** Texto del paso ROLLFORWARD sugerido cuando hay alerta (el auditor decide si lo crea). */
  suggestedStep: string | null;
}

export type BridgeWarning = 'SIN_MATERIALIDAD' | 'PERIODO_INVALIDO';

export interface BridgeInput {
  interim: BalanceAccount[];
  final: BalanceAccount[];
  interimCutoff: Date | string;
  /** Inicio y fin del ejercicio auditado. Si faltan, se asume el año calendario de la fecha de corte de la interina. */
  periodStart?: Date | string | null;
  periodEnd?: Date | string | null;
  /** Materialidad de ejecución del encargo. Si falta o es ≤ 0 el puente se calcula pero sin alertas por monto. */
  executionMateriality?: number | null;
  /** Variación porcentual mínima (sobre el esperado) para alertar en cuentas de resultados. */
  pctThreshold?: number;
}

export interface BridgeResult {
  rows: BridgeRow[];
  warnings: BridgeWarning[];
  /** Factor con el que se anualizaron los resultados (días del ejercicio ÷ días transcurridos); `null` si el período no es válido. */
  annualizationFactor: number | null;
  alerts: number;
}

const DAY_MS = 86_400_000;
const utcDay = (d: Date | string): number => {
  const x = toDate(d);
  return Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate());
};

/**
 * Factor de anualización de las cuentas de resultados: días del ejercicio ÷ días transcurridos hasta la fecha de corte (ambos
 * extremos incluidos). `null` si las fechas no forman un período válido o la fecha de corte cae fuera del ejercicio.
 */
export function annualizationFactor(cutoff: Date | string, periodStart?: Date | string | null, periodEnd?: Date | string | null): number | null {
  const c = toDate(cutoff);
  if (Number.isNaN(c.getTime())) return null;
  const year = c.getUTCFullYear();
  const start = periodStart ? utcDay(periodStart) : Date.UTC(year, 0, 1);
  const end = periodEnd ? utcDay(periodEnd) : Date.UTC(year, 11, 31);
  const cut = utcDay(c);
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return null;
  if (cut < start || cut > end) return null;
  const total = Math.round((end - start) / DAY_MS) + 1;
  const elapsed = Math.round((cut - start) / DAY_MS) + 1;
  return total / elapsed;
}

function stepText(row: Pick<BridgeRow, 'code' | 'name' | 'reason'>): string {
  const cuenta = `${row.code}${row.name ? ` ${row.name}` : ''}`;
  switch (row.reason) {
    case 'DESVIO_SOBRE_ESPERADO':
      return `Extender al cierre la conclusión de la interina sobre ${cuenta}: el saldo final se aparta de lo esperado según el avance del año. Obtener explicación de la gerencia y evidencia de las operaciones del período restante (NIA 330).`;
    case 'CUENTA_NUEVA_MATERIAL':
      return `La cuenta ${cuenta} no existía en la interina y tiene saldo material al cierre: identificar su origen y probar las operaciones que la generaron (NIA 330).`;
    case 'CUENTA_DESAPARECIDA_MATERIAL':
      return `La cuenta ${cuenta} tenía saldo material en la interina y ya no figura al cierre: verificar baja, reclasificación o cancelación y su documentación (NIA 330).`;
    default:
      return `Extender al cierre la conclusión de la interina sobre ${cuenta}: examinar las operaciones significativas del período restante y la razón del movimiento (NIA 330).`;
  }
}

/**
 * Puente interina → final por cuenta. Es una REFERENCIA para dirigir el trabajo del auditor, no una conclusión.
 * - Cuentas de balance (y sin clasificar): alerta si |movimiento| > materialidad de ejecución.
 * - Cuentas de resultados: esperado = saldo interina × factor de anualización; alerta si |final − esperado| > ME y además
 *   |desvío| ÷ |esperado| ≥ umbral porcentual (si el esperado es cero basta con superar la ME).
 * - Cuenta presente en una sola visita: se lista aparte (SOLO_INTERINA / SOLO_FINAL) y alerta si su saldo supera la ME.
 * - Sin materialidad válida: se calcula todo pero ninguna fila alerta, y se avisa con SIN_MATERIALIDAD.
 */
export function buildBridge(input: BridgeInput): BridgeResult {
  const me = input.executionMateriality;
  const meCents = me !== null && me !== undefined && Number.isFinite(me) && me > 0 ? toCents(me) : null;
  const pct = input.pctThreshold ?? DEFAULT_BRIDGE_PCT;
  const factor = annualizationFactor(input.interimCutoff, input.periodStart, input.periodEnd);
  const warnings: BridgeWarning[] = [];
  if (meCents === null) warnings.push('SIN_MATERIALIDAD');
  if (factor === null) warnings.push('PERIODO_INVALIDO');

  const a = normalizeAccounts(input.interim);
  const b = normalizeAccounts(input.final);
  const codes = [...new Set([...a.keys(), ...b.keys()])].sort((x, y) => x.localeCompare(y, 'es', { numeric: true }));
  const rows: BridgeRow[] = [];

  for (const code of codes) {
    const x = a.get(code);
    const y = b.get(code);
    const nature = accountNature(code);
    const presence: BridgePresence = x && y ? 'AMBAS' : x ? 'SOLO_INTERINA' : 'SOLO_FINAL';
    const intC = x?.balanceCents ?? 0;
    const finC = y?.balanceCents ?? 0;
    const movC = finC - intC;

    let expectedC: number | null = null;
    let deviationC: number | null = null;
    let deviationPct: number | null = null;
    let reason: BridgeAlertReason | null = null;

    if (presence === 'AMBAS') {
      if (nature === 'RESULTADOS' && factor !== null) {
        expectedC = Math.round(intC * factor);
        deviationC = finC - expectedC;
        deviationPct = expectedC !== 0 ? Math.round((Math.abs(deviationC) / Math.abs(expectedC)) * 10000) / 100 : null;
        if (meCents !== null && Math.abs(deviationC) > meCents && (deviationPct === null || deviationPct >= pct)) reason = 'DESVIO_SOBRE_ESPERADO';
      } else if (meCents !== null && Math.abs(movC) > meCents) {
        reason = 'MOVIMIENTO_SOBRE_ME';
      }
    } else if (presence === 'SOLO_FINAL') {
      if (meCents !== null && Math.abs(finC) > meCents) reason = 'CUENTA_NUEVA_MATERIAL';
    } else if (meCents !== null && Math.abs(intC) > meCents) {
      reason = 'CUENTA_DESAPARECIDA_MATERIAL';
    }

    const row: BridgeRow = {
      code,
      name: y?.name || x?.name || '',
      nature,
      presence,
      interimBalance: x ? fromCents(intC) : null,
      finalBalance: y ? fromCents(finC) : null,
      movement: fromCents(movC),
      expectedFinal: expectedC === null ? null : fromCents(expectedC),
      deviation: deviationC === null ? null : fromCents(deviationC),
      deviationPct,
      alert: reason !== null,
      reason,
      suggestedStep: null,
    };
    if (reason !== null) row.suggestedStep = stepText(row);
    rows.push(row);
  }
  return { rows, warnings, annualizationFactor: factor, alerts: rows.filter((r) => r.alert).length };
}
