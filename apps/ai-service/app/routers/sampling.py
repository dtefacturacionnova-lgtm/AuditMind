"""
Sampling router — Muestreo estadístico para auditoría (NIA 530).

Métodos implementados:
- MUS (Monetary Unit Sampling) — para pruebas sustantivas de detalle sobre saldos
- Atributos — para pruebas de controles (tasa de desviación)
- Aleatorio simple — para muestreo no estadístico documentado

Referencias:
- NIA 530 — Muestreo de auditoría
- AICPA Audit Guide — Audit Sampling
- ACL/IDEA methodology
"""
from __future__ import annotations

import math
import random
import secrets
from typing import Any, Literal, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, field_validator

router = APIRouter(prefix="/sampling", tags=["Sampling NIA 530"])

# ─── AICPA Confidence Factor Tables (zero expected misstatement) ──────────────
# Used in MUS: sample size = (book value × CF) / tolerable misstatement
# Source: AICPA Audit Guide — Audit Sampling, Table 4-1
_CONFIDENCE_FACTORS = {
    99: 4.61,
    95: 3.00,
    90: 2.31,
    80: 1.61,
    75: 1.39,
    70: 1.21,
}

# ─── Attribute sampling — AICPA Table 3-1 (zero-tolerance, simplified) ────────
# Lookup: (confidence%, tolerable deviation rate%) → sample size
# Zero expected deviation. For expected > 0, we approximate by scaling.
_ATTRIBUTE_TABLE_ZERO_EXPECTED = {
    (90, 1): 231, (90, 2): 114, (90, 3): 76,  (90, 4): 57,  (90, 5): 45,  (90, 6): 38,  (90, 7): 32,  (90, 8): 28,  (90, 9): 25,  (90, 10): 22,
    (95, 1): 299, (95, 2): 149, (95, 3): 99,  (95, 4): 74,  (95, 5): 59,  (95, 6): 49,  (95, 7): 42,  (95, 8): 36,  (95, 9): 32,  (95, 10): 29,
    (99, 1): 459, (99, 2): 230, (99, 3): 152, (99, 4): 113, (99, 5): 90,  (99, 6): 75,  (99, 7): 64,  (99, 8): 55,  (99, 9): 49,  (99, 10): 44,
}


# ───────────────────────────────────────────────────────────────────────────────
# MUS — Monetary Unit Sampling
# ───────────────────────────────────────────────────────────────────────────────

class MUSRequest(BaseModel):
    method: Literal["MUS"] = "MUS"
    book_value: float = Field(..., gt=0, description="Valor en libros de la población (saldo total auditado)")
    tolerable_misstatement: float = Field(..., gt=0, description="Materialidad de ejecución / error tolerable")
    expected_misstatement: float = Field(0, ge=0, description="Error esperado (default 0 — sin error anticipado)")
    confidence_level: Literal[70, 75, 80, 90, 95, 99] = Field(95, description="Nivel de confianza en %")

    @field_validator("expected_misstatement")
    @classmethod
    def expected_lt_tolerable(cls, v, info):
        if v >= info.data.get("tolerable_misstatement", 0):
            raise ValueError("expected_misstatement debe ser menor que tolerable_misstatement")
        return v


class MUSResponse(BaseModel):
    method: str = "MUS"
    sample_size: int
    sampling_interval: float
    confidence_factor: float
    expansion_factor: float
    methodology_note: str
    parameters: dict[str, Any]


def calculate_mus(req: MUSRequest) -> MUSResponse:
    cf = _CONFIDENCE_FACTORS[req.confidence_level]
    # Expansion factor for expected misstatement (AICPA Table 4-3 simplified)
    # When expected > 0, sample size grows.
    expansion = 1.0 if req.expected_misstatement == 0 else 1.6

    denominator = req.tolerable_misstatement - (req.expected_misstatement * expansion)
    if denominator <= 0:
        raise HTTPException(
            status_code=400,
            detail="Error esperado × factor de expansión ≥ materialidad. Aumente la materialidad o disminuya el error esperado."
        )

    sample_size = math.ceil((req.book_value * cf) / denominator)
    interval = req.book_value / sample_size if sample_size > 0 else 0

    return MUSResponse(
        sample_size=sample_size,
        sampling_interval=round(interval, 2),
        confidence_factor=cf,
        expansion_factor=expansion,
        methodology_note=(
            f"MUS (Monetary Unit Sampling) NIA 530. n = (BV × CF) / (TM − EE × EF) "
            f"= ({req.book_value:,.0f} × {cf}) / ({req.tolerable_misstatement:,.0f} − "
            f"{req.expected_misstatement:,.0f} × {expansion}) = {sample_size}. "
            f"Intervalo de muestreo = {req.book_value:,.0f} / {sample_size} = {interval:,.2f}."
        ),
        parameters=req.model_dump(),
    )


# ───────────────────────────────────────────────────────────────────────────────
# Attribute Sampling
# ───────────────────────────────────────────────────────────────────────────────

class AttributeRequest(BaseModel):
    method: Literal["ATTRIBUTE"] = "ATTRIBUTE"
    population_size: Optional[int] = Field(None, description="Tamaño de la población (opcional, para corrección de población finita)")
    tolerable_deviation_rate: float = Field(..., gt=0, le=20, description="Tasa de desviación tolerable %")
    expected_deviation_rate: float = Field(0, ge=0, description="Tasa de desviación esperada %")
    confidence_level: Literal[90, 95, 99] = Field(95, description="Nivel de confianza %")


class AttributeResponse(BaseModel):
    method: str = "ATTRIBUTE"
    sample_size: int
    methodology_note: str
    parameters: dict[str, Any]


