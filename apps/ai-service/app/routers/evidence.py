"""Evidencia de campo — router nuevo (EVD-03..). Endpoints tontos y síncronos.

Este router no conoce el ciclo de vida de FieldEvidence ni toca la base de datos —
NestJS es el orquestador único (ver docs/inteligencia-de-evidencia-de-campo.md §6.1).
/transcribe (EVD-03) y /extract (EVD-05).
"""
import asyncio
import logging
import os
import tempfile
from typing import Literal, Optional

from fastapi import APIRouter, File, Form, Header, HTTPException, UploadFile
from pydantic import BaseModel, Field

from app.services.auth import verify_internal_key
from app.services.whisper_service import transcribe_sync
from app.services.llm_router import generate_structured, StructuredGenerationError

logger = logging.getLogger(__name__)

router = APIRouter()

_MAX_AUDIO_BYTES = 100 * 1024 * 1024  # 100MB — una entrevista de 45min a 128kbps ≈ 43MB (§6.5)


class Segmento(BaseModel):
    inicio: float
    fin: float
    texto: str
    hablante: Optional[str] = None  # poblado solo si diarizar=True (Fase 2, EVD-12)


class TranscribeResponse(BaseModel):
    texto: str
    segmentos: list[Segmento]
    idioma: str
    duracion_seg: float
    modelo: str
    processing_ms: int


@router.post("/transcribe", response_model=TranscribeResponse)
async def transcribe(
    file: UploadFile = File(...),
    language: Optional[str] = Form(None),
    diarizar: bool = Form(False),
    x_internal_key: Optional[str] = Header(default=None, alias="x-internal-key"),
):
    """Transcribe un archivo de audio con faster-whisper. Requiere x-internal-key
    (llamada interna NestJS → FastAPI, mismo patrón que /rag/ingest/pdf).

    diarizar=True (solo para INTERVIEW_AUDIO, Fase 2) agrega separación de hablantes
    con pyannote-audio sobre los segmentos de Whisper. Si la diarización falla (p. ej.
    falta HUGGINGFACE_TOKEN), la transcripción se entrega igual sin `hablante` —
    degradación controlada, nunca se pierde la transcripción por esto."""
    verify_internal_key(x_internal_key)

    content = await file.read()
    if len(content) == 0:
        raise HTTPException(status_code=400, detail="El archivo está vacío")
    if len(content) > _MAX_AUDIO_BYTES:
        raise HTTPException(status_code=413, detail="El archivo supera el límite de 100 MB")

    suffix = os.path.splitext(file.filename or "")[1] or ".audio"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(content)
        tmp_path = tmp.name

    try:
        result = await asyncio.to_thread(transcribe_sync, tmp_path, language)
        if diarizar:
            try:
                from app.services.diarization_service import diarizar_sync, asignar_hablantes
                turnos = await asyncio.to_thread(diarizar_sync, tmp_path)
                result["segmentos"] = asignar_hablantes(result["segmentos"], turnos)
            except Exception as e:
                logger.warning("Diarización omitida — transcripción continúa sin hablantes: %s", e)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al transcribir el audio: {e}")
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


# ─── Extracción estructurada (EVD-05) ──────────────────────────────────────────
# Esquema definitivo — docs/inteligencia-de-evidencia-de-campo.md §6.4.

TipoHallazgo = Literal[
    "contradiccion", "evasiva", "anomalia_visual", "riesgo_mencionado",
    "inconsistencia_con_expediente", "incumplimiento_mencionado",
]
NivelRiesgo = Literal["bajo", "medio", "alto"]
TipoEntidad = Literal["persona", "area", "sistema", "documento", "monto", "fecha", "otro"]


class EntidadMencionada(BaseModel):
    nombre: str
    tipo: TipoEntidad


class ReferenciaExpediente(BaseModel):
    code: str
    section_key: Optional[str] = None
    motivo: str


