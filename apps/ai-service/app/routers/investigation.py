"""Investigador Forense — SHERLOCK (Fase 2b, núcleo mínimo).

docs/investigador-forense-multimodal-propuesta.md — endpoint tonto y síncrono,
igual que evidence.py: NestJS ya tiene el Grafo de Evidencia completo en memoria
(InvestigationGraphService.getAuditGraph()) y decide qué truncar/priorizar antes
de mandarlo aquí — este router solo serializa lo que recibe a un prompt y valida
la respuesta del LLM contra un schema estructurado (generate_structured, mismo
mecanismo que /evidence/extract).

Salvaguarda de sesgo de confirmación (requisito explícito del usuario): las
afirmaciones del auditor (`contexto_auditor_texto`) NUNCA deben influir en qué
cuenta como hallazgo relacionado al objetivo o como "otra bandera". Por eso son
DOS llamadas al LLM, no una: la Llamada 1 (_claims_extraction) ve ÚNICAMENTE el
texto del auditor — ni el grafo ni el objetivo existen para ella — y solo
descompone ese texto en afirmaciones atómicas verificables. La Llamada 2 recibe
esas afirmaciones ya atomizadas (sin el framing persuasivo original) junto con
el grafo y el objetivo, con instrucción explícita de que las afirmaciones solo
alimentan `verificacion_contexto`.
"""
import logging
from typing import Literal, Optional

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field

from app.services.auth import verify_internal_key
from app.services.llm_router import generate_structured, StructuredGenerationError

logger = logging.getLogger(__name__)

router = APIRouter()


# ─── Request (grafo ya truncado/priorizado por NestJS) ─────────────────────────

class GraphMentionInput(BaseModel):
    cita_textual: str
    validada_cita: bool
    evidence_kind: str
    confirmado_por_auditor: bool = False


class GraphNodeInput(BaseModel):
    id: str
    tipo: str  # persona|cuenta|transaccion|documento|afirmacion|fecha_evento
    nombre: str
    mention_count: int
    mentions: list[GraphMentionInput] = Field(default_factory=list)


class GraphEdgeInput(BaseModel):
    id: str
    source_id: str
    target_id: str
    tipo: str  # autorizo|contradice|menciona|involucra
    cita_textual: str
    validada_cita: bool
    confianza: float
    confirmado_por_auditor: bool = False


class CaatsResultSummaryInput(BaseModel):
    """Resumen liviano de un análisis CAATs ya ejecutado en el encargo (Fase 2c)
    — NUNCA el `result` crudo completo (puede ser grande) — armado por NestJS
    (CaatsHistoryService.summarizeForSherlock) a partir de PaperSection
    (manual, panel CAATs) y CaatsAutoRun (auto-detectado desde el Investigador)."""
    engine: str
    source: Literal["manual", "auto"]
    ran_at: Optional[str] = None
    risk_score: Optional[float] = None
    top_findings: list[str] = Field(default_factory=list)


class PaperSearchHitInput(BaseModel):
    """Extracto de otro papel de trabajo relevante al objetivo/contexto,
    encontrado por búsqueda simple de palabras clave en NestJS (Fase 2c) —
    sin ranking semántico, solo solapamiento de términos."""
    paper_code: Optional[str] = None
    paper_title: str
    section_label: str
    extracto: str


class AnalyzeInvestigationRequest(BaseModel):
    audit_title: str
    objetivo: str
    nodes: list[GraphNodeInput] = Field(default_factory=list)
    edges: list[GraphEdgeInput] = Field(default_factory=list)
    contexto_auditor_texto: Optional[str] = None  # None si el auditor no capturó contexto previo
    grafo_truncado: bool = False
    total_entidades_totales: int = 0
    # Fase 2c — fuentes suplementarias (ver REGLA DE FUENTES SUPLEMENTARIAS en
    # _build_investigation_system_prompt): nunca reemplazan el razonamiento
    # sobre el grafo, solo lo enriquecen.
    caats_results: list[CaatsResultSummaryInput] = Field(default_factory=list)
    paper_search_hits: list[PaperSearchHitInput] = Field(default_factory=list)


