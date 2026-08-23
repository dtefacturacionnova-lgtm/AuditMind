"""Segregación de Funciones (SoD — Segregation of Duties).
Detecta usuarios que acumulan permisos incompatibles entre sí sobre una
matriz usuario-permiso exportada del ERP (un registro por permiso asignado).
Fundamento: COSO 2013 Principios 10-11, NIA 315, IIA GTAG 8.
"""
import unicodedata
from dataclasses import dataclass, field
from typing import Any

import pandas as pd


@dataclass
class SoDFinding:
    test_name: str
    risk_level: str
    record_count: int
    description: str
    sample_records: list[dict] = field(default_factory=list)


@dataclass
class SoDReport:
    total_users: int
    total_assignments: int
    conflict_count: int
    findings: list[SoDFinding]
    risk_score: float
    top_conflicted_users: list[dict]
    summary: dict


# Cada tupla: (palabras clave lado A, palabras clave lado B, nombre del par, por qué es incompatible, severidad)
# El match es por substring sobre el texto de permiso normalizado (minúsculas, sin acentos).
INCOMPATIBLE_PAIRS: list[tuple[list[str], list[str], str, str, str]] = [
    (
        ["crear proveedor", "alta proveedor", "vendor_create", "maestro proveedor", "registrar proveedor"],
        ["aprobar pago", "autorizar pago", "payment_approve", "aprobacion de pago"],
        "Crear proveedor + Aprobar pago",
        "Permite dar de alta un proveedor ficticio y autorizar pagos a él sin contrapeso independiente.",
        "CRITICAL",
    ),
    (
        ["crear cliente", "alta cliente", "customer_create", "registrar cliente"],
        ["nota de credito", "credit_memo", "aplicar nota de credito"],
        "Crear cliente + Aplicar nota de crédito",
        "Permite crear una venta ficticia y revertirla luego vía nota de crédito sin control cruzado.",
        "HIGH",
    ),
    (
        ["registrar asiento", "registro contable", "gl_post", "contabilizar"],
        ["conciliar banco", "bank_reconciliation", "conciliacion bancaria"],
        "Registrar asientos + Conciliar banco",
        "Quien registra transacciones no debería conciliar el banco — permite ocultar movimientos irregulares.",
        "CRITICAL",
    ),
    (
        ["crear orden de compra", "purchase_order_create", "generar orden de compra"],
        ["recibir mercaderia", "goods_receipt", "aprobar orden de compra", "purchase_order_approve", "recepcion de mercaderia"],
        "Crear orden de compra + Recibir/Aprobar la misma orden",
        "Permite generar y auto-aprobar o auto-recibir compras sin segregación.",
        "HIGH",
    ),
    (
        ["procesar nomina", "payroll_process", "calcular nomina"],
        ["aprobar nomina", "payroll_approve", "autorizar nomina"],
        "Procesar nómina + Aprobar nómina",
        "Quien calcula la nómina no debería autorizarla — riesgo de pagos fantasma o inflados.",
        "CRITICAL",
    ),
    (
        ["administrar usuarios", "user_admin", "gestion de accesos", "administracion de accesos"],
        ["aprobar transacciones", "transaction_approve", "aprobacion de transacciones"],
        "Administración de usuarios + Aprobación de transacciones",
        "Un administrador de accesos con permisos de aprobación puede auto-asignarse control total.",
        "CRITICAL",
    ),
]

# Categorías sensibles para la prueba de concentración de accesos (TEST 2) —
# un usuario que acumula permisos en 3+ categorías distintas es de alto riesgo
# aunque ninguna combinación puntual esté en el catálogo de pares incompatibles.
SENSITIVE_CATEGORIES: dict[str, list[str]] = {
    "creacion_maestros":  ["crear proveedor", "crear cliente", "alta proveedor", "alta cliente", "maestro"],
    "aprobacion_pagos":   ["aprobar pago", "autorizar pago", "payment_approve"],
    "registro_contable":  ["registrar asiento", "gl_post", "contabilizar", "registro contable"],
    "conciliacion":       ["conciliar", "reconciliation"],
    "administracion_ti":  ["administrar usuarios", "user_admin", "gestion de accesos", "administracion de accesos"],
    "compras":            ["orden de compra", "purchase_order", "recepcion de mercaderia"],
}


def _norm(text: str) -> str:
    """Minúsculas + sin acentos, para que el match de palabras clave no
    dependa de que el texto de origen use exactamente la misma tilde que el
    catálogo (ej. 'Nómina' vs 'nomina' en INCOMPATIBLE_PAIRS)."""
    normalized = unicodedata.normalize("NFD", str(text).strip().lower())
    return "".join(c for c in normalized if unicodedata.category(c) != "Mn")


