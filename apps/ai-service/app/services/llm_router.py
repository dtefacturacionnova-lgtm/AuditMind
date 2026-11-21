"""
LLM Router — tres proveedores en cascada: OpenRouter (primario) → Gemini → Claude directo.

Cadena de respaldo (2026-11-21):
  1. OPENROUTER → Claude por saldo de OpenRouter (Haiku / Sonnet / Opus según la complejidad)
  2. GEMINI     → gemini-2.5-flash (capa gratuita de AI Studio; se agota con 429 bajo carga)
  3. CLAUDE     → API directa de Anthropic (último recurso)

Un proveedor sin clave configurada se salta (no cuenta como intento). Si TODOS fallan se lanza
LLMUnavailableError con el motivo de cada uno — antes se propagaba la excepción cruda del último
(un 401 de Anthropic) y nadie sabía que el problema real era la cuota de Gemini.
"""
import asyncio
import base64
import json
import logging
from enum import Enum

import httpx
from anthropic import AsyncAnthropic
from google import genai
from google.genai import types as genai_types
from pydantic import BaseModel, ValidationError

from app.config import settings
from app.services.json_utils import parse_json_response

logger = logging.getLogger(__name__)


# ─── Enums ────────────────────────────────────────────────────────────────────

class TaskComplexity(str, Enum):
    SIMPLE   = "simple"
    STANDARD = "standard"
    COMPLEX  = "complex"


class LLMProvider(str, Enum):
    OPENROUTER = "openrouter"
    GEMINI     = "gemini"
    CLAUDE     = "claude"


class LLMUnavailableError(Exception):
    """Ningún proveedor de IA configurado pudo responder (cuota agotada, saldo, red, clave inválida)."""


# ─── Agent → complexity mapping ───────────────────────────────────────────────

TASK_COMPLEXITY_MAP: dict[str, TaskComplexity] = {
    "MINERVA":      TaskComplexity.STANDARD,
    "SCRIPTORIUM":  TaskComplexity.STANDARD,
    "ARGUS":        TaskComplexity.STANDARD,
    "HERMES":       TaskComplexity.SIMPLE,
    "CICERO":       TaskComplexity.COMPLEX,
    "SOCRATES":     TaskComplexity.STANDARD,
    "CASSANDRA":    TaskComplexity.COMPLEX,
    "VULCANO":      TaskComplexity.STANDARD,
    "SENADO":       TaskComplexity.COMPLEX,
    "ATLAS":        TaskComplexity.STANDARD,
    "FENIX":        TaskComplexity.STANDARD,
    "FISCUS":       TaskComplexity.STANDARD,
    "SHERLOCK":     TaskComplexity.COMPLEX,
    "MINERVA_QAIP": TaskComplexity.STANDARD,
}

# ─── Model maps ───────────────────────────────────────────────────────────────

# Gemini models — gemini-2.5-flash available on free tier (AI Studio key)
GEMINI_MODEL_MAP: dict[TaskComplexity, str] = {
    TaskComplexity.SIMPLE:   "models/gemini-2.5-flash",
    TaskComplexity.STANDARD: "models/gemini-2.5-flash",
    TaskComplexity.COMPLEX:  "models/gemini-2.5-flash",  # 2.5-pro needs billing
}

# Claude models — requires Anthropic API credits
CLAUDE_MODEL_MAP: dict[TaskComplexity, str] = {
    TaskComplexity.SIMPLE:   settings.ANTHROPIC_HAIKU_MODEL,
    TaskComplexity.STANDARD: settings.ANTHROPIC_DEFAULT_MODEL,
    TaskComplexity.COMPLEX:  settings.ANTHROPIC_OPUS_MODEL,
}

def _openrouter_model(complexity: TaskComplexity) -> str:
    """Modelo de OpenRouter para la complejidad dada. Se lee de `settings` en cada llamada
    (no se congela al importar) para que un cambio de .env + reinicio basta y las pruebas
    puedan sustituirlo."""
    return {
        TaskComplexity.SIMPLE:   settings.OPENROUTER_MODEL_SIMPLE,
        TaskComplexity.STANDARD: settings.OPENROUTER_MODEL_STANDARD,
        TaskComplexity.COMPLEX:  settings.OPENROUTER_MODEL_COMPLEX,
    }[complexity]