# ─── Respuesta — 3 grupos estructurados ─────────────────────────────────────────

NivelRiesgoInvestigador = Literal["bajo", "medio", "alto"]


class HallazgoInvestigador(BaseModel):
    titulo: str
    descripcion: str
    cita_textual: str  # debe ser copia LITERAL de una mention/edge cita_textual recibida
    entidad_ids: list[str] = Field(default_factory=list)  # deben existir en nodes[].id — NestJS revalida
    nivel_riesgo: NivelRiesgoInvestigador
    justificacion: str


class ClusterHallazgos(BaseModel):
    tema: str
    resumen: str
    hallazgos: list[HallazgoInvestigador] = Field(default_factory=list)


VeredictoClaim = Literal["confirmada", "contradicha", "sin_evidencia_suficiente"]


class ClaimVerificacion(BaseModel):
    claim_texto: str
    veredicto: VeredictoClaim
    justificacion: str
    citas_relevantes: list[str] = Field(default_factory=list)  # vacío si sin_evidencia_suficiente
    entidad_ids: list[str] = Field(default_factory=list)


class InvestigationAnalysisResponse(BaseModel):
    conclusion_general: str
    hallazgos_objetivo: list[ClusterHallazgos] = Field(default_factory=list)
    otras_banderas: list[ClusterHallazgos] = Field(default_factory=list)
    verificacion_contexto: list[ClaimVerificacion] = Field(default_factory=list)


class InvestigationAnalyzeResult(InvestigationAnalysisResponse):
    claims_extraidos: list[str] = Field(default_factory=list)
    modelo: str
    input_tokens: int
    output_tokens: int


class ClaimsExtraidosResponse(BaseModel):
    claims: list[str] = Field(default_factory=list)


# ─── Prompts ─────────────────────────────────────────────────────────────────

def _build_claims_extraction_system_prompt() -> str:
    return (
        "Descompones el texto de un auditor en afirmaciones atómicas, autocontenidas "
        "y verificables — nada más. NO tienes acceso a ningún expediente, evidencia ni "
        "objetivo de análisis: trabajas SOLO con el texto que se te entrega.\n\n"
        "Cada afirmación debe ser un hecho concreto y verificable (quién, qué, cuándo, "
        "cuánto, con quién) — nunca una opinión vaga sin contenido comprobable "
        "(\"me pareció sospechoso\", \"algo no cuadra\" no son afirmaciones válidas, "
        "descártalas). Si el texto describe un solo hecho con varias cláusulas, sepáralo "
        "en varias afirmaciones atómicas independientes en vez de una sola frase larga. "
        "Reescribe cada afirmación en tercera persona, de forma clara y autocontenida "
        "(no debe depender de leer el resto del texto para entenderse). No agregues "
        "ninguna afirmación que no esté respaldada por el texto original — no infieras, "
        "no completes con supuestos.\n\n"
        "Responde siempre en español, con un único objeto JSON:\n"
        '{"claims": ["string", ...]}'
    )


