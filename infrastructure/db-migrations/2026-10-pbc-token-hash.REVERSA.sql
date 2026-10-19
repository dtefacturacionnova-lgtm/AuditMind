-- Reversa de 2026-10-pbc-token-hash.sql (y de su PASO 2). Los enlaces del portal se pierden: hay que
-- regenerarlos (con el código anterior, que guarda el token en claro).
BEGIN;
ALTER TABLE "pbc_requests" ADD COLUMN IF NOT EXISTS "portalToken" TEXT;
DROP INDEX IF EXISTS "pbc_requests_portalTokenHash_key";
ALTER TABLE "pbc_requests" DROP COLUMN IF EXISTS "portalTokenEncrypted";
ALTER TABLE "pbc_requests" DROP COLUMN IF EXISTS "portalTokenHash";
-- "portalToken" vuelve a ser obligatorio y único solo si no quedan filas sin token:
-- UPDATE "pbc_requests" SET "portalToken" = encode(gen_random_bytes(32), 'hex') WHERE "portalToken" IS NULL;
-- ALTER TABLE "pbc_requests" ALTER COLUMN "portalToken" SET NOT NULL;
-- CREATE UNIQUE INDEX IF NOT EXISTS "pbc_requests_portalToken_key" ON "pbc_requests"("portalToken");
COMMIT;
