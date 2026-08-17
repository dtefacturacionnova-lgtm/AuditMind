"""
Scriptorium router — Fase 3 AI endpoints para papeles de trabajo y hallazgos.

Endpoints:
  POST /scriptorium/improve-finding   — reescribe un hallazgo en lenguaje profesional
  POST /scriptorium/generate-finding  — genera hallazgo C-C-C-E-R-R desde descripción breve
  POST /scriptorium/audit-program     — genera programa de auditoría con procedimientos NIA
  POST /scriptorium/working-paper     — genera borrador de papel de trabajo
"""
from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel
from typing import Optional

from app.config import settings
from app.services.llm_router import chat_with_agent, TaskComplexity
from app.services.agent_prompts import get_agent_system_prompt
from app.services.json_utils import parse_json_response as _parse_json_response

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


class ImproveTextRequest(BaseModel):
    text: str
    fieldType: Optional[str] = None     # 'title' | 'statement' | 'development'
    paperTitle: Optional[str] = None
    paperType: Optional[str] = None


class DraftProcedureRequest(BaseModel):
    title: Optional[str] = None
    statement: Optional[str] = None
    paperTitle: Optional[str] = None
    paperType: Optional[str] = None
    paperCode: Optional[str] = None
    auditType: Optional[str] = None


class CosoAssessRequest(BaseModel):
    auditTitle: str
    auditType: Optional[str] = None
    scope: Optional[str] = None
    entityContext: Optional[str] = None     # PT-A1 entendimiento del negocio
    riskAssessment: Optional[str] = None    # PT-A2 evaluación de riesgo inherente
    controlEvaluation: Optional[str] = None # PT-A3 evaluación de controles existente
    currentCosoNotes: Optional[str] = None  # contenido actual del A-06 si existe
    findingsSummary: Optional[str] = None   # resumen de hallazgos previos relevantes


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


# ─── PI.7c — COSO 2013 Auto-Assessment ────────────────────────────────────────

COSO_COMPONENTS = [
    {"key": "CE", "name": "Ambiente de Control", "principles": [1, 2, 3, 4, 5]},
    {"key": "RA", "name": "Evaluación de Riesgos", "principles": [6, 7, 8, 9]},
    {"key": "CA", "name": "Actividades de Control", "principles": [10, 11, 12]},
    {"key": "IC", "name": "Información y Comunicación", "principles": [13, 14, 15]},
    {"key": "MA", "name": "Actividades de Monitoreo", "principles": [16, 17]},
]

COSO_PRINCIPLES = {
    1:  ("CE", "La organización demuestra compromiso con la integridad y los valores éticos"),
    2:  ("CE", "El directorio demuestra independencia de la administración y ejerce supervisión del desarrollo y desempeño del control interno"),
    3:  ("CE", "La administración establece, con la supervisión del directorio, estructuras, líneas de reporte y niveles apropiados de autoridad y responsabilidad"),
    4:  ("CE", "La organización demuestra compromiso para atraer, desarrollar y retener individuos competentes alineados a sus objetivos"),
    5:  ("CE", "La organización hace responsables a los individuos por sus responsabilidades de control interno en la consecución de los objetivos"),
    6:  ("RA", "La organización especifica objetivos con suficiente claridad para permitir la identificación y evaluación de riesgos relacionados"),
    7:  ("RA", "La organización identifica los riesgos para la consecución de objetivos a través de toda la entidad y analiza dichos riesgos"),
    8:  ("RA", "La organización considera la posibilidad de fraude en la evaluación de riesgos para la consecución de los objetivos"),
    9:  ("RA", "La organización identifica y evalúa los cambios que podrían impactar significativamente al sistema de control interno"),
    10: ("CA", "La organización selecciona y desarrolla actividades de control que contribuyen a la mitigación de riesgos a niveles aceptables"),
    11: ("CA", "La organización selecciona y desarrolla actividades generales de control sobre la tecnología para soportar la consecución de objetivos"),
    12: ("CA", "La organización despliega actividades de control a través de políticas que establecen lo esperado y procedimientos que ponen las políticas en acción"),
    13: ("IC", "La organización obtiene o genera y utiliza información relevante y de calidad para soportar el funcionamiento del control interno"),
    14: ("IC", "La organización comunica internamente la información, incluyendo objetivos y responsabilidades de control interno, necesaria para soportar el funcionamiento del control interno"),
    15: ("IC", "La organización se comunica con grupos de interés externos en relación a asuntos que afectan el funcionamiento del control interno"),
    16: ("MA", "La organización selecciona, desarrolla y realiza evaluaciones continuas y/o independientes para determinar si los componentes del control interno están presentes y funcionando"),
    17: ("MA", "La organización evalúa y comunica las deficiencias del control interno de forma oportuna a los responsables de tomar acciones correctivas, incluyendo la alta gerencia y el directorio según corresponda"),
}


