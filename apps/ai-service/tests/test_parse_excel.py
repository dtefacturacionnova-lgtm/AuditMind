"""Lectura de Excel en `/connectors/parse` (el archivo que sube el portal de CAATs).

El Excel antiguo (.xls) necesita la librería `xlrd`; el nuevo (.xlsx), `openpyxl`. Si falta cualquiera, el portal responde «No se pudo leer el
archivo: Install xlrd >= 2.0.1…». Estas pruebas fallan antes de que eso llegue a producción.

Correr desde apps/ai-service:  venv/Scripts/python.exe -m unittest tests.test_parse_excel -v
"""
import asyncio
import io
import unittest
import warnings
from pathlib import Path

from fastapi import UploadFile

from app.routers.connectors import parse_file

FIXTURES = Path(__file__).parent / "fixtures" / "excel"
COLUMNAS = ["fecha", "usuario", "cuenta", "descripcion", "monto"]


def subir(nombre: str, contenido: bytes) -> dict:
    return asyncio.run(parse_file(file=UploadFile(filename=nombre, file=io.BytesIO(contenido)), header_row=None))


class LecturaDeExcel(unittest.TestCase):
    def setUp(self):
        warnings.simplefilter("ignore")

    def test_excel_antiguo_xls_se_lee_y_detecta_el_encabezado(self):
        r = subir("muestra_libro_mayor.xls", (FIXTURES / "muestra_libro_mayor.xls").read_bytes())
        self.assertEqual(r["columns"], COLUMNAS)
        self.assertEqual(r["rowCount"], 4)
        self.assertEqual(r["headerRowIndex"], 2)          # hay un título y una fila vacía antes del encabezado
        self.assertEqual(r["rows"][0]["usuario"], "usr01")

    def test_excel_nuevo_xlsx_se_lee(self):
        from openpyxl import Workbook

        wb = Workbook()
        ws = wb.active
        ws.append(COLUMNAS)
        ws.append(["2025-03-03", "usr01", "1101-Caja", "Cobro de cliente", 1250.75])
        ws.append(["2025-03-04", "usr02", "2101-Proveedores", "Pago a proveedor", 830.10])
        buf = io.BytesIO()
        wb.save(buf)
        r = subir("muestra.xlsx", buf.getvalue())
        self.assertEqual(r["columns"], COLUMNAS)
        self.assertEqual(r["rowCount"], 2)

    def test_un_archivo_que_no_es_excel_da_un_error_claro(self):
        from fastapi import HTTPException

        with self.assertRaises(HTTPException) as e:
            subir("roto.xls", b"esto no es un excel")
        self.assertEqual(e.exception.status_code, 422)
        self.assertIn("No se pudo leer el archivo", str(e.exception.detail))

    def test_extension_no_permitida(self):
        from fastapi import HTTPException

        with self.assertRaises(HTTPException) as e:
            subir("datos.pdf", b"%PDF")
        self.assertEqual(e.exception.status_code, 400)


if __name__ == "__main__":
    unittest.main()
