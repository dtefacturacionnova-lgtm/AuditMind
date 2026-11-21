/**
 * Cálculos de precio, costo y margen del editor de planes (SOLO superadmin: nunca se muestran al cliente).
 * Todo es puro y se prueba aparte. El costo de IA sale de los parámetros de la plataforma (costo por petición y multiplicador);
 * el del espacio es un valor ilustrativo (tarifas de Supabase y Cloudflare R2 del 2026-11-21, a confirmar).
 */

/** USD por GB-mes sobre lo incluido: Supabase Pro. VALOR ILUSTRATIVO. */
export const STORAGE_USD_PER_GB_SUPABASE = 0.0213;
/** USD por GB-mes: Cloudflare R2 (sin cobro de descargas). VALOR ILUSTRATIVO. */
export const STORAGE_USD_PER_GB_R2 = 0.015;

/** Redondeo a centavos sin errores de coma flotante (0.1 + 0.2). */
export const roundCents = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/** Número desde un Decimal del API (texto o número); null si no es un número válido. */
export function toNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Equivalencia por mes de un precio de licencia (null si no vence: no hay mes que dividir). */
export function monthlyEquivalent(price: number, months: number): number | null {
  if (!Number.isFinite(price) || months <= 0) return null;
  return price / months;
}

/** Precio por mes más bajo entre las duraciones activas con vencimiento; null si no hay ninguna. */
export function lowestMonthlyPrice(prices: ReadonlyArray<{ months: number; price: number | null; on: boolean }>): number | null {
  let best: number | null = null;
  for (const p of prices) {
    if (!p.on || p.price === null || p.price < 0) continue;
    const eq = monthlyEquivalent(p.price, p.months);
    if (eq !== null && (best === null || eq < best)) best = eq;
  }
  return best;
}

/** Costo esperado de las peticiones de IA al mes: peticiones × costo por petición. -1 (sin tope) no tiene costo calculable. */
export function aiExpectedCost(requests: number, costPerRequestUsd: number): number | null {
  if (!Number.isFinite(requests) || requests < 0 || !Number.isFinite(costPerRequestUsd)) return null;
  return requests * costPerRequestUsd;
}

/** Tope de seguridad: costo esperado × multiplicador (si el gasto real lo supera, la IA se pausa). */
export function aiSafetyCap(requests: number, costPerRequestUsd: number, multiplier: number): number | null {
  const expected = aiExpectedCost(requests, costPerRequestUsd);
  if (expected === null || !Number.isFinite(multiplier)) return null;
  return expected * multiplier;
}

/** Costo del espacio lleno (GB × tarifa). -1 (sin tope) no tiene costo calculable. */
export function storageCost(gb: number, usdPerGb: number = STORAGE_USD_PER_GB_SUPABASE): number | null {
  if (!Number.isFinite(gb) || gb < 0) return null;
  return gb * usdPerGb;
}

export interface Margin {
  /** Precio menos costo, en USD. */
  amount: number;
  /** Porcentaje entero sobre el precio. */
  pct: number;
}

/** Margen sobre el precio mensual de referencia; null si falta el precio o el costo. */
export function marginOver(monthlyPrice: number | null, totalCost: number | null): Margin | null {
  if (monthlyPrice === null || totalCost === null || !(monthlyPrice > 0)) return null;
  return { amount: monthlyPrice - totalCost, pct: Math.round((1 - totalCost / monthlyPrice) * 100) };
}

/** Suma costos; si alguno no se puede calcular (sin tope), el total tampoco. */
export function sumCosts(...costs: Array<number | null>): number | null {
  let total = 0;
  for (const c of costs) {
    if (c === null) return null;
    total += c;
  }
  return total;
}

/** «$8.13»; con `digits` para costos por petición («$0.0012»). */
export function usd(n: number | null | undefined, digits = 2): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** Entero con separador de miles. */
export const intText = (n: number): string => n.toLocaleString('en-US');
