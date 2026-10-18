-- ════════════════════════════════════════════════════════════════════════════
-- Firma electrónica simple por enlace externo (docs/firma-externa-por-enlace.md §4)
-- Cambio ADITIVO: tablas y tipos nuevos + 3 columnas nuevas y nulas en organizations.
-- NO usar `prisma db push` (intenta borrar rag_chunks/rag_documents): aplicar este SQL.
-- Reversa: 2026-10-firma-externa.REVERSA.sql
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── Tipos ───────────────────────────────────────────────────────────────────
CREATE TYPE "SignatureDocumentType"  AS ENUM ('ENGAGEMENT_LETTER', 'EXTERNAL_CONFIRMATION', 'INTERVIEW_RECORD');
CREATE TYPE "SignatureRequestStatus" AS ENUM ('PENDING', 'VIEWED', 'SIGNED', 'DECLINED', 'REVOKED', 'EXPIRED');
CREATE TYPE "SignatureSealStatus"    AS ENUM ('NOT_APPLICABLE', 'PENDING', 'SEALED', 'FAILED');
CREATE TYPE "SignatureEventType"     AS ENUM (
  'CREATED', 'SENT', 'RESENT', 'REMINDER_SENT', 'OTP_SENT', 'OTP_FAILED', 'OTP_LOCKED', 'SESSION_STARTED',
  'VIEWED', 'ATTACHMENT_ACCEPTED', 'ATTACHMENT_REJECTED', 'SIGNED', 'DECLINED', 'REVOKED', 'EXPIRED',
  'SEALED', 'SEAL_FAILED', 'TARGET_UPDATED', 'INTEGRITY_FAILED'
);
CREATE TYPE "SignatureAttachmentScan" AS ENUM ('CLEAN', 'INFECTED', 'ERROR');

-- ── Sello de evidencia por organización ─────────────────────────────────────
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "sealCertPem"      TEXT;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "sealKeyEncrypted" TEXT;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "sealCreatedAt"    TIMESTAMP(3);