# ─── Proveedor primario y orden de respaldo ───────────────────────────────────
DEFAULT_PROVIDER = LLMProvider.OPENROUTER
_FALLBACK_ORDER = [LLMProvider.OPENROUTER, LLMProvider.GEMINI, LLMProvider.CLAUDE]

# ─── Clients ──────────────────────────────────────────────────────────────────
_anthropic = AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
_gemini    = genai.Client(api_key=settings.GEMINI_API_KEY)


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _to_gemini_messages(messages: list[dict]) -> list[dict]:
    """Convert Anthropic-style messages to Gemini content format."""
    result = []
    for msg in messages:
        role = "model" if msg["role"] == "assistant" else "user"
        content = msg.get("content", "")
        result.append({"role": role, "parts": [{"text": content}]})
    return result


def _extract_gemini_text(response) -> str:
    """Extract plain text from a Gemini response (handles thinking mode)."""
    # Try the simple .text shortcut first
    if response.text:
        return response.text
    # Fall back to iterating candidates/parts
    parts = []
    for candidate in (response.candidates or []):
        for part in (candidate.content.parts or []):
            text = getattr(part, "text", None)
            if text:
                parts.append(text)
    return "".join(parts)


# ─── Provider implementations ─────────────────────────────────────────────────

async def _chat_gemini(
    model: str,
    system_prompt: str,
    messages: list[dict],
    max_tokens: int,
) -> dict:
    gemini_messages = _to_gemini_messages(messages)

    response = await _gemini.aio.models.generate_content(
        model=model,
        contents=gemini_messages,
        config=genai_types.GenerateContentConfig(
            system_instruction=system_prompt,
            max_output_tokens=max_tokens,
            temperature=0.7,
            thinking_config=genai_types.ThinkingConfig(thinking_budget=0),
        ),
    )

    content = _extract_gemini_text(response)
    usage   = response.usage_metadata

    return {
        "content":       content,
        "model":         model,
        "input_tokens":  getattr(usage, "prompt_token_count", 0) or 0,
        "output_tokens": getattr(usage, "candidates_token_count", 0) or 0,
        "stop_reason":   "end_turn",
    }


async def _chat_claude(
    model: str,
    system_prompt: str,
    messages: list[dict],
    max_tokens: int,
) -> dict:
    response = await _anthropic.messages.create(
        model=model,
        max_tokens=max_tokens,
        system=system_prompt,
        messages=messages,
    )
    return {
        "content":       response.content[0].text,
        "model":         model,
        "input_tokens":  response.usage.input_tokens,
        "output_tokens": response.usage.output_tokens,
        "stop_reason":   response.stop_reason,
    }


# ─── OpenRouter (API compatible con OpenAI) ───────────────────────────────────

class OpenRouterError(Exception):
    """OpenRouter respondió con error (HTTP ≥ 400 o `error` en el cuerpo) o sin texto."""


# 120 s de lectura: un Opus con 4096 tokens de salida y contexto RAG puede tardar. 10 s para conectar.
_OPENROUTER_TIMEOUT = httpx.Timeout(120.0, connect=10.0)


def _provider_param() -> dict | None:
    """Preferencia de privacidad de OpenRouter: solo proveedores que no guardan ni entrenan con los datos. Ver OPENROUTER_DATA_COLLECTION."""
    value = (settings.OPENROUTER_DATA_COLLECTION or "").strip().lower()
    return {"data_collection": "deny"} if value == "deny" else None


