"""
Embedding Router — cascada de proveedores para generar embeddings de RAG.

Orden fijo: Gemini (primario, gratis) → Voyage AI → Jina AI → Cohere.
Cada proveedor de respaldo es opcional: si su API key no esta configurada
(string vacio en settings), se salta silenciosamente al siguiente.

Gemini produce vectores de 3072 dims (columna `embedding` en rag_chunks);
los tres proveedores de respaldo producen 1024 dims con su configuracion por
defecto (columna `embedding_fallback`, ver EMBEDDING_FALLBACK_DIMENSIONS en
config.py) — no se pueden mezclar en la misma columna de pgvector.

No incluye ningun proveedor self-hosted (ej. BAAI/bge-m3) — exclusion
explicita: correr un modelo local es una decision de infraestructura aparte,
no parte de esta cascada de APIs.
"""
import logging
import time
from enum import Enum

import httpx

from app.config import settings

logger = logging.getLogger(__name__)


class EmbeddingProvider(str, Enum):
    GEMINI = "gemini"
    VOYAGE = "voyage"
    JINA = "jina"
    COHERE = "cohere"


# Orden de la cascada — Gemini siempre primero, nunca se quita.
PROVIDER_CASCADE: list[EmbeddingProvider] = [
    EmbeddingProvider.GEMINI,
    EmbeddingProvider.VOYAGE,
    EmbeddingProvider.JINA,
    EmbeddingProvider.COHERE,
]

# Dimension de cada proveedor — usado por rag_pipeline.py para saber en que
# columna guardar (embedding = 3072 solo Gemini; embedding_fallback = el resto).
PROVIDER_DIMENSIONS: dict[EmbeddingProvider, int] = {
    EmbeddingProvider.GEMINI: settings.EMBEDDING_DIMENSIONS,
    EmbeddingProvider.VOYAGE: settings.EMBEDDING_FALLBACK_DIMENSIONS,
    EmbeddingProvider.JINA: settings.EMBEDDING_FALLBACK_DIMENSIONS,
    EmbeddingProvider.COHERE: settings.EMBEDDING_FALLBACK_DIMENSIONS,
}


def _is_configured(provider: EmbeddingProvider) -> bool:
    if provider == EmbeddingProvider.GEMINI:
        return bool(settings.GEMINI_API_KEY)
    if provider == EmbeddingProvider.VOYAGE:
        return bool(settings.VOYAGE_API_KEY)
    if provider == EmbeddingProvider.JINA:
        return bool(settings.JINA_API_KEY)
    if provider == EmbeddingProvider.COHERE:
        return bool(settings.COHERE_API_KEY)
    return False


# ─── Gemini ─────────────────────────────────────────────────────────────────

def _embed_gemini(texts: list[str]) -> list[list[float]]:
    """Una llamada por texto (asi lo requiere el SDK de Gemini), con reintento
    de por-minuto y fallo inmediato en cuota diaria — logica ya validada hoy."""
    from google import genai as google_genai

    client = google_genai.Client(api_key=settings.GEMINI_API_KEY)
    embeddings: list[list[float]] = []
    for i, text in enumerate(texts):
        attempt = 0
        while True:
            try:
                result = client.models.embed_content(
                    model=settings.EMBEDDING_MODEL,
                    contents=text,
                )
                embeddings.append(list(result.embeddings[0].values))
                break
            except Exception as e:
                msg = str(e)
                is_rate_limit = "RESOURCE_EXHAUSTED" in msg or "429" in msg
                is_daily_quota = "PerDay" in msg
                if not is_rate_limit or is_daily_quota or attempt >= 5:
                    raise
                attempt += 1
                wait = min(60, 2 ** attempt)
                logger.info(f"  ⏳ Gemini rate limit en embedding {i + 1}/{len(texts)} — reintento {attempt}/5 en {wait}s")
                time.sleep(wait)
        if i < len(texts) - 1:
            time.sleep(0.65)
    return embeddings


# ─── Voyage AI ──────────────────────────────────────────────────────────────

def _is_rate_limit_error(e: Exception) -> bool:
    msg = str(e)
    return "429" in msg or "rate limit" in msg.lower() or "too many requests" in msg.lower()


def _with_rate_limit_retry(fn, *args, max_attempts: int = 4, **kwargs):
    """Reintenta con backoff exponencial ante 429 — evita que una ingesta
    masiva (varios documentos disparados casi al mismo tiempo, cada uno con
    su propio hilo) choque contra el limite por-minuto de un proveedor de
    respaldo y falle toda la cascada sin necesidad. Genérico porque cada SDK
    (Voyage/Jina/Cohere) lanza un tipo de excepción distinto para 429."""
    attempt = 0
    while True:
        try:
            return fn(*args, **kwargs)
        except Exception as e:
            if not _is_rate_limit_error(e) or attempt >= max_attempts:
                raise
            attempt += 1
            wait = min(30, 2 ** attempt)
            logger.info(f"  ⏳ Rate limit de proveedor de respaldo — reintento {attempt}/{max_attempts} en {wait}s")
            time.sleep(wait)


