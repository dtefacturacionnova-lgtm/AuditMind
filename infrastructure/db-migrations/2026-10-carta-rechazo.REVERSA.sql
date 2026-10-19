-- Reversa de 2026-10-carta-rechazo.sql — borra el motivo de rechazo de las cartas.
BEGIN;
ALTER TABLE "engagement_letters" DROP COLUMN IF EXISTS "declineReason";
COMMIT;
