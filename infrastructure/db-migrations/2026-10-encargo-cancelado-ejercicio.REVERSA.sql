-- Reversa de 2026-10-encargo-cancelado-ejercicio.sql.
-- ADVERTENCIA: restaurar la versión anterior del índice (que cuenta también los encargos cancelados) FALLA si ya existe
-- un encargo cancelado y otro vigente de auditoría del mismo cliente y año. En ese caso, mover o borrar el cancelado antes de revertir.
BEGIN;
SET LOCAL lock_timeout = '5s';

DROP INDEX IF EXISTS "engagements_audit_client_year_key";
CREATE UNIQUE INDEX "engagements_audit_client_year_key" ON "engagements"("clientId", "fiscalYear") WHERE "kind" = 'AUDIT';

COMMIT;
