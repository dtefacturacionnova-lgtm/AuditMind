-- ─── Universo de Auditorías — Redesign 2026-05-26 ─────────────────────────────
-- Agrega clasificación estratégica/riesgo a AuditableUnit y nuevos factores
-- de scoring en AuditableUnitAssessment (staffTurnover + coverageHistory).
-- Todos los cambios son idempotentes (IF NOT EXISTS).

-- ── 1. auditable_units: nuevos campos ──────────────────────────────────────────

ALTER TABLE "auditable_units"
  ADD COLUMN IF NOT EXISTS "strategicLineId" TEXT;

ALTER TABLE "auditable_units"
  ADD COLUMN IF NOT EXISTS "riskType" TEXT;

-- FK strategicLineId → strategic_lines (SET NULL si se elimina la línea)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'auditable_units_strategicLineId_fkey'
  ) THEN
    ALTER TABLE "auditable_units"
      ADD CONSTRAINT "auditable_units_strategicLineId_fkey"
      FOREIGN KEY ("strategicLineId")
      REFERENCES "strategic_lines"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "auditable_units_strategicLineId_idx"
  ON "auditable_units"("strategicLineId");

-- ── 2. auditable_unit_assessments: nuevos factores Grupo B ────────────────────

-- Rotación de Personal (reemplaza a changeVelocityScore en el cálculo)
ALTER TABLE "auditable_unit_assessments"
  ADD COLUMN IF NOT EXISTS "staffTurnoverScore" INTEGER NOT NULL DEFAULT 1;

-- Historial de Cobertura (nuevo factor)
ALTER TABLE "auditable_unit_assessments"
  ADD COLUMN IF NOT EXISTS "coverageHistoryScore" INTEGER NOT NULL DEFAULT 1;

-- Copiar changeVelocityScore → staffTurnoverScore para registros existentes
UPDATE "auditable_unit_assessments"
  SET "staffTurnoverScore" = "changeVelocityScore"
  WHERE "staffTurnoverScore" = 1
    AND "changeVelocityScore" > 1;
