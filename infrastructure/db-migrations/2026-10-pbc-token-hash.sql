-- ════════════════════════════════════════════════════════════════════════════
-- Portal PBC: el token del enlace deja de guardarse en claro (docs/firma-externa-por-enlace.md, F1e)
-- PASO 1 de 2 — ADITIVO ("expandir"): columnas nuevas y nulas + el token viejo deja de ser obligatorio.
--   · "portalTokenHash"      sha256(token) en hex: lo único que sirve para BUSCAR la solicitud.
--   · "portalTokenEncrypted" AES-256-GCM con ENCRYPTION_KEY: solo para que el equipo auditor pueda volver a
--                            copiar el enlace (una copia de la BD sin la clave no lo revela).
-- Mientras corre el código anterior (que aún escribe "portalToken") nada se rompe. NO usar `prisma db push`.
-- Hoy hay 0 solicitudes PBC (verificado 2026-10-19): no hay enlaces viejos que migrar. Si existiera alguno,
-- se regenera desde el panel ("Regenerar enlace"): el formato del enlace cambia (ya no lleva el token en la ruta).
-- PASO 2 (después de desplegar el código nuevo): 2026-10-pbc-token-hash.PASO2-contraer.sql
-- Reversa: 2026-10-pbc-token-hash.REVERSA.sql
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE "pbc_requests" ADD COLUMN IF NOT EXISTS "portalTokenHash"      TEXT;
ALTER TABLE "pbc_requests" ADD COLUMN IF NOT EXISTS "portalTokenEncrypted" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "pbc_requests_portalTokenHash_key" ON "pbc_requests"("portalTokenHash");

-- El código nuevo ya no escribe el token en claro.
ALTER TABLE "pbc_requests" ALTER COLUMN "portalToken" DROP NOT NULL;

COMMIT;
