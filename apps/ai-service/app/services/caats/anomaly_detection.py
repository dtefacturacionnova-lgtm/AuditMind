"""Tarea 2.5 — Detección de anomalías con ML (Isolation Forest + Z-Score).
Identifica transacciones estadísticamente inusuales sin supervisión.
"""
from dataclasses import dataclass
from typing import Any

import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler


@dataclass
class AnomalyRecord:
    index: int
    anomaly_score: float     # [-1, 0] — más negativo = más anómalo
    z_scores: dict[str, float]
    flags: list[str]
    record: dict


@dataclass
class AnomalyReport:
    total_records: int
    anomaly_count: int
    anomaly_rate_pct: float
    risk_score: float
    top_anomalies: list[AnomalyRecord]
    feature_stats: dict
    interpretation: str


def detect_anomalies(
    records: list[dict[str, Any]],
    numeric_fields: list[str],
    contamination: float = 0.05,
    top_n: int = 20,
) -> AnomalyReport:
    """
    Detect anomalies using Isolation Forest + Z-Score analysis.

    Parameters
    ----------
    records        : list of transaction dicts
    numeric_fields : which fields to use as features (e.g. ["amount", "quantity"])
    contamination  : expected anomaly fraction (default 5%)
    top_n          : how many top anomalies to return
    """
    if not records:
        raise ValueError("No hay registros para analizar")
    if not numeric_fields:
        raise ValueError("Debe especificar al menos un campo numérico")

    df = pd.DataFrame(records)

    # ── Extract numeric features ──────────────────────────────────────────────
    available_fields = [f for f in numeric_fields if f in df.columns]
    if not available_fields:
        raise ValueError(f"Ninguno de los campos {numeric_fields} existe en los datos")

    X = df[available_fields].apply(pd.to_numeric, errors="coerce").fillna(0).values

    if len(records) < 10:
        raise ValueError("Se requieren al menos 10 registros para el análisis")

    # ── Z-Score per feature ───────────────────────────────────────────────────
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    z_scores_df = pd.DataFrame(
        X_scaled, columns=[f"z_{f}" for f in available_fields]
    )

    # ── Isolation Forest ──────────────────────────────────────────────────────
    clf = IsolationForest(
        contamination=contamination,
        random_state=42,
        n_estimators=100,
    )
    predictions = clf.fit_predict(X_scaled)       # 1 = normal, -1 = anomaly
    scores = clf.score_samples(X_scaled)          # lower = more anomalous

    df["_is_anomaly"] = predictions == -1
    df["_if_score"] = scores

    # ── Build anomaly records ─────────────────────────────────────────────────
    anomaly_indices = df[df["_is_anomaly"]].index.tolist()

    anomaly_records: list[AnomalyRecord] = []
    for idx in anomaly_indices:
        row_z = {
            f: round(float(z_scores_df.loc[idx, f"z_{f}"]), 2)
            for f in available_fields
        }

        flags: list[str] = []
        for f, z in row_z.items():
            if abs(z) > 4:
                flags.append(f"EXTREMO: {f} (z={z})")
            elif abs(z) > 3:
                flags.append(f"ALTO: {f} (z={z})")
            elif abs(z) > 2:
                flags.append(f"MODERADO: {f} (z={z})")

        anomaly_records.append(AnomalyRecord(
            index=int(idx),
            anomaly_score=round(float(df.loc[idx, "_if_score"]), 4),
            z_scores=row_z,
            flags=flags,
            record={k: v for k, v in records[idx].items()},
        ))

    # Sort by most anomalous (lowest score)
    anomaly_records.sort(key=lambda r: r.anomaly_score)
    top_anomalies = anomaly_records[:top_n]

    # ── Feature statistics ────────────────────────────────────────────────────
    feature_stats: dict = {}
    for f in available_fields:
        col = df[f].apply(pd.to_numeric, errors="coerce").dropna()
        feature_stats[f] = {
            "mean":   round(float(col.mean()), 2),
            "std":    round(float(col.std()), 2),
            "min":    round(float(col.min()), 2),
            "max":    round(float(col.max()), 2),
            "p25":    round(float(col.quantile(0.25)), 2),
            "p75":    round(float(col.quantile(0.75)), 2),
            "p95":    round(float(col.quantile(0.95)), 2),
            "p99":    round(float(col.quantile(0.99)), 2),
        }

    # ── Risk score 0-100 ─────────────────────────────────────────────────────
    anomaly_count = len(anomaly_indices)
    anomaly_rate = anomaly_count / len(records)
    risk_score = min(100.0, round(anomaly_rate * 100 * 3, 1))  # 3× amplification

    # ── Interpretation ────────────────────────────────────────────────────────
    if anomaly_rate < 0.02:
        interp = f"Tasa de anomalía muy baja ({anomaly_rate:.1%}). Distribución de transacciones normal."
    elif anomaly_rate < 0.05:
        interp = f"Tasa de anomalía aceptable ({anomaly_rate:.1%}). Revisar las {anomaly_count} transacciones marcadas."
    elif anomaly_rate < 0.10:
        interp = f"Tasa de anomalía elevada ({anomaly_rate:.1%}). {anomaly_count} transacciones requieren revisión urgente."
    else:
        interp = f"Tasa de anomalía CRÍTICA ({anomaly_rate:.1%}). {anomaly_count} transacciones anómalas detectadas. Escalar al gerente."

    return AnomalyReport(
        total_records=len(records),
        anomaly_count=anomaly_count,
        anomaly_rate_pct=round(anomaly_rate * 100, 2),
        risk_score=risk_score,
        top_anomalies=top_anomalies,
        feature_stats=feature_stats,
        interpretation=interp,
    )