def _build_investigation_system_prompt() -> str:
    return (
        "Eres el Agente de Investigación Forense de AuditMind — analizas un Grafo de "
        "Evidencia ya construido (entidades y relaciones extraídas de evidencia de campo, "
        "cada una con su cita textual de respaldo) contra el objetivo de análisis que te "
        "da el auditor. Preparas un informe para que un auditor humano lo revise — nunca "
        "se auto-aprueba nada de lo que produces.\n\n"
        "REGLA MÁS IMPORTANTE — anti-alucinación: cada `cita_textual` que reportes debe "
        "ser una copia LITERAL de una de las citas que se te entregan en el grafo (las "
        "`cita_textual` de mentions o de edges) — nunca la parafrasees, corrijas ni "
        "inventes. `entidad_ids` debe contener únicamente ids que existan tal cual en la "
        "lista de nodos que recibes. Si no puedes respaldar algo con una cita literal del "
        "grafo, no lo reportes como hallazgo.\n\n"
        "REGLA DE LAS DOS CATEGORÍAS — no-negociable: TODO lo relevante que encuentres en "
        "el grafo va a `hallazgos_objetivo` (si se relaciona con el objetivo del auditor) "
        "o a `otras_banderas` (cualquier otra cosa que amerite la atención de un auditor, "
        "aunque esté fuera del objetivo declarado) — NUNCA omitas silenciosamente algo "
        "relevante por estar fuera del objetivo. Agrupa los hallazgos en clusters por tema "
        "(`tema` + `resumen` narrativo breve del cluster) en vez de una lista plana.\n\n"
        "VERIFICACIÓN DE AFIRMACIONES DEL AUDITOR (si se te entregan): para cada afirmación "
        "de la lista, decide `confirmada` (el grafo la respalda con al menos una cita "
        "literal), `contradicha` (el grafo tiene evidencia que la contradice — cita esa "
        "evidencia) o `sin_evidencia_suficiente` (el grafo simplemente no toca esa "
        "afirmación — no hay con qué confirmar NI contradecir). Nunca marques "
        "`confirmada`/`contradicha` sin al menos una cita literal en `citas_relevantes` "
        "que la respalde; si no hay cita, usa `sin_evidencia_suficiente`.\n\n"
        "REGLA ANTI-SESGO — no-negociable: `hallazgos_objetivo` y `otras_banderas` se "
        "basan EXCLUSIVAMENTE en el grafo de evidencia y el objetivo del auditor. Las "
        "afirmaciones del auditor listadas más abajo NUNCA deben influir en qué cuenta "
        "como hallazgo en esas dos secciones — se usan ÚNICAMENTE para llenar "
        "`verificacion_contexto`. No dejes que la narrativa o el marco que el auditor "
        "propone en sus afirmaciones sesgue tu lectura del grafo.\n\n"
        "SEÑALES DE CONFIANZA: trata las citas/relaciones marcadas `validada_cita=false` "
        "o con `confianza` baja (menor a 0.6) como evidencia más débil — puedes "
        "mencionarlas pero sé explícito sobre esa debilidad en la `justificacion`. Las "
        "menciones/relaciones marcadas `confirmado_por_auditor=true` ya fueron revisadas "
        "y aceptadas por un humano — trátalas como la evidencia más sólida disponible.\n\n"
        "Si el grafo fue truncado (se te avisa explícitamente si es así), menciónalo con "
        "honestidad en `conclusion_general` — no des una conclusión categórica como si "
        "hubieras visto todo el expediente cuando no fue el caso.\n\n"
        "REGLA DE FUENTES SUPLEMENTARIAS (resultados CAATs ya ejecutados en este encargo, "
        "y extractos de otros papeles de trabajo, si se te entregan): son fuentes "
        "adicionales que pueden ayudarte a interpretar y priorizar el grafo, y a enriquecer "
        "`conclusion_general` — pero NUNCA generes un hallazgo cuyo `cita_textual` no sea "
        "copia literal de una cita del GRAFO entregado arriba. Si un resultado CAATs o un "
        "extracto de papel señala algo que el grafo no respalda con una cita propia, "
        "menciónalo como observación adicional a validar en `conclusion_general` — nunca "
        "como hallazgo con una cita_textual inventada o tomada de esas fuentes.\n\n"
        "Responde siempre en español, con un único objeto JSON con esta forma exacta:\n"
        "{\n"
        '  "conclusion_general": "string, 2-5 frases",\n'
        '  "hallazgos_objetivo": [{"tema": "string", "resumen": "string", "hallazgos": '
        '[{"titulo": "string", "descripcion": "string", "cita_textual": "string — copia '
        'literal", "entidad_ids": ["string"], "nivel_riesgo": "bajo|medio|alto", '
        '"justificacion": "string"}]}],\n'
        '  "otras_banderas": [/* misma forma que hallazgos_objetivo */],\n'
        '  "verificacion_contexto": [{"claim_texto": "string", "veredicto": '
        '"confirmada|contradicha|sin_evidencia_suficiente", "justificacion": "string", '
        '"citas_relevantes": ["string — copia literal"], "entidad_ids": ["string"]}]\n'
        "}\n"
        "Usa listas vacías cuando no aplique, nunca omitas una clave."
    )


