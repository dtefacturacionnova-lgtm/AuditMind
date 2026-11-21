"""OpenRouter como proveedor primario de los asistentes (2026-11-21): cadena OpenRouter → Gemini → Claude, salida estructurada con imágenes,
saltos de proveedor ante saldo/cuota/respuesta vacía y error final claro. Todo con un transporte HTTP simulado: no se llama a nadie ni se gasta saldo."""
import asyncio
import json
import unittest
from unittest.mock import AsyncMock, patch

import httpx
from pydantic import BaseModel

from app.services import llm_router as lr
from app.services.llm_router import LLMProvider as P
from app.services.llm_router import TaskComplexity as C

CLAVE = "sk-or-v1-CLAVE-DE-PRUEBA-no-es-real"


def correr(coro):
    return asyncio.run(coro)


def ok(texto="Hola", prompt=11, completion=7, finish="stop"):
    return httpx.Response(200, json={
        "model": "anthropic/claude-sonnet-5.5",
        "choices": [{"message": {"role": "assistant", "content": texto}, "finish_reason": finish}],
        "usage": {"prompt_tokens": prompt, "completion_tokens": completion},
    })


class Salida(BaseModel):
    titulo: str
    n: int


class Base(unittest.TestCase):
    """Fija las claves y sustituye httpx.AsyncClient por uno con transporte simulado; `self.peticiones` guarda lo enviado."""

    def setUp(self):
        self.peticiones: list[httpx.Request] = []
        self.respuestas: list[httpx.Response] = [ok()]
        for nombre, valor in (("OPENROUTER_API_KEY", CLAVE), ("ANTHROPIC_API_KEY", ""),
                              ("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1"),
                              ("OPENROUTER_MODEL_SIMPLE", "anthropic/claude-haiku-4.5"),
                              ("OPENROUTER_MODEL_STANDARD", "anthropic/claude-sonnet-5.5"),
                              ("OPENROUTER_MODEL_COMPLEX", "anthropic/claude-opus-5.5")):
            p = patch.object(lr.settings, nombre, valor)
            p.start()
            self.addCleanup(p.stop)

        real = httpx.AsyncClient

        def responder(req: httpx.Request) -> httpx.Response:
            return self.respuestas.pop(0) if len(self.respuestas) > 1 else self.respuestas[0]

        self.responder = responder  # una prueba puede sustituirlo (p. ej. para simular una caída de red)

        def handler(req: httpx.Request) -> httpx.Response:
            self.peticiones.append(req)
            return self.responder(req)

        def fabrica(*a, **kw):
            kw["transport"] = httpx.MockTransport(handler)
            return real(*a, **kw)

        p = patch.object(lr.httpx, "AsyncClient", fabrica)
        p.start()
        self.addCleanup(p.stop)

    def cuerpo(self, i=0) -> dict:
        return json.loads(self.peticiones[i].content)