async def _openrouter_request(payload: dict) -> dict:
    """POST /chat/completions. Devuelve el JSON de la respuesta o lanza OpenRouterError con el
    estado y el mensaje del proveedor (402 = sin saldo, 429 = límite, 401 = clave inválida).
    Nunca incluye la clave en el mensaje."""
    headers = {
        "Authorization": f"Bearer {settings.OPENROUTER_API_KEY}",
        "Content-Type":  "application/json",
        "HTTP-Referer":  settings.OPENROUTER_REFERER,
        "X-Title":       settings.OPENROUTER_TITLE,
    }
    url = f"{settings.OPENROUTER_BASE_URL.rstrip('/')}/chat/completions"
    if (provider_pref := _provider_param()):
        payload = {**payload}
        payload.setdefault("provider", provider_pref)  # un llamador puede fijar el suyo
    async with httpx.AsyncClient(timeout=_OPENROUTER_TIMEOUT) as client:
        resp = await client.post(url, headers=headers, json=payload)
    try:
        data = resp.json()
    except ValueError:
        data = {}
    if not isinstance(data, dict):
        data = {}
    err = data.get("error")
    if resp.status_code >= 400 or err:
        if isinstance(err, dict):
            detail = str(err.get("message") or err)
        else:
            detail = str(err) if err else resp.text
        raise OpenRouterError(f"HTTP {resp.status_code}: {detail[:300]}")
    return data


def _reasoning_param() -> dict | None:
    """Parámetro `reasoning` de OpenRouter, o None si está en «off». Ver OPENROUTER_REASONING_EFFORT en config.py."""
    effort = (settings.OPENROUTER_REASONING_EFFORT or "").strip().lower()
    return None if effort in ("", "off") else {"effort": effort}


def _extract_openrouter_text(data: dict) -> str:
    choices = data.get("choices") or []
    if not choices or not isinstance(choices[0], dict):
        return ""
    content = (choices[0].get("message") or {}).get("content")
    if isinstance(content, str):
        return content
    if isinstance(content, list):  # contenido en bloques [{type: "text", text: "..."}]
        return "".join(p.get("text", "") for p in content if isinstance(p, dict))
    return ""


def _openrouter_result(data: dict, model: str) -> tuple[str, dict]:
    """(texto, métricas). Un texto vacío cuenta como fallo para que el router pase al siguiente."""
    text = _extract_openrouter_text(data)
    finish = ((data.get("choices") or [{}])[0] or {}).get("finish_reason")
    if not text.strip():
        raise OpenRouterError(f"respuesta vacía (finish_reason={finish}; con «length» el razonamiento agotó max_tokens)")
    usage = data.get("usage") or {}
    return text, {
        "model":         model,
        "input_tokens":  int(usage.get("prompt_tokens") or 0),
        "output_tokens": int(usage.get("completion_tokens") or 0),
        "stop_reason":   {"stop": "end_turn", "length": "max_tokens"}.get(finish, finish or "end_turn"),
    }


async def _chat_openrouter(
    model: str,
    system_prompt: str,
    messages: list[dict],
    max_tokens: int,
) -> dict:
    payload = {
        "model": model,
        "max_tokens": max_tokens,
        "temperature": 0.7,
        "messages": [{"role": "system", "content": system_prompt}]
        + [{"role": "assistant" if m["role"] == "assistant" else "user", "content": m.get("content", "")} for m in messages],
    }
    if (reasoning := _reasoning_param()):
        payload["reasoning"] = reasoning
    data = await _openrouter_request(payload)
    text, meta = _openrouter_result(data, model)
    return {"content": text, **meta}


# ─── Public interface ─────────────────────────────────────────────────────────

def get_model_for_agent(
    agent_type: str,
    override_complexity: TaskComplexity | None = None,
    provider: LLMProvider = DEFAULT_PROVIDER,
) -> tuple[str, LLMProvider]:
    complexity = override_complexity or TASK_COMPLEXITY_MAP.get(
        agent_type.upper(), TaskComplexity.STANDARD
    )
    if provider == LLMProvider.OPENROUTER:
        return _openrouter_model(complexity), LLMProvider.OPENROUTER
    if provider == LLMProvider.GEMINI:
        return GEMINI_MODEL_MAP[complexity], LLMProvider.GEMINI
    return CLAUDE_MODEL_MAP[complexity], LLMProvider.CLAUDE


def _is_configured(provider: LLMProvider) -> bool:
    """¿Tiene clave? Gemini siempre (su clave es obligatoria en Settings)."""
    if provider == LLMProvider.OPENROUTER:
        return bool(settings.OPENROUTER_API_KEY)
    if provider == LLMProvider.CLAUDE:
        return bool(settings.ANTHROPIC_API_KEY)
    return True


