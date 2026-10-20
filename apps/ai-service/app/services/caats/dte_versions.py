"""Versión del esquema de un DTE (V1 o V2.0) y campos que cambian de nombre o de lugar entre una y otra.

Portado de `dtes-y-analítica-sv` (src/lib/dte-version.ts y src/lib/dte-fields.ts), donde se probó con documentos reales de ambas
versiones. Funciones puras, sin dependencias.

La normativa V2.0 del Ministerio de Hacienda (mayo de 2026; obligatoria desde el 1 de diciembre de 2026) cambió la versión del
esquema de TODOS los tipos de documento (`identificacion.version`):
    FE 1 -> 2, CCF 3 -> 4, NR 3 -> 4, NC 3 -> 4, ND 3 -> 4, CR 1 -> 2, CL 1 -> 2, DCL 1 -> 2, FEX 1 -> 3, FSE 1 -> 2, CD 1 -> 2.
El MH valida ese número contra el esquema, así que un documento V2.0 siempre trae el exacto de su tipo: es la señal principal. La
dirección con `distrito` (campo nuevo de la V2.0, CAT-008) es la de apoyo. El sello en la raíz del JSON NO se usa como señal: no es
fiable (también puede venir en documentos V1).
"""
from dataclasses import dataclass
from typing import Any

# `identificacion.version` de cada tipo en la V2.0 (esquemas oficiales `svfe-json-schemas`, los de `dte_schemas/`).
V2_VERSION_BY_TIPO: dict[str, int] = {
    "01": 2, "03": 4, "04": 4, "05": 4, "06": 4, "07": 2, "08": 2, "09": 2, "11": 3, "14": 2, "15": 2,
}

# `identificacion.version` de cada tipo en la V1 (la normativa anterior).
V1_VERSION_BY_TIPO: dict[str, int] = {
    "01": 1, "03": 3, "04": 3, "05": 3, "06": 3, "07": 1, "08": 1, "09": 1, "11": 1, "14": 1, "15": 1,
}

# Lo que NO es parte del documento firmado: la respuesta del MH, el sello y la firma, con todos los nombres con que se han visto.
# `responseMH` es la descarga del portal del MH; `Sello Recibido` y `Firma Electrónica` son las formas erróneas (con espacios y
# acentos) que algunos emisores escriben. Antes de validar la estructura se quitan de la raíz: el esquema oficial no los admite.
ENVELOPE_KEYS: tuple[str, ...] = (
    "respuestaHacienda", "responseMH", "firmaElectronica", "Firma Electrónica",
    "selloRecibido", "Sello Recibido", "selloRecepcion", "sello",
)


@dataclass(frozen=True)
class VersionDetection:
    version: str       # 'v1' | 'v2'
    reason: str        # version_exacta_v2 | version_exacta_v1 | distrito | sin_senales | no_es_objeto
    confidence: str    # high | medium | low


def _text(v: Any) -> str | None:
    return v.strip() if isinstance(v, str) and v.strip() else None


def _as_number(v: Any) -> float | None:
    if isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return float(v)
    if isinstance(v, str) and v.strip():
        try:
            return float(v.strip())
        except ValueError:
            return None
    return None


def _dict(v: Any) -> dict:
    return v if isinstance(v, dict) else {}


def detect_dte_version(doc: Any) -> VersionDetection:
    """Versión de un DTE. `version_exacta_*` (alta confianza): el número de `identificacion.version` es el de ese tipo en la V1 o en la
    V2.0. `distrito` (media): sin número reconocible, pero la dirección trae el distrito, que solo existe en la V2.0. Sin señales: se
    asume V1 con confianza baja (el motor de validación NO la trata como V1 confirmada: la valida como V2.0 y reporta lo que falte)."""
    if not isinstance(doc, dict):
        return VersionDetection("v1", "no_es_objeto", "low")
    iden = _dict(doc.get("identificacion"))
    tipo = str(iden.get("tipoDte") or "")
    version = _as_number(iden.get("version"))
    if version is not None:
        if V2_VERSION_BY_TIPO.get(tipo) == version:
            return VersionDetection("v2", "version_exacta_v2", "high")
        if V1_VERSION_BY_TIPO.get(tipo) == version:
            return VersionDetection("v1", "version_exacta_v1", "high")
    if _text(_dict(_dict(doc.get("emisor")).get("direccion")).get("distrito")) or \
            _text(_dict(_dict(doc.get("receptor")).get("direccion")).get("distrito")):
        return VersionDetection("v2", "distrito", "medium")
    return VersionDetection("v1", "sin_senales", "low")


