-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'CAE', 'AUDIT_MANAGER', 'SENIOR_AUDITOR', 'AUDITOR', 'AUDITEE', 'READ_ONLY');

-- CreateEnum
CREATE TYPE "AuditType" AS ENUM ('INTERNAL', 'EXTERNAL', 'OPERATIONAL', 'FINANCIAL', 'IT', 'COMPLIANCE', 'ESG', 'FORENSIC', 'BCP_DRP');

-- CreateEnum
CREATE TYPE "AuditStatus" AS ENUM ('PLANNING', 'IN_PROGRESS', 'REVIEW', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WorkingPaperType" AS ENUM ('PLANNING_UNDERSTANDING', 'CONTROL_EVALUATION', 'SUBSTANTIVE_TEST', 'DATA_ANALYSIS', 'FINDING', 'CLOSURE_CONCLUSION', 'INTERVIEW', 'CONFIRMATION', 'NORMATIVE_ANALYSIS');

-- CreateEnum
CREATE TYPE "WorkingPaperStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'APPROVED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "FindingSeverity" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFORMATIONAL');

-- CreateEnum
CREATE TYPE "FindingStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'APPROVED', 'IN_PROGRESS', 'CLOSED', 'OVERDUE', 'ACCEPTED_RISK');

-- CreateEnum
CREATE TYPE "PbcRequestStatus" AS ENUM ('PENDING', 'SUBMITTED', 'ACCEPTED', 'REJECTED', 'OVERDUE');

-- CreateEnum
CREATE TYPE "RagBase" AS ENUM ('IIA_2025', 'AUDIT_TI', 'CONTINUITY', 'COMPLIANCE', 'ANTI_FRAUD', 'AI_GOVERNANCE', 'CLIENT_NORMATIVE', 'FINANCIAL', 'SECTOR_SPECIFIC');

-- CreateEnum
CREATE TYPE "DocScope" AS ENUM ('GLOBAL', 'CLIENT');

-- CreateEnum
CREATE TYPE "AuditRiskLevel" AS ENUM ('LOW', 'MODERATE', 'HIGH', 'VERY_HIGH');

-- CreateEnum
CREATE TYPE "AuditApproach" AS ENUM ('CONTROLS_RELIANCE', 'SUBSTANTIVE_FOCUS', 'COMBINED');

-- CreateEnum
CREATE TYPE "EscalationLevel" AS ENUM ('NONE', 'MANAGER', 'CAE', 'COMMITTEE');

-- CreateEnum
CREATE TYPE "ComplianceFramework" AS ENUM ('SOX', 'BASEL_III', 'GDPR', 'LGPD', 'FATF', 'PCI_DSS', 'IFRS', 'EU_AI_ACT', 'COBIT', 'NIST_CSF', 'ISO_27001', 'ISO_22301', 'HIPAA', 'FCPA');

-- CreateEnum
CREATE TYPE "CertificationType" AS ENUM ('CIA', 'CISA', 'CFE', 'CPA', 'CRMA', 'CGAP', 'PMP', 'ISO27001_LA', 'ISO22301_LA', 'CISSP', 'CDPSE');

-- CreateEnum
CREATE TYPE "TickMark" AS ENUM ('VERIFIED', 'EXCEPTION', 'ESTIMATED', 'CONFIRMED_THIRD', 'RECALCULATED', 'FOOTED', 'CROSS_FOOTED', 'NOT_APPLICABLE', 'PENDING', 'ATTENTION');

-- CreateEnum
CREATE TYPE "ConfirmationType" AS ENUM ('BANK', 'CLIENT', 'LAWYER', 'SUPPLIER', 'OTHER');

-- CreateEnum
CREATE TYPE "ConfirmationStatus" AS ENUM ('DRAFT', 'SENT', 'RECEIVED', 'RECONCILED', 'NO_RESPONSE', 'ALT_PROCEDURE');

-- CreateEnum
CREATE TYPE "QaipEvaluationType" AS ENUM ('INTERNAL_CONTINUOUS', 'INTERNAL_PERIODIC', 'EXTERNAL');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'EMAIL', 'SLACK', 'TEAMS');

