"""Analytics router — CAATs (Computer-Assisted Audit Techniques).
Tareas 2.1–2.16:
  POST /analytics/gl               → Diario Mayor
  POST /analytics/ap               → Cuentas por Pagar
  POST /analytics/payroll          → Nómina
  POST /analytics/benford          → Ley de Benford
  POST /analytics/anomaly          → ML Anomaly Detection
  POST /analytics/sod              → Segregación de Funciones
  POST /analytics/vendor_master    → Integridad de Maestro de Proveedores
  POST /analytics/related_parties  → Partes Relacionadas y Conflicto de Interés (único motor de 2 datasets)
  POST /analytics/expenses         → Gastos de Representación / Viáticos (T&E)
  POST /analytics/revenue_cutoff   → Corte de Ingresos
  POST /analytics/bid_rigging      → Licitación Colusoria
  POST /analytics/ar_aging         → Antigüedad de Cuentas por Cobrar
  POST /analytics/fixed_assets     → Activo Fijo — Existencia y Depreciación
  POST /analytics/structuring      → Pitufeo / Smurfing
  POST /analytics/missing_trader   → Missing Trader / Carrusel de IVA
  POST /analytics/tax_haven        → Concentración en Jurisdicciones de Baja Tributación
"""
import dataclasses
import math
from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel, Field
from typing import Any, Optional

from app.config import settings
from app.services.caats.gl_analysis import analyze_gl
from app.services.caats.ap_analysis import analyze_ap
from app.services.caats.payroll_analysis import analyze_payroll
from app.services.caats.benford import analyze_benford
from app.services.caats.anomaly_detection import detect_anomalies
from app.services.caats.sod_analysis import analyze_sod
from app.services.caats.vendor_master_analysis import analyze_vendor_master
from app.services.caats.related_parties_analysis import analyze_related_parties
from app.services.caats.expenses_analysis import analyze_expenses
from app.services.caats.revenue_cutoff_analysis import analyze_revenue_cutoff
from app.services.caats.bid_rigging_analysis import analyze_bid_rigging
from app.services.caats.ar_aging_analysis import analyze_ar_aging
from app.services.caats.fixed_assets_analysis import analyze_fixed_assets
from app.services.caats.structuring_analysis import analyze_structuring
from app.services.caats.missing_trader_analysis import analyze_missing_trader
from app.services.caats.tax_haven_analysis import analyze_tax_haven_concentration

router = APIRouter()


# ─── Auth helper ──────────────────────────────────────────────────────────────
def verify_internal_key(x_internal_key: str | None) -> None:
    if not x_internal_key or x_internal_key != settings.INTERNAL_API_KEY:
        raise HTTPException(status_code=401, detail="Clave interna inválida")


def _serialize(obj: Any) -> Any:
    """Recursively convert dataclasses/dataframes to JSON-safe types.

    NaN/Inf surgen cuando un campo esperado (ej. gross_pay) no existe en los
    datos recibidos — pandas produce columnas vacías y sus estadísticas (mean,
    std, etc.) son NaN. `json.dumps` no puede serializar NaN/Infinity (no son
    JSON válido) y esto tumbaba el servicio entero con un 500 en vez de
    devolver un resultado parcial. Se convierten a `null` aquí, en el borde de
    salida, para que CUALQUIER análisis con datos incompletos degrade con
    gracia en vez de crashear — no solo para los datos de muestra del demo.
    """
    if dataclasses.is_dataclass(obj) and not isinstance(obj, type):
        return {k: _serialize(v) for k, v in dataclasses.asdict(obj).items()}
    if isinstance(obj, list):
        return [_serialize(i) for i in obj]
    if isinstance(obj, dict):
        return {k: _serialize(v) for k, v in obj.items()}
    if isinstance(obj, float) and (math.isnan(obj) or math.isinf(obj)):
        return None
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


class DualRecordsRequest(BaseModel):
    """Único motor CAATs que necesita DOS datasets — transacciones a analizar
    más un registro de referencia (partes relacionadas) contra el cual cruzarlas."""
    records: list[dict[str, Any]] = Field(..., description="Transacciones a analizar")
    field_mapping: Optional[dict[str, str]] = Field(None, description="Mapeo de campos de las transacciones")
    reference_records: list[dict[str, Any]] = Field(..., description="Registro de partes relacionadas/nómina")
    reference_field_mapping: Optional[dict[str, str]] = Field(None, description="Mapeo de campos del registro de referencia")


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


