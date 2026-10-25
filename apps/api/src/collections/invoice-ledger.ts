import { ConflictException, UnprocessableEntityException } from '@nestjs/common';
import { ClientInvoiceStatus, Prisma } from '@prisma/client';
import { Db } from './collections.common';
import { InvoiceMoney, balanceCents, deriveInvoiceStatus, isCollectable, settledCents } from './balance.util';
import { formatMoney, fromCents, toCents } from './money.util';

/**
 * Único punto donde cambian los acumulados de una factura (cobrado, retenido, acreditado, castigado) y su estado.
 * La fila de la factura ya debe estar bloqueada (FOR UPDATE) y leída DESPUÉS del candado; aun así la escritura es condicional
 * al estado leído, de modo que un camino que olvide el candado falla en voz alta (409) en lugar de pisar el dato.
 */
export interface LedgerInvoice {
  id: string;
  invoiceNumber: string;
  status: ClientInvoiceStatus;
  totalAmount: Prisma.Decimal;
  paidAmount: Prisma.Decimal;
  withheldAmount: Prisma.Decimal;
  creditedAmount: Prisma.Decimal;
  writtenOffAmount: Prisma.Decimal;
}

export const moneyOf = (inv: LedgerInvoice): InvoiceMoney => ({
  totalCents: toCents(inv.totalAmount),
  paidCents: toCents(inv.paidAmount),
  withheldCents: toCents(inv.withheldAmount),
  creditedCents: toCents(inv.creditedAmount),
  writtenOffCents: toCents(inv.writtenOffAmount),
});

export const invoiceBalance = (inv: LedgerInvoice) => balanceCents(moneyOf(inv));

export interface LedgerDelta { paidCents?: number; withheldCents?: number; creditedCents?: number; writtenOffCents?: number }

export async function applyInvoiceDelta(db: Db, inv: LedgerInvoice, delta: LedgerDelta): Promise<{ status: 'OPEN' | 'PARTIAL' | 'SETTLED'; balanceCents: number }> {
  const before = moneyOf(inv);
  const after: InvoiceMoney = {
    totalCents: before.totalCents,
    paidCents: before.paidCents + (delta.paidCents ?? 0),
    withheldCents: before.withheldCents + (delta.withheldCents ?? 0),
    creditedCents: before.creditedCents + (delta.creditedCents ?? 0),
    writtenOffCents: before.writtenOffCents + (delta.writtenOffCents ?? 0),
  };
  const adds = Object.values(delta).some((v) => (v ?? 0) > 0);
  if (adds && !isCollectable(inv.status)) {
    throw new ConflictException(`La factura ${inv.invoiceNumber} está en estado ${inv.status}: solo admite movimientos si está abierta o con saldo pendiente.`);
  }
  if (after.paidCents < 0 || after.withheldCents < 0 || after.creditedCents < 0 || after.writtenOffCents < 0) {
    throw new Error(`Acumulados negativos en la factura ${inv.id}: una reversión descontó más de lo registrado`);
  }
  const balance = balanceCents(after);
  if (balance < 0) {
    throw new UnprocessableEntityException(
      `La factura ${inv.invoiceNumber} tiene un saldo de ${formatMoney(balanceCents(before))} y el movimiento lo dejaría en ${formatMoney(balance)}.`,
    );
  }
  const status = deriveInvoiceStatus(after);
  const res = await db.clientInvoice.updateMany({
    where: {
      id: inv.id, status: inv.status,
      paidAmount: inv.paidAmount, withheldAmount: inv.withheldAmount, creditedAmount: inv.creditedAmount, writtenOffAmount: inv.writtenOffAmount,
    },
    data: {
      paidAmount: fromCents(after.paidCents), withheldAmount: fromCents(after.withheldCents),
      creditedAmount: fromCents(after.creditedCents), writtenOffAmount: fromCents(after.writtenOffCents), status,
    },
  });
  if (res.count !== 1) throw new ConflictException('La factura cambió mientras se procesaba el movimiento; vuelve a intentarlo.');
  return { status, balanceCents: balance };
}

/** Suma de lo descontado (para mensajes y chequeos). */
export const settledOf = (inv: LedgerInvoice) => settledCents(moneyOf(inv));
