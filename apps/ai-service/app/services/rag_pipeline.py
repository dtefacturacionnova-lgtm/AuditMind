"""RAG Pipeline — ingestión de documentos → chunks → embeddings (cascada de proveedores) → pgvector.

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

Versionado y estado (2026-08-24): cada ingesta calcula un hash SHA-256 del
texto completo. Si ya existe un documento con el mismo título+base y el mismo
hash, se omite la reingesta (ahorra cuota de embeddings). Si el contenido
cambió, se crea una nueva revisión y la anterior queda marcada
`superseded_by`/`is_active=false` (no se borra, sigue disponible para
trazabilidad histórica, pero deja de usarse en búsquedas).

La generación de embeddings (la parte lenta y la única que depende de APIs
externas) puede correr en segundo plano vía FastAPI `BackgroundTasks` — ver
`run_ingestion()`. `ingest_text`/`ingest_pdf` registran el documento de forma
rápida y síncrona y devuelven de inmediato con status='pendiente' cuando se
les pasa `background_tasks`; sin ese argumento (uso directo desde scripts)
procesan de forma síncrona como antes.
"""
import asyncio
import hashlib
import re
import uuid
from pathlib import Path
from typing import Optional

import asyncpg
import pdfplumber

from app.config import settings
from app.services.embedding_router import (
    EmbeddingProvider,
    embed_batch_with_fallback,
    embed_query_with_provider,
)


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


def _content_hash(text: str) -> str:
    """SHA-256 del texto completo — usado para versionado y para evitar
    reingestas (y gasto de cuota de embeddings) cuando el contenido no cambió."""
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


# ─── pgvector helpers ──────────────────────────────────────────────────────────

async def _ensure_pgvector_tables(conn: asyncpg.Connection) -> None:
    """Create knowledge tables if they don't exist (idempotent — safe to call repeatedly)."""
    await conn.execute(f"""
        CREATE EXTENSION IF NOT EXISTS vector;

        CREATE TABLE IF NOT EXISTS rag_documents (
            id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            title           TEXT NOT NULL,
            rag_base        TEXT NOT NULL,
            organization_id TEXT,
            source_url      TEXT,
            created_at      TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS rag_chunks (
            id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            doc_id          TEXT NOT NULL REFERENCES rag_documents(id) ON DELETE CASCADE,
            content         TEXT NOT NULL,
            rag_base        TEXT NOT NULL,
            section_title   TEXT,
            organization_id TEXT,
            embedding       vector({settings.EMBEDDING_DIMENSIONS}),
            chunk_index     INTEGER NOT NULL DEFAULT 0,
            metadata        JSONB DEFAULT '{{}}',
            created_at      TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS rag_chunks_rag_base_idx
            ON rag_chunks(rag_base);

        CREATE INDEX IF NOT EXISTS rag_chunks_org_idx
            ON rag_chunks(organization_id);

        -- Cascada de proveedores de embeddings (2026-08-24) — columna de respaldo
        -- para Voyage/Jina/Cohere (1024 dims, no se puede mezclar con la de Gemini
        -- de 3072 dims en la misma columna de pgvector) + qué proveedor se usó.
        ALTER TABLE rag_chunks ADD COLUMN IF NOT EXISTS
            embedding_fallback vector({settings.EMBEDDING_FALLBACK_DIMENSIONS});
        ALTER TABLE rag_chunks ADD COLUMN IF NOT EXISTS
            embedding_provider TEXT NOT NULL DEFAULT 'gemini';

        -- Versionado + estado de ingesta (2026-08-24).
        ALTER TABLE rag_documents ADD COLUMN IF NOT EXISTS content_hash TEXT;
        ALTER TABLE rag_documents ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 1;
        ALTER TABLE rag_documents ADD COLUMN IF NOT EXISTS superseded_by TEXT REFERENCES rag_documents(id);
        ALTER TABLE rag_documents ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
        ALTER TABLE rag_documents ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'listo';
        ALTER TABLE rag_documents ADD COLUMN IF NOT EXISTS error_message TEXT;

        -- Subclasificación libre dentro de una base (ej. "IVA"/"Renta" dentro de
        -- Tributario El Salvador) — texto libre, no un enum: el valor lo define
        -- quien ingiere el documento y el frontend arma las opciones del filtro
        -- a partir de los valores ya en uso, no de una lista fija en el código.
        ALTER TABLE rag_documents ADD COLUMN IF NOT EXISTS subcategory TEXT;
    """)
    # No se crea indice HNSW/ivfflat sobre embedding: pgvector los limita a 2000
    # dimensiones y gemini-embedding-001 produce 3072. Ver nota en
    # infrastructure/scripts/pgvector_setup.sql — un scan secuencial de <=> es
    # instantaneo al tamano actual de esta base de conocimiento. embedding_fallback
    # (1024 dims) sí calificaría para un índice HNSW si el volumen lo justifica
    # en el futuro — no es necesario todavía.