# ─── Segregación de Funciones (SoD) ───────────────────────────────────────────
@router.post("/sod")
async def sod_analysis(
    request: RecordsRequest,
    x_internal_key: str | None = Header(default=None),
):
    """Tarea 2.6 — Segregación de Funciones sobre matriz usuario-permiso."""
    verify_internal_key(x_internal_key)
    fm = request.field_mapping or {}
    try:
        result = analyze_sod(
            records=request.records,
            user_field=fm.get("user", "user"),
            permission_field=fm.get("permission", "permission"),
            user_name_field=fm.get("user_name", "user_name"),
            department_field=fm.get("department", "department"),
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    return _serialize(result)


# ─── Integridad de Maestro de Proveedores ─────────────────────────────────────
@router.post("/vendor_master")
async def vendor_master_analysis(
    request: RecordsRequest,
    x_internal_key: str | None = Header(default=None),
):
    """Tarea 2.7 — Integridad de Maestro de Proveedores."""
    verify_internal_key(x_internal_key)
    fm = request.field_mapping or {}
    try:
        result = analyze_vendor_master(
            vendors=request.records,
            vendor_id_field=fm.get("vendor_id", "vendor_id"),
            vendor_name_field=fm.get("vendor_name", "vendor_name"),
            tax_id_field=fm.get("tax_id", "tax_id"),
            bank_account_field=fm.get("bank_account", "bank_account"),
            address_field=fm.get("address", "address"),
            status_field=fm.get("status", "status"),
            last_activity_field=fm.get("last_activity_date", "last_activity_date"),
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    return _serialize(result)


# ─── Partes Relacionadas y Conflicto de Interés ───────────────────────────────
@router.post("/related_parties")
async def related_parties_analysis(
    request: DualRecordsRequest,
    x_internal_key: str | None = Header(default=None),
):
    """Tarea 2.8 — Cruce de transacciones contra el registro de partes relacionadas."""
    verify_internal_key(x_internal_key)
    fm = request.field_mapping or {}
    rfm = request.reference_field_mapping or {}
    try:
        result = analyze_related_parties(
            transactions=request.records,
            related_parties=request.reference_records,
            vendor_id_field=fm.get("vendor_id", "vendor_id"),
            vendor_name_field=fm.get("vendor_name", "vendor_name"),
            tax_id_field=fm.get("tax_id", "tax_id"),
            amount_field=fm.get("amount", "amount"),
            date_field=fm.get("date", "date"),
            party_name_field=rfm.get("party_name", "party_name"),
            party_tax_id_field=rfm.get("tax_id", "tax_id"),
            relationship_field=rfm.get("relationship", "relationship"),
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    return _serialize(result)


# ─── Gastos de Representación / Viáticos (T&E) ────────────────────────────────
@router.post("/expenses")
async def expenses_analysis(
    request: RecordsRequest,
    x_internal_key: str | None = Header(default=None),
):
    """Tarea 2.9 — Análisis de Gastos de Representación / Viáticos."""
    verify_internal_key(x_internal_key)
    fm = request.field_mapping or {}
    try:
        result = analyze_expenses(
            records=request.records,
            amount_field=fm.get("amount", "amount"),
            employee_id_field=fm.get("employee_id", "employee_id"),
            employee_name_field=fm.get("employee_name", "employee_name"),
            date_field=fm.get("date", "date"),
            category_field=fm.get("category", "category"),
            approver_field=fm.get("approved_by", "approved_by"),
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    return _serialize(result)


# ─── Corte de Ingresos ─────────────────────────────────────────────────────────
@router.post("/revenue_cutoff")
async def revenue_cutoff_analysis(
    request: RecordsRequest,
    x_internal_key: str | None = Header(default=None),
):
    """Tarea 2.10 — Corte de Ingresos (Revenue Cutoff)."""
    verify_internal_key(x_internal_key)
    fm = request.field_mapping or {}
    try:
        result = analyze_revenue_cutoff(
            records=request.records,
            invoice_number_field=fm.get("invoice_number", "invoice_number"),
            customer_name_field=fm.get("vendor_name", "customer_name"),
            amount_field=fm.get("amount", "amount"),
            invoice_date_field=fm.get("date", "date"),
            delivery_date_field=fm.get("delivery_date", "delivery_date"),
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    return _serialize(result)


# ─── Licitación Colusoria ──────────────────────────────────────────────────────
@router.post("/bid_rigging")
async def bid_rigging_analysis(
    request: RecordsRequest,
    x_internal_key: str | None = Header(default=None),
):
    """Tarea 2.11 — Licitación Colusoria (Bid Rigging)."""
    verify_internal_key(x_internal_key)
    fm = request.field_mapping or {}
    try:
        result = analyze_bid_rigging(
            records=request.records,
            tender_id_field=fm.get("tender_id", "tender_id"),
            bidder_name_field=fm.get("vendor_name", "bidder_name"),
            amount_field=fm.get("amount", "amount"),
            is_winner_field=fm.get("is_winner", "is_winner"),
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    return _serialize(result)


# ─── Antigüedad de Cuentas por Cobrar ──────────────────────────────────────────
@router.post("/ar_aging")
async def ar_aging_analysis(
    request: RecordsRequest,
    x_internal_key: str | None = Header(default=None),
):
    """Tarea 2.12 — Antigüedad de Cuentas por Cobrar y Notas de Crédito."""
    verify_internal_key(x_internal_key)
    fm = request.field_mapping or {}
    try:
        result = analyze_ar_aging(
            records=request.records,
            customer_name_field=fm.get("vendor_name", "customer_name"),
            invoice_number_field=fm.get("invoice_number", "invoice_number"),
            amount_field=fm.get("amount", "amount"),
            due_date_field=fm.get("due_date", "due_date"),
            is_credit_note_field=fm.get("is_credit_note", "is_credit_note"),
            invoice_date_field=fm.get("date", "date"),
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    return _serialize(result)


# ─── Activo Fijo — Existencia y Depreciación ───────────────────────────────────
@router.post("/fixed_assets")
async def fixed_assets_analysis(
    request: RecordsRequest,
    x_internal_key: str | None = Header(default=None),
):
    """Tarea 2.13 — Activo Fijo — Existencia y Depreciación."""
    verify_internal_key(x_internal_key)
    fm = request.field_mapping or {}
    try:
        result = analyze_fixed_assets(
            records=request.records,
            asset_id_field=fm.get("asset_id", "asset_id"),
            asset_name_field=fm.get("asset_name", "asset_name"),
            acquisition_date_field=fm.get("acquisition_date", "acquisition_date"),
            cost_field=fm.get("cost", "cost"),
            useful_life_field=fm.get("useful_life_years", "useful_life_years"),
            accumulated_depreciation_field=fm.get("accumulated_depreciation", "accumulated_depreciation"),
            status_field=fm.get("status", "status"),
            last_check_field=fm.get("last_physical_check_date", "last_physical_check_date"),
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    return _serialize(result)


# ─── Pitufeo / Smurfing ─────────────────────────────────────────────────────────
@router.post("/structuring")
async def structuring_analysis(
    request: RecordsRequest,
    x_internal_key: str | None = Header(default=None),
):
    """Tarea 2.14 — Pitufeo / Smurfing (Structuring)."""
    verify_internal_key(x_internal_key)
    fm = request.field_mapping or {}
    try:
        result = analyze_structuring(
            records=request.records,
            account_holder_field=fm.get("account_holder", "account_holder"),
            amount_field=fm.get("amount", "amount"),
            date_field=fm.get("date", "date"),
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    return _serialize(result)


# ─── Missing Trader / Carrusel de IVA ──────────────────────────────────────────
@router.post("/missing_trader")
async def missing_trader_analysis(
    request: RecordsRequest,
    x_internal_key: str | None = Header(default=None),
):
    """Tarea 2.15 — Missing Trader / Carrusel de IVA."""
    verify_internal_key(x_internal_key)
    fm = request.field_mapping or {}
    try:
        result = analyze_missing_trader(
            records=request.records,
            vendor_name_field=fm.get("vendor_name", "vendor_name"),
            amount_field=fm.get("amount", "amount"),
            date_field=fm.get("date", "date"),
            tax_id_field=fm.get("tax_id", "tax_id"),
            address_field=fm.get("address", "address"),
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    return _serialize(result)


# ─── Concentración en Jurisdicciones de Baja Tributación ───────────────────────
@router.post("/tax_haven")
async def tax_haven_analysis(
    request: RecordsRequest,
    x_internal_key: str | None = Header(default=None),
):
    """Tarea 2.16 — Concentración en Jurisdicciones de Baja Tributación."""
    verify_internal_key(x_internal_key)
    fm = request.field_mapping or {}
    try:
        result = analyze_tax_haven_concentration(
            records=request.records,
            counterparty_name_field=fm.get("vendor_name", "vendor_name"),
            amount_field=fm.get("amount", "amount"),
            jurisdiction_field=fm.get("jurisdiction", "jurisdiction"),
            date_field=fm.get("date", "date"),
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    return _serialize(result)
