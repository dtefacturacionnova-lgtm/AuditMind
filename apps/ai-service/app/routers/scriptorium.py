"""
Scriptorium router — Fase 3 AI endpoints para papeles de trabajo y hallazgos.

Endpoints:
  POST /scriptorium/improve-finding   — reescribe un hallazgo en lenguaje profesional
  POST /scriptorium/generate-finding  — genera hallazgo C-C-C-E-R-R desde descripción breve
  POST /scriptorium/audit-program     — genera programa de auditoría con procedimientos NIA
  POST /scriptorium/working-paper     — genera borrador de papel de trabajo
"""
import json
from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel
from typing import Optional

from app.config import settings
from app.services.llm_router import chat_with_agent, TaskComplexity
from app.services.agent_prompts import get_agent_system_prompt

router = APIRouter()


def verify_internal_key(x_internal_key: str | None) -> None:
    if not x_internal_key or x_internal_key != settings.INTERNAL_API_KEY:
        raise HTTPException(status_code=401, detail="Clave interna inválida")


# ─── Models ───────────────────────────────────────────────────────────────────

class FindingData(BaseModel):
    title: str
    condition: Optional[str] = None
    criteria: Optional[str] = None
    cause: Optional[str] = None
    effect: Optional[str] = None
    risk: Optional[str] = None
    recommendation: Optional[str] = None
    severity: Optional[str] = None
    auditType: Optional[str] = None
    auditTitle: Optional[str] = None


class ImproveFindingRequest(BaseModel):
    finding: FindingData


class GenerateFindingRequest(BaseModel):
    description: str               # Descripción breve del problema observado
    auditTitle: Optional[str] = None
    auditType: Optional[str] = None
    severity: Optional[str] = None


class AuditProgramRequest(BaseModel):
    auditTitle: str
    auditType: str                 # FINANCIAL | OPERATIONAL | IT | COMPLIANCE | ESG | etc.
    scope: Optional[str] = None
    objectives: Optional[str] = None
    entityDescription: Optional[str] = None
    riskLevel: Optional[str] = None  # LOW | MODERATE | HIGH | VERY_HIGH


class WorkingPaperRequest(BaseModel):
    paperType: str                 # PLANNING_UNDERSTANDING | CONTROL_EVALUATION | etc.
    auditTitle: str
    auditType: Optional[str] = None
    scope: Optional[str] = None
    context: Optional[str] = None


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _finding_to_text(f: FindingData) -> str:
    parts = [f"Título: {f.title}"]
    if f.severity:
        parts.append(f"Severidad: {f.severity}")
    if f.auditTitle:
        parts.append(f"Auditoría: {f.auditTitle} ({f.auditType or ''})")
    if f.condition:
        parts.append(f"\nCONDICIÓN:\n{f.condition}")
    if f.criteria:
        parts.append(f"\nCRITERIO:\n{f.criteria}")
    if f.cause:
        parts.append(f"\nCAUSA:\n{f.cause}")
    if f.effect:
        parts.append(f"\nEFECTO:\n{f.effect}")
    if f.risk:
        parts.append(f"\nRIESGO:\n{f.risk}")
    if f.recommendation:
        parts.append(f"\nRECOMENDACIÓN:\n{f.recommendation}")
    return "\n".join(parts)


