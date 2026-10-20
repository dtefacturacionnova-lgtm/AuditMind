"""Consulta pública del Ministerio de Hacienda para confirmar un DTE.

Copiado y adaptado de dtes-y-analítica-sv (`src/lib/mh-validar.ts` + la ruta `/api/mh/validar` de su `server.ts`), donde se usa con
documentos reales: para cada documento se consulta `admin.factura.gob.sv` con su código de generación y fecha de emisión, y se lee de la
respuesta el estado que el MH le da, su sello, su monto y su receptor. Eso confirma que el documento EXISTE en Hacienda y que lo que
Hacienda tiene coincide con lo que el cliente entregó — lo que ningún chequeo sobre el archivo por sí solo puede garantizar.

Se consulta UN documento a la vez con una pausa de 0,5 s (el MH responde 429 si se le insiste) y máximo `MAX_LOTE_MH` por llamada, para que
la petición no se pase del tiempo que aguantan nginx y la API; el navegador reparte los lotes (ver `apps/web/src/lib/dte-mh.ts`).

La dirección es SIEMPRE `admin.factura.gob.sv`: del documento solo se toman, codificados, el código de generación y la fecha. No se siguen
redirecciones.
"""
import asyncio
import re
import unicodedata
from typing import Any, Awaitable, Callable, Optional
from urllib.parse import quote

import httpx

MAX_LOTE_MH = 25
PAUSA_ENTRE_CONSULTAS = 0.5
TIMEOUT_CONSULTA = 20.0
_HOST = "https://admin.factura.gob.sv"
_CODIGO = re.compile(r"^[0-9A-Za-z-]{1,64}$")

# Estados con que se etiqueta una consulta que NO pudo responder (no es una opinión del MH sobre el documento).
SIN_CODIGO = "Error: Sin Código"
ERROR_CONEXION = "Error de conexión MH"
ERROR_CONSULTA = "Error de consulta"
NO_ENCONTRADO = "No Encontrado en MH"
DESCONOCIDO = "Estado Desconocido"

# Lo que devuelve `fetch`: (código HTTP, cuerpo ya convertido a JSON o None si no era JSON).
Fetch = Callable[[str], Awaitable[tuple[int, Any]]]


def _texto(v: Any) -> Optional[str]:
    return v.strip() if isinstance(v, str) and v.strip() else None


def url_consulta_mh(codigo_generacion: str, fecha: Optional[str], ambiente: Optional[str]) -> str:
    """La dirección de la consulta pública para un documento: producción salvo que el ambiente sea de pruebas ('00' o 'Pruebas')."""
    prueba = ambiente in ("00", "Pruebas")
    return (
        f"{_HOST}/{'test' if prueba else 'prod'}/consultas/publica/simple/{'0' if prueba else '1'}"
        f"?codigoGeneracion={quote(str(codigo_generacion), safe='')}&fechaEmi={quote(str(fecha or '')[:10], safe='')}"
    )


def dte_monto(tipo_dte: Optional[str], resumen: Any, cuerpo: Any = None) -> float:
    """El monto del documento: total a pagar o monto total de la operación y, según el tipo, lo que ese tipo trae en su lugar
    (retención 07: total sujeto a retención; donación 15: valor total; liquidación 09: líquido a pagar)."""
    def num(v: Any) -> float:
        try:
            return float(v) if v is not None and not isinstance(v, bool) else 0.0
        except (TypeError, ValueError):
            return 0.0

    resumen = resumen if isinstance(resumen, dict) else {}
    base = num(resumen.get("totalPagar")) or num(resumen.get("montoTotalOperacion"))
    if base:
        return base
    if tipo_dte == "07":
        return num(resumen.get("totalSujetoRetencion"))
    if tipo_dte == "15":
        return num(resumen.get("valorTotal"))
    if tipo_dte == "09":
        return num((cuerpo if isinstance(cuerpo, dict) else {}).get("liquidoApagar"))
    return 0.0


def monto_segun_mh(data: Any) -> float:
    """El monto del documento según la respuesta del MH (misma regla que `dte_monto`). El tipo viene en el nivel superior de la respuesta."""
    doc = data.get("documento") if isinstance(data, dict) else None
    if not isinstance(doc, dict):
        return 0.0
    tipo = data.get("tipoDte") or (doc.get("identificacion") or {}).get("tipoDte")
    return dte_monto(tipo, doc.get("resumen"), doc.get("cuerpoDocumento"))


