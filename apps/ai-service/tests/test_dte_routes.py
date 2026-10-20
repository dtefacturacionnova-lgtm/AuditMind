import json
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routers import analytics

FIXTURES = Path(__file__).parent / "fixtures" / "dte"
KEY = "clave-de-prueba"
CCF = json.loads((FIXTURES / "v2" / "03-ccf.json").read_text(encoding="utf-8"))
CODIGO = CCF["identificacion"]["codigoGeneracion"]


async def respuesta_falsa(dtes, **_):
    return [{"codigo_generacion": d["identificacion"]["codigoGeneracion"], "estado": "No Encontrado en MH"} for d in dtes]


class Rutas(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        app = FastAPI()
        app.include_router(analytics.router, prefix="/analytics")
        cls.client = TestClient(app)

    def setUp(self):
        patcher = patch.object(analytics.settings, "INTERNAL_API_KEY", KEY)
        patcher.start()
        self.addCleanup(patcher.stop)

    def post(self, path, body, key=KEY):
        return self.client.post(f"/analytics/{path}", json=body, headers={"x-internal-key": key} if key else {})

    def test_las_dos_rutas_exigen_la_clave_interna(self):
        self.assertEqual(self.post("dte_mh", {"records": [CCF]}, key=None).status_code, 401)
        self.assertEqual(self.post("dte_validation", {"records": [CCF]}, key="otra").status_code, 401)

    def test_dte_mh_devuelve_una_consulta_por_documento(self):
        with patch.object(analytics, "consultar_lote", respuesta_falsa):
            r = self.post("dte_mh", {"records": [CCF]})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["consultas"], [{"codigo_generacion": CODIGO, "estado": "No Encontrado en MH"}])
        self.assertEqual(r.json()["max_lote"], 25)

    def test_dte_mh_rechaza_lotes_vacios_o_demasiado_grandes(self):
        self.assertEqual(self.post("dte_mh", {"records": []}).status_code, 422)
        self.assertEqual(self.post("dte_mh", {"records": [CCF] * 26}).status_code, 422)

    def test_dte_validation_con_y_sin_consultas(self):
        sin = self.post("dte_validation", {"records": [CCF]}).json()
        self.assertIsNone(sin["mh_consultados"])
        self.assertFalse([f for f in sin["findings"] if f["test_name"].startswith("MH_")])

        con = self.post("dte_validation", {"records": [CCF], "mh_consultas": [{"codigo_generacion": CODIGO, "estado": "No Encontrado en MH"}]}).json()
        self.assertEqual(con["mh_consultados"], 1)
        self.assertEqual(con["mh_confirmados"], 0)
        self.assertIn("MH_NO_ENCONTRADO", [f["test_name"] for f in con["findings"]])
        self.assertEqual(con["summary"]["mh_consultados"], 1)


if __name__ == "__main__":
    unittest.main()
