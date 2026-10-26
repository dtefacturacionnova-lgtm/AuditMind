import { agingBucket, AgingBucket } from './balance.util';

/**
 * Saldos a una FECHA DE CORTE (docs/cobros-honorarios-diseno.md §3.1, «Antigüedad a una fecha de corte»).
 *
 * Los acumulados de la factura (`paidAmount`, …) son una caché de HOY; para reconstruir cómo estaba una factura en el pasado se parte de
 * los MOVIMIENTOS, cada uno con la fecha en que surtió efecto y, si se deshizo, la fecha en que se deshizo. Así una anulación o una
 * reversión de después no reescribe el pasado: al 30 de septiembre una retención que se revirtió en octubre sigue contando.
 * Todo en centavos y fechas YYYY-MM-DD (en la zona de El Salvador).
 */
export type MovementKind = 'APPLICATION' | 'WITHHOLDING' | 'CREDIT_NOTE' | 'WRITE_OFF';

export interface CutoffMovement {
  invoiceId: string;
  kind: MovementKind;
  cents: number;
  /** Día en que surtió efecto (cobro aplicado, retención, nota emitida, castigo). */
  effectiveOn: string;
  /** Día en que se deshizo (aplicación quitada, retención revertida, nota anulada, castigo revertido) o null si sigue vigente. */
  undoneOn: string | null;
}

export interface CutoffInvoice {
  id: string;
  clientId: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  totalCents: number;
  /** Día en que se anuló, o null. */
  voidedOn: string | null;
}

/** Día (YYYY-MM-DD, hora de El Salvador, UTC−6) de un instante guardado como timestamp. */
export const salvadorDay = (d: Date): string => new Date(d.getTime() - 6 * 3_600_000).toISOString().slice(0, 10);

/** ¿El movimiento estaba vigente al cierre del día de corte? */
export const movementActiveAt = (m: CutoffMovement, asOf: string): boolean => m.effectiveOn <= asOf && (m.undoneOn === null || m.undoneOn > asOf);

/** ¿La factura existía (emitida y no anulada) al cierre del día de corte? */
export const invoiceExistsAt = (inv: CutoffInvoice, asOf: string): boolean => inv.invoiceDate <= asOf && (inv.voidedOn === null || inv.voidedOn > asOf);

export interface BalanceAtCutoff {
  /** Saldo recortado en 0 (lo que se muestra). */
  balanceCents: number;
  /** Saldo SIN recortar: negativo solo si los datos son incoherentes (un movimiento con fecha retroactiva que no cabía en esa fecha). */
  rawBalanceCents: number;
  paidCents: number;
  withheldCents: number;
  creditedCents: number;
  writtenOffCents: number;
}

/** Saldo de una factura al cierre del día de corte; null si la factura no existía entonces. Nunca negativo. */
export function balanceAt(inv: CutoffInvoice, moves: CutoffMovement[], asOf: string): BalanceAtCutoff | null {
  if (!invoiceExistsAt(inv, asOf)) return null;
  const sum = (kind: MovementKind) => moves.filter((m) => m.invoiceId === inv.id && m.kind === kind && movementActiveAt(m, asOf)).reduce((s, m) => s + m.cents, 0);
  const paidCents = sum('APPLICATION');
  const withheldCents = sum('WITHHOLDING');
  const creditedCents = sum('CREDIT_NOTE');
  const writtenOffCents = sum('WRITE_OFF');
  const raw = inv.totalCents - paidCents - withheldCents - creditedCents - writtenOffCents;
  return { balanceCents: Math.max(0, raw), rawBalanceCents: raw, paidCents, withheldCents, creditedCents, writtenOffCents };
}

/**
 * Un movimiento NUEVO con fecha de efecto en el pasado (una nota de crédito emitida hace días y registrada hoy, un cobro con fecha
 * anterior…) no debe dejar el saldo de la factura negativo en NINGUNA fecha desde la suya hasta hoy: si lo hiciera, la antigüedad a esa
 * fecha mostraría saldo 0 y el estado de cuenta no cuadraría. Devuelve la primera fecha en que quedaría negativo, o null si cabe.
 * Las fechas a revisar son la del movimiento nuevo, cada fecha de efecto o de reversa de los movimientos existentes desde entonces y hoy.
 */
export function firstNegativeDate(inv: CutoffInvoice, moves: CutoffMovement[], added: CutoffMovement[], today: string): { date: string; balanceCents: number } | null {
  if (added.length === 0) return null;
  const from = added.map((m) => m.effectiveOn).sort()[0];
  const all = [...moves, ...added];
  const dates = new Set<string>([today]);
  for (const m of all) {
    if (m.effectiveOn >= from) dates.add(m.effectiveOn);
    if (m.undoneOn && m.undoneOn >= from) dates.add(m.undoneOn);
  }
  for (const date of [...dates].filter((d) => d >= from && d <= today).sort()) {
    const b = balanceAt(inv, all, date);
    if (b && b.rawBalanceCents < 0) return { date, balanceCents: b.rawBalanceCents };
  }
  return null;
}