async def _insert_chunks(
    conn: asyncpg.Connection,
    doc_id: str,
    rag_base: str,
    org_id: Optional[str],
    chunks: list[str],
    embeddings: list[list[float]],
    provider: EmbeddingProvider,
    section_titles: Optional[list[str]] = None,
) -> int:
    """Bulk insert chunks with embeddings, en la columna que corresponda al proveedor."""
    # Delete existing chunks for this doc (reintentos de la misma revisión)
    await conn.execute("DELETE FROM rag_chunks WHERE doc_id = $1", doc_id)

    is_gemini = provider == EmbeddingProvider.GEMINI
    rows = []
    for i, (chunk, emb) in enumerate(zip(chunks, embeddings)):
        section = section_titles[i] if section_titles and i < len(section_titles) else None
        # asyncpg no serializa list[float] -> pgvector automaticamente; el cast
        # ::vector espera el literal de texto '[0.1,0.2,...]', no una lista Python.
        emb_literal = '[' + ','.join(str(x) for x in emb) + ']'
        rows.append((
            str(uuid.uuid4()),
            doc_id,
            chunk,
            rag_base,
            section,
            org_id,
            i,       # chunk_index
            emb_literal if is_gemini else None,
            emb_literal if not is_gemini else None,
            provider.value,
        ))

    await conn.executemany("""
        INSERT INTO rag_chunks
            (id, doc_id, content, rag_base, section_title, organization_id, chunk_index,
             embedding, embedding_fallback, embedding_provider)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::vector, $9::vector, $10)
    """, rows)

    return len(rows)


async def _similarity_search(
    conn: asyncpg.Connection,
    vec_str: str,
    column: str,
    threshold: float,
    top_k: int,
    rag_base: Optional[str] | list[str] | None,
    organization_id: Optional[str],
    extra_provider: Optional[str] = None,
) -> list[dict]:
    """Busqueda de similitud coseno contra UNA columna de embedding (`embedding`
    o `embedding_fallback`) — usado por search_knowledge para combinar resultados
    de distintos proveedores sin mezclar sus vectores en la misma comparación."""
    conditions = [
        f"1 - (kc.{column} <=> $1::vector) >= $2",
        f"kc.{column} IS NOT NULL",
        "kd.is_active = true",
    ]
    params: list = [vec_str, threshold]
    idx = 3

    if isinstance(rag_base, list) and rag_base:
        conditions.append(f"kc.rag_base = ANY(${idx}::text[])")
        params.append(rag_base)
        idx += 1
    elif isinstance(rag_base, str) and rag_base:
        conditions.append(f"kc.rag_base = ${idx}")
        params.append(rag_base)
        idx += 1

    if organization_id:
        conditions.append(f"(kc.organization_id IS NULL OR kc.organization_id = ${idx})")
        params.append(organization_id)
        idx += 1
    else:
        conditions.append("kc.organization_id IS NULL")

    if extra_provider:
        conditions.append(f"kc.embedding_provider = ${idx}")
        params.append(extra_provider)
        idx += 1

    where_clause = " AND ".join(conditions)
    sql = f"""
        SELECT
            kc.content,
            kc.section_title,
            kc.rag_base,
            kd.title AS doc_title,
            1 - (kc.{column} <=> $1::vector) AS similarity
        FROM rag_chunks kc
        JOIN rag_documents kd ON kd.id = kc.doc_id
        WHERE {where_clause}
        ORDER BY kc.{column} <=> $1::vector
        LIMIT {top_k}
    """
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


# ─── Ingesta pesada (embeddings) — pensada para BackgroundTasks ───────────────

