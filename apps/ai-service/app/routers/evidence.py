"""Evidencia de campo — router nuevo (EVD-03..). Endpoints tontos y síncronos.

Este router no conoce el ciclo de vida de FieldEvidence ni toca la base de datos —
NestJS es el orquestador único (ver docs/inteligencia-de-evidencia-de-campo.md §6.1).
/transcribe (EVD-03) y /extract (EVD-05).
"""
import asyncio
import base64
import logging
import os
import re
import tempfile
import time
from typing import Literal, Optional

from fastapi import APIRouter, File, Form, Header, HTTPException, UploadFile
from pydantic import BaseModel, Field

from app.services.auth import verify_internal_key
from app.services.whisper_service import transcribe_sync
from app.services.video_service import procesar_video_sync
from app.services.rag_pipeline import extraer_texto_pdf
from app.services.llm_router import generate_structured, StructuredGenerationError

logger = logging.getLogger(__name__)

router = APIRouter()

_MAX_AUDIO_BYTES = 100 * 1024 * 1024  # 100MB — una entrevista de 45min a 128kbps ≈ 43MB (§6.5)
_MAX_VIDEO_BYTES = 100 * 1024 * 1024  # mismo límite que audio — video corto tope 180s (EVD-15)
_MAX_PDF_BYTES = 100 * 1024 * 1024  # mismo tope que audio/video — Fase 2a Investigador Forense


class Segmento(BaseModel):
    inicio: float
    fin: float
    texto: str
    hablante: Optional[str] = None  # poblado solo si diarizar=True (Fase 2, EVD-12)
    # Fase 2a Investigador Forense — señal de confianza de faster-whisper, para
    # que NestJS detecte audio/video difícil de transcribir (ruido, volumen
    # bajo, etc.). No afecta SegmentoInput (clase separada, usada por /extract).
    no_speech_prob: Optional[float] = None
    avg_logprob: Optional[float] = None


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


# ─── Video corto (EVD-15, Fase 4) ──────────────────────────────────────────────
# UNA decodificación del contenedor con PyAV (video_service.procesar_video_sync):
# duración real, presencia de audio, muestreo de frames, y transcripción de la
# pista de audio si existe (reutiliza transcribe_sync, no duplica Whisper). NestJS
# es quien aplica la regla de negocio de 180s máx y la de citabilidad — este
# endpoint solo reporta la verdad de lo que decodificó (§6.1: ai-service "tonto").

class FrameMuestreado(BaseModel):
    ts_seg: float
    base64: str
    mime_type: str = "image/jpeg"


class ProcessVideoResponse(BaseModel):
    duracion_seg: float
    tiene_audio: bool
    transcript: Optional[TranscribeResponse] = None
    frames: list[FrameMuestreado]
    processing_ms: int


@router.post("/process-video", response_model=ProcessVideoResponse)
async def process_video(
    file: UploadFile = File(...),
    language: Optional[str] = Form(None),
    x_internal_key: Optional[str] = Header(default=None, alias="x-internal-key"),
):
    """Video corto: decodifica UNA vez con PyAV, muestrea hasta 15 frames
    (redimensionados a 768px de lado mayor, JPEG calidad 80) y transcribe la
    pista de audio si existe. No aplica el tope de 180s ni la regla de
    citabilidad (video sin audio + sin descripción) — esas son reglas de
    negocio que NestJS decide con el resultado (§6.1 del diseño)."""
    verify_internal_key(x_internal_key)

    content = await file.read()
    if len(content) == 0:
        raise HTTPException(status_code=400, detail="El archivo está vacío")
    if len(content) > _MAX_VIDEO_BYTES:
        raise HTTPException(status_code=413, detail="El archivo supera el límite de 100 MB")

    suffix = os.path.splitext(file.filename or "")[1] or ".mp4"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(content)
        tmp_path = tmp.name

    try:
        result = await asyncio.to_thread(procesar_video_sync, tmp_path, language)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al procesar el video: {e}")
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


# ─── PDF como evidencia (Fase 2a Investigador Forense) ─────────────────────────
# docs/investigador-forense-multimodal-propuesta.md — reutiliza la misma cascada
# de OCR (pdfplumber → Stirling → Gemini vision) ya construida para el RAG.

