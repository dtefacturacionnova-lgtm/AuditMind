"""Parser de OFAC SDN (Specially Designated Nationals) — XML oficial del
Tesoro de EE.UU. Función pura: recibe bytes, devuelve una lista de dicts con
las mismas claves que espera WatchlistEntry — sin tocar la base de datos
(el upsert lo hace apps/api/src/watchlists/watchlists.service.ts).

Schema real verificado en vivo (2026-08-26,
sanctionslistservice.ofac.treas.gov/api/publicationpreview/exports/sdn.xml,
~19,300 registros): raíz <sdnList> con namespace, cada <sdnEntry> trae
uid/sdnType/lastName (+firstName si sdnType=Individual)/programList/akaList/
addressList/dateOfBirthList — estructura defensiva porque varía según el
tipo (Individual/Entity/Vessel/Aircraft).
"""
import xml.etree.ElementTree as ET
from typing import Any


def _local_tag(tag: str) -> str:
    """Quita el namespace del tag (ej. '{https://...}sdnEntry' → 'sdnEntry')
    — más simple que mapear el namespace completo para un export de un solo
    origen que no lo cambia entre llamadas."""
    return tag.rsplit("}", 1)[-1] if "}" in tag else tag


def _strip_namespace(root: ET.Element) -> None:
    for node in root.iter():
        node.tag = _local_tag(node.tag)


def _text(elem: ET.Element | None, path: str) -> str:
    if elem is None:
        return ""
    found = elem.find(path)
    return (found.text or "").strip() if found is not None and found.text else ""


def _entity_type(sdn_type: str) -> str:
    if sdn_type == "Individual":
        return "INDIVIDUAL"
    if sdn_type == "Entity":
        return "ENTITY"
    return "OTHER"  # Vessel, Aircraft, etc.


def parse_sdn_xml(raw: bytes) -> list[dict[str, Any]]:
    """Parsea el XML del SDN de OFAC. Defensivo: cualquier sub-elemento
    ausente se trata como vacío en vez de lanzar."""
    root = ET.fromstring(raw)
    _strip_namespace(root)

    records: list[dict[str, Any]] = []
    for entry in root.findall(".//sdnEntry"):
        uid = _text(entry, "uid")
        if not uid:
            continue

        sdn_type = _text(entry, "sdnType")
        first_name = _text(entry, "firstName")
        last_name = _text(entry, "lastName")
        primary_name = " ".join(p for p in [first_name, last_name] if p).strip()
        if not primary_name:
            continue

        aliases: list[str] = []
        for aka in entry.findall(".//akaList/aka"):
            aka_name = " ".join(p for p in [_text(aka, "firstName"), _text(aka, "lastName")] if p).strip()
            if aka_name and aka_name not in aliases:
                aliases.append(aka_name)

        programs = [p.text.strip() for p in entry.findall(".//programList/program") if p.text and p.text.strip()]

        countries: list[str] = []
        for addr in entry.findall(".//addressList/address"):
            country = _text(addr, "country")
            if country and country not in countries:
                countries.append(country)

        nationality: list[str] = []
        for nat in entry.findall(".//nationalityList/nationality"):
            country = _text(nat, "country")
            if country and country not in nationality:
                nationality.append(country)

        dob_items = [_text(item, "dateOfBirth") for item in entry.findall(".//dateOfBirthList/dateOfBirthItem")]
        date_of_birth = "; ".join(d for d in dob_items if d) or None

        pob_items = [_text(item, "placeOfBirth") for item in entry.findall(".//placeOfBirthList/placeOfBirthItem")]
        place_of_birth = "; ".join(p for p in pob_items if p) or None

        records.append({
            "external_id": uid,
            "entity_type": _entity_type(sdn_type),
            "primary_name": primary_name,
            "aliases": aliases,
            "programs": programs,
            "nationality": nationality,
            "countries": countries,
            "date_of_birth": date_of_birth,
            "place_of_birth": place_of_birth,
            "remarks": _text(entry, "remarks") or None,
            "source_updated_at": None,  # OFAC no publica una fecha de última modificación por registro
            "raw_record": {
                "uid": uid, "sdnType": sdn_type, "firstName": first_name, "lastName": last_name,
                "programs": programs, "aliases": aliases, "countries": countries,
            },
        })

    return records
