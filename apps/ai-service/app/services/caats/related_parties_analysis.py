"""Partes Relacionadas y Conflicto de Interés.
Cruza transacciones (proveedores/clientes) contra un registro de partes
relacionadas (accionistas, directores, familiares, filiales, empleados —
la nómina propia se aporta como filas con relationship='Empleado' en el
mismo registro) para detectar transacciones con una parte vinculada NO
revelada, o compras dirigidas a un proveedor donde un empleado tiene una
participación oculta. Único motor CAATs que cruza DOS fuentes de datos en
vez de una — el registro de partes relacionadas suele ser una lista corta
(decenas de filas), muy distinta en tamaño al universo de transacciones.
"""
import unicodedata
from dataclasses import dataclass, field
from typing import Any

import pandas as pd


@dataclass
class RelatedPartyFinding:
    test_name: str
    risk_level: str
    record_count: int
    description: str
    sample_records: list[dict] = field(default_factory=list)


@dataclass
class RelatedPartyReport:
    total_transactions: int
    total_related_parties: int
    matched_transaction_count: int
    matched_amount: float
    findings: list[RelatedPartyFinding]
    risk_score: float
    exposure_by_party: list[dict]
    summary: dict


def _norm(text: Any) -> str:
    if pd.isna(text) or text is None:
        return ""
    normalized = unicodedata.normalize("NFD", str(text).strip().lower())
    return "".join(c for c in normalized if unicodedata.category(c) != "Mn")


def _name_match(a: str, b: str) -> bool:
    """Substring en cualquier dirección tras normalizar — mismo criterio que
    autoMatchColumn en el frontend, para nombres que no son idénticos letra
    por letra (ej. "Juan Pérez Comercial SA" vs "Juan Pérez")."""
    if not a or not b:
        return False
    return a in b or b in a


