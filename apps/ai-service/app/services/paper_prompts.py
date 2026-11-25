"""Prompts de los botones de IA de los procedimientos de un papel (mejorar redacción, borrador del desarrollo).

Antes el prompt solo sabía el título y el tipo del papel y producía texto que valía para cualquier papel. Ahora el API manda una ficha
compacta del papel y del encargo (`contextBrief`, armada en el servidor) y, para el borrador, normativa recuperada del RAG (`ragBlock`).
Si no hay ficha (pantallas antiguas durante un despliegue) el prompt es equivalente al anterior.

Funciones puras: se prueban sin LLM.  Diseño: docs/ia-contexto-del-papel-propuesta.md
"""
import re
from typing import Optional

INSUFFICIENT_MARK = "SIN_CONTEXTO"

FIELD_GUIDANCE = {
    "title": "Es un TÍTULO corto de procedimiento (máx 8 palabras, sin punto final).",
    "statement": "Es el ENUNCIADO del procedimiento: qué se va a ejecutar. Usa verbos de acción (verificar, recalcular, confirmar, indagar). 1-2 oraciones claras.",
    "development": "Es el DESARROLLO/EJECUCIÓN del procedimiento: cómo se ejecutó y qué se obtuvo. Lenguaje formal de papel de trabajo, en pasado.",
}

IMPROVE_SYSTEM = (
    "Eres SCRIPTORIUM, redactor experto de papeles de trabajo de auditoría. "
    "Mejoras la redacción manteniendo SIEMPRE el sentido y los hechos originales. "
    "No inventas datos. Respondes solo con el texto mejorado, sin comillas ni explicaciones."
)

DRAFT_SYSTEM = (
    "Eres SCRIPTORIUM, auditor experto que redacta el desarrollo de procedimientos "
    "de auditoría en papeles de trabajo. Redactas el desarrollo de forma profesional, "
    "específica y ejecutable, siguiendo las normas del marco del encargo. No inventas resultados concretos: dejas "
    "marcadores claros [completar con resultado] donde el auditor debe documentar la evidencia."
)


def _clean(s: Optional[str]) -> str:
    return (s or "").strip()


def build_improve_messages(
    text: str,
    field_type: Optional[str] = None,
    paper_title: Optional[str] = None,
    paper_type: Optional[str] = None,
    context_brief: Optional[str] = None,
) -> tuple[str, str]:
    """(system, user) para mejorar la redacción de un texto de procedimiento."""
    guidance = FIELD_GUIDANCE.get(field_type or "", "Mejora la redacción profesional.")
    brief = _clean(context_brief)
    if brief:
        context = (
            f"\nFICHA DEL PAPEL Y DEL ENCARGO (úsala solo para alinear terminología y enfoque con ESTE papel):\n{brief}\n"
            "Mejora la redacción con el vocabulario propio de este papel, pero NO agregues hechos, cifras ni alcances que el texto original "
            "no diga ni la ficha respalde."
        )
    elif _clean(paper_title) or _clean(paper_type):
        context = f"\nContexto del papel: {_clean(paper_title)} ({_clean(paper_type)})."
    else:
        context = ""
    user = (
        f"Mejora la redacción del siguiente texto.\n{guidance}{context}\n\n"
        f"TEXTO ORIGINAL:\n{text}\n\n"
        f"Responde SOLO con el texto mejorado."
    )
    return IMPROVE_SYSTEM, user


def build_draft_messages(
    title: Optional[str] = None,
    statement: Optional[str] = None,
    paper_title: Optional[str] = None,
    paper_type: Optional[str] = None,
    paper_code: Optional[str] = None,
    audit_type: Optional[str] = None,
    context_brief: Optional[str] = None,
    rag_block: Optional[str] = None,
) -> tuple[str, str]:
    """(system, user) para redactar el desarrollo de un procedimiento. Con ficha, exige algo específico de ESTE papel o avisar SIN_CONTEXTO."""
    brief = _clean(context_brief)
    rag = _clean(rag_block)

    if brief:
        paper_block = f"FICHA DEL PAPEL Y DEL ENCARGO:\n{brief}\n"
    else:
        paper_block = (
            f"PAPEL DE TRABAJO: {_clean(paper_code)} {_clean(paper_title)} "
            f"(tipo: {_clean(paper_type) or _clean(audit_type) or 'general'})\n"
        )

    rag_section = (
        "\nNORMATIVA RECUPERADA DE LA BASE DE CONOCIMIENTO (fuente autorizada; cita artículo o norma SOLO si aparece textualmente aquí; "
        f"si no, describe el requisito sin inventar numeración):\n{rag}\n"
        if rag else ""
    )

    specific = (
        "\nEl desarrollo debe ser ESPECÍFICO de este papel: usa su objetivo, su alcance y lo ya documentado en la ficha; no escribas pasos que "
        "valdrían igual para cualquier otro papel. No repitas procedimientos que la ficha ya lista como existentes.\n"
        f"Si con la ficha NO puedes redactar algo específico de ESTE papel, responde únicamente \"{INSUFFICIENT_MARK}: <qué falta, en una frase>\" "
        "en lugar del desarrollo.\n"
        if brief else ""
    )

    user = f"""Redacta el DESARROLLO de este procedimiento de auditoría.

{paper_block}TÍTULO DEL PROCEDIMIENTO: {_clean(title) or '(sin título)'}
ENUNCIADO: {_clean(statement) or '(sin enunciado)'}
{rag_section}{specific}
Redacta un desarrollo de 3-5 oraciones que describa:
1. Cómo se ejecuta el procedimiento (pasos concretos)
2. Qué evidencia/documentación se revisa
3. Qué se concluye o verifica

Usa lenguaje formal de papel de trabajo. Inserta marcadores [completar...] donde el auditor
debe poner datos específicos (montos, fechas, muestras, resultados).

Responde SOLO con el texto del desarrollo, sin encabezados ni comillas."""
    return DRAFT_SYSTEM, user


# Exige los dos puntos (o el marcador solo): «Sin contexto adicional, se revisó…» es un desarrollo legítimo, no un aviso.
_PLAIN = re.compile(r"""^["'\s]*SIN[_ ]CONTEXTO\s*:\s*(.*)$""", re.IGNORECASE | re.DOTALL)
_ALONE = re.compile(r"""^["'\s]*SIN_CONTEXTO["'\s]*$""", re.IGNORECASE)
_JSON = re.compile(r'''^\s*(?:```(?:json)?\s*)?\{\s*"sin_contexto"\s*:\s*"((?:[^"\\]|\\.)*)"''', re.IGNORECASE)
_DEFAULT_REASON = "La IA indicó que falta contexto del papel."


def parse_insufficient(raw: Optional[str]) -> Optional[str]:
    """Si la IA avisó que no tiene contexto («SIN_CONTEXTO: …» o `{"sin_contexto": "…"}`) devuelve el motivo; si no, None."""
    if not raw:
        return None
    text = raw.strip()
    m = _JSON.match(text)
    if m:
        return re.sub(r"\s+", " ", m.group(1).replace('\\"', '"')).strip() or _DEFAULT_REASON
    m = _PLAIN.match(text)
    if m:
        reason = re.sub(r"[\"']+\s*$", "", m.group(1))
        return re.sub(r"\s+", " ", reason).strip() or _DEFAULT_REASON
    if _ALONE.match(text):
        return _DEFAULT_REASON
    return None
