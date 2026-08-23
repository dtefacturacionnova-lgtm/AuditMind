"""Antigüedad de Cuentas por Cobrar y Notas de Crédito.
Calcula antigüedad de saldos por cliente (buckets 0-30/31-60/61-90/90+
días vencidos) y detecta notas de crédito de monto alto emitidas cerca
del cierre de período — posible reversión de ventas de cierre ("channel
stuffing" visto desde el lado de las notas de crédito).
"""
from dataclasses import dataclass, field
from typing import Any

import pandas as pd


@dataclass
class ARAgingFinding:
    test_name: str
    risk_level: str
    record_count: int
    description: str
    sample_records: list[dict] = field(default_factory=list)


@dataclass
class ARAgingReport:
    total_invoices: int
    total_outstanding: float
    customer_count: int
    findings: list[ARAgingFinding]
    risk_score: float
    aging_buckets: list[dict]
    summary: dict


def _norm_bool(val: Any) -> bool:
    if isinstance(val, bool):
        return val
    if pd.isna(val):
        return False
    return str(val).strip().lower() in {"si", "sí", "s", "yes", "y", "true", "1", "nota de credito", "nota de crédito"}


def analyze_ar_aging(
    records: list[dict[str, Any]],
    customer_name_field: str = "customer_name",
    invoice_number_field: str = "invoice_number",
    amount_field: str = "amount",
    due_date_field: str = "due_date",
    is_credit_note_field: str = "is_credit_note",
    invoice_date_field: str = "date",
) -> ARAgingReport:
    """Calcula antigüedad de CxC y detecta notas de crédito post-cierre."""
    if not records:
        raise ValueError("No hay facturas para analizar")

    df = pd.DataFrame(records)
    if customer_name_field not in df.columns or due_date_field not in df.columns:
        raise ValueError("Se requieren las columnas de cliente y fecha de vencimiento")

    df["_amount"] = pd.to_numeric(df.get(amount_field, pd.Series(dtype=float)), errors="coerce").fillna(0)
    df["_due"] = pd.to_datetime(df[due_date_field], errors="coerce")
    df = df[df["_due"].notna()]
    if df.empty:
        raise ValueError("No se pudo interpretar ninguna fecha de vencimiento")

    is_credit_note = df[is_credit_note_field].apply(_norm_bool) if is_credit_note_field in df.columns else pd.Series(False, index=df.index)
    outstanding = df[~is_credit_note]

    as_of = df["_due"].max() if df["_due"].notna().any() else pd.Timestamp.now()
    outstanding = outstanding.copy()
    outstanding["_days_overdue"] = (as_of - outstanding["_due"]).dt.days

    findings: list[ARAgingFinding] = []
    display_cols = [c for c in [customer_name_field, invoice_number_field, amount_field, due_date_field] if c in df.columns]

    # ─────────────────────────────────────────────────────────────────────
    # Buckets de antigüedad (resumen, no un "hallazgo" en sí)
    # ─────────────────────────────────────────────────────────────────────
    bucket_defs = [("0-30 días", 0, 30), ("31-60 días", 31, 60), ("61-90 días", 61, 90), ("90+ días", 91, None)]
    aging_buckets = []
    for label, lo, hi in bucket_defs:
        if hi is None:
            mask = outstanding["_days_overdue"] >= lo
        else:
            mask = (outstanding["_days_overdue"] >= lo) & (outstanding["_days_overdue"] <= hi)
        bucket_df = outstanding[mask]
        aging_buckets.append({
            "rango": label, "facturas": len(bucket_df), "monto": round(float(bucket_df["_amount"].sum()), 2),
        })

    # ─────────────────────────────────────────────────────────────────────
    # TEST 1 — Saldos severamente vencidos (90+ días)
    # ─────────────────────────────────────────────────────────────────────
    severe = outstanding[outstanding["_days_overdue"] > 90]
    if len(severe) > 0:
        findings.append(ARAgingFinding(
            test_name="SEVERELY_OVERDUE",
            risk_level="HIGH",
            record_count=len(severe),
            description=f"{len(severe)} factura(s) con más de 90 días de vencidas, por un total de "
                        f"${float(severe['_amount'].sum()):,.0f} — evaluar deterioro/estimación de incobrables (NIA 540).",
            sample_records=severe.sort_values("_days_overdue", ascending=False)[display_cols].head(10).to_dict("records"),
        ))

    # ─────────────────────────────────────────────────────────────────────
    # TEST 2 — Concentración de vencidos en un solo cliente
    # ─────────────────────────────────────────────────────────────────────
    if len(outstanding) > 0:
        by_customer = outstanding.groupby(customer_name_field)["_amount"].sum().sort_values(ascending=False)
        total = by_customer.sum()
        top3_pct = float(by_customer.head(3).sum() / total * 100) if total else 0
        if top3_pct > 50 and len(by_customer) > 3:
            findings.append(ARAgingFinding(
                test_name="CUSTOMER_CONCENTRATION",
                risk_level="MEDIUM",
                record_count=3,
                description=f"Los 3 clientes con mayor saldo concentran el {top3_pct:.1f}% de las cuentas por cobrar "
                            f"totales — revisar riesgo de concentración de crédito.",
                sample_records=[{"cliente": c, "saldo": round(float(a), 2)} for c, a in by_customer.head(3).items()],
            ))

    # ─────────────────────────────────────────────────────────────────────
    # TEST 3 — Notas de crédito de monto alto cerca del cierre de período
    # ─────────────────────────────────────────────────────────────────────
    if is_credit_note.any():
        credit_notes = df[is_credit_note].copy()
        if invoice_date_field in df.columns:
            credit_notes["_cn_date"] = pd.to_datetime(credit_notes[invoice_date_field], errors="coerce")
        else:
            credit_notes["_cn_date"] = credit_notes["_due"]
        period_end = df["_due"].max()
        window_start = period_end - pd.Timedelta(days=15)
        near_close = credit_notes[credit_notes["_cn_date"].notna() & (credit_notes["_cn_date"] >= window_start)]
        if len(near_close) > 0:
            cn_cols = [c for c in [customer_name_field, invoice_number_field, amount_field] if c in df.columns]
            findings.append(ARAgingFinding(
                test_name="POST_PERIOD_CREDIT_NOTES",
                risk_level="MEDIUM",
                record_count=len(near_close),
                description=f"{len(near_close)} nota(s) de crédito emitida(s) en los últimos 15 días con datos "
                            f"cargados — revisar si reversan ventas registradas justo antes del cierre de período.",
                sample_records=near_close[cn_cols].head(10).to_dict("records"),
            ))

    # ── Risk score ─────────────────────────────────────────────────────────
    risk_weights = {"CRITICAL": 35, "HIGH": 20, "MEDIUM": 10, "LOW": 3}
    risk_score = min(100.0, sum(risk_weights.get(f.risk_level, 0) for f in findings))

    summary = {
        "total_invoices":    len(df),
        "total_outstanding": round(float(outstanding["_amount"].sum()), 2),
        "customer_count":    int(df[customer_name_field].nunique()),
        "findings_count":    len(findings),
        "critical_count":    sum(1 for f in findings if f.risk_level == "CRITICAL"),
        "risk_score":        risk_score,
    }

    return ARAgingReport(
        total_invoices=len(df),
        total_outstanding=round(float(outstanding["_amount"].sum()), 2),
        customer_count=int(df[customer_name_field].nunique()),
        findings=findings,
        risk_score=risk_score,
        aging_buckets=aging_buckets,
        summary=summary,
    )