def analyze_related_parties(
    transactions: list[dict[str, Any]],
    related_parties: list[dict[str, Any]],
    vendor_id_field: str = "vendor_id",
    vendor_name_field: str = "vendor_name",
    tax_id_field: str = "tax_id",
    amount_field: str = "amount",
    date_field: str = "date",
    party_name_field: str = "party_name",
    party_tax_id_field: str = "tax_id",
    relationship_field: str = "relationship",
) -> RelatedPartyReport:
    """Cruza transacciones contra el registro de partes relacionadas."""
    if not transactions:
        raise ValueError("No hay transacciones para analizar")
    if not related_parties:
        raise ValueError("No hay registro de partes relacionadas para cruzar")

    tx = pd.DataFrame(transactions)
    rp = pd.DataFrame(related_parties)

    if vendor_name_field not in tx.columns:
        raise ValueError("Se requiere la columna de nombre de contraparte en las transacciones")
    if party_name_field not in rp.columns or relationship_field not in rp.columns:
        raise ValueError("Se requieren las columnas de nombre y relación en el registro de partes relacionadas")

    tx["_amount"] = pd.to_numeric(tx.get(amount_field, pd.Series(dtype=float)), errors="coerce").fillna(0)
    tx["_vendor_name_norm"] = tx[vendor_name_field].apply(_norm)
    tx["_tax_norm"] = tx[tax_id_field].apply(_norm) if tax_id_field in tx.columns else ""

    rp["_party_name_norm"] = rp[party_name_field].apply(_norm)
    rp["_party_tax_norm"] = rp[party_tax_id_field].apply(_norm) if party_tax_id_field in rp.columns else ""
    rp = rp[rp["_party_name_norm"] != ""]

    findings: list[RelatedPartyFinding] = []
    matched_by_tax: list[dict] = []
    matched_by_name: list[dict] = []
    exposure: dict[str, dict] = {}

    for _, party in rp.iterrows():
        party_name = str(party[party_name_field]).strip()
        relationship = str(party[relationship_field]).strip() if pd.notna(party[relationship_field]) else "Sin especificar"
        party_tax = party["_party_tax_norm"]

        # Match fuerte: mismo NIT/RUC normalizado (evita falsos positivos de nombre)
        tax_matches = tx[(tx["_tax_norm"] != "") & (party_tax != "") & (tx["_tax_norm"] == party_tax)] if party_tax else tx.iloc[0:0]
        # Match débil: nombre por substring, EXCLUYENDO transacciones ya capturadas por NIT
        name_matches = tx[tx["_vendor_name_norm"].apply(lambda v: _name_match(v, party["_party_name_norm"]))]
        if len(tax_matches) > 0:
            name_matches = name_matches[~name_matches.index.isin(tax_matches.index)]

        if len(tax_matches) > 0:
            total = float(tax_matches["_amount"].sum())
            matched_by_tax.append({
                "parte_relacionada": party_name, "relacion": relationship,
                "transacciones": len(tax_matches), "monto_total": round(total, 2),
            })
            exposure.setdefault(party_name, {"parte_relacionada": party_name, "relacion": relationship, "transacciones": 0, "monto_total": 0.0})
            exposure[party_name]["transacciones"] += len(tax_matches)
            exposure[party_name]["monto_total"] += total

        if len(name_matches) > 0:
            total = float(name_matches["_amount"].sum())
            matched_by_name.append({
                "parte_relacionada": party_name, "relacion": relationship,
                "transacciones": len(name_matches), "monto_total": round(total, 2),
            })
            exposure.setdefault(party_name, {"parte_relacionada": party_name, "relacion": relationship, "transacciones": 0, "monto_total": 0.0})
            exposure[party_name]["transacciones"] += len(name_matches)
            exposure[party_name]["monto_total"] += total

    if matched_by_tax:
        findings.append(RelatedPartyFinding(
            test_name="RELATED_PARTY_MATCH_TAX_ID",
            risk_level="CRITICAL",
            record_count=sum(m["transacciones"] for m in matched_by_tax),
            description=f"{len(matched_by_tax)} parte(s) relacionada(s) con transacciones confirmadas por NIT/RUC — "
                        f"coincidencia exacta de identidad tributaria, no solo de nombre. Verificar si estas transacciones "
                        f"fueron reveladas como partes relacionadas en los estados financieros.",
            sample_records=sorted(matched_by_tax, key=lambda m: -m["monto_total"])[:10],
        ))

    if matched_by_name:
        findings.append(RelatedPartyFinding(
            test_name="RELATED_PARTY_MATCH_NAME",
            risk_level="HIGH",
            record_count=sum(m["transacciones"] for m in matched_by_name),
            description=f"{len(matched_by_name)} parte(s) relacionada(s) con transacciones coincidentes solo por nombre "
                        f"(sin NIT que lo confirme) — señal más débil, puede incluir falsos positivos por nombres similares "
                        f"entre entidades distintas. Requiere confirmación manual antes de concluir.",
            sample_records=sorted(matched_by_name, key=lambda m: -m["monto_total"])[:10],
        ))

    employee_matches = [m for m in (matched_by_tax + matched_by_name) if _norm(m["relacion"]) == _norm("Empleado")]
    if employee_matches:
        findings.append(RelatedPartyFinding(
            test_name="EMPLOYEE_AS_COUNTERPARTY",
            risk_level="CRITICAL",
            record_count=len(employee_matches),
            description=f"{len(employee_matches)} empleado(s) de la nómina propia aparece(n) como contraparte de una "
                        f"transacción — posible participación oculta de un empleado en un proveedor/cliente sin revelar.",
            sample_records=employee_matches[:10],
        ))

    exposure_by_party = sorted(exposure.values(), key=lambda e: -e["monto_total"])
    for e in exposure_by_party:
        e["monto_total"] = round(e["monto_total"], 2)

    matched_amount = sum(e["monto_total"] for e in exposure_by_party)
    matched_transaction_count = sum(e["transacciones"] for e in exposure_by_party)

    risk_weights = {"CRITICAL": 35, "HIGH": 20, "MEDIUM": 10, "LOW": 3}
    risk_score = min(100.0, sum(risk_weights.get(f.risk_level, 0) for f in findings))

    summary = {
        "total_transactions":        len(tx),
        "total_related_parties":     len(rp),
        "matched_transaction_count": matched_transaction_count,
        "matched_amount":            round(matched_amount, 2),
        "findings_count":            len(findings),
        "critical_count":            sum(1 for f in findings if f.risk_level == "CRITICAL"),
        "risk_score":                risk_score,
    }

    return RelatedPartyReport(
        total_transactions=len(tx),
        total_related_parties=len(rp),
        matched_transaction_count=matched_transaction_count,
        matched_amount=round(matched_amount, 2),
        findings=findings,
        risk_score=risk_score,
        exposure_by_party=exposure_by_party,
        summary=summary,
    )
