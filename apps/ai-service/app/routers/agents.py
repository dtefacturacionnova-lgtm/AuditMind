"""Agents router — handles AI agent conversations with optional RAG context."""
from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel
from typing import Optional

from app.config import settings
from app.services.llm_router import chat_with_agent, TaskComplexity
from app.services.agent_prompts import get_agent_system_prompt
from app.services.rag_pipeline import search_knowledge, format_rag_context

router = APIRouter()

# Agents that benefit from normative RAG context
_RAG_ENABLED_AGENTS = {
    "MINERVA", "SCRIPTORIUM", "ARGUS", "CICERO",
    "LEX", "MINERVA_QAIP", "VULCANO", "CASSANDRA",
}


def verify_internal_key(x_internal_key: str | None) -> None:
    """Verify that the request comes from our NestJS API (internal service call)."""
    if not x_internal_key or x_internal_key != settings.INTERNAL_API_KEY:
        raise HTTPException(status_code=401, detail="Clave interna inválida")


class ChatRequest(BaseModel):
    agent_type: str
    messages: list[dict]
    context: Optional[dict] = None
    rag_context: Optional[str] = None       # Pre-built RAG context (if caller provides it)
    override_complexity: Optional[str] = None
    audit_id: Optional[str] = None
    organization_id: Optional[str] = None   # Used for org-specific + global RAG search
    use_rag: bool = True                     # Set False to skip RAG lookup
    max_tokens: int = 4096


class ChatResponse(BaseModel):
    content: str
    model: str
    input_tokens: int
    output_tokens: int
    agent_type: str


@router.post("/chat", response_model=ChatResponse)
async def chat(
    request: ChatRequest,
    x_internal_key: str | None = Header(default=None),
):
    verify_internal_key(x_internal_key)

    ctx = request.context or {}

    # ── RAG context injection ─────────────────────────────────────────────────
    rag_text = request.rag_context or ""

    if (
        not rag_text
        and request.use_rag
        and request.agent_type.upper() in _RAG_ENABLED_AGENTS
        and request.messages
    ):
        # Extract the last user message as the RAG query
        last_user_msg = ""
        for msg in reversed(request.messages):
            if msg.get("role") == "user":
                last_user_msg = str(msg.get("content", ""))
                break

        if last_user_msg and len(last_user_msg) > 10:
            try:
                chunks = await search_knowledge(
                    query=last_user_msg,
                    organization_id=request.organization_id,
                    top_k=5,
                    threshold=0.65,
                )
                if chunks:
                    rag_text = format_rag_context(chunks)
                    print(f"[RAG] {len(chunks)} chunks injected for agent {request.agent_type}")
            except Exception as e:
                # RAG failure is non-fatal — continue without context
                print(f"[RAG] Skipping RAG search: {e}")

    if rag_text:
        ctx["rag_context"] = rag_text

    # ── Build system prompt and call LLM ─────────────────────────────────────
    system_prompt = get_agent_system_prompt(request.agent_type, ctx)

    override = None
    if request.override_complexity:
        try:
            override = TaskComplexity(request.override_complexity)
        except ValueError:
            pass

    result = await chat_with_agent(
        agent_type=request.agent_type,
        system_prompt=system_prompt,
        messages=request.messages,
        max_tokens=request.max_tokens,
        override_complexity=override,
    )

    return ChatResponse(
        content=result["content"],
        model=result["model"],
        input_tokens=result["input_tokens"],
        output_tokens=result["output_tokens"],
        agent_type=request.agent_type,
    )


@router.get("/list")
async def list_agents():
    """Returns metadata about all available AI agents."""
    agents = [
        {"id": "MINERVA",      "name": "Minerva",       "phase": "MVP",    "specialty": "Planificación y Riesgos"},
        {"id": "SCRIPTORIUM",  "name": "Scriptorium",   "phase": "MVP",    "specialty": "Documentación y Papeles de Trabajo"},
        {"id": "ARGUS",        "name": "Argus",          "phase": "MVP",    "specialty": "Evaluación de Controles"},
        {"id": "HERMES",       "name": "Hermes",         "phase": "MVP",    "specialty": "Comunicaciones PBC"},
        {"id": "CICERO",       "name": "Cicero",         "phase": "MVP",    "specialty": "Reportería e Informes"},
        {"id": "SOCRATES",     "name": "Sócrates",       "phase": "Fase 2", "specialty": "Análisis de Datos"},
        {"id": "CASSANDRA",    "name": "Cassandra",      "phase": "Fase 2", "specialty": "Predicción de Riesgos"},
        {"id": "VULCANO",      "name": "Vulcano",        "phase": "MVP",    "specialty": "Auditoría de TI"},
        {"id": "SENADO",       "name": "Senado",         "phase": "Fase 5", "specialty": "Comité de Auditoría"},
        {"id": "ATLAS",        "name": "Atlas",          "phase": "Fase 6", "specialty": "ESG y Sostenibilidad"},
        {"id": "FENIX",        "name": "Fénix",          "phase": "Fase 5", "specialty": "BCP/DRP"},
        {"id": "LEX",          "name": "Lex",            "phase": "Fase 3", "specialty": "Compliance y Regulatorio"},
        {"id": "SHERLOCK",     "name": "Sherlock",       "phase": "MVP",    "specialty": "Investigación Forense"},
        {"id": "MINERVA_QAIP", "name": "Minerva-QAIP",  "phase": "Fase 5", "specialty": "QAIP y Calidad"},
    ]
    return {"agents": agents, "total": len(agents)}
