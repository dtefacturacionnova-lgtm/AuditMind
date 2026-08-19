"""Procesamiento de video corto (EVD-15, Fase 4) — una sola decodificación del
contenedor con PyAV: duración real, presencia de pista de audio, y muestreo de
frames redimensionados/comprimidos con Pillow.

No se instala ffmpeg de sistema (PyAV ya lo trae empaquetado, viene transitivo
con faster-whisper) ni opencv-python — ver docs/inteligencia-de-evidencia-de-campo.md
§decisión EVD-15.

La transcripción de la pista de audio (si existe) reutiliza `transcribe_sync`
de whisper_service.py tal cual — faster-whisper decodifica el audio de
CUALQUIER contenedor (incluido un mp4 con pista de video) internamente vía
PyAV, así que no hace falta extraer el audio a un archivo aparte primero. No
se duplica la lógica de Whisper.
"""
import base64
import io
import logging
import math
import time

import av
from PIL import Image

from app.services.whisper_service import transcribe_sync

logger = logging.getLogger(__name__)

# Reglas de muestreo (decisión EVD-15, fijas — no configurables por env):
MAX_FRAMES = 15
MIN_INTERVALO_SEG = 5
MAX_LADO_PX = 768
JPEG_QUALITY = 80


def _duracion_segundos(container, video_stream) -> float:
    """Duración del CONTENIDO VISUAL en segundos — lo que efectivamente se
    muestrea en frames. Prioriza la duración propia de la pista de video (no la
    de `container`, que puede reflejar una pista de audio más larga que el
    video si el archivo está mal formado — verificado con un video sintético de
    prueba donde el audio duraba más que el video: usar container.duration ahí
    habría inflado la duración reportada y generado objetivos de muestreo más
    allá del último frame real). Cae a `container.duration` (metadata global,
    en unidades de av.time_base = 1_000_000 ticks/segundo — hay que DIVIDIR,
    no multiplicar) solo si la pista de video no trae su propia duración."""
    if video_stream.duration and video_stream.time_base:
        return float(video_stream.duration * video_stream.time_base)
    if container.duration:
        return float(container.duration) / av.time_base
    return 0.0


def _frame_a_jpeg_base64(frame: "av.VideoFrame") -> str:
    img = frame.to_image()  # PIL.Image en RGB
    w, h = img.size
    lado_mayor = max(w, h)
    if lado_mayor > MAX_LADO_PX:
        escala = MAX_LADO_PX / lado_mayor
        nuevo_w = max(1, round(w * escala))
        nuevo_h = max(1, round(h * escala))
        img = img.resize((nuevo_w, nuevo_h), Image.LANCZOS)
    buf = io.BytesIO()
    img.convert("RGB").save(buf, format="JPEG", quality=JPEG_QUALITY)
    return base64.b64encode(buf.getvalue()).decode("ascii")


def procesar_video_sync(video_path: str, language: str | None = None) -> dict:
    """Decodifica el video con PyAV: duración, si tiene pista de audio, frames
    muestreados (máx MAX_FRAMES, redimensionados a MAX_LADO_PX/JPEG), y
    transcripción de la pista de audio si existe.

    Intervalo entre frames = max(MIN_INTERVALO_SEG, ceil(duracion/15)) segundos,
    tope duro de MAX_FRAMES frames por video (decisión EVD-15).

    Síncrona a propósito — el caller la corre en un thread (asyncio.to_thread),
    mismo patrón que transcribe_sync.
    """
    start = time.monotonic()
    container = av.open(video_path)
    try:
        video_stream = next((s for s in container.streams if s.type == "video"), None)
        audio_stream = next((s for s in container.streams if s.type == "audio"), None)
        if video_stream is None:
            raise ValueError("El archivo no contiene una pista de video legible")

        duracion_seg = round(_duracion_segundos(container, video_stream), 2)
        tiene_audio = audio_stream is not None

        intervalo = max(MIN_INTERVALO_SEG, math.ceil(duracion_seg / 15)) if duracion_seg > 0 else MIN_INTERVALO_SEG
        objetivos: list[float] = []
        t = 0.0
        limite = duracion_seg if duracion_seg > 0 else 1.0
        while t < limite and len(objetivos) < MAX_FRAMES:
            objetivos.append(t)
            t += intervalo
        if not objetivos:
            objetivos = [0.0]

        frames: list[dict] = []
        siguiente_idx = 0
        for frame in container.decode(video_stream):
            if siguiente_idx >= len(objetivos):
                break
            frame_time = float(frame.time) if frame.time is not None else 0.0
            if frame_time + 1e-6 >= objetivos[siguiente_idx]:
                frames.append({
                    "ts_seg": round(frame_time, 2),
                    "base64": _frame_a_jpeg_base64(frame),
                    "mime_type": "image/jpeg",
                })
                siguiente_idx += 1
        # Si el video resultó más corto que la metadata (o los timestamps no
        # alcanzan todos los objetivos), nos quedamos con los frames que sí
        # se lograron capturar — mejor menos frames que fallar el pipeline.
    finally:
        container.close()

    transcript = None
    if tiene_audio:
        try:
            transcript = transcribe_sync(video_path, language)
        except Exception as e:
            # Degradación controlada: si la pista de audio existe pero no se
            # pudo transcribir (formato raro, códec no soportado por av,
            # etc.), se trata como si no hubiera audio citable — la regla de
            # citabilidad de NestJS decide qué hacer (§decisión EVD-15).
            logger.warning(
                "Video con pista de audio pero la transcripción falló — se continúa sin transcript: %s", e,
            )
            tiene_audio = False

    return {
        "duracion_seg": duracion_seg,
        "tiene_audio": tiene_audio,
        "transcript": transcript,
        "frames": frames,
        "processing_ms": round((time.monotonic() - start) * 1000),
    }
