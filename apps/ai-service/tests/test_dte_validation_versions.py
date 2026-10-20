import copy
import json
import unittest
from pathlib import Path

from app.services.caats.dte_validation_analysis import analyze_dte_validation

FIXTURES = Path(__file__).parent / "fixtures" / "dte"


def load(version, name):
    return json.loads((FIXTURES / version / name).read_text(encoding="utf-8"))


def findings(report):
    return {f.test_name: f for f in report.findings}


def structural_detail(report):
    f = findings(report).get("STRUCTURAL_SCHEMA")
    return " | ".join(str(r.get("errores", r.get("error", ""))) for r in f.sample_records) if f else ""


class MontosConCentavos(unittest.TestCase):
    """El `multipleOf` de jsonschema usa flotantes y marcaba como inválido cualquier monto con centavos."""

    def test_un_ccf_v2_con_centavos_no_da_error_de_multiplo(self):
        r = analyze_dte_validation([load("v2", "03-ccf.json")])
        self.assertNotIn("multiple", structural_detail(r))
        self.assertNotIn("STRUCTURAL_SCHEMA", findings(r))   # y ya no tiene ningún otro error estructural
        self.assertEqual(r.valid_structure_count, 1)

    def test_los_montos_de_las_notas_y_la_factura_tampoco(self):
        for name in ("01-factura-con-receptor.json", "05-nota-credito.json", "06-nota-debito.json", "11-exportacion.json"):
            r = analyze_dte_validation([load("v2", name)])
            self.assertNotIn("multiple", structural_detail(r), name)

    def test_un_monto_con_mas_decimales_de_los_permitidos_si_se_detecta(self):
        d = load("v2", "03-ccf.json")
        d["resumen"]["totalPagar"] = 4405.825      # el esquema exige múltiplos de 0.01
        r = analyze_dte_validation([d])
        self.assertIn("resumen.totalPagar: 4405.825 is not a multiple of 0.01", structural_detail(r))

    def test_un_monto_con_los_decimales_justos_no_da_error(self):
        d = load("v2", "03-ccf.json")
        d["resumen"]["totalPagar"] = 4405.8
        d["resumen"]["montoTotalOperacion"] = 4405.8
        d["resumen"]["pagos"][0]["montoPago"] = 4405.8
        self.assertNotIn("totalPagar", structural_detail(analyze_dte_validation([d])))


class DocumentosV1(unittest.TestCase):
    V1 = ["01-factura-consumidor-final.json", "03-ccf-con-retencion.json", "05-nota-credito.json", "07-comprobante-retencion.json"]

    def test_un_documento_v1_no_se_valida_contra_los_esquemas_v2(self):
        for name in self.V1:
            r = analyze_dte_validation([load("v1", name)])
            f = findings(r)
            self.assertNotIn("STRUCTURAL_SCHEMA", f, name)
            self.assertNotIn("UNSUPPORTED_DTE_TYPE", f, name)
            self.assertEqual(f["DTE_V1_SIN_ESQUEMA"].risk_level, "LOW", name)
            self.assertEqual(f["DTE_V1_SIN_ESQUEMA"].record_count, 1, name)
            self.assertEqual(r.valid_structure_count, 0, name)    # no se puede afirmar que la estructura sea válida

    def test_el_aviso_v1_nombra_cada_documento_y_su_version_declarada(self):
        r = analyze_dte_validation([load("v1", n) for n in self.V1])
        f = findings(r)["DTE_V1_SIN_ESQUEMA"]
        self.assertEqual(f.record_count, 4)
        self.assertEqual(sorted(s["version_declarada"] for s in f.sample_records), [1, 1, 3, 3])
        self.assertIn("V2.0 es obligatoria desde el 1 de diciembre de 2026", f.description)

    def test_el_sello_de_la_descarga_del_portal_se_reconoce(self):
        r = analyze_dte_validation([load("v1", "01-factura-consumidor-final.json")])
        self.assertNotIn("MISSING_SELLO", findings(r))      # viene en responseMH.selloRecibido

    def test_un_documento_v1_sin_sello_si_se_marca(self):
        d = load("v1", "01-factura-consumidor-final.json")
        del d["responseMH"]
        self.assertIn("MISSING_SELLO", findings(analyze_dte_validation([d])))

    def test_el_sello_v1_con_su_nombre_antiguo_se_reconoce(self):
        d = load("v1", "01-factura-consumidor-final.json")
        del d["responseMH"]
        d["selloRecepcion"] = "01ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789AB"
        self.assertNotIn("MISSING_SELLO", findings(analyze_dte_validation([d])))

    def test_un_documento_v1_roto_si_se_reporta_como_estructura_invalida(self):
        d = load("v1", "03-ccf-con-retencion.json")
        del d["cuerpoDocumento"]
        d["identificacion"]["numeroControl"] = ""
        r = analyze_dte_validation([d])
        detalle = structural_detail(r)
        self.assertIn("falta cuerpoDocumento", detalle)
        self.assertIn("identificacion.numeroControl", detalle)

    def test_el_estado_de_la_respuesta_del_portal_se_lee(self):
        d = load("v1", "01-factura-consumidor-final.json")
        d["responseMH"]["estado"] = "RECHAZADO"
        f = findings(analyze_dte_validation([d]))
        self.assertEqual(f["REJECTED_OR_OBSERVED"].sample_records[0]["estado"], "RECHAZADO")


