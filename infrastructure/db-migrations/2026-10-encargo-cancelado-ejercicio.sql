-- ════════════════════════════════════════════════════════════════════════════
-- Un encargo CANCELADO ya no ocupa el ejercicio (revisión de Cartera, 2026-10-25).
-- Antes: una sola AUDITORÍA por cliente y año contando también las canceladas, así que un encargo cancelado
-- impedía volver a crear el ejercicio. Ahora la unicidad vale solo para las auditorías NO canceladas.
-- Cambio de un índice parcial; no toca datos ni columnas. NO usar `prisma db push`: aplicar este SQL.
-- Reversa: 2026-10-encargo-cancelado-ejercicio.REVERSA.sql
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;
SET LOCAL lock_timeout = '5s';

DROP INDEX IF EXISTS "engagements_audit_client_year_key";
CREATE UNIQUE INDEX "engagements_audit_client_year_key"
  ON "engagements"("clientId", "fiscalYear")
  WHERE "kind" = 'AUDIT' AND "status" <> 'CANCELLED';

COMMIT;