class Hallazgo(BaseModel):
    tipo: TipoHallazgo
    descripcion: str
    cita_textual: str  # debe ser subcadena LITERAL de la fuente — NestJS valida esto (EVD-06)
    fuente_ref: Optional[str] = None
    nivel_riesgo: NivelRiesgo
    justificacion: Optional[str] = None
    referencias_expediente: list[ReferenciaExpediente] = Field(default_factory=list)


class ExtraccionEvidencia(BaseModel):
    resumen_ejecutivo: str
    temas: list[str] = Field(default_factory=list)
    entidades_mencionadas: list[EntidadMencionada] = Field(default_factory=list)
    hallazgos: list[Hallazgo] = Field(default_factory=list)


class SegmentoInput(BaseModel):
    inicio: float
    fin: float
    texto: str
    hablante: Optional[str] = None  # poblado solo para INTERVIEW_AUDIO diarizado


class ContextoExpedientePapel(BaseModel):
    code: str
    title: str
    sections: list[dict] = Field(default_factory=list)


class ContextoExpedienteExtracto(BaseModel):
    code: str
    section_key: Optional[str] = None
    resumen: str


class ContextoExpediente(BaseModel):
    audit_title: Optional[str] = None
    audit_type: Optional[str] = None
    papeles: list[ContextoExpedientePapel] = Field(default_factory=list)
    extractos: list[ContextoExpedienteExtracto] = Field(default_factory=list)


class ExtractRequest(BaseModel):
    fuente_tipo: Literal["texto", "transcripcion_audio"]
    contenido: str
    segmentos: Optional[list[SegmentoInput]] = None
    contexto_expediente: Optional[ContextoExpediente] = None
    instrucciones_extra: Optional[str] = None


class ExtractResponse(ExtraccionEvidencia):
    modelo: str
    input_tokens: int
    output_tokens: int


def _build_extraction_system_prompt() -> str:
    return (
        "Eres un asistente de auditoría que extrae hallazgos de evidencia de campo "
        "(notas de texto, notas de voz transcritas, entrevistas) para que un auditor "
        "humano los revise antes de que cuenten como parte oficial del expediente. "
        "Nunca se auto-aprueba un hallazgo — tu trabajo es preparar, no decidir.\n\n"
        "REGLA MÁS IMPORTANTE: cada `cita_textual` debe ser una subcadena LITERAL del "
        "texto fuente que se te entrega — cópiala exactamente, sin corregir ortografía, "
        "sin parafrasear, sin traducir, sin resumir. Si no puedes citar algo textual que "
        "respalde un hallazgo, no lo incluyas. Una cita que no aparece literal en la "
        "fuente se descarta automáticamente antes de llegar al auditor — mejor reportar "
        "menos hallazgos que inventar o parafrasear una cita.\n\n"
        "Identifica, cuando existan:\n"
        "- contradiccion: el entrevistado se contradice a sí mismo\n"
        "- evasiva: el entrevistado evita responder directamente\n"
        "- riesgo_mencionado: un riesgo mencionado explícitamente\n"
        "- inconsistencia_con_expediente: contradice algo ya documentado en el expediente "
        "(solo si se te da contexto del expediente)\n"
        "- incumplimiento_mencionado: \"no se hace X que la norma/política exige\"\n"
        "- anomalia_visual: solo aplica a evidencia visual (foto/video), no a texto/audio\n\n"
        "No reportes trivialidades — justifica cada hallazgo explicando por qué le importa "
        "a un auditor. El resumen ejecutivo es 2-4 frases. Los temas son categorías cortas "
        "para agrupar la evidencia (ej. \"control de acceso\", \"segregación de funciones\"). "
        "Responde siempre en español.\n\n"
        "Responde con un único objeto JSON con EXACTAMENTE esta forma (todos los campos son "
        "obligatorios salvo que se indique opcional; usa listas vacías si no aplica, nunca "
        "omitas una clave):\n"
        "{\n"
        '  "resumen_ejecutivo": "string, 2-4 frases",\n'
        '  "temas": ["string", ...],\n'
        '  "entidades_mencionadas": [{"nombre": "string", "tipo": "persona|area|sistema|documento|monto|fecha|otro"}],\n'
        '  "hallazgos": [\n'
        "    {\n"
        '      "tipo": "contradiccion|evasiva|anomalia_visual|riesgo_mencionado|inconsistencia_con_expediente|incumplimiento_mencionado",\n'
        '      "descripcion": "string",\n'
        '      "cita_textual": "string — subcadena literal de la fuente",\n'
        '      "fuente_ref": "string en formato mm:ss SOLO si la fuente trae segmentos con '
        'timestamp; null si es texto plano sin segmentos — nunca uses aquí el contexto o las '
        'instrucciones del auditor",\n'
        '      "nivel_riesgo": "bajo|medio|alto",\n'
        '      "justificacion": "string o null",\n'
        '      "referencias_expediente": [{"code": "string", "section_key": "string o null", "motivo": "string"}]\n'
        "    }\n"
        "  ]\n"
        "}"
    )