class Cadena(Base):
    def test_con_clave_openrouter_va_primero_y_claude_sin_clave_se_salta(self):
        self.assertEqual(lr.provider_chain(), [P.OPENROUTER, P.GEMINI])

    def test_con_clave_de_anthropic_queda_de_ultimo_recurso(self):
        with patch.object(lr.settings, "ANTHROPIC_API_KEY", "sk-ant-x"):
            self.assertEqual(lr.provider_chain(), [P.OPENROUTER, P.GEMINI, P.CLAUDE])

    def test_sin_clave_de_openrouter_todo_sigue_como_antes_gemini_primero(self):
        with patch.object(lr.settings, "OPENROUTER_API_KEY", ""):
            self.assertEqual(lr.provider_chain(), [P.GEMINI])
            with patch.object(lr.settings, "ANTHROPIC_API_KEY", "sk-ant-x"):
                self.assertEqual(lr.provider_chain(), [P.GEMINI, P.CLAUDE])

    def test_un_proveedor_pedido_explicitamente_va_primero_y_los_demas_lo_respaldan(self):
        with patch.object(lr.settings, "ANTHROPIC_API_KEY", "sk-ant-x"):
            self.assertEqual(lr.provider_chain(P.GEMINI), [P.GEMINI, P.OPENROUTER, P.CLAUDE])
            self.assertEqual(lr.provider_chain(P.CLAUDE), [P.CLAUDE, P.OPENROUTER, P.GEMINI])

    def test_el_proveedor_por_defecto_es_openrouter(self):
        self.assertEqual(lr.DEFAULT_PROVIDER, P.OPENROUTER)

    def test_modelo_por_complejidad_del_agente(self):
        self.assertEqual(lr.get_model_for_agent("HERMES")[0], "anthropic/claude-haiku-4.5")
        self.assertEqual(lr.get_model_for_agent("MINERVA")[0], "anthropic/claude-sonnet-5.5")
        self.assertEqual(lr.get_model_for_agent("CICERO")[0], "anthropic/claude-opus-5.5")
        self.assertEqual(lr.get_model_for_agent("HERMES", C.COMPLEX)[0], "anthropic/claude-opus-5.5")
        self.assertEqual(lr.get_model_for_agent("DESCONOCIDO")[0], "anthropic/claude-sonnet-5.5")

    def test_los_modelos_se_cambian_desde_la_configuracion(self):
        with patch.object(lr.settings, "OPENROUTER_MODEL_STANDARD", "google/gemini-2.5-flash"):
            self.assertEqual(lr.get_model_for_agent("MINERVA")[0], "google/gemini-2.5-flash")


