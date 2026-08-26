"""Parser de la Lista de Sanciones del Reino Unido (UK Sanctions List) — XML
oficial publicado en GOV.UK (FCDO). Función pura, misma forma de salida que
ofac_parser.parse_sdn_xml / un_parser.parse_consolidated_xml.

Nota importante: la antigua "OFSI Consolidated List" (que se hubiera esperado
usar) cerró el 28/01/2026 — el Reino Unido consolidó todas sus designaciones
en esta "UK Sanctions List" única. Confirmado en vivo (2026-08-26).

Schema real verificado en vivo (2026-08-26,
sanctionslist.fcdo.gov.uk/docs/UK-Sanctions-List.xml, ~21.7MB): raíz
<Designations>, cada <Designation> trae UniqueID/IndividualEntityShip/
Names/Addresses/RegimeName/OtherInformation/LastUpdated, más
IndividualDetails/Individual (Nationalities/DOBs/BirthDetails) o
EntityDetails/Entity según el tipo. Las fechas de nacimiento inexactas usan
un formato literal "dd/mm/AAAA" (día/mes desconocido) — se guardan tal cual,
como texto libre, igual que en el resto de este módulo.
"""
import re
import xml.etree.ElementTree as ET
from typing import Any

_DDMMYYYY = re.compile(r"^(\d{2})/(\d{2})/(\d{4})$")


def _ddmmyyyy_to_iso(value: str) -> str | None:
    """LastUpdated viene como dd/mm/AAAA (convención británica) — convertir a
    ISO (AAAA-MM-DD) ANTES de que NestJS haga `new Date(...)`, porque
    Date() de JS interpreta un string ambiguo con barras como MM/DD/AAAA
    (convención EE.UU.), no DD/MM/AAAA — sin esta conversión, día y mes
    quedarían invertidos en silencio para cualquier fecha con día ≤ 12."""
    m = _DDMMYYYY.match(value)
    if not m:
        return None
    day, month, year = m.groups()
    return f"{year}-{month}-{day}"


def _text(elem: ET.Element | None, path: str) -> str:
    if elem is None:
        return ""
    found = elem.find(path)
    return (found.text or "").strip() if found is not None and found.text else ""


def _entity_type(individual_entity_ship: str) -> str:
    if individual_entity_ship == "Individual":
        return "INDIVIDUAL"
    if individual_entity_ship == "Entity":
        return "ENTITY"
    return "OTHER"  # ej. "Ship" en algunas designaciones


def parse_uk_sanctions_xml(raw: bytes) -> list[dict[str, Any]]:
    """Parsea el XML de la UK Sanctions List. Defensivo: individuos y
    entidades comparten Names/Addresses/RegimeName a nivel de Designation,
    pero DOB/nacionalidad/lugar de nacimiento solo existen para individuos."""
    root = ET.fromstring(raw)
    records: list[dict[str, Any]] = []

    for designation in root.findall(".//Designation"):
        uid = _text(designation, "UniqueID")
        if not uid:
            continue

        ship = _text(designation, "IndividualEntityShip")
        entity_type = _entity_type(ship)

        primary_name = ""
        aliases: list[str] = []
        for name in designation.findall(".//Names/Name"):
            name_text = _text(name, "Name6")
            name_type = _text(name, "NameType")
            if not name_text:
                continue
            if name_type == "Primary Name" and not primary_name:
                primary_name = name_text
            elif name_text not in aliases:
                aliases.append(name_text)
        if not primary_name:
            continue

        programs = [
            r.text.strip() for r in designation.findall(".//RegimeName") if r.text and r.text.strip()
        ]

        countries: list[str] = []
        for addr in designation.findall(".//Addresses/Address"):
            country = _text(addr, "AddressCountry")
            if country and country not in countries:
                countries.append(country)

        nationality = [
            n.text.strip() for n in designation.findall(".//IndividualDetails/Individual/Nationalities/Nationality")
            if n.text and n.text.strip()
        ]

        dob_items = [
            d.text.strip() for d in designation.findall(".//IndividualDetails/Individual/DOBs/DOB")
            if d.text and d.text.strip()
        ]
        date_of_birth = "; ".join(dob_items) or None

        pob_parts = []
        for loc in designation.findall(".//IndividualDetails/Individual/BirthDetails/Location"):
            piece = ", ".join(
                p for p in [_text(loc, "TownOfBirth"), _text(loc, "CountryOfBirth")] if p
            )
            if piece:
                pob_parts.append(piece)
        place_of_birth = "; ".join(pob_parts) or None

        records.append({
            "external_id": uid,
            "entity_type": entity_type,
            "primary_name": primary_name,
            "aliases": aliases,
            "programs": programs,
            "nationality": nationality,
            "countries": countries,
            "date_of_birth": date_of_birth,
            "place_of_birth": place_of_birth,
            "remarks": _text(designation, "OtherInformation") or None,
            "source_updated_at": _ddmmyyyy_to_iso(_text(designation, "LastUpdated")),
            "raw_record": {
                "unique_id": uid, "individual_entity_ship": ship, "programs": programs,
                "aliases": aliases, "countries": countries,
            },
        })

    return records
