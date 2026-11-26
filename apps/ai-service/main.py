"""Nova Criterio AI Service — FastAPI + Claude API + Gemini Embeddings + pgvector RAG"""
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

import asyncpg

from app.config import settings
from app.routers import agents, rag, health, analytics, connectors, scriptorium, sampling, evidence, investigation, watchlists
from app.services.llm_router import LLMUnavailableError
from app.services.rag_pipeline import _ensure_pgvector_tables


@asynccontextmanager
async def lifespan(app: FastAPI):
    print(f"🚀 Nova Criterio AI Service — LLM primario: {'OpenRouter (' + settings.OPENROUTER_MODEL_STANDARD + ')' if settings.OPENROUTER_API_KEY else 'Gemini (OPENROUTER_API_KEY sin configurar)'}")
    print(f"   Embeddings: {settings.EMBEDDING_MODEL} ({settings.EMBEDDING_DIMENSIONS} dims)")
    # Migra el esquema de pgvector al arrancar (idempotente — ADD COLUMN IF NOT
    # EXISTS) en vez de esperar a la primera ingesta, para que /rag/documents y
    # otras lecturas funcionen aunque nadie haya ingerido nada todavía hoy.
    try:
        conn = await asyncpg.connect(settings.DATABASE_URL)
        try:
            await _ensure_pgvector_tables(conn)
            print("   pgvector: esquema RAG verificado/migrado")
        finally:
            await conn.close()
    except Exception as e:
        print(f"   ⚠️  No se pudo verificar el esquema de pgvector al arrancar: {e}")
    yield
    print("👋 AI Service shutting down")


app = FastAPI(
    title="Nova Criterio AI Service",
    version="2.0.0",
    description="Motor de Inteligencia Artificial — 14 Agentes, 9 RAG Bases, CAATs, Claude API",
    lifespan=lifespan,
)

@app.exception_handler(LLMUnavailableError)
async def _llm_unavailable_handler(_request: Request, exc: LLMUnavailableError) -> JSONResponse:
    """Todos los proveedores de IA fallaron: 503 con un mensaje neutro (el detalle por proveedor —
    saldo, cuota, clave— queda en el log del servidor, no se filtra al navegador). Antes salía un
    500 «Internal Server Error» sin pista de la causa."""
    logging.getLogger("app.llm").error("%s", exc)
    return JSONResponse(
        status_code=503,
        content={"detail": "El asistente de IA no está disponible en este momento. Intenta de nuevo en unos minutos."},
    )


app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.WEB_URL, settings.API_URL],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, tags=["Health"])
app.include_router(agents.router, prefix="/agents", tags=["Agentes IA"])
app.include_router(rag.router, prefix="/rag", tags=["RAG Knowledge Base"])
app.include_router(analytics.router, prefix="/analytics", tags=["CAATs Analytics"])
app.include_router(connectors.router, prefix="/connectors", tags=["Conectores ETL"])
app.include_router(scriptorium.router, prefix="/scriptorium", tags=["Scriptorium IA"])
app.include_router(sampling.router)  # prefix /sampling viene del propio router
app.include_router(evidence.router, prefix="/evidence", tags=["Evidencia de Campo"])
app.include_router(investigation.router, prefix="/investigation", tags=["Investigador Forense — SHERLOCK"])
app.include_router(watchlists.router, prefix="/watchlists", tags=["Listas de Sanciones — Motor CAATs #18"])
