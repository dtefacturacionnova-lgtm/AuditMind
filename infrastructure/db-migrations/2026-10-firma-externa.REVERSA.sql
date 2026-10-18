-- Reversa de 2026-10-firma-externa.sql — BORRA todas las solicitudes de firma y su evidencia.
-- Usar solo antes de que exista alguna firma real, o con un respaldo de las 4 tablas.
BEGIN;
DROP TABLE IF EXISTS "signature_attachments";
DROP TABLE IF EXISTS "signature_events";
DROP TABLE IF EXISTS "signature_sessions";
DROP TABLE IF EXISTS "signature_requests";
DROP TYPE  IF EXISTS "SignatureAttachmentScan";
DROP TYPE  IF EXISTS "SignatureEventType";
DROP TYPE  IF EXISTS "SignatureSealStatus";
DROP TYPE  IF EXISTS "SignatureRequestStatus";
DROP TYPE  IF EXISTS "SignatureDocumentType";
ALTER TABLE "organizations" DROP COLUMN IF EXISTS "sealCreatedAt";
ALTER TABLE "organizations" DROP COLUMN IF EXISTS "sealKeyEncrypted";
ALTER TABLE "organizations" DROP COLUMN IF EXISTS "sealCertPem";
COMMIT;
