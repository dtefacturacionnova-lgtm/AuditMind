"""Listas de sanciones — descarga + parseo (Motor CAATs #18).

Este router SOLO descarga y parsea — nunca toca la base de datos. NestJS
(apps/api/src/watchlists/watchlists.service.ts) es quien hace upsert/
deactivate contra WatchlistEntry, siguiendo el mismo principio de
"ai-service es tonto" ya usado para /connectors/parse.
"""
import logging
from typing import Literal, Optional

import httpx
from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field

from app.config import settings
from app.services.auth import verify_internal_key
from app.services.watchlists.ofac_parser import parse_sdn_xml
from app.services.watchlists.un_parser import parse_consolidated_xml

logger = logging.getLogger(__name__)

router = APIRouter()

_SOURCE_URLS = {
    "ofac": settings.OFAC_SDN_XML_URL,
    "un": settings.UN_CONSOLIDATED_XML_URL,
}


class WatchlistRecord(BaseModel):
    external_id: str
    entity_type: Literal["INDIVIDUAL", "ENTITY", "OTHER"]
    primary_name: str
    aliases: list[str] = Field(default_factory=list)
    programs: list[str] = Field(default_factory=list)
    nationality: list[str] = Field(default_factory=list)
    countries: list[str] = Field(default_factory=list)
    date_of_birth: Optional[str] = None
    place_of_birth: Optional[str] = None
    remarks: Optional[str] = None
    source_updated_at: Optional[str] = None
    raw_record: dict = Field(default_factory=dict)


class ParseWatchlistResponse(BaseModel):
    records: list[WatchlistRecord]
    fetched_count: int


@router.post("/parse/{source}", response_model=ParseWatchlistResponse)
async def parse_watchlist(
    source: Literal["ofac", "un"],
    x_internal_key: Optional[str] = Header(default=None, alias="x-internal-key"),
):
    """Descarga el XML oficial (OFAC SDN o Lista Consolidada ONU) y lo
    parsea a una forma normalizada. Timeout generoso (90s) — son archivos
    de varios MB (OFAC ronda 29MB / ~19,300 registros)."""
    verify_internal_key(x_internal_key)

    url = _SOURCE_URLS[source]
    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=90) as client:
            # User-Agent explícito — ambas fuentes devuelven contenido vacío
            # o bloquean sin uno (confirmado en vivo al diseñar esta feature).
            response = await client.get(url, headers={"User-Agent": "Mozilla/5.0 (AuditMind CAATs watchlist sync)"})
            response.raise_for_status()
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Error descargando la lista '{source}': {e}")

    try:
        parsed = parse_sdn_xml(response.content) if source == "ofac" else parse_consolidated_xml(response.content)
    except Exception as e:
        logger.exception("Error parseando la lista '%s'", source)
        raise HTTPException(status_code=502, detail=f"Error parseando la lista '{source}': {e}")

    return {"records": parsed, "fetched_count": len(parsed)}
