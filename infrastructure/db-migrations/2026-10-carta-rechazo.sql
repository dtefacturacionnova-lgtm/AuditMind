-- ════════════════════════════════════════════════════════════════════════════
-- Carta de compromiso: motivo del rechazo del cliente (docs/firma-externa-por-enlace.md §11.1, F2)
-- Cambio ADITIVO: una columna nueva y nula. El código anterior no la conoce y sigue funcionando.
-- NO usar `prisma db push` (intenta borrar rag_chunks/rag_documents): aplicar este SQL.
-- Reversa: 2026-10-carta-rechazo.REVERSA.sql
-- ════════════════════════════════════════════════════════════════════════════
BEGIN;
ALTER TABLE "engagement_letters" ADD COLUMN IF NOT EXISTS "declineReason" TEXT;
COMMIT;
