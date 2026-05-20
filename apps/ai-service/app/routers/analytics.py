"""Analytics router — CAATs (Computer-Assisted Audit Techniques).
Tareas 2.1–2.5:
  POST /analytics/gl          → Diario Mayor
  POST /analytics/ap          → Cuentas por Pagar
  POST /analytics/payroll     → Nómina
  POST /analytics/benford     → Ley de Benford
  POST /analytics/anomaly     → ML Anomaly Detection
"""
import dataclasses
from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel, Field
from typing import Any, Optional

from app.config import settings
from app.services.caats.gl_analysis import analyze_gl
from app.services.caats.ap_analysis import analyze_ap
from app.services.caats.payroll_analysis import analyze_payroll
from app.services.caats.benford import analyze_benford
from app.services.caats.anomaly_detection import detect_anomalies

router = APIRouter()


# ─── Auth helper ──────────────────────────────────────────────────────────────
def verify_internal_key(x_internal_key: str | None) -> None:
    if not x_internal_key or x_internal_key != settings.INTERNAL_API_KEY:
        raise HTTPException(status_code=401, detail="Clave interna inválida")


def _serialize(obj: Any) -> Any:
    """Recursively convert dataclasses/dataframes to JSON-safe types."""
    if dataclasses.is_dataclass(obj) and not isinstance(obj, type):
        return {k: _serialize(v) for k, v in dataclasses.asdict(obj).items()}
    if isinstance(obj, list):
        return [_serialize(i) for i in obj]
    if isinstance(obj, dict):
        return {k: _serialize(v) for k, v in obj.items()}
    return obj


# ─── Shared request models ─────────────────────────────────────────────────────
class RecordsRequest(BaseModel):
    records: list[dict[str, Any]] = Field(..., description="Lista de registros a analizar")
    field_mapping: Optional[dict[str, str]] = Field(
        None,
        description="Mapeo opcional de nombres de campo: {'amount': 'monto', ...}",
    )


class AmountsRequest(BaseModel):
    amounts: list[float] = Field(..., description="Lista de montos monetarios")
    records: Optional[list[dict[str, Any]]] = Field(None, description="Registros originales (opcional, para muestreo)")


class AnomalyRequest(BaseModel):
    records: list[dict[str, Any]] = Field(..., description="Lista de registros")
    numeric_fields: list[str] = Field(..., description="Campos numéricos a usar como features")
    contamination: float = Field(0.05, ge=0.01, le=0.5, description="Fracción esperada de anomalías")


# ─── GL ───────────────────────────────────────────────────────────────────────
@router.post("/gl")
async def gl_analysis(
    request: RecordsRequest,
    x_internal_key: str | None = Header(default=None),
):
    """Tarea 2.1 — Análisis de Diario Mayor."""
    verify_internal_key(x_internal_key)
    fm = request.field_mapping or {}
    try:
        result = analyze_gl(
            entries=request.records,
            amount_field=fm.get("amount", "amount"),
            date_field=fm.get("date", "date"),
            user_field=fm.get("user", "posted_by"),
            account_field=fm.get("account", "account_code"),
            description_field=fm.get("description", "description"),
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    return _serialize(result)


# ─── AP ───────────────────────────────────────────────────────────────────────
@router.post("/ap")
async def ap_analysis(
    request: RecordsRequest,
    x_internal_key: str | None = Header(default=None),
):
    """Tarea 2.2 — Análisis de Cuentas por Pagar."""
    verify_internal_key(x_internal_key)
    fm = request.field_mapping or {}
    try:
        result = analyze_ap(
            invoices=request.records,
            amount_field=fm.get("amount", "amount"),
            vendor_field=fm.get("vendor_id", "vendor_id"),
            vendor_name_field=fm.get("vendor_name", "vendor_name"),
            invoice_no_field=fm.get("invoice_number", "invoice_number"),
            date_field=fm.get("date", "invoice_date"),
            payment_date_field=fm.get("payment_date", "payment_date"),
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    return _serialize(result)


# ─── Payroll ──────────────────────────────────────────────────────────────────
@router.post("/payroll")
async def payroll_analysis(
    request: RecordsRequest,
    x_internal_key: str | None = Header(default=None),
):
    """Tarea 2.3 — Análisis de Nómina."""
    verify_internal_key(x_internal_key)
    fm = request.field_mapping or {}
    try:
        result = analyze_payroll(
            records=request.records,
            employee_id_field=fm.get("employee_id", "employee_id"),
            employee_name_field=fm.get("employee_name", "employee_name"),
            gross_pay_field=fm.get("gross_pay", "gross_pay"),
            net_pay_field=fm.get("net_pay", "net_pay"),
            department_field=fm.get("department", "department"),
            position_field=fm.get("position", "position"),
            approver_field=fm.get("approved_by", "approved_by"),
            bank_account_field=fm.get("bank_account", "bank_account"),
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    return _serialize(result)


# ─── Benford ──────────────────────────────────────────────────────────────────
@router.post("/benford")
async def benford_analysis(
    request: AmountsRequest,
    x_internal_key: str | None = Header(default=None),
):
    """Tarea 2.4 — Análisis de Ley de Benford."""
    verify_internal_key(x_internal_key)
    try:
        result = analyze_benford(
            amounts=request.amounts,
            raw_records=request.records,
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    return _serialize(result)


# ─── Anomaly Detection ────────────────────────────────────────────────────────
@router.post("/anomaly")
async def anomaly_detection(
    request: AnomalyRequest,
    x_internal_key: str | None = Header(default=None),
):
    """Tarea 2.5 — Detección de anomalías ML (Isolation Forest)."""
    verify_internal_key(x_internal_key)
    try:
        result = detect_anomalies(
            records=request.records,
            numeric_fields=request.numeric_fields,
            contamination=request.contamination,
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    return _serialize(result)
