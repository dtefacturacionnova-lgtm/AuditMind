"""Missing Trader / Carrusel de IVA.
Detecta la firma transaccional del fraude "Missing Trader" (fraude
carrusel de IVA): un proveedor que concentra un volumen de transacciones
alto en una ventana corta de actividad — aparece, factura fuerte, y deja
de operar — combinado, cuando hay datos de identidad, con NIT/dirección
débil o ausente. NO puede confirmar que el IVA cobrado no fue enterado a
la administración tributaria (dato fuera del alcance de este análisis);
señala el patrón transaccional consistente con el esquema.
"""
import unicodedata
from dataclasses import dataclass, field
from typing import Any

import pandas as pd


@dataclass
class MissingTraderFinding:
    test_name: str
    risk_level: str
    record_count: int
    description: str
    sample_records: list[dict] = field(default_factory=list)


@dataclass
class MissingTraderReport:
    total_transactions: int
    total_amount: float
    vendor_count: int
    findings: list[MissingTraderFinding]
    risk_score: float
    vendor_activity: list[dict]
    summary: dict


def _norm(text: Any) -> str:
    if pd.isna(text) or text is None:
        return ""
    normalized = unicodedata.normalize("NFD", str(text).strip().lower())
    return "".join(c for c in normalized if unicodedata.category(c) != "Mn")


def analyze_missing_trader(
    records: list[dict[str, Any]],
    vendor_name_field: str = "vendor_name",
    amount_field: str = "amount",
    date_field: str = "date",
    tax_id_field: str = "tax_id",
    address_field: str = "address",
    burst_window_days: int = 30,
    volume_percentile: float = 0.75,
    min_vendors_for_percentile: int = 4,
) -> MissingTraderReport:
    """Detecta el patrón transaccional de proveedores tipo 'missing trader'."""
    if not records:
        raise ValueError("No hay transacciones para analizar")

    df = pd.DataFrame(records)
    required = [vendor_name_field, amount_field, date_field]
    missing = [c for c in required if c not in df.columns]
    if missing:
        raise ValueError(f"Faltan columnas requeridas: {', '.join(missing)}")

    df["_amount"] = pd.to_numeric(df[amount_field], errors="coerce").fillna(0)
    df["_date"] = pd.to_datetime(df[date_field], errors="coerce")
    df = df[df["_date"].notna()]
    if df.empty:
        raise ValueError("No se pudo interpretar ninguna fecha de transacción")

    findings: list[MissingTraderFinding] = []

    vendor_stats = df.groupby(vendor_name_field).agg(
        primera_transaccion=("_date", "min"),
        ultima_transaccion=("_date", "max"),
        monto_total=("_amount", "sum"),
        transacciones=("_amount", "count"),
    )
    vendor_stats["dias_actividad"] = (vendor_stats["ultima_transaccion"] - vendor_stats["primera_transaccion"]).dt.days

    vendor_activity = [
        {
            "proveedor": v, "dias_actividad": int(r["dias_actividad"]),
            "monto_total": round(float(r["monto_total"]), 2), "transacciones": int(r["transacciones"]),
            "primera_transaccion": str(r["primera_transaccion"].date()), "ultima_transaccion": str(r["ultima_transaccion"].date()),
        }
        for v, r in vendor_stats.sort_values("monto_total", ascending=False).iterrows()
    ]

    # ─────────────────────────────────────────────────────────────────────
    # TEST 1 — Actividad concentrada en una ventana corta (aparece, factura
    # fuerte, desaparece) — la firma transaccional del missing trader
    # ─────────────────────────────────────────────────────────────────────
    if len(vendor_stats) >= min_vendors_for_percentile:
        threshold = vendor_stats["monto_total"].quantile(volume_percentile)
        burst = vendor_stats[(vendor_stats["dias_actividad"] <= burst_window_days) & (vendor_stats["monto_total"] >= threshold)]
        if len(burst) > 0:
            sample = [
                {
                    "proveedor": v, "dias_actividad": int(r["dias_actividad"]),
                    "monto_total": round(float(r["monto_total"]), 2), "transacciones": int(r["transacciones"]),
                }
                for v, r in burst.sort_values("monto_total", ascending=False).iterrows()
            ]
            findings.append(MissingTraderFinding(
                test_name="BURST_ACTIVITY",
                risk_level="CRITICAL",
                record_count=len(burst),
                description=f"{len(burst)} proveedor(es) con actividad concentrada en {burst_window_days} día(s) o menos "
                            f"Y volumen dentro del {(1-volume_percentile)*100:.0f}% más alto — patrón consistente con "
                            f"\"missing trader\": aparece, factura fuerte, deja de operar. No confirma que el IVA "
                            f"facturado no fue enterado — es un indicio transaccional, requiere cruce con DGII.",
                sample_records=sample[:10],
            ))

    # ─────────────────────────────────────────────────────────────────────
    # TEST 2 — Identidad débil (NIT/dirección ausente) en proveedores de
    # monto alto
    # ─────────────────────────────────────────────────────────────────────
    if tax_id_field in df.columns or address_field in df.columns:
        id_cols = [c for c in [tax_id_field, address_field] if c in df.columns]
        vendor_identity = df.groupby(vendor_name_field)[id_cols].first()
        weak = pd.Series(True, index=vendor_identity.index)
        for c in id_cols:
            weak &= vendor_identity[c].apply(_norm) == ""
        weak_vendors = vendor_stats[vendor_stats.index.isin(vendor_identity[weak].index)]
        median_amount = vendor_stats["monto_total"].median()
        weak_high_value = weak_vendors[weak_vendors["monto_total"] >= median_amount]
        if len(weak_high_value) > 0:
            findings.append(MissingTraderFinding(
                test_name="WEAK_IDENTITY_HIGH_VALUE",
                risk_level="HIGH",
                record_count=len(weak_high_value),
                description=f"{len(weak_high_value)} proveedor(es) sin NIT ni dirección registrada, con monto total "
                            f"igual o superior a la mediana — no hay forma de verificar existencia legal, y el monto "
                            f"en juego no es trivial.",
                sample_records=[
                    {"proveedor": v, "monto_total": round(float(r["monto_total"]), 2)}
                    for v, r in weak_high_value.sort_values("monto_total", ascending=False).iterrows()
                ][:10],
            ))

    # ── Risk score ─────────────────────────────────────────────────────────
    risk_weights = {"CRITICAL": 35, "HIGH": 20, "MEDIUM": 10, "LOW": 3}
    risk_score = min(100.0, sum(risk_weights.get(f.risk_level, 0) for f in findings))

    summary = {
        "total_transactions": len(df),
        "total_amount":       round(float(df["_amount"].sum()), 2),
        "vendor_count":       int(df[vendor_name_field].nunique()),
        "findings_count":     len(findings),
        "critical_count":     sum(1 for f in findings if f.risk_level == "CRITICAL"),
        "risk_score":         risk_score,
    }

    return MissingTraderReport(
        total_transactions=len(df),
        total_amount=round(float(df["_amount"].sum()), 2),
        vendor_count=int(df[vendor_name_field].nunique()),
        findings=findings,
        risk_score=risk_score,
        vendor_activity=vendor_activity[:10],
        summary=summary,
    )
