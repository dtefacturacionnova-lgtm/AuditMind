-- AuditMind — Migración 2.6-2.8: Conectores de Datos (DataSource + ConnectorImport)
-- Ejecutar en Supabase SQL Editor si no se puede usar `prisma migrate dev`

-- Enums nuevos
DO $$ BEGIN
  CREATE TYPE "DataSourceType" AS ENUM ('SAP_RFC', 'REST_API', 'EXCEL_UPLOAD', 'CSV_UPLOAD');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "ConnectorStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ERROR', 'TESTING');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "ImportStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Tabla data_sources
CREATE TABLE IF NOT EXISTS "data_sources" (
  "id"              TEXT        NOT NULL DEFAULT gen_random_uuid()::text,
  "organizationId"  TEXT        NOT NULL,
  "name"            TEXT        NOT NULL,
  "type"            "DataSourceType" NOT NULL,
  "status"          "ConnectorStatus" NOT NULL DEFAULT 'INACTIVE',
  "config"          JSONB       NOT NULL DEFAULT '{}',
  "lastTestedAt"    TIMESTAMPTZ,
  "lastTestStatus"  TEXT,
  "lastTestError"   TEXT,
  "lastImportAt"    TIMESTAMPTZ,
  "totalImports"    INTEGER     NOT NULL DEFAULT 0,
  "createdById"     TEXT        NOT NULL,
  "createdAt"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT "data_sources_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "data_sources_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE,
  CONSTRAINT "data_sources_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "users"("id")
);

CREATE INDEX IF NOT EXISTS "data_sources_organizationId_idx"
  ON "data_sources" ("organizationId");
CREATE INDEX IF NOT EXISTS "data_sources_organizationId_type_idx"
  ON "data_sources" ("organizationId", "type");

-- Tabla connector_imports
CREATE TABLE IF NOT EXISTS "connector_imports" (
  "id"           TEXT         NOT NULL DEFAULT gen_random_uuid()::text,
  "sourceId"     TEXT         NOT NULL,
  "auditId"      TEXT,
  "status"       "ImportStatus" NOT NULL DEFAULT 'PENDING',
  "recordCount"  INTEGER,
  "errorMsg"     TEXT,
  "result"       JSONB,
  "startedAt"    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  "completedAt"  TIMESTAMPTZ,

  CONSTRAINT "connector_imports_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "connector_imports_sourceId_fkey"
    FOREIGN KEY ("sourceId") REFERENCES "data_sources"("id") ON DELETE CASCADE,
  CONSTRAINT "connector_imports_auditId_fkey"
    FOREIGN KEY ("auditId") REFERENCES "audits"("id")
);

CREATE INDEX IF NOT EXISTS "connector_imports_sourceId_idx"
  ON "connector_imports" ("sourceId");
CREATE INDEX IF NOT EXISTS "connector_imports_auditId_idx"
  ON "connector_imports" ("auditId");
