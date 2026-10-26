/**
 * Aritmética de las horas facturables (Fase 4, docs/cobros-honorarios-diseno.md §15). Todo en enteros: las horas se llevan a
 * diezmilésimas (4 decimales) y la tarifa en centavos, así el monto de una hora es exactamente `ROUND(horas × tarifa, 2)` con
 * redondeo de .5 hacia arriba, igual que el CHECK de la base (`amount = ROUND(hours * rate, 2)` sobre numéricos exactos).
 */

/** Tope de horas por factura (acota la transacción y la pantalla de selección). */
export const MAX_HOURS_PER_INVOICE = 500;

const UNITS = 10_000;

/** Horas → diezmilésimas de hora (entero). */
export const hoursUnits = (hours: number): number => Math.round(hours * UNITS);

/** Diezmilésimas → texto con 4 decimales, tal como se guarda (`DECIMAL(9,4)`). */
export const unitsToDecimal = (units: number): string => (units / UNITS).toFixed(4);

/** Monto neto, en centavos, de `hours` horas a `rateCents` centavos por hora. */
export function lineAmountCents(hours: number, rateCents: number): number {
  return Math.floor((rateCents * hoursUnits(hours) + UNITS / 2) / UNITS);
}

export interface HourLine {
  timeEntryId: string;
  hoursUnits: number;
  rateCents: number;
  amountCents: number;
}

/** Línea facturable de una hora; nula si la tarifa o las horas no permiten facturarla. */
export function buildHourLine(timeEntryId: string, hours: number, rateCents: number | null): HourLine | null {
  if (rateCents === null || rateCents <= 0) return null;
  const units = hoursUnits(hours);
  if (units <= 0) return null;
  return { timeEntryId, hoursUnits: units, rateCents, amountCents: lineAmountCents(hours, rateCents) };
}

export const sumLines = (lines: Pick<HourLine, 'amountCents'>[]): number => lines.reduce((s, l) => s + l.amountCents, 0);

/** Mes (AAAA-MM) de la fecha de trabajo guardada como medianoche UTC. */
export const monthOf = (workDate: Date): string => workDate.toISOString().slice(0, 7);
