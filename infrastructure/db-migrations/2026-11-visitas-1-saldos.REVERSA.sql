-- Reversa de 2026-11-visitas-1-saldos.sql
-- BORRA las visitas y la asignación de cada balance a una visita (visitId y asOfDate de trial_balances).
-- Los balances de comprobación en sí NO se tocan: siguen en trial_balances como cargas sin visita.
BEGIN;
ALTER TABLE "trial_balances" DROP CONSTRAINT IF EXISTS "trial_balances_visitId_fkey";
DROP INDEX IF EXISTS "trial_balances_visitId_idx";
ALTER TABLE "trial_balances" DROP COLUMN IF EXISTS "visitId";
ALTER TABLE "trial_balances" DROP COLUMN IF EXISTS "asOfDate";
DROP TABLE IF EXISTS "audit_visits";
DROP TYPE IF EXISTS "AuditVisitStatus";
DROP TYPE IF EXISTS "AuditVisitKind";
COMMIT;