def _build_extraction_user_content(request: ExtractRequest) -> str:
    parts = [f"FUENTE ({request.fuente_tipo}):\n{request.contenido}"]

    if request.segmentos:
        segs = "\n".join(
            f"  [{s.inicio:.1f}s-{s.fin:.1f}s]{f' {s.hablante}:' if s.hablante else ''} {s.texto}"
            for s in request.segmentos
        )
        parts.append(f"\nSEGMENTOS CON TIMESTAMP (usa estos para fuente_ref, formato mm:ss):\n{segs}")
        if any(s.hablante for s in request.segmentos):
            parts.append(
                "\nLa fuente es una entrevista diarizada — los segmentos indican qué hablante "
                "(SPEAKER_00, SPEAKER_01, ...) dijo cada parte. No sabes cuál hablante es el "
                "auditor y cuál el entrevistado; si es relevante para un hallazgo, refiérete a "
                "ellos por su etiqueta tal cual (p. ej. \"SPEAKER_01 afirmó que...\"), nunca "
                "asumas roles."
            )

    if request.instrucciones_extra:
        parts.append(f"\nCONTEXTO APORTADO POR EL AUDITOR:\n{request.instrucciones_extra}")

    ctx = request.contexto_expediente
    if ctx and ctx.papeles:
        lista = "\n".join(f"  {p.code}: {p.title}" for p in ctx.papeles)
        parts.append(f"\nPAPELES DEL EXPEDIENTE (usa estos codes en referencias_expediente):\n{lista}")
    if ctx and ctx.extractos:
        resumenes = "\n".join(f"  {e.code} / {e.section_key or ''}: {e.resumen}" for e in ctx.extractos)
        parts.append(f"\nEXTRACTOS DE SECCIONES RELEVANTES:\n{resumenes}")

    return "\n".join(parts)


@router.post("/extract", response_model=ExtractResponse)
async def extract(
    request: ExtractRequest,
    x_internal_key: Optional[str] = Header(default=None, alias="x-internal-key"),
):
    """Extrae hallazgos estructurados de una fuente de evidencia de campo ya
    normalizada a texto (nota de texto o transcripción de audio)."""
    verify_internal_key(x_internal_key)

    if not request.contenido.strip():
        raise HTTPException(status_code=400, detail="contenido no puede estar vacío")

    try:
        result = await generate_structured(
            agent_type="EVIDENCE_EXTRACTOR",
            system_prompt=_build_extraction_system_prompt(),
            user_content=_build_extraction_user_content(request),
            response_schema=ExtraccionEvidencia,
            temperature=0.1,
        )
    except StructuredGenerationError as e:
        raise HTTPException(status_code=502, detail=str(e))

    return {
        **result["data"],
        "modelo": result["modelo"],
        "input_tokens": result["input_tokens"],
        "output_tokens": result["output_tokens"],
    }
