-- ═══════════════════════════════════════════════════════════════════════
-- AuditMind — pgvector Setup para RAG
-- Ejecutar en Supabase SQL Editor (idempotente — se puede re-ejecutar)
-- Gemini gemini-embedding-001 → 3072 dimensiones
-- ═══════════════════════════════════════════════════════════════════════

-- 1. Habilitar la extensión pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Tabla de documentos normativos
CREATE TABLE IF NOT EXISTS rag_documents (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  title           TEXT NOT NULL,
  rag_base        TEXT NOT NULL,
  organization_id TEXT,
  source_url      TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_docs_org_rag
  ON rag_documents (organization_id, rag_base);

-- 3. Tabla de chunks + embeddings Gemini (3072 dims)
CREATE TABLE IF NOT EXISTS rag_chunks (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  doc_id          TEXT NOT NULL REFERENCES rag_documents(id) ON DELETE CASCADE,
  organization_id TEXT,
  rag_base        TEXT NOT NULL,
  content         TEXT NOT NULL,
  embedding       vector(3072),
  chunk_index     INTEGER NOT NULL DEFAULT 0,
  section_title   TEXT,
  page_number     INTEGER,
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Si la tabla ya existía con 1536 u otra dimensión, migrar la columna
--    (debe hacerse ANTES de crear el índice; el índice viejo se elimina primero)
DROP INDEX IF EXISTS idx_chunks_embedding;
DROP INDEX IF EXISTS idx_chunks_org_rag;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'rag_chunks' AND column_name = 'embedding'
  ) THEN
    BEGIN
      ALTER TABLE rag_chunks ALTER COLUMN embedding TYPE vector(3072);
    EXCEPTION WHEN others THEN
      -- Ya era vector(3072) o algún otro error no crítico
      NULL;
    END;
  END IF;
END $$;

-- 5. Índice HNSW — OMITIDO A PROPÓSITO: pgvector limita HNSW/ivfflat sobre el
--    tipo `vector` a 2000 dimensiones, pero Gemini gemini-embedding-001 produce
--    3072. Migrar a `halfvec` (soporta hasta 4000 dims en HNSW) es la solución
--    correcta a futuro, pero para el tamaño de esta base de conocimiento (unos
--    pocos miles de chunks — decenas de normas, no millones de documentos) un
--    escaneo secuencial de <=> es instantáneo; no vale el riesgo de migrar el
--    tipo de columna ahora. Revisar si la base crece a >50k chunks.

CREATE INDEX IF NOT EXISTS idx_chunks_org_rag
  ON rag_chunks (organization_id, rag_base);

-- Full-text search index (español)
CREATE INDEX IF NOT EXISTS idx_chunks_content_fts
  ON rag_chunks USING gin (to_tsvector('spanish', content));

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Función de búsqueda vectorial pura
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS match_knowledge(vector(3072), float, int, text, text[]);
DROP FUNCTION IF EXISTS match_knowledge(vector(1536), float, int, uuid, text[]);
DROP FUNCTION IF EXISTS match_knowledge(vector(1536), float, int, text, text[]);

CREATE OR REPLACE FUNCTION match_knowledge(
  query_embedding vector(3072),
  match_threshold FLOAT    DEFAULT 0.75,
  match_count     INT      DEFAULT 8,
  p_org_id        TEXT     DEFAULT NULL,
  p_rag_bases     TEXT[]   DEFAULT NULL
)
RETURNS TABLE (
  id            TEXT,
  doc_id        TEXT,
  content       TEXT,
  rag_base      TEXT,
  section_title TEXT,
  metadata      JSONB,
  similarity    FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    kc.id,
    kc.doc_id,
    kc.content,
    kc.rag_base,
    kc.section_title,
    kc.metadata,
    1 - (kc.embedding <=> query_embedding) AS similarity
  FROM rag_chunks kc
  WHERE
    (p_org_id IS NULL OR kc.organization_id IS NULL OR kc.organization_id = p_org_id)
    AND (p_rag_bases IS NULL OR kc.rag_base = ANY(p_rag_bases))
    AND 1 - (kc.embedding <=> query_embedding) > match_threshold
  ORDER BY kc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Función de búsqueda híbrida (vector 70 % + full-text 30 %)
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS match_knowledge_hybrid(vector(3072), text, float, int, text, text[]);
DROP FUNCTION IF EXISTS match_knowledge_hybrid(vector(1536), text, float, int, uuid, text[]);
DROP FUNCTION IF EXISTS match_knowledge_hybrid(vector(1536), text, float, int, text, text[]);

CREATE OR REPLACE FUNCTION match_knowledge_hybrid(
  query_embedding vector(3072),
  query_text      TEXT,
  match_threshold FLOAT    DEFAULT 0.70,
  match_count     INT      DEFAULT 10,
  p_org_id        TEXT     DEFAULT NULL,
  p_rag_bases     TEXT[]   DEFAULT NULL
)
RETURNS TABLE (
  id            TEXT,
  doc_id        TEXT,
  content       TEXT,
  rag_base      TEXT,
  section_title TEXT,
  metadata      JSONB,
  similarity    FLOAT,
  text_rank     FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    kc.id,
    kc.doc_id,
    kc.content,
    kc.rag_base,
    kc.section_title,
    kc.metadata,
    (1 - (kc.embedding <=> query_embedding))::FLOAT AS similarity,
    ts_rank(
      to_tsvector('spanish', kc.content),
      plainto_tsquery('spanish', query_text)
    )::FLOAT AS text_rank
  FROM rag_chunks kc
  WHERE
    (p_org_id IS NULL OR kc.organization_id IS NULL OR kc.organization_id = p_org_id)
    AND (p_rag_bases IS NULL OR kc.rag_base = ANY(p_rag_bases))
    AND (
      1 - (kc.embedding <=> query_embedding) > match_threshold
      OR to_tsvector('spanish', kc.content) @@ plainto_tsquery('spanish', query_text)
    )
  ORDER BY
    (0.70 * (1 - (kc.embedding <=> query_embedding))) +
    (0.30 * ts_rank(
      to_tsvector('spanish', kc.content),
      plainto_tsquery('spanish', query_text)
    ))
    DESC
  LIMIT match_count;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- Verificar instalación:
--   SELECT * FROM pg_extension WHERE extname = 'vector';
--   SELECT column_name, udt_name FROM information_schema.columns
--     WHERE table_name = 'rag_chunks' AND column_name = 'embedding';
--   -- Debería mostrar udt_name = 'vector' con typmod 3072
-- ═══════════════════════════════════════════════════════════════════════
