-- Reversa de 2026-10-horas-cierre.sql — BORRA los cierres, los ajustes y la bitácora de horas, y las 5 columnas nuevas de time_entries
-- (los snapshots de costo/tarifa y los motivos de no facturable). Las horas registradas NO se tocan.
-- Usar solo antes de que existan cierres reales, o con un respaldo de las 4 tablas.
BEGIN;
DROP TABLE IF EXISTS "time_adjustment_requests";
DROP TABLE IF EXISTS "time_entry_logs";
DROP TABLE IF EXISTS "hours_period_closes";
DROP TABLE IF EXISTS "hours_close_settings";
DROP INDEX IF EXISTS "time_entries_userId_workDate_idx";
ALTER TABLE "time_entries" DROP COLUMN IF EXISTS "afterClose";
ALTER TABLE "time_entries" DROP COLUMN IF EXISTS "closedAt";
ALTER TABLE "time_entries" DROP COLUMN IF EXISTS "billRateSnapshot";
ALTER TABLE "time_entries" DROP COLUMN IF EXISTS "costRateSnapshot";
ALTER TABLE "time_entries" DROP COLUMN IF EXISTS "nonBillableReason";
DROP TYPE IF EXISTS "TimeEntryLogAction";
DROP TYPE IF EXISTS "TimeAdjustmentStatus";
DROP TYPE IF EXISTS "TimeAdjustmentAction";
DROP TYPE IF EXISTS "HoursCloseStatus";
DROP TYPE IF EXISTS "NonBillableReason";
COMMIT;
