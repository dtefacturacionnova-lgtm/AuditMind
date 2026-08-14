-- Documentación de la migración aplicada manualmente vía script (sin DIRECT_URL en el VPS,
-- ver PrismaClient.$executeRawUnsafe en el mismo patrón que 20260814_content_library).

ALTER TABLE "pbc_paper_links" ADD COLUMN "sectionKey" TEXT NOT NULL DEFAULT '';
ALTER TABLE "pbc_paper_links" ADD COLUMN "rowId" TEXT NOT NULL DEFAULT '';

DROP INDEX IF EXISTS "pbc_paper_links_pbcId_paperId_key";
CREATE UNIQUE INDEX "pbc_paper_links_pbcId_paperId_sectionKey_rowId_key"
    ON "pbc_paper_links"("pbcId", "paperId", "sectionKey", "rowId");

CREATE INDEX "pbc_paper_links_paperId_sectionKey_rowId_idx"
    ON "pbc_paper_links"("paperId", "sectionKey", "rowId");
