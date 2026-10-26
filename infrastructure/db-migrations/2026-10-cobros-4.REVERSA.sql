-- Reversa de 2026-10-cobros-4.sql.
-- ADVERTENCIA: borra las líneas de horas facturadas. Aborta si quedan líneas VIGENTES (las facturas de horas dejarían de tener respaldo):
-- anula antes esas facturas (anular libera las líneas).
BEGIN;
SET LOCAL lock_timeout = '5s';
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "client_invoice_hours" WHERE "releasedAt" IS NULL) THEN
    RAISE EXCEPTION 'Hay horas facturadas en facturas vigentes: anula esas facturas antes de revertir la Fase 4';
  END IF;
END
$$;
DROP TABLE IF EXISTS "client_invoice_hours";
DROP INDEX IF EXISTS "time_entries_organizationId_id_key";
COMMIT;
