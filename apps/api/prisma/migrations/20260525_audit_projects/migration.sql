-- CreateTable
CREATE TABLE "audit_projects" (
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
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "audit_projects_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "audit_projects_organizationId_idx" ON "audit_projects"("organizationId");
CREATE INDEX "audit_projects_organizationId_planYear_idx" ON "audit_projects"("organizationId", "planYear");

ALTER TABLE "audit_projects" ADD CONSTRAINT "audit_projects_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "audit_projects" ADD CONSTRAINT "audit_projects_strategicObjectiveId_fkey"
    FOREIGN KEY ("strategicObjectiveId") REFERENCES "strategic_objectives"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "audit_projects" ADD CONSTRAINT "audit_projects_strategicLineId_fkey"
    FOREIGN KEY ("strategicLineId") REFERENCES "strategic_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "audit_projects" ADD CONSTRAINT "audit_projects_responsibleEntityId_fkey"
    FOREIGN KEY ("responsibleEntityId") REFERENCES "audit_entities"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "audit_projects" ADD CONSTRAINT "audit_projects_supportEntityId_fkey"
    FOREIGN KEY ("supportEntityId") REFERENCES "audit_entities"("id") ON DELETE SET NULL ON UPDATE CASCADE;
