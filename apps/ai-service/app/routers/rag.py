"""RAG router — Knowledge Base search + ingest (cascada de proveedores) + pgvector."""
import asyncio
import io
import re
import tempfile
import os
from fastapi import APIRouter, BackgroundTasks, HTTPException, UploadFile, File, Form, Header
from pydantic import BaseModel
from typing import Optional
import asyncpg
import httpx
import pdfplumber

from app.config import settings
from app.services.rag_pipeline import ingest_text, ingest_pdf, search_knowledge

router = APIRouter()


class SearchRequest(BaseModel):
    query: str
    rag_bases: Optional[list[str]] = None
    org_id: Optional[str] = None
    threshold: float = 0.65
    limit: int = 8
    hybrid: bool = True  # aceptado por compatibilidad; la búsqueda ya no distingue full-text, solo vectorial


class SearchResult(BaseModel):
    content: str
    rag_base: str
    section_title: Optional[str] = None
    doc_title: Optional[str] = None
    similarity: float


@router.post("/search", response_model=list[SearchResult])
async def search_knowledge_endpoint(request: SearchRequest):
    """Búsqueda semántica — internamente usa search_knowledge() de rag_pipeline,
    que ya maneja la cascada de proveedores (Gemini + respaldo) de forma
    transparente. Mismo motor que usan los agentes IA vía /agents/chat."""
    rows = await search_knowledge(
        query=request.query,
        organization_id=request.org_id,
        rag_base=request.rag_bases,
        top_k=request.limit,
        threshold=request.threshold,
    )
    return [SearchResult(**row) for row in rows]


class IngestTextRequest(BaseModel):
    text: str
    doc_title: str
    rag_base: str
    org_id: Optional[str] = None
    source_url: Optional[str] = None
    subcategory: Optional[str] = None
    chunk_size: int = 800
    overlap: int = 100


