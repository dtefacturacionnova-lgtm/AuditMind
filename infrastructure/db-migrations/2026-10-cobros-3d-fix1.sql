-- ════════════════════════════════════════════════════════════════════════════
-- Cobros de honorarios · Fase 3d, arreglo 1 (revisión independiente, 2026-10-25)
-- Las notas de gestión de cobro solo ataban el encargo al cliente. Se agregan dos claves foráneas compuestas:
--   · el encargo de la nota pertenece a la MISMA organización (igual que facturas y calendario);
--   · si la nota nombra una factura y un encargo, la factura es de ese encargo.
-- Con factura o encargo nulos la clave no se evalúa (MATCH SIMPLE), así que las notas de cliente siguen igual.
-- Es seguro correrlo aunque 2026-10-cobros-3d.sql ya traiga estas claves (las versiones nuevas del archivo las incluyen): no hace nada si existen.
-- Reversa: 2026-10-cobros-3d-fix1.REVERSA.sql
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'collection_notes_engagement_org_fkey') THEN
    ALTER TABLE "collection_notes" ADD CONSTRAINT "collection_notes_engagement_org_fkey"
      FOREIGN KEY ("organizationId", "engagementId") REFERENCES "engagements"("organizationId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'collection_notes_invoice_engagement_fkey') THEN
    ALTER TABLE "collection_notes" ADD CONSTRAINT "collection_notes_invoice_engagement_fkey"
      FOREIGN KEY ("invoiceId", "engagementId") REFERENCES "client_invoices"("id", "engagementId") ON DELETE RESTRICT ON UPDATE RESTRICT;
  END IF;
END
$$;

COMMIT;