def _parse_json_response(text: str, default: dict) -> dict:
    """Try to extract JSON from LLM response, return default on failure."""
    try:
        # Look for JSON block in response
        if "```json" in text:
            start = text.index("```json") + 7
            end = text.index("```", start)
            return json.loads(text[start:end].strip())
        elif "```" in text:
            start = text.index("```") + 3
            end = text.index("```", start)
            return json.loads(text[start:end].strip())
        elif text.strip().startswith("{"):
            return json.loads(text.strip())
        # Try to find JSON object in text
        brace_start = text.find("{")
        brace_end = text.rfind("}")
        if brace_start != -1 and brace_end != -1:
            return json.loads(text[brace_start:brace_end + 1])
    except (json.JSONDecodeError, ValueError):
        pass
    return default


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/improve-finding")
async def improve_finding(
    request: ImproveFindingRequest,
    x_internal_key: str | None = Header(default=None),
):
    """
    Recibe un hallazgo en borrador y devuelve una versión mejorada.
    Scriptorium reescribe cada campo con lenguaje profesional de auditoría,
    manteniendo los hechos del auditor intactos.
    """
    verify_internal_key(x_internal_key)

    finding_text = _finding_to_text(request.finding)

    system_prompt = get_agent_system_prompt("SCRIPTORIUM", {
        "task": "improve_finding",
        "audit_title": request.finding.auditTitle or "",
        "audit_type": request.finding.auditType or "",
    })

    user_message = f"""Mejora el siguiente hallazgo de auditoría. Mantén TODOS los hechos exactamente \
como están — solo mejora la redacción, precisión técnica, estructura lógica y referencias normativas.

{finding_text}

Responde ÚNICAMENTE con un objeto JSON con esta estructura exacta:
{{
  "title": "título mejorado",
  "condition": "condición mejorada",
  "criteria": "criterio mejorado con cita normativa específica",
  "cause": "causa mejorada",
  "effect": "efecto mejorado con impacto cuantificado si es posible",
  "risk": "riesgo mejorado",
  "recommendation": "recomendación mejorada — específica, accionable, con plazos sugeridos",
  "improvements_summary": ["mejora 1 en 10 palabras", "mejora 2", "mejora 3"]
}}"""

    result = await chat_with_agent(
        agent_type="SCRIPTORIUM",
        system_prompt=system_prompt,
        messages=[{"role": "user", "content": user_message}],
        max_tokens=3000,
        override_complexity=TaskComplexity.STANDARD,
    )

    parsed = _parse_json_response(result["content"], {})
    if not parsed:
        raise HTTPException(status_code=502, detail="No se pudo parsear la respuesta del agente")

    return {
        "improved": parsed,
        "original": {
            "title":          request.finding.title,
            "condition":      request.finding.condition,
            "criteria":       request.finding.criteria,
            "cause":          request.finding.cause,
            "effect":         request.finding.effect,
            "risk":           request.finding.risk,
            "recommendation": request.finding.recommendation,
        },
        "model": result["model"],
        "tokens_used": result["input_tokens"] + result["output_tokens"],
    }


@router.post("/generate-finding")
async def generate_finding(
    request: GenerateFindingRequest,
    x_internal_key: str | None = Header(default=None),
):
    """
    Genera un hallazgo completo con estructura C-C-C-E-R-R desde una descripción breve.
    """
    verify_internal_key(x_internal_key)

    system_prompt = get_agent_system_prompt("SCRIPTORIUM", {
        "task": "generate_finding",
        "audit_title": request.auditTitle or "",
        "audit_type": request.auditType or "",
    })

    user_message = f"""Genera un hallazgo de auditoría completo y profesional basado en esta observación:

OBSERVACIÓN: {request.description}
AUDITORÍA: {request.auditTitle or 'No especificada'} ({request.auditType or ''})
SEVERIDAD SUGERIDA: {request.severity or 'Por determinar'}

Crea un hallazgo completo con estructura C-C-C-E-R-R. Responde SOLO con JSON:
{{
  "title": "título conciso del hallazgo (máx. 80 caracteres)",
  "condition": "descripción factual de lo que se encontró (2-4 oraciones técnicas)",
  "criteria": "norma, política o estándar que se incumple — cita específica",
  "cause": "causa raíz identificada (no síntoma)",
  "effect": "consecuencia real o potencial para la organización — cuantifica si puedes",
  "risk": "categoría y descripción del riesgo asociado",
  "recommendation": "acciones correctivas específicas, medibles, con plazos sugeridos",
  "suggestedSeverity": "CRITICAL | HIGH | MEDIUM | LOW",
  "severityJustification": "razón de la severidad sugerida en 1-2 oraciones"
}}"""

    result = await chat_with_agent(
        agent_type="SCRIPTORIUM",
        system_prompt=system_prompt,
        messages=[{"role": "user", "content": user_message}],
        max_tokens=2500,
        override_complexity=TaskComplexity.STANDARD,
    )

    parsed = _parse_json_response(result["content"], {})
    if not parsed:
        raise HTTPException(status_code=502, detail="No se pudo generar el hallazgo")

    return {
        "generated": parsed,
        "model": result["model"],
        "tokens_used": result["input_tokens"] + result["output_tokens"],
    }


