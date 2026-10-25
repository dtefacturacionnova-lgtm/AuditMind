import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

/**
 * Dinero en CENTAVOS ENTEROS. Toda suma, resta y comparación de la cobranza se hace en centavos para no arrastrar errores de
 * coma flotante; los montos entran y salen de la base como DECIMAL(12,2) y pasan por estas funciones en los dos sentidos.
 */

/** Tope por movimiento: 1.000.000.000,00 (igual que el reparto de cobros de Nexus). */
export const MAX_MONEY_CENTS = 100_000_000_000;

export type MoneyLike = Prisma.Decimal | number | string;

/** Centavos de un monto que ya está en la base o en el código (no valida el tope ni el signo). */
export function toCents(value: MoneyLike): number {
  const d = new Prisma.Decimal(value);
  if (!d.isFinite()) throw new Error(`Monto no numérico: ${String(value)}`);
  return d.mul(100).toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP).toNumber();
}

export function fromCents(cents: number): Prisma.Decimal {
  return new Prisma.Decimal(cents).div(100);
}

/** Para mostrar en mensajes: 1234.5 → "1,234.50". */
export function formatMoney(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${sign}$${whole}.${String(abs % 100).padStart(2, '0')}`;
}

/**
 * Valida un monto que llega del cliente (DTO): numérico, mayor que cero, de a lo sumo 2 decimales y dentro del tope.
 * Devuelve centavos. `label` es el nombre del campo para el mensaje.
 */
export function parseMoneyInput(raw: unknown, label = 'El monto'): number {
  if (typeof raw !== 'number' && typeof raw !== 'string') throw new BadRequestException(`${label} debe ser un número.`);
  let d: Prisma.Decimal;
  try { d = new Prisma.Decimal(raw); } catch { throw new BadRequestException(`${label} debe ser un número.`); }
  if (!d.isFinite()) throw new BadRequestException(`${label} debe ser un número.`);
  if (d.lte(0)) throw new BadRequestException(`${label} debe ser mayor que cero.`);
  if (d.decimalPlaces() > 2) throw new BadRequestException(`${label} admite como máximo 2 decimales.`);
  const cents = d.mul(100).toNumber();
  if (cents > MAX_MONEY_CENTS) throw new BadRequestException(`${label} supera el máximo permitido por movimiento.`);
  return cents;
}

/** Igual que `parseMoneyInput` pero admite negativos (adendas que bajan el honorario). No admite cero. */
export function parseSignedMoneyInput(raw: unknown, label = 'El monto'): number {
  if (typeof raw !== 'number' && typeof raw !== 'string') throw new BadRequestException(`${label} debe ser un número.`);
  let d: Prisma.Decimal;
  try { d = new Prisma.Decimal(raw); } catch { throw new BadRequestException(`${label} debe ser un número.`); }
  if (!d.isFinite() || d.isZero()) throw new BadRequestException(`${label} debe ser un número distinto de cero.`);
  if (d.decimalPlaces() > 2) throw new BadRequestException(`${label} admite como máximo 2 decimales.`);
  const cents = d.mul(100).toNumber();
  if (Math.abs(cents) > MAX_MONEY_CENTS) throw new BadRequestException(`${label} supera el máximo permitido por movimiento.`);
  return cents;
}

/** Monto que puede ser cero (IVA de una factura exenta, por ejemplo). */
export function parseNonNegativeMoneyInput(raw: unknown, label = 'El monto'): number {
  if (raw === 0 || raw === '0') return 0;
  return parseMoneyInput(raw, label);
}
