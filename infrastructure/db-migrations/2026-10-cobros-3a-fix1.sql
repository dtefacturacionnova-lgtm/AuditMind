-- Cobros · 3a · corrección 1 (revisión independiente, 2026-10-23).
-- Las claves foráneas compuestas de las tablas de cobros pasan de ON UPDATE CASCADE a ON UPDATE RESTRICT: un UPDATE directo a
-- engagements.clientId (por ejemplo desde un script) ya no arrastra en silencio facturas y retenciones a otro cliente.
-- Solo hace falta en la base donde se aplicó la primera versión de 2026-10-cobros-3a.sql; el archivo original ya trae este cambio.
-- Reversa: no aplica (volver a CASCADE reabriría el hueco).
BEGIN;
ALTER TABLE "engagement_fees" DROP CONSTRAINT "engagement_fees_engagement_fkey";
ALTER TABLE "engagement_fees" ADD CONSTRAINT "engagement_fees_engagement_fkey"
  FOREIGN KEY ("organizationId", "engagementId") REFERENCES "engagements"("organizationId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "engagement_fees" DROP CONSTRAINT "engagement_fees_proposalId_fkey";
ALTER TABLE "engagement_fees" ADD CONSTRAINT "engagement_fees_proposalId_fkey"
  FOREIGN KEY ("proposalId") REFERENCES "proposals"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "engagement_fees" DROP CONSTRAINT "engagement_fees_createdById_fkey";
ALTER TABLE "engagement_fees" ADD CONSTRAINT "engagement_fees_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "engagement_fee_amendments" DROP CONSTRAINT "engagement_fee_amendments_fee_fkey";
ALTER TABLE "engagement_fee_amendments" ADD CONSTRAINT "engagement_fee_amendments_fee_fkey"
  FOREIGN KEY ("organizationId", "feeId") REFERENCES "engagement_fees"("organizationId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "engagement_fee_amendments" DROP CONSTRAINT "engagement_fee_amendments_createdById_fkey";
ALTER TABLE "engagement_fee_amendments" ADD CONSTRAINT "engagement_fee_amendments_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "billing_schedule_items" DROP CONSTRAINT "billing_schedule_items_engagement_fkey";
ALTER TABLE "billing_schedule_items" ADD CONSTRAINT "billing_schedule_items_engagement_fkey"
  FOREIGN KEY ("organizationId", "engagementId") REFERENCES "engagements"("organizationId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "billing_schedule_items" DROP CONSTRAINT "billing_schedule_items_createdById_fkey";
ALTER TABLE "billing_schedule_items" ADD CONSTRAINT "billing_schedule_items_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "client_invoices" DROP CONSTRAINT "client_invoices_client_fkey";
ALTER TABLE "client_invoices" ADD CONSTRAINT "client_invoices_client_fkey"
  FOREIGN KEY ("organizationId", "clientId") REFERENCES "clients"("organizationId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "client_invoices" DROP CONSTRAINT "client_invoices_engagement_org_fkey";
ALTER TABLE "client_invoices" ADD CONSTRAINT "client_invoices_engagement_org_fkey"
  FOREIGN KEY ("organizationId", "engagementId") REFERENCES "engagements"("organizationId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "client_invoices" DROP CONSTRAINT "client_invoices_engagement_client_fkey";
ALTER TABLE "client_invoices" ADD CONSTRAINT "client_invoices_engagement_client_fkey"
  FOREIGN KEY ("engagementId", "clientId") REFERENCES "engagements"("id", "clientId") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "client_invoices" DROP CONSTRAINT "client_invoices_scheduleItem_fkey";
ALTER TABLE "client_invoices" ADD CONSTRAINT "client_invoices_scheduleItem_fkey"
  FOREIGN KEY ("scheduleItemId", "engagementId") REFERENCES "billing_schedule_items"("id", "engagementId") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "client_invoices" DROP CONSTRAINT "client_invoices_createdById_fkey";
ALTER TABLE "client_invoices" ADD CONSTRAINT "client_invoices_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "client_payments" DROP CONSTRAINT "client_payments_client_fkey";
ALTER TABLE "client_payments" ADD CONSTRAINT "client_payments_client_fkey"
  FOREIGN KEY ("organizationId", "clientId") REFERENCES "clients"("organizationId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "client_payments" DROP CONSTRAINT "client_payments_createdById_fkey";
ALTER TABLE "client_payments" ADD CONSTRAINT "client_payments_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "payment_applications" DROP CONSTRAINT "payment_applications_payment_fkey";
ALTER TABLE "payment_applications" ADD CONSTRAINT "payment_applications_payment_fkey"
  FOREIGN KEY ("organizationId", "clientId", "paymentId") REFERENCES "client_payments"("organizationId", "clientId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "payment_applications" DROP CONSTRAINT "payment_applications_invoice_fkey";
ALTER TABLE "payment_applications" ADD CONSTRAINT "payment_applications_invoice_fkey"
  FOREIGN KEY ("organizationId", "clientId", "invoiceId") REFERENCES "client_invoices"("organizationId", "clientId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "payment_applications" DROP CONSTRAINT "payment_applications_createdById_fkey";
ALTER TABLE "payment_applications" ADD CONSTRAINT "payment_applications_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "invoice_withholdings" DROP CONSTRAINT "invoice_withholdings_invoice_fkey";
ALTER TABLE "invoice_withholdings" ADD CONSTRAINT "invoice_withholdings_invoice_fkey"
  FOREIGN KEY ("organizationId", "clientId", "invoiceId") REFERENCES "client_invoices"("organizationId", "clientId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "invoice_withholdings" DROP CONSTRAINT "invoice_withholdings_payment_fkey";
ALTER TABLE "invoice_withholdings" ADD CONSTRAINT "invoice_withholdings_payment_fkey"
  FOREIGN KEY ("organizationId", "clientId", "paymentId") REFERENCES "client_payments"("organizationId", "clientId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "invoice_withholdings" DROP CONSTRAINT "invoice_withholdings_createdById_fkey";
ALTER TABLE "invoice_withholdings" ADD CONSTRAINT "invoice_withholdings_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "collection_logs" DROP CONSTRAINT "collection_logs_organizationId_fkey";
ALTER TABLE "collection_logs" ADD CONSTRAINT "collection_logs_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
COMMIT;