@router.post("/audit-program")
async def generate_audit_program(
    request: AuditProgramRequest,
    x_internal_key: str | None = Header(default=None),
):
    """
    Genera un programa de auditoría con procedimientos NIA y marcas de trabajo.
    """
    verify_internal_key(x_internal_key)

    system_prompt = get_agent_system_prompt("SCRIPTORIUM", {
        "task": "audit_program",
        "audit_type": request.auditType,
    })

    user_message = f"""Genera un programa de auditoría completo y profesional para:

AUDITORÍA: {request.auditTitle}
TIPO: {request.auditType}
ALCANCE: {request.scope or 'No especificado'}
OBJETIVOS: {request.objectives or 'No especificados'}
ENTIDAD: {request.entityDescription or 'No especificada'}
NIVEL DE RIESGO: {request.riskLevel or 'MODERATE'}

Genera el programa con procedimientos específicos y accionables. Responde SOLO con JSON:
{{
  "title": "Programa de Auditoría — {request.auditTitle}",
  "objective": "objetivo general del programa en 2-3 oraciones",
  "steps": [
    {{
      "section": "A — Planificación y Comprensión del Negocio",
      "procedures": [
        {{
          "ref": "A-01",
          "description": "procedimiento específico",
          "technique": "Entrevista / Inspección / Observación / Recálculo / Confirmación",
          "sample": "Muestra sugerida o alcance (ej: 100%)",
          "tickMark": "VERIFIED",
          "niaRef": "NIA 315"
        }}
      ]
    }},
    {{
      "section": "B — Evaluación de Controles Internos",
      "procedures": [...]
    }},
    {{
      "section": "C — Pruebas Sustantivas",
      "procedures": [...]
    }}
  ],
  "totalProcedures": 15,
  "estimatedHours": 40,
  "riskFocus": ["riesgo 1", "riesgo 2", "riesgo 3"]
}}

Incluye al menos 5 procedimientos por sección."""

    result = await chat_with_agent(
        agent_type="SCRIPTORIUM",
        system_prompt=system_prompt,
        messages=[{"role": "user", "content": user_message}],
        max_tokens=4096,
        override_complexity=TaskComplexity.COMPLEX,
    )

    parsed = _parse_json_response(result["content"], {})
    if not parsed:
        raise HTTPException(status_code=502, detail="No se pudo generar el programa")

    return {
        "program": parsed,
        "model": result["model"],
        "tokens_used": result["input_tokens"] + result["output_tokens"],
    }


@router.post("/working-paper")
async def generate_working_paper(
    request: WorkingPaperRequest,
    x_internal_key: str | None = Header(default=None),
):
    """
    Genera el borrador inicial de un papel de trabajo según su tipo.
    """
    verify_internal_key(x_internal_key)

    paper_type_labels = {
        "PLANNING_UNDERSTANDING":  "Planificación y Comprensión (PT-PL)",
        "CONTROL_EVALUATION":      "Evaluación de Controles (PT-EC)",
        "SUBSTANTIVE_TEST":        "Prueba Sustantiva (PT-PS)",
        "DATA_ANALYSIS":           "Análisis de Datos (PT-AD)",
        "FINDING":                 "Papel de Hallazgo (PT-HF)",
        "CLOSURE_CONCLUSION":      "Cierre y Conclusión (PT-CC)",
        "NORMATIVE_ANALYSIS":      "Análisis Normativo",
    }

    paper_label = paper_type_labels.get(request.paperType, request.paperType)
    system_prompt = get_agent_system_prompt("SCRIPTORIUM", {
        "task": "working_paper",
        "paper_type": request.paperType,
        "audit_title": request.auditTitle,
    })

    user_message = f"""Genera el borrador de un papel de trabajo tipo {paper_label}:

AUDITORÍA: {request.auditTitle}
TIPO DE AUDITORÍA: {request.auditType or 'No especificado'}
ALCANCE: {request.scope or 'No especificado'}
CONTEXTO ADICIONAL: {request.context or 'Ninguno'}

Responde SOLO con JSON:
{{
  "objective": "objetivo específico del papel de trabajo",
  "scope": "alcance detallado (qué incluye y excluye)",
  "procedures": [
    {{
      "step": 1,
      "description": "procedimiento a ejecutar",
      "technique": "técnica de auditoría",
      "expectedEvidence": "evidencia a obtener",
      "tickMark": "VERIFIED"
    }}
  ],
  "conclusion": "plantilla de conclusión (dejar espacios para completar con hallazgos)",
  "reviewNotes": "notas para el revisor",
  "niaReferences": ["NIA 315", "NIA 330"]
}}"""

    result = await chat_with_agent(
        agent_type="SCRIPTORIUM",
        system_prompt=system_prompt,
        messages=[{"role": "user", "content": user_message}],
        max_tokens=2500,
        override_complexity=TaskComplexity.STANDARD,
    )

    parsed = _parse_json_response(result["content"], {})
    if not parsed:
        raise HTTPException(status_code=502, detail="No se pudo generar el papel de trabajo")

    return {
        "draft": parsed,
        "paperType": request.paperType,
        "model": result["model"],
        "tokens_used": result["input_tokens"] + result["output_tokens"],
    }
