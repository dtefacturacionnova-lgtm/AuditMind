"""Integridad de Maestro de Proveedores.
Analiza el MAESTRO de proveedores (un registro por proveedor, no por
transacción) para detectar proveedores duplicados bajo nombres distintos,
reactivación no autorizada de proveedores inactivos, e identidad débil
(datos insuficientes para verificar que el proveedor existe realmente).
Complementa AP (que opera sobre facturas/transacciones) — misma familia de
riesgo (ACFE billing schemes), fuente de datos distinta.
"""
import unicodedata
from dataclasses import dataclass, field
from datetime import timedelta
from typing import Any

import pandas as pd


@dataclass
class VendorMasterFinding:
    test_name: str
    risk_level: str
    record_count: int
    description: str
    sample_records: list[dict] = field(default_factory=list)


@dataclass
class VendorMasterReport:
    total_vendors: int
    active_count: int
    findings: list[VendorMasterFinding]
    risk_score: float
    summary: dict


GHOST_NAME_PATTERNS = ["test", "proveedor", "vendor", "xxx", "n/a", "na", "temporal", "temp", "generico", "generic"]
INACTIVE_STATUS_KEYWORDS = ["inactiv", "suspend", "bloque", "cerrad", "baja"]


def _norm(text: Any) -> str:
    """Minúsculas + sin acentos + espacios/guiones colapsados — para que dos
    NIT/cuentas/direcciones equivalentes con formato distinto (espacios,
    guiones, tildes) sí se detecten como el mismo valor."""
    if pd.isna(text) or text is None:
        return ""
    normalized = unicodedata.normalize("NFD", str(text).strip().lower())
    stripped = "".join(c for c in normalized if unicodedata.category(c) != "Mn")
    return "".join(ch for ch in stripped if ch.isalnum())