class Chat(Base):
    def test_responde_con_openrouter_y_no_toca_a_gemini(self):
        self.respuestas = [ok("Plan de auditoría", 120, 45)]
        with patch.object(lr, "_chat_gemini", AsyncMock()) as gem:
            r = correr(lr.chat_with_agent("MINERVA", "Eres Minerva", [{"role": "user", "content": "Hola"}], max_tokens=500))
        gem.assert_not_called()
        self.assertEqual(r, {"content": "Plan de auditoría", "model": "anthropic/claude-sonnet-5.5",
                             "input_tokens": 120, "output_tokens": 45, "stop_reason": "end_turn"})

    def test_la_peticion_lleva_clave_atribucion_sistema_y_conversacion_en_orden(self):
        msgs = [{"role": "user", "content": "uno"}, {"role": "assistant", "content": "dos"}, {"role": "user", "content": "tres"}]
        correr(lr.chat_with_agent("MINERVA", "SISTEMA", msgs, max_tokens=321))
        req = self.peticiones[0]
        self.assertEqual(str(req.url), "https://openrouter.ai/api/v1/chat/completions")
        self.assertEqual(req.headers["authorization"], f"Bearer {CLAVE}")
        self.assertEqual(req.headers["x-title"], "AuditMind")
        self.assertIn("http-referer", req.headers)
        b = self.cuerpo()
        self.assertEqual(b["model"], "anthropic/claude-sonnet-5.5")
        self.assertEqual(b["max_tokens"], 321)
        self.assertEqual([(m["role"], m["content"]) for m in b["messages"]],
                         [("system", "SISTEMA"), ("user", "uno"), ("assistant", "dos"), ("user", "tres")])

    def test_cortado_por_longitud_se_informa_como_max_tokens(self):
        self.respuestas = [ok("texto cortado", finish="length")]
        r = correr(lr.chat_with_agent("MINERVA", "s", [{"role": "user", "content": "x"}]))
        self.assertEqual(r["stop_reason"], "max_tokens")

    def test_sin_saldo_402_pasa_a_gemini(self):
        self.respuestas = [httpx.Response(402, json={"error": {"code": 402, "message": "Insufficient credits"}})]
        gem = AsyncMock(return_value={"content": "desde gemini", "model": "models/gemini-2.5-flash", "input_tokens": 1, "output_tokens": 2, "stop_reason": "end_turn"})
        with patch.object(lr, "_chat_gemini", gem):
            r = correr(lr.chat_with_agent("MINERVA", "s", [{"role": "user", "content": "x"}]))
        self.assertEqual(r["content"], "desde gemini")
        gem.assert_awaited_once()

    def test_limite_429_y_error_5xx_tambien_pasan_a_gemini(self):
        for codigo in (429, 500, 502, 503):
            self.respuestas = [httpx.Response(codigo, text="falla")]
            gem = AsyncMock(return_value={"content": f"gemini {codigo}", "model": "m", "input_tokens": 0, "output_tokens": 0, "stop_reason": "end_turn"})
            with patch.object(lr, "_chat_gemini", gem):
                r = correr(lr.chat_with_agent("MINERVA", "s", [{"role": "user", "content": "x"}]))
            self.assertEqual(r["content"], f"gemini {codigo}")

    def test_respuesta_vacia_o_error_dentro_de_un_200_pasan_a_gemini(self):
        for resp in (ok("   "), httpx.Response(200, json={"choices": []}),
                     httpx.Response(200, json={"error": {"message": "Provider returned error"}})):
            self.respuestas = [resp]
            gem = AsyncMock(return_value={"content": "gemini", "model": "m", "input_tokens": 0, "output_tokens": 0, "stop_reason": "end_turn"})
            with patch.object(lr, "_chat_gemini", gem):
                r = correr(lr.chat_with_agent("MINERVA", "s", [{"role": "user", "content": "x"}]))
            self.assertEqual(r["content"], "gemini")

    def test_el_mensaje_de_un_error_dentro_de_un_200_llega_al_registro_de_fallos(self):
        self.respuestas = [httpx.Response(200, json={"error": {"message": "Provider returned error"}})]
        with patch.object(lr, "_chat_gemini", AsyncMock(side_effect=RuntimeError("cuota"))):
            with self.assertRaises(lr.LLMUnavailableError) as cm:
                correr(lr.chat_with_agent("MINERVA", "s", [{"role": "user", "content": "x"}]))
        self.assertIn("openrouter: HTTP 200: Provider returned error", str(cm.exception))

    def test_error_de_red_pasa_a_gemini(self):
        def cae(req):
            raise httpx.ConnectError("sin red", request=req)
        self.responder = cae
        gem = AsyncMock(return_value={"content": "gemini", "model": "m", "input_tokens": 0, "output_tokens": 0, "stop_reason": "end_turn"})
        with patch.object(lr, "_chat_gemini", gem):
            self.assertEqual(correr(lr.chat_with_agent("MINERVA", "s", [{"role": "user", "content": "x"}]))["content"], "gemini")
        self.assertEqual(len(self.peticiones), 1)

    def test_si_openrouter_y_gemini_fallan_responde_claude_cuando_tiene_clave(self):
        self.respuestas = [httpx.Response(402, json={"error": {"message": "sin saldo"}})]
        claude = AsyncMock(return_value={"content": "desde claude", "model": "c", "input_tokens": 0, "output_tokens": 0, "stop_reason": "end_turn"})
        with patch.object(lr.settings, "ANTHROPIC_API_KEY", "sk-ant-x"), \
             patch.object(lr, "_chat_gemini", AsyncMock(side_effect=RuntimeError("429 RESOURCE_EXHAUSTED"))), \
             patch.object(lr, "_chat_claude", claude):
            r = correr(lr.chat_with_agent("MINERVA", "s", [{"role": "user", "content": "x"}]))
        self.assertEqual(r["content"], "desde claude")

    def test_si_todos_fallan_el_error_nombra_a_cada_proveedor_y_no_expone_la_clave(self):
        self.respuestas = [httpx.Response(402, json={"error": {"message": "Insufficient credits"}})]
        with patch.object(lr, "_chat_gemini", AsyncMock(side_effect=RuntimeError("429 RESOURCE_EXHAUSTED"))):
            with self.assertRaises(lr.LLMUnavailableError) as cm:
                correr(lr.chat_with_agent("MINERVA", "s", [{"role": "user", "content": "x"}]))
        msg = str(cm.exception)
        self.assertIn("openrouter: HTTP 402: Insufficient credits", msg)
        self.assertIn("gemini: 429 RESOURCE_EXHAUSTED", msg)
        self.assertNotIn(CLAVE, msg)

    def test_sin_clave_de_openrouter_no_se_hace_ninguna_peticion_http(self):
        gem = AsyncMock(return_value={"content": "gemini", "model": "m", "input_tokens": 0, "output_tokens": 0, "stop_reason": "end_turn"})
        with patch.object(lr.settings, "OPENROUTER_API_KEY", ""), patch.object(lr, "_chat_gemini", gem):
            correr(lr.chat_with_agent("MINERVA", "s", [{"role": "user", "content": "x"}]))
        self.assertEqual(self.peticiones, [])
        gem.assert_awaited_once()

    def test_contenido_en_bloques_se_une(self):
        self.respuestas = [httpx.Response(200, json={"choices": [{"message": {"content": [{"type": "text", "text": "ho"}, {"type": "text", "text": "la"}]}, "finish_reason": "stop"}], "usage": {}})]
        self.assertEqual(correr(lr.chat_with_agent("MINERVA", "s", [{"role": "user", "content": "x"}]))["content"], "hola")


