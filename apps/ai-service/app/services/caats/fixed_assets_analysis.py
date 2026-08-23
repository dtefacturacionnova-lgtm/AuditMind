"""Activo Fijo — Existencia y Depreciación.
Recalcula la depreciación esperada (línea recta) de cada activo y la
compara contra la registrada, detecta activos totalmente depreciados que
siguen marcados como en uso, y activos sin verificación física reciente
(riesgo de existencia, NIA 500).
"""
from dataclasses import dataclass, field
from typing import Any

import pandas as pd


@dataclass
class FixedAssetFinding:
    test_name: str
    risk_level: str
    record_count: int
    description: str
    sample_records: list[dict] = field(default_factory=list)


@dataclass
class FixedAssetReport:
    total_assets: int
    total_cost: float
    total_accumulated_depreciation: float
    findings: list[FixedAssetFinding]
    risk_score: float
    summary: dict


ACTIVE_STATUS_KEYWORDS = {"activo", "en uso", "active", "in use"}


def analyze_fixed_assets(
    records: list[dict[str, Any]],
    asset_id_field: str = "asset_id",
    asset_name_field: str = "asset_name",
    acquisition_date_field: str = "acquisition_date",
    cost_field: str = "cost",
    useful_life_field: str = "useful_life_years",
    accumulated_depreciation_field: str = "accumulated_depreciation",
    status_field: str = "status",
    last_check_field: str = "last_physical_check_date",
    depreciation_mismatch_threshold_pct: float = 10.0,
    stale_check_years: int = 2,
) -> FixedAssetReport:
    """Analiza el registro de activos fijos para existencia y depreciación."""
    if not records:
        raise ValueError("No hay activos para analizar")

    df = pd.DataFrame(records)
    required = [asset_name_field, cost_field, acquisition_date_field, useful_life_field]
    missing = [c for c in required if c not in df.columns]
    if missing:
        raise ValueError(f"Faltan columnas requeridas: {', '.join(missing)}")

    df["_cost"] = pd.to_numeric(df[cost_field], errors="coerce").fillna(0)
    df["_useful_life"] = pd.to_numeric(df[useful_life_field], errors="coerce")
    df["_acq_date"] = pd.to_datetime(df[acquisition_date_field], errors="coerce")
    df["_accum_dep"] = pd.to_numeric(df.get(accumulated_depreciation_field, pd.Series(dtype=float)), errors="coerce").fillna(0)

    findings: list[FixedAssetFinding] = []
    id_cols = [c for c in [asset_id_field, asset_name_field] if c in df.columns]

    as_of = df["_acq_date"].max() if df["_acq_date"].notna().any() else pd.Timestamp.now()

    # ─────────────────────────────────────────────────────────────────────
    # TEST 1 — Depreciación registrada vs. esperada (línea recta)
    # ─────────────────────────────────────────────────────────────────────
    valid = df[df["_acq_date"].notna() & (df["_useful_life"] > 0) & (df["_cost"] > 0)].copy()
    if len(valid) > 0:
        years_elapsed = (as_of - valid["_acq_date"]).dt.days / 365.25
        expected_dep = (years_elapsed / valid["_useful_life"] * valid["_cost"]).clip(lower=0, upper=valid["_cost"])
        valid["_expected_dep"] = expected_dep
        valid["_dep_diff_pct"] = ((valid["_accum_dep"] - valid["_expected_dep"]).abs() / valid["_cost"] * 100).round(2)
        mismatched = valid[valid["_dep_diff_pct"] > depreciation_mismatch_threshold_pct]
        if len(mismatched) > 0:
            sample = mismatched[id_cols].copy()
            sample["depreciacion_registrada"] = mismatched["_accum_dep"].round(2)
            sample["depreciacion_esperada"] = mismatched["_expected_dep"].round(2)
            sample["diferencia_pct"] = mismatched["_dep_diff_pct"]
            findings.append(FixedAssetFinding(
                test_name="DEPRECIATION_MISMATCH",
                risk_level="HIGH",
                record_count=len(mismatched),
                description=f"{len(mismatched)} activo(s) con depreciación registrada que difiere de la esperada "
                            f"(línea recta) en más del {depreciation_mismatch_threshold_pct:.0f}% del costo — verificar "
                            f"método/vida útil aplicada o error de cálculo.",
                sample_records=sample.sort_values("diferencia_pct", ascending=False).head(10).to_dict("records"),
            ))

    # ─────────────────────────────────────────────────────────────────────
    # TEST 2 — Totalmente depreciados pero marcados como en uso
    # ─────────────────────────────────────────────────────────────────────
    if status_field in df.columns:
        status_norm = df[status_field].astype(str).str.strip().str.lower()
        is_active = status_norm.isin(ACTIVE_STATUS_KEYWORDS)
        fully_dep = df["_accum_dep"] >= df["_cost"] * 0.98
        stuck = df[is_active & fully_dep & (df["_cost"] > 0)]
        if len(stuck) > 0:
            findings.append(FixedAssetFinding(
                test_name="FULLY_DEPRECIATED_STILL_ACTIVE",
                risk_level="MEDIUM",
                record_count=len(stuck),
                description=f"{len(stuck)} activo(s) totalmente depreciado(s) (98%+ del costo) pero marcado(s) como "
                            f"en uso — evaluar si corresponde dar de baja, revaluar, o extender vida útil formalmente.",
                sample_records=stuck[id_cols + [status_field]].head(10).to_dict("records"),
            ))

    # ─────────────────────────────────────────────────────────────────────
    # TEST 3 — Sin verificación física reciente (riesgo de existencia)
    # ─────────────────────────────────────────────────────────────────────
    if last_check_field in df.columns:
        df["_last_check"] = pd.to_datetime(df[last_check_field], errors="coerce")
        checked = df[df["_last_check"].notna()]
        stale = checked[(as_of - checked["_last_check"]).dt.days > stale_check_years * 365]
        never_checked = df[df["_last_check"].isna()]
        no_check = pd.concat([stale, never_checked]).drop_duplicates()
        if len(no_check) > 0:
            findings.append(FixedAssetFinding(
                test_name="STALE_PHYSICAL_CHECK",
                risk_level="MEDIUM",
                record_count=len(no_check),
                description=f"{len(no_check)} activo(s) sin verificación física en los últimos {stale_check_years} "
                            f"años (o nunca verificado) — riesgo de existencia, incluir en el próximo conteo físico.",
                sample_records=no_check[id_cols].head(10).to_dict("records"),
            ))

    # ── Risk score ─────────────────────────────────────────────────────────
    risk_weights = {"CRITICAL": 35, "HIGH": 20, "MEDIUM": 10, "LOW": 3}
    risk_score = min(100.0, sum(risk_weights.get(f.risk_level, 0) for f in findings))

    summary = {
        "total_assets":                    len(df),
        "total_cost":                      round(float(df["_cost"].sum()), 2),
        "total_accumulated_depreciation":  round(float(df["_accum_dep"].sum()), 2),
        "findings_count":                  len(findings),
        "critical_count":                  sum(1 for f in findings if f.risk_level == "CRITICAL"),
        "risk_score":                      risk_score,
    }

    return FixedAssetReport(
        total_assets=len(df),
        total_cost=round(float(df["_cost"].sum()), 2),
        total_accumulated_depreciation=round(float(df["_accum_dep"].sum()), 2),
        findings=findings,
        risk_score=risk_score,
        summary=summary,
    )
