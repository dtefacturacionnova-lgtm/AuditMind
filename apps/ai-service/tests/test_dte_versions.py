import unittest

from app.services.caats.dte_versions import (
    ENVELOPE_KEYS, V1_VERSION_BY_TIPO, V2_VERSION_BY_TIPO, detect_dte_version, extract_firma, extract_respuesta,
    extract_sello, is_confirmed_v1, v1_structure_problems,
)


def doc(tipo="01", version=None, **extra):
    iden = {"tipoDte": tipo}
    if version is not None:
        iden["version"] = version
    return {"identificacion": iden, **extra}


class DetectarVersion(unittest.TestCase):
    def test_cada_tipo_se_reconoce_por_su_version_exacta(self):
        for tipo, v in V2_VERSION_BY_TIPO.items():
            d = detect_dte_version(doc(tipo, v))
            self.assertEqual((d.version, d.reason, d.confidence), ("v2", "version_exacta_v2", "high"), tipo)
        for tipo, v in V1_VERSION_BY_TIPO.items():
            d = detect_dte_version(doc(tipo, v))
            self.assertEqual((d.version, d.reason, d.confidence), ("v1", "version_exacta_v1", "high"), tipo)

    def test_las_versiones_se_distinguen_por_tipo(self):
        # La «versión 3» es V1 para el CCF y V2.0 para la factura de exportación; la «4» solo existe en la V2.0.
        self.assertEqual(detect_dte_version(doc("03", 3)).version, "v1")
        self.assertEqual(detect_dte_version(doc("11", 3)).version, "v2")
        self.assertEqual(detect_dte_version(doc("03", 4)).version, "v2")

    def test_la_version_puede_venir_como_texto(self):
        self.assertEqual(detect_dte_version(doc("01", "2")).version, "v2")
        self.assertEqual(detect_dte_version(doc("01", "1")).version, "v1")

    def test_version_que_no_es_de_ningun_formato_se_apoya_en_el_distrito(self):
        con_distrito = doc("01", 9, emisor={"direccion": {"distrito": "01"}})
        d = detect_dte_version(con_distrito)
        self.assertEqual((d.version, d.reason, d.confidence), ("v2", "distrito", "medium"))
        d = detect_dte_version(doc("01", 9, receptor={"direccion": {"distrito": "05"}}))
        self.assertEqual(d.reason, "distrito")

    def test_sin_senales_es_v1_con_confianza_baja_y_no_cuenta_como_v1_confirmada(self):
        d = detect_dte_version(doc("01"))
        self.assertEqual((d.version, d.reason, d.confidence), ("v1", "sin_senales", "low"))
        self.assertFalse(is_confirmed_v1(d))
        self.assertFalse(is_confirmed_v1(detect_dte_version(doc("01", 9))))   # versión rara: no es V1 confirmada
        self.assertTrue(is_confirmed_v1(detect_dte_version(doc("01", 1))))

    def test_entradas_que_no_son_un_documento(self):
        for raro in (None, [], "texto", 5):
            self.assertEqual(detect_dte_version(raro).reason, "no_es_objeto")
        self.assertEqual(detect_dte_version({"identificacion": "x"}).reason, "sin_senales")
        self.assertEqual(detect_dte_version(doc("01", True)).reason, "sin_senales")   # un booleano no es un número de versión


class LecturaDeCampos(unittest.TestCase):
    def test_sello_en_todos_los_lugares_y_nombres(self):
        self.assertEqual(extract_sello({"responseMH": {"selloRecibido": "A"}}), "A")          # descarga del portal
        self.assertEqual(extract_sello({"responseMH": {"selloRecepcion": "B"}}), "B")
        self.assertEqual(extract_sello({"respuestaHacienda": {"selloRecibido": "C"}}), "C")
        self.assertEqual(extract_sello({"selloRecibido": "D"}), "D")                            # V2.0 en la raíz
        self.assertEqual(extract_sello({"Sello Recibido": "E"}), "E")                           # forma errónea
        self.assertEqual(extract_sello({"selloRecepcion": "F"}), "F")                           # V1
        self.assertEqual(extract_sello({"sello": " G "}), "G")
        self.assertIsNone(extract_sello({"selloRecibido": "  ", "responseMH": {"selloRecibido": None}}))
        self.assertIsNone(extract_sello(None))

    def test_respuesta_del_mh(self):
        self.assertEqual(extract_respuesta({"responseMH": {"estado": "PROCESADO"}}), {"estado": "PROCESADO"})
        self.assertEqual(extract_respuesta({"respuestaHacienda": {"estado": "RECHAZADO"}, "responseMH": {"estado": "X"}}), {"estado": "RECHAZADO"})
        self.assertEqual(extract_respuesta({"responseMH": "texto"}), {})
        self.assertEqual(extract_respuesta({}), {})

    def test_firma(self):
        self.assertEqual(extract_firma({"firmaElectronica": "a.b.c"}), "a.b.c")
        self.assertEqual(extract_firma({"Firma Electrónica": "x.y.z"}), "x.y.z")
        self.assertIsNone(extract_firma({"firmaElectronica": " "}))

    def test_el_sobre_incluye_todos_los_nombres(self):
        for clave in ("respuestaHacienda", "responseMH", "firmaElectronica", "Firma Electrónica", "selloRecibido", "Sello Recibido", "selloRecepcion", "sello"):
            self.assertIn(clave, ENVELOPE_KEYS)


class EstructuraMinimaV1(unittest.TestCase):
    def completo(self, tipo="03"):
        return {
            "identificacion": {"tipoDte": tipo, "codigoGeneracion": "ABC", "numeroControl": "DTE-03-X", "fecEmi": "2026-05-01"},
            "emisor": {}, "receptor": {}, "cuerpoDocumento": [{}], "resumen": {},
        }

    def test_un_documento_completo_no_tiene_problemas(self):
        for tipo in ("01", "03", "05", "07"):
            self.assertEqual(v1_structure_problems(self.completo(tipo), tipo), [], tipo)

    def test_falta_lo_esencial(self):
        d = self.completo()
        del d["cuerpoDocumento"]
        self.assertEqual(v1_structure_problems(d, "03"), ["falta cuerpoDocumento"])
        d = self.completo()
        d["identificacion"]["numeroControl"] = ""
        self.assertIn("identificacion.numeroControl vacío o ausente", v1_structure_problems(d, "03"))
        self.assertEqual(v1_structure_problems({}, "03"), ["falta el bloque identificacion"])

    def test_la_factura_puede_no_tener_receptor_y_el_dcl_no_tiene_resumen(self):
        d = self.completo("01")
        d["receptor"] = None
        self.assertEqual(v1_structure_problems(d, "01"), [])
        d = self.completo("09")
        d["cuerpoDocumento"] = {"liquidoApagar": 1}
        del d["resumen"]
        self.assertEqual(v1_structure_problems(d, "09"), [])

    def test_el_ccf_si_exige_receptor_y_resumen(self):
        d = self.completo("03")
        d["receptor"] = None
        del d["resumen"]
        problemas = v1_structure_problems(d, "03")
        self.assertIn("falta el bloque receptor", problemas)
        self.assertIn("falta el bloque resumen", problemas)

    def test_sujeto_excluido_y_donacion_de_la_v1_no_se_juzgan_por_bloques_de_la_v2(self):
        for tipo in ("14", "15"):
            d = self.completo(tipo)
            del d["emisor"], d["receptor"], d["resumen"]
            self.assertEqual(v1_structure_problems(d, tipo), [], tipo)


if __name__ == "__main__":
    unittest.main()
