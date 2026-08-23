"""Pitufeo / Smurfing (Structuring).
Detecta fraccionamiento de depósitos o transacciones en montos menores
al umbral de reporte regulatorio (Fase de Colocación del lavado de
activos, GAFI Rec. 20) — transacciones individuales justo bajo el
umbral, y patrones de múltiples transacciones del mismo titular que
sumadas superan el umbral en una ventana corta de tiempo.
"""
from dataclasses import dataclass, field
from typing import Any

import pandas as pd


@dataclass
class StructuringFinding:
    test_name: str
    risk_level: str
    record_count: int
    description: str
    sample_records: list[dict] = field(default_factory=list)


@dataclass
class StructuringReport:
    total_transactions: int
    total_amount: float
    account_count: int
    findings: list[StructuringFinding]
    risk_score: float
    summary: dict


def analyze_structuring(
    records: list[dict[str, Any]],
    account_holder_field: str = "account_holder",
    amount_field: str = "amount",
    date_field: str = "date",
    reporting_threshold: float = 10000.0,
    near_threshold_margin: float = 0.10,
    structuring_window_days: int = 3,
) -> StructuringReport:
    """Analiza transacciones para indicios de fraccionamiento (pitufeo)."""
    if not records:
        raise ValueError("No hay transacciones para analizar")

    df = pd.DataFrame(records)
    required = [account_holder_field, amount_field, date_field]
    missing = [c for c in required if c not in df.columns]
    if missing:
        raise ValueError(f"Faltan columnas requeridas: {', '.join(missing)}")

    df["_amount"] = pd.to_numeric(df[amount_field], errors="coerce").fillna(0)
    df["_date"] = pd.to_datetime(df[date_field], errors="coerce")
    total_amount = float(df["_amount"].sum())

    findings: list[StructuringFinding] = []
    display_cols = [account_holder_field, amount_field, date_field]

    # ─────────────────────────────────────────────────────────────────────
    # TEST 1 — Transacciones individuales justo bajo el umbral de reporte
    # ─────────────────────────────────────────────────────────────────────
    near_threshold = df[
        (df["_amount"] >= reporting_threshold * (1 - near_threshold_margin)) &
        (df["_amount"] < reporting_threshold)
    ]
    if len(near_threshold) > 0:
        findings.append(StructuringFinding(
            test_name="NEAR_REPORTING_THRESHOLD",
            risk_level="HIGH",
            record_count=len(near_threshold),
            description=f"{len(near_threshold)} transacción(es) dentro del {near_threshold_margin*100:.0f}% por debajo "
                        f"del umbral de reporte (${reporting_threshold:,.0f}) — patrón típico de fraccionamiento "
                        f"deliberado para evitar el reporte regulatorio.",
            sample_records=near_threshold[display_cols].head(10).to_dict("records"),
        ))

    # ─────────────────────────────────────────────────────────────────────
    # TEST 2 — Múltiples transacciones del mismo titular en una ventana
    # corta que suman por encima del umbral (fraccionamiento propiamente)
    # ─────────────────────────────────────────────────────────────────────
    if not df["_date"].isna().all():
        below = df[df["_amount"] < reporting_threshold].copy().sort_values("_date")
        structuring_groups: list[dict] = []
        for holder, group in below.groupby(account_holder_field):
            group = group.sort_values("_date").reset_index(drop=True)
            i = 0
            while i < len(group):
                window_end = group.loc[i, "_date"] + pd.Timedelta(days=structuring_window_days)
                window = group[(group["_date"] >= group.loc[i, "_date"]) & (group["_date"] <= window_end)]
                if len(window) >= 2 and float(window["_amount"].sum()) >= reporting_threshold:
                    structuring_groups.append({
                        account_holder_field: holder,
                        "ventana":            f"{group.loc[i, '_date'].date()} a {window_end.date()}",
                        "suma":               round(float(window["_amount"].sum()), 2),
                        "cantidad":           int(len(window)),
                    })
                    i += len(window)
                else:
                    i += 1
        if structuring_groups:
            findings.append(StructuringFinding(
                test_name="STRUCTURING_PATTERN",
                risk_level="CRITICAL",
                record_count=sum(g["cantidad"] for g in structuring_groups),
                description=f"{len(structuring_groups)} patrón(es) de fraccionamiento detectado(s) — mismo titular con "
                            f"2 o más transacciones en {structuring_window_days} día(s) que suman ≥ el umbral de reporte "
                            f"(${reporting_threshold:,.0f}). Firma clásica de \"pitufeo\" (GAFI Rec. 20).",
                sample_records=structuring_groups[:10],
            ))

    # ── Risk score ─────────────────────────────────────────────────────────
    risk_weights = {"CRITICAL": 35, "HIGH": 20, "MEDIUM": 10, "LOW": 3}
    risk_score = min(100.0, sum(risk_weights.get(f.risk_level, 0) for f in findings))

    summary = {
        "total_transactions": len(df),
        "total_amount":       round(total_amount, 2),
        "account_count":      int(df[account_holder_field].nunique()),
        "findings_count":     len(findings),
        "critical_count":     sum(1 for f in findings if f.risk_level == "CRITICAL"),
        "risk_score":         risk_score,
    }

    return StructuringReport(
        total_transactions=len(df),
        total_amount=round(total_amount, 2),
        account_count=int(df[account_holder_field].nunique()),
        findings=findings,
        risk_score=risk_score,
        summary=summary,
    )
