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
import pandas as pd
from datetime import datetime
from typing import Optional, Any
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from pydantic import BaseModel

router = APIRouter()

MAX_UPLOAD_ROWS = 5000


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


# ─── Parseo genérico (sin normalizar) — para Analytics/CAATs con mapeo manual ──

MAX_HEADER_SCAN_ROWS = 15


def _looks_numeric(s: str) -> bool:
    if not s:
        return False
    try:
        float(s.replace(",", "").replace("$", "").replace("%", ""))
        return True
    except ValueError:
        return False


def _score_header_row(cells: list) -> tuple:
    """Qué tan probable es que esta fila sea el encabezado real (vs. título de
    reporte, fila vacía, o fila de datos). Devuelve (score, celdas_llenas)."""
    vals = [c for c in cells if c]
    filled = len(vals)
    ncols = len(cells)
    if filled == 0 or ncols == 0:
        return 0.0, filled
    filled_ratio = filled / ncols
    str_ratio = sum(1 for v in vals if not _looks_numeric(v)) / filled
    uniq_ratio = len(set(vals)) / filled
    return filled_ratio * 0.5 + str_ratio * 0.3 + uniq_ratio * 0.2, filled


def _detect_header_row(raw_rows: list) -> tuple:
    """raw_rows: filas crudas (listas de strings ya trimeadas). Encuentra la fila
    que mejor parece un encabezado de columnas dentro de las primeras filas —
    así se saltan títulos de reporte ('Reporte de Libro Mayor - Enero 2026',
    filas en blanco, etc.) que muchos exports reales anteponen a los datos.
    Devuelve (índice_0based, score)."""
    scan = raw_rows[:MAX_HEADER_SCAN_ROWS]
    ncols = max((len(r) for r in scan), default=0)
    best_idx, best_score = 0, -1.0
    for i, row in enumerate(scan):
        cells = list(row) + [""] * (ncols - len(row))
        score, filled = _score_header_row(cells)
        # Exigir al menos 2 celdas llenas — una sola celda (típico de un título
        # de reporte en la columna A) nunca debe ganarle a un encabezado real.
        if filled >= 2 and score > best_score:
            best_score, best_idx = score, i
    return best_idx, best_score


def _clean_col(c: Any, idx: int) -> str:
    s = "" if c is None else str(c).strip()
    if s == "" or s.lower().startswith("unnamed"):
        return f"(Columna {idx + 1})"
    if s.endswith(".0") and s[:-2].lstrip("-").isdigit():
        s = s[:-2]
    return s


def _clean_row(row: list) -> list:
    return [("" if c is None else str(c).strip()) for c in row]


@router.post("/parse")
async def parse_file(
    file: UploadFile = File(...),
    header_row: Optional[int] = Form(default=None),
):
    """
    Lee un CSV o Excel TAL CUAL viene — sin forzar ningún esquema de columnas.
    Antes de asumir que la primera fila es el encabezado, detecta si el archivo
    trae filas de título/reporte por delante (patrón común en exports reales:
    'Reporte de Libro Mayor', filas en blanco, y recién en la fila 3 o 4 las
    columnas) y usa esa fila como encabezado real. Si `header_row` viene
    explícito (0-based), se respeta tal cual — así el usuario puede corregir
    manualmente desde el frontend si la detección automática se equivocó.
    El mapeo a los campos que cada análisis CAATs espera (amount, vendor_id,
    gross_pay, etc.) lo hace el usuario en el frontend vía `field_mapping`
    (ver analytics.py) — esto solo resuelve dónde empiezan las columnas.
    """
    filename = file.filename or ""
    ext = filename.lower().rsplit(".", 1)[-1] if "." in filename else ""
    if ext not in ("csv", "xlsx", "xls"):
        raise HTTPException(status_code=400, detail="Solo se aceptan archivos .csv, .xlsx o .xls")

    content = await file.read()
    text = None
    try:
        if ext == "csv":
            text = content.decode("utf-8-sig")  # utf-8-sig maneja BOM de Excel
            raw_rows = [_clean_row(r) for r in csv.reader(io.StringIO(text))]
        else:
            raw_df = pd.read_excel(io.BytesIO(content), header=None, dtype=str)
            raw_df = raw_df.where(pd.notnull(raw_df), "")
            raw_rows = [_clean_row(r) for r in raw_df.values.tolist()]
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"No se pudo leer el archivo: {str(e)[:200]}")

    if not raw_rows:
        raise HTTPException(status_code=422, detail="El archivo no tiene filas de datos")
    # OJO: no se filtran filas vacías aquí — los índices de raw_rows deben
    # coincidir exactamente con las filas físicas del archivo original, porque
    # más abajo se usan tal cual para re-parsear desde la fila de encabezado
    # (skiprows / slice de líneas). _score_header_row ya descarta las filas
    # vacías por su cuenta (exige >=2 celdas llenas), así que no hace falta.

    auto_idx, auto_score = _detect_header_row(raw_rows)
    header_auto_detected = header_row is None
    idx = header_row if header_row is not None else auto_idx
    idx = max(0, min(idx, len(raw_rows) - 1))

    try:
        if ext == "csv":
            lines = text.splitlines(keepends=True)
            # Reconstruye el texto SOLO desde la fila de encabezado en adelante —
            # así pandas nunca ve las filas de título, que suelen tener menos
            # columnas que los datos y hacen fallar el parser si se le pasan.
            remaining = "".join(lines[idx:]) if idx < len(lines) else lines[-1]
            df = pd.read_csv(io.StringIO(remaining))
        else:
            df = pd.read_excel(io.BytesIO(content), skiprows=idx)
    except Exception as e:
        raise HTTPException(
            status_code=422,
            detail=f"No se pudo leer el archivo desde la fila {idx + 1}: {str(e)[:200]}",
        )

    if df.empty:
        raise HTTPException(
            status_code=422,
            detail=f"No se encontraron filas de datos después de la fila {idx + 1}",
        )

    df.columns = [_clean_col(c, i) for i, c in enumerate(df.columns)]

    total_rows = len(df)
    truncated = total_rows > MAX_UPLOAD_ROWS
    if truncated:
        df = df.head(MAX_UPLOAD_ROWS)

    # NaN → None (JSON no soporta NaN) antes de convertir a dict. `.where()`
    # directo sobre un DataFrame con columnas numéricas reintroduce NaN en vez
    # de None (el dtype float no admite None, pandas lo recasta) — hay que
    # pasar a dtype object PRIMERO para que None sea un valor válido en TODAS
    # las columnas. Reproducido en vivo con una columna mixta texto/vacío
    # (ej. NIT opcional con una fila sin valor) — sin este cast, `/parse-file`
    # tumbaba con 500 "Out of range float values are not JSON compliant: nan".
    df = df.astype(object).where(df.notna(), None)

    return {
        "columns":            [str(c) for c in df.columns.tolist()],
        "rows":               df.to_dict("records"),
        "rowCount":           len(df),
        "totalRows":          total_rows,
        "truncated":          truncated,
        "filename":           filename,
        "headerRowIndex":     idx,
        "headerAutoDetected": header_auto_detected,
        "headerConfidence":   "high" if auto_score >= 0.55 else "low",
        "skippedRows":        raw_rows[:idx] if idx > 0 else [],
        "rawPreview":         raw_rows[:10],
    }
