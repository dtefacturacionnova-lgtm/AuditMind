-- AuditProcedure: rmmRiskRef becomes an array (one procedure can relate to more
-- than one risk row), and adds wpRef for cross-referencing the working paper
-- where the procedure is actually executed/documented (mirrors AuditStep.wpRef).
ALTER TABLE "audit_procedures" DROP COLUMN IF EXISTS "rmmRiskRef";
ALTER TABLE "audit_procedures" ADD COLUMN "rmmRiskRef" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "audit_procedures" ADD COLUMN IF NOT EXISTS "wpRef" TEXT;
