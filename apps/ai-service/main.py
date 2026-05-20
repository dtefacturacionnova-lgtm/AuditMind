"""AuditMind AI Service — FastAPI + Claude API + Gemini Embeddings + pgvector RAG"""
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import agents, rag, health, analytics, connectors, scriptorium


@asynccontextmanager
async def lifespan(app: FastAPI):
    print(f"🚀 AuditMind AI Service — model: {settings.ANTHROPIC_DEFAULT_MODEL}")
    print(f"   Embeddings: {settings.EMBEDDING_MODEL} ({settings.EMBEDDING_DIMENSIONS} dims)")
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
