-- Reversa de 2026-10-cobros-3d-fix1.sql: quita las dos claves foráneas compuestas de collection_notes.
BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE "collection_notes" DROP CONSTRAINT IF EXISTS "collection_notes_invoice_engagement_fkey";
ALTER TABLE "collection_notes" DROP CONSTRAINT IF EXISTS "collection_notes_engagement_org_fkey";
COMMIT;
