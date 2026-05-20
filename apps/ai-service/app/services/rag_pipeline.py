"""RAG Pipeline — ingestión de documentos → chunks → embeddings Gemini → pgvector.

Uso:
    from app.services.rag_pipeline import ingest_pdf, ingest_text, search_knowledge

    await ingest_pdf(
        pdf_path="path/to/nia_320.pdf",
        rag_base="FINANCIAL",
        doc_title="NIA 320 — Materialidad",
        org_id=None,            # None = global knowledge base
        chunk_size=800,
        overlap=100,
    )

    # Buscar chunks relevantes:
    results = await search_knowledge(
        query="¿Qué es la materialidad de ejecución?",
        organization_id="org_xxx",
        top_k=5,
    )
"""
import asyncio
import re
import uuid
from pathlib import Path
from typing import Optional

import asyncpg
import pdfplumber
from google import genai as google_genai

from app.config import settings

_gemini_client = google_genai.Client(api_key=settings.GEMINI_API_KEY)


# ─── Text chunking ────────────────────────────────────────────────────────────

def _chunk_text(
    text: str,
    chunk_size: int = 800,
    overlap: int = 100,
) -> list[str]:
    """Split text into overlapping chunks at sentence boundaries."""
    # Normalize whitespace
    text = re.sub(r"\s+", " ", text).strip()
    if not text:
        return []

    # Try to split by paragraphs first
    paragraphs = [p.strip() for p in re.split(r"\n{2,}", text) if p.strip()]
    if not paragraphs:
        paragraphs = [text]

    chunks: list[str] = []
    current = ""

    for para in paragraphs:
        if len(current) + len(para) < chunk_size:
            current = (current + " " + para).strip()
        else:
            if current:
                chunks.append(current)
            # If a single paragraph is too long, split by sentences
            if len(para) > chunk_size:
                sentences = re.split(r"(?<=[.!?])\s+", para)
                sentence_buffer = ""
                for sent in sentences:
                    if len(sentence_buffer) + len(sent) < chunk_size:
                        sentence_buffer = (sentence_buffer + " " + sent).strip()
                    else:
                        if sentence_buffer:
                            chunks.append(sentence_buffer)
                        sentence_buffer = sent
                if sentence_buffer:
                    current = sentence_buffer
                else:
                    current = ""
            else:
                current = para

    if current:
        chunks.append(current)

    # Add overlap: prepend last overlap chars from previous chunk
    overlapped: list[str] = []
    for i, chunk in enumerate(chunks):
        if i > 0 and overlap > 0:
            prev_tail = chunks[i - 1][-overlap:]
            chunk = prev_tail + " " + chunk
        overlapped.append(chunk.strip())

    return overlapped


# ─── Embedding ────────────────────────────────────────────────────────────────

def _embed_batch(texts: list[str]) -> list[list[float]]:
    """Generate Gemini embeddings for a batch of texts (sync, for ingestion)."""
    embeddings: list[list[float]] = []
    for text in texts:
        result = _gemini_client.models.embed_content(
            model=settings.EMBEDDING_MODEL,
            contents=text,
        )
        embeddings.append(list(result.embeddings[0].values))
    return embeddings


# ─── pgvector helpers ──────────────────────────────────────────────────────────

async def _ensure_pgvector_tables(conn: asyncpg.Connection) -> None:
    """Create knowledge tables if they don't exist (idempotent — safe to call repeatedly)."""
    await conn.execute("""
        CREATE EXTENSION IF NOT EXISTS vector;

        CREATE TABLE IF NOT EXISTS knowledge_documents (
            id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            title           TEXT NOT NULL,
            rag_base        TEXT NOT NULL,
            organization_id TEXT,
            source_url      TEXT,
            created_at      TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS knowledge_chunks (
            id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            doc_id          TEXT NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
            content         TEXT NOT NULL,
            rag_base        TEXT NOT NULL,
            section_title   TEXT,
            organization_id TEXT,
            embedding       vector(3072),
            chunk_index     INTEGER NOT NULL DEFAULT 0,
            metadata        JSONB DEFAULT '{}',
            created_at      TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS knowledge_chunks_rag_base_idx
            ON knowledge_chunks(rag_base);

        CREATE INDEX IF NOT EXISTS knowledge_chunks_org_idx
            ON knowledge_chunks(organization_id);
    """)
    # HNSW index requires a separate non-transactional CREATE INDEX
    # (ivfflat needs data first; HNSW works on empty tables)
    try:
        await conn.execute("""
            CREATE INDEX IF NOT EXISTS knowledge_chunks_embedding_idx
                ON knowledge_chunks
                USING hnsw (embedding vector_cosine_ops)
                WITH (m = 16, ef_construction = 64);
        """)
    except Exception:
        pass  # Index may already exist; non-fatal


