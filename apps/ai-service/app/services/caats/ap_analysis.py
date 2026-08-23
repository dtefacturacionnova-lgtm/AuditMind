"""Tarea 2.2 — Análisis de Cuentas por Pagar (AP — Accounts Payable).
Detecta pagos duplicados, vendedores fantasma, pagos fraccionados (splitting),
pagos fuera de términos y concentración de proveedores.
"""
from dataclasses import dataclass, field
from typing import Any

import numpy as np
import pandas as pd


@dataclass
class APFinding:
    test_name: str
    risk_level: str
    record_count: int
    description: str
    sample_records: list[dict] = field(default_factory=list)


@dataclass
class APReport:
    total_invoices: int
    total_amount: float
    vendor_count: int
    findings: list[APFinding]
    risk_score: float
    vendor_concentration: list[dict]
    summary: dict


def analyze_ap(
    invoices: list[dict[str, Any]],
    amount_field: str = "amount",
    vendor_field: str = "vendor_id",
    vendor_name_field: str = "vendor_name",
    invoice_no_field: str = "invoice_number",
    date_field: str = "invoice_date",
    payment_date_field: str = "payment_date",
    approval_threshold: float = 10000.0,
    splitting_window_days: int = 7,
    splitting_threshold: float = 0.95,   # flag if splits sum to ≥95% of threshold
) -> APReport:
    """Analyze accounts payable data for fraud indicators."""
    if not invoices:
        raise ValueError("No hay facturas para analizar")

    df = pd.DataFrame(invoices)
    findings: list[APFinding] = []

    df["_amount"] = pd.to_numeric(df.get(amount_field, pd.Series(dtype=float)), errors="coerce").fillna(0)
    total_amount = float(df["_amount"].sum())

    if date_field in df.columns:
        df["_date"] = pd.to_datetime(df[date_field], errors="coerce")
    else:
        df["_date"] = pd.NaT

    # ─────────────────────────────────────────────────────────────────────────
    # TEST 1 — Duplicate invoices (same vendor + amount + date)
    # ─────────────────────────────────────────────────────────────────────────
    dup_cols = [c for c in [vendor_field, amount_field, invoice_no_field] if c in df.columns]
    if len(dup_cols) >= 2:
        dups = df[df.duplicated(subset=[vendor_field, amount_field] if vendor_field in df.columns else [amount_field], keep=False)]
        if len(dups) > 0:
            findings.append(APFinding(
                test_name="DUPLICATE_INVOICES",
                risk_level="CRITICAL",
                record_count=len(dups),
                description=f"{len(dups)} facturas con el mismo proveedor y monto (posible pago doble). "
                            f"Impacto potencial: ${dups['_amount'].sum():,.0f}",
                sample_records=dups.head(10).drop(columns=["_amount", "_date"], errors="ignore").to_dict("records"),
            ))

    # ─────────────────────────────────────────────────────────────────────────
    # TEST 2 — Invoice splitting (fraccionamiento debajo del umbral de aprobación)
    # ─────────────────────────────────────────────────────────────────────────
    if vendor_field in df.columns and not df["_date"].isna().all():
        below_threshold = df[df["_amount"] < approval_threshold].copy()
        if len(below_threshold) > 0:
            below_threshold["_week"] = below_threshold["_date"].dt.to_period("W")
            grouped = below_threshold.groupby([vendor_field, "_week"])["_amount"].agg(["sum", "count"])
            splits = grouped[(grouped["sum"] >= approval_threshold * splitting_threshold) & (grouped["count"] >= 2)]
            if len(splits) > 0:
                # El índice de `_week` es un pandas Period — no es JSON-serializable
                # de forma legible (se filtraba como objeto opaco al frontend, ver
                # el mismo fix aplicado en expenses_analysis.py::SPLIT_EXPENSES).
                split_rows = [
                    {
                        vendor_field:      v,
                        "semana":          f"{week.start_time.date()} a {week.end_time.date()}",
                        "suma_gastos":     round(float(row["sum"]), 2),
                        "cantidad_gastos": int(row["count"]),
                    }
                    for (v, week), row in splits.iterrows()
                ]
                findings.append(APFinding(
                    test_name="INVOICE_SPLITTING",
                    risk_level="HIGH",
                    record_count=int(splits["count"].sum()),
                    description=f"Posible fraccionamiento detectado en {len(splits)} combinaciones proveedor/semana. "
                                f"Múltiples facturas individuales < ${approval_threshold:,.0f} que suman ≥ umbral de aprobación.",
                    sample_records=split_rows[:10],
                ))

    # ─────────────────────────────────────────────────────────────────────────
    # TEST 3 — Ghost vendors (proveedores sin nombre o con nombre genérico)
    # ─────────────────────────────────────────────────────────────────────────
    if vendor_name_field in df.columns:
        ghost_patterns = ["test", "proveedor", "vendor", "xxx", "n/a", "na", "temporal", "temp"]
        ghost_mask = df[vendor_name_field].str.lower().str.strip().apply(
            lambda x: any(p in str(x).lower() for p in ghost_patterns) if pd.notna(x) else True
        )
        ghosts = df[ghost_mask]
        if len(ghosts) > 0:
            findings.append(APFinding(
                test_name="GHOST_VENDORS",
                risk_level="CRITICAL",
                record_count=len(ghosts),
                description=f"{len(ghosts)} facturas de proveedores con nombre sospechoso o vacío. "
                            f"Total: ${ghosts['_amount'].sum():,.0f}. Verificar existencia legal del proveedor.",
                sample_records=ghosts.head(10).drop(columns=["_amount", "_date"], errors="ignore").to_dict("records"),
            ))

    # ─────────────────────────────────────────────────────────────────────────
    # TEST 4 — Payments outside normal terms (retrasos excesivos o adelantos)
    # ─────────────────────────────────────────────────────────────────────────
    if payment_date_field in df.columns and not df["_date"].isna().all():
        df["_payment_date"] = pd.to_datetime(df[payment_date_field], errors="coerce")
        df["_days_to_pay"] = (df["_payment_date"] - df["_date"]).dt.days
        extreme = df[df["_days_to_pay"].notna() & ((df["_days_to_pay"] < 0) | (df["_days_to_pay"] > 90))]
        if len(extreme) > 0:
            early = extreme[extreme["_days_to_pay"] < 0]
            late  = extreme[extreme["_days_to_pay"] > 90]
            if len(early) > 0:
                findings.append(APFinding(
                    test_name="EARLY_PAYMENT",
                    risk_level="HIGH",
                    record_count=len(early),
                    description=f"{len(early)} pagos realizados ANTES de la fecha de factura. Posible fraude o error.",
                    sample_records=early.head(10).drop(columns=["_amount", "_date", "_payment_date", "_days_to_pay"], errors="ignore").to_dict("records"),
                ))
            if len(late) > 0:
                findings.append(APFinding(
                    test_name="LATE_PAYMENT",
                    risk_level="LOW",
                    record_count=len(late),
                    description=f"{len(late)} pagos con más de 90 días desde la factura. Revisar condiciones contractuales.",
                    sample_records=[],
                ))

    # ─────────────────────────────────────────────────────────────────────────
    # TEST 5 — Vendor concentration
    # ─────────────────────────────────────────────────────────────────────────
    vendor_concentration: list[dict] = []
    if vendor_field in df.columns:
        vendor_totals = df.groupby(vendor_field)["_amount"].sum().sort_values(ascending=False)
        total = vendor_totals.sum()
        top_vendors = vendor_totals.head(10)
        vendor_concentration = [
            {
                "vendor_id": v,
                "total_amount": round(float(a), 2),
                "pct_of_total": round(float(a / total * 100), 1) if total else 0,
            }
            for v, a in top_vendors.items()
        ]
        top3_pct = float(vendor_totals.head(3).sum() / total * 100) if total else 0
        if top3_pct > 50:
            findings.append(APFinding(
                test_name="VENDOR_CONCENTRATION",
                risk_level="MEDIUM",
                record_count=3,
                description=f"Los 3 principales proveedores concentran el {top3_pct:.1f}% del gasto total. "
                            f"Revisar conflictos de interés y dependencia.",
                sample_records=vendor_concentration[:3],
            ))

    # ── Risk score ─────────────────────────────────────────────────────────────
    risk_weights = {"CRITICAL": 35, "HIGH": 20, "MEDIUM": 10, "LOW": 3}
    risk_score = min(100.0, sum(risk_weights.get(f.risk_level, 0) for f in findings))

    vendor_count = int(df[vendor_field].nunique()) if vendor_field in df.columns else 0

    summary = {
        "total_invoices":  len(df),
        "total_amount":    round(total_amount, 2),
        "vendor_count":    vendor_count,
        "findings_count":  len(findings),
        "critical_count":  sum(1 for f in findings if f.risk_level == "CRITICAL"),
        "risk_score":      risk_score,
    }

    return APReport(
        total_invoices=len(df),
        total_amount=round(total_amount, 2),
        vendor_count=vendor_count,
        findings=findings,
        risk_score=risk_score,
        vendor_concentration=vendor_concentration,
        summary=summary,
    )