def _build_investigation_user_content(request: AnalyzeInvestigationRequest, claims: list[str]) -> str:
    parts = [f'AUDITORÍA: "{request.audit_title}"', f'OBJETIVO DEL ANÁLISIS: "{request.objetivo}"']

    if not request.nodes:
        parts.append("\n(El grafo de evidencia está vacío — no hay entidades extraídas todavía.)")
    else:
        por_tipo: dict[str, list] = {}
        for n in request.nodes:
            por_tipo.setdefault(n.tipo, []).append(n)

        parts.append("\n─── GRAFO DE EVIDENCIA — ENTIDADES ───")
        for tipo, nodos in sorted(por_tipo.items()):
            parts.append(f"\n[{tipo.upper()}]")
            for n in nodos:
                parts.append(f'  · id={n.id} — "{n.nombre}"')
                for m in n.mentions:
                    marcas = []
                    if not m.validada_cita:
                        marcas.append("cita SIN validar automáticamente")
                    if m.confirmado_por_auditor:
                        marcas.append("CONFIRMADO por auditor")
                    sufijo = f" [{', '.join(marcas)}]" if marcas else ""
                    parts.append(f'      cita ({m.evidence_kind}): "{m.cita_textual}"{sufijo}')

        if request.edges:
            parts.append("\n─── GRAFO DE EVIDENCIA — RELACIONES ───")
            nombres_por_id = {n.id: n.nombre for n in request.nodes}
            for e in request.edges:
                origen = nombres_por_id.get(e.source_id, e.source_id)
                destino = nombres_por_id.get(e.target_id, e.target_id)
                marcas = []
                if not e.validada_cita:
                    marcas.append("cita SIN validar")
                if e.confianza < 0.6:
                    marcas.append(f"confianza baja ({e.confianza:.2f})")
                if e.confirmado_por_auditor:
                    marcas.append("CONFIRMADO por auditor")
                sufijo = f" [{', '.join(marcas)}]" if marcas else ""
                parts.append(
                    f'  · "{origen}" --{e.tipo}--> "{destino}"{sufijo}\n'
                    f'      cita: "{e.cita_textual}"'
                )

    if claims:
        lista = "\n".join(f"  {i}. {c}" for i, c in enumerate(claims, start=1))
        parts.append(
            "\n─── AFIRMACIONES DEL AUDITOR A VERIFICAR (ver regla anti-sesgo arriba) ───\n"
            f"{lista}"
        )

    if request.caats_results:
        parts.append("\n─── RESULTADOS CAATs YA EJECUTADOS EN ESTE ENCARGO (fuente suplementaria) ───")
        for c in request.caats_results:
            rs = f" riesgo={c.risk_score:.2f}" if c.risk_score is not None else ""
            parts.append(f"  · [{c.source}] {c.engine}{rs} ({c.ran_at or 'fecha desconocida'})")
            for f in c.top_findings:
                parts.append(f"      - {f}")

    if request.paper_search_hits:
        parts.append("\n─── EXTRACTOS RELEVANTES DE OTROS PAPELES (fuente suplementaria) ───")
        for h in request.paper_search_hits:
            ref = f"{h.paper_code} — " if h.paper_code else ""
            parts.append(f'  · {ref}{h.paper_title} / {h.section_label}: "{h.extracto}"')

    if request.grafo_truncado:
        parts.append(
            f"\n(AVISO: el grafo fue truncado — se incluyeron {len(request.nodes)} de "
            f"{request.total_entidades_totales} entidades totales de esta auditoría. "
            "Reconoce esta limitación en tu conclusión general.)"
        )

    return "\n".join(parts)


