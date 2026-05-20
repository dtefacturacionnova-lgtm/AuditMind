"""
Connectors router — Agente Vulcano (ETL)
Soporta: SAP RFC (simulado), REST API genérica, Excel/CSV upload

Endpoints:
  POST /connectors/test    — probar conectividad
  POST /connectors/import  — ejecutar importación y normalización
"""
import httpx
import io
import csv
import json
from datetime import datetime
from typing import Optional, Any
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from pydantic import BaseModel

router = APIRouter()


# ─── Modelos ──────────────────────────────────────────────────────────────────

class TestRequest(BaseModel):
    type: str       # SAP_RFC | REST_API | EXCEL_UPLOAD | CSV_UPLOAD
    config: dict


class ImportRequest(BaseModel):
    type: str
    config: dict
    options: dict = {}


# ─── Helpers de normalización ──────────────────────────────────────────────────

def _normalize_gl_record(raw: dict, field_mapping: dict) -> dict:
    """Normaliza un registro de Libro Mayor al formato AuditMind."""
    mapped = {field_mapping.get(k, k): v for k, v in raw.items()}
    return {
        "date":        mapped.get("date") or mapped.get("posting_date") or mapped.get("fecha"),
        "account":     str(mapped.get("account") or mapped.get("cuenta") or ""),
        "description": str(mapped.get("description") or mapped.get("descripcion") or mapped.get("text") or ""),
        "debit":       _to_float(mapped.get("debit") or mapped.get("debe") or 0),
        "credit":      _to_float(mapped.get("credit") or mapped.get("haber") or 0),
        "reference":   str(mapped.get("reference") or mapped.get("referencia") or ""),
        "cost_center": str(mapped.get("cost_center") or mapped.get("centro_costo") or ""),
        "_raw": raw,
    }


def _normalize_ap_record(raw: dict, field_mapping: dict) -> dict:
    """Normaliza un registro de Cuentas por Pagar."""
    mapped = {field_mapping.get(k, k): v for k, v in raw.items()}
    return {
        "invoice_id":   str(mapped.get("invoice_id") or mapped.get("factura") or ""),
        "vendor_id":    str(mapped.get("vendor_id") or mapped.get("proveedor") or ""),
        "vendor_name":  str(mapped.get("vendor_name") or mapped.get("nombre_proveedor") or ""),
        "invoice_date": mapped.get("invoice_date") or mapped.get("fecha_factura"),
        "due_date":     mapped.get("due_date") or mapped.get("fecha_vencimiento"),
        "amount":       _to_float(mapped.get("amount") or mapped.get("monto") or 0),
        "currency":     str(mapped.get("currency") or mapped.get("moneda") or "USD"),
        "status":       str(mapped.get("status") or mapped.get("estado") or "PENDING"),
        "_raw": raw,
    }


def _normalize_payroll_record(raw: dict, field_mapping: dict) -> dict:
    """Normaliza un registro de Nómina."""
    mapped = {field_mapping.get(k, k): v for k, v in raw.items()}
    return {
        "employee_id":   str(mapped.get("employee_id") or mapped.get("rut") or ""),
        "employee_name": str(mapped.get("employee_name") or mapped.get("nombre") or ""),
        "department":    str(mapped.get("department") or mapped.get("departamento") or ""),
        "period":        str(mapped.get("period") or mapped.get("periodo") or ""),
        "gross_salary":  _to_float(mapped.get("gross_salary") or mapped.get("sueldo_bruto") or 0),
        "net_salary":    _to_float(mapped.get("net_salary") or mapped.get("sueldo_neto") or 0),
        "deductions":    _to_float(mapped.get("deductions") or mapped.get("descuentos") or 0),
        "_raw": raw,
    }


_NORMALIZERS = {
    "gl":      _normalize_gl_record,
    "ap":      _normalize_ap_record,
    "payroll": _normalize_payroll_record,
}


def _to_float(val: Any) -> float:
    try:
        return float(str(val).replace(",", "").replace("$", "").strip())
    except (ValueError, TypeError):
        return 0.0


