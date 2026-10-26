import { Prisma } from '@prisma/client';
import { ymd } from './collections.common';

/** Presentación de las notas de crédito y los castigos (compartida por sus servicios y por el detalle de la factura). */
export function creditNoteRow(n: Prisma.ClientCreditNoteGetPayload<object>) {
  return {
    id: n.id, clientId: n.clientId, engagementId: n.engagementId, invoiceId: n.invoiceId,
    creditNoteNumber: n.creditNoteNumber, generationCode: n.generationCode, issueDate: ymd(n.issueDate),
    netAmount: Number(n.netAmount), taxAmount: Number(n.taxAmount), totalAmount: Number(n.totalAmount),
    reason: n.reason, status: n.status, voidedAt: n.voidedAt, voidReason: n.voidReason, createdAt: n.createdAt,
  };
}

export function writeOffRow(w: Prisma.ClientWriteOffGetPayload<object>) {
  return {
    id: w.id, clientId: w.clientId, invoiceId: w.invoiceId, amount: Number(w.amount), writtenOffOn: ymd(w.writtenOffOn), reason: w.reason,
    status: w.status, reversedAt: w.reversedAt, reverseReason: w.reverseReason, createdAt: w.createdAt,
  };
}
