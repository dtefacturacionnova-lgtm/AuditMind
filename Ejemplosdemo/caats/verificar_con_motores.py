# -*- coding: utf-8 -*-
"""Pasa cada base sintética por el MISMO camino que el portal de CAATs y comprueba que cada anomalía sembrada se detecte.

Reproduce lo que hace el portal: lee el CSV como `/ai/parse-file`, mapea las columnas igual que `autoMatchColumn` (lib/caats-fields.ts), arma
el mismo cuerpo que `buildCaatsRunPayload` y llama a la misma función de `apps/ai-service/app/routers/analytics.py`.

Uso (desde apps/ai-service, con su entorno virtual):

    venv/Scripts/python.exe ../../Ejemplosdemo/caats/verificar_con_motores.py            # verifica y termina con error si algo no se detecta
    venv/Scripts/python.exe ../../Ejemplosdemo/caats/verificar_con_motores.py --ver      # además imprime los hallazgos de cada motor

El screening de sanciones NO se ejecuta aquí: lee la lista de la base de datos del servidor.
"""
import asyncio
import json
import warnings
import os
import re
import sys
import unicodedata

import pandas as pd

AQUI = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(AQUI, "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "apps", "ai-service"))
sys.stdout = __import__("io").TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace", line_buffering=True)

from app.config import settings  # noqa: E402
from app.routers import analytics as A  # noqa: E402

KEY = settings.INTERNAL_API_KEY
warnings.filterwarnings("ignore")

# ── Espejo en Python de apps/web/src/lib/caats-fields.ts (se lee del propio archivo para no desincronizarse) ──────────────────────────
TS = open(os.path.join(ROOT, "apps", "web", "src", "lib", "caats-fields.ts"), encoding="utf-8").read()


def _bloque(nombre: str) -> str:
    m = re.search(r"export const " + nombre + r"[^=]*=\s*\{(.*?)\n\};", TS, flags=re.S)
    return m.group(1)


ALIASES = {k: re.findall(r"'([^']*)'", v) for k, v in re.findall(r"^\s+(\w+):\s*\[(.*?)\],?\s*$", _bloque("FIELD_ALIASES"), flags=re.M)}
DEFS = {}
for motor, cuerpo in re.findall(r"^  (\w+): \[\n(.*?)\n  \],", _bloque("FIELD_DEFS"), flags=re.S | re.M):
    DEFS[motor] = [(k, "required: true" in resto) for k, resto in re.findall(r"\{ key: '(\w+)'(.*?)\}", cuerpo)]
SEC = re.findall(r"party_name|relationship|tax_id", "")  # el segundo archivo de partes relacionadas se mapea aparte (abajo)


def norm(c: str) -> str:
    return re.sub(r"[\s_\-]", "", "".join(ch for ch in unicodedata.normalize("NFD", c.lower()) if unicodedata.category(ch) != "Mn"))


def automatch(clave: str, columnas: list) -> str:
    aliases = [norm(a) for a in ALIASES.get(clave, [clave])]
    for c in columnas:
        if norm(c) in aliases:
            return c
    for c in columnas:
        nc = norm(c)
        if any(a in nc or nc in a for a in aliases):
            return c
    return ""


def leer(ruta: str) -> pd.DataFrame:
    df = pd.read_csv(ruta)
    return df.astype(object).where(df.notna(), None)


def run(corutina):
    return asyncio.run(corutina)


def hallazgos(res: dict) -> dict:
    return {f["test_name"]: f["record_count"] for f in res.get("findings", [])}


# ── Qué debe detectarse en cada base ──────────────────────────────────────────────────────────────────────────────────────────────────
# `debe`: pruebas que tienen que aparecer. `no_debe`: pruebas que NO deben aparecer (la base «limpia» no las dispara por accidente).
# `min`: mínimo de registros esperados en una prueba.
ESPERADO = {
    "01_libro_mayor.csv": ("gl", {"debe": ["ROUND_AMOUNTS", "END_OF_PERIOD", "DUPLICATE_AMOUNT_USER", "WEEKEND_ENTRIES", "OFF_HOURS_ENTRIES", "HIGH_VOLUME_USER"], "no_debe": [], "min": {}}),
    "02_cuentas_por_pagar.csv": ("ap", {"debe": ["DUPLICATE_INVOICES", "INVOICE_SPLITTING", "GHOST_VENDORS", "EARLY_PAYMENT", "LATE_PAYMENT", "VENDOR_CONCENTRATION"], "no_debe": [], "min": {"GHOST_VENDORS": 3, "DUPLICATE_INVOICES": 6}, "exacto": {"GHOST_VENDORS": 3}}),
    "03_nomina.csv": ("payroll", {"debe": ["GHOST_EMPLOYEES", "PAY_OUTLIERS", "NET_EXCEEDS_GROSS", "SHARED_BANK_ACCOUNTS", "APPROVER_CONCENTRATION"], "no_debe": [], "min": {"GHOST_EMPLOYEES": 3, "NET_EXCEEDS_GROSS": 3}}),
    "06_matriz_accesos_sod.csv": ("sod", {"debe": ["ACCESS_CONCENTRATION"], "debe_prefijo": ["SOD_"], "no_debe": [], "min": {}}),
    "07_maestro_proveedores.csv": ("vendor_master", {"debe": ["DUPLICATE_TAX_ID", "DUPLICATE_BANK_ACCOUNT", "DUPLICATE_ADDRESS", "INACTIVE_WITH_RECENT_ACTIVITY", "WEAK_IDENTITY"], "no_debe": [], "min": {"WEAK_IDENTITY": 3}, "exacto": {"WEAK_IDENTITY": 3}}),
    "09_gastos_representacion.csv": ("expenses", {"debe": ["NEAR_APPROVAL_THRESHOLD", "SPLIT_EXPENSES", "WEEKEND_EXPENSES", "DUPLICATE_EXPENSES", "EMPLOYEE_CONCENTRATION"], "no_debe": [], "min": {}}),
    "10_corte_ingresos.csv": ("revenue_cutoff", {"debe": ["CUTOFF_DELIVERY_MISMATCH", "CUTOFF_CONCENTRATION"], "no_debe": ["CUTOFF_NO_DELIVERY_DATA"], "min": {}}),
    "11_licitaciones.csv": ("bid_rigging", {"debe": ["BID_UNIFORMITY", "CLOSE_LOSING_BIDS", "DISPROPORTIONATE_WIN_RATE"], "no_debe": [], "min": {}}),
    "12_cuentas_por_cobrar.csv": ("ar_aging", {"debe": ["SEVERELY_OVERDUE", "CUSTOMER_CONCENTRATION", "POST_PERIOD_CREDIT_NOTES"], "no_debe": [], "min": {}}),
    "13_activo_fijo.csv": ("fixed_assets", {"debe": ["DEPRECIATION_MISMATCH", "FULLY_DEPRECIATED_STILL_ACTIVE", "STALE_PHYSICAL_CHECK"], "no_debe": [], "min": {}}),
    "14_depositos_pitufeo.csv": ("structuring", {"debe": ["NEAR_REPORTING_THRESHOLD", "STRUCTURING_PATTERN"], "no_debe": [], "min": {}}),
    "15_missing_trader.csv": ("missing_trader", {"debe": ["BURST_ACTIVITY", "WEAK_IDENTITY_HIGH_VALUE"], "no_debe": [], "min": {}}),
    "16_jurisdicciones.csv": ("tax_haven", {"debe": ["LOW_TAX_JURISDICTION_TRANSACTIONS", "HIGH_HAVEN_CONCENTRATION"], "no_debe": [], "min": {}}),
}

# columnas que el portal NO puede mapear solo con sus alias: se indica el mapeo manual que el usuario debe hacer (y se documenta en LEEME.md)
MANUAL = {}  # hoy todas las bases se mapean solas (el portal reconoce «cliente» desde que se agregaron esos alias)

fallos, avisos = [], []


def ok(msg):
    print("  [OK]    " + msg)


def mal(msg):
    fallos.append(msg)
    print("  [FALLA] " + msg)


def mapear(archivo: str, motor: str, columnas: list) -> dict:
    mapeo = {}
    for clave, requerido in DEFS[motor]:
        col = automatch(clave, columnas)
        if not col and archivo in MANUAL and clave in MANUAL[archivo]:
            col = MANUAL[archivo][clave]
            avisos.append(f"{archivo}: «{clave}» no se mapea solo; mapear a mano la columna «{col}»")
        if col:
            mapeo[clave] = col
        elif requerido:
            mal(f"{archivo}: el campo obligatorio «{clave}» no se pudo mapear")
    return mapeo


def llamar(motor: str, registros: list, mapeo: dict):
    req = A.RecordsRequest(records=registros, field_mapping=mapeo)
    fn = {
        "gl": A.gl_analysis, "ap": A.ap_analysis, "payroll": A.payroll_analysis, "sod": A.sod_analysis, "vendor_master": A.vendor_master_analysis,
        "expenses": A.expenses_analysis, "revenue_cutoff": A.revenue_cutoff_analysis, "bid_rigging": A.bid_rigging_analysis, "ar_aging": A.ar_aging_analysis,
        "fixed_assets": A.fixed_assets_analysis, "structuring": A.structuring_analysis, "missing_trader": A.missing_trader_analysis, "tax_haven": A.tax_haven_analysis,
    }[motor]
    return run(fn(req, x_internal_key=KEY))


def verificar_tabulares(ver: bool):
    for archivo, (motor, esp) in ESPERADO.items():
        print(f"\n{archivo} → {motor}")
        df = leer(os.path.join(AQUI, archivo))
        mapeo = mapear(archivo, motor, list(df.columns))
        res = llamar(motor, df.to_dict("records"), mapeo)
        h = hallazgos(res)
        if ver:
            for t, n in h.items():
                print(f"      · {t}: {n}")
        for t in esp["debe"]:
            ok(f"{t} ({h[t]})") if t in h else mal(f"{archivo}: NO se detectó {t}")
        for pre in esp.get("debe_prefijo", []):
            hits = [t for t in h if t.startswith(pre)]
            ok(f"{len(hits)} conflicto(s) del catálogo: {', '.join(t.replace(pre, '') for t in hits)}") if hits else mal(f"{archivo}: no hay hallazgos {pre}*")
        for t in esp["no_debe"]:
            mal(f"{archivo}: apareció {t} y no debía") if t in h else ok(f"{t} no aparece (correcto)")
        for t, exacto in esp.get("exacto", {}).items():
            if h.get(t) != exacto:
                mal(f"{archivo}: {t} detectó {h.get(t)} y debían ser exactamente {exacto} (los nombres corrientes no deben marcarse como fantasma)")
        for t, minimo in esp["min"].items():
            if t in h and h[t] < minimo:
                mal(f"{archivo}: {t} detectó {h[t]} y se sembraron al menos {minimo}")
        extra = [t for t in h if t not in esp["debe"] and not any(t.startswith(p) for p in esp.get("debe_prefijo", []))]
        if extra:
            print(f"      (además aparecen: {', '.join(extra)})")


def verificar_benford(ver: bool):
    from app.services.caats.benford import analyze_benford

    for archivo, esperado in (("04a_benford_natural.csv", {"CLOSE", "ACCEPTABLE"}), ("04b_benford_manipulado.csv", {"SUSPECT", "NON_CONFORMING"})):
        print(f"\n{archivo} → benford")
        df = leer(os.path.join(AQUI, archivo))
        montos = [float(x) for x in df["monto"] if x is not None]
        r = analyze_benford(amounts=montos, raw_records=None)
        d = json.loads(json.dumps(__import__("dataclasses").asdict(r), default=str))
        conf = d.get("conformity") or d.get("mad_conformity") or d.get("conformity_level")
        if ver:
            print(f"      · conformidad={conf} MAD={d.get('mad')} riesgo={d.get('risk_score')}")
        ok(f"conformidad {conf}") if conf in esperado else mal(f"{archivo}: conformidad {conf}, se esperaba {sorted(esperado)}")


def verificar_anomalias(ver: bool):
    from app.services.caats.anomaly_detection import detect_anomalies

    print("\n05_anomalias_transacciones.csv → anomaly")
    df = leer(os.path.join(AQUI, "05_anomalias_transacciones.csv"))
    registros = df.to_dict("records")
    r = detect_anomalies(records=registros, numeric_fields=["monto", "cantidad", "descuento_pct", "dias_credito"], contamination=0.05)
    d = json.loads(json.dumps(__import__("dataclasses").asdict(r), default=str))
    anomalas = d.get("anomalies") or d.get("anomalous_records") or d.get("top_anomalies") or []
    if ver:
        print(f"      · {d.get('anomaly_count')} anomalías de {d.get('total_records')} registros")
    refs = {str(a.get("referencia") or (a.get("record") or {}).get("referencia")) for a in anomalas}
    sembradas = {f"TX-{500 + k:05d}" for k in range(12)}
    acierto = len(refs & sembradas)
    ok(f"{acierto} de {len(sembradas)} anomalías sembradas detectadas") if acierto >= 9 else mal(f"05: solo {acierto} de {len(sembradas)} anomalías sembradas detectadas")


def verificar_partes_relacionadas(ver: bool):
    print("\n08a/08b partes relacionadas → related_parties")
    tx = leer(os.path.join(AQUI, "08a_partes_relacionadas_transacciones.csv"))
    ref = leer(os.path.join(AQUI, "08b_registro_partes_relacionadas.csv"))
    cols = list(tx.columns)
    fm = {k: automatch(k, cols) for k, _ in DEFS["related_parties"]}
    fm = {k: v for k, v in fm.items() if v}
    rfm = {k: automatch(k, list(ref.columns)) for k in ("party_name", "relationship", "tax_id")}
    rfm = {k: v for k, v in rfm.items() if v}
    for k in ("vendor_name", "amount"):
        if k not in fm:
            mal(f"08a: el campo obligatorio «{k}» no se pudo mapear")
    for k in ("party_name", "relationship"):
        if k not in rfm:
            mal(f"08b: el campo obligatorio «{k}» no se pudo mapear")
    req = A.DualRecordsRequest(records=tx.to_dict("records"), field_mapping=fm, reference_records=ref.to_dict("records"), reference_field_mapping=rfm)
    h = hallazgos(run(A.related_parties_analysis(req, x_internal_key=KEY)))
    if ver:
        for t, n in h.items():
            print(f"      · {t}: {n}")
    for t in ("RELATED_PARTY_MATCH_TAX_ID", "RELATED_PARTY_MATCH_NAME", "EMPLOYEE_AS_COUNTERPARTY"):
        ok(f"{t} ({h[t]})") if t in h else mal(f"08: NO se detectó {t}")


def verificar_dte(ver: bool):
    from app.services.caats.dte_validation_analysis import analyze_dte_validation

    print("\n17_dte_lote_completo.json → dte_validation")
    docs = json.load(open(os.path.join(AQUI, "17_dte_lote_completo.json"), encoding="utf-8"))
    r = analyze_dte_validation(dtes=docs)
    d = json.loads(json.dumps(__import__("dataclasses").asdict(r), default=str))
    h = {f["test_name"]: f["record_count"] for f in d["findings"]}
    if ver:
        for t, n in h.items():
            print(f"      · {t}: {n}")
    esperado = {"STRUCTURAL_SCHEMA": 1, "MISSING_SELLO": 1, "REJECTED_OR_OBSERVED": 1, "SIGNATURE_INTEGRITY": 2, "DUPLICATE_CODIGO_GENERACION": 1, "AMBIENTE_PRUEBAS": 1, "CORRELATIVO_GAP": 3}
    for t, minimo in esperado.items():
        if t not in h:
            mal(f"17: NO se detectó {t} — hallazgos: {', '.join(h) or 'ninguno'}")
        elif h[t] < minimo:
            mal(f"17: {t} detectó {h[t]} y se sembraron {minimo}")
        else:
            ok(f"{t} ({h[t]})")


if __name__ == "__main__":
    ver = "--ver" in sys.argv
    verificar_tabulares(ver)
    verificar_benford(ver)
    verificar_anomalias(ver)
    verificar_partes_relacionadas(ver)
    verificar_dte(ver)
    print("\n" + "=" * 70)
    for a in avisos:
        print("  [AVISO] " + a)
    if fallos:
        print(f"\n{len(fallos)} PROBLEMA(S):")
        for f in fallos:
            print("  - " + f)
        sys.exit(1)
    print("\nTODAS LAS ANOMALÍAS SEMBRADAS SE DETECTAN")
