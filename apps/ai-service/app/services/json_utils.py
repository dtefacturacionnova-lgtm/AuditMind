"""Parseo compartido de respuestas JSON de LLM — promovido desde scriptorium.py
(EVD-05) para que llm_router.py lo reutilice en vez de duplicarlo un tercer sitio.
"""
import json


def parse_json_response(text: str, default: dict) -> dict:
    """Try to extract JSON from LLM response, return default on failure."""
    try:
        # Look for JSON block in response
        if "```json" in text:
            start = text.index("```json") + 7
            end = text.index("```", start)
            return json.loads(text[start:end].strip())
        elif "```" in text:
            start = text.index("```") + 3
            end = text.index("```", start)
            return json.loads(text[start:end].strip())
        elif text.strip().startswith("{"):
            return json.loads(text.strip())
        # Try to find JSON object in text
        brace_start = text.find("{")
        brace_end = text.rfind("}")
        if brace_start != -1 and brace_end != -1:
            return json.loads(text[brace_start:brace_end + 1])
    except (json.JSONDecodeError, ValueError):
        pass
    return default
