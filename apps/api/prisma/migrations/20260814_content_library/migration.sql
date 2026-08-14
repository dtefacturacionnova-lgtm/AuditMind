-- Biblioteca de Contenido Reutilizable: unifica procedimientos sustantivos
-- (antes substantive-procedure-library.ts) y preguntas de evaluación COSO
-- (antes coso-question-library.ts) en un solo modelo, editable por org desde
-- una interfaz de administración. Mismo patrón organizationId + isSystem que
-- audit_templates.

CREATE TYPE "ContentLibraryKind" AS ENUM ('SUBSTANTIVE_PROCEDURE', 'COSO_QUESTION');

CREATE TABLE "content_library_items" (
    "id"             TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "kind"           "ContentLibraryKind" NOT NULL,
    "groupKey"       TEXT NOT NULL,
    "groupLabel"     TEXT,
    "itemLabel"      TEXT NOT NULL,
    "itemSubtitle"   TEXT,
    "itemDetails"    JSONB,
    "sortOrder"      INTEGER NOT NULL DEFAULT 0,
    "isSystem"       BOOLEAN NOT NULL DEFAULT false,
    "createdById"    TEXT NOT NULL,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_library_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "content_library_items_organizationId_kind_groupKey_idx"
    ON "content_library_items"("organizationId", "kind", "groupKey");

ALTER TABLE "content_library_items"
    ADD CONSTRAINT "content_library_items_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "content_library_items"
    ADD CONSTRAINT "content_library_items_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
