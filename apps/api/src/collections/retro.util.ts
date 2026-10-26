import { UnprocessableEntityException } from '@nestjs/common';
import { CreditNoteStatus, Prisma, WriteOffStatus } from '@prisma/client';
import { Db, todayInSalvador, ymd } from './collections.common';
import { CutoffInvoice, CutoffMovement, firstNegativeDate, salvadorDay } from './cutoff.util';
import { toCents } from './money.util';

/** Todos los movimientos de una factura (vigentes y deshechos) en el formato de la reconstrucción a una fecha de corte. */
export async function loadInvoiceMovements(db: Db, invoiceId: string): Promise<CutoffMovement[]> {
  const [apps, whs, notes, offs] = await Promise.all([
    db.paymentApplication.findMany({ where: { invoiceId } }),
    db.invoiceWithholding.findMany({ where: { invoiceId } }),
    db.clientCreditNote.findMany({ where: { invoiceId } }),
    db.clientWriteOff.findMany({ where: { invoiceId } }),
  ]);
  return [
    ...apps.map((a): CutoffMovement => ({ invoiceId, kind: 'APPLICATION', cents: toCents(a.amount), effectiveOn: ymd(a.appliedOn), undoneOn: a.reversedAt ? salvadorDay(a.reversedAt) : null })),
    ...whs.map((w): CutoffMovement => ({ invoiceId, kind: 'WITHHOLDING', cents: toCents(w.amount), effectiveOn: ymd(w.appliedOn), undoneOn: w.reversedAt ? salvadorDay(w.reversedAt) : null })),
    ...notes.map((n): CutoffMovement => ({ invoiceId, kind: 'CREDIT_NOTE', cents: toCents(n.totalAmount), effectiveOn: ymd(n.issueDate), undoneOn: n.status === CreditNoteStatus.VOID && n.voidedAt ? salvadorDay(n.voidedAt) : null })),
    ...offs.map((w): CutoffMovement => ({ invoiceId, kind: 'WRITE_OFF', cents: toCents(w.amount), effectiveOn: ymd(w.writtenOffOn), undoneOn: w.status === WriteOffStatus.REVERSED && w.reversedAt ? salvadorDay(w.reversedAt) : null })),
  ];
}

type InvoiceDates = Pick<Prisma.ClientInvoiceGetPayload<object>, 'id' | 'clientId' | 'invoiceNumber' | 'invoiceDate' | 'dueDate' | 'totalAmount' | 'status' | 'voidedAt'>;

/**
 * Un movimiento con fecha de efecto en el PASADO (una nota de crédito emitida hace días y registrada hoy, un cobro con fecha anterior…)
 * no puede dejar el saldo de la factura negativo en ninguna fecha desde la suya hasta hoy: la antigüedad a esa fecha mostraría saldo 0 y
 * el estado de cuenta no cuadraría. Se llama dentro de la transacción, con la factura ya bloqueada y ANTES de insertar el movimiento.
 */
export async function assertNoNegativePast(db: Db, invoice: InvoiceDates, added: CutoffMovement[]): Promise<void> {
  const today = todayInSalvador();
  if (!added.some((m) => m.effectiveOn < today)) return; // con fecha de hoy basta el saldo vigente, que ya se valida aparte
  const inv: CutoffInvoice = {
    id: invoice.id, clientId: invoice.clientId, invoiceNumber: invoice.invoiceNumber, invoiceDate: ymd(invoice.invoiceDate), dueDate: ymd(invoice.dueDate),
    totalCents: toCents(invoice.totalAmount), voidedOn: invoice.status === 'VOID' && invoice.voidedAt ? salvadorDay(invoice.voidedAt) : null,
  };
  const bad = firstNegativeDate(inv, await loadInvoiceMovements(db, invoice.id), added, today);
  if (bad) {
    throw new UnprocessableEntityException(
      `Con esa fecha, la factura ${invoice.invoiceNumber} habría quedado con saldo negativo el ${bad.date}: otros movimientos ya la habían saldado entonces. ` +
      'Usa la fecha de hoy, o corrige antes esos movimientos (por ejemplo, una aplicación que quitaste).',
    );
  }
}

/** Fecha del primer movimiento (vigente o deshecho) de una factura, o null si no tiene. */
export async function firstMovementDate(db: Db, invoiceId: string): Promise<string | null> {
  const [a, w, n, o] = await Promise.all([
    db.paymentApplication.aggregate({ where: { invoiceId }, _min: { appliedOn: true } }),
    db.invoiceWithholding.aggregate({ where: { invoiceId }, _min: { appliedOn: true } }),
    db.clientCreditNote.aggregate({ where: { invoiceId }, _min: { issueDate: true } }),
    db.clientWriteOff.aggregate({ where: { invoiceId }, _min: { writtenOffOn: true } }),
  ]);
  const dates = [a._min.appliedOn, w._min.appliedOn, n._min.issueDate, o._min.writtenOffOn].filter((d): d is Date => !!d).map(ymd).sort();
  return dates[0] ?? null;
}
