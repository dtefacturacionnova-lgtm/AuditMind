"""AuditMind AI Service — FastAPI + Claude API + Gemini Embeddings + pgvector RAG"""
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import asyncpg

from app.config import settings
from app.routers import agents, rag, health, analytics, connectors, scriptorium, sampling, evidence, investigation, watchlists
from app.services.rag_pipeline import _ensure_pgvector_tables


@asynccontextmanager
async def lifespan(app: FastAPI):
    print(f"🚀 AuditMind AI Service — model: {settings.ANTHROPIC_DEFAULT_MODEL}")
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
    title="AuditMind AI Service",
    version="2.0.0",
    description="Motor de Inteligencia Artificial — 14 Agentes, 9 RAG Bases, CAATs, Claude API",
    lifespan=lifespan,
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