-- ── Solicitudes de firma ────────────────────────────────────────────────────
CREATE TABLE "signature_requests" (
  "id"               TEXT NOT NULL,
  "organizationId"   TEXT NOT NULL,
  "auditId"          TEXT,
  "documentType"     "SignatureDocumentType" NOT NULL,
  "targetId"         TEXT NOT NULL,
  "title"            TEXT NOT NULL,
  "signerName"       TEXT NOT NULL,
  "signerEmail"      TEXT NOT NULL,
  "signerRole"       TEXT,
  "payload"          JSONB NOT NULL DEFAULT '{}',
  "tokenHash"        TEXT NOT NULL,
  "tokenEncrypted"   TEXT NOT NULL,
  "expiresAt"        TIMESTAMP(3) NOT NULL,
  "status"           "SignatureRequestStatus" NOT NULL DEFAULT 'PENDING',
  "lockedUntil"      TIMESTAMP(3),
  "otpHash"          TEXT,
  "otpExpiresAt"     TIMESTAMP(3),
  "otpAttempts"      INTEGER NOT NULL DEFAULT 0,
  "otpFailuresHour"  INTEGER NOT NULL DEFAULT 0,
  "otpWindowStart"   TIMESTAMP(3),
  "otpSentCount"     INTEGER NOT NULL DEFAULT 0,
  "otpLastSentAt"    TIMESTAMP(3),
  "otpVerifiedAt"    TIMESTAMP(3),
  "documentPath"     TEXT NOT NULL,
  "documentSha256"   TEXT NOT NULL,
  "documentPages"    INTEGER,
  "consentVersion"   TEXT,
  "consentText"      TEXT,
  "signedName"       TEXT,
  "signedRole"       TEXT,
  "response"         JSONB,
  "declineReason"    TEXT,
  "signedAt"         TIMESTAMP(3),
  "viewedAt"         TIMESTAMP(3),
  "signerIp"         TEXT,
  "signerUserAgent"  TEXT,
  "verificationCode" TEXT,
  "sealStatus"       "SignatureSealStatus" NOT NULL DEFAULT 'NOT_APPLICABLE',
  "sealAttempts"     INTEGER NOT NULL DEFAULT 0,
  "sealedAt"         TIMESTAMP(3),
  "tsaUrlUsed"       TEXT,
  "signedPdfPath"    TEXT,
  "signedPdfSha256"  TEXT,
  "eventsHeadHash"   TEXT,
  "sentAt"           TIMESTAMP(3),
  "sendCount"        INTEGER NOT NULL DEFAULT 0,
  "reminderEnabled"  BOOLEAN NOT NULL DEFAULT true,
  "reminderSentAt"   TIMESTAMP(3),
  "createdById"      TEXT NOT NULL,
  "revokedAt"        TIMESTAMP(3),
  "revokedById"      TEXT,
  "revokedReason"    TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL,
  CONSTRAINT "signature_requests_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "signature_requests_tokenHash_key"        ON "signature_requests"("tokenHash");
CREATE UNIQUE INDEX "signature_requests_verificationCode_key" ON "signature_requests"("verificationCode");
CREATE INDEX "signature_requests_organizationId_idx"          ON "signature_requests"("organizationId");
CREATE INDEX "signature_requests_documentType_targetId_idx"   ON "signature_requests"("documentType", "targetId");
CREATE INDEX "signature_requests_status_expiresAt_idx"        ON "signature_requests"("status", "expiresAt");
CREATE INDEX "signature_requests_sealStatus_idx"              ON "signature_requests"("sealStatus");
ALTER TABLE "signature_requests" ADD CONSTRAINT "signature_requests_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "signature_requests" ADD CONSTRAINT "signature_requests_auditId_fkey"
  FOREIGN KEY ("auditId") REFERENCES "audits"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "signature_requests" ADD CONSTRAINT "signature_requests_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── Sesiones del firmante (tras verificar el código) ────────────────────────
CREATE TABLE "signature_sessions" (
  "id"        TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "ip"        TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMP(3),
  CONSTRAINT "signature_sessions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "signature_sessions_tokenHash_key" ON "signature_sessions"("tokenHash");
CREATE INDEX "signature_sessions_requestId_idx"        ON "signature_sessions"("requestId");
ALTER TABLE "signature_sessions" ADD CONSTRAINT "signature_sessions_requestId_fkey"
  FOREIGN KEY ("requestId") REFERENCES "signature_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Bitácora encadenada por hash ────────────────────────────────────────────
CREATE TABLE "signature_events" (
  "id"        TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "seq"       INTEGER NOT NULL,
  "type"      "SignatureEventType" NOT NULL,
  "at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ip"        TEXT,
  "userAgent" TEXT,
  "actorId"   TEXT,
  "detail"    JSONB,
  "prevHash"  TEXT NOT NULL,
  "hash"      TEXT NOT NULL,
  CONSTRAINT "signature_events_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "signature_events_requestId_seq_key" ON "signature_events"("requestId", "seq");
ALTER TABLE "signature_events" ADD CONSTRAINT "signature_events_requestId_fkey"
  FOREIGN KEY ("requestId") REFERENCES "signature_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Adjuntos del tercero (solo confirmaciones) ──────────────────────────────
CREATE TABLE "signature_attachments" (
  "id"             TEXT NOT NULL,
  "requestId"      TEXT NOT NULL,
  "originalName"   TEXT NOT NULL,
  "detectedType"   TEXT NOT NULL,
  "sizeBytes"      INTEGER NOT NULL,
  "originalSha256" TEXT NOT NULL,
  "quarantinePath" TEXT NOT NULL,
  "safePath"       TEXT,
  "safeSha256"     TEXT,
  "scanStatus"     "SignatureAttachmentScan" NOT NULL,
  "scanSignature"  TEXT,
  "submitted"      BOOLEAN NOT NULL DEFAULT false,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "signature_attachments_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "signature_attachments_requestId_idx" ON "signature_attachments"("requestId");
ALTER TABLE "signature_attachments" ADD CONSTRAINT "signature_attachments_requestId_fkey"
  FOREIGN KEY ("requestId") REFERENCES "signature_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Seguridad: RLS activo y nada para anon/authenticated (regla de project_security_audit) ──
ALTER TABLE "signature_requests"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "signature_sessions"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "signature_events"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "signature_attachments" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "signature_requests", "signature_sessions", "signature_events", "signature_attachments"
  FROM anon, authenticated;

COMMIT;
