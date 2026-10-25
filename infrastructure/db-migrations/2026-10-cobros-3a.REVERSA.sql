-- Reversa de 2026-10-cobros-3a.sql — BORRA honorarios, calendario, facturas registradas, cobros, retenciones y su bitácora.
-- Usar solo antes de que existan datos reales de cobros, o con un respaldo de las 8 tablas.
-- (Si ya se aplicó la fase 3d, revertir primero esa.)
BEGIN;
DROP TRIGGER IF EXISTS "collection_logs_no_update_delete" ON "collection_logs";
DROP FUNCTION IF EXISTS "collection_logs_append_only"();
DROP TABLE IF EXISTS "collection_logs";
DROP TABLE IF EXISTS "invoice_withholdings";
DROP TABLE IF EXISTS "payment_applications";
DROP TABLE IF EXISTS "client_payments";
DROP TABLE IF EXISTS "client_invoices";
DROP TABLE IF EXISTS "billing_schedule_items";
DROP TABLE IF EXISTS "engagement_fee_amendments";
DROP TABLE IF EXISTS "engagement_fees";
DROP TYPE IF EXISTS "CollectionLogAction";
DROP TYPE IF EXISTS "WithholdingTaxType";
DROP TYPE IF EXISTS "ClientPaymentMethod";
DROP TYPE IF EXISTS "ClientPaymentStatus";
DROP TYPE IF EXISTS "ClientInvoiceStatus";
DROP TYPE IF EXISTS "ScheduleItemStatus";
DROP TYPE IF EXISTS "ScheduleItemKind";
DROP TYPE IF EXISTS "FeeProgressMethod";
DROP TYPE IF EXISTS "FeeSource";
DROP TYPE IF EXISTS "FeeType";
COMMIT;