class Estructurada(Base):
    def test_json_valido_con_schema_en_el_prompt_y_modo_json(self):
        self.respuestas = [ok('{"titulo": "Hallazgo", "n": 3}', 80, 20)]
        r = correr(lr.generate_structured("SHERLOCK", "Extrae", "texto", Salida))
        self.assertEqual(r, {"data": {"titulo": "Hallazgo", "n": 3}, "modelo": "anthropic/claude-sonnet-5.5", "input_tokens": 80, "output_tokens": 20})
        b = self.cuerpo()
        self.assertEqual(b["response_format"], {"type": "json_object"})
        self.assertEqual(b["temperature"], 0.1)
        self.assertIn("JSON Schema", b["messages"][0]["content"])
        self.assertIn('"titulo"', b["messages"][0]["content"])
        self.assertEqual(b["messages"][1], {"role": "user", "content": "texto"})

    def test_siempre_usa_el_modelo_estandar_aunque_el_agente_sea_complejo(self):
        self.respuestas = [ok('{"titulo": "a", "n": 1}')]
        correr(lr.generate_structured("SHERLOCK", "s", "u", Salida))
        self.assertEqual(self.cuerpo()["model"], "anthropic/claude-sonnet-5.5")

    def test_las_imagenes_van_como_data_uri_en_orden_despues_del_texto(self):
        self.respuestas = [ok('{"titulo": "foto", "n": 1}')]
        correr(lr.generate_structured("SHERLOCK", "s", "mira", Salida, imagenes=[(b"\x89PNG-uno", "image/png"), (b"JPG-dos", "image/jpeg")]))
        partes = self.cuerpo()["messages"][1]["content"]
        self.assertEqual(partes[0], {"type": "text", "text": "mira"})
        self.assertEqual([p["type"] for p in partes[1:]], ["image_url", "image_url"])
        self.assertTrue(partes[1]["image_url"]["url"].startswith("data:image/png;base64,"))
        self.assertTrue(partes[2]["image_url"]["url"].startswith("data:image/jpeg;base64,"))

    def test_si_no_valida_reintenta_una_vez_con_el_error_y_las_mismas_imagenes(self):
        self.respuestas = [ok('{"titulo": "x"}'), ok('{"titulo": "x", "n": 2}')]
        r = correr(lr.generate_structured("SHERLOCK", "s", "u", Salida, imagenes=[(b"img", "image/png")]))
        self.assertEqual(r["data"], {"titulo": "x", "n": 2})
        self.assertEqual(len(self.peticiones), 2)
        seg = self.cuerpo(1)["messages"][1]["content"]
        self.assertIn("no cumplió el formato", seg[0]["text"])
        self.assertEqual(seg[1]["type"], "image_url")

    def test_json_dentro_de_un_bloque_markdown_tambien_se_acepta(self):
        self.respuestas = [ok('```json\n{"titulo": "md", "n": 5}\n```')]
        self.assertEqual(correr(lr.generate_structured("SHERLOCK", "s", "u", Salida))["data"], {"titulo": "md", "n": 5})

    def test_si_openrouter_falla_cae_a_gemini_con_su_propio_formato(self):
        self.respuestas = [httpx.Response(402, json={"error": {"message": "sin saldo"}})]
        gem = AsyncMock(return_value={"parsed": {"titulo": "g", "n": 9}, "model": "models/gemini-2.5-flash", "input_tokens": 5, "output_tokens": 6})
        with patch.object(lr, "_structured_gemini", gem):
            r = correr(lr.generate_structured("SHERLOCK", "s", "u", Salida))
        self.assertEqual((r["data"], r["modelo"]), ({"titulo": "g", "n": 9}, "models/gemini-2.5-flash"))
        gem.assert_awaited_once()

    def test_si_todos_fallan_es_StructuredGenerationError_con_el_motivo_de_cada_uno(self):
        self.respuestas = [httpx.Response(429, text="rate limited")]
        with patch.object(lr, "_structured_gemini", AsyncMock(side_effect=RuntimeError("cuota"))):
            with self.assertRaises(lr.StructuredGenerationError) as cm:
                correr(lr.generate_structured("SHERLOCK", "s", "u", Salida))
        msg = str(cm.exception)
        self.assertIn("openrouter: HTTP 429", msg)
        self.assertIn("gemini: cuota", msg)
        self.assertNotIn(CLAVE, msg)


