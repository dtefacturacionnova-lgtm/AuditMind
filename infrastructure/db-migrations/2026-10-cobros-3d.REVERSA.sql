-- Reversa de 2026-10-cobros-3d.sql.
-- ADVERTENCIAS:
--  · Borra las notas de crédito, los castigos y las notas de gestión de cobro que existan. Antes de revertir, anula las notas de crédito
--    y revierte los castigos (si quedan vigentes, los acumulados `creditedAmount` y `writtenOffAmount` de las facturas ya no tendrían respaldo).
--  · Los dos valores agregados a "CollectionLogAction" (COLLECTION_NOTE_UPDATED y COLLECTION_NOTE_DELETED) NO se pueden quitar de un tipo
--    enumerado de Postgres; quedan sin uso y no estorban.
BEGIN;
SET LOCAL lock_timeout = '5s';
DROP TABLE IF EXISTS "collection_notes";
DROP TABLE IF EXISTS "client_write_offs";
DROP TABLE IF EXISTS "client_credit_notes";
DROP INDEX IF EXISTS "client_invoices_id_engagementId_key";
DROP TYPE IF EXISTS "PromiseStatus";
DROP TYPE IF EXISTS "CollectionContactMethod";
DROP TYPE IF EXISTS "WriteOffStatus";
DROP TYPE IF EXISTS "CreditNoteStatus";
COMMIT;