# ─── Conectores ───────────────────────────────────────────────────────────────

async def _test_rest_api(config: dict) -> dict:
    """Prueba un endpoint REST: GET a la URL base con autenticación."""
    url     = config.get("base_url", "")
    api_key = config.get("api_key", "")
    token   = config.get("bearer_token", "")
    headers = {}

    if api_key:
        headers["X-API-Key"] = api_key
    if token:
        headers["Authorization"] = f"Bearer {token}"

    if not url:
        return {"ok": False, "message": "base_url es requerido"}

    # Usar endpoint de health/ping si está configurado
    test_endpoint = config.get("health_endpoint") or url.rstrip("/")

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(test_endpoint, headers=headers)
        if resp.status_code < 400:
            return {"ok": True, "message": f"Conexión exitosa (HTTP {resp.status_code})"}
        return {"ok": False, "message": f"HTTP {resp.status_code}: {resp.text[:200]}"}
    except httpx.ConnectError as e:
        return {"ok": False, "message": f"No se pudo conectar: {str(e)[:200]}"}
    except Exception as e:
        return {"ok": False, "message": str(e)[:200]}


def _test_sap_rfc(config: dict) -> dict:
    """
    Test SAP RFC/BAPI — simulado.
    En producción requiere pyrfc + SAP NW RFC Library.
    """
    host   = config.get("host", "")
    client = config.get("client", "")
    user   = config.get("user", "")

    if not all([host, client, user]):
        return {"ok": False, "message": "Se requieren: host, client, user, password, sysnr"}

    # Simulación de test exitoso (requiere pyrfc para conexión real)
    return {
        "ok": True,
        "message": f"[Simulado] Conexión SAP a {host} (client {client}) establecida. "
                   "En producción instala 'pyrfc' y la SAP NW RFC Library.",
    }


async def _import_rest_api(config: dict, options: dict) -> dict:
    """Importa datos desde una REST API y los normaliza."""
    url         = config.get("base_url", "").rstrip("/")
    api_key     = config.get("api_key", "")
    token       = config.get("bearer_token", "")
    endpoint    = options.get("endpoint", "")        # ej: "/api/v2/ledger"
    data_type   = options.get("data_type", "gl")     # gl | ap | payroll
    field_map   = options.get("field_mapping", {})
    max_records = int(options.get("max_records", 1000))

    headers = {"Accept": "application/json"}
    if api_key:
        headers["X-API-Key"] = api_key
    if token:
        headers["Authorization"] = f"Bearer {token}"

    full_url = f"{url}{endpoint}" if endpoint else url

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(full_url, headers=headers)
        resp.raise_for_status()
        raw_data = resp.json()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Error al obtener datos: {str(e)}")

    # Aplanar si la respuesta tiene un wrapper {"data": [...], "items": [...], etc.}
    if isinstance(raw_data, dict):
        for key in ("data", "items", "records", "results", "rows"):
            if key in raw_data and isinstance(raw_data[key], list):
                raw_data = raw_data[key]
                break
        else:
            raw_data = [raw_data]  # Objeto único → lista de 1

    records_raw = raw_data[:max_records]
    normalizer  = _NORMALIZERS.get(data_type, _normalize_gl_record)
    records     = [normalizer(r, field_map) for r in records_raw]

    return {
        "records": records,
        "summary": {
            "data_type":       data_type,
            "total_fetched":   len(records_raw),
            "total_imported":  len(records),
            "source":          full_url,
            "imported_at":     datetime.utcnow().isoformat(),
        },
    }


