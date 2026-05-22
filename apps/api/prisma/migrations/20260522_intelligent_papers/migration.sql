-- ─── Intelligent Working Papers — Sprint 1 Migration ─────────────────────────
-- Adds: WpKind, SyncStatus, FieldType, MappingType enums
--       PaperLink, PaperSection tables
--       wpKind, syncStatus, lastSyncedAt, narrative, paperCode columns to working_papers

-- ─── 1. Enums ──────────────────────────────────────────────────────────────────

CREATE TYPE "WpKind" AS ENUM ('STANDARD', 'SMART', 'MASTER', 'LIVE');
CREATE TYPE "SyncStatus" AS ENUM ('DRAFT', 'SYNCED', 'STALE', 'REGENERATING');
CREATE TYPE "FieldType" AS ENUM (
  'TEXT', 'TEXTAREA', 'NUMBER', 'CURRENCY', 'PERCENTAGE',
  'BOOLEAN', 'ENUM_SELECT', 'DATE', 'MATRIX', 'REFERENCE', 'RISK_REF', 'ATTACHMENT'
);
CREATE TYPE "MappingType" AS ENUM ('DIRECT', 'AGGREGATED', 'AI_GENERATED');

-- ─── 2. New columns on working_papers ─────────────────────────────────────────

ALTER TABLE "working_papers"
  ADD COLUMN "wp_kind"        "WpKind"     NOT NULL DEFAULT 'STANDARD',
  ADD COLUMN "sync_status"    "SyncStatus" NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN "last_synced_at" TIMESTAMP(3),
  ADD COLUMN "narrative"      TEXT,
  ADD COLUMN "paper_code"     TEXT;

-- Indexes for graph queries
CREATE INDEX "working_papers_audit_id_wp_kind_idx"     ON "working_papers"("auditId", "wp_kind");
CREATE INDEX "working_papers_audit_id_sync_status_idx" ON "working_papers"("auditId", "sync_status");

-- ─── 3. PaperLink table (knowledge graph edges) ────────────────────────────────

CREATE TABLE "paper_links" (
  "id"           TEXT         NOT NULL,
  "sourceId"     TEXT         NOT NULL,
  "targetId"     TEXT         NOT NULL,
  "sourceField"  TEXT         NOT NULL,
  "targetField"  TEXT         NOT NULL,
  "mappingType"  "MappingType" NOT NULL DEFAULT 'DIRECT',
  "description"  TEXT,
  "isActive"     BOOLEAN      NOT NULL DEFAULT true,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "paper_links_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "paper_links"
  ADD CONSTRAINT "paper_links_sourceId_fkey"
    FOREIGN KEY ("sourceId") REFERENCES "working_papers"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "paper_links_targetId_fkey"
    FOREIGN KEY ("targetId") REFERENCES "working_papers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "paper_links_sourceId_idx" ON "paper_links"("sourceId");
CREATE INDEX "paper_links_targetId_idx" ON "paper_links"("targetId");

-- ─── 4. PaperSection table (typed fields for SMART papers) ────────────────────

CREATE TABLE "paper_sections" (
  "id"           TEXT         NOT NULL,
  "paperId"      TEXT         NOT NULL,
  "sectionKey"   TEXT         NOT NULL,
  "label"        TEXT         NOT NULL,
  "description"  TEXT,
  "fieldType"    "FieldType"  NOT NULL DEFAULT 'TEXT',
  "value"        JSONB,
  "options"      JSONB,
  "isRequired"   BOOLEAN      NOT NULL DEFAULT false,
  "isAutoFilled" BOOLEAN      NOT NULL DEFAULT false,
  "sourceRef"    TEXT,
  "sortOrder"    INTEGER      NOT NULL DEFAULT 0,
  "aiHint"       TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "paper_sections_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "paper_sections_paperId_sectionKey_key" UNIQUE ("paperId", "sectionKey")
);

ALTER TABLE "paper_sections"
  ADD CONSTRAINT "paper_sections_paperId_fkey"
    FOREIGN KEY ("paperId") REFERENCES "working_papers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "paper_sections_paperId_idx" ON "paper_sections"("paperId");