-- CreateEnum
CREATE TYPE "AIAssistantPersonality" AS ENUM ('ATHENA', 'HERMES', 'MINERVA');

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'starter',
    "settings" JSONB NOT NULL DEFAULT '{}',
    "logoUrl" TEXT,
    "primaryColor" TEXT DEFAULT '#0F2D4A',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "trialEndsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "supabaseUserId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'AUDITOR',
    "avatarUrl" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "timezone" TEXT NOT NULL DEFAULT 'America/Lima',
    "preferredLanguage" TEXT NOT NULL DEFAULT 'es',
    "aiAssistantPersonality" "AIAssistantPersonality" NOT NULL DEFAULT 'ATHENA',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_certifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "CertificationType" NOT NULL,
    "certNumber" TEXT,
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "verificationUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_certifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_competencies" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "expertiseLevel" INTEGER NOT NULL,
    "yearsExperience" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "user_competencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cpe_records" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "hours" DOUBLE PRECISION NOT NULL,
    "description" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cpe_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_entities" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "parentEntityId" TEXT,
    "responsible" TEXT,
    "location" TEXT,
    "sector" TEXT,
    "relatedSystems" JSONB NOT NULL DEFAULT '[]',
    "inherentRiskScore" INTEGER NOT NULL DEFAULT 50,
    "lastAuditDate" TIMESTAMP(3),
    "recommendedFrequencyMonths" INTEGER NOT NULL DEFAULT 12,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "excluded" BOOLEAN NOT NULL DEFAULT false,
    "exclusionJustification" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "audit_entities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_plans" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "totalHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "objectives" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "audit_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_plan_items" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "auditEntityId" TEXT NOT NULL,
    "estimatedHours" DOUBLE PRECISION NOT NULL,
    "tentativeStartDate" TIMESTAMP(3),
    "tentativeEndDate" TIMESTAMP(3),
    "priority" INTEGER NOT NULL DEFAULT 1,
    "notes" TEXT,

    CONSTRAINT "audit_plan_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "risk_registers" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "auditEntityId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "probability" INTEGER NOT NULL,
    "impact" INTEGER NOT NULL,
    "inherentScore" INTEGER NOT NULL,
    "controlsScore" INTEGER NOT NULL DEFAULT 0,
    "residualScore" INTEGER NOT NULL,
    "kris" JSONB NOT NULL DEFAULT '[]',
    "trend" TEXT NOT NULL DEFAULT 'STABLE',
    "lastUpdated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "risk_registers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audits" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "planId" TEXT,
    "auditEntityId" TEXT,
    "title" TEXT NOT NULL,
    "type" "AuditType" NOT NULL,
    "status" "AuditStatus" NOT NULL DEFAULT 'PLANNING',
    "scope" TEXT,
    "objectives" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "estimatedHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "actualHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "leadAuditorId" TEXT,
    "isInvestigationMode" BOOLEAN NOT NULL DEFAULT false,
    "investigationActivatedAt" TIMESTAMP(3),
    "investigationActivatedBy" TEXT,
    "materiality" DECIMAL(15,2),
    "materialityExecution" DECIMAL(15,2),
    "materialityAccumulation" DECIMAL(15,2),
    "materialityBase" TEXT,
    "materialityBaseAmount" DECIMAL(15,2),
    "auditRiskModel" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "audits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_teams" (
    "id" TEXT NOT NULL,
    "auditId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'AUDITOR',
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_programs" (
    "id" TEXT NOT NULL,
    "auditId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "objectives" TEXT,
    "steps" JSONB NOT NULL DEFAULT '[]',
    "generatedByAI" BOOLEAN NOT NULL DEFAULT false,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "audit_programs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "working_papers" (
    "id" TEXT NOT NULL,
    "auditId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "indexSection" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" "WorkingPaperType" NOT NULL,
    "status" "WorkingPaperStatus" NOT NULL DEFAULT 'DRAFT',
    "content" JSONB NOT NULL DEFAULT '{}',
    "conclusion" TEXT,
    "preparedById" TEXT,
    "reviewedById" TEXT,
    "qualityScore" INTEGER,
    "version" INTEGER NOT NULL DEFAULT 1,
    "tickMarks" JSONB NOT NULL DEFAULT '[]',
    "crossReferences" JSONB NOT NULL DEFAULT '[]',
    "aiAssisted" BOOLEAN NOT NULL DEFAULT false,
    "parentPaperId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "working_papers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "working_paper_versions" (
    "id" TEXT NOT NULL,
    "paperId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "content" JSONB NOT NULL,
    "changedBy" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "diff" JSONB,

    CONSTRAINT "working_paper_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "working_paper_comments" (
    "id" TEXT NOT NULL,
    "paperId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "working_paper_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tick_mark_entries" (
    "id" TEXT NOT NULL,
    "paperId" TEXT NOT NULL,
    "fieldPath" TEXT NOT NULL,
    "tickMark" "TickMark" NOT NULL,
    "note" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tick_mark_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_confirmations" (
    "id" TEXT NOT NULL,
    "auditId" TEXT NOT NULL,
    "type" "ConfirmationType" NOT NULL,
    "respondentName" TEXT NOT NULL,
    "respondentEmail" TEXT NOT NULL,
    "amount" DECIMAL(15,2),
    "accountRef" TEXT,
    "sentAt" TIMESTAMP(3),
    "sentBy" TEXT,
    "responseReceivedAt" TIMESTAMP(3),
    "responseContent" TEXT,
    "responseAmount" DECIMAL(15,2),
    "difference" DECIMAL(15,2),
    "differenceExplanation" TEXT,
    "status" "ConfirmationStatus" NOT NULL DEFAULT 'DRAFT',
    "alternativeProcedure" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "external_confirmations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pbc_requests" (
    "id" TEXT NOT NULL,
    "auditId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "requestedToEmail" TEXT NOT NULL,
    "requestedToName" TEXT,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "status" "PbcRequestStatus" NOT NULL DEFAULT 'PENDING',
    "portalToken" TEXT NOT NULL,
    "fileUrls" JSONB NOT NULL DEFAULT '[]',
    "rejectionReason" TEXT,
    "submittedAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "templateId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pbc_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pbc_messages" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "senderEmail" TEXT NOT NULL,
    "senderName" TEXT,
    "isAuditor" BOOLEAN NOT NULL DEFAULT false,
    "content" TEXT NOT NULL,
    "attachmentUrls" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pbc_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "findings" (
    "id" TEXT NOT NULL,
    "auditId" TEXT NOT NULL,
    "workingPaperId" TEXT,
    "organizationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "condition" TEXT NOT NULL,
    "criteria" TEXT NOT NULL,
    "cause" TEXT NOT NULL,
    "effect" TEXT NOT NULL,
    "risk" TEXT NOT NULL,
    "recommendation" TEXT NOT NULL,
    "managementResponse" TEXT,
    "severity" "FindingSeverity" NOT NULL,
    "status" "FindingStatus" NOT NULL DEFAULT 'DRAFT',
    "qualityScore" INTEGER NOT NULL DEFAULT 0,
    "aiDraftUsed" BOOLEAN NOT NULL DEFAULT false,
    "normativeReference" TEXT,
    "normativeArticle" TEXT,
    "isMaterial" BOOLEAN,
    "effectAmount" DECIMAL(15,2),
    "responsibleId" TEXT,
    "dueDate" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "closedById" TEXT,
    "isRecurring" BOOLEAN NOT NULL DEFAULT false,
    "previousFindingId" TEXT,
    "escalationLevel" "EscalationLevel" NOT NULL DEFAULT 'NONE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "findings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finding_actions" (
    "id" TEXT NOT NULL,
    "findingId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "responsibleId" TEXT,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "completionDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "progressPct" INTEGER NOT NULL DEFAULT 0,
    "evidenceUrls" JSONB NOT NULL DEFAULT '[]',
    "comments" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "finding_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finding_comments" (
    "id" TEXT NOT NULL,
    "findingId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "isInternal" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "finding_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_analysis_jobs" (
    "id" TEXT NOT NULL,
    "auditId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "parameters" JSONB NOT NULL DEFAULT '{}',
    "resultsSummary" JSONB,
    "flaggedCount" INTEGER NOT NULL DEFAULT 0,
    "totalRecords" INTEGER NOT NULL DEFAULT 0,
    "processingMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "data_analysis_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_flags" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "auditId" TEXT NOT NULL,
    "entityRef" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "riskScore" DOUBLE PRECISION NOT NULL,
    "anomalyType" TEXT NOT NULL,
    "rawData" JSONB NOT NULL,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "disposition" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "data_flags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_reports" (
    "id" TEXT NOT NULL,
    "auditId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" JSONB NOT NULL DEFAULT '{}',
    "version" INTEGER NOT NULL DEFAULT 1,
    "aiGenerated" BOOLEAN NOT NULL DEFAULT false,
    "aiModelUsed" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "distributionList" JSONB NOT NULL DEFAULT '[]',
    "scheduledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "audit_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "templates" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "dynamicFields" JSONB NOT NULL DEFAULT '[]',
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "isGlobal" BOOLEAN NOT NULL DEFAULT false,
    "tags" JSONB NOT NULL DEFAULT '[]',
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_documents" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "title" TEXT NOT NULL,
    "docType" TEXT NOT NULL,
    "ragBase" "RagBase" NOT NULL,
    "scope" "DocScope" NOT NULL DEFAULT 'CLIENT',
    "fileUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "chunkCount" INTEGER NOT NULL DEFAULT 0,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knowledge_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_interactions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "agentName" TEXT NOT NULL,
    "modelUsed" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "latencyMs" INTEGER NOT NULL,
    "taskType" TEXT NOT NULL,
    "approved" BOOLEAN,
    "feedbackScore" INTEGER,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_interactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "llm_router_logs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "taskType" TEXT NOT NULL,
    "modelSelected" TEXT NOT NULL,
    "fallbackUsed" BOOLEAN NOT NULL DEFAULT false,
    "tokensUsed" INTEGER NOT NULL,
    "costUsd" DOUBLE PRECISION NOT NULL,
    "success" BOOLEAN NOT NULL,
    "errorMsg" TEXT,
    "latencyMs" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "llm_router_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compliance_assessments" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "auditId" TEXT,
    "framework" "ComplianceFramework" NOT NULL,
    "year" INTEGER NOT NULL,
    "gapAnalysis" JSONB NOT NULL DEFAULT '{}',
    "overallScore" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "compliance_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "normative_exceptions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "framework" TEXT NOT NULL,
    "controlRef" TEXT NOT NULL,
    "justification" TEXT NOT NULL,
    "compensatingControl" TEXT,
    "approvedBy" TEXT NOT NULL,
    "approvedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "residualRiskLevel" TEXT NOT NULL,
    "riskOwnerSignature" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "normative_exceptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qaip_evaluations" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "type" "QaipEvaluationType" NOT NULL,
    "period" TEXT NOT NULL,
    "results" JSONB NOT NULL DEFAULT '{}',
    "overallScore" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    "conductedBy" TEXT NOT NULL,
    "conductedAt" TIMESTAMP(3) NOT NULL,
    "nextDueAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "qaip_evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "independence_declarations" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "caeId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "declarationText" TEXT NOT NULL,
    "signedAt" TIMESTAMP(3) NOT NULL,
    "documentUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "independence_declarations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_charters" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "content" JSONB NOT NULL,
    "approvedBy" TEXT NOT NULL,
    "approvedAt" TIMESTAMP(3) NOT NULL,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_charters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "committee_sessions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "sessionDate" TIMESTAMP(3) NOT NULL,
    "agenda" JSONB NOT NULL DEFAULT '[]',
    "minutes" JSONB,
    "attendees" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "nextSessionDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "committee_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "committee_reports" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "sessionId" TEXT,
    "period" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "preparedById" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "committee_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bcp_audits" (
    "id" TEXT NOT NULL,
    "auditId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "framework" TEXT NOT NULL DEFAULT 'ISO_22301',
    "bcpMaturityScore" INTEGER,
    "components" JSONB NOT NULL DEFAULT '{}',
    "rtoRpoAssessment" JSONB,
    "lastTestedAt" TIMESTAMP(3),
    "recommendations" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bcp_audits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "channel" "NotificationChannel" NOT NULL DEFAULT 'IN_APP',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "users_supabaseUserId_key" ON "users"("supabaseUserId");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_organizationId_idx" ON "users"("organizationId");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "user_certifications_userId_idx" ON "user_certifications"("userId");

-- CreateIndex
CREATE INDEX "user_competencies_userId_idx" ON "user_competencies"("userId");

-- CreateIndex
CREATE INDEX "cpe_records_userId_year_idx" ON "cpe_records"("userId", "year");

-- CreateIndex
CREATE INDEX "audit_entities_organizationId_idx" ON "audit_entities"("organizationId");

-- CreateIndex
CREATE INDEX "audit_entities_organizationId_inherentRiskScore_idx" ON "audit_entities"("organizationId", "inherentRiskScore");

-- CreateIndex
CREATE INDEX "audit_entities_organizationId_active_idx" ON "audit_entities"("organizationId", "active");

-- CreateIndex
CREATE INDEX "audit_plans_organizationId_idx" ON "audit_plans"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "audit_plans_organizationId_year_key" ON "audit_plans"("organizationId", "year");

-- CreateIndex
CREATE INDEX "audit_plan_items_planId_idx" ON "audit_plan_items"("planId");

-- CreateIndex
CREATE INDEX "risk_registers_organizationId_idx" ON "risk_registers"("organizationId");

-- CreateIndex
CREATE INDEX "risk_registers_organizationId_inherentScore_idx" ON "risk_registers"("organizationId", "inherentScore");

-- CreateIndex
CREATE INDEX "audits_organizationId_idx" ON "audits"("organizationId");

-- CreateIndex
CREATE INDEX "audits_organizationId_status_idx" ON "audits"("organizationId", "status");

-- CreateIndex
CREATE INDEX "audits_leadAuditorId_idx" ON "audits"("leadAuditorId");

-- CreateIndex
CREATE INDEX "audit_teams_auditId_idx" ON "audit_teams"("auditId");

-- CreateIndex
CREATE UNIQUE INDEX "audit_teams_auditId_userId_key" ON "audit_teams"("auditId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "audit_programs_auditId_key" ON "audit_programs"("auditId");

-- CreateIndex
CREATE INDEX "audit_programs_auditId_idx" ON "audit_programs"("auditId");

-- CreateIndex
CREATE INDEX "working_papers_auditId_idx" ON "working_papers"("auditId");

-- CreateIndex
CREATE INDEX "working_papers_auditId_status_idx" ON "working_papers"("auditId", "status");

-- CreateIndex
CREATE INDEX "working_papers_auditId_type_idx" ON "working_papers"("auditId", "type");

-- CreateIndex
CREATE INDEX "working_paper_versions_paperId_idx" ON "working_paper_versions"("paperId");

-- CreateIndex
CREATE INDEX "working_paper_comments_paperId_idx" ON "working_paper_comments"("paperId");

-- CreateIndex
CREATE INDEX "tick_mark_entries_paperId_idx" ON "tick_mark_entries"("paperId");

-- CreateIndex
CREATE INDEX "tick_mark_entries_paperId_tickMark_idx" ON "tick_mark_entries"("paperId", "tickMark");

-- CreateIndex
CREATE INDEX "external_confirmations_auditId_idx" ON "external_confirmations"("auditId");

-- CreateIndex
CREATE INDEX "external_confirmations_auditId_status_idx" ON "external_confirmations"("auditId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "pbc_requests_portalToken_key" ON "pbc_requests"("portalToken");

-- CreateIndex
CREATE INDEX "pbc_requests_auditId_idx" ON "pbc_requests"("auditId");

-- CreateIndex
CREATE INDEX "pbc_requests_organizationId_idx" ON "pbc_requests"("organizationId");

-- CreateIndex
CREATE INDEX "pbc_requests_status_dueDate_idx" ON "pbc_requests"("status", "dueDate");

-- CreateIndex
CREATE INDEX "pbc_messages_requestId_idx" ON "pbc_messages"("requestId");

-- CreateIndex
CREATE INDEX "findings_auditId_idx" ON "findings"("auditId");

-- CreateIndex
CREATE INDEX "findings_organizationId_idx" ON "findings"("organizationId");

-- CreateIndex
CREATE INDEX "findings_organizationId_status_idx" ON "findings"("organizationId", "status");

-- CreateIndex
CREATE INDEX "findings_organizationId_severity_idx" ON "findings"("organizationId", "severity");

-- CreateIndex
CREATE INDEX "findings_dueDate_status_idx" ON "findings"("dueDate", "status");

-- CreateIndex
CREATE INDEX "finding_actions_findingId_idx" ON "finding_actions"("findingId");

-- CreateIndex
CREATE INDEX "finding_comments_findingId_idx" ON "finding_comments"("findingId");

-- CreateIndex
CREATE INDEX "data_analysis_jobs_auditId_idx" ON "data_analysis_jobs"("auditId");

-- CreateIndex
CREATE INDEX "data_analysis_jobs_status_idx" ON "data_analysis_jobs"("status");

-- CreateIndex
CREATE INDEX "data_flags_jobId_idx" ON "data_flags"("jobId");

-- CreateIndex
CREATE INDEX "data_flags_auditId_idx" ON "data_flags"("auditId");

-- CreateIndex
CREATE INDEX "data_flags_riskScore_idx" ON "data_flags"("riskScore");

-- CreateIndex
CREATE INDEX "audit_reports_auditId_idx" ON "audit_reports"("auditId");

-- CreateIndex
CREATE INDEX "audit_reports_organizationId_idx" ON "audit_reports"("organizationId");

-- CreateIndex
CREATE INDEX "templates_organizationId_idx" ON "templates"("organizationId");

-- CreateIndex
CREATE INDEX "templates_category_idx" ON "templates"("category");

-- CreateIndex
CREATE INDEX "knowledge_documents_organizationId_idx" ON "knowledge_documents"("organizationId");

-- CreateIndex
CREATE INDEX "knowledge_documents_ragBase_scope_idx" ON "knowledge_documents"("ragBase", "scope");

-- CreateIndex
CREATE INDEX "ai_interactions_organizationId_idx" ON "ai_interactions"("organizationId");

-- CreateIndex
CREATE INDEX "ai_interactions_organizationId_agentName_idx" ON "ai_interactions"("organizationId", "agentName");

-- CreateIndex
CREATE INDEX "llm_router_logs_organizationId_idx" ON "llm_router_logs"("organizationId");

-- CreateIndex
CREATE INDEX "llm_router_logs_createdAt_idx" ON "llm_router_logs"("createdAt");

-- CreateIndex
CREATE INDEX "compliance_assessments_organizationId_idx" ON "compliance_assessments"("organizationId");

-- CreateIndex
CREATE INDEX "compliance_assessments_organizationId_framework_idx" ON "compliance_assessments"("organizationId", "framework");

-- CreateIndex
CREATE INDEX "normative_exceptions_organizationId_idx" ON "normative_exceptions"("organizationId");

-- CreateIndex
CREATE INDEX "normative_exceptions_organizationId_active_idx" ON "normative_exceptions"("organizationId", "active");

-- CreateIndex
CREATE INDEX "qaip_evaluations_organizationId_idx" ON "qaip_evaluations"("organizationId");

-- CreateIndex
CREATE INDEX "independence_declarations_organizationId_idx" ON "independence_declarations"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "independence_declarations_organizationId_year_key" ON "independence_declarations"("organizationId", "year");

-- CreateIndex
CREATE INDEX "audit_charters_organizationId_idx" ON "audit_charters"("organizationId");

-- CreateIndex
CREATE INDEX "committee_sessions_organizationId_idx" ON "committee_sessions"("organizationId");

-- CreateIndex
CREATE INDEX "committee_reports_organizationId_idx" ON "committee_reports"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "bcp_audits_auditId_key" ON "bcp_audits"("auditId");

-- CreateIndex
CREATE INDEX "bcp_audits_organizationId_idx" ON "bcp_audits"("organizationId");

-- CreateIndex
CREATE INDEX "notifications_userId_read_idx" ON "notifications"("userId", "read");

-- CreateIndex
CREATE INDEX "notifications_organizationId_idx" ON "notifications"("organizationId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_certifications" ADD CONSTRAINT "user_certifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_competencies" ADD CONSTRAINT "user_competencies_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cpe_records" ADD CONSTRAINT "cpe_records_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_entities" ADD CONSTRAINT "audit_entities_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_entities" ADD CONSTRAINT "audit_entities_parentEntityId_fkey" FOREIGN KEY ("parentEntityId") REFERENCES "audit_entities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_plans" ADD CONSTRAINT "audit_plans_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_plan_items" ADD CONSTRAINT "audit_plan_items_planId_fkey" FOREIGN KEY ("planId") REFERENCES "audit_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_plan_items" ADD CONSTRAINT "audit_plan_items_auditEntityId_fkey" FOREIGN KEY ("auditEntityId") REFERENCES "audit_entities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_registers" ADD CONSTRAINT "risk_registers_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_registers" ADD CONSTRAINT "risk_registers_auditEntityId_fkey" FOREIGN KEY ("auditEntityId") REFERENCES "audit_entities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audits" ADD CONSTRAINT "audits_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audits" ADD CONSTRAINT "audits_auditEntityId_fkey" FOREIGN KEY ("auditEntityId") REFERENCES "audit_entities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_teams" ADD CONSTRAINT "audit_teams_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "audits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_teams" ADD CONSTRAINT "audit_teams_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "working_papers" ADD CONSTRAINT "working_papers_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "audits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "working_papers" ADD CONSTRAINT "working_papers_preparedById_fkey" FOREIGN KEY ("preparedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "working_papers" ADD CONSTRAINT "working_papers_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "working_papers" ADD CONSTRAINT "working_papers_parentPaperId_fkey" FOREIGN KEY ("parentPaperId") REFERENCES "working_papers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "working_paper_versions" ADD CONSTRAINT "working_paper_versions_paperId_fkey" FOREIGN KEY ("paperId") REFERENCES "working_papers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "working_paper_comments" ADD CONSTRAINT "working_paper_comments_paperId_fkey" FOREIGN KEY ("paperId") REFERENCES "working_papers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tick_mark_entries" ADD CONSTRAINT "tick_mark_entries_paperId_fkey" FOREIGN KEY ("paperId") REFERENCES "working_papers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_confirmations" ADD CONSTRAINT "external_confirmations_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "audits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pbc_requests" ADD CONSTRAINT "pbc_requests_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "audits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pbc_requests" ADD CONSTRAINT "pbc_requests_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pbc_messages" ADD CONSTRAINT "pbc_messages_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "pbc_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "findings" ADD CONSTRAINT "findings_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "audits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "findings" ADD CONSTRAINT "findings_workingPaperId_fkey" FOREIGN KEY ("workingPaperId") REFERENCES "working_papers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "findings" ADD CONSTRAINT "findings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "findings" ADD CONSTRAINT "findings_responsibleId_fkey" FOREIGN KEY ("responsibleId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "findings" ADD CONSTRAINT "findings_previousFindingId_fkey" FOREIGN KEY ("previousFindingId") REFERENCES "findings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finding_actions" ADD CONSTRAINT "finding_actions_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "findings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finding_comments" ADD CONSTRAINT "finding_comments_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "findings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_analysis_jobs" ADD CONSTRAINT "data_analysis_jobs_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "audits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_analysis_jobs" ADD CONSTRAINT "data_analysis_jobs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_flags" ADD CONSTRAINT "data_flags_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "data_analysis_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_reports" ADD CONSTRAINT "audit_reports_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "audits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_reports" ADD CONSTRAINT "audit_reports_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "templates" ADD CONSTRAINT "templates_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_documents" ADD CONSTRAINT "knowledge_documents_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_interactions" ADD CONSTRAINT "ai_interactions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_interactions" ADD CONSTRAINT "ai_interactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "llm_router_logs" ADD CONSTRAINT "llm_router_logs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compliance_assessments" ADD CONSTRAINT "compliance_assessments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "normative_exceptions" ADD CONSTRAINT "normative_exceptions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qaip_evaluations" ADD CONSTRAINT "qaip_evaluations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "independence_declarations" ADD CONSTRAINT "independence_declarations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_charters" ADD CONSTRAINT "audit_charters_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "committee_sessions" ADD CONSTRAINT "committee_sessions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "committee_reports" ADD CONSTRAINT "committee_reports_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "committee_reports" ADD CONSTRAINT "committee_reports_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "committee_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bcp_audits" ADD CONSTRAINT "bcp_audits_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "audits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