def _import_sap_rfc(config: dict, options: dict) -> dict:
    """
    Importa datos de SAP via RFC/BAPI — simulado con datos demo.
    En producción: usar pyrfc.Connection + BAPI_GL_GETGLACCOUNTBALANCES, etc.
    """
    data_type = options.get("data_type", "gl")
    count     = int(options.get("max_records", 50))

    if data_type == "gl":
        records = [
            {
                "date": f"2026-0{(i % 3)+1}-{(i % 28)+1:02d}",
                "account": f"1{1000 + i}",
                "description": f"Asiento contable SAP #{i+1}",
                "debit": round(1000.0 * (i % 10 + 1), 2),
                "credit": 0.0,
                "reference": f"DOC{100000 + i}",
                "cost_center": f"CC{(i % 5)+1:03d}",
                "_raw": {"source": "SAP_RFC", "bapi": "BAPI_GL_GETGLACCOUNTBALANCES"},
            }
            for i in range(min(count, 50))
        ]
    elif data_type == "ap":
        records = [
            {
                "invoice_id":   f"INV-{2026 * 1000 + i}",
                "vendor_id":    f"V{(i % 20)+1:04d}",
                "vendor_name":  f"Proveedor SAP {(i % 20)+1}",
                "invoice_date": f"2026-0{(i % 3)+1}-{(i % 28)+1:02d}",
                "due_date":     f"2026-0{(i % 3)+2}-{(i % 28)+1:02d}",
                "amount":       round(5000.0 * (i % 10 + 1), 2),
                "currency":     "CLP",
                "status":       ["PENDING", "PAID", "OVERDUE"][i % 3],
                "_raw": {"source": "SAP_RFC", "bapi": "BAPI_ACCOUNTINGDOC_POST"},
            }
            for i in range(min(count, 50))
        ]
    else:
        records = []

    return {
        "records": records,
        "summary": {
            "data_type":      data_type,
            "total_imported": len(records),
            "source":         f"SAP RFC @ {config.get('host', 'demo')}",
            "note":           "[SIMULADO] Instala pyrfc para conexión real",
            "imported_at":    datetime.utcnow().isoformat(),
        },
    }


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/test")
async def test_connection(request: TestRequest):
    """Prueba la conectividad de una fuente de datos."""
    src_type = request.type.upper()

    if src_type == "REST_API":
        return await _test_rest_api(request.config)
    elif src_type == "SAP_RFC":
        return _test_sap_rfc(request.config)
    elif src_type in ("EXCEL_UPLOAD", "CSV_UPLOAD"):
        # Los uploads no tienen conexión remota que testear
        return {"ok": True, "message": "Listo para recibir archivos (Excel/CSV upload)"}
    else:
        raise HTTPException(status_code=400, detail=f"Tipo de conector no soportado: {src_type}")


@router.post("/import")
async def run_import(request: ImportRequest):
    """Ejecuta una importación y retorna los registros normalizados."""
    src_type = request.type.upper()

    if src_type == "REST_API":
        return await _import_rest_api(request.config, request.options)
    elif src_type == "SAP_RFC":
        return _import_sap_rfc(request.config, request.options)
    elif src_type in ("EXCEL_UPLOAD", "CSV_UPLOAD"):
        # Upload de archivos se maneja por /connectors/upload
        raise HTTPException(
            status_code=400,
            detail="Para Excel/CSV usa el endpoint POST /connectors/upload",
        )
    else:
        raise HTTPException(status_code=400, detail=f"Tipo de conector no soportado: {src_type}")


@router.post("/upload/csv")
async def upload_csv(
    file: UploadFile = File(...),
    data_type: str = Form(default="gl"),
    field_mapping: str = Form(default="{}"),
):
    """
    Importa datos desde un archivo CSV subido directamente.
    data_type: gl | ap | payroll
    field_mapping: JSON string con mapeo de columnas {csv_col: standard_col}
    """
    if not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Solo se aceptan archivos .csv")

    try:
        field_map = json.loads(field_mapping)
    except json.JSONDecodeError:
        field_map = {}

    content = await file.read()
    text    = content.decode("utf-8-sig")  # utf-8-sig maneja BOM de Excel
    reader  = csv.DictReader(io.StringIO(text))
    rows    = list(reader)

    normalizer = _NORMALIZERS.get(data_type, _normalize_gl_record)
    records    = [normalizer(r, field_map) for r in rows]

    return {
        "records": records,
        "summary": {
            "data_type":      data_type,
            "total_imported": len(records),
            "source":         file.filename,
            "columns":        reader.fieldnames or [],
            "imported_at":    datetime.utcnow().isoformat(),
        },
    }
