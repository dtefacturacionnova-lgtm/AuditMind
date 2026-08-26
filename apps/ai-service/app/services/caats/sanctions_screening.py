"""Screening de Sanciones (OFAC + ONU) — Motor CAATs #18.
Toma el listado de proveedores/clientes del auditor y busca coincidencias
difusas contra la copia local de OFAC SDN + Lista Consolidada ONU
(watchlist_entries, sincronizada por apps/api/src/watchlists). A diferencia
de los otros 17 motores, éste SÍ necesita datos externos (ver
app/services/watchlists/matcher.py para la justificación de por qué lee la
base directamente en vez de recibir los datos por parámetro).

Umbral y bandas de riesgo son puntos de partida ajustables, no una
calibración de compliance — ver docs/... (plan de diseño de esta feature).
"""
from dataclasses import dataclass, field
from typing import Any

from app.services.watchlists.matcher import screen_names, risk_level_for_score, DEFAULT_THRESHOLD


@dataclass
class SanctionsScreeningFinding:
    test_name: str
    risk_level: str
    record_count: int
    description: str
    sample_records: list[dict] = field(default_factory=list)


@dataclass
class SanctionsScreeningReport:
    total_screened: int
    matches_found: int
    findings: list[SanctionsScreeningFinding]
    risk_score: float
    summary: dict


async def analyze_sanctions_screening(
    vendors: list[dict[str, Any]],
    vendor_name_field: str = "vendor_name",
    tax_id_field: str = "tax_id",
    jurisdiction_field: str = "jurisdiction",
    threshold: float = DEFAULT_THRESHOLD,
) -> SanctionsScreeningReport:
    if not vendors:
        raise ValueError("No hay proveedores/clientes para analizar")
    if not any(vendor_name_field in v for v in vendors):
        raise ValueError("Se requiere la columna de nombre de proveedor/cliente mapeada")

    names = [str(v.get(vendor_name_field, "")).strip() for v in vendors]
    unique_names = sorted({n for n in names if n})
    if not unique_names:
        raise ValueError("No hay nombres válidos para analizar tras limpiar el campo mapeado")

    matches_by_name = await screen_names(unique_names, threshold=threshold)

    findings: list[SanctionsScreeningFinding] = []
    sample_records: list[dict] = []
    matched_names: set[str] = set()

    for vendor in vendors:
        name = str(vendor.get(vendor_name_field, "")).strip()
        if not name:
            continue
        candidates = matches_by_name.get(name, [])
        if not candidates:
            continue
        matched_names.add(name)
        best = candidates[0]
        # País/NIT: solo se anotan como contexto — nunca ajustan el score ni
        # la decisión de match/no-match en silencio (el humano siempre revisa).
        jurisdiction = str(vendor.get(jurisdiction_field, "")).strip() if jurisdiction_field in vendor else ""
        tax_id = str(vendor.get(tax_id_field, "")).strip() if tax_id_field in vendor else ""
        annotation = None
        if jurisdiction and best.programs:
            annotation = f"Jurisdicción declarada del proveedor: {jurisdiction} (verificar contra programas/países de la coincidencia)"

        sample_records.append({
            "uploaded_name": name,
            "matched_watchlist_name": best.matched_name,
            "match_type": best.match_type,
            "score": best.score,
            "source_list": best.source_list,
            "external_id": best.external_id,
            "entity_type": best.entity_type,
            "programs": best.programs,
            "primary_name_on_list": best.primary_name,
            "tax_id_uploaded": tax_id or None,
            "jurisdiction_note": annotation,
            "other_candidates": [
                {"matched_name": c.matched_name, "score": c.score, "source_list": c.source_list}
                for c in candidates[1:]
            ],
        })

    if sample_records:
        # Nivel de riesgo del hallazgo agregado = el más alto entre todas las
        # coincidencias (una sola coincidencia CRITICAL basta para escalar).
        best_score = max(r["score"] for r in sample_records)
        findings.append(SanctionsScreeningFinding(
            test_name="SANCTIONS_LIST_MATCH",
            risk_level=risk_level_for_score(best_score),
            record_count=len(sample_records),
            description=(
                f"{len(sample_records)} proveedor(es)/cliente(s) con nombre similar a una entrada activa "
                f"de OFAC SDN o la Lista Consolidada ONU (umbral de similitud: {threshold:.0f}%). "
                f"Requiere verificación manual — el matching difuso puede producir falsos positivos "
                f"(homónimos, nombres comunes) tanto como falsos negativos (variantes no capturadas)."
            ),
            sample_records=sample_records[:20],
        ))

    risk_weights = {"CRITICAL": 35, "HIGH": 20, "MEDIUM": 10, "LOW": 3}
    risk_score = min(100.0, sum(risk_weights.get(f.risk_level, 0) for f in findings))

    summary = {
        "total_screened": len(unique_names),
        "matches_found": len(matched_names),
        "threshold": threshold,
        "risk_score": risk_score,
    }

    return SanctionsScreeningReport(
        total_screened=len(unique_names),
        matches_found=len(matched_names),
        findings=findings,
        risk_score=risk_score,
        summary=summary,
    )