export interface AgingInvoiceRow {
  invoiceId: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  balanceCents: number;
  overdueDays: number;
  bucket: AgingBucket;
}

export interface AgingClientRow {
  clientId: string;
  totals: Record<AgingBucket, number>;
  totalCents: number;
  invoices: AgingInvoiceRow[];
}

const emptyBuckets = (): Record<AgingBucket, number> => ({ CURRENT: 0, D1_30: 0, D31_60: 0, D61_90: 0, D90_PLUS: 0 });

/** Antigüedad por cliente al corte: solo facturas con saldo > 0; «vencida» es saldo > 0 y vencimiento anterior al corte. */
export function agingAt(invoices: CutoffInvoice[], moves: CutoffMovement[], asOf: string): {
  clients: AgingClientRow[]; totals: Record<AgingBucket, number>; totalCents: number; anomalies: Array<{ invoiceId: string; invoiceNumber: string; balanceCents: number }>;
} {
  const byClient = new Map<string, AgingClientRow>();
  const anomalies: Array<{ invoiceId: string; invoiceNumber: string; balanceCents: number }> = [];
  for (const inv of invoices) {
    const b = balanceAt(inv, moves, asOf);
    // Un saldo negativo no se esconde: se reporta como anomalía de datos (la antigüedad solo lista saldos positivos).
    if (b && b.rawBalanceCents < 0) anomalies.push({ invoiceId: inv.id, invoiceNumber: inv.invoiceNumber, balanceCents: b.rawBalanceCents });
    if (!b || b.balanceCents <= 0) continue;
    const row = byClient.get(inv.clientId) ?? { clientId: inv.clientId, totals: emptyBuckets(), totalCents: 0, invoices: [] };
    const bucket = agingBucket(inv.dueDate, asOf);
    const overdueDays = Math.max(0, Math.floor((Date.parse(`${asOf}T00:00:00Z`) - Date.parse(`${inv.dueDate}T00:00:00Z`)) / 86_400_000));
    row.totals[bucket] += b.balanceCents;
    row.totalCents += b.balanceCents;
    row.invoices.push({ invoiceId: inv.id, invoiceNumber: inv.invoiceNumber, invoiceDate: inv.invoiceDate, dueDate: inv.dueDate, balanceCents: b.balanceCents, overdueDays, bucket });
    byClient.set(inv.clientId, row);
  }
  const clients = [...byClient.values()].sort((a, b) => b.totalCents - a.totalCents);
  const totals = emptyBuckets();
  let totalCents = 0;
  for (const c of clients) {
    (Object.keys(totals) as AgingBucket[]).forEach((k) => { totals[k] += c.totals[k]; });
    totalCents += c.totalCents;
    c.invoices.sort((a, b) => b.overdueDays - a.overdueDays || a.invoiceNumber.localeCompare(b.invoiceNumber));
  }
  return { clients, totals, totalCents, anomalies };
}

// ── Estado de cuenta ────────────────────────────────────────────────────────
export type StatementKind =
  | 'INVOICE' | 'INVOICE_VOIDED' | 'APPLICATION' | 'APPLICATION_REVERSED' | 'WITHHOLDING' | 'WITHHOLDING_REVERSED'
  | 'CREDIT_NOTE' | 'CREDIT_NOTE_VOIDED' | 'WRITE_OFF' | 'WRITE_OFF_REVERSED';

export interface StatementEvent {
  date: string;
  kind: StatementKind;
  /** Para desempatar eventos del mismo día: la factura primero, después sus movimientos. */
  order: number;
  reference: string;
  description: string;
  /** Aumenta lo que el cliente debe (factura; reversa de un descuento). */
  debitCents: number;
  /** Disminuye lo que debe (cobro, retención, nota de crédito, castigo; anulación de factura). */
  creditCents: number;
}

export interface StatementLine extends StatementEvent { balanceCents: number }

/**
 * Líneas del estado de cuenta con saldo corrido (saldo = lo que el cliente debe). Antes de `from` solo se acumula (saldo anterior);
 * después del corte `asOf` no entra nada. El saldo final coincide con la suma de saldos de las facturas al corte.
 */
export function buildStatement(events: StatementEvent[], opts: { asOf: string; from?: string | null }): { openingCents: number; lines: StatementLine[]; closingCents: number } {
  const ordered = events.filter((e) => e.date <= opts.asOf).sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order || a.reference.localeCompare(b.reference));
  let running = 0;
  let opening = 0;
  const lines: StatementLine[] = [];
  for (const e of ordered) {
    running += e.debitCents - e.creditCents;
    if (opts.from && e.date < opts.from) { opening = running; continue; }
    lines.push({ ...e, balanceCents: running });
  }
  return { openingCents: opts.from ? opening : 0, lines, closingCents: running };
}
