"""RAG router — Knowledge Base search + ingest using pgvector + Gemini gemini-embedding-001."""
import asyncio
import tempfile
import os
from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Header
from pydantic import BaseModel
from typing import Optional
import asyncpg
from google import genai

from app.config import settings
from app.services.rag_pipeline import ingest_text, ingest_pdf

router = APIRouter()

# Initialize Gemini client once
_gemini_client = genai.Client(api_key=settings.GEMINI_API_KEY)


def _embed_sync(text: str) -> list[float]:
    """Sync call to Gemini embed — runs in thread pool via asyncio.to_thread."""
    result = _gemini_client.models.embed_content(
        model=settings.EMBEDDING_MODEL,
        contents=text,
    )
    return list(result.embeddings[0].values)


async def embed_text(text: str) -> list[float]:
    """Generate embedding asynchronously (Gemini SDK is sync, runs in thread)."""
    return await asyncio.to_thread(_embed_sync, text)


class SearchRequest(BaseModel):
    query: str
    rag_bases: Optional[list[str]] = None
    org_id: Optional[str] = None
    threshold: float = 0.75
    limit: int = 8
    hybrid: bool = True


class SearchResult(BaseModel):
    id: str
    doc_id: str
    content: str
    rag_base: str
    section_title: Optional[str]
    similarity: float
    text_rank: Optional[float] = None


@router.post("/search", response_model=list[SearchResult])
async def search_knowledge(request: SearchRequest):
    embedding_list = await embed_text(request.query)
    # asyncpg no serializa list[float] -> pgvector automaticamente; el cast
    # ::vector espera el literal de texto '[0.1,0.2,...]', no una lista Python.
    query_embedding = '[' + ','.join(str(x) for x in embedding_list) + ']'

    conn = await asyncpg.connect(settings.DATABASE_URL)
    try:
        if request.hybrid:
            rows = await conn.fetch(
                """
                SELECT id, doc_id, content, rag_base, section_title, similarity, text_rank
                FROM match_knowledge_hybrid(
                    $1::vector,
                    $2::text,
                    $3::float,
                    $4::int,
                    $5::text,
                    $6::text[]
                )
                """,
                query_embedding,
                request.query,
                request.threshold,
                request.limit,
                request.org_id,
                request.rag_bases,
            )
        else:
            rows = await conn.fetch(
                """
                SELECT id, doc_id, content, rag_base, section_title, similarity, NULL as text_rank
                FROM match_knowledge(
                    $1::vector,
                    $2::float,
                    $3::int,
                    $4::text,
                    $5::text[]
                )
                """,
                query_embedding,
                request.threshold,
                request.limit,
                request.org_id,
                request.rag_bases,
            )
    finally:
        await conn.close()

    return [
        SearchResult(
            id=str(row["id"]),
            doc_id=str(row["doc_id"]),
            content=row["content"],
            rag_base=row["rag_base"],
            section_title=row["section_title"],
            similarity=float(row["similarity"]),
            text_rank=float(row["text_rank"]) if row.get("text_rank") is not None else None,
        )
        for row in rows
    ]


class IngestTextRequest(BaseModel):
    text: str
    doc_title: str
    rag_base: str
    org_id: Optional[str] = None
    source_url: Optional[str] = None
    chunk_size: int = 800
    overlap: int = 100


@router.post("/ingest/text")
async def ingest_text_endpoint(request: IngestTextRequest):
    """Ingest raw text into the RAG knowledge base (generates Gemini embeddings)."""
    if not request.text.strip():
        raise HTTPException(status_code=400, detail="text cannot be empty")
    if not request.doc_title.strip():
        raise HTTPException(status_code=400, detail="doc_title cannot be empty")

    try:
        result = await ingest_text(
            text=request.text,
            doc_title=request.doc_title,
            rag_base=request.rag_base,
            org_id=request.org_id,
            source_url=request.source_url,
            chunk_size=request.chunk_size,
            overlap=request.overlap,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/ingest/pdf")
async def ingest_pdf_endpoint(
    file: UploadFile = File(...),
    doc_title: str = Form(...),
    rag_base: str = Form(...),
    org_id: Optional[str] = Form(None),
    x_internal_key: Optional[str] = Header(default=None, alias="x-internal-key"),
):
    """
    Upload a PDF file and ingest it into the RAG knowledge base.
    Requires x-internal-key header (NestJS → FastAPI internal call).
    """
    if not x_internal_key or x_internal_key != settings.INTERNAL_API_KEY:
        raise HTTPException(status_code=401, detail="Clave interna inválida")

    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="El archivo debe ser un PDF")

    content = await file.read()
    if len(content) == 0:
        raise HTTPException(status_code=400, detail="El archivo está vacío")
    if len(content) > 50 * 1024 * 1024:  # 50 MB limit
        raise HTTPException(status_code=413, detail="El archivo supera el límite de 50 MB")

    # Write to a temp file so pdfplumber can read it
    suffix = ".pdf"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(content)
        tmp_path = tmp.name

    try:
        result = await ingest_pdf(
            pdf_path=tmp_path,
            doc_title=doc_title.strip(),
            rag_base=rag_base,
            org_id=org_id or None,
        )
        result["filename"] = file.filename
        result["size_kb"] = round(len(content) / 1024, 1)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


