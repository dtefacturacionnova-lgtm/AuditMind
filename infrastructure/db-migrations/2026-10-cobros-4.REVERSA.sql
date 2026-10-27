-- Reversa de 2026-10-cobros-4.sql.
-- ADVERTENCIA: borra las líneas de horas facturadas. Aborta si quedan líneas VIGENTES (las facturas de horas dejarían de tener respaldo):
-- anula antes esas facturas (anular libera las líneas).
BEGIN;
SET LOCAL lock_timeout = '5s';
-- El candado va ANTES de la comprobación: sin él, una factura que se confirme entre la comprobación y el DROP perdería sus líneas vigentes.
DO $$
BEGIN
  IF to_regclass('public.client_invoice_hours') IS NOT NULL THEN
    LOCK TABLE "client_invoice_hours" IN ACCESS EXCLUSIVE MODE;
    IF EXISTS (SELECT 1 FROM "client_invoice_hours" WHERE "releasedAt" IS NULL) THEN
      RAISE EXCEPTION 'Hay horas facturadas en facturas vigentes: anula esas facturas antes de revertir la Fase 4';
    END IF;
  END IF;
END
$$;
DROP TABLE IF EXISTS "client_invoice_hours";
DROP INDEX IF EXISTS "time_entries_organizationId_id_key";
COMMIT;
