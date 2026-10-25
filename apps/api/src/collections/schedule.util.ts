import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

/**
 * Generador del calendario de cobros (reglas puras). Reparte lo que falta por programar de un honorario en cuotas iguales,
 * por hitos o en un pago único, siempre en centavos y con la última cuota absorbiendo los centavos sobrantes.
 */
export type YMD = string;
export type ScheduleKind = 'INSTALLMENT' | 'MILESTONE' | 'ADVANCE';

export interface PlannedItem {
  sequence: number;
  label: string;
  kind: ScheduleKind;
  dueDate: YMD;
  amountCents: number;
}

export const MAX_INSTALLMENTS = 60;
export const ALLOWED_INTERVALS = [1, 2, 3, 4, 6, 12] as const;

const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function assertValidYmd(value: unknown, label = 'La fecha'): YMD {
  const m = typeof value === 'string' ? YMD_RE.exec(value) : null;
  if (!m) throw new BadRequestException(`${label} debe tener el formato AAAA-MM-DD.`);
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) {
    throw new BadRequestException(`${label} no es una fecha real.`);
  }
  return value as YMD;
}

const daysInMonth = (y: number, m0: number) => new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();

/**
 * Suma `months` meses a una fecha. Si el día no existe en el mes de destino se usa el último día de ese mes
 * (31-ene + 1 mes = 28-feb). Siempre se cuenta desde la fecha ORIGINAL, así no se acumula el recorte (31-ene + 2 = 31-mar).
 */
export function addMonthsClamped(first: YMD, months: number): YMD {
  const [y, m, d] = first.split('-').map(Number);
  const total = (m - 1) + months;
  const ty = y + Math.floor(total / 12);
  const tm0 = ((total % 12) + 12) % 12;
  const td = Math.min(d, daysInMonth(ty, tm0));
  return `${String(ty).padStart(4, '0')}-${String(tm0 + 1).padStart(2, '0')}-${String(td).padStart(2, '0')}`;
}

function assertBase(baseCents: number) {
  if (!Number.isInteger(baseCents) || baseCents <= 0) {
    throw new BadRequestException('No hay monto por programar: el honorario ya está programado o facturado por completo.');
  }
}

export function equalInstallments(args: {
  baseCents: number; count: number; firstDate: YMD; everyMonths: number; startSequence: number; labelOf?: (n: number, count: number) => string;
}): PlannedItem[] {
  assertBase(args.baseCents);
  const { count, everyMonths } = args;
  if (!Number.isInteger(count) || count < 1 || count > MAX_INSTALLMENTS) {
    throw new BadRequestException(`La cantidad de cuotas debe estar entre 1 y ${MAX_INSTALLMENTS}.`);
  }
  if (!(ALLOWED_INTERVALS as readonly number[]).includes(everyMonths)) {
    throw new BadRequestException(`El intervalo debe ser de ${ALLOWED_INTERVALS.join(', ')} meses.`);
  }
  assertValidYmd(args.firstDate, 'La fecha de la primera cuota');
  const base = Math.floor(args.baseCents / count);
  if (base < 1) throw new BadRequestException('El monto por programar no alcanza para esa cantidad de cuotas.');
  const labelOf = args.labelOf ?? ((n: number, c: number) => (c === 1 ? 'Honorarios' : `Cuota ${n} de ${c}`));
  const items: PlannedItem[] = [];
  let allocated = 0;
  for (let i = 0; i < count; i++) {
    const last = i === count - 1;
    const amount = last ? args.baseCents - allocated : base;
    allocated += amount;
    items.push({
      sequence: args.startSequence + i, label: labelOf(i + 1, count), kind: 'INSTALLMENT',
      dueDate: addMonthsClamped(args.firstDate, i * everyMonths), amountCents: amount,
    });
  }
  return items;
}

export interface MilestoneInput {
  label: string;
  date: YMD;
  /** Porcentaje del monto por programar (hasta 2 decimales). Todos los hitos usan porcentaje o todos usan monto. */
  percent?: number | string;
  /** Monto en centavos. */
  amountCents?: number;
}

export function milestoneItems(args: { baseCents: number; milestones: MilestoneInput[]; startSequence: number }): PlannedItem[] {
  assertBase(args.baseCents);
  const ms = args.milestones;
  if (!Array.isArray(ms) || ms.length < 1 || ms.length > MAX_INSTALLMENTS) {
    throw new BadRequestException(`Indica entre 1 y ${MAX_INSTALLMENTS} hitos.`);
  }
  // null cuenta como ausente: el cliente puede mandar {"percent": null}
  const usesPercent = ms.every((m) => m.percent != null && m.amountCents == null);
  const usesAmount = ms.every((m) => m.amountCents != null && m.percent == null);
  if (!usesPercent && !usesAmount) {
    throw new BadRequestException('Todos los hitos deben indicar porcentaje, o todos deben indicar monto.');
  }
  for (const m of ms) {
    if (typeof m.label !== 'string' || m.label.trim().length === 0) throw new BadRequestException('Cada hito necesita una etiqueta.');
    assertValidYmd(m.date, `La fecha del hito «${m.label}»`);
  }
  const ordered = ms.map((m, i) => ({ m, i })).sort((a, b) => (a.m.date === b.m.date ? a.i - b.i : a.m.date < b.m.date ? -1 : 1)).map((x) => x.m);

  let amounts: number[];
  if (usesPercent) {
    // Puntos base (centésimas de punto porcentual) para sumar sin coma flotante.
    const bps = ordered.map((m) => {
      let d: Prisma.Decimal;
      try { d = new Prisma.Decimal(m.percent as number | string); } catch { throw new BadRequestException('Los porcentajes deben ser números.'); }
      if (!d.isFinite() || d.lte(0) || d.decimalPlaces() > 2) throw new BadRequestException('Los porcentajes deben ser positivos y de a lo sumo 2 decimales.');
      return d.mul(100).toNumber();
    });
    if (bps.reduce((a, b) => a + b, 0) !== 10_000) throw new BadRequestException('Los porcentajes de los hitos deben sumar exactamente 100 %.');
    amounts = bps.map((bp) => Math.round((args.baseCents * bp) / 10_000));
    amounts[amounts.length - 1] += args.baseCents - amounts.reduce((a, b) => a + b, 0);
  } else {
    amounts = ordered.map((m) => m.amountCents as number);
    if (amounts.some((a) => !Number.isInteger(a) || a <= 0)) throw new BadRequestException('Los montos de los hitos deben ser positivos.');
    if (amounts.reduce((a, b) => a + b, 0) !== args.baseCents) {
      throw new BadRequestException('Los montos de los hitos deben sumar exactamente lo que falta por programar.');
    }
  }
  if (amounts.some((a) => a <= 0)) throw new BadRequestException('Algún hito quedó en cero: ajusta los porcentajes.');
  return ordered.map((m, i) => ({
    sequence: args.startSequence + i, label: m.label.trim(), kind: 'MILESTONE' as const, dueDate: m.date, amountCents: amounts[i],
  }));
}

export function singlePayment(args: { baseCents: number; date: YMD; label?: string; startSequence: number }): PlannedItem[] {
  assertBase(args.baseCents);
  assertValidYmd(args.date, 'La fecha del pago');
  return [{ sequence: args.startSequence, label: args.label?.trim() || 'Honorarios', kind: 'INSTALLMENT', dueDate: args.date, amountCents: args.baseCents }];
}
