"""Matching difuso de nombres contra la copia local de OFAC SDN + Lista
Consolidada ONU — Motor CAATs #18.

Lee watchlist_entries directamente vía asyncpg (única excepción documentada
al patrón "NestJS orquesta, ai-service es tonto" — el dataset es de
plataforma, no de auditoría, y reserializarlo completo en cada request de
screening es más caro que esta consulta local de solo lectura). Consulta
deliberadamente trivial (una tabla, un WHERE) para minimizar el riesgo real
de que los nombres de columna camelCase entre-comillados de Prisma se
desincronicen con este SQL crudo sin que nada lo detecte en compilación —
si se agrega/renombra un campo en el modelo WatchlistEntry
(apps/api/prisma/schema.prisma), esta consulta debe actualizarse a mano.
"""
import asyncpg
from dataclasses import dataclass
from rapidfuzz import fuzz, process, utils

from app.config import settings

# Punto de partida ajustable, no una calibración de compliance — ver plan de
# diseño. WRatio combina orden de palabras (nombre invertido) y variación de
# longitud (sufijos legales "Ltd"/"Limited") en un solo score.
DEFAULT_THRESHOLD = 87.0
_HIGH_CONFIDENCE_THRESHOLD = 95.0


@dataclass
class MatchCandidate:
    matched_name: str  # nombre principal o alias que produjo el match
    match_type: str  # "primary" | "alias"
    score: float
    entry_id: str
    source_list: str
    external_id: str
    entity_type: str
    programs: list[str]
    primary_name: str  # nombre principal de la entrada (aunque el match haya sido por un alias)


async def _fetch_active_entries() -> list[dict]:
    conn = await asyncpg.connect(settings.DATABASE_URL)
    try:
        rows = await conn.fetch(
            'SELECT id, "sourceList", "externalId", "primaryName", aliases, "entityType", programs '
            'FROM watchlist_entries WHERE active = true'
        )
        return [dict(r) for r in rows]
    finally:
        await conn.close()


def _build_variant_index(entries: list[dict]) -> tuple[list[str], list[dict]]:
    """Expande cada entrada en una fila por variante de nombre (principal +
    cada alias) — cada variante recuerda a qué entrada pertenece y si vino
    del nombre principal o de un alias, para reportarlo en el resultado."""
    choices: list[str] = []
    meta: list[dict] = []
    for entry in entries:
        choices.append(entry["primaryName"])
        meta.append({"entry": entry, "match_type": "primary", "matched_name": entry["primaryName"]})
        for alias in entry["aliases"] or []:
            if not alias:
                continue
            choices.append(alias)
            meta.append({"entry": entry, "match_type": "alias", "matched_name": alias})
    return choices, meta


async def screen_names(query_names: list[str], threshold: float = DEFAULT_THRESHOLD) -> dict[str, list[MatchCandidate]]:
    """Para cada nombre en query_names, devuelve las variantes de la lista
    de sanciones que superan el umbral, ordenadas por score descendente
    (máximo 5 por nombre — más que eso no aporta al auditor)."""
    entries = await _fetch_active_entries()
    if not entries:
        return {name: [] for name in query_names}

    choices, meta = _build_variant_index(entries)

    results: dict[str, list[MatchCandidate]] = {}
    for name in query_names:
        clean_name = (name or "").strip()
        if not clean_name:
            results[name] = []
            continue

        # processor=utils.default_process es OBLIGATORIO — rapidfuzz.fuzz.*
        # es sensible a mayúsculas/minúsculas por defecto (confirmado en vivo:
        # "Muhammad Zaydan" vs "Muhammad ZAYDAN" da 66.7 sin normalizar y 100.0
        # con ella). default_process hace lowercase + colapsa no-alfanumérico
        # a espacio + recorta — exactamente lo que un nombre de entidad necesita.
        matches = process.extract(
            clean_name, choices, scorer=fuzz.WRatio, processor=utils.default_process,
            limit=5, score_cutoff=threshold,
        )
        candidates: list[MatchCandidate] = []
        seen_entries: set[str] = set()  # una entrada puede matchear por nombre Y alias — reportar solo la mejor
        for _, score, idx in matches:
            m = meta[idx]
            entry = m["entry"]
            if entry["id"] in seen_entries:
                continue
            seen_entries.add(entry["id"])
            candidates.append(MatchCandidate(
                matched_name=m["matched_name"],
                match_type=m["match_type"],
                score=round(float(score), 1),
                entry_id=entry["id"],
                source_list=entry["sourceList"],
                external_id=entry["externalId"],
                entity_type=entry["entityType"],
                programs=list(entry["programs"] or []),
                primary_name=entry["primaryName"],
            ))
        results[clean_name] = candidates

    return results


def risk_level_for_score(score: float) -> str:
    return "CRITICAL" if score >= _HIGH_CONFIDENCE_THRESHOLD else "HIGH"


# Mismo orden/cobertura que ALL_SOURCE_LISTS en
# apps/api/src/watchlists/watchlists.service.ts — EU queda fuera (bloqueo de
# cuenta registrada, ver apps/ai-service/app/config.py).
_SOURCE_LIST_LABELS = {
    "OFAC_SDN": "OFAC SDN",
    "UN_CONSOLIDATED": "ONU Consolidada",
    "UK_SANCTIONS": "UK Sanctions List",
}


async def get_lists_consulted_summary() -> str:
    """Texto legible de qué listas se consultaron y con qué fecha de última
    sincronización exitosa — para que el papel de trabajo que embebe este
    motor (PT-PLD) quede como evidencia autocontenida de qué se revisó, sin
    depender de que nadie vaya a mirar Administración → Listas de Sanciones
    por separado. Si una lista nunca sincronizó, se dice explícitamente en
    vez de omitirla en silencio."""
    conn = await asyncpg.connect(settings.DATABASE_URL)
    try:
        rows = await conn.fetch(
            'SELECT DISTINCT ON ("sourceList") "sourceList", "completedAt" '
            'FROM watchlist_syncs WHERE status = \'COMPLETED\' '
            'ORDER BY "sourceList", "completedAt" DESC'
        )
    finally:
        await conn.close()

    last_sync = {r["sourceList"]: r["completedAt"] for r in rows}
    parts = []
    for source_list, label in _SOURCE_LIST_LABELS.items():
        completed_at = last_sync.get(source_list)
        if completed_at is None:
            parts.append(f"{label} (sin sincronizar)")
        else:
            parts.append(f"{label} (sync {completed_at.strftime('%d/%m/%Y')})")
    return ", ".join(parts)