# ─── Endpoint ────────────────────────────────────────────────────────────────

@router.post("/analyze", response_model=InvestigationAnalyzeResult)
async def analyze(
    request: AnalyzeInvestigationRequest,
    x_internal_key: Optional[str] = Header(default=None, alias="x-internal-key"),
):
    """Genera el informe de SHERLOCK en 2 llamadas al LLM — ver docstring del
    módulo para la justificación de la salvaguarda anti-sesgo."""
    verify_internal_key(x_internal_key)

    if not request.nodes and not request.contexto_auditor_texto:
        raise HTTPException(
            status_code=400,
            detail="No hay grafo de evidencia ni contexto previo del auditor — nada que analizar",
        )

    claims: list[str] = []
    if request.contexto_auditor_texto and request.contexto_auditor_texto.strip():
        try:
            claims_result = await generate_structured(
                agent_type="SHERLOCK",
                system_prompt=_build_claims_extraction_system_prompt(),
                user_content=request.contexto_auditor_texto,
                response_schema=ClaimsExtraidosResponse,
                temperature=0.1,
            )
        except StructuredGenerationError as e:
            raise HTTPException(status_code=502, detail=f"Error extrayendo afirmaciones del auditor: {e}")
        claims = claims_result["data"]["claims"]

    try:
        result = await generate_structured(
            agent_type="SHERLOCK",
            system_prompt=_build_investigation_system_prompt(),
            user_content=_build_investigation_user_content(request, claims),
            response_schema=InvestigationAnalysisResponse,
            max_tokens=8192,
            temperature=0.1,
        )
    except StructuredGenerationError as e:
        raise HTTPException(status_code=502, detail=f"Error generando el informe de investigación: {e}")

    return {
        **result["data"],
        "claims_extraidos": claims,
        "modelo": result["modelo"],
        "input_tokens": result["input_tokens"],
        "output_tokens": result["output_tokens"],
    }


# ─── Fase 2c: clasificación de hoja de cálculo para auto-run CAATs ────────────
# related_parties queda fuera porque NECESITA un segundo dataset de referencia
# (DualRecordsRequest en analytics.py) que una sola hoja subida no puede
# satisfacer. dte_validation queda fuera porque espera documentos DTE anidados,
# no filas planas de spreadsheet. Cualquier motor nuevo debe cumplir "un solo
# dataset, filas planas" ANTES de agregarse aquí — no basta con que exista en
# analytics.py. Esta misma lista de 15 está espejada a mano en
# apps/api/src/investigation-report/caats-auto-run.service.ts (mismo criterio
# ya aceptado para el prompt de SHERLOCK entre TS/Python) y en
# apps/web/src/lib/caats-fields.ts (AUTO_RUN_ELIGIBLE_ENGINES).
AUTO_RUN_ENGINES: dict[str, str] = {
    "gl": "Libro Mayor",
    "ap": "Cuentas por Pagar",
    "payroll": "Nómina",
    "benford": "Ley de Benford",
    "anomaly": "Anomalías (ML)",
    "sod": "Segregación de Funciones",
    "vendor_master": "Maestro de Proveedores",
    "expenses": "Gastos de Representación",
    "revenue_cutoff": "Corte de Ingresos",
    "bid_rigging": "Licitación Colusoria",
    "ar_aging": "Antigüedad de Cuentas por Cobrar",
    "fixed_assets": "Activo Fijo",
    "structuring": "Pitufeo / Estructuración",
    "missing_trader": "Missing Trader",
    "tax_haven": "Jurisdicciones de Baja Tributación",
}

