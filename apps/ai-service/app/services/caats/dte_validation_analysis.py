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
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any, Optional

from jsonschema import Draft7Validator, validators
from jsonschema.exceptions import ValidationError

from app.services.caats.dte_mh import clasificar_estado, dte_monto, monto_diferente
from app.services.caats.dte_versions import (
    ENVELOPE_KEYS, detect_dte_version, extract_firma, extract_respuesta, extract_sello, is_confirmed_v1, v1_structure_problems,
)


def _multiple_of_decimal(validator, multiple, instance, schema):
    """`multipleOf` con aritmética DECIMAL. El de `jsonschema` divide números flotantes y da falsos errores con cualquier monto con
    centavos: «1230.61 is not a multiple of 1e-08», «4405.82 is not a multiple of 0.01». Los esquemas oficiales del MH lo usan en casi
    todos los montos, así que un DTE válido salía como «estructura inválida». Aquí cada número se toma como el texto con que se
    escribió (Decimal(str(x))) y se comprueba el resto exacto."""
    if not validator.is_type(instance, "number"):
        return
    try:
        remainder = Decimal(str(instance)) % Decimal(str(multiple))
    except (InvalidOperation, ZeroDivisionError):
        return  # no se puede comprobar con exactitud (números enormes): no se inventa un error
    if remainder != 0:
        yield ValidationError(f"{instance} is not a multiple of {multiple}")


_DteValidator = validators.extend(Draft7Validator, {"multipleOf": _multiple_of_decimal})


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
    version_breakdown: list[dict] = field(default_factory=list)
    # Solo con consulta al MH (si no se consultó quedan en None y la pantalla no los muestra):
    mh_consultados: Optional[int] = None   # documentos sobre los que Hacienda dio una respuesta concluyente
    mh_confirmados: Optional[int] = None   # de ellos, los que Hacienda tiene procesados y sin ninguna diferencia


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
_ENVELOPE_KEYS = ENVELOPE_KEYS  # respuesta del MH, sello y firma, con todos los nombres con que se han visto (ver dte_versions.py)
_ACCEPTED_ESTADOS = {"PROCESADO"}

_validators_cache: dict[str, Any] = {}


def _get_validator(tipo_dte: str):
    filename = _SCHEMA_BY_TIPO.get(tipo_dte)
    if not filename:
        return None
    if tipo_dte not in _validators_cache:
        with open(_SCHEMA_DIR / filename, encoding="utf-8") as f:
            _validators_cache[tipo_dte] = _DteValidator(json.load(f))
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


