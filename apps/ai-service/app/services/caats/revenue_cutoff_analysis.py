"""Corte de Ingresos (Revenue Cutoff).
Analiza facturas de venta emitidas cerca del cierre de período contra su
fecha de guía de despacho/entrega, para detectar reconocimiento anticipado
(facturado sin evidencia de entrega) o patrones de "channel stuffing"
(concentración anómala de ventas justo antes del cierre). Área de riesgo
de fraude presunta por defecto bajo NIA 240.
"""
from dataclasses import dataclass, field
from typing import Any

import pandas as pd


@dataclass
class RevenueCutoffFinding:
    test_name: str
    risk_level: str
    record_count: int
    description: str
    sample_records: list[dict] = field(default_factory=list)


@dataclass
class RevenueCutoffReport:
    total_invoices: int
    total_amount: float
    period_end: str | None
    findings: list[RevenueCutoffFinding]
    risk_score: float
    daily_amounts: list[dict]
    summary: dict


def analyze_revenue_cutoff(
    records: list[dict[str, Any]],
    invoice_number_field: str = "invoice_number",
    customer_name_field: str = "customer_name",
    amount_field: str = "amount",
    invoice_date_field: str = "date",
    delivery_date_field: str = "delivery_date",
    cutoff_window_days: int = 5,
    delivery_grace_days: int = 2,
) -> RevenueCutoffReport:
    """Analiza el corte de ingresos alrededor del cierre de período."""
    if not records:
        raise ValueError("No hay facturas para analizar")

    df = pd.DataFrame(records)
    if customer_name_field not in df.columns:
        raise ValueError("Se requiere la columna de nombre de cliente")

    findings: list[RevenueCutoffFinding] = []

    df["_amount"] = pd.to_numeric(df.get(amount_field, pd.Series(dtype=float)), errors="coerce").fillna(0)
    total_amount = float(df["_amount"].sum())

    if invoice_date_field not in df.columns:
        raise ValueError("Se requiere la columna de fecha de factura")
    df["_date"] = pd.to_datetime(df[invoice_date_field], errors="coerce")
    if df["_date"].isna().all():
        raise ValueError("No se pudo interpretar ninguna fecha de factura")

    # El cierre de período se infiere como la fecha más reciente del universo
    # de facturas cargado — el usuario debe cargar exactamente el universo del
    # período que quiere evaluar (ej. el mes/trimestre de cierre).
    period_end = df["_date"].max()
    window_start = period_end - pd.Timedelta(days=cutoff_window_days)
    in_window = df[(df["_date"] >= window_start) & (df["_date"] <= period_end)]

    display_cols = [c for c in [invoice_number_field, customer_name_field, amount_field, invoice_date_field, delivery_date_field] if c in df.columns]

    # ─────────────────────────────────────────────────────────────────────
    # TEST 1 — Facturas cerca del cierre sin evidencia de entrega, o con
    # entrega registrada varios días después de la factura
    # ─────────────────────────────────────────────────────────────────────
    if delivery_date_field in df.columns:
        df["_delivery"] = pd.to_datetime(df[delivery_date_field], errors="coerce")
        window_idx = in_window.index
        missing_delivery = df.loc[window_idx][df.loc[window_idx, "_delivery"].isna()]
        late_delivery = df.loc[window_idx][
            df.loc[window_idx, "_delivery"].notna() &
            ((df.loc[window_idx, "_delivery"] - df.loc[window_idx, "_date"]).dt.days > delivery_grace_days)
        ]
        mismatch = pd.concat([missing_delivery, late_delivery]).drop_duplicates()
        if len(mismatch) > 0:
            findings.append(RevenueCutoffFinding(
                test_name="CUTOFF_DELIVERY_MISMATCH",
                risk_level="HIGH",
                record_count=len(mismatch),
                description=f"{len(mismatch)} factura(s) emitida(s) en los últimos {cutoff_window_days} días del período "
                            f"sin guía de despacho registrada, o con entrega más de {delivery_grace_days} día(s) después "
                            f"de la factura — posible reconocimiento de ingreso antes de la entrega real (NIIF 15).",
                sample_records=mismatch[display_cols].head(10).to_dict("records"),
            ))
    else:
        if len(in_window) > 0:
            findings.append(RevenueCutoffFinding(
                test_name="CUTOFF_NO_DELIVERY_DATA",
                risk_level="MEDIUM",
                record_count=len(in_window),
                description=f"{len(in_window)} factura(s) en los últimos {cutoff_window_days} días del período — no se "
                            f"cargó fecha de guía de despacho, así que no se puede confirmar si la entrega fue anterior "
                            f"o posterior al cierre. Cargar fecha de entrega para una prueba de corte completa.",
                sample_records=in_window[display_cols].head(10).to_dict("records"),
            ))

    # ─────────────────────────────────────────────────────────────────────
    # TEST 2 — Concentración anómala de facturación en los últimos días del
    # período vs. el promedio diario del resto del período
    # ─────────────────────────────────────────────────────────────────────
    daily = df.groupby(df["_date"].dt.date)["_amount"].sum()
    daily_amounts = [{"fecha": str(d), "monto": round(float(a), 2)} for d, a in daily.items()]
    rest_of_period = daily[daily.index < window_start.date()]
    window_days_present = daily[(daily.index >= window_start.date()) & (daily.index <= period_end.date())]
    if len(rest_of_period) > 0 and len(window_days_present) > 0:
        avg_rest = float(rest_of_period.mean())
        avg_window = float(window_days_present.mean())
        if avg_rest > 0 and avg_window > avg_rest * 2:
            findings.append(RevenueCutoffFinding(
                test_name="CUTOFF_CONCENTRATION",
                risk_level="MEDIUM",
                record_count=len(window_days_present),
                description=f"El promedio diario de facturación en los últimos {cutoff_window_days} días del período "
                            f"(${avg_window:,.0f}) es más del doble del promedio diario del resto del período "
                            f"(${avg_rest:,.0f}) — patrón típico de \"channel stuffing\" (empujar ventas antes del cierre).",
                sample_records=[],
            ))

    # ── Risk score ─────────────────────────────────────────────────────────
    risk_weights = {"CRITICAL": 35, "HIGH": 20, "MEDIUM": 10, "LOW": 3}
    risk_score = min(100.0, sum(risk_weights.get(f.risk_level, 0) for f in findings))

    summary = {
        "total_invoices":  len(df),
        "total_amount":    round(total_amount, 2),
        "period_end":      str(period_end.date()),
        "findings_count":  len(findings),
        "critical_count":  sum(1 for f in findings if f.risk_level == "CRITICAL"),
        "risk_score":      risk_score,
    }

    return RevenueCutoffReport(
        total_invoices=len(df),
        total_amount=round(total_amount, 2),
        period_end=str(period_end.date()),
        findings=findings,
        risk_score=risk_score,
        daily_amounts=daily_amounts,
        summary=summary,
    )
