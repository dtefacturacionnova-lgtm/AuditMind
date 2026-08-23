"""Concentración en Jurisdicciones de Baja Tributación.
Analiza transferencias/transacciones contra un catálogo de referencia de
jurisdicciones comúnmente asociadas a baja o nula tributación, útil para
detectar esquemas de traslado de beneficios hacia sociedades
instrumentales o filiales (Art. 199-A Código Tributario, OCDE/BEPS).

IMPORTANTE: el catálogo de abajo es una referencia general (jurisdicciones
citadas de forma recurrente en literatura OCDE/BEPS), NO la lista oficial
vigente de "paraísos fiscales" o "sujetos a régimen fiscal preferente" que
publica el Ministerio de Hacienda/DGII de El Salvador — esa lista oficial
debe verificarse aparte y puede diferir. Este motor es un punto de partida
para la revisión, no una determinación legal.
"""
import unicodedata
from dataclasses import dataclass, field
from typing import Any

import pandas as pd

# Catálogo de referencia — no oficial, ver aviso arriba. Nombres normalizados
# (minúsculas, sin acentos) para comparar contra el país/jurisdicción cargado.
REFERENCE_LOW_TAX_JURISDICTIONS: set[str] = {
    "panama", "islas caiman", "cayman islands", "bermudas", "bermuda",
    "islas virgenes britanicas", "british virgin islands", "bvi",
    "bahamas", "andorra", "monaco", "liechtenstein", "jersey", "guernsey",
    "isla de man", "isle of man", "mauricio", "mauritius", "seychelles",
    "belice", "belize", "delaware", "luxemburgo", "luxembourg",
    "hong kong", "singapur", "singapore", "malta", "chipre", "cyprus",
    "gibraltar", "aruba", "curazao", "curacao", "anguila", "anguilla",
    "san vicente y las granadinas", "saint vincent and the grenadines",
    "islas marshall", "marshall islands", "vanuatu", "samoa",
}


@dataclass
class TaxHavenFinding:
    test_name: str
    risk_level: str
    record_count: int
    description: str
    sample_records: list[dict] = field(default_factory=list)


@dataclass
class TaxHavenReport:
    total_transactions: int
    total_amount: float
    flagged_amount: float
    flagged_pct: float
    findings: list[TaxHavenFinding]
    risk_score: float
    exposure_by_jurisdiction: list[dict]
    summary: dict


def _norm(text: Any) -> str:
    if pd.isna(text) or text is None:
        return ""
    normalized = unicodedata.normalize("NFD", str(text).strip().lower())
    return "".join(c for c in normalized if unicodedata.category(c) != "Mn")


def analyze_tax_haven_concentration(
    records: list[dict[str, Any]],
    counterparty_name_field: str = "vendor_name",
    amount_field: str = "amount",
    jurisdiction_field: str = "jurisdiction",
    date_field: str = "date",
    high_concentration_pct: float = 15.0,
) -> TaxHavenReport:
    """Analiza concentración de transacciones hacia jurisdicciones de baja tributación."""
    if not records:
        raise ValueError("No hay transacciones para analizar")

    df = pd.DataFrame(records)
    required = [counterparty_name_field, amount_field, jurisdiction_field]
    missing = [c for c in required if c not in df.columns]
    if missing:
        raise ValueError(f"Faltan columnas requeridas: {', '.join(missing)}")

    df["_amount"] = pd.to_numeric(df[amount_field], errors="coerce").fillna(0)
    df["_jurisdiction_norm"] = df[jurisdiction_field].apply(_norm)
    total_amount = float(df["_amount"].sum())

    findings: list[TaxHavenFinding] = []
    is_flagged = df["_jurisdiction_norm"].isin(REFERENCE_LOW_TAX_JURISDICTIONS)
    flagged = df[is_flagged]
    flagged_amount = float(flagged["_amount"].sum())
    flagged_pct = round(flagged_amount / total_amount * 100, 2) if total_amount else 0.0

    display_cols = [counterparty_name_field, amount_field, jurisdiction_field] + ([date_field] if date_field in df.columns else [])

    # ─────────────────────────────────────────────────────────────────────
    # TEST 1 — Transacciones hacia jurisdicciones del catálogo de referencia
    # ─────────────────────────────────────────────────────────────────────
    if len(flagged) > 0:
        findings.append(TaxHavenFinding(
            test_name="LOW_TAX_JURISDICTION_TRANSACTIONS",
            risk_level="HIGH",
            record_count=len(flagged),
            description=f"{len(flagged)} transacción(es) por ${flagged_amount:,.0f} hacia jurisdicciones del catálogo "
                        f"de referencia (baja tributación) — verificar sustancia económica real de la contraparte y "
                        f"cotejar contra la lista OFICIAL vigente de Hacienda antes de concluir (Art. 199-A CT).",
            sample_records=flagged[display_cols].sort_values(amount_field, ascending=False).head(10).to_dict("records"),
        ))

    # ─────────────────────────────────────────────────────────────────────
    # TEST 2 — Concentración desproporcionada del gasto/transferencia total
    # ─────────────────────────────────────────────────────────────────────
    if flagged_pct > high_concentration_pct:
        findings.append(TaxHavenFinding(
            test_name="HIGH_HAVEN_CONCENTRATION",
            risk_level="CRITICAL",
            record_count=len(flagged),
            description=f"El {flagged_pct:.1f}% del monto total transaccionado se dirige a jurisdicciones de baja "
                        f"tributación (umbral de referencia: {high_concentration_pct:.0f}%) — nivel de exposición "
                        f"significativo, amerita revisión de precios de transferencia (Art. 199-A CT, OCDE/BEPS).",
            sample_records=[],
        ))

    exposure_by_jurisdiction: list[dict] = []
    if len(flagged) > 0:
        by_jur = flagged.groupby(jurisdiction_field)["_amount"].agg(["sum", "count"]).sort_values("sum", ascending=False)
        exposure_by_jurisdiction = [
            {"jurisdiccion": j, "monto": round(float(r["sum"]), 2), "transacciones": int(r["count"])}
            for j, r in by_jur.iterrows()
        ][:10]

    # ── Risk score ─────────────────────────────────────────────────────────
    risk_weights = {"CRITICAL": 35, "HIGH": 20, "MEDIUM": 10, "LOW": 3}
    risk_score = min(100.0, sum(risk_weights.get(f.risk_level, 0) for f in findings))

    summary = {
        "total_transactions": len(df),
        "total_amount":       round(total_amount, 2),
        "flagged_amount":     round(flagged_amount, 2),
        "flagged_pct":        flagged_pct,
        "findings_count":     len(findings),
        "critical_count":     sum(1 for f in findings if f.risk_level == "CRITICAL"),
        "risk_score":         risk_score,
    }

    return TaxHavenReport(
        total_transactions=len(df),
        total_amount=round(total_amount, 2),
        flagged_amount=round(flagged_amount, 2),
        flagged_pct=flagged_pct,
        findings=findings,
        risk_score=risk_score,
        exposure_by_jurisdiction=exposure_by_jurisdiction,
        summary=summary,
    )
