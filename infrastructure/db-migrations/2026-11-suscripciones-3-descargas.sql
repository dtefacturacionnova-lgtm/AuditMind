-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Planes y suscripciones — Etapa 3: medición de DESCARGAS (egress) por organización, día y tipo de archivo
-- (pantalla «Consumo y costos» del superadmin). Requiere 2026-11-suscripciones-1-nucleo.sql (usa organizations).
-- Cambio ADITIVO: 1 tabla nueva, sin datos semilla. No toca ninguna tabla existente.
-- Mide los ENLACES DE DESCARGA emitidos (cada archivo cuenta una vez por día), no los bytes reales que sirvió Supabase.
-- NO usar `prisma db push` (intenta borrar rag_chunks/rag_documents): aplicar este SQL.
-- Reversa: 2026-11-suscripciones-3-descargas.REVERSA.sql
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE "storage_egress_daily" (
  "organizationId" TEXT    NOT NULL,
  "day"            DATE    NOT NULL,
  "fileType"       TEXT    NOT NULL,
  "files"          INTEGER NOT NULL DEFAULT 0,
  "bytes"          BIGINT  NOT NULL DEFAULT 0,
  CONSTRAINT "storage_egress_daily_pkey" PRIMARY KEY ("organizationId", "day", "fileType"),
  CONSTRAINT "storage_egress_daily_chk" CHECK ("files" >= 0 AND "bytes" >= 0)
);
CREATE INDEX "storage_egress_daily_day_idx" ON "storage_egress_daily"("day");
ALTER TABLE "storage_egress_daily" ADD CONSTRAINT "storage_egress_daily_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Seguridad: RLS activo y nada para anon/authenticated (regla de project_security_audit) ──
ALTER TABLE "storage_egress_daily" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "storage_egress_daily" FROM anon, authenticated;

COMMIT;
