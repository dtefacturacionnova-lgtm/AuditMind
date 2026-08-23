"""Suite de Validación DTE — Documentos Tributarios Electrónicos (El Salvador).

A diferencia de los demás motores CAATs (que operan sobre filas tabulares de
un CSV/Excel), este analiza el JSON completo de cada DTE tal como se recibe
de Hacienda/el emisor — un registro = un documento, con su estructura anidada
intacta (identificacion, emisor, receptor, cuerpoDocumento, resumen, apendice,
respuestaHacienda, firmaElectronica, selloRecibido).

Los 14 esquemas oficiales JSON Schema Draft-07 del Ministerio de Hacienda
(carpeta `dte_schemas/`, copiados de MODULOS/FACTURACION/MD/Version2/
ArchivosOficiales/svfe-json-schemas en el proyecto hermano dtes-y-analítica-sv
— ver docs/migrations/V2_MIGRATION_PLAN.md de ese repo) validan el PAYLOAD
interno (identificacion..apendice) — no incluyen respuestaHacienda,
firmaElectronica ni selloRecibido, porque esos campos se agregan DESPUÉS de
que el firmador firma el documento. Por eso la validación estructural se hace
sobre ese subconjunto, y el sello/firma se validan aparte como una capa de
"sobre" (envelope) distinta.

firmaElectronica es un JWS compacto (header.payload.firma, base64url) — se
decodifica SIN verificar la firma criptográfica (no tenemos la clave pública
del certificado de Hacienda para cada documento; ver limitación en
caats-methodology.ts). Lo que SÍ se puede verificar sin la clave: que la
firma tenga la forma correcta, y que el contenido firmado coincida con el
documento recibido (detecta alteración posterior a la firma).
"""
import base64
import json
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from jsonschema import Draft7Validator


@dataclass
class DteFinding:
    test_name: str
    risk_level: str
    record_count: int
    description: str
    sample_records: list[dict] = field(default_factory=list)


@dataclass
class DteValidationReport:
    total_dtes: int
    valid_structure_count: int
    findings: list[DteFinding]
    risk_score: float
    summary: dict
    tipo_breakdown: list[dict]


# ─── Esquemas oficiales MH por tipo de documento ──────────────────────────────
_SCHEMA_DIR = Path(__file__).parent / "dte_schemas"

_SCHEMA_BY_TIPO = {
    "01": "fe-f-v2.json",     "03": "fe-ccf-v4.json",  "04": "fe-nr-v4.json",
    "05": "fe-nc-v4.json",    "06": "fe-nd-v4.json",   "07": "fe-cr-v2.json",
    "08": "fe-cl-v2.json",    "09": "fe-dcl-v2.json",  "11": "fe-fex-v3.json",
    "14": "fe-fse-v2.json",   "15": "fe-cd-v2.json",
}
_TIPO_LABELS = {
    "01": "Factura", "03": "Comprobante de Crédito Fiscal", "04": "Nota de Remisión",
    "05": "Nota de Crédito", "06": "Nota de Débito", "07": "Comprobante de Retención",
    "08": "Comprobante de Liquidación", "09": "Documento Contable de Liquidación",
    "11": "Factura de Exportación", "14": "Factura de Sujeto Excluido",
    "15": "Comprobante de Donación",
}
_ENVELOPE_KEYS = ("respuestaHacienda", "firmaElectronica", "selloRecibido")
_ACCEPTED_ESTADOS = {"PROCESADO"}

_validators_cache: dict[str, Draft7Validator] = {}


def _get_validator(tipo_dte: str) -> Draft7Validator | None:
    filename = _SCHEMA_BY_TIPO.get(tipo_dte)
    if not filename:
        return None
    if tipo_dte not in _validators_cache:
        with open(_SCHEMA_DIR / filename, encoding="utf-8") as f:
            _validators_cache[tipo_dte] = Draft7Validator(json.load(f))
    return _validators_cache[tipo_dte]


def _b64url_decode(segment: str) -> bytes:
    padding = "=" * (-len(segment) % 4)
    return base64.urlsafe_b64decode(segment + padding)


def _decode_jws(firma: str) -> tuple[dict | None, dict | None, str | None]:
    """(header, payload, error) — decodifica un JWS compacto SIN verificar la
    firma criptográfica. error es None si se pudo decodificar ambos segmentos."""
    parts = firma.split(".")
    if len(parts) != 3:
        return None, None, "el campo no tiene la forma JWS esperada (header.payload.firma)"
    try:
        header = json.loads(_b64url_decode(parts[0]))
    except Exception:
        return None, None, "no se pudo decodificar el encabezado de la firma"
    try:
        payload = json.loads(_b64url_decode(parts[1]))
    except Exception:
        return header, None, "no se pudo decodificar el contenido firmado"
    return header, payload, None


def _doc_label(iden: dict) -> str:
    tipo = str(iden.get("tipoDte") or "")
    return f"{_TIPO_LABELS.get(tipo, f'Tipo {tipo}' if tipo else 'Tipo desconocido')} — {iden.get('numeroControl') or '(sin número de control)'}"


