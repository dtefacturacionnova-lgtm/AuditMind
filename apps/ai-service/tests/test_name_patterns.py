"""Nombres de proveedor genéricos: palabras completas, no subcadenas (ver app/services/caats/name_patterns.py).

Correr desde apps/ai-service:  venv/Scripts/python.exe -m unittest discover -s tests -t . -v
"""
import unittest

from app.services.caats.ap_analysis import analyze_ap
from app.services.caats.name_patterns import is_generic_vendor_name
from app.services.caats.vendor_master_analysis import analyze_vendor_master

# Nombres corrientes que ANTES se marcaban como «fantasma» por contener «na», «temp» o «test» dentro de otra palabra
LEGITIMOS = [
    "Distribuidora Internacional S.A. de C.V.", "Ferretería Nacional", "Panadería La Esperanza", "Comercial Fernández", "Servicios Santa Ana",
    "Corporación Apaneca Pacífico Ltda. de C.V.",   # «corporacion apaneca» cruzaba el límite entre palabras
    "Constructora Díaz", "Contemporánea S.A.", "Atestados y Servicios", "Estación Central", "Papelería Central", "Hernández y Asociados",
    "Santana Hermanos", "Tecnología Avanzada", "Vendedores Unidos", "Proveedores del Sur", "Texto y Prueba S.A.", "Templos de Oro",
]
GENERICOS = [
    "Proveedor Temporal 01", "XXX Servicios", "xxxx", "Test", "TEST SA", "Test1", "N/A", "n/a", "NA", "Na", "Temp", "Temp 2", "Temporal",
    "Proveedor Genérico", "Proveedor Generico", "Vendor 1", "Generic Supplies", "Proveedor2", "Servicios N/A", "Sin nombre N/A",
    "", "   ", None, float("nan"),
]


class NombresGenericos(unittest.TestCase):
    def test_nombres_corrientes_no_se_marcan(self):
        for n in LEGITIMOS:
            self.assertFalse(is_generic_vendor_name(n), f"«{n}» es un nombre normal y no debe marcarse")

    def test_nombres_de_relleno_si_se_marcan(self):
        for n in GENERICOS:
            self.assertTrue(is_generic_vendor_name(n), f"«{n}» es genérico/vacío y debe marcarse")

    def test_ignora_acentos_y_mayusculas(self):
        self.assertTrue(is_generic_vendor_name("PROVEEDOR GENÉRICO"))
        self.assertTrue(is_generic_vendor_name("  proveedor   temporal  "))

    def test_acento_solo_en_la_palabra_clave(self):
        self.assertTrue(is_generic_vendor_name("Genérico S.A."))   # sin quitar el acento, «gen» y «rico» quedarían separadas
        self.assertTrue(is_generic_vendor_name("Temporál"))

    def test_separa_por_signos_ademas_de_espacios(self):
        self.assertTrue(is_generic_vendor_name("XXX-Servicios"))
        self.assertTrue(is_generic_vendor_name("Servicios,Temporal"))
        self.assertTrue(is_generic_vendor_name("Proveedor_Nuevo"))
        self.assertFalse(is_generic_vendor_name("Comercial-Internacional"))

    def test_la_palabra_debe_estar_completa(self):
        self.assertFalse(is_generic_vendor_name("Nacional"))
        self.assertFalse(is_generic_vendor_name("Temporales del Valle"))   # «temporales» no es «temporal»
        self.assertFalse(is_generic_vendor_name("Testigo S.A."))
        self.assertFalse(is_generic_vendor_name("Ox S.A."))                # una «x» suelta no es «xxx»
        self.assertFalse(is_generic_vendor_name("Xx S.A."))                # dos «x» tampoco
        self.assertTrue(is_generic_vendor_name("Xxx S.A."))

    def test_no_cruza_el_limite_entre_palabras(self):
        # «corporacion» + «apaneca» → «...onapaneca» contiene «na», pero son dos palabras distintas
        self.assertFalse(is_generic_vendor_name("Corporación Apaneca"))
        self.assertFalse(is_generic_vendor_name("Inversion Alfa"))
        self.assertFalse(is_generic_vendor_name("Atlas Norte"))

    def test_numeros_al_final_de_la_palabra(self):
        self.assertTrue(is_generic_vendor_name("Test123"))
        self.assertTrue(is_generic_vendor_name("Temp01 Servicios"))
        self.assertFalse(is_generic_vendor_name("Test123abc"))

    def test_n_barra_a_es_una_palabra_aparte(self):
        self.assertTrue(is_generic_vendor_name("Proveedor n/a"))
        self.assertFalse(is_generic_vendor_name("Agencia n/aguas"))        # «n/a» pegado a otra palabra no cuenta


