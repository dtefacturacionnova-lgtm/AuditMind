-- ════════════════════════════════════════════════════════════════════════════
-- Cierre de horas por persona y mes — Fase 1 (docs/horas-cierre-y-honorarios-propuesta.md)
-- Cambio ADITIVO: tipos y tablas nuevos + 5 columnas nuevas y nulas (o con valor por defecto) en time_entries.
-- Con el interruptor apagado (hours_close_settings.enabled = false, o sin fila) nada se bloquea.
-- NO usar `prisma db push` (intenta borrar rag_chunks/rag_documents): aplicar este SQL.
-- Reversa: 2026-10-horas-cierre.REVERSA.sql
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── Tipos ───────────────────────────────────────────────────────────────────
CREATE TYPE "NonBillableReason"     AS ENUM ('OVER_BUDGET', 'REWORK', 'COURTESY', 'OTHER');
CREATE TYPE "HoursCloseStatus"      AS ENUM ('OPEN', 'CLOSED');
CREATE TYPE "TimeAdjustmentAction"  AS ENUM ('ADD', 'EDIT', 'DELETE');
CREATE TYPE "TimeAdjustmentStatus"  AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
CREATE TYPE "TimeEntryLogAction"    AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'ADJUSTMENT_APPROVED', 'PERIOD_CLOSED', 'PERIOD_REOPENED');

-- ── time_entries: columnas nuevas (todas nulas o con valor por defecto: no rompe el código que ya está en producción) ──
ALTER TABLE "time_entries" ADD COLUMN IF NOT EXISTS "nonBillableReason" "NonBillableReason";
ALTER TABLE "time_entries" ADD COLUMN IF NOT EXISTS "costRateSnapshot"  DECIMAL(10,2);
ALTER TABLE "time_entries" ADD COLUMN IF NOT EXISTS "billRateSnapshot"  DECIMAL(10,2);
ALTER TABLE "time_entries" ADD COLUMN IF NOT EXISTS "closedAt"          TIMESTAMP(3);
ALTER TABLE "time_entries" ADD COLUMN IF NOT EXISTS "afterClose"        BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS "time_entries_userId_workDate_idx" ON "time_entries"("userId", "workDate");

-- ── Parámetros por organización ─────────────────────────────────────────────
CREATE TABLE "hours_close_settings" (
  "organizationId"     TEXT NOT NULL,
  "enabled"            BOOLEAN NOT NULL DEFAULT false,
  "entryDeadlineDay"   INTEGER NOT NULL DEFAULT 5,
  "closeDeadlineDay"   INTEGER NOT NULL DEFAULT 10,
  "lastReminderPeriod" TEXT,
  "updatedById"        TEXT,
  "updatedAt"          TIMESTAMP(3) NOT NULL,
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "hours_close_settings_pkey" PRIMARY KEY ("organizationId"),
  CONSTRAINT "hours_close_settings_days_chk" CHECK ("entryDeadlineDay" BETWEEN 1 AND 28 AND "closeDeadlineDay" BETWEEN 1 AND 28)
);
ALTER TABLE "hours_close_settings" ADD CONSTRAINT "hours_close_settings_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Cierre por persona y mes ────────────────────────────────────────────────
CREATE TABLE "hours_period_closes" (
  "id"             TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "userId"         TEXT NOT NULL,
  "year"           INTEGER NOT NULL,
  "month"          INTEGER NOT NULL,
  "status"         "HoursCloseStatus" NOT NULL DEFAULT 'CLOSED',
  "closedById"     TEXT,
  "closedAt"       TIMESTAMP(3),
  "closeNote"      TEXT,
  "entryCount"     INTEGER NOT NULL DEFAULT 0,
  "totalHours"     DOUBLE PRECISION NOT NULL DEFAULT 0,
  "costRateSnapshot" DECIMAL(10,2),
  "reopenedById"   TEXT,
  "reopenedAt"     TIMESTAMP(3),
  "reopenReason"   TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "hours_period_closes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "hours_period_closes_month_chk" CHECK ("month" BETWEEN 1 AND 12)
);
CREATE UNIQUE INDEX "hours_period_closes_organizationId_userId_year_month_key"
  ON "hours_period_closes"("organizationId", "userId", "year", "month");
CREATE INDEX "hours_period_closes_organizationId_year_month_idx"
  ON "hours_period_closes"("organizationId", "year", "month");
ALTER TABLE "hours_period_closes" ADD CONSTRAINT "hours_period_closes_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "hours_period_closes" ADD CONSTRAINT "hours_period_closes_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Bitácora de horas (solo se agrega desde la aplicación) ──────────────────
CREATE TABLE "time_entry_logs" (
  "id"             TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "timeEntryId"    TEXT,
  "userId"         TEXT NOT NULL,
  "actorId"        TEXT NOT NULL,
  "action"         "TimeEntryLogAction" NOT NULL,
  "before"         JSONB,
  "after"          JSONB,
  "note"           TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "time_entry_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "time_entry_logs_organizationId_userId_createdAt_idx" ON "time_entry_logs"("organizationId", "userId", "createdAt");
CREATE INDEX "time_entry_logs_timeEntryId_idx" ON "time_entry_logs"("timeEntryId");
ALTER TABLE "time_entry_logs" ADD CONSTRAINT "time_entry_logs_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Pedidos de ajuste de un mes cerrado ─────────────────────────────────────
CREATE TABLE "time_adjustment_requests" (
  "id"             TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "userId"         TEXT NOT NULL,
  "year"           INTEGER NOT NULL,
  "month"          INTEGER NOT NULL,
  "action"         "TimeAdjustmentAction" NOT NULL,
  "timeEntryId"    TEXT,
  "payload"        JSONB,
  "reason"         TEXT NOT NULL,
  "status"         "TimeAdjustmentStatus" NOT NULL DEFAULT 'PENDING',
  "decidedById"    TEXT,
  "decidedAt"      TIMESTAMP(3),
  "decisionNote"   TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "time_adjustment_requests_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "time_adjustment_requests_month_chk" CHECK ("month" BETWEEN 1 AND 12)
);
CREATE INDEX "time_adjustment_requests_organizationId_status_idx" ON "time_adjustment_requests"("organizationId", "status");
CREATE INDEX "time_adjustment_requests_userId_year_month_idx" ON "time_adjustment_requests"("userId", "year", "month");
ALTER TABLE "time_adjustment_requests" ADD CONSTRAINT "time_adjustment_requests_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "time_adjustment_requests" ADD CONSTRAINT "time_adjustment_requests_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Seguridad: RLS activo y nada para anon/authenticated (regla de project_security_audit) ──
ALTER TABLE "hours_close_settings"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "hours_period_closes"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "time_entry_logs"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "time_adjustment_requests"  ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "hours_close_settings", "hours_period_closes", "time_entry_logs", "time_adjustment_requests"
  FROM anon, authenticated;

COMMIT;
