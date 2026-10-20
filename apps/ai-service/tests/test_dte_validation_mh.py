import json
import unittest
from pathlib import Path

from app.services.caats.dte_validation_analysis import analyze_dte_validation

FIXTURES = Path(__file__).parent / "fixtures" / "dte"
CODIGO = "4E6FCCB1-1274-4737-A4F3-17FCC56B8999"      # v2/03-ccf.json, total a pagar 4405.82
SELLO = "01ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789AB"


def ccf(**cambios):
    d = json.loads((FIXTURES / "v2" / "03-ccf.json").read_text(encoding="utf-8"))
    d["selloRecibido"] = SELLO
    d.update(cambios)
    return d


def consulta(**campos):
    base = {"codigo_generacion": CODIGO, "estado": "Transmitido Satisfactoriamente", "inconsistencia": False, "observaciones": [],
            "monto_mh": 4405.82, "sello_mh": SELLO}
    return {**base, **campos}


def findings(report):
    return {f.test_name: f for f in report.findings}


class SinConsulta(unittest.TestCase):
    def test_sin_consultas_el_informe_es_el_de_siempre(self):
        r = analyze_dte_validation([ccf()])
        self.assertFalse([n for n in findings(r) if n.startswith("MH_")])
        self.assertIsNone(r.mh_consultados)
        self.assertIsNone(r.mh_confirmados)
        self.assertNotIn("mh_consultados", r.summary)


class ConConsulta(unittest.TestCase):
    def test_documento_que_hacienda_confirma_sin_diferencias(self):
        r = analyze_dte_validation([ccf()], [consulta()])
        self.assertFalse([n for n in findings(r) if n.startswith("MH_")])
        self.assertEqual((r.mh_consultados, r.mh_confirmados), (1, 1))
        self.assertEqual(r.summary["mh_consultados"], 1)

    def test_el_codigo_se_compara_sin_importar_mayusculas(self):
        r = analyze_dte_validation([ccf()], [consulta(codigo_generacion=CODIGO.lower())])
        self.assertEqual(r.mh_confirmados, 1)

    def test_documento_que_hacienda_no_tiene(self):
        r = analyze_dte_validation([ccf()], [consulta(estado="No Encontrado en MH")])
        f = findings(r)["MH_NO_ENCONTRADO"]
        self.assertEqual((f.risk_level, f.record_count), ("CRITICAL", 1))
        self.assertEqual(f.sample_records[0]["codigoGeneracion"], CODIGO)
        self.assertEqual((r.mh_consultados, r.mh_confirmados), (1, 0))      # sí hubo respuesta concluyente: no existe

    def test_estado_adverso_aunque_el_archivo_diga_procesado(self):
        d = ccf(responseMH={"estado": "PROCESADO", "selloRecibido": SELLO})
        f = findings(analyze_dte_validation([d], [consulta(estado="Invalidado")]))["MH_ESTADO_ADVERSO"]
        self.assertEqual(f.risk_level, "HIGH")
        self.assertEqual(f.sample_records[0]["estado_mh"], "Invalidado")
        self.assertEqual(f.sample_records[0]["estado"], "PROCESADO")

    def test_monto_distinto(self):
        f = findings(analyze_dte_validation([ccf()], [consulta(monto_mh=4000.0)]))["MH_MONTO_DIFERENTE"]
        self.assertEqual((f.sample_records[0]["monto_documento"], f.sample_records[0]["monto_mh"]), (4405.82, 4000.0))

    def test_un_centavo_de_diferencia_no_es_diferencia(self):
        self.assertNotIn("MH_MONTO_DIFERENTE", findings(analyze_dte_validation([ccf()], [consulta(monto_mh=4405.83)])))

    def test_sin_monto_del_mh_no_se_compara(self):
        self.assertNotIn("MH_MONTO_DIFERENTE", findings(analyze_dte_validation([ccf()], [consulta(monto_mh=0)])))

    def test_sello_distinto_solo_si_los_dos_existen(self):
        f = findings(analyze_dte_validation([ccf()], [consulta(sello_mh="OTROSELLO")]))["MH_SELLO_DISTINTO"]
        self.assertEqual(f.sample_records[0]["sello_mh"], "OTROSELLO")
        d = ccf()
        del d["selloRecibido"]
        r = analyze_dte_validation([d], [consulta(sello_mh="OTROSELLO")])
        self.assertNotIn("MH_SELLO_DISTINTO", findings(r))        # el archivo sin sello ya lo reporta MISSING_SELLO
        self.assertIn("MISSING_SELLO", findings(r))
        self.assertNotIn("MH_SELLO_DISTINTO", findings(analyze_dte_validation([ccf()], [consulta(sello_mh=SELLO.lower())])))

    def test_inconsistencia_reportada_por_hacienda(self):
        r = analyze_dte_validation([ccf()], [consulta(inconsistencia=True, observaciones=["NIT receptor no coincide"])])
        f = findings(r)["MH_INCONSISTENCIA"]
        self.assertEqual(f.risk_level, "MEDIUM")
        self.assertEqual(r.mh_confirmados, 0)                       # con diferencias ya no cuenta como confirmado limpio

    def test_documento_que_no_se_pudo_consultar(self):
        r = analyze_dte_validation([ccf()], [consulta(estado="Error de conexión MH")])
        f = findings(r)["MH_SIN_CONSULTA"]
        self.assertEqual((f.risk_level, f.record_count), ("LOW", 1))
        self.assertEqual((r.mh_consultados, r.mh_confirmados), (0, 0))      # sin respuesta no es una conclusión

    def test_documento_sin_su_consulta_en_la_lista(self):
        r = analyze_dte_validation([ccf()], [])
        self.assertEqual(findings(r)["MH_SIN_CONSULTA"].sample_records[0]["estado"], "(sin código de generación para consultar)")

    def test_el_riesgo_sube_con_los_hallazgos_de_hacienda(self):
        sin = analyze_dte_validation([ccf()])
        con = analyze_dte_validation([ccf()], [consulta(estado="No Encontrado en MH")])
        self.assertGreater(con.risk_score, sin.risk_score)

    def test_un_lote_mixto(self):
        v1 = json.loads((FIXTURES / "v1" / "01-factura-consumidor-final.json").read_text(encoding="utf-8"))
        cod_v1 = v1["identificacion"]["codigoGeneracion"]
        r = analyze_dte_validation(
            [ccf(), v1],
            [consulta(), {"codigo_generacion": cod_v1, "estado": "Anulado", "monto_mh": 1869.14, "sello_mh": ""}],
        )
        self.assertEqual((r.mh_consultados, r.mh_confirmados), (2, 1))
        self.assertEqual(findings(r)["MH_ESTADO_ADVERSO"].record_count, 1)


if __name__ == "__main__":
    unittest.main()