class ProcessPdfResponse(BaseModel):
    texto: str
    paginas: int
    ocr_aplicado: bool
    proveedor_ocr: Optional[str] = None
    calidad_baja: bool
    motivo_calidad_baja: Optional[str] = None
    processing_ms: int


@router.post("/process-pdf", response_model=ProcessPdfResponse)
async def process_pdf(
    file: UploadFile = File(...),
    x_internal_key: Optional[str] = Header(default=None, alias="x-internal-key"),
):
    """PDF como evidencia de campo — mismo patrón que /process-video: NestJS
    aplica las reglas de negocio (aquí: texto vacío o calidad_baja) sobre lo
    que este endpoint reporta. Opera sobre bytes directamente (pdfplumber
    acepta un stream en memoria; Stirling/Gemini reciben los bytes crudos),
    sin archivo temporal en disco."""
    verify_internal_key(x_internal_key)

    content = await file.read()
    if len(content) == 0:
        raise HTTPException(status_code=400, detail="El archivo está vacío")
    if len(content) > _MAX_PDF_BYTES:
        raise HTTPException(status_code=413, detail="El archivo supera el límite de 100 MB")

    start = time.monotonic()
    try:
        resultado = await extraer_texto_pdf(content, file.filename or "documento.pdf")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al procesar el PDF: {e}")

    return {**resultado, "processing_ms": round((time.monotonic() - start) * 1000)}


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


TipoEntidadEstructurada = Literal[
    "persona", "cuenta", "transaccion", "documento", "afirmacion", "fecha_evento",
]
TipoRelacionEstructurada = Literal["autorizo", "contradice", "menciona", "involucra"]


class EntidadEstructurada(BaseModel):
    """Entidad canónica para el Grafo de Evidencia (Fase 1, ontología fija —
    distinta de `entidades_mencionadas`, que es una lista libre sin relaciones).
    `cita_textual` sigue la MISMA regla anti-alucinación que `Hallazgo.cita_textual`."""
    nombre: str = Field(..., max_length=300)
    tipo: TipoEntidadEstructurada
    cita_textual: str


class RelacionEstructurada(BaseModel):
    """Arista del Grafo de Evidencia. `entidad_origen`/`entidad_destino` deben
    coincidir EXACTO (mismo texto) con un `nombre` ya listado en
    `entidades_estructuradas` de esta misma respuesta — NestJS resuelve el
    nombre a un id por texto normalizado, sin fuzzy matching; si el LLM
    referencia un nombre no declarado como entidad, esa relación se descarta
    silenciosamente (se loguea, no rompe la extracción)."""
    entidad_origen: str
    entidad_destino: str
    tipo: TipoRelacionEstructurada
    cita_textual: str
    confianza: float = Field(ge=0.0, le=1.0)


class ExtraccionEvidencia(BaseModel):
    resumen_ejecutivo: str
    temas: list[str] = Field(default_factory=list)
    entidades_mencionadas: list[EntidadMencionada] = Field(default_factory=list)
    entidades_estructuradas: list[EntidadEstructurada] = Field(default_factory=list)
    relaciones: list[RelacionEstructurada] = Field(default_factory=list)
    hallazgos: list[Hallazgo] = Field(default_factory=list)


class SegmentoInput(BaseModel):
    inicio: float
    fin: float
    texto: str
    hablante: Optional[str] = None  # poblado solo para INTERVIEW_AUDIO diarizado


TipoAnotacion = Literal["circulo", "flecha", "texto"]


class Anotacion(BaseModel):
    """Marca dibujada por el auditor sobre una foto (EVD-14) — coordenadas 0-1
    relativas al tamaño de la imagen, para que sobrevivan cualquier escalado."""
    tipo: TipoAnotacion
    x: float
    y: float
    x2: Optional[float] = None  # flecha: punto final
    y2: Optional[float] = None
    radio: Optional[float] = None  # circulo
    nota: Optional[str] = None  # lo que el auditor escribió sobre esta zona


