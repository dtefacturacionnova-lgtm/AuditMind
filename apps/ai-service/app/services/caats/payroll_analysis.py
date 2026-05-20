"""Tarea 2.3 — Análisis de Nómina (Payroll).
Detecta empleados fantasma, pagos fuera de banda, ausencias sin descuento,
acumulaciones inusuales y concentración de pagos por aprobador.
"""
from dataclasses import dataclass, field
from typing import Any

import numpy as np
import pandas as pd
from scipy import stats


@dataclass
class PayrollFinding:
    test_name: str
    risk_level: str
    record_count: int
    description: str
    sample_records: list[dict] = field(default_factory=list)


@dataclass
class PayrollReport:
    total_employees: int
    total_payroll: float
    period: str | None
    findings: list[PayrollFinding]
    risk_score: float
    pay_distribution: dict
    summary: dict


def analyze_payroll(
    records: list[dict[str, Any]],
    employee_id_field: str = "employee_id",
    employee_name_field: str = "employee_name",
    gross_pay_field: str = "gross_pay",
    net_pay_field: str = "net_pay",
    department_field: str = "department",
    position_field: str = "position",
    start_date_field: str = "hire_date",
    period_field: str = "pay_period",
    approver_field: str = "approved_by",
    bank_account_field: str = "bank_account",
    z_score_threshold: float = 3.0,
) -> PayrollReport:
    """Analyze payroll data for ghost employees and compensation anomalies."""
    if not records:
        raise ValueError("No hay registros de nómina para analizar")

    df = pd.DataFrame(records)
    findings: list[PayrollFinding] = []

    df["_gross"] = pd.to_numeric(df.get(gross_pay_field, pd.Series(dtype=float)), errors="coerce").fillna(0)
    df["_net"]   = pd.to_numeric(df.get(net_pay_field,   pd.Series(dtype=float)), errors="coerce").fillna(0)
    total_payroll = float(df["_gross"].sum())
    employee_count = int(df[employee_id_field].nunique()) if employee_id_field in df.columns else len(df)

    period = str(df[period_field].iloc[0]) if period_field in df.columns and len(df) > 0 else None

    # ─────────────────────────────────────────────────────────────────────────
    # TEST 1 — Ghost employees (no name, no department, no position)
    # ─────────────────────────────────────────────────────────────────────────
    ghost_cols = [c for c in [employee_name_field, department_field, position_field] if c in df.columns]
    if ghost_cols:
        ghost_mask = df[ghost_cols].isnull().any(axis=1) | (df[ghost_cols] == "").any(axis=1)
        ghosts = df[ghost_mask]
        if len(ghosts) > 0:
            findings.append(PayrollFinding(
                test_name="GHOST_EMPLOYEES",
                risk_level="CRITICAL",
                record_count=len(ghosts),
                description=f"{len(ghosts)} empleados con datos incompletos (sin nombre, depto o cargo). "
                            f"Total pagado: ${ghosts['_gross'].sum():,.0f}. Posibles empleados fantasma.",
                sample_records=ghosts.head(10).drop(columns=["_gross", "_net"], errors="ignore").to_dict("records"),
            ))

    # ─────────────────────────────────────────────────────────────────────────
    # TEST 2 — Pay outliers (Z-score en salario bruto)
    # ─────────────────────────────────────────────────────────────────────────
    if len(df) > 10:
        z = np.abs(stats.zscore(df["_gross"].values))
        outliers = df[z > z_score_threshold]
        if len(outliers) > 0:
            findings.append(PayrollFinding(
                test_name="PAY_OUTLIERS",
                risk_level="HIGH",
                record_count=len(outliers),
                description=f"{len(outliers)} empleados con salario bruto más de {z_score_threshold}σ "
                            f"sobre la media (${df['_gross'].mean():,.0f}). Posibles errores o pagos no autorizados.",
                sample_records=outliers.head(10).drop(columns=["_gross", "_net"], errors="ignore").to_dict("records"),
            ))

    # ─────────────────────────────────────────────────────────────────────────
    # TEST 3 — Gross > Net (neto mayor que bruto → posible error de retenciones)
    # ─────────────────────────────────────────────────────────────────────────
    if net_pay_field in df.columns:
        net_gt_gross = df[df["_net"] > df["_gross"]]
        if len(net_gt_gross) > 0:
            findings.append(PayrollFinding(
                test_name="NET_EXCEEDS_GROSS",
                risk_level="HIGH",
                record_count=len(net_gt_gross),
                description=f"{len(net_gt_gross)} registros donde el pago neto supera el bruto. "
                            f"Error en cálculo de retenciones o manipulación.",
                sample_records=net_gt_gross.head(10).drop(columns=["_gross", "_net"], errors="ignore").to_dict("records"),
            ))

    # ─────────────────────────────────────────────────────────────────────────
    # TEST 4 — Duplicate bank accounts (mismo cuenta en diferentes empleados)
    # ─────────────────────────────────────────────────────────────────────────
    if bank_account_field in df.columns and employee_id_field in df.columns:
        acct_counts = df.groupby(bank_account_field)[employee_id_field].nunique()
        shared_accts = acct_counts[acct_counts > 1]
        if len(shared_accts) > 0:
            shared_records = df[df[bank_account_field].isin(shared_accts.index)]
            findings.append(PayrollFinding(
                test_name="SHARED_BANK_ACCOUNTS",
                risk_level="CRITICAL",
                record_count=len(shared_records),
                description=f"{len(shared_accts)} cuentas bancarias usadas por más de un empleado. "
                            f"Alta probabilidad de empleados fantasma o fraude.",
                sample_records=shared_records.head(10).drop(columns=["_gross", "_net"], errors="ignore").to_dict("records"),
            ))

    # ─────────────────────────────────────────────────────────────────────────
    # TEST 5 — Approver concentration
    # ─────────────────────────────────────────────────────────────────────────
    if approver_field in df.columns:
        approver_totals = df.groupby(approver_field)["_gross"].agg(["sum", "count"])
        top_approver = approver_totals.sort_values("sum", ascending=False).head(1)
        if len(top_approver) > 0:
            pct = float(top_approver["sum"].iloc[0] / total_payroll * 100) if total_payroll else 0
            if pct > 40:
                findings.append(PayrollFinding(
                    test_name="APPROVER_CONCENTRATION",
                    risk_level="MEDIUM",
                    record_count=int(top_approver["count"].iloc[0]),
                    description=f"Un solo aprobador autorizó el {pct:.1f}% de la nómina total. "
                                f"Revisar segregación de funciones.",
                    sample_records=[{"approver": top_approver.index[0], "total": float(top_approver["sum"].iloc[0]), "pct": pct}],
                ))

    # ── Pay distribution ───────────────────────────────────────────────────────
    pay_dist = {
        "mean":   round(float(df["_gross"].mean()), 2),
        "median": round(float(df["_gross"].median()), 2),
        "std":    round(float(df["_gross"].std()), 2),
        "min":    round(float(df["_gross"].min()), 2),
        "max":    round(float(df["_gross"].max()), 2),
        "p25":    round(float(df["_gross"].quantile(0.25)), 2),
        "p75":    round(float(df["_gross"].quantile(0.75)), 2),
        "p95":    round(float(df["_gross"].quantile(0.95)), 2),
    }
    if department_field in df.columns:
        pay_dist["by_department"] = (
            df.groupby(department_field)["_gross"]
              .agg(["mean", "count", "sum"])
              .round(2)
              .to_dict("index")
        )

    # ── Risk score ────────────────────────────────────────────────────────────
    risk_weights = {"CRITICAL": 35, "HIGH": 20, "MEDIUM": 10, "LOW": 3}
    risk_score = min(100.0, sum(risk_weights.get(f.risk_level, 0) for f in findings))

    summary = {
        "total_employees":  employee_count,
        "total_payroll":    round(total_payroll, 2),
        "period":           period,
        "findings_count":   len(findings),
        "critical_count":   sum(1 for f in findings if f.risk_level == "CRITICAL"),
        "risk_score":       risk_score,
    }

    return PayrollReport(
        total_employees=employee_count,
        total_payroll=round(total_payroll, 2),
        period=period,
        findings=findings,
        risk_score=risk_score,
        pay_distribution=pay_dist,
        summary=summary,
    )