async def _upsert_document(
    conn: asyncpg.Connection,
    title: str,
    rag_base: str,
    org_id: Optional[str],
    source_url: Optional[str],
) -> str:
    """Insert or update a knowledge document and return its ID."""
    doc_id = str(uuid.uuid4())
    await conn.execute("""
        INSERT INTO knowledge_documents (id, title, rag_base, organization_id, source_url)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT DO NOTHING
    """, doc_id, title, rag_base, org_id, source_url)

    # If title already exists for this rag_base + org_id, return existing id
    existing = await conn.fetchval("""
        SELECT id FROM knowledge_documents
        WHERE title = $1 AND rag_base = $2
          AND (organization_id = $3 OR (organization_id IS NULL AND $3 IS NULL))
        ORDER BY created_at DESC LIMIT 1
    """, title, rag_base, org_id)

    return str(existing) if existing else doc_id


async def _insert_chunks(
    conn: asyncpg.Connection,
    doc_id: str,
    rag_base: str,
    org_id: Optional[str],
    chunks: list[str],
    embeddings: list[list[float]],
    section_titles: Optional[list[str]] = None,
) -> int:
    """Bulk insert chunks with embeddings."""
    # Delete existing chunks for this doc
    await conn.execute("DELETE FROM knowledge_chunks WHERE doc_id = $1", doc_id)

    rows = []
    for i, (chunk, emb) in enumerate(zip(chunks, embeddings)):
        section = section_titles[i] if section_titles and i < len(section_titles) else None
        rows.append((
            str(uuid.uuid4()),
            doc_id,
            chunk,
            rag_base,
            section,
            org_id,
            i,       # chunk_index
            emb,
        ))

    await conn.executemany("""
        INSERT INTO knowledge_chunks
            (id, doc_id, content, rag_base, section_title, organization_id, chunk_index, embedding)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::vector)
    """, rows)

    return len(rows)


# ─── Public API ───────────────────────────────────────────────────────────────

async def ingest_text(
    text: str,
    doc_title: str,
    rag_base: str,
    org_id: Optional[str] = None,
    source_url: Optional[str] = None,
    chunk_size: int = 800,
    overlap: int = 100,
) -> dict:
    """Ingest raw text into the knowledge base."""
    chunks = _chunk_text(text, chunk_size, overlap)
    if not chunks:
        return {"doc_id": None, "chunks": 0, "status": "empty"}

    print(f"  → Generating {len(chunks)} embeddings for '{doc_title}'...")
    embeddings = _embed_batch(chunks)

    conn = await asyncpg.connect(settings.DATABASE_URL)
    try:
        await _ensure_pgvector_tables(conn)
        doc_id = await _upsert_document(conn, doc_title, rag_base, org_id, source_url)
        count = await _insert_chunks(conn, doc_id, rag_base, org_id, chunks, embeddings)
    finally:
        await conn.close()

    print(f"  ✅ Ingested {count} chunks for '{doc_title}' → {rag_base}")
    return {"doc_id": doc_id, "chunks": count, "status": "ok"}


async def ingest_pdf(
    pdf_path: str | Path,
    doc_title: str,
    rag_base: str,
    org_id: Optional[str] = None,
    chunk_size: int = 800,
    overlap: int = 100,
) -> dict:
    """Extract text from a PDF and ingest into the knowledge base."""
    path = Path(pdf_path)
    if not path.exists():
        raise FileNotFoundError(f"PDF no encontrado: {pdf_path}")

    pages_text: list[str] = []
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            t = page.extract_text()
            if t:
                pages_text.append(t)

    full_text = "\n\n".join(pages_text)
    if not full_text.strip():
        return {"doc_id": None, "chunks": 0, "status": "empty_pdf"}

    print(f"📄 PDF '{path.name}' — {len(pages_text)} páginas, {len(full_text)} chars")
    return await ingest_text(
        text=full_text,
        doc_title=doc_title,
        rag_base=rag_base,
        org_id=org_id,
        source_url=str(path),
        chunk_size=chunk_size,
        overlap=overlap,
    )