@router.post("/coso-assess")
async def coso_assess(
    request: CosoAssessRequest,
    x_internal_key: str | None = Header(default=None),
):
    """
    PI.7c — Evaluación COSO 2013 asistida por IA.

    Lee el contexto del expediente (entendimiento, riesgos, controles, hallazgos)
    y propone una valoración por cada uno de los 5 componentes y los 17 principios COSO.
    El auditor revisa y aprueba en el papel A-06.
    """
    verify_internal_key(x_internal_key)

    # Build principles reference for the prompt
    principles_ref = "\n".join([
        f"  {pid}. [{comp}] {desc}"
        for pid, (comp, desc) in COSO_PRINCIPLES.items()
    ])

    system_prompt = """Eres MINERVA, auditor experto en Control Interno y COSO 2013.
Tu tarea es evaluar la efectividad del Sistema de Control Interno de una entidad,
basándote ESTRICTAMENTE en la evidencia provista del expediente de auditoría.

REGLAS CRÍTICAS:
- NO inventes hechos. Si la evidencia es insuficiente para evaluar un principio, dilo explícitamente.
- Las valoraciones deben ser TRAZABLES a fragmentos específicos de los papeles fuente.
- Usa lenguaje técnico-formal de auditoría (NIA/IAASB).
- Cita las fuentes con notación [PT-A1], [PT-A2], [PT-A3], [Hallazgos] cuando corresponda.
- Para cada principio, evalúa SOLO si hay evidencia. Si no la hay, marca "INSUFFICIENT_EVIDENCE".
- El score global debe ser conservador — refleja debilidades identificadas.
"""

    user_message = f"""EVALUACIÓN COSO 2013 — Auto-assessment

AUDITORÍA: {request.auditTitle}
TIPO: {request.auditType or 'No especificado'}
ALCANCE: {request.scope or 'No especificado'}

═══════════════ EVIDENCIA DEL EXPEDIENTE ═══════════════

[PT-A1] Entendimiento de la entidad y entorno:
{request.entityContext or '(No disponible — el auditor aún no ha completado PT-A1)'}

[PT-A2] Evaluación de riesgo inherente:
{request.riskAssessment or '(No disponible)'}

[PT-A3] Evaluación de controles existente:
{request.controlEvaluation or '(No disponible)'}

[A-06] Notas actuales del auditor sobre COSO:
{request.currentCosoNotes or '(El papel A-06 está en blanco)'}

[Hallazgos previos relevantes]:
{request.findingsSummary or '(Sin hallazgos previos disponibles)'}

═══════════════ MARCO COSO 2013 — 5 COMPONENTES, 17 PRINCIPIOS ═══════════════

{principles_ref}

═══════════════ FORMATO DE SALIDA ═══════════════

Responde EXCLUSIVAMENTE con un JSON con esta estructura exacta:

{{
  "overallScore": 0-100,
  "overallMaturity": "INEFFECTIVE" | "WITH_DEFICIENCIES" | "EFFECTIVE",
  "executiveSummary": "2-3 párrafos formales de la conclusión global de COSO con citas [PT-A1][PT-A2][PT-A3]",
  "components": [
    {{
      "key": "CE",
      "name": "Ambiente de Control",
      "maturity": "INEFFECTIVE" | "WITH_DEFICIENCIES" | "EFFECTIVE" | "INSUFFICIENT_EVIDENCE",
      "score": 0-100,
      "narrative": "2 párrafos justificando la valoración con citas a fuentes",
      "evidence": ["fragmento citado de un papel fuente", "..."],
      "deficiencies": ["debilidad concreta identificada con cita", "..."],
      "recommendations": ["procedimiento adicional recomendado", "..."]
    }},
    ... (los 5 componentes: CE, RA, CA, IC, MA)
  ],
  "principles": [
    {{
      "id": 1,
      "componentKey": "CE",
      "status": "EFFECTIVE" | "WITH_DEFICIENCIES" | "INEFFECTIVE" | "INSUFFICIENT_EVIDENCE",
      "justification": "1-2 oraciones con cita a fuente",
      "evidenceRef": "PT-A1 / PT-A2 / PT-A3 / Hallazgo / N/A"
    }},
    ... (los 17 principios)
  ],
  "nextSteps": ["procedimientos de auditoría sugeridos para completar la evaluación", "..."]
}}

IMPORTANTE: solo el JSON, sin texto fuera del objeto. Sin markdown.
"""

    result = await chat_with_agent(
        agent_type="MINERVA",
        system_prompt=system_prompt,
        messages=[{"role": "user", "content": user_message}],
        max_tokens=6000,
        override_complexity=TaskComplexity.COMPLEX,
    )

    parsed = _parse_json_response(result["content"], {})
    if not parsed or "components" not in parsed:
        raise HTTPException(status_code=502, detail="No se pudo generar la evaluación COSO")

    return {
        "assessment": parsed,
        "model": result["model"],
        "tokens_used": result["input_tokens"] + result["output_tokens"],
    }


