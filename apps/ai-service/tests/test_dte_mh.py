import asyncio
import unittest

from app.services.caats.dte_mh import (
    DESCONOCIDO, ERROR_CONEXION, ERROR_CONSULTA, MAX_LOTE_MH, NO_ENCONTRADO, SIN_CODIGO,
    clasificar_estado, consultar_lote, dte_monto, monto_diferente, monto_segun_mh, resultado_de_consulta_mh, url_consulta_mh,
)

CODIGO = "4E6FCCB1-1274-4737-A4F3-17FCC56B8999"


def doc(codigo=CODIGO, fecha="2026-10-07", ambiente="01"):
    return {"identificacion": {"codigoGeneracion": codigo, "fecEmi": fecha, "ambiente": ambiente}}


class Direccion(unittest.TestCase):
    def test_produccion_y_pruebas(self):
        self.assertEqual(
            url_consulta_mh(CODIGO, "2026-10-07", "01"),
            f"https://admin.factura.gob.sv/prod/consultas/publica/simple/1?codigoGeneracion={CODIGO}&fechaEmi=2026-10-07",
        )
        self.assertTrue(url_consulta_mh(CODIGO, "2026-10-07", "00").startswith("https://admin.factura.gob.sv/test/consultas/publica/simple/0?"))
        self.assertIn("/test/", url_consulta_mh(CODIGO, "2026-10-07", "Pruebas"))

    def test_la_fecha_se_recorta_y_lo_demas_se_codifica(self):
        self.assertTrue(url_consulta_mh(CODIGO, "2026-10-07T10:20:30", "01").endswith("fechaEmi=2026-10-07"))
        u = url_consulta_mh("x&y=1/../z", "2026-10-07", "01")
        self.assertIn("codigoGeneracion=x%26y%3D1%2F..%2Fz&", u)           # no se puede salir del parámetro ni de la ruta
        self.assertTrue(u.startswith("https://admin.factura.gob.sv/"))


class Montos(unittest.TestCase):
    def test_el_monto_segun_el_tipo(self):
        self.assertEqual(dte_monto("03", {"totalPagar": 113}), 113)
        self.assertEqual(dte_monto("05", {"montoTotalOperacion": 56.5}), 56.5)
        self.assertEqual(dte_monto("07", {"totalSujetoRetencion": 75462.77}), 75462.77)
        self.assertEqual(dte_monto("15", {"valorTotal": 300}), 300)
        self.assertEqual(dte_monto("09", None, {"liquidoApagar": 42}), 42)
        self.assertEqual(dte_monto("03", None), 0)
        self.assertEqual(dte_monto("03", {"totalPagar": "x"}), 0)

    def test_el_monto_de_la_respuesta_del_mh(self):
        self.assertEqual(monto_segun_mh({"tipoDte": "03", "documento": {"resumen": {"totalPagar": 113}}}), 113)
        self.assertEqual(monto_segun_mh({"documento": {"identificacion": {"tipoDte": "07"}, "resumen": {"totalSujetoRetencion": 10}}}), 10)
        self.assertEqual(monto_segun_mh({"tipoDte": "07"}), 0)
        self.assertEqual(monto_segun_mh(None), 0)

    def test_la_diferencia_se_mide_en_centavos(self):
        self.assertFalse(monto_diferente(100, 100.01))     # un centavo: redondeo
        self.assertTrue(monto_diferente(100, 100.05))
        self.assertFalse(monto_diferente(100, 0))          # sin monto del MH no hay con qué comparar
        self.assertFalse(monto_diferente(100, None))
        self.assertTrue(monto_diferente(None, 50))


class LecturaDeLaRespuesta(unittest.TestCase):
    def test_respuesta_completa(self):
        r = resultado_de_consulta_mh("A", {
            "estadoDoc": "Transmitido Satisfactoriamente", "reporteInc": False, "observaciones": ["x"], "numeIdenRecep": "06142803901121",
            "selloVal": "SELLO", "fechaProcesado": "2026-09-02", "documento": {"resumen": {"totalPagar": 113}, "identificacion": {"numeroControl": "DTE-03-1"}},
            "tipoDte": "03",
        })
        self.assertEqual(r, {
            "codigo_generacion": "A", "estado": "Transmitido Satisfactoriamente", "inconsistencia": False, "observaciones": ["x"], "monto_mh": 113,
            "nit_receptor_mh": "06142803901121", "sello_mh": "SELLO", "numero_control_mh": "DTE-03-1", "fecha_procesado_mh": "2026-09-02",
        })

    def test_documento_que_el_mh_no_tiene_y_respuesta_vacia(self):
        self.assertEqual(resultado_de_consulta_mh("A", {"estadoDoc": "Error", "descripcionEstado": "Los datos no existen"})["estado"], NO_ENCONTRADO)
        self.assertEqual(resultado_de_consulta_mh("A", None)["estado"], DESCONOCIDO)
        self.assertEqual(resultado_de_consulta_mh("A", {})["estado"], DESCONOCIDO)
        self.assertEqual(resultado_de_consulta_mh("A", {"estadoDoc": "Error", "descripcionEstado": "otra cosa"})["estado"], "Error")

    def test_la_inconsistencia_solo_si_es_verdadera(self):
        self.assertTrue(resultado_de_consulta_mh("A", {"estadoDoc": "Procesado", "reporteInc": True})["inconsistencia"])
        self.assertFalse(resultado_de_consulta_mh("A", {"estadoDoc": "Procesado", "reporteInc": "true"})["inconsistencia"])


