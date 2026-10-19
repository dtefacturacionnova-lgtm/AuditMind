-- PASO 2 de 2 — "contraer": borra el token en claro. Aplicar SOLO cuando el código nuevo ya está desplegado
-- (el código anterior escribe y lee "portalToken"). Con 0 solicitudes PBC no se pierde nada; si hubiera filas,
-- esta columna dejaría de existir con sus tokens viejos (los enlaces viejos ya no sirven de todos modos).
BEGIN;
ALTER TABLE "pbc_requests" DROP COLUMN IF EXISTS "portalToken";
COMMIT;
