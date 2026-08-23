"""Licitación Colusoria (Bid Rigging).
Analiza un registro de ofertas de licitación (una fila por oferta) para
detectar patrones de colusión entre proveedores: precios anormalmente
uniformes dentro de un mismo proceso, ofertas perdedoras sospechosamente
cercanas al ganador (cover bidding), y proveedores con una tasa de
adjudicación desproporcionada frente a cuántas veces participan.
"""
from dataclasses import dataclass, field
from typing import Any

import pandas as pd


@dataclass
class BidRiggingFinding:
    test_name: str
    risk_level: str
    record_count: int
    description: str
    sample_records: list[dict] = field(default_factory=list)


@dataclass
class BidRiggingReport:
    total_bids: int
    total_tenders: int
    bidder_count: int
    findings: list[BidRiggingFinding]
    risk_score: float
    bidder_win_rate: list[dict]
    summary: dict


TRUE_VALUES = {"si", "sí", "s", "yes", "y", "true", "1", "ganador", "winner", "adjudicado"}


def _is_winner(val: Any) -> bool:
    if isinstance(val, bool):
        return val
    if isinstance(val, (int, float)):
        return bool(val)
    return str(val).strip().lower() in TRUE_VALUES


def analyze_bid_rigging(
    records: list[dict[str, Any]],
    tender_id_field: str = "tender_id",
    bidder_name_field: str = "bidder_name",
    amount_field: str = "amount",
    is_winner_field: str = "is_winner",
    uniformity_cv_threshold: float = 0.03,
    close_losing_margin: float = 0.05,
    min_bidders_for_uniformity: int = 3,
) -> BidRiggingReport:
    """Analiza un registro de ofertas para indicios de colusión."""
    if not records:
        raise ValueError("No hay ofertas para analizar")

    df = pd.DataFrame(records)
    required = [tender_id_field, bidder_name_field, amount_field, is_winner_field]
    missing = [c for c in required if c not in df.columns]
    if missing:
        raise ValueError(f"Faltan columnas requeridas: {', '.join(missing)}")

    df["_amount"] = pd.to_numeric(df[amount_field], errors="coerce")
    df = df[df["_amount"].notna()]
    df["_is_winner"] = df[is_winner_field].apply(_is_winner)

    findings: list[BidRiggingFinding] = []
    display_cols = [tender_id_field, bidder_name_field, amount_field, is_winner_field]

    # ─────────────────────────────────────────────────────────────────────
    # TEST 1 — Uniformidad de precios dentro de un mismo proceso
    # ─────────────────────────────────────────────────────────────────────
    uniform_tenders: list[dict] = []
    for tender, group in df.groupby(tender_id_field):
        if len(group) < min_bidders_for_uniformity:
            continue
        mean = group["_amount"].mean()
        std = group["_amount"].std()
        cv = float(std / mean) if mean else 0
        if cv < uniformity_cv_threshold:
            uniform_tenders.append({
                "licitacion": tender, "num_ofertas": len(group),
                "monto_promedio": round(float(mean), 2), "coef_variacion_pct": round(cv * 100, 2),
            })
    if uniform_tenders:
        findings.append(BidRiggingFinding(
            test_name="BID_UNIFORMITY",
            risk_level="CRITICAL",
            record_count=len(uniform_tenders),
            description=f"{len(uniform_tenders)} licitación(es) con ofertas anormalmente uniformes entre sí (variación "
                        f"< {uniformity_cv_threshold*100:.0f}%, {min_bidders_for_uniformity}+ oferentes) — señal fuerte "
                        f"de acuerdo previo de precios entre competidores.",
            sample_records=sorted(uniform_tenders, key=lambda t: t["coef_variacion_pct"])[:10],
        ))

    # ─────────────────────────────────────────────────────────────────────
    # TEST 2 — Ofertas perdedoras sospechosamente cercanas al ganador
    # (cover bidding — oferta diseñada para perder por poco, no para competir)
    # ─────────────────────────────────────────────────────────────────────
    close_losers: list[dict] = []
    for tender, group in df.groupby(tender_id_field):
        winners = group[group["_is_winner"]]
        if len(winners) != 1:
            continue
        winning_amount = float(winners["_amount"].iloc[0])
        if winning_amount <= 0:
            continue
        losers = group[~group["_is_winner"]]
        close = losers[(losers["_amount"] - winning_amount) / winning_amount <= close_losing_margin]
        close = close[losers["_amount"] >= winning_amount]
        for _, row in close.iterrows():
            close_losers.append({
                "licitacion": tender, "proveedor": row[bidder_name_field],
                "oferta": round(float(row["_amount"]), 2), "oferta_ganadora": round(winning_amount, 2),
                "diferencia_pct": round((float(row["_amount"]) - winning_amount) / winning_amount * 100, 2),
            })
    if close_losers:
        findings.append(BidRiggingFinding(
            test_name="CLOSE_LOSING_BIDS",
            risk_level="HIGH",
            record_count=len(close_losers),
            description=f"{len(close_losers)} oferta(s) perdedora(s) dentro del {close_losing_margin*100:.0f}% por encima "
                        f"de la oferta ganadora — patrón típico de \"cover bidding\" (oferta diseñada para perder, no "
                        f"para competir realmente).",
            sample_records=sorted(close_losers, key=lambda c: c["diferencia_pct"])[:10],
        ))

    # ─────────────────────────────────────────────────────────────────────
    # TEST 3 — Proveedores con tasa de adjudicación desproporcionada
    # ─────────────────────────────────────────────────────────────────────
    bidder_stats = df.groupby(bidder_name_field).agg(
        participaciones=("_is_winner", "count"),
        adjudicaciones=("_is_winner", "sum"),
    )
    bidder_stats["tasa_adjudicacion_pct"] = (bidder_stats["adjudicaciones"] / bidder_stats["participaciones"] * 100).round(1)
    bidder_win_rate = [
        {"proveedor": b, "participaciones": int(r["participaciones"]), "adjudicaciones": int(r["adjudicaciones"]), "tasa_adjudicacion_pct": float(r["tasa_adjudicacion_pct"])}
        for b, r in bidder_stats.sort_values("tasa_adjudicacion_pct", ascending=False).iterrows()
    ]
    favored = bidder_stats[(bidder_stats["participaciones"] >= 3) & (bidder_stats["tasa_adjudicacion_pct"] >= 50)]
    if len(favored) > 0:
        findings.append(BidRiggingFinding(
            test_name="DISPROPORTIONATE_WIN_RATE",
            risk_level="MEDIUM",
            record_count=len(favored),
            description=f"{len(favored)} proveedor(es) adjudicado(s) en el 50% o más de las licitaciones en las que "
                        f"participa(n) (con 3 o más participaciones) — revisar si el proceso realmente es competitivo "
                        f"para ese proveedor.",
            sample_records=[b for b in bidder_win_rate if b["proveedor"] in favored.index][:10],
        ))

    # ── Risk score ─────────────────────────────────────────────────────────
    risk_weights = {"CRITICAL": 35, "HIGH": 20, "MEDIUM": 10, "LOW": 3}
    risk_score = min(100.0, sum(risk_weights.get(f.risk_level, 0) for f in findings))

    summary = {
        "total_bids":      len(df),
        "total_tenders":   int(df[tender_id_field].nunique()),
        "bidder_count":    int(df[bidder_name_field].nunique()),
        "findings_count":  len(findings),
        "critical_count":  sum(1 for f in findings if f.risk_level == "CRITICAL"),
        "risk_score":      risk_score,
    }

    return BidRiggingReport(
        total_bids=len(df),
        total_tenders=int(df[tender_id_field].nunique()),
        bidder_count=int(df[bidder_name_field].nunique()),
        findings=findings,
        risk_score=risk_score,
        bidder_win_rate=bidder_win_rate[:10],
        summary=summary,
    )
