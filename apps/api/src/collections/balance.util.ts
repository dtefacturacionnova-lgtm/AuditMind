import { ClientInvoiceStatus } from '@prisma/client';

/**
 * Saldo y estado de una factura registrada. Todo en centavos.
 *   saldo = total − retenido − acreditado − castigado − cobrado   (nunca negativo)
 * Las retenciones, las notas de crédito y los castigos bajan el saldo sin ser dinero recibido: por eso el cobrado solo suma
 * lo que entró de verdad al banco y una factura cobrada neta de retención llega a SETTLED.
 */
export interface InvoiceMoney {
  totalCents: number;
  paidCents: number;
  withheldCents: number;
  creditedCents: number;
  writtenOffCents: number;
}

export type LiveInvoiceStatus = 'OPEN' | 'PARTIAL' | 'SETTLED';

export const settledCents = (m: InvoiceMoney) => m.paidCents + m.withheldCents + m.creditedCents + m.writtenOffCents;

export const balanceCents = (m: InvoiceMoney) => m.totalCents - settledCents(m);

/** Estado que corresponde a los acumulados. Un saldo negativo es un error de programación, no un estado. */
export function deriveInvoiceStatus(m: InvoiceMoney): LiveInvoiceStatus {
  const balance = balanceCents(m);
  if (balance < 0) throw new Error(`Saldo negativo (${balance} centavos): se violó una regla de aplicación`);
  if (balance === 0) return 'SETTLED';
  return settledCents(m) > 0 ? 'PARTIAL' : 'OPEN';
}

/** Una factura admite cobros, retenciones, notas de crédito y castigos solo mientras esté abierta o parcial. */
export const isCollectable = (status: ClientInvoiceStatus) => status === 'OPEN' || status === 'PARTIAL';

/** Días de atraso a una fecha de corte (ambas YYYY-MM-DD). 0 si aún no vence. */
export function daysOverdue(dueDate: string, asOf: string): number {
  const ms = Date.parse(`${asOf}T00:00:00Z`) - Date.parse(`${dueDate}T00:00:00Z`);
  return Math.max(0, Math.floor(ms / 86_400_000));
}

export type AgingBucket = 'CURRENT' | 'D1_30' | 'D31_60' | 'D61_90' | 'D90_PLUS';

/** Cubeta de antigüedad por DÍAS VENCIDOS (corriente = aún no vence). */
export function agingBucket(dueDate: string, asOf: string): AgingBucket {
  const d = daysOverdue(dueDate, asOf);
  if (d <= 0) return 'CURRENT';
  if (d <= 30) return 'D1_30';
  if (d <= 60) return 'D31_60';
  if (d <= 90) return 'D61_90';
  return 'D90_PLUS';
}
