"""Autenticación interna compartida entre servicios — NestJS llama con el header x-internal-key.

Factorizado desde las copias en agents.py/analytics.py/scriptorium.py (las 3 quedan
como están; los routers nuevos usan este helper en vez de copiarlo una cuarta vez).
"""
from fastapi import HTTPException

from app.config import settings


def verify_internal_key(x_internal_key: str | None) -> None:
    """Verifica que la petición viene de nuestra API NestJS (llamada interna de servicio)."""
    if not x_internal_key or x_internal_key != settings.INTERNAL_API_KEY:
        raise HTTPException(status_code=401, detail="Clave interna inválida")