AutoRunEngineId = Literal[
    "gl", "ap", "payroll", "benford", "anomaly", "sod", "vendor_master", "expenses",
    "revenue_cutoff", "bid_rigging", "ar_aging", "fixed_assets", "structuring",
    "missing_trader", "tax_haven", "ninguno",
]


class ClassifyColumnInput(BaseModel):
    name: str
    sample_values: list[str] = Field(default_factory=list)  # hasta ~3 valores de muestra


class ClassifySpreadsheetRequest(BaseModel):
    descripcion: str
    columns: list[ClassifyColumnInput] = Field(default_factory=list)
    row_count: int = 0


class SpreadsheetClassification(BaseModel):
    engine: AutoRunEngineId
    confianza: float = Field(ge=0.0, le=1.0)
    justificacion: str


def _build_classify_system_prompt() -> str:
    catalogo = "\n".join(f'  · "{k}" = {v}' for k, v in AUTO_RUN_ENGINES.items())
    return (
        "Clasificas una hoja de cálculo subida por un auditor contra un catálogo FIJO de "
        "motores de análisis CAATs (Técnicas de Auditoría Asistidas por Computador), usando "
        "su descripción y sus columnas (nombres + valores de muestra).\n\n"
        f"MOTORES VÁLIDOS (usa el id exacto entre comillas):\n{catalogo}\n\n"
        "IMPORTANTE — NUNCA elijas \"related_parties\" ni \"dte_validation\": no están en la "
        "lista de arriba a propósito, aunque existan como motores en el sistema. "
        "\"related_parties\" necesita un SEGUNDO archivo de referencia que esta hoja sola no "
        "trae; \"dte_validation\" espera documentos DTE (facturación electrónica) anidados, "
        "no filas de spreadsheet. Si la hoja se parece a cualquiera de los dos casos, "
        "responde \"ninguno\" y explica en la justificación que el panel manual de CAATs sí "
        "soporta ese caso.\n\n"
        "Si ningún motor de la lista calza razonablemente con la descripción y las columnas, "
        "responde \"ninguno\" con confianza baja — nunca fuerces un motor solo por elegir "
        "alguno. Responde siempre en español con un único objeto JSON:\n"
        '{"engine": "id-exacto-o-ninguno", "confianza": 0.0-1.0, "justificacion": "string breve"}'
    )


def _build_classify_user_content(request: ClassifySpreadsheetRequest) -> str:
    cols = "\n".join(
        f'  · "{c.name}" — ejemplos: {", ".join(c.sample_values) or "(sin muestra)"}'
        for c in request.columns
    )
    return (
        f'DESCRIPCIÓN DEL AUDITOR: "{request.descripcion}"\n'
        f"FILAS: {request.row_count}\nCOLUMNAS:\n{cols}"
    )


@router.post("/classify-spreadsheet", response_model=SpreadsheetClassification)
async def classify_spreadsheet(
    request: ClassifySpreadsheetRequest,
    x_internal_key: Optional[str] = Header(default=None, alias="x-internal-key"),
):
    """Clasifica una hoja de cálculo en 1 de los 15 motores CAATs auto-ejecutables
    (o "ninguno") — una sola llamada a generate_structured, sin la salvaguarda de
    2 llamadas de /analyze (esto es clasificación simple, no hay riesgo de sesgo
    de confirmación que mitigar aquí)."""
    verify_internal_key(x_internal_key)
    try:
        result = await generate_structured(
            agent_type="SHERLOCK",
            system_prompt=_build_classify_system_prompt(),
            user_content=_build_classify_user_content(request),
            response_schema=SpreadsheetClassification,
            max_tokens=512,
            temperature=0.0,
        )
    except StructuredGenerationError as e:
        raise HTTPException(status_code=502, detail=f"Error clasificando la hoja de cálculo: {e}")
    return result["data"]