def calculate_attribute(req: AttributeRequest) -> AttributeResponse:
    # AICPA lookup: round tolerable rate to nearest integer 1-10
    tdr_lookup = max(1, min(10, round(req.tolerable_deviation_rate)))
    base = _ATTRIBUTE_TABLE_ZERO_EXPECTED.get((req.confidence_level, tdr_lookup))
    if base is None:
        raise HTTPException(status_code=400, detail="Combinación de parámetros fuera de tabla AICPA")

    # If expected deviation > 0, increase sample size proportionally
    # (simplified — real AICPA Table 3-2 is more granular)
    if req.expected_deviation_rate > 0:
        ratio = req.expected_deviation_rate / req.tolerable_deviation_rate
        if ratio >= 0.5:
            base = int(base * (1 + ratio * 1.2))
        else:
            base = int(base * (1 + ratio))

    # Finite population correction (only if pop size is small enough to matter)
    if req.population_size and req.population_size < base * 10:
        corrected = math.ceil((base * req.population_size) / (base + req.population_size))
        sample_size = min(base, corrected)
    else:
        sample_size = base

    return AttributeResponse(
        sample_size=sample_size,
        methodology_note=(
            f"Muestreo por Atributos NIA 530. Tabla AICPA: confianza={req.confidence_level}%, "
            f"tasa tolerable={req.tolerable_deviation_rate}%, tasa esperada={req.expected_deviation_rate}%. "
            f"Tamaño muestra = {sample_size}."
        ),
        parameters=req.model_dump(),
    )


# ───────────────────────────────────────────────────────────────────────────────
# Random selection (when caller has the population records)
# ───────────────────────────────────────────────────────────────────────────────

class SelectionRequest(BaseModel):
    records: list[dict[str, Any]] = Field(..., description="Población (lista de items)")
    sample_size: int = Field(..., gt=0)
    selection_method: Literal["RANDOM", "SYSTEMATIC", "MUS"] = "RANDOM"
    value_field: Optional[str] = Field(None, description="Para MUS: nombre del campo monetario (ej. 'amount')")
    seed: Optional[int] = Field(None, description="Seed para reproducibilidad. Si null, usa secrets.")


class SelectionResponse(BaseModel):
    selected: list[dict[str, Any]]
    selection_method: str
    seed_used: Optional[int]
    interval: Optional[float] = None


def select_sample(req: SelectionRequest) -> SelectionResponse:
    if len(req.records) == 0:
        raise HTTPException(status_code=400, detail="Población vacía")
    if req.sample_size > len(req.records):
        raise HTTPException(status_code=400, detail=f"sample_size ({req.sample_size}) > población ({len(req.records)})")

    seed = req.seed if req.seed is not None else secrets.randbits(32)
    rng = random.Random(seed)

    if req.selection_method == "RANDOM":
        selected = rng.sample(req.records, req.sample_size)
        return SelectionResponse(selected=selected, selection_method="RANDOM", seed_used=seed)

    if req.selection_method == "SYSTEMATIC":
        interval = len(req.records) / req.sample_size
        start = rng.randint(0, int(interval))
        selected = [req.records[int(start + i * interval)] for i in range(req.sample_size)]
        return SelectionResponse(
            selected=selected,
            selection_method="SYSTEMATIC",
            seed_used=seed,
            interval=round(interval, 2),
        )

    if req.selection_method == "MUS":
        if not req.value_field:
            raise HTTPException(status_code=400, detail="MUS requiere 'value_field'")
        # Probability-proportional-to-size sampling: cumulative sum + random hits
        try:
            values = [abs(float(r.get(req.value_field, 0))) for r in req.records]
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail=f"Campo '{req.value_field}' no es numérico")

        total = sum(values)
        if total <= 0:
            raise HTTPException(status_code=400, detail="Suma de valores ≤ 0 — MUS no aplica")

        interval = total / req.sample_size
        start = rng.uniform(0, interval)
        hits = [start + i * interval for i in range(req.sample_size)]

        selected_idx: set[int] = set()
        cumulative = 0.0
        hit_iter = iter(sorted(hits))
        current_hit = next(hit_iter, None)
        for i, v in enumerate(values):
            cumulative += v
            while current_hit is not None and cumulative >= current_hit:
                selected_idx.add(i)
                current_hit = next(hit_iter, None)
            if current_hit is None:
                break

        selected = [req.records[i] for i in sorted(selected_idx)]
        return SelectionResponse(
            selected=selected,
            selection_method="MUS",
            seed_used=seed,
            interval=round(interval, 2),
        )

    raise HTTPException(status_code=400, detail=f"Método desconocido: {req.selection_method}")


# ───────────────────────────────────────────────────────────────────────────────
# Routes
# ───────────────────────────────────────────────────────────────────────────────

@router.post("/calculate/mus", response_model=MUSResponse, summary="Calcular tamaño muestra MUS")
def post_calculate_mus(req: MUSRequest) -> MUSResponse:
    """Calcula el tamaño de muestra para Monetary Unit Sampling (NIA 530)."""
    return calculate_mus(req)


@router.post("/calculate/attribute", response_model=AttributeResponse, summary="Calcular tamaño muestra Atributos")
def post_calculate_attribute(req: AttributeRequest) -> AttributeResponse:
    """Calcula el tamaño de muestra para pruebas de controles (NIA 530)."""
    return calculate_attribute(req)


@router.post("/select", response_model=SelectionResponse, summary="Seleccionar muestra desde población")
def post_select(req: SelectionRequest) -> SelectionResponse:
    """Selecciona los registros de la muestra usando RANDOM, SYSTEMATIC o MUS."""
    return select_sample(req)