class RutaChat(Base):
    """El endpoint real /agents/chat con la app completa: éxito con OpenRouter y, si todo falla, 503 con mensaje neutro (antes: 500 sin pista)."""

    def setUp(self):
        super().setUp()
        from fastapi.testclient import TestClient
        import main
        self.cliente = TestClient(main.app, raise_server_exceptions=False)
        self.cabeceras = {"x-internal-key": lr.settings.INTERNAL_API_KEY}
        self.cuerpo_chat = {"agent_type": "MINERVA", "messages": [{"role": "user", "content": "Hola"}], "use_rag": False, "max_tokens": 50}

    def test_responde_200_con_el_texto_y_el_modelo_de_openrouter(self):
        self.respuestas = [ok("Hola, soy Minerva", 30, 8)]
        r = self.cliente.post("/agents/chat", json=self.cuerpo_chat, headers=self.cabeceras)
        self.assertEqual(r.status_code, 200)
        self.assertEqual((r.json()["content"], r.json()["model"], r.json()["output_tokens"]), ("Hola, soy Minerva", "anthropic/claude-sonnet-5.5", 8))

    def test_si_todos_los_proveedores_fallan_es_503_con_mensaje_neutro_sin_detalles_internos(self):
        self.respuestas = [httpx.Response(402, json={"error": {"message": "Insufficient credits"}})]
        with patch.object(lr, "_chat_gemini", AsyncMock(side_effect=RuntimeError("429 RESOURCE_EXHAUSTED"))):
            r = self.cliente.post("/agents/chat", json=self.cuerpo_chat, headers=self.cabeceras)
        self.assertEqual(r.status_code, 503)
        self.assertIn("no está disponible", r.json()["detail"])
        for interno in ("openrouter", "gemini", "402", "RESOURCE_EXHAUSTED", "credits", CLAVE):
            self.assertNotIn(interno.lower(), r.text.lower())

    def test_sigue_exigiendo_la_clave_interna(self):
        self.assertIn(self.cliente.post("/agents/chat", json=self.cuerpo_chat).status_code, (401, 403))
        self.assertEqual(self.peticiones, [])


if __name__ == "__main__":
    unittest.main()
