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

    # Service URLs
    WEB_URL: str = "http://localhost:3000"
    API_URL: str = "http://localhost:3001"
    AI_SERVICE_PORT: int = 3003

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

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"
        env_ignore_empty = True  # Empty OS env vars don't override .env values


settings = Settings()
