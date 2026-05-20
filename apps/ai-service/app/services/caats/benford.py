"""Tarea 2.4 — Ley de Benford.
Detecta distribuciones anómalas de primeros dígitos vs. la distribución
esperada de Benford. Alta sensibilidad para detectar fraude contable.
"""
import math
from dataclasses import dataclass
from typing import Any

import numpy as np
import pandas as pd
from scipy import stats


# ─── Distribución de Benford (probabilidades esperadas 1-9) ──────────────────
BENFORD_PROBS = {d: math.log10(1 + 1 / d) for d in range(1, 10)}


@dataclass
class BenfordResult:
    digit: int
    observed_pct: float
    expected_pct: float
    deviation_pct: float
    is_anomalous: bool


@dataclass
class BenfordReport:
    total_records: int
    valid_records: int
    chi2_statistic: float
    chi2_pvalue: float
    mad: float                  # Mean Absolute Deviation
    conformity: str             # CLOSE | ACCEPTABLE | SUSPECT | NON_CONFORMING
    risk_score: float           # 0-100
    digits: list[BenfordResult]
    top_anomalous_amounts: list[dict]
    interpretation: str


def _first_digit(x: float) -> int | None:
    """Extract significant first digit (1-9) ignoring sign and leading zeros."""
    if x is None or (isinstance(x, float) and math.isnan(x)):
        return None
    x = abs(float(x))
    if x == 0:
        return None
    # Shift to [1, 10)
    exp = math.floor(math.log10(x))
    shifted = x / (10 ** exp)
    d = int(shifted)
    return d if 1 <= d <= 9 else None


def analyze_benford(
    amounts: list[float],
    raw_records: list[dict] | None = None,
    alpha: float = 0.05,
    mad_threshold_close: float = 0.006,
    mad_threshold_acceptable: float = 0.012,
    mad_threshold_suspect: float = 0.015,
) -> BenfordReport:
    """
    Run Benford analysis on a list of monetary amounts.

    Parameters
    ----------
    amounts          : raw monetary values (negatives OK, zeros excluded)
    raw_records      : optional parallel list of dicts — used to surface top anomalous rows
    alpha            : chi-square significance level (default 0.05)
    mad_threshold_*  : MAD cutoffs (Nigrini scale)
    """
    # ── Extract first digits ─────────────────────────────────────────────────
    digits_series: list[int] = []
    anomalous_indices: list[int] = []

    for i, amt in enumerate(amounts):
        d = _first_digit(amt)
        if d is not None:
            digits_series.append(d)
        # We'll use the full index for later reference

    n = len(digits_series)
    if n < 50:
        raise ValueError(f"Benford requiere mínimo 50 registros válidos, se recibieron {n}")

    # ── Observed vs expected ─────────────────────────────────────────────────
    counts = pd.Series(digits_series).value_counts().reindex(range(1, 10), fill_value=0)
    observed_probs = counts / n
    expected_probs = pd.Series(BENFORD_PROBS)

    # ── Chi-square test ──────────────────────────────────────────────────────
    observed_counts = counts.values
    expected_counts = expected_probs.values * n
    chi2_stat, chi2_p = stats.chisquare(f_obs=observed_counts, f_exp=expected_counts)

    # ── MAD (Mean Absolute Deviation) ────────────────────────────────────────
    mad = float(np.mean(np.abs(observed_probs.values - expected_probs.values)))

    # ── Conformity classification (Nigrini scale) ────────────────────────────
    if mad < mad_threshold_close:
        conformity = "CLOSE"
    elif mad < mad_threshold_acceptable:
        conformity = "ACCEPTABLE"
    elif mad < mad_threshold_suspect:
        conformity = "SUSPECT"
    else:
        conformity = "NON_CONFORMING"

    # ── Risk score 0-100 ────────────────────────────────────────────────────
    risk_score = min(100.0, round((mad / mad_threshold_suspect) * 60 + (1 - chi2_p) * 40, 1))

    # ── Per-digit results ────────────────────────────────────────────────────
    digit_results: list[BenfordResult] = []
    for d in range(1, 10):
        obs = float(observed_probs.get(d, 0))
        exp = float(expected_probs[d])
        dev = round((obs - exp) / exp * 100, 1)
        anomalous = abs(dev) > 20  # >20% deviation from expected
        if anomalous:
            anomalous_indices.extend(
                [i for i, digit in enumerate(digits_series) if digit == d]
            )
        digit_results.append(BenfordResult(
            digit=d,
            observed_pct=round(obs * 100, 2),
            expected_pct=round(exp * 100, 2),
            deviation_pct=dev,
            is_anomalous=anomalous,
        ))

    # ── Top anomalous records ────────────────────────────────────────────────
    top_anomalous: list[dict] = []
    if raw_records and anomalous_indices:
        seen = set()
        for idx in anomalous_indices[:100]:
            if idx < len(raw_records) and idx not in seen:
                seen.add(idx)
                top_anomalous.append(raw_records[idx])
        top_anomalous = top_anomalous[:20]

    # ── Human interpretation ─────────────────────────────────────────────────
    interp_map = {
        "CLOSE":           "La distribución se ajusta estrechamente a Benford. Riesgo bajo de manipulación.",
        "ACCEPTABLE":      "La distribución es aceptable. Desviaciones menores que pueden tener causas legítimas.",
        "SUSPECT":         "Desviaciones moderadas detectadas. Se recomienda revisión adicional de transacciones con dígito inicial anómalo.",
        "NON_CONFORMING":  "La distribución NO cumple la Ley de Benford. Alta probabilidad de manipulación o datos contaminados. Escalar inmediatamente.",
    }

    return BenfordReport(
        total_records=len(amounts),
        valid_records=n,
        chi2_statistic=round(float(chi2_stat), 4),
        chi2_pvalue=round(float(chi2_p), 6),
        mad=round(mad, 6),
        conformity=conformity,
        risk_score=risk_score,
        digits=digit_results,
        top_anomalous_amounts=top_anomalous,
        interpretation=interp_map[conformity],
    )
