-- ════════════════════════════════════════════════════════════════════════════
-- Cobros de honorarios · Fase 3-0 — encargos de consultoría (docs/cobros-honorarios-diseno.md §3.0)
-- Cambio ADITIVO salvo un índice: la unicidad "un encargo por cliente y año" pasa a valer solo para AUDITORÍAS.
-- NO usar `prisma db push` (intenta borrar rag_chunks/rag_documents): aplicar este SQL.
-- Reversa: 2026-10-cobros-0-consultorias.REVERSA.sql
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TYPE "EngagementKind" AS ENUM ('AUDIT', 'CONSULTING');

ALTER TABLE "engagements" ADD COLUMN "kind"  "EngagementKind" NOT NULL DEFAULT 'AUDIT';
ALTER TABLE "engagements" ADD COLUMN "title" TEXT;

-- Antes: UNIQUE (clientId, fiscalYear) para todo encargo. Ahora: una AUDITORÍA por cliente y año, y cualquier cantidad de consultorías.
DROP INDEX "engagements_clientId_fiscalYear_key";
CREATE UNIQUE INDEX "engagements_audit_client_year_key" ON "engagements"("clientId", "fiscalYear") WHERE "kind" = 'AUDIT';
CREATE INDEX "engagements_clientId_fiscalYear_idx" ON "engagements"("clientId", "fiscalYear");

-- Índices únicos que sirven de destino a las claves foráneas COMPUESTAS de las tablas de cobros (la separación entre
-- organizaciones y clientes se impone en la base, porque la API entra con un rol que se salta RLS).
CREATE UNIQUE INDEX "engagements_id_clientId_key"          ON "engagements"("id", "clientId");
CREATE UNIQUE INDEX "engagements_organizationId_id_key"    ON "engagements"("organizationId", "id");
CREATE UNIQUE INDEX "clients_organizationId_id_key"        ON "clients"("organizationId", "id");

COMMIT;
