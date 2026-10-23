/**
 * Qué costo por hora y qué tarifa vale para UNA hora registrada (Fase 2 del cierre de horas).
 *
 * · Hora de un mes CERRADO (`closedAt` con fecha): vale el costo y la tarifa que se congelaron al cerrar. Si al cerrar no había
 *   perfil de costeo (o tarifa pactada), el valor congelado es nulo y la hora queda SIN costear (o sin tarifa): NO se vuelve a
 *   mirar el perfil de hoy, porque entonces el margen de un mes cerrado cambiaría solo cuando alguien cree el perfil después.
 *   Para corregirlo se reabre y se vuelve a cerrar el mes.
 * · Hora de un mes ABIERTO (`closedAt` nulo): vale el perfil vigente, y el resultado es PROVISIONAL.
 * Con el cierre de horas apagado ninguna hora tiene `closedAt`, así que todo se calcula como antes.
 */
export type RateLike = { toString(): string } | number | string | null | undefined;

export interface RateSource {
  closedAt: Date | null;
  costRateSnapshot?: RateLike;
  billRateSnapshot?: RateLike;
}

export interface ResolvedRate {
  /** null = sin dato (nunca se asume $0). */
  rate: number | null;
  /** true = viene del cierre del mes; false = del perfil o la tarifa vigentes (provisional). */
  frozen: boolean;
}

const toNumber = (v: RateLike): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v.toString());
  return Number.isFinite(n) ? n : null;
};

export function resolveCostRate(e: RateSource, liveRate: number | null | undefined): ResolvedRate {
  if (e.closedAt) return { rate: toNumber(e.costRateSnapshot), frozen: true };
  return { rate: liveRate ?? null, frozen: false };
}

export function resolveBillRate(e: RateSource, liveRate: number | null | undefined): ResolvedRate {
  if (e.closedAt) return { rate: toNumber(e.billRateSnapshot), frozen: true };
  return { rate: liveRate ?? null, frozen: false };
}
