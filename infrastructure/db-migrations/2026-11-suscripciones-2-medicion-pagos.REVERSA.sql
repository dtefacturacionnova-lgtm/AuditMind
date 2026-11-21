-- Reversa de 2026-11-suscripciones-2-medicion-pagos.sql — BORRA el libro de consumo de IA, los paquetes comprados, el catálogo de paquetes
-- y los pagos de facturación. Las suscripciones y los planes (etapa 1) NO se tocan.
-- Usar solo antes de cobrar a nadie, o con respaldo de las 4 tablas.
BEGIN;
DROP TABLE IF EXISTS "addon_purchases";
DROP TABLE IF EXISTS "billing_payments";
DROP TABLE IF EXISTS "addon_packs";
DROP TABLE IF EXISTS "usage_ledger";
DROP TYPE IF EXISTS "BillingPaymentStatus";
DROP TYPE IF EXISTS "BillingPaymentMethod";
DROP TYPE IF EXISTS "BillingPaymentKind";
DROP TYPE IF EXISTS "AddonPurchaseStatus";
DROP TYPE IF EXISTS "AddonKind";
COMMIT;
