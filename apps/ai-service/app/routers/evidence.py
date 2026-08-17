"""Evidencia de campo — router nuevo (EVD-03..). Endpoints tontos y síncronos.

Este router no conoce el ciclo de vida de FieldEvidence ni toca la base de datos —
NestJS es el orquestador único (ver docs/inteligencia-de-evidencia-de-campo.md §6.1).
Por ahora solo /transcribe (EVD-03); /extract llega en EVD-05.
"""
import asyncio
import os
import tempfile
from typing import Optional

from fastapi import APIRouter, File, Form, Header, HTTPException, UploadFile
from pydantic import BaseModel

from app.services.auth import verify_internal_key
from app.services.whisper_service import transcribe_sync

router = APIRouter()

_MAX_AUDIO_BYTES = 100 * 1024 * 1024  # 100MB — una entrevista de 45min a 128kbps ≈ 43MB (§6.5)


class Segmento(BaseModel):
    inicio: float
    fin: float
    texto: str


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
    x_internal_key: Optional[str] = Header(default=None, alias="x-internal-key"),
):
    """Transcribe un archivo de audio con faster-whisper. Requiere x-internal-key
    (llamada interna NestJS → FastAPI, mismo patrón que /rag/ingest/pdf)."""
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
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al transcribir el audio: {e}")
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
