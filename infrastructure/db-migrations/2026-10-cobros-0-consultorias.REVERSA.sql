-- Reversa de 2026-10-cobros-0-consultorias.sql.
-- ADVERTENCIA: restaurar el índice único (clientId, fiscalYear) FALLA si ya existe más de un encargo del mismo cliente y año
-- (por ejemplo, una consultoría junto a una auditoría). En ese caso hay que cancelar o mover esos encargos antes de revertir.
-- Revertir esto exige revertir antes 2026-10-cobros-3a (sus claves foráneas usan los índices que aquí se borran).
BEGIN;
DROP INDEX IF EXISTS "clients_organizationId_id_key";
DROP INDEX IF EXISTS "engagements_organizationId_id_key";
DROP INDEX IF EXISTS "engagements_id_clientId_key";
DROP INDEX IF EXISTS "engagements_clientId_fiscalYear_idx";
DROP INDEX IF EXISTS "engagements_audit_client_year_key";
CREATE UNIQUE INDEX "engagements_clientId_fiscalYear_key" ON "engagements"("clientId", "fiscalYear");
ALTER TABLE "engagements" DROP COLUMN IF EXISTS "title";
ALTER TABLE "engagements" DROP COLUMN IF EXISTS "kind";
DROP TYPE IF EXISTS "EngagementKind";
COMMIT;