# ─── Procedimientos enriquecidos — mejorar redacción + generar desarrollo ──────

@router.post("/improve-procedure-text")
async def improve_procedure_text(
    request: ImproveTextRequest,
    x_internal_key: str | None = Header(default=None),
):
    """
    Mejora la redacción de un texto de procedimiento (título, enunciado o desarrollo)
    con lenguaje técnico-profesional de auditoría, manteniendo el sentido original.
    """
    verify_internal_key(x_internal_key)

    if not request.text or not request.text.strip():
        raise HTTPException(status_code=400, detail="El texto a mejorar está vacío")

    field_guidance = {
        "title":       "Es un TÍTULO corto de procedimiento (máx 8 palabras, sin punto final).",
        "statement":   "Es el ENUNCIADO del procedimiento: qué se va a ejecutar. Usa verbos de acción (verificar, recalcular, confirmar, indagar). 1-2 oraciones claras.",
        "development": "Es el DESARROLLO/EJECUCIÓN del procedimiento: cómo se ejecutó y qué se obtuvo. Lenguaje formal de papel de trabajo, en pasado.",
    }
    guidance = field_guidance.get(request.fieldType or "", "Mejora la redacción profesional.")

    system_prompt = (
        "Eres SCRIPTORIUM, redactor experto de papeles de trabajo de auditoría. "
        "Mejoras la redacción manteniendo SIEMPRE el sentido y los hechos originales. "
        "No inventas datos. Respondes solo con el texto mejorado, sin comillas ni explicaciones."
    )

    context = ""
    if request.paperTitle or request.paperType:
        context = f"\nContexto del papel: {request.paperTitle or ''} ({request.paperType or ''})."

    user_message = (
        f"Mejora la redacción del siguiente texto.\n{guidance}{context}\n\n"
        f"TEXTO ORIGINAL:\n{request.text}\n\n"
        f"Responde SOLO con el texto mejorado."
    )

    result = await chat_with_agent(
        agent_type="SCRIPTORIUM",
        system_prompt=system_prompt,
        messages=[{"role": "user", "content": user_message}],
        max_tokens=1200,
        override_complexity=TaskComplexity.STANDARD,
    )

    improved = (result["content"] or "").strip().strip('"')
    return {
        "improved": improved,
        "original": request.text,
        "model": result["model"],
        "tokens_used": result["input_tokens"] + result["output_tokens"],
    }


@router.post("/draft-procedure")
async def draft_procedure(
    request: DraftProcedureRequest,
    x_internal_key: str | None = Header(default=None),
):
    """
    Genera el DESARROLLO de un procedimiento a partir del título + enunciado,
    contextualizado al papel de trabajo donde se ubica.
    """
    verify_internal_key(x_internal_key)

    if not (request.title or request.statement):
        raise HTTPException(status_code=400, detail="Se requiere al menos título o enunciado")

    system_prompt = (
        "Eres SCRIPTORIUM, auditor experto que redacta el desarrollo de procedimientos "
        "de auditoría en papeles de trabajo. Redactas el desarrollo de forma profesional, "
        "específica y ejecutable, siguiendo NIA. No inventas resultados concretos: dejas "
        "marcadores claros [completar con resultado] donde el auditor debe documentar la evidencia."
    )

    user_message = f"""Redacta el DESARROLLO de este procedimiento de auditoría.

PAPEL DE TRABAJO: {request.paperCode or ''} {request.paperTitle or ''} (tipo: {request.paperType or request.auditType or 'general'})
TÍTULO DEL PROCEDIMIENTO: {request.title or '(sin título)'}
ENUNCIADO: {request.statement or '(sin enunciado)'}

Redacta un desarrollo de 3-5 oraciones que describa:
1. Cómo se ejecuta el procedimiento (pasos concretos)
2. Qué evidencia/documentación se revisa
3. Qué se concluye o verifica

Usa lenguaje formal de papel de trabajo. Inserta marcadores [completar...] donde el auditor
debe poner datos específicos (montos, fechas, muestras, resultados).

Responde SOLO con el texto del desarrollo, sin encabezados ni comillas."""

    result = await chat_with_agent(
        agent_type="SCRIPTORIUM",
        system_prompt=system_prompt,
        messages=[{"role": "user", "content": user_message}],
        max_tokens=1500,
        override_complexity=TaskComplexity.STANDARD,
    )

    development = (result["content"] or "").strip().strip('"')
    return {
        "development": development,
        "model": result["model"],
        "tokens_used": result["input_tokens"] + result["output_tokens"],
    }