def analyze_vendor_master(
    vendors: list[dict[str, Any]],
    vendor_id_field: str = "vendor_id",
    vendor_name_field: str = "vendor_name",
    tax_id_field: str = "tax_id",
    bank_account_field: str = "bank_account",
    address_field: str = "address",
    status_field: str = "status",
    last_activity_field: str = "last_activity_date",
    inactivity_window_days: int = 90,
) -> VendorMasterReport:
    """Analiza el maestro de proveedores para detectar duplicados e identidad débil."""
    if not vendors:
        raise ValueError("No hay proveedores para analizar")

    df = pd.DataFrame(vendors)
    if vendor_id_field not in df.columns or vendor_name_field not in df.columns:
        raise ValueError("Se requieren las columnas de ID y nombre de proveedor mapeadas")

    findings: list[VendorMasterFinding] = []

    # ─────────────────────────────────────────────────────────────────────
    # TEST 1 — Proveedores duplicados por NIT/RUC (misma identidad tributaria,
    # nombres o IDs distintos)
    # ─────────────────────────────────────────────────────────────────────
    if tax_id_field in df.columns:
        df["_tax_norm"] = df[tax_id_field].apply(_norm)
        offenders = []
        for key, group in df[df["_tax_norm"] != ""].groupby("_tax_norm"):
            names = group[[vendor_id_field, vendor_name_field, tax_id_field]].drop_duplicates()
            if len(names) > 1:
                offenders.append({
                    "nit": group[tax_id_field].iloc[0],
                    "proveedores": ", ".join(f"{r[vendor_id_field]} — {r[vendor_name_field]}" for r in names.to_dict("records")),
                })
        if offenders:
            findings.append(VendorMasterFinding(
                test_name="DUPLICATE_TAX_ID",
                risk_level="CRITICAL",
                record_count=len(offenders),
                description=f"{len(offenders)} NIT/RUC compartido(s) por más de un proveedor registrado con nombre o ID distinto. "
                            f"Posible proveedor duplicado para fraccionar compras o encubrir la identidad real del beneficiario.",
                sample_records=offenders[:10],
            ))

    # ─────────────────────────────────────────────────────────────────────
    # TEST 2 — Proveedores duplicados por cuenta bancaria (señal más fuerte
    # aún que el NIT — la misma persona cobra bajo distintos "proveedores")
    # ─────────────────────────────────────────────────────────────────────
    if bank_account_field in df.columns:
        df["_bank_norm"] = df[bank_account_field].apply(_norm)
        offenders = []
        for key, group in df[df["_bank_norm"] != ""].groupby("_bank_norm"):
            names = group[[vendor_id_field, vendor_name_field, bank_account_field]].drop_duplicates()
            if len(names) > 1:
                offenders.append({
                    "cuenta_bancaria": group[bank_account_field].iloc[0],
                    "proveedores": ", ".join(f"{r[vendor_id_field]} — {r[vendor_name_field]}" for r in names.to_dict("records")),
                })
        if offenders:
            findings.append(VendorMasterFinding(
                test_name="DUPLICATE_BANK_ACCOUNT",
                risk_level="CRITICAL",
                record_count=len(offenders),
                description=f"{len(offenders)} cuenta(s) bancaria(s) compartida(s) por más de un proveedor — "
                            f"señal fuerte de que un mismo beneficiario controla proveedores registrados como independientes.",
                sample_records=offenders[:10],
            ))

    # ─────────────────────────────────────────────────────────────────────
    # TEST 3 — Proveedores duplicados por dirección (señal más débil — puede
    # ser un edificio/centro comercial compartido legítimamente)
    # ─────────────────────────────────────────────────────────────────────
    if address_field in df.columns:
        df["_addr_norm"] = df[address_field].apply(_norm)
        offenders = []
        for key, group in df[df["_addr_norm"] != ""].groupby("_addr_norm"):
            names = group[[vendor_id_field, vendor_name_field]].drop_duplicates()
            if len(names) > 1:
                offenders.append({
                    "direccion": group[address_field].iloc[0],
                    "proveedores": ", ".join(f"{r[vendor_id_field]} — {r[vendor_name_field]}" for r in names.to_dict("records")),
                })
        if offenders:
            findings.append(VendorMasterFinding(
                test_name="DUPLICATE_ADDRESS",
                risk_level="MEDIUM",
                record_count=len(offenders),
                description=f"{len(offenders)} dirección(es) compartida(s) por más de un proveedor. "
                            f"Revisar si son entidades genuinamente distintas o el mismo domicilio bajo nombres diferentes.",
                sample_records=offenders[:10],
            ))

    # ─────────────────────────────────────────────────────────────────────
    # TEST 4 — Proveedor inactivo con actividad reciente
    # ─────────────────────────────────────────────────────────────────────
    if status_field in df.columns and last_activity_field in df.columns:
        status_norm = df[status_field].apply(_norm)
        is_inactive = status_norm.apply(lambda s: any(kw in s for kw in [ _norm(k) for k in INACTIVE_STATUS_KEYWORDS ]))
        df["_last_activity"] = pd.to_datetime(df[last_activity_field], errors="coerce")
        recent_cutoff = df["_last_activity"].max() - timedelta(days=inactivity_window_days) if df["_last_activity"].notna().any() else None
        if recent_cutoff is not None:
            reactivated = df[is_inactive & df["_last_activity"].notna() & (df["_last_activity"] >= recent_cutoff)]
            if len(reactivated) > 0:
                findings.append(VendorMasterFinding(
                    test_name="INACTIVE_WITH_RECENT_ACTIVITY",
                    risk_level="HIGH",
                    record_count=len(reactivated),
                    description=f"{len(reactivated)} proveedor(es) marcado(s) como inactivo/suspendido con actividad en los "
                                f"últimos {inactivity_window_days} días — verificar autorización de reactivación.",
                    sample_records=reactivated[[vendor_id_field, vendor_name_field, status_field, last_activity_field]]
                        .head(10).to_dict("records"),
                ))

    # ─────────────────────────────────────────────────────────────────────
    # TEST 5 — Identidad débil (nombre genérico/sospechoso, o sin NIT ni
    # dirección — no hay forma de verificar que el proveedor existe)
    # ─────────────────────────────────────────────────────────────────────
    name_norm = df[vendor_name_field].apply(_norm)
    suspicious_name = name_norm.apply(lambda n: n == "" or any(_norm(p) in n for p in GHOST_NAME_PATTERNS))
    missing_identity = pd.Series(False, index=df.index)
    if tax_id_field in df.columns and address_field in df.columns:
        missing_identity = (df[tax_id_field].apply(_norm) == "") & (df[address_field].apply(_norm) == "")
    weak_identity = df[suspicious_name | missing_identity]
    if len(weak_identity) > 0:
        cols = [c for c in [vendor_id_field, vendor_name_field, tax_id_field, address_field] if c in df.columns]
        findings.append(VendorMasterFinding(
            test_name="WEAK_IDENTITY",
            risk_level="HIGH",
            record_count=len(weak_identity),
            description=f"{len(weak_identity)} proveedor(es) con nombre genérico/sospechoso o sin NIT ni dirección registrada — "
                        f"no hay forma de verificar la existencia legal del proveedor con los datos del maestro.",
            sample_records=weak_identity[cols].head(10).to_dict("records"),
        ))

    # ── Risk score ─────────────────────────────────────────────────────────
    risk_weights = {"CRITICAL": 35, "HIGH": 20, "MEDIUM": 10, "LOW": 3}
    risk_score = min(100.0, sum(risk_weights.get(f.risk_level, 0) for f in findings))

    active_count = len(df)
    if status_field in df.columns:
        status_norm = df[status_field].apply(_norm)
        is_inactive = status_norm.apply(lambda s: any(kw in s for kw in [_norm(k) for k in INACTIVE_STATUS_KEYWORDS]))
        active_count = int((~is_inactive).sum())

    summary = {
        "total_vendors":  len(df),
        "active_count":   active_count,
        "findings_count": len(findings),
        "critical_count": sum(1 for f in findings if f.risk_level == "CRITICAL"),
        "risk_score":     risk_score,
    }

    return VendorMasterReport(
        total_vendors=len(df),
        active_count=active_count,
        findings=findings,
        risk_score=risk_score,
        summary=summary,
    )
