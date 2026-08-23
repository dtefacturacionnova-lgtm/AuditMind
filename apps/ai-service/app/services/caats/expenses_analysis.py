"""Gastos de Representación / Viáticos (T&E — Travel & Expenses).
Detecta gastos justo bajo el umbral de aprobación, fraccionamiento (varios
gastos del mismo empleado que individualmente no superan el umbral pero
sumados sí), gastos en fin de semana, gastos duplicados y concentración
de gasto en un solo empleado. Mismo espíritu que AP (fraccionamiento de
facturas) pero sobre el ciclo de gastos de representación/viáticos.
"""
from dataclasses import dataclass, field
from typing import Any

import pandas as pd


@dataclass
class ExpenseFinding:
    test_name: str
    risk_level: str
    record_count: int
    description: str
    sample_records: list[dict] = field(default_factory=list)


@dataclass
class ExpenseReport:
    total_expenses: int
    total_amount: float
    employee_count: int
    findings: list[ExpenseFinding]
    risk_score: float
    employee_concentration: list[dict]
    summary: dict


def analyze_expenses(
    records: list[dict[str, Any]],
    amount_field: str = "amount",
    employee_id_field: str = "employee_id",
    employee_name_field: str = "employee_name",
    date_field: str = "date",
    category_field: str = "category",
    approver_field: str = "approved_by",
    approval_threshold: float = 100.0,
    near_threshold_margin: float = 0.10,   # dentro del 10% por debajo del umbral
    splitting_window_days: int = 7,
) -> ExpenseReport:
    """Analiza gastos de representación/viáticos para indicios de fraude."""
    if not records:
        raise ValueError("No hay gastos para analizar")

    df = pd.DataFrame(records)
    if employee_name_field not in df.columns:
        raise ValueError("Se requiere la columna de nombre de empleado")

    findings: list[ExpenseFinding] = []

    df["_amount"] = pd.to_numeric(df.get(amount_field, pd.Series(dtype=float)), errors="coerce").fillna(0)
    total_amount = float(df["_amount"].sum())

    if date_field in df.columns:
        df["_date"] = pd.to_datetime(df[date_field], errors="coerce")
    else:
        df["_date"] = pd.NaT

    display_cols = [c for c in [employee_id_field, employee_name_field, amount_field, date_field, category_field, approver_field] if c in df.columns]

    # ─────────────────────────────────────────────────────────────────────
    # TEST 1 — Gastos justo debajo del umbral de aprobación (individual)
    # ─────────────────────────────────────────────────────────────────────
    near_threshold = df[
        (df["_amount"] >= approval_threshold * (1 - near_threshold_margin)) &
        (df["_amount"] < approval_threshold)
    ]
    if len(near_threshold) > 0:
        findings.append(ExpenseFinding(
            test_name="NEAR_APPROVAL_THRESHOLD",
            risk_level="MEDIUM",
            record_count=len(near_threshold),
            description=f"{len(near_threshold)} gasto(s) dentro del {near_threshold_margin*100:.0f}% por debajo del umbral "
                        f"de aprobación (${approval_threshold:,.0f}) — patrón típico de gasto ajustado a propósito para "
                        f"evitar una aprobación adicional.",
            sample_records=near_threshold[display_cols].head(10).to_dict("records"),
        ))

    # ─────────────────────────────────────────────────────────────────────
    # TEST 2 — Fraccionamiento: mismo empleado, misma ventana de tiempo,
    # varios gastos bajo el umbral que suman por encima de él
    # ─────────────────────────────────────────────────────────────────────
    if employee_name_field in df.columns and not df["_date"].isna().all():
        below = df[df["_amount"] < approval_threshold].copy()
        if len(below) > 0:
            below["_week"] = below["_date"].dt.to_period("W")
            grouped = below.groupby([employee_name_field, "_week"])["_amount"].agg(["sum", "count"])
            splits = grouped[(grouped["sum"] >= approval_threshold) & (grouped["count"] >= 2)]
            if len(splits) > 0:
                # El índice de `_week` es un pandas Period — no es JSON-serializable
                # de forma legible (se filtraba como objeto opaco al frontend).
                # Se convierte a un rango de fechas en texto antes de exportar.
                split_rows = [
                    {
                        employee_name_field: emp,
                        "semana":            f"{week.start_time.date()} a {week.end_time.date()}",
                        "suma_gastos":       round(float(row["sum"]), 2),
                        "cantidad_gastos":   int(row["count"]),
                    }
                    for (emp, week), row in splits.iterrows()
                ]
                findings.append(ExpenseFinding(
                    test_name="SPLIT_EXPENSES",
                    risk_level="HIGH",
                    record_count=int(splits["count"].sum()),
                    description=f"Posible fraccionamiento en {len(splits)} combinación(es) empleado/semana — múltiples "
                                f"gastos individuales < ${approval_threshold:,.0f} que suman ≥ el umbral de aprobación.",
                    sample_records=split_rows[:10],
                ))

    # ─────────────────────────────────────────────────────────────────────
    # TEST 3 — Gastos en fin de semana
    # ─────────────────────────────────────────────────────────────────────
    if not df["_date"].isna().all():
        weekend = df[df["_date"].notna() & (df["_date"].dt.dayofweek >= 5)]
        if len(weekend) > 0:
            findings.append(ExpenseFinding(
                test_name="WEEKEND_EXPENSES",
                risk_level="MEDIUM",
                record_count=len(weekend),
                description=f"{len(weekend)} gasto(s) registrados en fin de semana — requieren justificación de negocio "
                            f"(viaje, evento con cliente, etc.).",
                sample_records=weekend[display_cols].head(10).to_dict("records"),
            ))

    # ─────────────────────────────────────────────────────────────────────
    # TEST 4 — Gastos duplicados (mismo empleado, mismo monto, misma fecha)
    # ─────────────────────────────────────────────────────────────────────
    dup_cols = [c for c in [employee_name_field, amount_field, date_field] if c in df.columns]
    if len(dup_cols) >= 2:
        dups = df[df.duplicated(subset=dup_cols, keep=False)]
        if len(dups) > 0:
            findings.append(ExpenseFinding(
                test_name="DUPLICATE_EXPENSES",
                risk_level="HIGH",
                record_count=len(dups),
                description=f"{len(dups)} gasto(s) con el mismo empleado, monto y fecha — posible reembolso duplicado.",
                sample_records=dups[display_cols].head(10).to_dict("records"),
            ))

    # ─────────────────────────────────────────────────────────────────────
    # TEST 5 — Concentración en un empleado
    # ─────────────────────────────────────────────────────────────────────
    employee_concentration: list[dict] = []
    if employee_name_field in df.columns:
        emp_totals = df.groupby(employee_name_field)["_amount"].sum().sort_values(ascending=False)
        total = emp_totals.sum()
        top_employees = emp_totals.head(10)
        employee_concentration = [
            {
                "empleado": e,
                "monto_total": round(float(a), 2),
                "pct_del_total": round(float(a / total * 100), 1) if total else 0,
            }
            for e, a in top_employees.items()
        ]
        top3_pct = float(emp_totals.head(3).sum() / total * 100) if total else 0
        if top3_pct > 50 and len(emp_totals) > 3:
            findings.append(ExpenseFinding(
                test_name="EMPLOYEE_CONCENTRATION",
                risk_level="MEDIUM",
                record_count=3,
                description=f"Los 3 empleados con más gasto concentran el {top3_pct:.1f}% del total de gastos de "
                            f"representación — revisar si es consistente con sus funciones/rol.",
                sample_records=employee_concentration[:3],
            ))

    # ── Risk score ─────────────────────────────────────────────────────────
    risk_weights = {"CRITICAL": 35, "HIGH": 20, "MEDIUM": 10, "LOW": 3}
    risk_score = min(100.0, sum(risk_weights.get(f.risk_level, 0) for f in findings))

    employee_count = int(df[employee_name_field].nunique()) if employee_name_field in df.columns else 0

    summary = {
        "total_expenses":  len(df),
        "total_amount":    round(total_amount, 2),
        "employee_count":  employee_count,
        "findings_count":  len(findings),
        "critical_count":  sum(1 for f in findings if f.risk_level == "CRITICAL"),
        "risk_score":      risk_score,
    }

    return ExpenseReport(
        total_expenses=len(df),
        total_amount=round(total_amount, 2),
        employee_count=employee_count,
        findings=findings,
        risk_score=risk_score,
        employee_concentration=employee_concentration,
        summary=summary,
    )
