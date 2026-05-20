"""Tarea 2.1 — Análisis de Diario Mayor (GL — General Ledger).
Detecta patrones de riesgo en asientos contables: montos redondos,
asientos de fin de período, autorizaciones inusuales, duplicados.
"""
from dataclasses import dataclass, field
from datetime import datetime, date
from typing import Any

import numpy as np
import pandas as pd


@dataclass
class GLFinding:
    test_name: str
    risk_level: str          # LOW | MEDIUM | HIGH | CRITICAL
    record_count: int
    description: str
    sample_records: list[dict] = field(default_factory=list)


@dataclass
class GLReport:
    total_entries: int
    total_amount: float
    period_start: str | None
    period_end: str | None
    findings: list[GLFinding]
    risk_score: float
    summary: dict


def analyze_gl(
    entries: list[dict[str, Any]],
    amount_field: str = "amount",
    date_field: str = "date",
    user_field: str = "posted_by",
    account_field: str = "account_code",
    description_field: str = "description",
    round_threshold: float = 1000.0,
    end_of_period_days: int = 3,
) -> GLReport:
    """
    Analyze general ledger entries for audit risks.

    Common fields: amount, date, posted_by, account_code, description,
                   journal_entry_id, reference
    """
    if not entries:
        raise ValueError("No hay asientos contables para analizar")

    df = pd.DataFrame(entries)
    findings: list[GLFinding] = []

    # ── Normalize numeric amounts ─────────────────────────────────────────────
    df["_amount"] = pd.to_numeric(df.get(amount_field, pd.Series(dtype=float)), errors="coerce").fillna(0)
    total_amount = float(df["_amount"].abs().sum())

    # ── Normalize dates ───────────────────────────────────────────────────────
    if date_field in df.columns:
        df["_date"] = pd.to_datetime(df[date_field], errors="coerce")
        period_start = df["_date"].min().isoformat() if not df["_date"].isna().all() else None
        period_end   = df["_date"].max().isoformat() if not df["_date"].isna().all() else None
    else:
        df["_date"] = pd.NaT
        period_start = period_end = None

    # ─────────────────────────────────────────────────────────────────────────
    # TEST 1 — Round-number entries (montos redondos)
    # ─────────────────────────────────────────────────────────────────────────
    round_mask = (df["_amount"].abs() >= round_threshold) & (df["_amount"] % round_threshold == 0)
    round_entries = df[round_mask]
    if len(round_entries) > 0:
        pct = len(round_entries) / len(df) * 100
        risk = "HIGH" if pct > 15 else ("MEDIUM" if pct > 5 else "LOW")
        findings.append(GLFinding(
            test_name="ROUND_AMOUNTS",
            risk_level=risk,
            record_count=len(round_entries),
            description=f"{len(round_entries)} asientos con montos redondos (≥${round_threshold:,.0f}), "
                        f"representan el {pct:.1f}% del total. Posible fragmentación o estimación manual.",
            sample_records=round_entries.head(10).drop(columns=["_amount", "_date"], errors="ignore").to_dict("records"),
        ))

    # ─────────────────────────────────────────────────────────────────────────
    # TEST 2 — End-of-period entries (últimos días del período)
    # ─────────────────────────────────────────────────────────────────────────
    if not df["_date"].isna().all():
        max_date = df["_date"].max()
        eop_mask = df["_date"] >= (max_date - pd.Timedelta(days=end_of_period_days))
        eop_entries = df[eop_mask]
        if len(eop_entries) > 0:
            eop_amount = float(eop_entries["_amount"].abs().sum())
            eop_pct_count = len(eop_entries) / len(df) * 100
            risk = "HIGH" if eop_pct_count > 20 else ("MEDIUM" if eop_pct_count > 10 else "LOW")
            findings.append(GLFinding(
                test_name="END_OF_PERIOD",
                risk_level=risk,
                record_count=len(eop_entries),
                description=f"{len(eop_entries)} asientos en los últimos {end_of_period_days} días del período "
                            f"({eop_pct_count:.1f}% del total, ${eop_amount:,.0f}). "
                            f"Revisar si corresponden a ajustes de cierre válidos.",
                sample_records=eop_entries.head(10).drop(columns=["_amount", "_date"], errors="ignore").to_dict("records"),
            ))

    # ─────────────────────────────────────────────────────────────────────────
    # TEST 3 — Duplicate amounts by user (mismo monto, mismo usuario)
    # ─────────────────────────────────────────────────────────────────────────
    if user_field in df.columns:
        dup_cols = [c for c in [user_field, amount_field] if c in df.columns]
        if dup_cols:
            dups = df[df.duplicated(subset=dup_cols, keep=False)]
            if len(dups) > 0:
                risk = "HIGH" if len(dups) > 20 else "MEDIUM"
                findings.append(GLFinding(
                    test_name="DUPLICATE_AMOUNT_USER",
                    risk_level=risk,
                    record_count=len(dups),
                    description=f"{len(dups)} asientos con el mismo monto registrado por el mismo usuario. "
                                f"Posible doble registro o duplicación.",
                    sample_records=dups.head(10).drop(columns=["_amount", "_date"], errors="ignore").to_dict("records"),
                ))

    # ─────────────────────────────────────────────────────────────────────────
    # TEST 4 — Weekend / holiday entries
    # ─────────────────────────────────────────────────────────────────────────
    if not df["_date"].isna().all():
        weekend_mask = df["_date"].dt.dayofweek >= 5
        weekend_entries = df[weekend_mask.fillna(False)]
        if len(weekend_entries) > 0:
            risk = "HIGH" if len(weekend_entries) > 10 else "MEDIUM"
            findings.append(GLFinding(
                test_name="WEEKEND_ENTRIES",
                risk_level=risk,
                record_count=len(weekend_entries),
                description=f"{len(weekend_entries)} asientos registrados en fines de semana. "
                            f"Requieren justificación de negocio.",
                sample_records=weekend_entries.head(10).drop(columns=["_amount", "_date"], errors="ignore").to_dict("records"),
            ))

    # ─────────────────────────────────────────────────────────────────────────
    # TEST 5 — Unusual users (top poster outlier)
    # ─────────────────────────────────────────────────────────────────────────
    if user_field in df.columns:
        user_counts = df[user_field].value_counts()
        if len(user_counts) > 1:
            mean_posts = user_counts.mean()
            std_posts  = user_counts.std()
            outlier_users = user_counts[user_counts > mean_posts + 3 * std_posts]
            if len(outlier_users) > 0:
                findings.append(GLFinding(
                    test_name="HIGH_VOLUME_USER",
                    risk_level="MEDIUM",
                    record_count=int(outlier_users.sum()),
                    description=f"Usuarios con volumen de asientos >3σ sobre la media: "
                                f"{', '.join(outlier_users.index.tolist())}. Revisar segregación de funciones.",
                    sample_records=[{"user": u, "entry_count": int(c)} for u, c in outlier_users.items()],
                ))

    # ── Risk score ─────────────────────────────────────────────────────────────
    risk_weights = {"CRITICAL": 30, "HIGH": 20, "MEDIUM": 10, "LOW": 3}
    risk_score = min(100.0, sum(risk_weights.get(f.risk_level, 0) for f in findings))

    summary = {
        "total_entries":   len(df),
        "total_amount":    round(total_amount, 2),
        "period_start":    period_start,
        "period_end":      period_end,
        "findings_count":  len(findings),
        "high_risk_count": sum(1 for f in findings if f.risk_level in ("HIGH", "CRITICAL")),
        "risk_score":      risk_score,
    }

    return GLReport(
        total_entries=len(df),
        total_amount=round(total_amount, 2),
        period_start=period_start,
        period_end=period_end,
        findings=findings,
        risk_score=risk_score,
        summary=summary,
    )
