import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Db } from './collections.common';

/**
 * Candados y comprobaciones sobre las horas que ya están en una factura (Fase 4, docs/cobros-honorarios-diseno.md §15).
 * Las usan el cierre de horas (reabrir un mes, aprobar un ajuste) y la factura de horas. Orden de candados que evita interbloqueos:
 * primero se bloquean las FILAS de las horas (en orden por id) y solo después se buscan las líneas vigentes; la factura de horas
 * hace lo mismo, así que reabrir y facturar se serializan: gana el que bloquea primero y el otro ve el resultado ya confirmado.
 */

/** Bloquea las filas de estas horas (FOR UPDATE, por id). */
export async function lockTimeEntryRows(db: Db, organizationId: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db.$queryRaw(Prisma.sql`SELECT id FROM time_entries WHERE "organizationId" = ${organizationId} AND id IN (${Prisma.join(ids)}) ORDER BY id FOR UPDATE`);
}

/** Bloquea las filas de todas las horas de una persona en un mes. */
export async function lockPersonMonthEntries(db: Db, organizationId: string, userId: string, range: { gte: Date; lt: Date }): Promise<void> {
  await db.$queryRaw(Prisma.sql`
    SELECT id FROM time_entries
    WHERE "organizationId" = ${organizationId} AND "userId" = ${userId} AND "workDate" >= ${range.gte} AND "workDate" < ${range.lt}
    ORDER BY id FOR UPDATE`);
}

/** Número de la factura vigente que incluye alguna de estas horas, o null. */
export async function invoiceOfHours(db: Db, entryIds: string[]): Promise<string | null> {
  if (entryIds.length === 0) return null;
  const rows = await db.$queryRaw<{ invoiceNumber: string }[]>(Prisma.sql`
    SELECT i."invoiceNumber" FROM client_invoice_hours h JOIN client_invoices i ON i.id = h."invoiceId"
    WHERE h."releasedAt" IS NULL AND h."timeEntryId" IN (${Prisma.join(entryIds)}) LIMIT 1`);
  return rows[0]?.invoiceNumber ?? null;
}

/** Una hora facturada no se edita ni se borra: hay que anular la factura (o emitir una nota de crédito si es una rebaja de precio). */
export async function assertEntryNotInvoiced(db: Db, entryId: string, opts: { showInvoice: boolean }): Promise<void> {
  const invoiceNumber = await invoiceOfHours(db, [entryId]);
  if (!invoiceNumber) return;
  throw new ConflictException(
    opts.showInvoice
      ? `Esa hora ya se facturó en la factura ${invoiceNumber}: no se puede cambiar ni borrar. Anula la factura para liberarla (si solo es una rebaja de precio, emite una nota de crédito).`
      : 'Esa hora ya se facturó al cliente: no se puede cambiar ni borrar. Habla con tu gerente.',
  );
}

/** Reabrir el mes de una persona soltaría el costo y la tarifa congelados de horas que ya se cobraron: se rechaza mientras haya una. */
export async function assertPersonMonthNotInvoiced(db: Db, organizationId: string, userId: string, range: { gte: Date; lt: Date }): Promise<void> {
  const rows = await db.$queryRaw<{ invoiceNumber: string }[]>(Prisma.sql`
    SELECT i."invoiceNumber" FROM client_invoice_hours h
    JOIN time_entries t ON t.id = h."timeEntryId"
    JOIN client_invoices i ON i.id = h."invoiceId"
    WHERE h."releasedAt" IS NULL AND t."organizationId" = ${organizationId} AND t."userId" = ${userId}
      AND t."workDate" >= ${range.gte} AND t."workDate" < ${range.lt}
    LIMIT 1`);
  if (rows[0]) {
    throw new ConflictException(
      `Ese mes tiene horas ya facturadas (factura ${rows[0].invoiceNumber}): no se puede reabrir. Anula primero esa factura para liberar las horas.`,
    );
  }
}
