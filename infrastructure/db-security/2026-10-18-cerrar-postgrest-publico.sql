-- ═══════════════════════════════════════════════════════════════════════════
-- Cierre del acceso directo a la base vía PostgREST (Supabase) — aplicado 2026-10-18
-- ═══════════════════════════════════════════════════════════════════════════
-- Hallazgo (auditoría de aislamiento 2026-10-18): la clave `anon` de Supabase es
-- pública por diseño (viaja en el bundle del navegador). Con RLS apagado y los
-- grants por defecto de Supabase, CUALQUIERA sin sesión podía leer, insertar,
-- modificar y borrar en 64 de las 93 tablas de `public` (papeles de trabajo,
-- clientes, encargos, horas, evidencias, plantillas, RAG, listas de sanciones…),
-- y toda tabla nueva creada por Prisma nacía igual de expuesta.
--
-- Por qué no rompe la app: la API (Prisma) y el ai-service (asyncpg) conectan
-- como `postgres` (dueño de las tablas, BYPASSRLS); el navegador solo usa
-- Supabase Auth (verificado: ningún supabase.from/rpc/storage en apps/web);
-- los scripts de mantenimiento usan `service_role`, que no se toca.
--
-- Reversa exacta: 2026-10-18-cerrar-postgrest-publico.REVERSA.sql
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;

-- 1) RLS en toda tabla de public que no lo tenga (sin políticas = nadie entra por PostgREST
--    salvo service_role; `postgres` lo salta).
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r','p') AND NOT c.relrowsecurity
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.relname);
  END LOOP;
END $$;

-- 2) Los roles públicos de Supabase pierden todo permiso sobre tablas y secuencias existentes.
REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;

-- 3) Las tablas FUTURAS (migraciones de Prisma, que corren como postgres) nacen cerradas.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES    FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;

COMMIT;