class Clasificacion(unittest.TestCase):
    def test_estados(self):
        for e in ("Procesado", "PROCESADO", "Transmitido Satisfactoriamente"):
            self.assertEqual(clasificar_estado(e), "confirmado", e)
        for e in ("Invalidado", "Anulado", "Rechazado", "En contingencia"):
            self.assertEqual(clasificar_estado(e), "adverso", e)
        self.assertEqual(clasificar_estado(NO_ENCONTRADO), "no_encontrado")
        for e in (SIN_CODIGO, ERROR_CONEXION, ERROR_CONSULTA, "Error", DESCONOCIDO, "", None):
            self.assertEqual(clasificar_estado(e), "sin_respuesta", e)

    def test_ignora_acentos_y_mayusculas(self):
        self.assertEqual(clasificar_estado("estado desconocido"), "sin_respuesta")
        self.assertEqual(clasificar_estado("ERROR DE CONEXIÓN MH"), "sin_respuesta")


class ConsultarLote(unittest.TestCase):
    def run_lote(self, dtes, fetch):
        return asyncio.run(consultar_lote(dtes, fetch=fetch, pausa=0))

    def test_consulta_cada_documento_en_orden_con_la_direccion_correcta(self):
        urls = []

        async def fetch(url):
            urls.append(url)
            return 200, {"estadoDoc": "Procesado", "documento": {"resumen": {"totalPagar": 10}}, "tipoDte": "03"}

        r = self.run_lote([doc(), doc("OTRO-CODIGO", "2026-10-08", "00")], fetch)
        self.assertEqual([c["codigo_generacion"] for c in r], [CODIGO, "OTRO-CODIGO"])
        self.assertTrue(urls[0].startswith("https://admin.factura.gob.sv/prod/") and "fechaEmi=2026-10-07" in urls[0])
        self.assertTrue(urls[1].startswith("https://admin.factura.gob.sv/test/"))
        self.assertEqual(r[0]["monto_mh"], 10)

    def test_un_documento_con_problemas_no_detiene_el_lote(self):
        async def fetch(url):
            if "FALLA" in url:
                raise TimeoutError()
            if "LIMITE" in url:
                return 429, None
            return 200, {"estadoDoc": "Procesado"}

        r = self.run_lote([doc("FALLA"), doc("LIMITE"), doc(""), {"sin": "identificacion"}, "texto", doc("BIEN")], fetch)
        self.assertEqual([c["estado"] for c in r], [ERROR_CONSULTA, ERROR_CONEXION, SIN_CODIGO, SIN_CODIGO, SIN_CODIGO, "Procesado"])

    def test_un_codigo_con_caracteres_raros_no_se_consulta(self):
        llamadas = []

        async def fetch(url):
            llamadas.append(url)
            return 200, {"estadoDoc": "Procesado"}

        r = self.run_lote([doc("a/../b?x=1"), doc("x" * 65)], fetch)
        self.assertEqual([c["estado"] for c in r], [SIN_CODIGO, SIN_CODIGO])
        self.assertEqual(llamadas, [])

    def test_respuesta_que_no_es_json(self):
        async def fetch(url):
            return 200, None

        self.assertEqual(self.run_lote([doc()], fetch)[0]["estado"], DESCONOCIDO)

    def test_limites_del_lote(self):
        async def fetch(url):
            return 200, {"estadoDoc": "Procesado"}

        with self.assertRaises(ValueError):
            self.run_lote([], fetch)
        with self.assertRaises(ValueError):
            self.run_lote([doc(f"C{i}") for i in range(MAX_LOTE_MH + 1)], fetch)
        self.assertEqual(len(self.run_lote([doc(f"C{i}") for i in range(MAX_LOTE_MH)], fetch)), MAX_LOTE_MH)


if __name__ == "__main__":
    unittest.main()
