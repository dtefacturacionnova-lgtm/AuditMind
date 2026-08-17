"""
LLM Router — Dual provider: Gemini (primary/free) + Claude (fallback/premium).

Provider routing:
  DEFAULT  → gemini-2.5-flash   (free tier, AI Studio key)
  FALLBACK → claude-sonnet-4-5  (when Anthropic credits available)

To switch to Claude as primary, change DEFAULT_PROVIDER to LLMProvider.CLAUDE.
"""
import asyncio
import logging
from enum import Enum

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
    GEMINI = "gemini"
    CLAUDE = "claude"


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
    "LEX":          TaskComplexity.STANDARD,
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

# ─── Default provider (change to CLAUDE when credits are available) ───────────
DEFAULT_PROVIDER = LLMProvider.GEMINI

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


# ─── Public interface ─────────────────────────────────────────────────────────

def get_model_for_agent(
    agent_type: str,
    override_complexity: TaskComplexity | None = None,
    provider: LLMProvider = DEFAULT_PROVIDER,
) -> tuple[str, LLMProvider]:
    complexity = override_complexity or TASK_COMPLEXITY_MAP.get(
        agent_type.upper(), TaskComplexity.STANDARD
    )
    if provider == LLMProvider.GEMINI:
        return GEMINI_MODEL_MAP[complexity], LLMProvider.GEMINI
    return CLAUDE_MODEL_MAP[complexity], LLMProvider.CLAUDE


async def chat_with_agent(
    agent_type: str,
    system_prompt: str,
    messages: list[dict],
    max_tokens: int = 4096,
    override_complexity: TaskComplexity | None = None,
    provider: LLMProvider | None = None,
) -> dict:
    use_provider = provider or DEFAULT_PROVIDER
    model, resolved_provider = get_model_for_agent(
        agent_type, override_complexity, use_provider
    )

    if resolved_provider == LLMProvider.GEMINI:
        try:
            return await _chat_gemini(model, system_prompt, messages, max_tokens)
        except Exception as gemini_err:
            logger.warning(
                "Gemini failed (%s), retrying with Claude fallback", gemini_err
            )
            # Fallback to Claude
            claude_model, _ = get_model_for_agent(
                agent_type, override_complexity, LLMProvider.CLAUDE
            )
            return await _chat_claude(claude_model, system_prompt, messages, max_tokens)

    return await _chat_claude(model, system_prompt, messages, max_tokens)


# ─── Salida estructurada (EVD-05) ──────────────────────────────────────────────
# Función nueva, no un parámetro más de chat_with_agent: la extracción es tarea
# determinista (temperature baja fija), no conversacional (temperature=0.7 fijo
# de _chat_gemini), y necesita validación Pydantic + reintento — nada de eso
# aplica al resto de los usos de chat_with_agent.

class StructuredGenerationError(Exception):
    """El LLM no devolvió una respuesta que valide contra el schema pedido,
    ni siquiera tras el reintento con el error de validación anexado."""


async def _generate_structured_once(
    agent_type: str,
    system_prompt: str,
    user_content: str,
    response_schema: type[BaseModel],
    max_tokens: int,
    temperature: float,
) -> dict:
    model, _ = get_model_for_agent(agent_type, TaskComplexity.STANDARD, LLMProvider.GEMINI)
    try:
        response = await _gemini.aio.models.generate_content(
            model=model,
            contents=[{"role": "user", "parts": [{"text": user_content}]}],
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
    except Exception as gemini_err:
        logger.warning("generate_structured: Gemini falló (%s) — fallback a Claude", gemini_err)
        claude_model, _ = get_model_for_agent(agent_type, TaskComplexity.STANDARD, LLMProvider.CLAUDE)
        instruction = (
            system_prompt
            + "\n\nResponde ÚNICAMENTE con un objeto JSON válido, sin texto adicional ni bloques markdown."
        )
        response = await _anthropic.messages.create(
            model=claude_model,
            max_tokens=max_tokens,
            temperature=temperature,
            system=instruction,
            messages=[{"role": "user", "content": user_content}],
        )
        return {
            "parsed": parse_json_response(response.content[0].text, {}),
            "model": claude_model,
            "input_tokens": response.usage.input_tokens,
            "output_tokens": response.usage.output_tokens,
        }


async def generate_structured(
    agent_type: str,
    system_prompt: str,
    user_content: str,
    response_schema: type[BaseModel],
    max_tokens: int = 8192,
    temperature: float = 0.1,
) -> dict:
    """Genera una respuesta JSON validada contra un schema Pydantic.

    Gemini primero (JSON mode); si falla, cae a Claude con instrucción JSON
    explícita — mismo patrón de fallback que chat_with_agent, reutilizado, no
    reinventado. El texto de cualquiera de los dos proveedores se parsea con
    el mismo parser compartido (json_utils.parse_json_response) y se valida
    con Pydantic. Si no valida, UN reintento con el error de validación
    anexado al prompt; si vuelve a fallar, error — nunca se devuelve un
    resultado sin validar.
    """
    last_error: str | None = None
    content = user_content

    for attempt in range(2):
        result = await _generate_structured_once(agent_type, system_prompt, content, response_schema, max_tokens, temperature)
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
