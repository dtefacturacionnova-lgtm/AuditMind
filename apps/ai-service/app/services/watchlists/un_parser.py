"""Parser de la Lista Consolidada del Consejo de Seguridad de la ONU — XML
oficial (scsanctions.un.org). Función pura, misma forma de salida que
ofac_parser.parse_sdn_xml — ver ese módulo para el contrato completo.

Schema real verificado en vivo (2026-08-26,
scsanctions.un.org/resources/xml/en/consolidated.xml): raíz
<CONSOLIDATED_LIST>, dos secciones <INDIVIDUALS>/<INDIVIDUAL> y
<ENTITIES>/<ENTITY>. Individuos: FIRST_NAME/SECOND_NAME/THIRD_NAME/
FOURTH_NAME + INDIVIDUAL_ALIAS/ALIAS_NAME. Entidades: FIRST_NAME (nombre
completo de la entidad, sin más partes) + ENTITY_ALIAS/ALIAS_NAME.
"""
import xml.etree.ElementTree as ET
from typing import Any


def _text(elem: ET.Element | None, path: str) -> str:
    if elem is None:
        return ""
    found = elem.find(path)
    return (found.text or "").strip() if found is not None and found.text else ""


def _latest_update(elem: ET.Element) -> str | None:
    """LAST_DAY_UPDATED puede traer varios <VALUE> (historial de
    modificaciones) — se toma el más reciente; el formato YYYY-MM-DD hace
    que el orden alfabético coincida con el cronológico."""
    values = [v.text.strip() for v in elem.findall(".//LAST_DAY_UPDATED/VALUE") if v.text and v.text.strip()]
    return max(values) if values else None


def _individual_name(elem: ET.Element) -> str:
    parts = [_text(elem, "FIRST_NAME"), _text(elem, "SECOND_NAME"), _text(elem, "THIRD_NAME"), _text(elem, "FOURTH_NAME")]
    return " ".join(p for p in parts if p).strip()


def parse_consolidated_xml(raw: bytes) -> list[dict[str, Any]]:
    """Parsea el XML de la Lista Consolidada ONU. Individuos y entidades
    tienen estructura distinta (ver docstring del módulo) — ambas se
    normalizan a la misma forma de salida que el parser de OFAC."""
    root = ET.fromstring(raw)
    records: list[dict[str, Any]] = []

    for indiv in root.findall(".//INDIVIDUALS/INDIVIDUAL"):
        ref = _text(indiv, "REFERENCE_NUMBER")
        primary_name = _individual_name(indiv)
        if not ref or not primary_name:
            continue

        aliases = [a.text.strip() for a in indiv.findall(".//INDIVIDUAL_ALIAS/ALIAS_NAME") if a.text and a.text.strip()]
        un_list_type = _text(indiv, "UN_LIST_TYPE")
        nationality = [n.text.strip() for n in indiv.findall(".//NATIONALITY/VALUE") if n.text and n.text.strip()]
        countries = [c.text.strip() for c in indiv.findall(".//INDIVIDUAL_ADDRESS/COUNTRY") if c.text and c.text.strip()]

        dob_parts = []
        for dob in indiv.findall(".//INDIVIDUAL_DATE_OF_BIRTH"):
            date_val = _text(dob, "DATE")
            year = _text(dob, "YEAR")
            dob_parts.append(date_val or year)
        date_of_birth = "; ".join(d for d in dob_parts if d) or None

        pob_parts = []
        for pob in indiv.findall(".//INDIVIDUAL_PLACE_OF_BIRTH"):
            piece = ", ".join(p for p in [_text(pob, "CITY"), _text(pob, "COUNTRY")] if p)
            if piece:
                pob_parts.append(piece)
        place_of_birth = "; ".join(pob_parts) or None

        records.append({
            "external_id": ref,
            "entity_type": "INDIVIDUAL",
            "primary_name": primary_name,
            "aliases": aliases,
            "programs": [un_list_type] if un_list_type else [],
            "nationality": nationality,
            "countries": countries,
            "date_of_birth": date_of_birth,
            "place_of_birth": place_of_birth,
            "remarks": _text(indiv, "COMMENTS1") or None,
            "source_updated_at": _latest_update(indiv),
            "raw_record": {
                "dataid": _text(indiv, "DATAID"), "reference_number": ref,
                "un_list_type": un_list_type, "aliases": aliases, "countries": countries,
            },
        })

    for entity in root.findall(".//ENTITIES/ENTITY"):
        ref = _text(entity, "REFERENCE_NUMBER")
        primary_name = _text(entity, "FIRST_NAME")
        if not ref or not primary_name:
            continue

        aliases = [a.text.strip() for a in entity.findall(".//ENTITY_ALIAS/ALIAS_NAME") if a.text and a.text.strip()]
        un_list_type = _text(entity, "UN_LIST_TYPE")
        countries = [c.text.strip() for c in entity.findall(".//ENTITY_ADDRESS/COUNTRY") if c.text and c.text.strip()]

        records.append({
            "external_id": ref,
            "entity_type": "ENTITY",
            "primary_name": primary_name,
            "aliases": aliases,
            "programs": [un_list_type] if un_list_type else [],
            "nationality": [],
            "countries": countries,
            "date_of_birth": None,
            "place_of_birth": None,
            "remarks": _text(entity, "COMMENTS1") or None,
            "source_updated_at": _latest_update(entity),
            "raw_record": {
                "dataid": _text(entity, "DATAID"), "reference_number": ref,
                "un_list_type": un_list_type, "aliases": aliases, "countries": countries,
            },
        })

    return records
