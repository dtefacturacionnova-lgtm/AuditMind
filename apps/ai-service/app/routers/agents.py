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
    "FISCUS", "MINERVA_QAIP", "VULCANO", "CASSANDRA", "THEMIS",
}

# Misma restricción que assistSection() en
# apps/api/src/working-papers/paper-sections.service.ts — un encargo con un
# marco normativo propio NO debe mezclar conocimiento de otro marco (ej. un
# encargo INTERNAL_GOVERNMENTAL regido por NAIG/CCR no debe recibir citas de
# IIA_STANDARDS_2024, aunque ambos sean "auditoría interna" en sentido amplio).
# INTERNAL_GOVERNMENTAL apunta a NAIG_CCR_SV (Decreto No. 7 de la Corte de
# Cuentas de la República, texto completo).
_AUDIT_TYPE_TO_RAG_BASE = {
    "FISCAL": "FISCAL_SV",
    "AML": "AML_SV",
    "INTERNAL": "IIA_STANDARDS_2024",
    "INTERNAL_GOVERNMENTAL": "NAIG_CCR_SV",
    "EXTERNAL_FINANCIAL": "CVPCPA_SV",
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
            audit_type = ctx.get("auditType") or ctx.get("audit_type")
            rag_base = _AUDIT_TYPE_TO_RAG_BASE.get(str(audit_type).upper()) if audit_type else None
            try:
                chunks = await search_knowledge(
                    query=last_user_msg,
                    organization_id=request.organization_id,
                    rag_base=rag_base,
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


class MultiYearRequest(BaseModel):
    audits: list[dict]
    organization_name: Optional[str] = None
    audit_entity_name: Optional[str] = None
    organization_id: Optional[str] = None


@router.post("/multi-year-analysis")
async def multi_year_analysis(
    request: MultiYearRequest,
    x_internal_key: str | None = Header(default=None),
):
    """
    ATLAS — Multi-Year Recurring Audit Intelligence Analysis.
    Analyzes 2–6 years of the same audit to detect recurrence, escalation,
    systemic patterns, and provide planning inputs for the current cycle.
    """
    verify_internal_key(x_internal_key)

    audits = request.audits
    if len(audits) < 2:
        raise HTTPException(status_code=422, detail="Se requieren al menos 2 auditorías para el análisis multi-año.")

    # Build structured data payload for ATLAS
    audits_text = ""
    for i, a in enumerate(audits, 1):
        audits_text += f"\n\n--- AUDITORÍA {i}: {a.get('title', 'Sin título')} ---\n"
        audits_text += f"Período: {a.get('startDate', '?')} – {a.get('endDate', '?')}\n"
        audits_text += f"Tipo: {a.get('type', '?')} | Subtipo: {a.get('subtype', '—')}\n"
        audits_text += f"Estado: {a.get('status', '?')} | Nivel de riesgo: {a.get('riskLevel', '?')}\n"
        audits_text += f"Entidad auditada: {a.get('entityName', '—')}\n"
        audits_text += f"Alcance: {a.get('scope', '—')}\n"

        findings = a.get("findings", [])
        audits_text += f"\nHallazgos ({len(findings)} total):\n"
        for f in findings:
            audits_text += (
                f"  [{f.get('severity','?')}] {f.get('title','Sin título')} "
                f"— Estado final: {f.get('status','?')}\n"
            )
            if f.get("condition"):
                audits_text += f"    Condición: {f['condition'][:300]}\n"
            if f.get("cause"):
                audits_text += f"    Causa: {f['cause'][:200]}\n"
            if f.get("recommendation"):
                audits_text += f"    Recomendación: {f['recommendation'][:300]}\n"

    org_name = request.organization_name or "la organización"
    entity_name = request.audit_entity_name or "la entidad auditada"

    system_prompt = (
        "Eres Atlas, el Agente de Inteligencia Histórica Multi-Año de AuditMind. "
        "Analizas múltiples ciclos de la misma auditoría para generar inteligencia "
        "comparable a la de las grandes firmas (Big 4) en sus análisis de carry-forward. "
        "IMPORTANTE: Responde ÚNICAMENTE con JSON válido, sin texto antes ni después del JSON."
    )

    user_message = f"""Analiza los siguientes {len(audits)} ciclos de auditoría de {entity_name} en {org_name}.

{audits_text}

Genera un análisis profesional completo en el siguiente formato JSON exacto (sin texto fuera del JSON):

{{
  "executiveSummary": "Párrafo ejecutivo de 3-5 oraciones que resume los hallazgos más importantes del análisis histórico",
  "periodCoverage": {{
    "from": "año más antiguo",
    "to": "año más reciente",
    "auditsAnalyzed": {len(audits)},
    "entityName": "{entity_name}"
  }},
  "riskEvolution": {{
    "trend": "improving|stable|deteriorating",
    "trendLabel": "Mejorando|Estable|Deteriorándose",
    "narrative": "Descripción de 2-3 oraciones sobre cómo ha evolucionado el perfil de riesgo",
    "byYear": [
      {{"year": "...", "riskLevel": "...", "findingsCount": 0, "criticalCount": 0, "highCount": 0}}
    ]
  }},
  "findingRecurrence": {{
    "summary": "Descripción del patrón general de recurrencia",
    "recidivismRate": 0.0,
    "recurrentThemes": [
      {{
        "theme": "Nombre del tema o área de debilidad",
        "appearances": 2,
        "years": ["2022", "2023"],
        "severityTrend": "escalating|stable|improving",
        "severityTrendLabel": "Escalando|Estable|Mejorando",
        "wasResolvedAndReturned": true,
        "analysis": "Análisis específico de este hallazgo recurrente y su implicación",
        "urgency": "critical|high|medium"
      }}
    ],
    "resolvedDefinitively": ["Lista de temas que se resolvieron y no volvieron a aparecer"],
    "newInLatestPeriod": ["Hallazgos nuevos que aparecieron por primera vez en el período más reciente"]
  }},
  "escalationAlerts": [
    {{
      "finding": "Título del hallazgo",
      "initialSeverity": "LOW",
      "currentSeverity": "HIGH",
      "yearsEscalating": 2,
      "interpretation": "Qué significa este escalamiento para la organización",
      "immediateAction": "Acción recomendada de alta prioridad"
    }}
  ],
  "systemicPatterns": [
    {{
      "pattern": "Nombre del patrón sistémico",
      "evidence": "Evidencia que sustenta este patrón (basada en hallazgos reales)",
      "rootCause": "Causa raíz probable del patrón",
      "impact": "Impacto organizacional",
      "affectedAreas": ["Área 1", "Área 2"]
    }}
  ],
  "implementationEffectiveness": {{
    "overallRate": 0.0,
    "narrative": "Evaluación general de la efectividad en implementar recomendaciones",
    "wellImplemented": ["Áreas donde se implementaron bien las recomendaciones"],
    "poorlyImplemented": ["Áreas con baja implementación de recomendaciones"]
  }},
  "organizationalContext": {{
    "inferredChanges": "Descripción de cambios organizacionales inferidos de los hallazgos (si hay evidencia)",
    "controlEnvironment": "Evaluación del ambiente de control basada en los hallazgos históricos",
    "maturityAssessment": "Evaluación de la madurez del control interno (escala 1-5 con justificación)"
  }},
  "positiveTrends": [
    "Aspecto positivo 1 — con evidencia específica",
    "Aspecto positivo 2"
  ],
  "planningRecommendations": [
    {{
      "priority": "high|medium|low",
      "area": "Área de enfoque",
      "recommendation": "Recomendación específica para la auditoría en curso",
      "rationale": "Por qué esta área merece atención prioritaria basado en el historial",
      "suggestedProcedure": "Procedimiento de auditoría sugerido"
    }}
  ],
  "managementLetterPoints": [
    {{
      "title": "Punto para la carta a la gerencia",
      "narrative": "Párrafo ejecutivo del punto (2-3 oraciones formales)",
      "category": "control_environment|process_efficiency|risk_management|compliance|it_controls|other"
    }}
  ],
  "conclusion": "Conclusión profesional de 2-3 párrafos con la valoración global del historial auditado y las perspectivas para el ciclo entrante"
}}"""

    result = await chat_with_agent(
        agent_type="ATLAS",
        system_prompt=system_prompt,
        messages=[{"role": "user", "content": user_message}],
        max_tokens=8192,
    )

    # Parse JSON from response
    import json
    import re
    content = result["content"].strip()
    # Extract JSON if wrapped in code block
    match = re.search(r"```(?:json)?\s*([\s\S]+?)\s*```", content)
    if match:
        content = match.group(1).strip()

    try:
        report = json.loads(content)
    except json.JSONDecodeError:
        # Return raw content as fallback
        report = {"rawContent": content, "parseError": True}

    import datetime
    return {
        "report": report,
        "model": result["model"],
        "auditsAnalyzed": len(audits),
        "generatedAt": datetime.datetime.utcnow().isoformat() + "Z",
    }


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
        {"id": "ATLAS",        "name": "Atlas",          "phase": "Fase 6", "specialty": "Inteligencia Multi-Año"},
        {"id": "FENIX",        "name": "Fénix",          "phase": "Fase 5", "specialty": "BCP/DRP"},
        {"id": "FISCUS",       "name": "Fiscus",        "phase": "Fase 3", "specialty": "Auditoría Fiscal (NACOT)"},
        {"id": "THEMIS",       "name": "Themis",         "phase": "Fase 3", "specialty": "Prevención de Lavado de Dinero (PLD/FT)"},
        {"id": "SHERLOCK",     "name": "Sherlock",       "phase": "MVP",    "specialty": "Investigación Forense"},
        {"id": "MINERVA_QAIP", "name": "Minerva-QAIP",  "phase": "Fase 5", "specialty": "QAIP y Calidad"},
    ]
    return {"agents": agents, "total": len(agents)}