async def run_ingestion(
    doc_id: str,
    text: str,
    rag_base: str,
    org_id: Optional[str],
    chunk_size: int = 800,
    overlap: int = 100,
) -> None:
    """Fragmenta, genera embeddings (cascada de proveedores) e inserta los
    chunks de un documento ya registrado. Actualiza `status`/`error_message`
    en cada paso para que se pueda consultar el progreso desde afuera
    (GET /rag/documents/:id) mientras corre en segundo plano."""
    conn = await asyncpg.connect(settings.DATABASE_URL)
    try:
        await conn.execute("UPDATE rag_documents SET status = 'procesando' WHERE id = $1", doc_id)

        chunks = _chunk_text(text, chunk_size, overlap)
        if not chunks:
            await conn.execute(
                "UPDATE rag_documents SET status = 'error', error_message = $2 WHERE id = $1",
                doc_id, "El texto quedó vacío tras la fragmentación.",
            )
            return

        print(f"  → Generando {len(chunks)} embeddings para doc {doc_id}...")
        try:
            # embed_batch_with_fallback hace llamadas HTTP sincronas — correrla
            # en el loop de asyncio directamente congelaria el servicio para
            # otras requests durante toda la ingesta. Se corre en thread aparte.
            embeddings, provider = await asyncio.to_thread(embed_batch_with_fallback, chunks)
        except Exception as e:
            await conn.execute(
                "UPDATE rag_documents SET status = 'error', error_message = $2 WHERE id = $1",
                doc_id, str(e)[:2000],
            )
            print(f"  ❌ Ingesta fallida para doc {doc_id}: {e}")
            return

        count = await _insert_chunks(conn, doc_id, rag_base, org_id, chunks, embeddings, provider)
        await conn.execute("UPDATE rag_documents SET status = 'listo' WHERE id = $1", doc_id)
        print(f"  ✅ Ingesta completa: {count} chunks para doc {doc_id} vía {provider.value}")
    finally:
        await conn.close()


# ─── Public API ───────────────────────────────────────────────────────────────

async def ingest_text(
    text: str,
    doc_title: str,
    rag_base: str,
    org_id: Optional[str] = None,
    source_url: Optional[str] = None,
    subcategory: Optional[str] = None,
    chunk_size: int = 800,
    overlap: int = 100,
    background_tasks=None,
) -> dict:
    """Registra el documento (rápido) y dispara la generación de embeddings.

    Si se pasa `background_tasks` (FastAPI, desde el router), la parte lenta
    corre en segundo plano y esta función retorna de inmediato con
    status='pendiente' — el llamador debe consultar GET /rag/documents/:id
    para saber cuándo terminó. Sin `background_tasks` (uso directo desde
    scripts/Python) procesa todo de forma síncrona y solo retorna al terminar,
    igual que antes de esta cascada.

    Si el hash del texto es idéntico a la última revisión ya ingerida para el
    mismo título+base, no reingesta nada (evita gastar cuota de embeddings en
    contenido sin cambios) y devuelve status='unchanged'.
    """
    if not text.strip():
        return {"doc_id": None, "chunks": 0, "status": "empty"}

    content_hash = _content_hash(text)

    conn = await asyncpg.connect(settings.DATABASE_URL)
    try:
        await _ensure_pgvector_tables(conn)

        existing = await conn.fetchrow("""
            SELECT id, revision, content_hash, status
            FROM rag_documents
            WHERE title = $1 AND rag_base = $2
              AND (organization_id = $3 OR (organization_id IS NULL AND $3 IS NULL))
              AND superseded_by IS NULL
            ORDER BY created_at DESC LIMIT 1
        """, doc_title, rag_base, org_id)

        if existing and existing["content_hash"] == content_hash and existing["status"] == "listo":
            print(f"  ↩️  '{doc_title}' sin cambios (hash idéntico a la revisión {existing['revision']}) — se omite.")
            return {
                "doc_id": existing["id"], "chunks": 0, "status": "unchanged",
                "revision": existing["revision"],
            }

        doc_id = str(uuid.uuid4())
        new_revision = (existing["revision"] + 1) if existing else 1

        await conn.execute("""
            INSERT INTO rag_documents
                (id, title, rag_base, organization_id, source_url, content_hash, revision, status, subcategory)
            VALUES ($1, $2, $3, $4, $5, $6, $7, 'pendiente', $8)
        """, doc_id, doc_title, rag_base, org_id, source_url, content_hash, new_revision, subcategory)

        if existing:
            # Nueva revisión reemplaza a la anterior — la anterior no se borra
            # (queda para trazabilidad/reproducibilidad) pero deja de usarse
            # en búsquedas activas.
            await conn.execute("""
                UPDATE rag_documents SET superseded_by = $1, is_active = false WHERE id = $2
            """, doc_id, existing["id"])
    finally:
        await conn.close()

    if background_tasks is not None:
        background_tasks.add_task(run_ingestion, doc_id, text, rag_base, org_id, chunk_size, overlap)
        return {"doc_id": doc_id, "chunks": 0, "status": "pendiente", "revision": new_revision}

    # Sin BackgroundTasks: procesar inline y esperar (uso directo/scripts).
    await run_ingestion(doc_id, text, rag_base, org_id, chunk_size, overlap)
    conn = await asyncpg.connect(settings.DATABASE_URL)
    try:
        count = await conn.fetchval("SELECT COUNT(*) FROM rag_chunks WHERE doc_id = $1", doc_id)
        status = await conn.fetchval("SELECT status FROM rag_documents WHERE id = $1", doc_id)
    finally:
        await conn.close()
    return {"doc_id": doc_id, "chunks": count, "status": status, "revision": new_revision}


