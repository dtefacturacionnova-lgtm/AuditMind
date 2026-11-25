"""Detección de nombres de proveedor genéricos o de relleno («Proveedor Temporal 01», «XXX Servicios», «N/A», «Test»).

Antes, Cuentas por Pagar y el Maestro de Proveedores buscaban esos patrones como SUBCADENAS del nombre, y uno de los patrones era «na»: marcaba como
«proveedor fantasma» (riesgo crítico) a «Distribuidora Internacional», «Ferretería Nacional», «Panadería La Esperanza» o «Servicios Santa Ana». El
Maestro de Proveedores, además, quitaba los espacios antes de buscar, así que «Corporación Apaneca» (`corporacionapaneca`) también coincidía por
cruzar el límite entre dos palabras.

Ahora el patrón debe ser una PALABRA COMPLETA del nombre (separada por espacios o signos), con una sola tolerancia: la palabra puede llevar números
al final («Test1», «Proveedor2»). Así «Temporal» y «Temp» siguen marcando, pero «Contemporánea» o «Nacional» no.
"""
import re
import unicodedata
from typing import Any

# Misma lista que usaban los dos motores. «xxx» y «n/a» tienen su propia regla (ver abajo).
GENERIC_WORDS: tuple[str, ...] = ("test", "proveedor", "vendor", "na", "temporal", "temp", "generico", "generic")

_SIN_ACENTOS = re.compile(r"[̀-ͯ]")
_NA_BARRA = re.compile(r"(?<![a-z0-9])n/a(?![a-z0-9])")
_PALABRAS = re.compile(r"[a-z0-9]+")


def _normalizar(texto: str) -> str:
    return _SIN_ACENTOS.sub("", unicodedata.normalize("NFD", texto.strip().lower()))


def is_generic_vendor_name(valor: Any) -> bool:
    """True si el nombre está vacío o es genérico/de relleno. Compara palabras completas, no subcadenas."""
    if valor is None:
        return True
    try:
        if valor != valor:  # NaN de pandas
            return True
    except Exception:
        pass
    texto = _normalizar(str(valor))
    if texto == "":
        return True
    if _NA_BARRA.search(texto):
        return True
    for palabra in _PALABRAS.findall(texto):
        if len(palabra) >= 3 and set(palabra) == {"x"}:  # «xxx», «xxxx»…
            return True
        for patron in GENERIC_WORDS:
            if palabra == patron or (palabra.startswith(patron) and palabra[len(patron):].isdigit()):
                return True
    return False
