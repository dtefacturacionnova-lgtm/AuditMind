import { Prisma } from '@prisma/client';
import { Db } from './collections.common';

/**
 * Verificador de integridad de la cobranza. Cada consulta devuelve las filas que ROMPEN una regla; el resultado ideal es vacío.
 * Lo usan las pruebas contra Postgres real (después de cada escenario, incluidos los de concurrencia) y sirve para auditar
 * la base en producción. Todo se calcula desde los MOVIMIENTOS (aplicaciones y retenciones), no desde los acumulados en caché.
 */
export interface InvariantViolation { rule: string; ids: string[] }

export async function checkCollectionInvariants(db: Db, organizationId?: string): Promise<InvariantViolation[]> {
  const org = organizationId ? Prisma.sql`AND i."organizationId" = ${organizationId}` : Prisma.empty;
  const orgP = organizationId ? Prisma.sql`AND p."organizationId" = ${organizationId}` : Prisma.empty;
  const orgE = organizationId ? Prisma.sql`AND f."organizationId" = ${organizationId}` : Prisma.empty;
  const orgS = organizationId ? Prisma.sql`AND s."organizationId" = ${organizationId}` : Prisma.empty;
  const out: InvariantViolation[] = [];
  const run = async (rule: string, query: Prisma.Sql) => {
    const rows = await db.$queryRaw<{ id: string }[]>(query);
    if (rows.length) out.push({ rule, ids: rows.map((r) => r.id) });
  };

  await run('El cobrado de la factura no coincide con la suma de sus aplicaciones vigentes', Prisma.sql`
    SELECT i.id FROM client_invoices i
    LEFT JOIN (SELECT "invoiceId", SUM(amount) AS s FROM payment_applications WHERE "reversedAt" IS NULL GROUP BY "invoiceId") a ON a."invoiceId" = i.id
    WHERE i."paidAmount" <> COALESCE(a.s, 0) ${org}`);

  await run('El retenido de la factura no coincide con la suma de sus retenciones vigentes', Prisma.sql`
    SELECT i.id FROM client_invoices i
    LEFT JOIN (SELECT "invoiceId", SUM(amount) AS s FROM invoice_withholdings WHERE "reversedAt" IS NULL GROUP BY "invoiceId") w ON w."invoiceId" = i.id
    WHERE i."withheldAmount" <> COALESCE(w.s, 0) ${org}`);

  await run('El monto aplicado del cobro no coincide con la suma de sus aplicaciones vigentes', Prisma.sql`
    SELECT p.id FROM client_payments p
    LEFT JOIN (SELECT "paymentId", SUM(amount) AS s FROM payment_applications WHERE "reversedAt" IS NULL GROUP BY "paymentId") a ON a."paymentId" = p.id
    WHERE p."appliedAmount" <> COALESCE(a.s, 0) ${orgP}`);

  await run('Un cobro supera lo recibido: aplicado mayor que el monto', Prisma.sql`
    SELECT p.id FROM client_payments p WHERE p."appliedAmount" > p.amount ${orgP}`);

  await run('Un cobro anulado conserva aplicaciones o retenciones vigentes', Prisma.sql`
    SELECT p.id FROM client_payments p WHERE p.status = 'VOID' ${orgP}
      AND (EXISTS (SELECT 1 FROM payment_applications a WHERE a."paymentId" = p.id AND a."reversedAt" IS NULL)
        OR EXISTS (SELECT 1 FROM invoice_withholdings w WHERE w."paymentId" = p.id AND w."reversedAt" IS NULL))`);

  await run('Una factura anulada conserva aplicaciones o retenciones vigentes', Prisma.sql`
    SELECT i.id FROM client_invoices i WHERE i.status = 'VOID' ${org}
      AND (EXISTS (SELECT 1 FROM payment_applications a WHERE a."invoiceId" = i.id AND a."reversedAt" IS NULL)
        OR EXISTS (SELECT 1 FROM invoice_withholdings w WHERE w."invoiceId" = i.id AND w."reversedAt" IS NULL))`);

  await run('Una factura tiene saldo negativo', Prisma.sql`
    SELECT i.id FROM client_invoices i
    WHERE i."totalAmount" - (i."paidAmount" + i."withheldAmount" + i."creditedAmount" + i."writtenOffAmount") < 0 ${org}`);

  await run('Honorario fijo comprometido por encima de lo pactado: facturado neto + cuotas programadas > honorario', Prisma.sql`
    SELECT f.id FROM engagement_fees f
    WHERE f."feeType" = 'FIXED' ${orgE}
      AND COALESCE((SELECT SUM("netAmount") FROM client_invoices i WHERE i."engagementId" = f."engagementId" AND i.status <> 'VOID'), 0)
        - COALESCE((SELECT SUM("netAmount") FROM client_credit_notes n WHERE n."engagementId" = f."engagementId" AND n.status = 'ACTIVE'), 0)
        + COALESCE((SELECT SUM(amount) FROM billing_schedule_items s WHERE s."engagementId" = f."engagementId" AND s.status = 'PLANNED'), 0)
        > f."totalAmount"`);

  await run('El acreditado de la factura no coincide con la suma de sus notas de crédito vigentes', Prisma.sql`
    SELECT i.id FROM client_invoices i
    LEFT JOIN (SELECT "invoiceId", SUM("totalAmount") AS s FROM client_credit_notes WHERE status = 'ACTIVE' GROUP BY "invoiceId") n ON n."invoiceId" = i.id
    WHERE i."creditedAmount" <> COALESCE(n.s, 0) ${org}`);

  await run('El castigado de la factura no coincide con la suma de sus castigos vigentes', Prisma.sql`
    SELECT i.id FROM client_invoices i
    LEFT JOIN (SELECT "invoiceId", SUM(amount) AS s FROM client_write_offs WHERE status = 'ACTIVE' GROUP BY "invoiceId") w ON w."invoiceId" = i.id
    WHERE i."writtenOffAmount" <> COALESCE(w.s, 0) ${org}`);

  await run('Una factura anulada conserva notas de crédito o castigos vigentes', Prisma.sql`
    SELECT i.id FROM client_invoices i WHERE i.status = 'VOID' ${org}
      AND (EXISTS (SELECT 1 FROM client_credit_notes n WHERE n."invoiceId" = i.id AND n.status = 'ACTIVE')
        OR EXISTS (SELECT 1 FROM client_write_offs w WHERE w."invoiceId" = i.id AND w.status = 'ACTIVE'))`);

  await run('Las notas de crédito vigentes de una factura acreditan más IVA que el de la factura', Prisma.sql`
    SELECT i.id FROM client_invoices i
    JOIN (SELECT "invoiceId", SUM("taxAmount") AS s FROM client_credit_notes WHERE status = 'ACTIVE' GROUP BY "invoiceId") n ON n."invoiceId" = i.id
    WHERE n.s > i."taxAmount" ${org}`);

  await run('Las notas de crédito vigentes de una factura acreditan más neto que el de la factura', Prisma.sql`
    SELECT i.id FROM client_invoices i
    JOIN (SELECT "invoiceId", SUM("netAmount") AS s FROM client_credit_notes WHERE status = 'ACTIVE' GROUP BY "invoiceId") n ON n."invoiceId" = i.id
    WHERE n.s > i."netAmount" ${org}`);

  await run('Una cuota facturada no tiene exactamente una factura vigente', Prisma.sql`
    SELECT s.id FROM billing_schedule_items s WHERE s.status = 'INVOICED' ${orgS}
      AND (SELECT COUNT(*) FROM client_invoices i WHERE i."scheduleItemId" = s.id AND i.status <> 'VOID') <> 1`);

  await run('Una cuota programada o cancelada tiene una factura vigente', Prisma.sql`
    SELECT s.id FROM billing_schedule_items s WHERE s.status <> 'INVOICED' ${orgS}
      AND EXISTS (SELECT 1 FROM client_invoices i WHERE i."scheduleItemId" = s.id AND i.status <> 'VOID')`);

  return out;
}