def analyze_sod(
    records: list[dict[str, Any]],
    user_field: str = "user",
    permission_field: str = "permission",
    user_name_field: str = "user_name",
    department_field: str = "department",
) -> SoDReport:
    """Analiza una matriz usuario-permiso (un registro por permiso asignado)."""
    if not records:
        raise ValueError("No hay registros de accesos para analizar")

    df = pd.DataFrame(records)
    if user_field not in df.columns or permission_field not in df.columns:
        raise ValueError("Se requieren las columnas de usuario y permiso mapeadas")

    df["_user"] = df[user_field].apply(_norm)
    df["_perm"] = df[permission_field].apply(_norm)
    df = df[(df["_user"] != "") & (df["_perm"] != "")]

    name_by_user: dict[str, str] = {}
    if user_name_field in df.columns:
        for u, n in zip(df["_user"], df[user_name_field]):
            if u not in name_by_user and pd.notna(n) and str(n).strip():
                name_by_user[u] = str(n).strip()

    perms_by_user: dict[str, set[str]] = {}
    for u, p in zip(df["_user"], df["_perm"]):
        perms_by_user.setdefault(u, set()).add(p)

    findings: list[SoDFinding] = []
    conflicted_users: dict[str, list[str]] = {}

    # ─────────────────────────────────────────────────────────────────────
    # TEST — un finding por cada par incompatible del catálogo que se
    # encuentre en al menos un usuario.
    # ─────────────────────────────────────────────────────────────────────
    for side_a, side_b, pair_name, why, severity in INCOMPATIBLE_PAIRS:
        offenders: list[dict] = []
        for u, perms in perms_by_user.items():
            has_a = any(any(kw in p for kw in side_a) for p in perms)
            has_b = any(any(kw in p for kw in side_b) for p in perms)
            if has_a and has_b:
                offenders.append({
                    "usuario":   name_by_user.get(u, u),
                    "conflicto": pair_name,
                    "permisos_en_conflicto": sorted(
                        p for p in perms
                        if any(kw in p for kw in side_a) or any(kw in p for kw in side_b)
                    ),
                })
                conflicted_users.setdefault(u, []).append(pair_name)
        if offenders:
            findings.append(SoDFinding(
                test_name=f"SOD_{pair_name}",
                risk_level=severity,
                record_count=len(offenders),
                description=f"{len(offenders)} usuario(s) con el conflicto \"{pair_name}\". {why}",
                sample_records=offenders[:10],
            ))

    # ─────────────────────────────────────────────────────────────────────
    # TEST — concentración de accesos sensibles (3+ categorías distintas)
    # ─────────────────────────────────────────────────────────────────────
    concentration_offenders: list[dict] = []
    for u, perms in perms_by_user.items():
        categories_hit = [
            cat for cat, kws in SENSITIVE_CATEGORIES.items()
            if any(any(kw in p for kw in kws) for p in perms)
        ]
        if len(categories_hit) >= 3:
            concentration_offenders.append({
                "usuario": name_by_user.get(u, u),
                "categorias_sensibles": categories_hit,
                "total_permisos": len(perms),
            })
    if concentration_offenders:
        findings.append(SoDFinding(
            test_name="ACCESS_CONCENTRATION",
            risk_level="HIGH",
            record_count=len(concentration_offenders),
            description=f"{len(concentration_offenders)} usuario(s) acumulan permisos en 3 o más categorías "
                        f"sensibles (creación de maestros, aprobación de pagos, registro contable, conciliación, "
                        f"administración de accesos, compras) — riesgo de control total sin contrapeso, aunque "
                        f"ninguna combinación puntual esté en el catálogo de conflictos conocidos.",
            sample_records=concentration_offenders[:10],
        ))

    # ── Risk score ─────────────────────────────────────────────────────────
    risk_weights = {"CRITICAL": 35, "HIGH": 20, "MEDIUM": 10, "LOW": 3}
    risk_score = min(100.0, sum(risk_weights.get(f.risk_level, 0) for f in findings))

    top_conflicted_users = [
        {"usuario": name_by_user.get(u, u), "conflictos": pairs, "total_conflictos": len(pairs)}
        for u, pairs in sorted(conflicted_users.items(), key=lambda kv: -len(kv[1]))[:10]
    ]

    summary = {
        "total_users":       len(perms_by_user),
        "total_assignments": len(df),
        "conflict_count":    len(conflicted_users),
        "findings_count":    len(findings),
        "critical_count":    sum(1 for f in findings if f.risk_level == "CRITICAL"),
        "risk_score":        risk_score,
    }

    return SoDReport(
        total_users=len(perms_by_user),
        total_assignments=len(df),
        conflict_count=len(conflicted_users),
        findings=findings,
        risk_score=risk_score,
        top_conflicted_users=top_conflicted_users,
        summary=summary,
    )
