-- ═══════════════════════════════════════════════════════════════════════
-- AuditMind — pgvector Setup para RAG
-- Ejecutar en Supabase SQL Editor (idempotente — se puede re-ejecutar)
-- Gemini gemini-embedding-001 → 3072 dimensiones
-- ═══════════════════════════════════════════════════════════════════════

-- 1. Habilitar la extensión pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Tabla de documentos normativos
CREATE TABLE IF NOT EXISTS knowledge_documents (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  title           TEXT NOT NULL,
  rag_base        TEXT NOT NULL,
  organization_id TEXT,
  source_url      TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_docs_org_rag
  ON knowledge_documents (organization_id, rag_base);

-- 3. Tabla de chunks + embeddings Gemini (3072 dims)
CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  doc_id          TEXT NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
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
    WHERE table_name = 'knowledge_chunks' AND column_name = 'embedding'
  ) THEN
    BEGIN
      ALTER TABLE knowledge_chunks ALTER COLUMN embedding TYPE vector(3072);
    EXCEPTION WHEN others THEN
      -- Ya era vector(3072) o algún otro error no crítico
      NULL;
    END;
  END IF;
END $$;

-- 5. Índice HNSW (mucho más rápido que ivfflat para < 1 M vectores)
CREATE INDEX IF NOT EXISTS idx_chunks_embedding
  ON knowledge_chunks USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS idx_chunks_org_rag
  ON knowledge_chunks (organization_id, rag_base);

-- Full-text search index (español)
CREATE INDEX IF NOT EXISTS idx_chunks_content_fts
  ON knowledge_chunks USING gin (to_tsvector('spanish', content));

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
  FROM knowledge_chunks kc
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
  FROM knowledge_chunks kc
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
--     WHERE table_name = 'knowledge_chunks' AND column_name = 'embedding';
--   -- Debería mostrar udt_name = 'vector' con typmod 3072
-- ═══════════════════════════════════════════════════════════════════════