class DocumentosV2(unittest.TestCase):
    def test_el_sobre_del_portal_no_cuenta_como_campo_de_mas(self):
        # `responseMH` en la raíz hacía fallar el esquema V2.0 («Additional properties are not allowed»)
        d = load("v2", "03-ccf.json")
        d["responseMH"] = {"estado": "PROCESADO", "selloRecibido": "01ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789AB"}
        d["selloRecepcion"] = "x"
        d["Sello Recibido"] = "x"
        d["Firma Electrónica"] = "x"
        r = analyze_dte_validation([d])
        self.assertNotIn("responseMH", structural_detail(r))
        self.assertNotIn("Additional properties", structural_detail(r))
        self.assertNotIn("MISSING_SELLO", findings(r))

    def test_una_version_distinta_de_la_del_tipo_es_una_anomalia_y_no_se_toma_por_v1(self):
        d = load("v2", "01-factura-con-receptor.json")
        d["identificacion"]["version"] = 3         # la factura V2.0 es la 2; la V1, la 1
        r = analyze_dte_validation([d])
        self.assertIn("2 was expected", structural_detail(r))
        self.assertNotIn("DTE_V1_SIN_ESQUEMA", findings(r))
        self.assertEqual(r.summary["v2_count"], 1)

    def test_un_documento_sin_version_se_valida_como_v2_y_la_falta_se_reporta(self):
        d = load("v2", "01-factura-con-receptor.json")
        del d["identificacion"]["version"]
        self.assertIn("'version' is a required property", structural_detail(analyze_dte_validation([d])))

    def test_un_documento_que_no_cumple_el_esquema_v2_sigue_dando_error(self):
        # el ejemplo de retención V2 usa `numeroDocumento` y el esquema oficial pide `numDocumento`
        r = analyze_dte_validation([load("v2", "07-comprobante-retencion.json")])
        self.assertIn("numDocumento", structural_detail(r))


class LoteMixto(unittest.TestCase):
    def test_un_lote_con_ambas_versiones(self):
        lote = [load("v1", "01-factura-consumidor-final.json"), load("v1", "03-ccf-con-retencion.json"), load("v2", "03-ccf.json"), load("v2", "01-factura-con-receptor.json")]
        r = analyze_dte_validation(lote)
        self.assertEqual(r.total_dtes, 4)
        self.assertEqual(r.valid_structure_count, 2)                          # solo los V2 cuya estructura se pudo validar
        self.assertEqual(r.summary["v1_count"], 2)
        self.assertEqual(r.summary["v2_count"], 2)
        self.assertEqual(r.version_breakdown, [{"version": "V2.0", "cantidad": 2}, {"version": "V1", "cantidad": 2}])
        self.assertEqual(findings(r)["DTE_V1_SIN_ESQUEMA"].record_count, 2)

    def test_el_lote_solo_v2_no_trae_aviso_de_v1(self):
        r = analyze_dte_validation([load("v2", "03-ccf.json")])
        self.assertNotIn("DTE_V1_SIN_ESQUEMA", findings(r))
        self.assertEqual(r.version_breakdown, [{"version": "V2.0", "cantidad": 1}, {"version": "V1", "cantidad": 0}])

    def test_los_registros_que_no_son_objetos_no_se_cuentan_como_ninguna_version(self):
        r = analyze_dte_validation([load("v2", "03-ccf.json"), "basura"])
        self.assertEqual(r.summary["v1_count"] + r.summary["v2_count"], 1)
        self.assertIn("STRUCTURAL_SCHEMA", findings(r))

    def test_no_modifica_los_documentos_que_recibe(self):
        d = load("v2", "03-ccf.json")
        d["responseMH"] = {"estado": "PROCESADO", "selloRecibido": "S"}
        copia = copy.deepcopy(d)
        analyze_dte_validation([d])
        self.assertEqual(d, copia)


if __name__ == "__main__":
    unittest.main()
