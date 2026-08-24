from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    # Anthropic (Claude) — opcional; proveedor primario es Gemini.
    # Sólo necesario si DEFAULT_PROVIDER se cambia a LLMProvider.CLAUDE.
    ANTHROPIC_API_KEY: str = ""
    ANTHROPIC_DEFAULT_MODEL: str = "claude-sonnet-4-5"
    ANTHROPIC_OPUS_MODEL: str = "claude-opus-4-5"
    ANTHROPIC_HAIKU_MODEL: str = "claude-haiku-4-5"

    # Supabase / PostgreSQL
    DATABASE_URL: str
    SUPABASE_URL: str
    SUPABASE_SERVICE_ROLE_KEY: str

    # Gemini embeddings (gemini-embedding-001 — 3072 dims, free tier)
    GEMINI_API_KEY: str
    EMBEDDING_MODEL: str = "models/gemini-embedding-001"
    EMBEDDING_DIMENSIONS: int = 3072

    # Embeddings — cascada de respaldo cuando Gemini falla o agota su cuota diaria.
    # Todas opcionales: string vacío = proveedor deshabilitado, se salta en la cascada
    # (ver app/services/embedding_router.py). Orden fijo: Gemini → Voyage → Jina → Cohere.
    VOYAGE_API_KEY: str = ""
    VOYAGE_EMBEDDING_MODEL: str = "voyage-multilingual-2"
    JINA_API_KEY: str = ""
    # v3 esta deprecado (ago-2026) — v5-text-small es multilingue con buen soporte
    # de espanol y sigue en 1024 dims por defecto. Confirmar contra jina.ai/embeddings
    # si cambia antes de activar la key.
    JINA_EMBEDDING_MODEL: str = "jina-embeddings-v5-text-small"
    COHERE_API_KEY: str = ""
    COHERE_EMBEDDING_MODEL: str = "embed-multilingual-v3.0"
    # Dimensión compartida de la columna de respaldo en pgvector — los 3 proveedores
    # de fallback producen vectores de 1024 dims con la configuración por defecto.
    EMBEDDING_FALLBACK_DIMENSIONS: int = 1024

    # Service URLs
    WEB_URL: str = "http://localhost:3000"
    API_URL: str = "http://localhost:3001"
    AI_SERVICE_PORT: int = 3003

    # Stirling-PDF — OCR self-hosted (sin límite de cuota) para PDFs escaneados
    # sin capa de texto, ver rag_pipeline.py. Servicio interno, solo 127.0.0.1
    # (mismo patrón de aislamiento que ai-service/AI_SERVICE_URL). Vacío =
    # deshabilitado, se salta directo al fallback de Gemini vision.
    STIRLING_PDF_URL: str = ""

    # Internal API key — used by NestJS to call FastAPI (replaces JWT re-verification)
    INTERNAL_API_KEY: str = "auditmind-internal-2026-xK9mP3qR"

    # JWT — actualmente no se usa (auth via INTERNAL_API_KEY entre NestJS y ai-service)
    # Se mantiene para compatibilidad futura con verificación directa de tokens Supabase.
    SUPABASE_JWT_SECRET: str = ""

    # Evidencia de campo — transcripción con faster-whisper autoalojado (EVD-03)
    # "base"/"int8"/"cpu" por el límite PM2 de 800MB con 2 workers (ver docs §6.7).
    WHISPER_MODEL_SIZE: str = "base"
    WHISPER_COMPUTE_TYPE: str = "int8"
    WHISPER_DEVICE: str = "cpu"

    # Evidencia de campo — diarización de hablantes con pyannote-audio (EVD-12, Fase 2).
    # Token de Hugging Face con la licencia de pyannote/speaker-diarization-3.1 y
    # pyannote/segmentation-3.0 aceptada (huggingface.co/settings/tokens). Sin esto,
    # la diarización falla con un mensaje explícito — la transcripción sigue
    # funcionando igual (degradación controlada, ver diarization_service.py).
    HUGGINGFACE_TOKEN: str = ""

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"
        env_ignore_empty = True  # Empty OS env vars don't override .env values


settings = Settings()