def provider_chain(first: LLMProvider | None = None) -> list[LLMProvider]:
    """Orden de intento: el pedido primero y el resto de la cadena después, sin los que no tienen clave."""
    start = first or DEFAULT_PROVIDER
    order = [start] + [p for p in _FALLBACK_ORDER if p != start]
    return [p for p in order if _is_configured(p)] or [LLMProvider.GEMINI]


def _brief(err: Exception) -> str:
    return " ".join(str(err).split())[:300]


async def chat_with_agent(
    agent_type: str,
    system_prompt: str,
    messages: list[dict],
    max_tokens: int = 4096,
    override_complexity: TaskComplexity | None = None,
    provider: LLMProvider | None = None,
) -> dict:
    impl = {
        LLMProvider.OPENROUTER: _chat_openrouter,
        LLMProvider.GEMINI:     _chat_gemini,
        LLMProvider.CLAUDE:     _chat_claude,
    }
    failures: list[str] = []
    for p in provider_chain(provider):
        model, _ = get_model_for_agent(agent_type, override_complexity, p)
        try:
            return await impl[p](model, system_prompt, messages, max_tokens)
        except Exception as err:
            failures.append(f"{p.value}: {_brief(err)}")
            logger.warning("chat_with_agent: %s falló (%s) — probando el siguiente proveedor", p.value, _brief(err))
    raise LLMUnavailableError("Ningún proveedor de IA respondió — " + " | ".join(failures))


# ─── Salida estructurada (EVD-05) ──────────────────────────────────────────────
# Función nueva, no un parámetro más de chat_with_agent: la extracción es tarea
# determinista (temperature baja fija), no conversacional (temperature=0.7 fijo
# de _chat_gemini), y necesita validación Pydantic + reintento — nada de eso
# aplica al resto de los usos de chat_with_agent.

class StructuredGenerationError(Exception):
    """El LLM no devolvió una respuesta que valide contra el schema pedido,
    ni siquiera tras el reintento con el error de validación anexado."""


_JSON_ONLY = "Responde ÚNICAMENTE con un objeto JSON válido, sin texto adicional ni bloques markdown."


async def _structured_openrouter(
    model: str,
    system_prompt: str,
    user_content: str,
    response_schema: type[BaseModel],
    max_tokens: int,
    temperature: float,
    imagenes: list[tuple[bytes, str]] | None,
) -> dict:
    # A diferencia de Gemini, aquí no hay `response_schema` nativo: se le entrega el JSON Schema del
    # modelo Pydantic en el prompt para que el formato coincida con lo que luego se valida.
    instruction = (
        f"{system_prompt}\n\n{_JSON_ONLY}\n"
        f"El objeto debe cumplir este JSON Schema:\n{json.dumps(response_schema.model_json_schema(), ensure_ascii=False)}"
    )
    if imagenes:
        # Formato de OpenAI: las imágenes van como data URI en bloques `image_url`.
        user_message: list | str = [{"type": "text", "text": user_content}]
        for image_bytes, mime_type in imagenes:
            user_message.append({"type": "image_url", "image_url": {
                "url": f"data:{mime_type};base64,{base64.b64encode(image_bytes).decode('ascii')}",
            }})
    else:
        user_message = user_content
    payload = {
        "model": model,
        "max_tokens": max_tokens,
        "temperature": temperature,
        "response_format": {"type": "json_object"},  # OpenRouter lo ignora si el modelo no lo soporta
        "messages": [
            {"role": "system", "content": instruction},
            {"role": "user", "content": user_message},
        ],
    }
    if (reasoning := _reasoning_param()):
        payload["reasoning"] = reasoning
    data = await _openrouter_request(payload)
    text, meta = _openrouter_result(data, model)
    return {"parsed": parse_json_response(text, {}), "model": meta["model"],
            "input_tokens": meta["input_tokens"], "output_tokens": meta["output_tokens"]}