def is_confirmed_v1(detection: VersionDetection) -> bool:
    """V1 confirmada: el documento trae el número de versión V1 exacto de su tipo."""
    return detection.version == "v1" and detection.reason == "version_exacta_v1"


def extract_sello(doc: Any) -> str | None:
    """El sello de recepción del MH, esté donde esté: primero dentro de la respuesta (`responseMH` de la descarga del portal,
    `respuestaHacienda`) y después en la raíz del JSON, con los nombres con que se ha visto (`selloRecibido`, `Sello Recibido`,
    `selloRecepcion`, `sello`). None si el documento no lo trae."""
    d = _dict(doc)
    for holder in (_dict(d.get("responseMH")), _dict(d.get("respuestaHacienda"))):
        for key in ("selloRecibido", "selloRecepcion"):
            if _text(holder.get(key)):
                return _text(holder.get(key))
    for key in ("selloRecibido", "Sello Recibido", "selloRecepcion", "sello"):
        if _text(d.get(key)):
            return _text(d.get(key))
    return None


def extract_respuesta(doc: Any) -> dict:
    """La respuesta del MH (estado, observaciones): `respuestaHacienda` o `responseMH` (descarga del portal). {} si no hay."""
    d = _dict(doc)
    return _dict(d.get("respuestaHacienda")) or _dict(d.get("responseMH"))


def extract_firma(doc: Any) -> str | None:
    """La firma electrónica (JWS compacto): `firmaElectronica` o la forma errónea `Firma Electrónica`."""
    d = _dict(doc)
    return _text(d.get("firmaElectronica")) or _text(d.get("Firma Electrónica"))


def v1_structure_problems(doc: dict, tipo_dte: str) -> list[str]:
    """Estructura MÍNIMA de un documento V1. No hay esquemas oficiales V1 en este proyecto, así que NO se puede validar campo por
    campo; solo lo esencial. En todo DTE: identificación con tipo, código de generación, número de control y fecha, y cuerpo. Los
    demás bloques se exigen solo donde la V1 los trae con el mismo nombre que la V2.0: emisor y resumen en FE, CCF, NR, NC, ND, CR, CL
    y FEX (el DCL, 09, no trae resumen: sus totales están en `cuerpoDocumento`, que es un objeto); receptor en CCF, NC, ND, CR, CL y
    FEX. La factura (01) puede traer el receptor nulo, y en la V1 el sujeto excluido (14) y la donación (15) usan otros bloques."""
    problems: list[str] = []
    iden = doc.get("identificacion")
    if not isinstance(iden, dict):
        return ["falta el bloque identificacion"]
    for campo in ("tipoDte", "codigoGeneracion", "numeroControl", "fecEmi"):
        if not _text(iden.get(campo)):
            problems.append(f"identificacion.{campo} vacío o ausente")
    cuerpo = doc.get("cuerpoDocumento")
    if not isinstance(cuerpo, (list, dict)) or not cuerpo:
        problems.append("falta cuerpoDocumento")
    if tipo_dte in ("01", "03", "04", "05", "06", "07", "08", "11"):
        if not isinstance(doc.get("emisor"), dict):
            problems.append("falta el bloque emisor")
        if not isinstance(doc.get("resumen"), dict):
            problems.append("falta el bloque resumen")
    if tipo_dte in ("03", "05", "06", "07", "08", "11") and not isinstance(doc.get("receptor"), dict):
        problems.append("falta el bloque receptor")
    return problems