def monto_diferente(monto: Optional[float], monto_mh: Optional[float]) -> bool:
    """¿El monto del documento difiere del del MH? Sin monto del MH (0 o vacío) no hay con qué comparar. En centavos: con decimales,
    100 contra 100.01 daba 0.0100000000000051 y contaba como diferencia."""
    if monto_mh is None or not monto_mh > 0:
        return False
    return abs(round((monto or 0) * 100) - round(monto_mh * 100)) > 1


def resultado_de_consulta_mh(codigo_generacion: str, data: Any) -> dict:
    """Lo que se guarda de la respuesta del MH para un documento."""
    base = {"codigo_generacion": codigo_generacion}
    if not isinstance(data, dict) or not data.get("estadoDoc"):
        return {**base, "estado": DESCONOCIDO, "inconsistencia": False, "observaciones": []}
    estado = str(data["estadoDoc"])
    if estado == "Error" and "no existen" in str(data.get("descripcionEstado") or ""):
        estado = NO_ENCONTRADO
    doc = data.get("documento") if isinstance(data.get("documento"), dict) else {}
    return {
        **base,
        "estado": estado,
        "inconsistencia": data.get("reporteInc") is True,
        "observaciones": data["observaciones"] if isinstance(data.get("observaciones"), list) else [],
        "monto_mh": monto_segun_mh(data),
        "nit_receptor_mh": str(data.get("numeIdenRecep") or ""),
        "sello_mh": str(data.get("selloVal") or ""),
        "numero_control_mh": str((doc.get("identificacion") or {}).get("numeroControl") or ""),
        "fecha_procesado_mh": str(data.get("fechaProcesado") or ""),
    }


def _sin_acentos(t: Any) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", str(t or "")) if unicodedata.category(c) != "Mn").lower()


def clasificar_estado(estado: Optional[str]) -> str:
    """'confirmado' (el MH lo tiene como procesado), 'adverso' (invalidado, anulado, rechazado u otro estado), 'no_encontrado' o
    'sin_respuesta' (la consulta no pudo contestar: error, sin código o respuesta vacía; no es una conclusión sobre el documento)."""
    e = _sin_acentos(estado).strip()
    if not e or e.startswith("error") or e == _sin_acentos(DESCONOCIDO):
        return "sin_respuesta"
    if e == _sin_acentos(NO_ENCONTRADO):
        return "no_encontrado"
    if e in ("procesado", "transmitido satisfactoriamente"):
        return "confirmado"
    return "adverso"


async def _fetch_httpx(url: str) -> tuple[int, Any]:
    async with httpx.AsyncClient(timeout=TIMEOUT_CONSULTA, follow_redirects=False) as client:
        resp = await client.get(url, headers={
            "Accept": "application/json",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        })
    try:
        return resp.status_code, resp.json()
    except ValueError:
        return resp.status_code, None


async def consultar_lote(dtes: list[Any], fetch: Fetch = _fetch_httpx, pausa: float = PAUSA_ENTRE_CONSULTAS) -> list[dict]:
    """Consulta al MH cada documento del lote (de cada uno solo se lee el bloque `identificacion`). Devuelve una consulta por documento,
    en el mismo orden. Un documento que no se pudo consultar queda con un estado «Error…», nunca detiene el resto del lote."""
    if not isinstance(dtes, list) or not dtes:
        raise ValueError("No hay documentos para consultar")
    if len(dtes) > MAX_LOTE_MH:
        raise ValueError(f"Un lote admite máximo {MAX_LOTE_MH} documentos")

    consultas: list[dict] = []
    for i, dte in enumerate(dtes):
        iden = dte.get("identificacion") if isinstance(dte, dict) else None
        iden = iden if isinstance(iden, dict) else {}
        codigo = _texto(iden.get("codigoGeneracion")) or ""
        if not codigo or not _CODIGO.match(codigo):
            consultas.append({"codigo_generacion": codigo, "estado": SIN_CODIGO})
            continue
        try:
            status, data = await fetch(url_consulta_mh(codigo, _texto(iden.get("fecEmi")), _texto(iden.get("ambiente"))))
            consultas.append(
                resultado_de_consulta_mh(codigo, data) if 200 <= status < 300 else {"codigo_generacion": codigo, "estado": ERROR_CONEXION}
            )
        except Exception:
            consultas.append({"codigo_generacion": codigo, "estado": ERROR_CONSULTA})
        if pausa and i < len(dtes) - 1:
            await asyncio.sleep(pausa)
    return consultas