# ─── Search (RAG retrieval) ───────────────────────────────────────────────────

async def search_knowledge(
    query: str,
    organization_id: Optional[str] = None,
    rag_base: Optional[str] = None,
    top_k: int = 5,
    threshold: float = 0.65,
) -> list[dict]:
    """
    Busca los chunks más relevantes para una consulta usando similitud coseno.

    Returns:
        Lista de dicts con: content, section_title, rag_base, similarity, doc_title
    """
    if not query.strip():
        return []

    # Generate embedding for the query (sync Gemini API via thread executor)
    try:
        result = await asyncio.to_thread(
            lambda: _gemini_client.models.embed_content(
                model=settings.EMBEDDING_MODEL,
                contents=query,
            )
        )
        query_embedding = list(result.embeddings[0].values)
    except Exception as e:
        print(f"[RAG] Error generating query embedding: {e}")
        return []

    # Build the embedding vector string for pgvector
    vec_str = "[" + ",".join(str(x) for x in query_embedding) + "]"

    # Build SQL with optional filters
    conditions = ["1 - (kc.embedding <=> $1::vector) >= $2"]
    params: list = [vec_str, threshold]
    param_idx = 3

    if rag_base:
        conditions.append(f"kc.rag_base = ${param_idx}")
        params.append(rag_base)
        param_idx += 1

    if organization_id:
        # Include global (org NULL) + org-specific chunks
        conditions.append(f"(kc.organization_id IS NULL OR kc.organization_id = ${param_idx})")
        params.append(organization_id)
        param_idx += 1
    else:
        # Only global chunks
        conditions.append("kc.organization_id IS NULL")

    where_clause = " AND ".join(conditions)
    sql = f"""
        SELECT
            kc.content,
            kc.section_title,
            kc.rag_base,
            kd.title AS doc_title,
            1 - (kc.embedding <=> $1::vector) AS similarity
        FROM knowledge_chunks kc
        LEFT JOIN knowledge_documents kd ON kd.id = kc.doc_id
        WHERE {where_clause}
        ORDER BY kc.embedding <=> $1::vector
        LIMIT {top_k}
    """

    try:
        conn = await asyncpg.connect(settings.DATABASE_URL)
        try:
            rows = await conn.fetch(sql, *params)
            return [
                {
                    "content": row["content"],
                    "section_title": row["section_title"],
                    "rag_base": row["rag_base"],
                    "doc_title": row["doc_title"],
                    "similarity": float(row["similarity"]),
                }
                for row in rows
            ]
        finally:
            await conn.close()
    except Exception as e:
        print(f"[RAG] Search error: {e}")
        return []


def format_rag_context(chunks: list[dict]) -> str:
    """Format RAG search results as context for the LLM system prompt."""
    if not chunks:
        return ""

    lines = [
        "━━━ CONTEXTO NORMATIVO RELEVANTE (base de conocimiento) ━━━",
        "Los siguientes fragmentos de la base de conocimiento son relevantes para esta consulta.",
        "Úsalos como referencia autorizada cuando corresponda:\n",
    ]

    for i, chunk in enumerate(chunks, 1):
        source = chunk.get("doc_title") or chunk.get("rag_base", "")
        section = chunk.get("section_title", "")
        sim = chunk.get("similarity", 0)
        sim_pct = int(sim * 100)

        header_parts = [f"[{i}]"]
        if source:
            header_parts.append(source)
        if section:
            header_parts.append(f"§ {section}")
        header_parts.append(f"({sim_pct}% relevante)")

        lines.append(" ".join(header_parts))
        lines.append(chunk["content"])
        lines.append("")

    lines.append("━━━ FIN DEL CONTEXTO NORMATIVO ━━━")
    return "\n".join(lines)
