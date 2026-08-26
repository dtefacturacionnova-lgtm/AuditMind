"""Transcripción de audio con faster-whisper — modelo cargado perezosamente, singleton por proceso.

Carga perezosa a propósito (ver docs/inteligencia-de-evidencia-de-campo.md §6.7): los workers
de uvicorn que nunca transcriben no pagan la RAM del modelo. El primer request tras cada
deploy descarga el modelo desde HuggingFace y será más lento — esperado.
"""
import time

from faster_whisper import WhisperModel

from app.config import settings

_model: WhisperModel | None = None


def _get_model() -> WhisperModel:
    global _model
    if _model is None:
        _model = WhisperModel(
            settings.WHISPER_MODEL_SIZE,
            device=settings.WHISPER_DEVICE,
            compute_type=settings.WHISPER_COMPUTE_TYPE,
        )
    return _model


def transcribe_sync(audio_path: str, language: str | None = None) -> dict:
    """Transcribe un archivo de audio/video. Síncrona a propósito — el caller la corre
    en un thread (asyncio.to_thread) para no bloquear el event loop."""
    model = _get_model()
    start = time.monotonic()

    segments_iter, info = model.transcribe(audio_path, language=language, vad_filter=True)
    segmentos = [
        {
            "inicio": round(seg.start, 2), "fin": round(seg.end, 2), "texto": seg.text.strip(),
            # Fase 2a Investigador Forense — señales de confianza que faster-whisper
            # ya calcula por segmento, antes descartadas. no_speech_prob alto en un
            # segmento que igual produjo texto es indicio de transcripción dudosa
            # (ruido, volumen bajo, habla poco clara) — se usa para marcar
            # FieldEvidence.calidadBaja en NestJS, no se descarta nada acá.
            "no_speech_prob": round(seg.no_speech_prob, 4),
            "avg_logprob": round(seg.avg_logprob, 4),
        }
        for seg in segments_iter
    ]
    texto = " ".join(s["texto"] for s in segmentos if s["texto"]).strip()

    return {
        "texto": texto,
        "segmentos": segmentos,
        "idioma": info.language,
        "duracion_seg": round(info.duration, 2),
        "modelo": f"faster-whisper/{settings.WHISPER_MODEL_SIZE}/{settings.WHISPER_COMPUTE_TYPE}",
        "processing_ms": round((time.monotonic() - start) * 1000),
    }
