-- Reversa de 2026-11-suscripciones-3-descargas.sql — BORRA el registro de descargas por organización. Nada más se toca.
-- Es una medición: se puede borrar sin afectar cobros, planes ni archivos (el API tolera que la tabla no exista).
BEGIN;
DROP TABLE IF EXISTS "storage_egress_daily";
COMMIT;
