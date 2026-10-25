-- ════════════════════════════════════════════════════════════════════════════
-- Portal PBC: código por correo antes de ver la solicitud (docs/portal-pbc-codigo-por-correo.md)
-- SOLO "EXPANDIR": columnas nuevas con valor por defecto y dos tablas nuevas. No hay paso de "contraer":
-- no se elimina ni renombra nada. El código desplegado hoy no conoce estas columnas y sigue funcionando
-- (Prisma solo selecciona las columnas que conoce), así que este SQL se aplica ANTES del código nuevo.
-- Los enlaces /portal#<token> vigentes no cambian: solo pasan a pedir el código.
-- NO usar `prisma db push`.
-- Reversa: 2026-10-pbc-portal-otp.REVERSA.sql (después de volver al código anterior).
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── Estado del código en la solicitud (mismo esquema que signature_requests, con prefijo "portal") ──
ALTER TABLE "pbc_requests" ADD COLUMN IF NOT EXISTS "portalOtpHash"         TEXT;
ALTER TABLE "pbc_requests" ADD COLUMN IF NOT EXISTS "portalOtpExpiresAt"    TIMESTAMP(3);
ALTER TABLE "pbc_requests" ADD COLUMN IF NOT EXISTS "portalOtpAttempts"     INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "pbc_requests" ADD COLUMN IF NOT EXISTS "portalOtpFailuresHour" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "pbc_requests" ADD COLUMN IF NOT EXISTS "portalOtpWindowStart"  TIMESTAMP(3);
ALTER TABLE "pbc_requests" ADD COLUMN IF NOT EXISTS "portalOtpSentCount"    INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "pbc_requests" ADD COLUMN IF NOT EXISTS "portalOtpLastSentAt"   TIMESTAMP(3);
ALTER TABLE "pbc_requests" ADD COLUMN IF NOT EXISTS "portalLockedUntil"     TIMESTAMP(3);
ALTER TABLE "pbc_requests" ADD COLUMN IF NOT EXISTS "portalLockCount"       INTEGER NOT NULL DEFAULT 0;

-- ── Sesiones cortas del auditado (solo la huella sha256 del token de sesión) ──
CREATE TABLE IF NOT EXISTS "pbc_portal_sessions" (
  "id"        TEXT         NOT NULL,
  "requestId" TEXT         NOT NULL,
  "tokenHash" TEXT         NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "ip"        TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMP(3),
  CONSTRAINT "pbc_portal_sessions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "pbc_portal_sessions_tokenHash_key" ON "pbc_portal_sessions"("tokenHash");
CREATE INDEX        IF NOT EXISTS "pbc_portal_sessions_requestId_idx" ON "pbc_portal_sessions"("requestId");
ALTER TABLE "pbc_portal_sessions" DROP CONSTRAINT IF EXISTS "pbc_portal_sessions_requestId_fkey";
ALTER TABLE "pbc_portal_sessions" ADD CONSTRAINT "pbc_portal_sessions_requestId_fkey"
  FOREIGN KEY ("requestId") REFERENCES "pbc_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Bitácora simple del portal (sin cadena de hash): topes diarios y rastro de accesos. Nunca guarda códigos ni sesiones ──
DO $$ BEGIN
  CREATE TYPE "PbcPortalEventType" AS ENUM ('OTP_SENT', 'OTP_FAILED', 'OTP_LOCKED', 'SESSION_STARTED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "pbc_portal_events" (
  "id"        TEXT                 NOT NULL,
  "requestId" TEXT                 NOT NULL,
  "type"      "PbcPortalEventType" NOT NULL,
  "at"        TIMESTAMP(3)         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ip"        TEXT,
  "userAgent" TEXT,
  "detail"    JSONB,
  CONSTRAINT "pbc_portal_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "pbc_portal_events_requestId_type_at_idx" ON "pbc_portal_events"("requestId", "type", "at");
CREATE INDEX IF NOT EXISTS "pbc_portal_events_type_at_idx"           ON "pbc_portal_events"("type", "at");
ALTER TABLE "pbc_portal_events" DROP CONSTRAINT IF EXISTS "pbc_portal_events_requestId_fkey";
ALTER TABLE "pbc_portal_events" ADD CONSTRAINT "pbc_portal_events_requestId_fkey"
  FOREIGN KEY ("requestId") REFERENCES "pbc_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Seguridad: RLS activo y nada para anon/authenticated (regla de project_security_audit, 2026-10-18) ──
ALTER TABLE "pbc_portal_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pbc_portal_events"   ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "pbc_portal_sessions", "pbc_portal_events" FROM anon, authenticated;

COMMIT;
