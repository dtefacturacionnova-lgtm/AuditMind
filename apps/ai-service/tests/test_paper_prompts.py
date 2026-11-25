"""Prompts de los botones de IA de los procedimientos: llevan la ficha del papel y avisan si falta contexto.

Correr desde apps/ai-service:  venv/Scripts/python.exe -m unittest discover -s tests -t . -v
"""
import asyncio
import unittest
from unittest import mock

from app.routers import scriptorium
from app.services.paper_prompts import build_draft_messages, build_improve_messages, parse_insufficient

FICHA = (
    "ENCARGO: FISCAL — \"Auditoría fiscal 2025\" — entidad: Distribuidora El Sol\n"
    "ALCANCE: Cumplimiento de IVA e ISR del ejercicio 2025.\n"
    "PAPEL: A-1 — Conciliación del débito fiscal de IVA"
)
NORMA = "[Débito fiscal] Art. 65 Ley IVA: el débito fiscal se determina…"


class MejorarRedaccion(unittest.TestCase):
    def test_con_ficha_la_incluye_y_prohibe_inventar(self):
        sistema, usuario = build_improve_messages("revisar ventas", "statement", "X", "OTHER", FICHA)
        self.assertIn("FICHA DEL PAPEL Y DEL ENCARGO", usuario)
        self.assertIn("Conciliación del débito fiscal de IVA", usuario)
        self.assertIn("NO agregues hechos", usuario)
        self.assertIn("TEXTO ORIGINAL:\nrevisar ventas", usuario)
        self.assertIn("ENUNCIADO", usuario)
        self.assertIn("No inventas datos", sistema)

    def test_con_ficha_ignora_el_titulo_y_tipo_sueltos(self):
        _, usuario = build_improve_messages("t", "title", "TÍTULO SUELTO", "OTHER", FICHA)
        self.assertNotIn("TÍTULO SUELTO", usuario)
        self.assertNotIn("Contexto del papel:", usuario)

    def test_sin_ficha_queda_como_antes(self):
        _, usuario = build_improve_messages("t", "title", "Conciliación", "FISCAL", None)
        self.assertIn("Contexto del papel: Conciliación (FISCAL).", usuario)
        self.assertNotIn("FICHA", usuario)
        _, vacio = build_improve_messages("t", None, None, None, "   ")
        self.assertNotIn("Contexto del papel", vacio)
        self.assertIn("Mejora la redacción profesional.", vacio)


class BorradorDesarrollo(unittest.TestCase):
    def test_con_ficha_y_norma_exige_algo_especifico_y_ofrece_la_salida(self):
        _, usuario = build_draft_messages("Cotejo", "Cotejar libro con declaración", "X", "FISCAL", "A-1", "FISCAL", FICHA, NORMA)
        self.assertIn("FICHA DEL PAPEL Y DEL ENCARGO", usuario)
        self.assertIn("ESPECÍFICO de este papel", usuario)
        self.assertIn("SIN_CONTEXTO: <qué falta", usuario)
        self.assertIn("NORMATIVA RECUPERADA", usuario)
        self.assertIn("Art. 65 Ley IVA", usuario)
        self.assertIn("SOLO si aparece textualmente aquí", usuario)
        self.assertIn("TÍTULO DEL PROCEDIMIENTO: Cotejo", usuario)
        self.assertIn("[completar...]", usuario)

    def test_sin_norma_no_hay_bloque_de_normativa(self):
        _, usuario = build_draft_messages("t", "s", None, None, None, None, FICHA, "")
        self.assertNotIn("NORMATIVA RECUPERADA", usuario)

    def test_sin_ficha_queda_como_antes_y_no_ofrece_sin_contexto(self):
        _, usuario = build_draft_messages("Cotejo", "s", "Conciliación", "FISCAL", "A-1", None, None, None)
        self.assertIn("PAPEL DE TRABAJO: A-1 Conciliación (tipo: FISCAL)", usuario)
        self.assertNotIn("SIN_CONTEXTO", usuario)
        self.assertNotIn("ESPECÍFICO de este papel", usuario)

    def test_el_sistema_ya_no_ata_el_desarrollo_a_las_nia(self):
        sistema, _ = build_draft_messages("t", "s", None, None, None, None, FICHA, None)
        self.assertIn("marco del encargo", sistema)
        self.assertNotIn("siguiendo NIA", sistema)


