/**
 * Devengado de un encargo (docs/cobros-honorarios-diseno.md §4.8): cuánto del honorario ya se «ganó» según el avance del trabajo.
 *
 *  · Avance por HORAS = horas facturables ÷ horas presupuestadas del encargo. Sin presupuesto COMPLETO (alguien con horas sin presupuesto,
 *    o presupuesto 0) el avance es NULO: no se inventa. Tope 100 %, que se alcanza al emitirse el informe final (papel disparador firmado).
 *  · Por HITOS = Σ de cuotas con fecha de cumplimiento ÷ honorario.   · MANUAL = el porcentaje que fijó la dirección.
 *  · Por tiempo (TIME_BASED) no hay honorario fijo: sin datos de horas el ingreso es lo facturado; con ellos (Fase 4, §15) el devengado es
 *    lo facturado neto + las horas trabajadas aún sin facturar × su tarifa, y «por facturar» son esas horas.
 *  · Por facturar = devengado − facturado neto, sin negativos.
 * Todo en centavos enteros. Función pura: los datos los trae `AccrualService`.
 */
export type AccrualMethod = 'HOURS' | 'MILESTONES' | 'MANUAL';
export type AccrualBasis = 'HOURS' | 'COMPLETION' | 'MILESTONES' | 'MANUAL' | 'INVOICED' | 'TIME' | 'NONE';
export type AccrualMissing = 'NO_BUDGET' | 'NO_MANUAL_PROGRESS';

export interface AccrualInput {
  feeType: 'FIXED' | 'TIME_BASED';
  /** Honorario vigente al corte (con las adendas hasta esa fecha), neto. */
  feeTotalCents: number | null;
  method: AccrualMethod;
  /** Facturado neto al corte (facturas vigentes − notas de crédito vigentes). */
  invoicedNetCents: number;
  billableHours: number;
  /** Horas presupuestadas del encargo, o null si el presupuesto no está completo. */
  budgetHours: number | null;
  /** El papel disparador del informe final está firmado al corte. */
  completionDone: boolean;
  milestoneDoneCents: number;
  manualPct: number | null;
  /** Solo TIME_BASED (Fase 4): horas trabajadas aún sin facturar al corte, por su tarifa, en centavos. Sin este dato se usa lo facturado. */
  timeUnbilledCents?: number;
}

export interface AccrualResult {
  /** 0–100 con dos decimales, o null si no se puede calcular. */
  progressPct: number | null;
  accruedCents: number | null;
  toInvoiceCents: number | null;
  basis: AccrualBasis;
  missing: AccrualMissing | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function computeAccrual(i: AccrualInput): AccrualResult {
  if (i.feeType === 'TIME_BASED') {
    if (i.timeUnbilledCents !== undefined) {
      return { progressPct: null, accruedCents: i.invoicedNetCents + i.timeUnbilledCents, toInvoiceCents: i.timeUnbilledCents, basis: 'TIME', missing: null };
    }
    return { progressPct: null, accruedCents: i.invoicedNetCents, toInvoiceCents: null, basis: 'INVOICED', missing: null };
  }
  const fee = i.feeTotalCents ?? 0;
  let progress: number | null = null;
  let basis: AccrualBasis = 'NONE';
  let missing: AccrualMissing | null = null;

  if (i.method === 'HOURS') {
    if (i.completionDone) { progress = 1; basis = 'COMPLETION'; }
    else if (i.budgetHours === null || i.budgetHours <= 0) missing = 'NO_BUDGET';
    else { progress = Math.min(1, Math.max(0, i.billableHours / i.budgetHours)); basis = 'HOURS'; }
  } else if (i.method === 'MILESTONES') {
    progress = fee > 0 ? Math.min(1, Math.max(0, i.milestoneDoneCents / fee)) : null;
    basis = 'MILESTONES';
  } else {
    if (i.manualPct === null) missing = 'NO_MANUAL_PROGRESS';
    else { progress = Math.min(1, Math.max(0, i.manualPct / 100)); basis = 'MANUAL'; }
  }

  if (progress === null) return { progressPct: null, accruedCents: null, toInvoiceCents: null, basis: 'NONE', missing };
  const accruedCents = Math.round(fee * progress);
  return {
    progressPct: round2(progress * 100), accruedCents, toInvoiceCents: Math.max(0, accruedCents - i.invoicedNetCents), basis, missing: null,
  };
}