async def _structured_gemini(
    model: str,
    system_prompt: str,
    user_content: str,
    response_schema: type[BaseModel],
    max_tokens: int,
    temperature: float,
    imagenes: list[tuple[bytes, str]] | None,
) -> dict:
    if imagenes:
        parts = [genai_types.Part.from_text(text=user_content)]
        for image_bytes, mime_type in imagenes:
            parts.append(genai_types.Part.from_bytes(data=image_bytes, mime_type=mime_type))
        contents = [genai_types.Content(role="user", parts=parts)]
    else:
        contents = [{"role": "user", "parts": [{"text": user_content}]}]
    response = await _gemini.aio.models.generate_content(
        model=model,
        contents=contents,
        config=genai_types.GenerateContentConfig(
            system_instruction=system_prompt,
            max_output_tokens=max_tokens,
            temperature=temperature,
            response_mime_type="application/json",
            response_schema=response_schema,
            thinking_config=genai_types.ThinkingConfig(thinking_budget=0),
        ),
    )
    text = _extract_gemini_text(response)
    usage = response.usage_metadata
    return {
        "parsed": parse_json_response(text, {}),
        "model": model,
        "input_tokens": getattr(usage, "prompt_token_count", 0) or 0,
        "output_tokens": getattr(usage, "candidates_token_count", 0) or 0,
    }


async def _structured_claude(
    model: str,
    system_prompt: str,
    user_content: str,
    response_schema: type[BaseModel],
    max_tokens: int,
    temperature: float,
    imagenes: list[tuple[bytes, str]] | None,
) -> dict:
    instruction = f"{system_prompt}\n\n{_JSON_ONLY}"
    if imagenes:
        claude_content: list | str = [{"type": "text", "text": user_content}]
        for image_bytes, mime_type in imagenes:
            claude_content.append({"type": "image", "source": {
                "type": "base64", "media_type": mime_type,
                "data": base64.b64encode(image_bytes).decode("ascii"),
            }})
    else:
        claude_content = user_content
    response = await _anthropic.messages.create(
        model=model,
        max_tokens=max_tokens,
        temperature=temperature,
        system=instruction,
        messages=[{"role": "user", "content": claude_content}],
    )
    return {
        "parsed": parse_json_response(response.content[0].text, {}),
        "model": model,
        "input_tokens": response.usage.input_tokens,
        "output_tokens": response.usage.output_tokens,
    }


async def _generate_structured_once(
    agent_type: str,
    system_prompt: str,
    user_content: str,
    response_schema: type[BaseModel],
    max_tokens: int,
    temperature: float,
    imagenes: list[tuple[bytes, str]] | None = None,  # [(bytes, mime_type), ...] — EVD-14 (1 foto), EVD-15 (hasta 15 frames de video)
) -> dict:
    impl = {
        LLMProvider.OPENROUTER: _structured_openrouter,
        LLMProvider.GEMINI:     _structured_gemini,
        LLMProvider.CLAUDE:     _structured_claude,
    }
    failures: list[str] = []
    for p in provider_chain():
        model, _ = get_model_for_agent(agent_type, TaskComplexity.STANDARD, p)
        try:
            return await impl[p](model, system_prompt, user_content, response_schema, max_tokens, temperature, imagenes)
        except Exception as err:
            failures.append(f"{p.value}: {_brief(err)}")
            logger.warning("generate_structured: %s falló (%s) — probando el siguiente proveedor", p.value, _brief(err))
    raise LLMUnavailableError("Ningún proveedor de IA respondió — " + " | ".join(failures))


