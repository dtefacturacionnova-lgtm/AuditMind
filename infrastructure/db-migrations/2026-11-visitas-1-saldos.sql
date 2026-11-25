-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Visitas de la Auditoría Financiera Externa — Entrega 1: saldos por visita (planificación, interina, final).
-- Diseño: docs/visitas-auditoria-financiera-propuesta.md (§8).
-- Cambio ADITIVO: 1 tabla nueva (audit_visits), 2 tipos nuevos y 2 columnas NULAS en trial_balances (visitId, asOfDate).
-- Ninguna fila existente cambia: todas las cargas de balance actuales quedan con visitId = NULL y se comportan igual que hoy.
-- Requiere: tablas audits, organizations y trial_balances (ya existen).
-- NO usar `prisma db push` (intenta borrar rag_chunks/rag_documents): aplicar este SQL.
-- Reversa: 2026-11-visitas-1-saldos.REVERSA.sql
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TYPE "AuditVisitKind"   AS ENUM ('PLANNING', 'INTERIM', 'FINAL');
CREATE TYPE "AuditVisitStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'CLOSED');

CREATE TABLE "audit_visits" (
  "id"             TEXT                NOT NULL,
  "auditId"        TEXT                NOT NULL,
  "organizationId" TEXT                NOT NULL,
  "kind"           "AuditVisitKind"    NOT NULL,
  "cutoffDate"     DATE                NOT NULL,
  "status"         "AuditVisitStatus"  NOT NULL DEFAULT 'PLANNED',
  "isAnalysisBase" BOOLEAN             NOT NULL DEFAULT false,
  "notes"          TEXT,
  "closedAt"       TIMESTAMP(3),
  "closedById"     TEXT,
  "createdAt"      TIMESTAMP(3)        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3)        NOT NULL,
  CONSTRAINT "audit_visits_pkey" PRIMARY KEY ("id"),
  -- Una visita está cerrada si y solo si tiene fecha de cierre.
  CONSTRAINT "audit_visits_closed_chk" CHECK (("status" = 'CLOSED') = ("closedAt" IS NOT NULL))
);

-- A lo más una visita de cada tipo por encargo.
CREATE UNIQUE INDEX "audit_visits_auditId_kind_key" ON "audit_visits"("auditId", "kind");
-- A lo más una visita marcada como base de análisis por encargo (índice parcial: Prisma no lo puede declarar).
CREATE UNIQUE INDEX "audit_visits_one_base_key" ON "audit_visits"("auditId") WHERE "isAnalysisBase";
CREATE INDEX "audit_visits_organizationId_idx" ON "audit_visits"("organizationId");

ALTER TABLE "audit_visits" ADD CONSTRAINT "audit_visits_auditId_fkey"
  FOREIGN KEY ("auditId") REFERENCES "audits"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "audit_visits" ADD CONSTRAINT "audit_visits_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Balance de comprobación: a qué visita pertenece cada carga y a qué fecha están los saldos ──
ALTER TABLE "trial_balances" ADD COLUMN "visitId"  TEXT;
ALTER TABLE "trial_balances" ADD COLUMN "asOfDate" DATE;
CREATE INDEX "trial_balances_visitId_idx" ON "trial_balances"("visitId");
-- Si se borra una visita, sus balances NO se borran: quedan como cargas sin visita.
ALTER TABLE "trial_balances" ADD CONSTRAINT "trial_balances_visitId_fkey"
  FOREIGN KEY ("visitId") REFERENCES "audit_visits"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Seguridad: RLS activo y nada para anon/authenticated (regla de project_security_audit) ──
ALTER TABLE "audit_visits" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "audit_visits" FROM anon, authenticated;

COMMIT;