class ImagenEntrada(BaseModel):
    """Una imagen adjunta a la extracción — generalizado de la foto única de
    EVD-14 a una lista (EVD-15: hasta 15 frames de video). `ts_seg`, cuando se
    manda, es el instante del frame dentro del video (None para foto anotada)."""
    base64: str
    mime_type: str = "image/jpeg"
    ts_seg: Optional[float] = None


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
    fuente_tipo: Literal["texto", "transcripcion_audio", "foto_anotada", "video_corto", "pdf_documento"]
    contenido: str
    segmentos: Optional[list[SegmentoInput]] = None
    contexto_expediente: Optional[ContextoExpediente] = None
    instrucciones_extra: Optional[str] = None
    # foto_anotada (EVD-14): una imagen (la foto completa); video_corto (EVD-15):
    # hasta 15 frames muestreados con ts_seg — la imagen original nunca se
    # modifica con las marcas; las anotaciones de foto viajan aparte como
    # metadata y se describen al LLM en texto además de dárselas a ver.
    imagenes: Optional[list[ImagenEntrada]] = None
    anotaciones: Optional[list[Anotacion]] = None


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
        "menos hallazgos que inventar o parafrasear una cita. Esta regla aplica IGUAL a "
        "`entidades_estructuradas[].cita_textual` y `relaciones[].cita_textual` — sin "
        "excepción.\n\n"
        "ADEMÁS de los hallazgos, extrae un GRAFO DE EVIDENCIA con ontología fija:\n"
        "Tipos de entidad (`entidades_estructuradas[].tipo`):\n"
        "- persona: un individuo identificado por nombre o cargo\n"
        "- cuenta: una cuenta bancaria, contable o de sistema\n"
        "- transaccion: un pago, cobro, asiento o movimiento específico\n"
        "- documento: un documento, contrato, factura o expediente mencionado\n"
        "- afirmacion: una declaración o testimonio textual relevante (no un hallazgo — la "
        "afirmación en sí, como entidad citable)\n"
        "- fecha_evento: una fecha o evento puntual relevante\n"
        "Tipos de relación (`relaciones[].tipo`):\n"
        "- autorizo: una entidad dio permiso/aprobación explícita a algo/alguien\n"
        "- contradice: una afirmación choca con otra ya extraída o con el expediente\n"
        "- menciona: una entidad menciona o hace referencia a otra, sin relación más específica\n"
        "- involucra: una entidad participa o está involucrada en otra (ej. una transacción "
        "involucra a una cuenta)\n"
        "Reglas del grafo: (1) `entidad_origen`/`entidad_destino` de cada relación deben ser "
        "copia EXACTA de un `nombre` que ya incluiste en `entidades_estructuradas` de esta "
        "misma respuesta — nunca inventes una relación entre nombres que no declaraste como "
        "entidad. (2) No fuerces entidades o relaciones débiles solo para llenar el grafo — si "
        "esta evidencia no involucra entidades claramente identificables según la ontología de "
        "arriba, devuelve `entidades_estructuradas`/`relaciones` vacías. (3) `entidades_mencionadas` "
        "es una lista libre e informal ya existente; `entidades_estructuradas` es una idea "
        "similar pero restringida a la ontología fija de arriba, con cita literal obligatoria — "
        "puede haber traslape entre ambas listas, eso es normal.\n\n"
        "Identifica, cuando existan:\n"
        "- contradiccion: el entrevistado se contradice a sí mismo\n"
        "- evasiva: el entrevistado evita responder directamente\n"
        "- riesgo_mencionado: un riesgo mencionado explícitamente\n"
        "- inconsistencia_con_expediente: contradice algo ya documentado en el expediente "
        "(solo si se te da contexto del expediente)\n"
        "- incumplimiento_mencionado: \"no se hace X que la norma/política exige\"\n"
        "- anomalia_visual: algo visualmente anómalo en una foto/video (solo aplica a esas fuentes)\n\n"
        "Si la fuente es una FOTO ANOTADA: el auditor marcó una o más zonas sobre la imagen "
        "(círculo, flecha o nota de texto) — recibes la imagen completa MÁS la lista de esas "
        "zonas numeradas con su nota (si el auditor escribió una). Tu `cita_textual` para "
        "hallazgos de foto DEBE ser una subcadena LITERAL de la nota del auditor de la zona "
        "correspondiente — no inventes una \"cita\" describiendo lo que ves, esa descripción va "
        "en `descripcion`/`justificacion`, no en `cita_textual`. Si una zona no tiene nota "
        "del auditor, puedes describir lo que observas en `resumen_ejecutivo`/`temas` pero NO "
        "generes un hallazgo individual para esa zona (no hay nada literal que citar). "
        "`fuente_ref` para foto siempre en formato \"zona #N\" (N = número de la zona).\n\n"
        "Si la fuente es un VIDEO CORTO: recibes uno o más FRAMES (imágenes) muestreados a "
        "intervalos de tiempo del video, en orden cronológico, cada uno marcado con su instante "
        "(\"FRAME N: t=X.Xs\"). Los frames son fotos espaciadas en el tiempo, NO un video "
        "continuo — puede haber pasado algo relevante entre dos frames que no verás. Si el "
        "video tiene pista de audio, también recibes su transcripción con segmentos y marcas de "
        "tiempo — correlaciona lo dicho con lo visible cuando sea razonable (ej. el auditor narra "
        "\"aquí se ve la merma\" cerca del instante de un frame que muestra algo anómalo), pero "
        "nunca asumas una correlación que el texto no respalda. Igual que con foto anotada, tu "
        "`cita_textual` para CUALQUIER hallazgo de video (incluido `anomalia_visual`) DEBE ser "
        "una subcadena LITERAL del texto fuente (la transcripción, o la descripción del auditor "
        "si el video no tiene audio) — nunca inventes una \"cita\" describiendo lo que ves en un "
        "frame como si fuera un hecho verificado por el auditor; esa descripción va en "
        "`descripcion`/`justificacion`, no en `cita_textual`. Si no hay nada textual que citar "
        "para respaldar algo que observas en un frame, no generes ese hallazgo — puedes mencionarlo "
        "en `resumen_ejecutivo`. `fuente_ref` para video usa el mismo formato mm:ss que audio, "
        "basado en el segmento de transcripción más cercano (no en el instante del frame). "
        "IMPORTANTE: convierte siempre segundos a mm:ss antes de escribir `fuente_ref` — ej. si el "
        "segmento de transcripción más cercano está en 125.4s, escribe \"02:05\", NUNCA \"125.4s\" "
        "ni \"2:05.4\" ni el texto \"t=125.4s\" de la etiqueta del frame (esa etiqueta es solo para "
        "que ubiques el frame, no es el formato de salida).\n\n"
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
        '  "entidades_estructuradas": [{"nombre": "string", "tipo": "persona|cuenta|transaccion|documento|afirmacion|fecha_evento", "cita_textual": "string — subcadena literal"}],\n'
        '  "relaciones": [{"entidad_origen": "string — debe existir en entidades_estructuradas", "entidad_destino": "string — ídem", "tipo": "autorizo|contradice|menciona|involucra", "cita_textual": "string — subcadena literal", "confianza": 0.0}],\n'
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

    if request.fuente_tipo == "video_corto" and request.imagenes:
        frames_desc = "\n".join(
            f"  FRAME {i}: t={img.ts_seg:.1f}s" if img.ts_seg is not None else f"  FRAME {i}"
            for i, img in enumerate(request.imagenes, start=1)
        )
        parts.append(
            "\nFRAMES ADJUNTOS (muestras del video en orden cronológico — la imagen adjunta "
            "número N corresponde a esta lista en el mismo orden):\n" + frames_desc
        )

    if request.anotaciones:
        zonas = []
        for i, a in enumerate(request.anotaciones, start=1):
            pos = f"({a.x:.0%}, {a.y:.0%})"
            if a.tipo == "flecha" and a.x2 is not None and a.y2 is not None:
                pos += f" → ({a.x2:.0%}, {a.y2:.0%})"
            elif a.tipo == "circulo" and a.radio is not None:
                pos += f", radio {a.radio:.0%}"
            nota = f' — nota del auditor: "{a.nota}"' if a.nota else " — (sin nota del auditor)"
            zonas.append(f"  zona #{i}: {a.tipo} en {pos}{nota}")
        parts.append(
            "\nZONAS MARCADAS SOBRE LA IMAGEN (coordenadas relativas, origen arriba-izquierda; "
            "la imagen adjunta te deja ver exactamente qué hay ahí):\n" + "\n".join(zonas)
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


# El prompt le pide al LLM fuente_ref en formato mm:ss para video (igual que audio),
# pero en verificación real el LLM a veces copió literal el formato "t=X.Xs" de la
# etiqueta de frame (ej. "2.8s") en vez de convertir — no basta con reforzar el
# prompt, se normaliza en código como red de seguridad real (EVD-15, punto débil
# detectado en verificación con videos sintéticos).
_RE_FUENTE_REF_MMSS = re.compile(r'^\d{1,2}:\d{2}$')
_RE_FUENTE_REF_SEGUNDOS_CRUDOS = re.compile(r'^(\d+(?:\.\d+)?)\s*s?$', re.IGNORECASE)


def _normalizar_fuente_ref_video(fuente_ref: Optional[str]) -> Optional[str]:
    """Convierte un fuente_ref de "segundos crudos" (ej. "2.8s", "125.4") a mm:ss
    (ej. "00:02", "02:05"). Si ya viene en mm:ss, o es cualquier otro texto no
    reconocible como número de segundos, se devuelve intacto — nunca se inventa
    una conversión de algo que no es un número de segundos."""
    if not fuente_ref:
        return fuente_ref
    texto = fuente_ref.strip()
    if _RE_FUENTE_REF_MMSS.match(texto):
        return fuente_ref
    m = _RE_FUENTE_REF_SEGUNDOS_CRUDOS.match(texto)
    if not m:
        return fuente_ref
    segundos_totales = float(m.group(1))
    minutos = int(segundos_totales // 60)
    segundos = int(segundos_totales % 60)
    return f"{minutos:02d}:{segundos:02d}"


@router.post("/extract", response_model=ExtractResponse)
async def extract(
    request: ExtractRequest,
    x_internal_key: Optional[str] = Header(default=None, alias="x-internal-key"),
):
    """Extrae hallazgos estructurados de una fuente de evidencia de campo ya
    normalizada a texto (nota de texto o transcripción de audio)."""
    verify_internal_key(x_internal_key)

    # foto_anotada puede llegar sin notas del auditor (contenido vacío) — la imagen
    # ES la evidencia; para las demás fuentes, sin contenido no hay nada que extraer.
    if not request.contenido.strip() and request.fuente_tipo != "foto_anotada":
        raise HTTPException(status_code=400, detail="contenido no puede estar vacío")

    imagenes: list[tuple[bytes, str]] | None = None
    if request.imagenes:
        imagenes = []
        for i, img in enumerate(request.imagenes, start=1):
            try:
                imagenes.append((base64.b64decode(img.base64), img.mime_type or "image/jpeg"))
            except Exception as e:
                raise HTTPException(status_code=400, detail=f"imagen #{i} en 'imagenes' inválida: {e}")

    try:
        result = await generate_structured(
            agent_type="EVIDENCE_EXTRACTOR",
            system_prompt=_build_extraction_system_prompt(),
            user_content=_build_extraction_user_content(request),
            response_schema=ExtraccionEvidencia,
            temperature=0.1,
            imagenes=imagenes,
        )
    except StructuredGenerationError as e:
        raise HTTPException(status_code=502, detail=str(e))

    # Red de seguridad: generate_structured() ya valida contra ExtraccionEvidencia
    # y devuelve result["data"] como dict (.model_dump()) — normaliza fuente_ref
    # de cada hallazgo de video aquí mismo, sin depender de que el LLM haya
    # obedecido el formato mm:ss pedido en el prompt.
    if request.fuente_tipo == "video_corto":
        for hallazgo in result["data"].get("hallazgos", []):
            hallazgo["fuente_ref"] = _normalizar_fuente_ref_video(hallazgo.get("fuente_ref"))

    return {
        **result["data"],
        "modelo": result["modelo"],
        "input_tokens": result["input_tokens"],
        "output_tokens": result["output_tokens"],
    }