async def generate_structured(
    agent_type: str,
    system_prompt: str,
    user_content: str,
    response_schema: type[BaseModel],
    max_tokens: int = 8192,
    temperature: float = 0.1,
    imagenes: list[tuple[bytes, str]] | None = None,  # [(bytes, mime_type), ...] — EVD-14 (1 foto), EVD-15 (varios frames de video)
) -> dict:
    """Genera una respuesta JSON validada contra un schema Pydantic.

    OpenRouter primero (JSON mode + el JSON Schema en el prompt); si falla,
    Gemini (JSON mode con `response_schema`) y por último Claude directo con
    instrucción JSON explícita — la misma cadena que chat_with_agent
    (`provider_chain`). El texto de cualquiera de los proveedores se parsea con
    el mismo parser compartido (json_utils.parse_json_response) y se valida
    con Pydantic. Si no valida, UN reintento con el error de validación
    anexado al prompt; si vuelve a fallar, error — nunca se devuelve un
    resultado sin validar.

    `imagenes`, si se pasa, agrega cada imagen como parte multimodal en TODOS
    los proveedores (OpenRouter bloque `image_url` con data URI / Gemini
    `Part.from_bytes` / Claude bloque `image`, una por imagen, en el mismo
    orden) — el reintento de validación reenvía las mismas imágenes, no solo
    el texto. Con una sola imagen es el caso de EVD-14 (foto anotada); con
    varias, EVD-15 (frames muestreados de video).
    """
    last_error: str | None = None
    content = user_content

    for attempt in range(2):
        try:
            result = await _generate_structured_once(agent_type, system_prompt, content, response_schema, max_tokens, temperature, imagenes)
        except Exception as e:
            # Fallaron TODOS los proveedores de la cadena (ver _generate_structured_once)
            # — sin esto, la excepción cruda del SDK se propaga sin envolver y el
            # llamador (ej. investigation.py, evidence.py) no puede distinguirla de un
            # bug real; su `except StructuredGenerationError` nunca la atrapa y termina
            # como 500 Internal Server Error sin mensaje útil. No se reintenta — un
            # fallo de TODOS los proveedores no es el tipo de error que un segundo
            # intento idéntico vaya a resolver (a diferencia del reintento de
            # validación de abajo, que sí cambia el prompt entre intentos).
            raise StructuredGenerationError(f"Ningún proveedor de LLM respondió: {e}") from e
        try:
            validated = response_schema.model_validate(result["parsed"])
            return {
                "data": validated.model_dump(),
                "modelo": result["model"],
                "input_tokens": result["input_tokens"],
                "output_tokens": result["output_tokens"],
            }
        except ValidationError as e:
            last_error = str(e)
            logger.warning("generate_structured: validación Pydantic falló (intento %d): %s", attempt + 1, last_error)
            content = (
                f"{user_content}\n\n---\nTu respuesta anterior no cumplió el formato esperado. "
                f"Error de validación: {last_error}\nCorrige y responde de nuevo, solo el JSON."
            )

    raise StructuredGenerationError(f"No se pudo generar una respuesta válida tras 2 intentos: {last_error}")


# ─── OCR de PDFs escaneados — fallback de última instancia (2026-08-24) ───────
# rag_pipeline.py intenta primero pdfplumber (gratis, instantáneo) y luego
# Stirling-PDF (self-hosted, sin límite de cuota) — esta función es el último
# recurso si Stirling-PDF no está disponible, para no dejar un documento
# puntual completamente bloqueado. No pensada para procesar lotes grandes:
# comparte la misma cuota diaria de Gemini que embeddings y chat.

async def transcribe_scanned_pdf(pdf_bytes: bytes, max_attempts: int = 4) -> str:
    """Transcribe un PDF escaneado (sin capa de texto) enviando los bytes
    directamente a Gemini vision. Reintenta con backoff solo ante 503
    (modelo con alta demanda, transitorio) — cualquier otro error se
    propaga de inmediato."""
    model = GEMINI_MODEL_MAP[TaskComplexity.STANDARD]
    prompt = (
        "Transcribe todo el texto de este documento escaneado, tal como aparece, "
        "en español. Solo el texto, sin comentarios tuyos ni resumen — una "
        "transcripción fiel."
    )
    attempt = 0
    while True:
        try:
            response = await _gemini.aio.models.generate_content(
                model=model,
                contents=[
                    genai_types.Part.from_bytes(data=pdf_bytes, mime_type="application/pdf"),
                    prompt,
                ],
                config=genai_types.GenerateContentConfig(temperature=0.0),
            )
            return _extract_gemini_text(response)
        except Exception as e:
            msg = str(e)
            is_unavailable = "503" in msg or "UNAVAILABLE" in msg
            if not is_unavailable or attempt >= max_attempts - 1:
                raise
            attempt += 1
            wait = min(30, 6 * attempt)
            logger.info(
                "transcribe_scanned_pdf: Gemini 503 (alta demanda) — reintento %d/%d en %ds",
                attempt, max_attempts, wait,
            )
            await asyncio.sleep(wait)