def analyze_dte_validation(dtes: list[dict[str, Any]]) -> DteValidationReport:
    """Valida un lote de DTEs (JSON completo tal como se recibe) contra el
    esquema oficial de Hacienda, el sello de recepción, y la integridad de la
    firma electrónica. No requiere field_mapping — la estructura del DTE la
    define Hacienda, no el auditor."""
    if not dtes:
        raise ValueError("No hay documentos DTE para analizar")

    valid_structure = 0
    tipo_counts: dict[str, int] = {}

    unsupported: list[dict] = []
    structural_errors: list[dict] = []
    missing_sello: list[dict] = []
    rejected: list[dict] = []
    signature_issues: list[dict] = []
    ambiente_pruebas: list[dict] = []
    codigo_gen_seen: dict[str, list[dict]] = {}
    correlativos: dict[tuple[str, str], list[tuple[int, dict]]] = {}

    for idx, dte in enumerate(dtes):
        if not isinstance(dte, dict):
            structural_errors.append({"documento": f"Registro #{idx + 1}", "error": "El registro no es un objeto JSON válido"})
            continue

        iden = dte.get("identificacion") or {}
        tipo_dte = str(iden.get("tipoDte") or "")
        codigo_gen = str(iden.get("codigoGeneracion") or "").strip().upper()
        numero_control = str(iden.get("numeroControl") or "").strip()
        ambiente = str(iden.get("ambiente") or "")
        label = _doc_label(iden)

        tipo_counts[tipo_dte or "(sin tipo)"] = tipo_counts.get(tipo_dte or "(sin tipo)", 0) + 1

        # ── Validación estructural contra el esquema oficial ──────────────
        validator = _get_validator(tipo_dte)
        if validator is None:
            unsupported.append({"documento": label, "tipoDte": tipo_dte or "(vacío)"})
        else:
            inner = {k: v for k, v in dte.items() if k not in _ENVELOPE_KEYS}
            errors = sorted(validator.iter_errors(inner), key=lambda e: list(e.path))
            if errors:
                detail = "; ".join(
                    f"{'.'.join(str(p) for p in e.path) or '(raíz)'}: {e.message}" for e in errors[:5]
                )
                if len(errors) > 5:
                    detail += f"; y {len(errors) - 5} error(es) adicional(es)"
                structural_errors.append({"documento": label, "errores": detail, "total_errores": len(errors)})
            else:
                valid_structure += 1

        # ── Sello de recepción ─────────────────────────────────────────────
        respuesta = dte.get("respuestaHacienda") or {}
        sello = dte.get("selloRecibido") or respuesta.get("selloRecibido")
        estado = respuesta.get("estado")
        if not sello:
            missing_sello.append({"documento": label, "estado": estado or "(sin respuesta de Hacienda)"})
        if estado and estado not in _ACCEPTED_ESTADOS:
            rejected.append({"documento": label, "estado": estado, "observaciones": respuesta.get("observaciones") or ""})

        # ── Firma electrónica (JWS) ────────────────────────────────────────
        firma = dte.get("firmaElectronica")
        if not firma:
            signature_issues.append({"documento": label, "problema": "no trae firma electrónica (firmaElectronica)"})
        else:
            _, payload, err = _decode_jws(firma)
            if err:
                signature_issues.append({"documento": label, "problema": err})
            else:
                payload_iden = (payload or {}).get("identificacion") or {}
                mismatches = [
                    campo for campo in ("codigoGeneracion", "tipoDte", "numeroControl")
                    if payload_iden.get(campo) and str(payload_iden.get(campo)) != str(iden.get(campo))
                ]
                if mismatches:
                    signature_issues.append({
                        "documento": label,
                        "problema": f"el contenido firmado no coincide con el documento recibido en: {', '.join(mismatches)} "
                                    f"— posible alteración posterior a la firma",
                    })

        # ── Ambiente de pruebas mezclado con producción ────────────────────
        if ambiente == "00":
            ambiente_pruebas.append({"documento": label})

        # ── Duplicados de código de generación ─────────────────────────────
        if codigo_gen:
            codigo_gen_seen.setdefault(codigo_gen, []).append({"documento": label})

        # ── Correlativo por establecimiento+punto de venta (para brechas) ──
        parts = numero_control.split("-")
        if len(parts) == 4 and parts[3].isdigit():
            key = (tipo_dte, parts[2])
            correlativos.setdefault(key, []).append((int(parts[3]), {"documento": label, "correlativo": parts[3]}))

    # ── Construir hallazgos ─────────────────────────────────────────────────
    findings: list[DteFinding] = []

    if structural_errors:
        findings.append(DteFinding(
            test_name="STRUCTURAL_SCHEMA",
            risk_level="CRITICAL",
            record_count=len(structural_errors),
            description=f"{len(structural_errors)} documento(s) no cumplen la estructura del esquema técnico oficial "
                        f"de Hacienda para su tipo de DTE — posible documento corrupto, editado manualmente, o "
                        f"generado por un sistema no homologado.",
            sample_records=structural_errors[:10],
        ))

    if unsupported:
        findings.append(DteFinding(
            test_name="UNSUPPORTED_DTE_TYPE",
            risk_level="LOW",
            record_count=len(unsupported),
            description=f"{len(unsupported)} documento(s) con un tipo de DTE no cubierto por los esquemas cargados "
                        f"en este motor — no se pudo validar su estructura (no es evidencia de un problema, es una "
                        f"limitación de cobertura del validador).",
            sample_records=unsupported[:10],
        ))

    if missing_sello:
        findings.append(DteFinding(
            test_name="MISSING_SELLO",
            risk_level="CRITICAL",
            record_count=len(missing_sello),
            description=f"{len(missing_sello)} documento(s) sin Sello de Recepción de Hacienda — el documento no "
                        f"tiene evidencia de haber sido recibido/validado por el Ministerio de Hacienda y no debería "
                        f"soportar un registro contable como transacción válida.",
            sample_records=missing_sello[:10],
        ))

    if rejected:
        findings.append(DteFinding(
            test_name="REJECTED_OR_OBSERVED",
            risk_level="HIGH",
            record_count=len(rejected),
            description=f"{len(rejected)} documento(s) con estado de Hacienda distinto de PROCESADO (rechazado, "
                        f"invalidado, en contingencia, u observado) — verificar que no estén contabilizados como "
                        f"transacciones válidas.",
            sample_records=rejected[:10],
        ))

    if signature_issues:
        findings.append(DteFinding(
            test_name="SIGNATURE_INTEGRITY",
            risk_level="CRITICAL",
            record_count=len(signature_issues),
            description=f"{len(signature_issues)} documento(s) con problemas de firma electrónica — ausente, "
                        f"malformada, o cuyo contenido firmado no coincide con el documento recibido.",
            sample_records=signature_issues[:10],
        ))

    duplicates = [{"codigoGeneracion": k, "documentos": ", ".join(d["documento"] for d in v)}
                  for k, v in codigo_gen_seen.items() if len(v) > 1]
    if duplicates:
        findings.append(DteFinding(
            test_name="DUPLICATE_CODIGO_GENERACION",
            risk_level="CRITICAL",
            record_count=len(duplicates),
            description=f"{len(duplicates)} código(s) de generación (UUID único por documento) repetido(s) en más "
                        f"de un DTE del lote — posible doble registro contable del mismo documento.",
            sample_records=duplicates[:10],
        ))

    gap_groups = []
    for (tipo, estab_pos), items in correlativos.items():
        if len(items) < 2:
            continue
        nums = sorted(n for n, _ in items)
        missing = [n for n in range(nums[0], nums[-1] + 1) if n not in set(nums)]
        if missing:
            shown = missing[:20]
            gap_groups.append({
                "tipo": _TIPO_LABELS.get(tipo, tipo), "establecimiento_punto_venta": estab_pos,
                "correlativos_faltantes": ", ".join(str(n).zfill(15) for n in shown) + (f" y {len(missing) - 20} más" if len(missing) > 20 else ""),
                "total_faltantes": len(missing),
            })
    if gap_groups:
        findings.append(DteFinding(
            test_name="CORRELATIVO_GAP",
            risk_level="HIGH",
            record_count=sum(g["total_faltantes"] for g in gap_groups),
            description=f"Se detectaron brechas en la numeración correlativa de {len(gap_groups)} combinación(es) "
                        f"tipo/establecimiento — documentos pre-numerados ausentes del lote, posible ingreso no "
                        f"registrado o documento anulado sin nota de invalidación.",
            sample_records=gap_groups[:10],
        ))

    if ambiente_pruebas:
        findings.append(DteFinding(
            test_name="AMBIENTE_PRUEBAS",
            risk_level="HIGH",
            record_count=len(ambiente_pruebas),
            description=f"{len(ambiente_pruebas)} documento(s) generado(s) en ambiente de Pruebas (00) mezclado(s) "
                        f"con el lote — no deberían formar parte de transacciones reales de producción.",
            sample_records=ambiente_pruebas[:10],
        ))

    risk_weights = {"CRITICAL": 35, "HIGH": 20, "MEDIUM": 10, "LOW": 3}
    risk_score = min(100.0, sum(risk_weights.get(f.risk_level, 0) for f in findings))

    tipo_breakdown = [
        {"tipo": _TIPO_LABELS.get(t, t), "codigo": t, "cantidad": c}
        for t, c in sorted(tipo_counts.items(), key=lambda kv: -kv[1])
    ]

    summary = {
        "total_dtes":           len(dtes),
        "valid_structure_count": valid_structure,
        "findings_count":       len(findings),
        "critical_count":       sum(1 for f in findings if f.risk_level == "CRITICAL"),
        "risk_score":           risk_score,
    }

    return DteValidationReport(
        total_dtes=len(dtes),
        valid_structure_count=valid_structure,
        findings=findings,
        risk_score=risk_score,
        summary=summary,
        tipo_breakdown=tipo_breakdown,
    )
