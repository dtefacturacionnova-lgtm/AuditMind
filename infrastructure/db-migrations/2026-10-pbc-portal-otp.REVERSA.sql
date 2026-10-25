-- Reversa de 2026-10-pbc-portal-otp.sql. Aplicar DESPUÉS de volver al código anterior (el código nuevo
-- necesita estas columnas y tablas). Se pierden las sesiones abiertas, la bitácora del portal y los bloqueos:
-- los enlaces vuelven a abrir el portal sin código.
BEGIN;
DROP TABLE IF EXISTS "pbc_portal_events";
DROP TABLE IF EXISTS "pbc_portal_sessions";
DROP TYPE  IF EXISTS "PbcPortalEventType";
ALTER TABLE "pbc_requests" DROP COLUMN IF EXISTS "portalOtpHash";
ALTER TABLE "pbc_requests" DROP COLUMN IF EXISTS "portalOtpExpiresAt";
ALTER TABLE "pbc_requests" DROP COLUMN IF EXISTS "portalOtpAttempts";
ALTER TABLE "pbc_requests" DROP COLUMN IF EXISTS "portalOtpFailuresHour";
ALTER TABLE "pbc_requests" DROP COLUMN IF EXISTS "portalOtpWindowStart";
ALTER TABLE "pbc_requests" DROP COLUMN IF EXISTS "portalOtpSentCount";
ALTER TABLE "pbc_requests" DROP COLUMN IF EXISTS "portalOtpLastSentAt";
ALTER TABLE "pbc_requests" DROP COLUMN IF EXISTS "portalLockedUntil";
ALTER TABLE "pbc_requests" DROP COLUMN IF EXISTS "portalLockCount";
COMMIT;
