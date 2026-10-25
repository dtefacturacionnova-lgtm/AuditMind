-- ════════════════════════════════════════════════════════════════════════════
-- Firma por enlace: MAC de las huellas del PDF sellado (docs/firma-externa-por-enlace.md §8 y §10, tras F5b)
-- Cambio ADITIVO: una columna nueva con valor por defecto (lista vacía). El código anterior no la conoce y sigue
-- funcionando; el código nuevo la LEE en cada consulta de solicitudes de firma, así que este SQL va ANTES de desplegar.
--   · "signedPdfMacs"  HMAC-SHA256(clave HKDF de ENCRYPTION_KEY, info "sealed-pdf-mac-v1", "<requestId>|<sha256>") en
--                      hex, uno por cada huella que /verificar acepta (al sellar y, si después se aplica el sello de
--                      tiempo, la final). Sin la clave, quien escriba en la BD no puede fabricar uno válido.
-- Hoy hay 0 solicitudes de firma (verificado 2026-10-19 con una consulta de solo lectura): nada que recalcular.
-- NO usar `prisma db push` (intenta borrar rag_chunks/rag_documents): aplicar este SQL.
-- Reversa: 2026-10-firma-mac-huellas.REVERSA.sql
-- ════════════════════════════════════════════════════════════════════════════
BEGIN;
ALTER TABLE "signature_requests" ADD COLUMN IF NOT EXISTS "signedPdfMacs" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
COMMIT;
