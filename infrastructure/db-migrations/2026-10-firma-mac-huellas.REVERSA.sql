-- Reversa de 2026-10-firma-mac-huellas.sql — borra los MAC de las huellas selladas.
-- ORDEN: primero volver a desplegar el código anterior (el nuevo lee la columna en cada consulta y fallaría sin ella);
-- después correr esto. Con el código anterior, /verificar vuelve a publicar las huellas guardadas sin autenticarlas.
BEGIN;
ALTER TABLE "signature_requests" DROP COLUMN IF EXISTS "signedPdfMacs";
COMMIT;
