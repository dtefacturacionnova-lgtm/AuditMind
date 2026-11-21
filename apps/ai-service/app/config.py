from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    # OpenRouter — proveedor PRIMARIO de los asistentes (2026-11-21). API compatible con
    # OpenAI: un solo saldo para Claude, Gemini, etc. Vacío = se salta y el router sigue con
    # Gemini → Claude como antes (ver app/services/llm_router.py). La clave va SOLO en el
    # .env del servidor, nunca en el repo ni en el chat.
    OPENROUTER_API_KEY: str = ""
    OPENROUTER_BASE_URL: str = "https://openrouter.ai/api/v1"
    # Un modelo por complejidad de tarea. Elegido el 2026-11-21 por BENCHMARK real con la clave (17 modelos, ids verificados contra
    # openrouter.ai/api/v1/models): openai/gpt-6-luna ($0.10 entrada / $0.50 salida por millón) respondió bien en TODO — plazo
    # fundamentado en el contexto RAG, no inventó la multa que el contexto no trae, JSON válido 3/3, hallazgo completo en 166 palabras,
    # 5/5 anomalías sembradas en un libro de pagos con 0 falsos positivos, y lee imágenes + JSON — a ~$0.0004 por análisis frente a
    # ~$0.011 de Sonnet 5.5 (30 veces más) que además marcó 2 falsos positivos. Descartados: Haiku 5.5 y Gemini 3.x flash (razonan de más y
    # se quedan sin tokens), Qwen/Gemma/MiniMax (JSON inválido o vacío), Mistral Small y Gemini 3.1 flash-lite (inventan cifras), gpt-5-mini
    # y gpt-5-nano (sirven, pero 4-5 veces más caros por análisis sin ganar nada), GLM/DeepSeek (baratos y buenos, pero de origen chino:
    # preferible no mandar datos de clientes de auditoría). Si algún agente complejo (CICERO, CASSANDRA, SENADO, SHERLOCK) mostrara
    # carencias, subir SOLO OPENROUTER_MODEL_COMPLEX desde el .env (p. ej. openai/gpt-5-mini o anthropic/claude-sonnet-5.5).
    OPENROUTER_MODEL_SIMPLE: str = "openai/gpt-6-luna"
    OPENROUTER_MODEL_STANDARD: str = "openai/gpt-6-luna"
    OPENROUTER_MODEL_COMPLEX: str = "openai/gpt-6-luna"
    # Privacidad: «deny» pide a OpenRouter enrutar SOLO a proveedores que no almacenan ni entrenan con los datos (los papeles de auditoría
    # llevan información de clientes). Si un modelo no tuviera ningún proveedor así, la llamada falla (404) y el router pasa a Gemini.
    # «allow» o cualquier otro valor no envía la preferencia.
    OPENROUTER_DATA_COLLECTION: str = "deny"
    # Esfuerzo de razonamiento. Sonnet 5.5 y Opus 5.5 RAZONAN SIEMPRE (OpenRouter responde 400 si se intenta apagarlo) y ese
    # razonamiento cuenta contra `max_tokens`: sin límite explícito, con max_tokens=120 el modelo gastó los 120 pensando y devolvió
    # contenido vacío (detectado en producción 2026-11-21). «low» lo reduce al mínimo — equivale al thinking_budget=0 que se usaba
    # con Gemini. Subir a «medium»/«high» solo si se prioriza calidad sobre costo y latencia; «off» no envía el parámetro.
    OPENROUTER_REASONING_EFFORT: str = "low"
    # Cabeceras de atribución que OpenRouter pide (aparecen en su panel de uso). No son secretas.
    OPENROUTER_REFERER: str = "https://auditoria.ianovatechsystems.com"
    OPENROUTER_TITLE: str = "AuditMind"

    # Anthropic (Claude) directo — último recurso de la cadena (OpenRouter → Gemini → Claude).
    # Si está vacío se salta; una clave inválida solo agrega un intento fallido al final.
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

    # Motor CAATs #18 — Screening de sanciones (OFAC + ONU). URLs oficiales,
    # verificadas en vivo al diseñar esta feature (2026-08-26) — ambas
    # responden sin API key. La de ONU solo acepta GET (no HEAD) y redirige
    # 302 a una URL de Azure Blob Storage firmada temporalmente; httpx con
    # follow_redirects=True la sigue sin problema.
    OFAC_SDN_XML_URL: str = "https://sanctionslistservice.ofac.treas.gov/api/publicationpreview/exports/sdn.xml"
    UN_CONSOLIDATED_XML_URL: str = "https://scsanctions.un.org/resources/xml/en/consolidated.xml"
    # UK Sanctions List (FCDO) — reemplazó a la OFSI Consolidated List
    # (retirada 28/01/2026). Verificada en vivo 2026-08-26 (~3,974 registros).
    # La UE quedó FUERA de esta ronda: su fuente oficial (webgate.ec.europa.eu)
    # exige crear una cuenta para obtener la URL/API key — confirmado en vivo
    # con un 403 real, no un bloqueo de bot — y no está dentro de lo que se
    # puede automatizar sin esa cuenta.
    UK_SANCTIONS_XML_URL: str = "https://sanctionslist.fcdo.gov.uk/docs/UK-Sanctions-List.xml"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"
        env_ignore_empty = True  # Empty OS env vars don't override .env values


settings = Settings()