class MotoresConNombresCorrientes(unittest.TestCase):
    def test_cuentas_por_pagar_no_marca_proveedores_normales(self):
        facturas = [
            {"amount": 150 + i, "vendor_id": f"V{i}", "vendor_name": n, "invoice_number": f"F{i}", "invoice_date": f"2025-03-{i + 1:02d}", "payment_date": "2025-04-10"}
            for i, n in enumerate(LEGITIMOS)
        ]
        r = analyze_ap(facturas)
        self.assertNotIn("GHOST_VENDORS", [f.test_name for f in r.findings])

    def test_cuentas_por_pagar_sigue_marcando_los_fantasmas_reales(self):
        nombres = ["Papelería Central", "Proveedor Temporal 01", "XXX Servicios", None, "Ferretería Nacional"]
        facturas = [
            {"amount": 200 + i, "vendor_id": f"V{i}", "vendor_name": n, "invoice_number": f"F{i}", "invoice_date": f"2025-03-{i + 1:02d}", "payment_date": "2025-04-10"}
            for i, n in enumerate(nombres)
        ]
        r = analyze_ap(facturas)
        g = next(f for f in r.findings if f.test_name == "GHOST_VENDORS")
        self.assertEqual(g.record_count, 3)

    def test_maestro_no_marca_identidad_debil_por_el_nombre_de_proveedores_normales(self):
        maestro = [
            {"vendor_id": f"P{i}", "vendor_name": n, "tax_id": f"0614-1{i:05d}-101-{i % 10}", "bank_account": f"2000{i}", "address": f"Calle {i}",
             "status": "Activo", "last_activity_date": "2025-10-01"}
            for i, n in enumerate(LEGITIMOS)
        ]
        r = analyze_vendor_master(maestro)
        self.assertNotIn("WEAK_IDENTITY", [f.test_name for f in r.findings])

    def test_maestro_sigue_marcando_nombre_generico_y_falta_de_nit_y_direccion(self):
        maestro = [
            {"vendor_id": "P1", "vendor_name": "Papelería Central", "tax_id": "0614-100001-101-1", "bank_account": "1", "address": "Calle 1", "status": "Activo", "last_activity_date": "2025-10-01"},
            {"vendor_id": "P2", "vendor_name": "Proveedor Genérico", "tax_id": "0614-100002-101-2", "bank_account": "2", "address": "Calle 2", "status": "Activo", "last_activity_date": "2025-10-01"},
            {"vendor_id": "P3", "vendor_name": "Comercial Lempa", "tax_id": "", "bank_account": "3", "address": "", "status": "Activo", "last_activity_date": "2025-10-01"},
            {"vendor_id": "P4", "vendor_name": "", "tax_id": "0614-100004-101-4", "bank_account": "4", "address": "Calle 4", "status": "Activo", "last_activity_date": "2025-10-01"},
        ]
        r = analyze_vendor_master(maestro)
        w = next(f for f in r.findings if f.test_name == "WEAK_IDENTITY")
        self.assertEqual(w.record_count, 3)
        self.assertEqual({s["vendor_id"] for s in w.sample_records}, {"P2", "P3", "P4"})


if __name__ == "__main__":
    unittest.main()