# Tamano de sub-lote para Voyage/Jina/Cohere — un documento grande (ej. CIEPC,
# ~900 chunks) mandado en una sola llamada choca contra el limite de items o
# de tokens por request de estos proveedores (ej. 422 Unprocessable Entity de
# Jina). Ninguno de los tres documenta un limite identico, 96 es conservador
# y funciona para los tres sin acercarse a ningun limite conocido.
_FALLBACK_BATCH_SIZE = 96


def _embed_in_batches(embed_one_batch, texts: list[str]) -> list[list[float]]:
    all_embeddings: list[list[float]] = []
    for i in range(0, len(texts), _FALLBACK_BATCH_SIZE):
        batch = texts[i:i + _FALLBACK_BATCH_SIZE]
        all_embeddings.extend(_with_rate_limit_retry(embed_one_batch, batch))
    return all_embeddings


def _embed_voyage_once(texts: list[str]) -> list[list[float]]:
    import voyageai

    client = voyageai.Client(api_key=settings.VOYAGE_API_KEY)
    result = client.embed(
        texts=texts,
        model=settings.VOYAGE_EMBEDDING_MODEL,
        input_type="document",
    )
    return list(result.embeddings)


def _embed_voyage(texts: list[str]) -> list[list[float]]:
    """Voyage acepta batch nativo, pero se manda en sub-lotes (ver
    _FALLBACK_BATCH_SIZE) para no chocar con limites de items/tokens por
    request en documentos grandes."""
    return _embed_in_batches(_embed_voyage_once, texts)


# ─── Jina AI ────────────────────────────────────────────────────────────────

def _embed_jina_once(texts: list[str]) -> list[list[float]]:
    """API REST plana, formato compatible OpenAI — sin SDK dedicado."""
    response = httpx.post(
        "https://api.jina.ai/v1/embeddings",
        headers={
            "Authorization": f"Bearer {settings.JINA_API_KEY}",
            "Content-Type": "application/json",
        },
        json={
            "model": settings.JINA_EMBEDDING_MODEL,
            "task": "retrieval.passage",
            "input": texts,
        },
        timeout=120.0,
    )
    response.raise_for_status()
    data = response.json()["data"]
    # Jina devuelve los resultados en el mismo orden que el input, con "index".
    ordered = sorted(data, key=lambda d: d["index"])
    return [d["embedding"] for d in ordered]


def _embed_jina(texts: list[str]) -> list[list[float]]:
    return _embed_in_batches(_embed_jina_once, texts)


# ─── Cohere ─────────────────────────────────────────────────────────────────

def _embed_cohere_once(texts: list[str]) -> list[list[float]]:
    import cohere

    client = cohere.ClientV2(api_key=settings.COHERE_API_KEY)
    response = client.embed(
        model=settings.COHERE_EMBEDDING_MODEL,
        texts=texts,
        input_type="search_document",
        embedding_types=["float"],
    )
    return list(response.embeddings.float_ or [])


def _embed_cohere(texts: list[str]) -> list[list[float]]:
    return _embed_in_batches(_embed_cohere_once, texts)


_EMBEDDERS = {
    EmbeddingProvider.GEMINI: _embed_gemini,
    EmbeddingProvider.VOYAGE: _embed_voyage,
    EmbeddingProvider.JINA: _embed_jina,
    EmbeddingProvider.COHERE: _embed_cohere,
}


def embed_batch_with_fallback(
    texts: list[str],
    cascade: list[EmbeddingProvider] | None = None,
) -> tuple[list[list[float]], EmbeddingProvider]:
    """Genera embeddings probando cada proveedor de la cascada en orden.

    Se salta un proveedor si su API key no esta configurada. Si un proveedor
    configurado falla (error de red, cuota agotada, etc.), cae al siguiente.
    Si los 4 fallan, propaga la ultima excepcion (mismo comportamiento que
    antes de esta cascada, ahora como ultimo recurso).

    Sincrono a proposito — se llama desde un thread aparte via
    asyncio.to_thread (ver rag_pipeline.py), igual que la version anterior
    de _embed_batch.
    """
    last_error: Exception | None = None
    for provider in (cascade or PROVIDER_CASCADE):
        if not _is_configured(provider):
            logger.info(f"  ⏭️  {provider.value}: sin API key configurada, se salta.")
            continue
        try:
            logger.info(f"  → Generando {len(texts)} embeddings con {provider.value}...")
            embeddings = _EMBEDDERS[provider](texts)
            return embeddings, provider
        except Exception as e:
            last_error = e
            logger.warning(f"  ⚠️  {provider.value} fallo, probando siguiente proveedor: {e}")
            continue

    raise RuntimeError(
        f"Todos los proveedores de embeddings fallaron o no estan configurados. "
        f"Ultimo error: {last_error}"
    )


def embed_query_with_provider(query: str, provider: EmbeddingProvider) -> list[float]:
    """Genera el embedding de UNA consulta con un proveedor especifico —
    usado en busqueda, donde hay que igualar el proveedor de los chunks
    contra los que se compara (ver search_knowledge en rag_pipeline.py)."""
    embeddings = _EMBEDDERS[provider]([query])
    return embeddings[0]