class AvisoSinContexto(unittest.TestCase):
    def test_detecta_texto_y_json(self):
        casos = [
            ("SIN_CONTEXTO: no sé de qué trata el papel", "no sé de qué trata el papel"),
            ("  sin_contexto : falta el alcance", "falta el alcance"),
            ('"SIN_CONTEXTO: falta el objetivo"', "falta el objetivo"),
            ('{"sin_contexto": "el papel no tiene secciones"}', "el papel no tiene secciones"),
            ('```json\n{"sin_contexto": "falta el alcance"}\n```', "falta el alcance"),
        ]
        for crudo, motivo in casos:
            with self.subTest(crudo=crudo):
                self.assertEqual(parse_insufficient(crudo), motivo)

    def test_marcador_solo_da_motivo_por_defecto(self):
        self.assertIn("falta contexto", parse_insufficient("SIN_CONTEXTO"))

    def test_una_respuesta_normal_no_se_confunde(self):
        for texto in [
            "Se verificó la conciliación del débito fiscal contra el libro de ventas.",
            "Sin contexto adicional, se revisó el libro de ventas contra la declaración de IVA.",
            "Sin contexto previo del cliente, se indagó con la gerencia.",
            "El auditor indicó que hay un tema sin contexto previo.",
            '[{"area": "IVA"}]', "", None,
        ]:
            with self.subTest(texto=texto):
                self.assertIsNone(parse_insufficient(texto))


class RutaDraftProcedure(unittest.TestCase):
    """El endpoint devuelve el aviso en vez de un desarrollo inventado, y manda la ficha al modelo."""

    def _correr(self, contenido, **campos):
        capturado = {}

        async def falso(**kw):
            capturado.update(kw)
            return {"content": contenido, "model": "m", "input_tokens": 10, "output_tokens": 5}

        req = scriptorium.DraftProcedureRequest(title="Cotejo", statement="s", **campos)
        with mock.patch.object(scriptorium, "chat_with_agent", falso), mock.patch.object(scriptorium.settings, "INTERNAL_API_KEY", "k"):
            res = asyncio.run(scriptorium.draft_procedure(req, x_internal_key="k"))
        return res, capturado

    def test_desarrollo_normal_pasa_y_el_modelo_recibe_la_ficha(self):
        res, cap = self._correr("Se coteja el libro de ventas con la declaración.", contextBrief=FICHA, ragBlock=NORMA)
        self.assertEqual(res["development"], "Se coteja el libro de ventas con la declaración.")
        self.assertNotIn("insufficientContext", res)
        self.assertIn("Conciliación del débito fiscal de IVA", cap["messages"][0]["content"])
        self.assertIn("Art. 65 Ley IVA", cap["messages"][0]["content"])

    def test_si_la_ia_avisa_sin_contexto_se_devuelve_el_aviso_y_no_texto(self):
        res, _ = self._correr("SIN_CONTEXTO: el papel no dice qué cuentas cubre", contextBrief=FICHA)
        self.assertTrue(res["insufficientContext"])
        self.assertEqual(res["development"], "")
        self.assertIn("el papel no dice qué cuentas cubre", res["message"])
        self.assertIn("prefiere no inventar", res["message"])

    def test_sin_ficha_no_cambia_el_comportamiento_anterior(self):
        res, cap = self._correr("Desarrollo de siempre.")
        self.assertEqual(res["development"], "Desarrollo de siempre.")
        self.assertNotIn("FICHA", cap["messages"][0]["content"])

    def test_clave_interna_invalida_sigue_rechazando(self):
        req = scriptorium.DraftProcedureRequest(title="t")
        with mock.patch.object(scriptorium.settings, "INTERNAL_API_KEY", "k"):
            with self.assertRaises(Exception):
                asyncio.run(scriptorium.draft_procedure(req, x_internal_key="otra"))


class RutaImproveText(unittest.TestCase):
    def test_manda_la_ficha_al_modelo(self):
        capturado = {}

        async def falso(**kw):
            capturado.update(kw)
            return {"content": '"Texto mejorado"', "model": "m", "input_tokens": 1, "output_tokens": 1}

        req = scriptorium.ImproveTextRequest(text="revisar ventas", fieldType="statement", contextBrief=FICHA)
        with mock.patch.object(scriptorium, "chat_with_agent", falso), mock.patch.object(scriptorium.settings, "INTERNAL_API_KEY", "k"):
            res = asyncio.run(scriptorium.improve_procedure_text(req, x_internal_key="k"))
        self.assertEqual(res["improved"], "Texto mejorado")
        self.assertIn("Conciliación del débito fiscal de IVA", capturado["messages"][0]["content"])


if __name__ == "__main__":
    unittest.main()
