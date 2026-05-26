-- Migración consolidada: strategic_planning + audit_projects + plan_annual_mejorado
-- Todo idempotente (IF NOT EXISTS / DO $$ BEGIN...END $$) para ser re-ejecutable sin errores.

-- ── 1. strategic_objectives ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "strategic_objectives" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT NOT NULL DEFAULT 'blue',
    "icon" TEXT NOT NULL DEFAULT '🎯',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "strategic_objectives_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "strategic_objectives_organizationId_idx"
    ON "strategic_objectives"("organizationId");

CREATE UNIQUE INDEX IF NOT EXISTS "strategic_objectives_organizationId_code_key"
    ON "strategic_objectives"("organizationId", "code");

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'strategic_objectives_organizationId_fkey') THEN
        ALTER TABLE "strategic_objectives"
            ADD CONSTRAINT "strategic_objectives_organizationId_fkey"
            FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- ── 2. strategic_lines ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "strategic_lines" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "objectiveId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "strategic_lines_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "strategic_lines_organizationId_idx"
    ON "strategic_lines"("organizationId");

CREATE INDEX IF NOT EXISTS "strategic_lines_objectiveId_idx"
    ON "strategic_lines"("objectiveId");

CREATE UNIQUE INDEX IF NOT EXISTS "strategic_lines_organizationId_code_key"
    ON "strategic_lines"("organizationId", "code");

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'strategic_lines_organizationId_fkey') THEN
        ALTER TABLE "strategic_lines"
            ADD CONSTRAINT "strategic_lines_organizationId_fkey"
            FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'strategic_lines_objectiveId_fkey') THEN
        ALTER TABLE "strategic_lines"
            ADD CONSTRAINT "strategic_lines_objectiveId_fkey"
            FOREIGN KEY ("objectiveId") REFERENCES "strategic_objectives"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- ── 3. audit_projects ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "audit_projects" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "correlative" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "planYear" INTEGER NOT NULL,
    "strategicObjectiveId" TEXT,
    "strategicLineId" TEXT,
    "responsibleEntityId" TEXT,
    "supportEntityId" TEXT,
    "riskCategory" TEXT,
    "notes" TEXT,
    "areaScore" DOUBLE PRECISION,
    "strategicImpact" INTEGER,
    "operationalImpact" INTEGER,
    "legalRequirement" INTEGER,
    "lastAuditAge" INTEGER,
    "riskPerception" INTEGER,
    "finalRiskScore" DOUBLE PRECISION,
    "finalRiskLevel" TEXT,
    "includeInPlan" BOOLEAN NOT NULL DEFAULT false,
    "targetPlanYear" INTEGER,
    "legalBasis" TEXT,
    "frequencyPerYear" INTEGER DEFAULT 1,
    "plannedHours" DOUBLE PRECISION,
    "teamJson" JSONB,
    "totalBudget" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_projects_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "audit_projects_organizationId_idx"
    ON "audit_projects"("organizationId");

CREATE INDEX IF NOT EXISTS "audit_projects_organizationId_planYear_idx"
    ON "audit_projects"("organizationId", "planYear");

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'audit_projects_organizationId_fkey') THEN
        ALTER TABLE "audit_projects"
            ADD CONSTRAINT "audit_projects_organizationId_fkey"
            FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'audit_projects_strategicObjectiveId_fkey') THEN
        ALTER TABLE "audit_projects"
            ADD CONSTRAINT "audit_projects_strategicObjectiveId_fkey"
            FOREIGN KEY ("strategicObjectiveId") REFERENCES "strategic_objectives"("id")
            ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'audit_projects_strategicLineId_fkey') THEN
        ALTER TABLE "audit_projects"
            ADD CONSTRAINT "audit_projects_strategicLineId_fkey"
            FOREIGN KEY ("strategicLineId") REFERENCES "strategic_lines"("id")
            ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'audit_projects_responsibleEntityId_fkey') THEN
        ALTER TABLE "audit_projects"
            ADD CONSTRAINT "audit_projects_responsibleEntityId_fkey"
            FOREIGN KEY ("responsibleEntityId") REFERENCES "audit_entities"("id")
            ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'audit_projects_supportEntityId_fkey') THEN
        ALTER TABLE "audit_projects"
            ADD CONSTRAINT "audit_projects_supportEntityId_fkey"
            FOREIGN KEY ("supportEntityId") REFERENCES "audit_entities"("id")
            ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

-- ── 4. auditProjectId en audit_plan_items ────────────────────────────────────
ALTER TABLE "audit_plan_items"
    ADD COLUMN IF NOT EXISTS "auditProjectId" TEXT;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'audit_plan_items_auditProjectId_fkey') THEN
        ALTER TABLE "audit_plan_items"
            ADD CONSTRAINT "audit_plan_items_auditProjectId_fkey"
            FOREIGN KEY ("auditProjectId") REFERENCES "audit_projects"("id")
            ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS "audit_plan_items_auditProjectId_idx"
    ON "audit_plan_items"("auditProjectId");

-- ── 5. Marcar strategic_planning y audit_projects como aplicadas ─────────────
-- (sus registros en _prisma_migrations quedaron como rolled-back;
--  esta migración los reemplaza funcionalmente)