async def ingest_pdf(
    pdf_path: str | Path,
    doc_title: str,
    rag_base: str,
    org_id: Optional[str] = None,
    subcategory: Optional[str] = None,
    chunk_size: int = 800,
    overlap: int = 100,
    background_tasks=None,
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
        subcategory=subcategory,
        chunk_size=chunk_size,
        overlap=overlap,
        background_tasks=background_tasks,
    )


# ─── Search (RAG retrieval) ───────────────────────────────────────────────────

async def search_knowledge(
    query: str,
    organization_id: Optional[str] = None,
    rag_base: Optional[str] | list[str] | None = None,
    top_k: int = 5,
    threshold: float = 0.65,
) -> list[dict]:
    """
    Busca los chunks más relevantes para una consulta usando similitud coseno.

    Busca primero en la columna de Gemini (`embedding`, el caso normal). Si
    dentro del alcance de la búsqueda hay chunks ingeridos por un proveedor de
    respaldo (`embedding_fallback` — solo ocurre si Gemini se agotó alguna vez),
    también genera el embedding de la consulta con ESE MISMO proveedor y busca
    ahí, combinando y reordenando ambos conjuntos de resultados. En el caso
    común (todo ingerido con Gemini) esto es un no-op sin costo extra.

    Returns:
        Lista de dicts con: content, section_title, rag_base, similarity, doc_title
    """
    if not query.strip():
        return []

    conn = await asyncpg.connect(settings.DATABASE_URL)
    try:
        all_results: list[dict] = []

        try:
            query_embedding = await asyncio.to_thread(
                embed_query_with_provider, query, EmbeddingProvider.GEMINI
            )
            vec_str = "[" + ",".join(str(x) for x in query_embedding) + "]"
            all_results += await _similarity_search(
                conn, vec_str, "embedding", threshold, top_k, rag_base, organization_id
            )
        except Exception as e:
            print(f"[RAG] Error generando embedding Gemini de la consulta: {e}")

        rag_base_list = rag_base if isinstance(rag_base, list) else ([rag_base] if rag_base else None)
        fallback_rows = await conn.fetch("""
            SELECT DISTINCT kc.embedding_provider
            FROM rag_chunks kc
            JOIN rag_documents kd ON kd.id = kc.doc_id
            WHERE kc.embedding_fallback IS NOT NULL AND kd.is_active = true
              AND ($1::text[] IS NULL OR kc.rag_base = ANY($1::text[]))
        """, rag_base_list)

        for row in fallback_rows:
            provider = EmbeddingProvider(row["embedding_provider"])
            try:
                query_embedding = await asyncio.to_thread(
                    embed_query_with_provider, query, provider
                )
                vec_str = "[" + ",".join(str(x) for x in query_embedding) + "]"
                all_results += await _similarity_search(
                    conn, vec_str, "embedding_fallback", threshold, top_k,
                    rag_base, organization_id, extra_provider=provider.value,
                )
            except Exception as e:
                print(f"[RAG] Error en búsqueda de respaldo ({provider.value}): {e}")

        all_results.sort(key=lambda r: r["similarity"], reverse=True)
        return all_results[:top_k]
    except Exception as e:
        print(f"[RAG] Search error: {e}")
        return []
    finally:
        await conn.close()


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
