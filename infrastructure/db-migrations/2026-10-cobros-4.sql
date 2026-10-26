-- ════════════════════════════════════════════════════════════════════════════
-- Cobros de honorarios · Fase 4 — facturar las horas cerradas de una consultoría por tiempo
-- (docs/cobros-honorarios-diseno.md §15). Requiere haber aplicado antes 2026-10-cobros-3d.sql (índice client_invoices(id, engagementId)).
-- Cambio ADITIVO: una tabla nueva y un índice único nuevo sobre time_entries (destino de una clave compuesta).
-- NO usar `prisma db push`: aplicar este SQL.
-- Reversa: 2026-10-cobros-4.REVERSA.sql
--
-- Seguridad: igual que 3a/3d — claves foráneas COMPUESTAS (la API entra con un rol que se salta RLS); ON DELETE RESTRICT; CHECK de montos;
-- RLS activo y nada para anon/authenticated.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;
SET LOCAL lock_timeout = '5s';

-- Destino de la clave compuesta (organización + hora): la hora facturada es de la misma organización que la línea.
CREATE UNIQUE INDEX IF NOT EXISTS "time_entries_organizationId_id_key" ON "time_entries"("organizationId", "id");

-- ── Horas facturadas: una línea por hora de trabajo ─────────────────────────
CREATE TABLE "client_invoice_hours" (
  "id"             TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "invoiceId"      TEXT NOT NULL,
  "engagementId"   TEXT NOT NULL,
  "timeEntryId"    TEXT NOT NULL,
  "hours"          DECIMAL(9,4)  NOT NULL, -- horas de la hora de trabajo, a 4 decimales, al momento de facturar
  "rate"           DECIMAL(10,2) NOT NULL, -- tarifa pactada congelada al cerrar el mes
  "amount"         DECIMAL(12,2) NOT NULL, -- neto de esta línea
  "releasedAt"     TIMESTAMP(3),           -- al anular la factura la hora queda libre para facturarse otra vez
  "releasedById"   TEXT,
  "createdById"    TEXT NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "client_invoice_hours_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "client_invoice_hours_amounts_chk"  CHECK ("hours" > 0 AND "rate" > 0 AND "amount" = ROUND("hours" * "rate", 2)),
  CONSTRAINT "client_invoice_hours_released_chk" CHECK (("releasedAt" IS NULL) = ("releasedById" IS NULL))
);
-- UNA sola línea vigente por hora: dos facturas simultáneas sobre la misma hora no pueden coexistir.
CREATE UNIQUE INDEX "client_invoice_hours_entry_active_key" ON "client_invoice_hours"("timeEntryId") WHERE "releasedAt" IS NULL;
CREATE INDEX "client_invoice_hours_invoiceId_idx"    ON "client_invoice_hours"("invoiceId");
CREATE INDEX "client_invoice_hours_engagementId_idx" ON "client_invoice_hours"("engagementId") WHERE "releasedAt" IS NULL;
CREATE INDEX "client_invoice_hours_timeEntryId_idx"  ON "client_invoice_hours"("timeEntryId");
-- la factura es de ese encargo, y el encargo es de esa organización
ALTER TABLE "client_invoice_hours" ADD CONSTRAINT "client_invoice_hours_invoice_engagement_fkey"
  FOREIGN KEY ("invoiceId", "engagementId") REFERENCES "client_invoices"("id", "engagementId") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "client_invoice_hours" ADD CONSTRAINT "client_invoice_hours_engagement_org_fkey"
  FOREIGN KEY ("organizationId", "engagementId") REFERENCES "engagements"("organizationId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "client_invoice_hours" ADD CONSTRAINT "client_invoice_hours_timeEntry_fkey"
  FOREIGN KEY ("organizationId", "timeEntryId") REFERENCES "time_entries"("organizationId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "client_invoice_hours" ADD CONSTRAINT "client_invoice_hours_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "client_invoice_hours" ADD CONSTRAINT "client_invoice_hours_releasedById_fkey"
  FOREIGN KEY ("releasedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- ── Seguridad: RLS activo y nada para anon/authenticated ────────────────────
ALTER TABLE "client_invoice_hours" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "client_invoice_hours" FROM anon, authenticated;

COMMIT;