def analyze_dte_validation(dtes: list[dict[str, Any]], mh_consultas: Optional[list[dict]] = None) -> DteValidationReport:
    """Valida un lote de DTEs (JSON completo tal como se recibe) contra el
    esquema oficial de Hacienda, el sello de recepción, y la integridad de la
    firma electrónica. No requiere field_mapping — la estructura del DTE la
    define Hacienda, no el auditor.

    `mh_consultas` (opcional) son las respuestas de la consulta pública de Hacienda para esos documentos (ver dte_mh.py): si se pasan,
    además se confirma que cada documento exista en Hacienda y que su estado, sello y monto coincidan con los del archivo."""
    if not dtes:
        raise ValueError("No hay documentos DTE para analizar")

    consultado_mh = mh_consultas is not None
    mh_index: dict[str, dict] = {}
    for c in mh_consultas or []:
        code = str(c.get("codigo_generacion") or "").strip().upper() if isinstance(c, dict) else ""
        if code:
            mh_index[code] = c
    mh_clases = {"confirmado": 0, "adverso": 0, "no_encontrado": 0, "sin_respuesta": 0}
    mh_limpios = 0
    mh_no_encontrado: list[dict] = []
    mh_adverso: list[dict] = []
    mh_monto: list[dict] = []
    mh_sello: list[dict] = []
    mh_inconsistente: list[dict] = []
    mh_sin_consulta: list[dict] = []

    valid_structure = 0
    tipo_counts: dict[str, int] = {}
    version_counts: dict[str, int] = {"v1": 0, "v2": 0}
    v1_docs: list[dict] = []

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

        # ── Versión del esquema (V1 o V2.0) ────────────────────────────────
        detection = detect_dte_version(dte)
        confirmed_v1 = is_confirmed_v1(detection)
        version_counts["v1" if confirmed_v1 else "v2"] += 1

        # ── Validación estructural contra el esquema oficial ──────────────
        validator = _get_validator(tipo_dte)
        if confirmed_v1:
            # Un documento V1 (normativa anterior) NO se valida contra los esquemas de la V2.0: todos los campos nuevos y las
            # versiones de esquema distintas lo marcarían como «inválido» siendo un documento legítimo. No hay esquemas V1 en este
            # proyecto, así que solo se comprueba lo esencial y se avisa de que la validación es parcial.
            v1_docs.append({"documento": label, "version_declarada": iden.get("version")})
            problems = v1_structure_problems(dte, tipo_dte)
            if problems:
                structural_errors.append({"documento": label, "errores": "; ".join(problems), "total_errores": len(problems)})
        elif validator is None:
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
        # La respuesta y el sello pueden venir como `respuestaHacienda`/`selloRecibido` o, en la descarga del portal del MH, como
        # `responseMH` (y en la V1, como `selloRecepcion`): se leen todos (dte_versions.py).
        respuesta = extract_respuesta(dte)
        sello = extract_sello(dte)
        estado = respuesta.get("estado")
        if not sello:
            missing_sello.append({"documento": label, "estado": estado or "(sin respuesta de Hacienda)"})
        if estado and estado not in _ACCEPTED_ESTADOS:
            rejected.append({"documento": label, "estado": estado, "observaciones": respuesta.get("observaciones") or ""})

        # ── Confirmación con la consulta pública de Hacienda (solo si se consultó) ──
        if consultado_mh:
            consulta = mh_index.get(codigo_gen)
            clase = clasificar_estado(consulta.get("estado") if consulta else None)
            mh_clases[clase] += 1
            estado_mh = (consulta or {}).get("estado") or "(sin código de generación para consultar)"
            diferencias = False
            if clase == "sin_respuesta":
                mh_sin_consulta.append({"documento": label, "estado": estado_mh})
            elif clase == "no_encontrado":
                mh_no_encontrado.append({"documento": label, "codigoGeneracion": codigo_gen, "fecha_emision": iden.get("fecEmi") or ""})
            else:
                if clase == "adverso":
                    mh_adverso.append({"documento": label, "estado_mh": estado_mh, "estado": estado or "(sin respuesta en el archivo)"})
                monto_doc = dte_monto(tipo_dte, dte.get("resumen"), dte.get("cuerpoDocumento"))
                monto_mh = consulta.get("monto_mh")
                if monto_diferente(monto_doc, monto_mh):
                    diferencias = True
                    mh_monto.append({"documento": label, "monto_documento": monto_doc, "monto_mh": monto_mh})
                sello_mh = str(consulta.get("sello_mh") or "").strip()
                if sello and sello_mh and sello.strip().upper() != sello_mh.upper():
                    diferencias = True
                    mh_sello.append({"documento": label, "sello_documento": sello, "sello_mh": sello_mh})
                if consulta.get("inconsistencia") is True:
                    diferencias = True
                    mh_inconsistente.append({"documento": label, "observaciones": consulta.get("observaciones") or ""})
                if clase == "confirmado" and not diferencias:
                    mh_limpios += 1

        # ── Firma electrónica (JWS) ────────────────────────────────────────
        firma = extract_firma(dte)
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
                        f"de Hacienda para su tipo de DTE (en los de formato V1, los bloques esenciales del documento) — "
                        f"posible documento corrupto, editado manualmente, o generado por un sistema no homologado.",
            sample_records=structural_errors[:10],
        ))

    if v1_docs:
        findings.append(DteFinding(
            test_name="DTE_V1_SIN_ESQUEMA",
            risk_level="LOW",
            record_count=len(v1_docs),
            description=f"{len(v1_docs)} documento(s) en formato V1 (normativa anterior a la V2.0 de mayo de 2026; la V2.0 es "
                        f"obligatoria desde el 1 de diciembre de 2026). Son documentos legítimos: no se validan contra los esquemas "
                        f"V2.0 y, como no se tienen los esquemas oficiales V1, su estructura se verificó solo en lo esencial. El "
                        f"sello, la firma, los duplicados y los correlativos sí se revisaron. No es evidencia de un problema, es "
                        f"una limitación de cobertura del validador.",
            sample_records=v1_docs[:10],
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

    if mh_no_encontrado:
        findings.append(DteFinding(
            test_name="MH_NO_ENCONTRADO",
            risk_level="CRITICAL",
            record_count=len(mh_no_encontrado),
            description=f"{len(mh_no_encontrado)} documento(s) que Hacienda NO tiene registrados con ese código de generación y fecha de "
                        f"emisión — posible documento no emitido, falso o con datos alterados. Antes de concluir, confirmar que la "
                        f"fecha de emisión y el ambiente del archivo sean los correctos.",
            sample_records=mh_no_encontrado[:10],
        ))

    if mh_adverso:
        findings.append(DteFinding(
            test_name="MH_ESTADO_ADVERSO",
            risk_level="HIGH",
            record_count=len(mh_adverso),
            description=f"{len(mh_adverso)} documento(s) que Hacienda tiene hoy como invalidados, anulados, rechazados u otro estado distinto "
                        f"de procesado — aunque el archivo muestre otro estado. No deberían soportar un registro contable.",
            sample_records=mh_adverso[:10],
        ))

    if mh_monto:
        findings.append(DteFinding(
            test_name="MH_MONTO_DIFERENTE",
            risk_level="HIGH",
            record_count=len(mh_monto),
            description=f"{len(mh_monto)} documento(s) cuyo monto en el archivo difiere del que Hacienda tiene registrado — posible alteración "
                        f"del documento después de su emisión.",
            sample_records=mh_monto[:10],
        ))

    if mh_sello:
        findings.append(DteFinding(
            test_name="MH_SELLO_DISTINTO",
            risk_level="HIGH",
            record_count=len(mh_sello),
            description=f"{len(mh_sello)} documento(s) cuyo sello de recepción en el archivo no es el que Hacienda registró — el sello no "
                        f"corresponde a este documento.",
            sample_records=mh_sello[:10],
        ))

    if mh_inconsistente:
        findings.append(DteFinding(
            test_name="MH_INCONSISTENCIA",
            risk_level="MEDIUM",
            record_count=len(mh_inconsistente),
            description=f"{len(mh_inconsistente)} documento(s) en los que Hacienda reporta inconsistencias en los datos del documento.",
            sample_records=mh_inconsistente[:10],
        ))

    if mh_sin_consulta:
        findings.append(DteFinding(
            test_name="MH_SIN_CONSULTA",
            risk_level="LOW",
            record_count=len(mh_sin_consulta),
            description=f"{len(mh_sin_consulta)} documento(s) que no se pudieron confirmar con Hacienda (sin código de generación, error de "
                        f"conexión o respuesta vacía). No es evidencia de un problema: el documento quedó sin confirmar y conviene repetir la consulta.",
            sample_records=mh_sin_consulta[:10],
        ))

    risk_weights = {"CRITICAL": 35, "HIGH": 20, "MEDIUM": 10, "LOW": 3}
    risk_score = min(100.0, sum(risk_weights.get(f.risk_level, 0) for f in findings))

    tipo_breakdown = [
        {"tipo": _TIPO_LABELS.get(t, t), "codigo": t, "cantidad": c}
        for t, c in sorted(tipo_counts.items(), key=lambda kv: -kv[1])
    ]

    # Cuántos documentos son de cada formato (solo cuenta los registros que son objetos). «V2.0» incluye lo que no se pudo
    # confirmar como V1: se valida como V2.0 y se reporta lo que falte.
    version_breakdown = [
        {"version": "V2.0", "cantidad": version_counts["v2"]},
        {"version": "V1", "cantidad": version_counts["v1"]},
    ]

    summary = {
        "total_dtes":           len(dtes),
        "valid_structure_count": valid_structure,
        "findings_count":       len(findings),
        "critical_count":       sum(1 for f in findings if f.risk_level == "CRITICAL"),
        "risk_score":           risk_score,
        "v1_count":             version_counts["v1"],
        "v2_count":             version_counts["v2"],
    }
    mh_consultados = mh_clases["confirmado"] + mh_clases["adverso"] + mh_clases["no_encontrado"] if consultado_mh else None
    if consultado_mh:
        summary["mh_consultados"] = mh_consultados
        summary["mh_confirmados"] = mh_limpios

    return DteValidationReport(
        total_dtes=len(dtes),
        valid_structure_count=valid_structure,
        findings=findings,
        risk_score=risk_score,
        summary=summary,
        tipo_breakdown=tipo_breakdown,
        version_breakdown=version_breakdown,
        mh_consultados=mh_consultados,
        mh_confirmados=mh_limpios if consultado_mh else None,
    )