@router.get("/documents")
async def list_documents(
    org_id: Optional[str] = None,
    rag_base: Optional[str] = None,
):
    """List all ingested knowledge documents with their chunk counts."""
    conn = await asyncpg.connect(settings.DATABASE_URL)
    try:
        # Build filter conditions
        conditions = []
        params: list = []
        if rag_base:
            conditions.append(f"kd.rag_base = ${len(params) + 1}")
            params.append(rag_base)
        if org_id:
            conditions.append(f"(kd.organization_id IS NULL OR kd.organization_id = ${len(params) + 1})")
            params.append(org_id)
        else:
            conditions.append("kd.organization_id IS NULL")

        where = ("WHERE " + " AND ".join(conditions)) if conditions else ""

        rows = await conn.fetch(f"""
            SELECT
                kd.id,
                kd.title,
                kd.rag_base,
                kd.organization_id,
                kd.source_url,
                kd.created_at,
                COUNT(kc.id)::int AS chunk_count
            FROM rag_documents kd
            LEFT JOIN rag_chunks kc ON kc.doc_id = kd.id
            {where}
            GROUP BY kd.id
            ORDER BY kd.created_at DESC
            LIMIT 100
        """, *params)

        return {
            "documents": [
                {
                    "id": str(row["id"]),
                    "title": row["title"],
                    "rag_base": row["rag_base"],
                    "organization_id": row["organization_id"],
                    "source_url": row["source_url"],
                    "created_at": row["created_at"].isoformat() if row["created_at"] else None,
                    "chunk_count": row["chunk_count"],
                }
                for row in rows
            ],
            "total": len(rows),
        }
    finally:
        await conn.close()


@router.delete("/documents/{doc_id}")
async def delete_document(
    doc_id: str,
    x_internal_key: Optional[str] = Header(default=None, alias="x-internal-key"),
):
    """Delete a knowledge document and all its chunks."""
    if not x_internal_key or x_internal_key != settings.INTERNAL_API_KEY:
        raise HTTPException(status_code=401, detail="Clave interna inválida")

    conn = await asyncpg.connect(settings.DATABASE_URL)
    try:
        result = await conn.execute(
            "DELETE FROM rag_documents WHERE id = $1", doc_id
        )
        if result == "DELETE 0":
            raise HTTPException(status_code=404, detail="Documento no encontrado")
        return {"status": "deleted", "doc_id": doc_id}
    finally:
        await conn.close()


@router.get("/bases")
async def list_rag_bases():
    return {
        "bases": [
            {"id": "IIA_2025",         "name": "IIA IPPF 2025",               "description": "Marco de Referencia Internacional IIA"},
            {"id": "AUDIT_TI",         "name": "Auditoría de TI",             "description": "COBIT, NIST, ISO 27001, GTAGs"},
            {"id": "CONTINUITY",       "name": "Continuidad de Negocio",      "description": "ISO 22301, BCP/DRP"},
            {"id": "COMPLIANCE",       "name": "Compliance y Regulatorio",    "description": "Normativa local e internacional"},
            {"id": "ANTI_FRAUD",       "name": "Prevención de Fraude",        "description": "ACFE, FATF, AML/CFT"},
            {"id": "AI_GOVERNANCE",    "name": "Gobierno de IA",              "description": "Ética y gobernanza de IA"},
            {"id": "CLIENT_NORMATIVE", "name": "Normativa del Cliente",       "description": "Políticas y procedimientos internos"},
            {"id": "FINANCIAL",        "name": "Estándares Financieros",      "description": "NIAs, NIIF, PCAOB"},
            {"id": "SECTOR_SPECIFIC",  "name": "Normativa Sectorial",         "description": "Regulaciones por industria"},
            {"id": "FISCAL_SV",        "name": "Tributario El Salvador",      "description": "NACOT, Código Tributario, Ley ISR, Ley IVA, Código de Comercio"},
        ]
    }