@router.post("/ingest/text")
async def ingest_text_endpoint(request: IngestTextRequest, background_tasks: BackgroundTasks):
    """Registra el texto y dispara la generación de embeddings en segundo plano.
    Responde de inmediato con status='pendiente' (o 'unchanged' si el contenido
    es idéntico a la última revisión) — consultar GET /rag/documents/{doc_id}
    para saber cuándo terminó."""
    if not request.text.strip():
        raise HTTPException(status_code=400, detail="text cannot be empty")
    if not request.doc_title.strip():
        raise HTTPException(status_code=400, detail="doc_title cannot be empty")

    try:
        return await ingest_text(
            text=request.text,
            doc_title=request.doc_title,
            rag_base=request.rag_base,
            org_id=request.org_id,
            source_url=request.source_url,
            subcategory=request.subcategory,
            chunk_size=request.chunk_size,
            overlap=request.overlap,
            background_tasks=background_tasks,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/ingest/pdf")
async def ingest_pdf_endpoint(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    doc_title: str = Form(...),
    rag_base: str = Form(...),
    org_id: Optional[str] = Form(None),
    subcategory: Optional[str] = Form(None),
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
    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
        tmp.write(content)
        tmp_path = tmp.name

    try:
        result = await ingest_pdf(
            pdf_path=tmp_path,
            doc_title=doc_title.strip(),
            rag_base=rag_base,
            org_id=org_id or None,
            subcategory=subcategory or None,
            background_tasks=background_tasks,
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


class IngestUrlRequest(BaseModel):
    url: str
    doc_title: str
    rag_base: str
    org_id: Optional[str] = None
    subcategory: Optional[str] = None


def _strip_html(html: str) -> str:
    """Extracción de texto muy básica para páginas HTML — suficiente para
    normativa publicada como página web, no reemplaza un parser real si hace
    falta preservar estructura."""
    text = re.sub(r"<script[^>]*>.*?</script>", " ", html, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r"<style[^>]*>.*?</style>", " ", text, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"&nbsp;", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


@router.post("/ingest/url")
async def ingest_url_endpoint(
    request: IngestUrlRequest,
    background_tasks: BackgroundTasks,
    x_internal_key: Optional[str] = Header(default=None, alias="x-internal-key"),
):
    """Descarga una URL (PDF o HTML) y la ingiere — alternativa a subir el
    archivo a mano cuando el documento ya está publicado en línea. Sustituto
    más liviano que una integración completa de sincronización con Drive."""
    if not x_internal_key or x_internal_key != settings.INTERNAL_API_KEY:
        raise HTTPException(status_code=401, detail="Clave interna inválida")

    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=60.0) as client:
            resp = await client.get(
                request.url,
                headers={"User-Agent": "Mozilla/5.0 (compatible; AuditMindRAG/1.0)"},
            )
            resp.raise_for_status()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"No se pudo descargar la URL: {e}")

    content_type = resp.headers.get("content-type", "")
    is_pdf = "application/pdf" in content_type or request.url.lower().endswith(".pdf")

    if is_pdf:
        try:
            with pdfplumber.open(io.BytesIO(resp.content)) as pdf:
                pages_text = [p.extract_text() or "" for p in pdf.pages]
            full_text = "\n\n".join(t for t in pages_text if t)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"No se pudo leer el PDF descargado: {e}")
    else:
        full_text = _strip_html(resp.text)

    if not full_text.strip():
        raise HTTPException(status_code=400, detail="No se extrajo texto de la URL (¿PDF escaneado sin OCR?)")

    try:
        return await ingest_text(
            text=full_text,
            doc_title=request.doc_title.strip(),
            rag_base=request.rag_base,
            org_id=request.org_id,
            source_url=request.url,
            subcategory=request.subcategory,
            background_tasks=background_tasks,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/documents")
async def list_documents(
    org_id: Optional[str] = None,
    rag_base: Optional[str] = None,
    include_inactive: bool = False,
):
    """List all ingested knowledge documents with their chunk counts."""
    conn = await asyncpg.connect(settings.DATABASE_URL)
    try:
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
        if not include_inactive:
            conditions.append("kd.is_active = true")

        where = ("WHERE " + " AND ".join(conditions)) if conditions else ""

        rows = await conn.fetch(f"""
            SELECT
                kd.id, kd.title, kd.rag_base, kd.organization_id, kd.source_url, kd.created_at,
                kd.content_hash, kd.revision, kd.superseded_by, kd.is_active, kd.status, kd.error_message,
                kd.subcategory,
                COUNT(kc.id)::int AS chunk_count,
                (ARRAY_AGG(DISTINCT kc.embedding_provider) FILTER (WHERE kc.embedding_provider IS NOT NULL))
                    AS embedding_providers
            FROM rag_documents kd
            LEFT JOIN rag_chunks kc ON kc.doc_id = kd.id
            {where}
            GROUP BY kd.id
            ORDER BY kd.created_at DESC
            LIMIT 200
        """, *params)

        return {
            "documents": [_serialize_document(row) for row in rows],
            "total": len(rows),
        }
    finally:
        await conn.close()


def _serialize_document(row) -> dict:
    return {
        "id": str(row["id"]),
        "title": row["title"],
        "rag_base": row["rag_base"],
        "organization_id": row["organization_id"],
        "source_url": row["source_url"],
        "subcategory": row["subcategory"],
        "created_at": row["created_at"].isoformat() if row["created_at"] else None,
        "chunk_count": row["chunk_count"],
        "content_hash": row["content_hash"],
        "content_hash_short": (row["content_hash"] or "")[:12] or None,
        "revision": row["revision"],
        "superseded_by": row["superseded_by"],
        "is_active": row["is_active"],
        "status": row["status"],
        "error_message": row["error_message"],
        "embedding_providers": list(row["embedding_providers"] or []),
    }


@router.get("/documents/{doc_id}")
async def get_document(doc_id: str):
    """Un solo documento — pensado para polling de status tras una ingesta
    en segundo plano (status: pendiente → procesando → listo/error)."""
    conn = await asyncpg.connect(settings.DATABASE_URL)
    try:
        row = await conn.fetchrow("""
            SELECT
                kd.id, kd.title, kd.rag_base, kd.organization_id, kd.source_url, kd.created_at,
                kd.content_hash, kd.revision, kd.superseded_by, kd.is_active, kd.status, kd.error_message,
                kd.subcategory,
                COUNT(kc.id)::int AS chunk_count,
                (ARRAY_AGG(DISTINCT kc.embedding_provider) FILTER (WHERE kc.embedding_provider IS NOT NULL))
                    AS embedding_providers
            FROM rag_documents kd
            LEFT JOIN rag_chunks kc ON kc.doc_id = kd.id
            WHERE kd.id = $1
            GROUP BY kd.id
        """, doc_id)
        if not row:
            raise HTTPException(status_code=404, detail="Documento no encontrado")
        return _serialize_document(row)
    finally:
        await conn.close()


@router.patch("/documents/{doc_id}/toggle")
async def toggle_document(
    doc_id: str,
    x_internal_key: Optional[str] = Header(default=None, alias="x-internal-key"),
):
    """Activa/desactiva un documento sin borrarlo — un documento inactivo deja
    de aparecer en las búsquedas de los agentes IA pero conserva su historial
    (útil para "apagar" algo cuestionable sin perder el rastro de la decisión)."""
    if not x_internal_key or x_internal_key != settings.INTERNAL_API_KEY:
        raise HTTPException(status_code=401, detail="Clave interna inválida")

    conn = await asyncpg.connect(settings.DATABASE_URL)
    try:
        row = await conn.fetchrow("""
            UPDATE rag_documents SET is_active = NOT is_active
            WHERE id = $1
            RETURNING id, is_active
        """, doc_id)
        if not row:
            raise HTTPException(status_code=404, detail="Documento no encontrado")
        return {"id": row["id"], "is_active": row["is_active"]}
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


@router.get("/agents-with-rag")
async def agents_with_rag():
    """Qué Especialistas IA consultan la base de conocimiento — informativo,
    para la pantalla de administración. Los agentes del chat general buscan en
    TODAS las bases (no hay restricción por base ahí); la asistencia de sección
    para auditorías Fiscales es la única ruta que se limita explícitamente a
    FISCAL_SV (ver apps/api/src/working-papers/paper-sections.service.ts)."""
    return {
        "general_chat_agents": [
            "MINERVA", "SCRIPTORIUM", "ARGUS", "CICERO",
            "LEX", "MINERVA_QAIP", "VULCANO", "CASSANDRA",
        ],
        "note": "Estos agentes buscan en todas las bases de conocimiento activas cuando responden. "
                "La asistencia de sección para auditorías Fiscales (Lex) es la única ruta que se limita "
                "explícitamente a la base 'FISCAL_SV'.",
    }
