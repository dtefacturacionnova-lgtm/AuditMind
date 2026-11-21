-- Reversa de 2026-11-suscripciones-1-nucleo.sql — BORRA planes, precios, suscripciones, parámetros y bitácora de facturación.
-- Los datos de las organizaciones NO se tocan (Organization.plan y trialEndsAt siguen igual). Usar solo antes de cobrar a nadie, o con respaldo.
BEGIN;
DROP TABLE IF EXISTS "billing_events";
DROP TABLE IF EXISTS "billing_settings";
DROP TABLE IF EXISTS "billing_subscriptions";
DROP TABLE IF EXISTS "billing_plan_prices";
DROP TABLE IF EXISTS "billing_plans";
DROP TYPE IF EXISTS "EnforcementMode";
DROP TYPE IF EXISTS "SubscriptionStatus";
DROP TYPE IF EXISTS "BillingAudience";
COMMIT;
