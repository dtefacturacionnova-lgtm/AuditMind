-- P.4 Plan Anual mejorado: vincular AuditPlanItem → AuditProject (Banco de Proyectos)
-- Allows plan items to be sourced directly from the audit project bank

ALTER TABLE "audit_plan_items" ADD COLUMN "auditProjectId" TEXT;

ALTER TABLE "audit_plan_items"
  ADD CONSTRAINT "audit_plan_items_auditProjectId_fkey"
  FOREIGN KEY ("auditProjectId")
  REFERENCES "audit_projects"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

CREATE INDEX "audit_plan_items_auditProjectId_idx" ON "audit_plan_items"("auditProjectId");
