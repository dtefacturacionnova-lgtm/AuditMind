"""Diarización de hablantes con pyannote-audio — pipeline cargado perezosamente,
singleton por proceso (mismo patrón que whisper_service.py, ver docs/inteligencia-de-
evidencia-de-campo.md §6.7). Solo se usa para FieldEvidenceKind.INTERVIEW_AUDIO (Fase 2).

Requiere HUGGINGFACE_TOKEN con la licencia de pyannote/speaker-diarization-3.1 y
pyannote/segmentation-3.0 aceptada en huggingface.co — son modelos "gated". Sin el
token, diarizar_sync lanza RuntimeError con instrucciones; el caller (evidence.py)
degrada con gracia: la transcripción se entrega igual, solo sin separación de hablantes.
"""
from app.config import settings

_pipeline = None


def _get_pipeline():
    global _pipeline
    if _pipeline is None:
        if not settings.HUGGINGFACE_TOKEN:
            raise RuntimeError(
                "HUGGINGFACE_TOKEN no configurado — la diarización requiere un token de "
                "Hugging Face (huggingface.co/settings/tokens) con la licencia de "
                "pyannote/speaker-diarization-3.1 y pyannote/segmentation-3.0 aceptada."
            )
        from pyannote.audio import Pipeline
        _pipeline = Pipeline.from_pretrained(
            "pyannote/speaker-diarization-3.1",
            use_auth_token=settings.HUGGINGFACE_TOKEN,
        )
    return _pipeline


def diarizar_sync(audio_path: str) -> list[dict]:
    """Devuelve los turnos de habla detectados: [{inicio, fin, hablante}].
    Síncrona a propósito — el caller la corre en un thread (asyncio.to_thread)."""
    pipeline = _get_pipeline()
    diarization = pipeline(audio_path)
    return [
        {"inicio": round(turn.start, 2), "fin": round(turn.end, 2), "hablante": speaker}
        for turn, _, speaker in diarization.itertracks(yield_label=True)
    ]


def asignar_hablantes(segmentos: list[dict], turnos: list[dict]) -> list[dict]:
    """Asigna a cada segmento de Whisper el hablante de pyannote con mayor solapamiento
    temporal — heurística simple (un segmento de Whisper rara vez cruza más de un
    cambio real de turno). Si no hay turnos, devuelve los segmentos sin tocar."""
    if not turnos:
        return segmentos
    resultado = []
    for seg in segmentos:
        mejor_hablante = None
        mejor_solape = 0.0
        for turno in turnos:
            solape = min(seg["fin"], turno["fin"]) - max(seg["inicio"], turno["inicio"])
            if solape > mejor_solape:
                mejor_solape = solape
                mejor_hablante = turno["hablante"]
        resultado.append({**seg, "hablante": mejor_hablante})
    return resultado
