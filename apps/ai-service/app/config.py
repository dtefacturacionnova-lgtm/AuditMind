from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    # Anthropic (Claude)
    ANTHROPIC_API_KEY: str
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

    # JWT
    SUPABASE_JWT_SECRET: str

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"
        env_ignore_empty = True  # Empty OS env vars don't override .env values


settings = Settings()
