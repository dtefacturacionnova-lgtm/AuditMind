# -*- coding: utf-8 -*-
"""Genera bases SINTÉTICAS para probar el portal de CAATs (Analytics y el papel PT-B4).

Todo es ficticio: empresas, personas, NIT, cuentas y direcciones se inventan aquí. La única excepción son los nombres de la prueba de
sanciones, que son entidades públicas de las listas oficiales (OFAC/ONU) para poder comprobar coincidencias.

Cada archivo trae anomalías SEMBRADAS a propósito (y su correspondiente conjunto «limpio»), para que cada prueba del motor tenga algo que
detectar. El detalle está en LEEME.md. La semilla es fija: ejecutar el script otra vez regenera exactamente los mismos archivos.

    python Ejemplosdemo/caats/generar_datos_sinteticos.py
"""
import base64
import copy
import csv
import json
import os
import random
import uuid
from datetime import date, datetime, timedelta

AQUI = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(AQUI, "..", ".."))
FIXTURE_DTE = os.path.join(ROOT, "apps", "ai-service", "tests", "fixtures", "dte", "v2", "01-factura-con-receptor.json")
SEED = 20251231
rng = random.Random(SEED)

PROHIBIDAS = ("na", "test", "temp", "xxx", "vendor", "proveedor", "generic", "generico", "temporal", "n/a")


def limpio(nombre: str) -> bool:
    """Nombre que NO dispara los patrones de «proveedor fantasma» (que buscan subcadenas como «na» o «temp»).

    Se comprueba de tres formas porque los motores no normalizan igual: tal cual, sin acentos, y sin acentos ni espacios (el Maestro de
    Proveedores colapsa los espacios, así que «Corporación Apaneca» se vuelve «corporacionapaneca» y contiene «na» entre las dos palabras)."""
    import unicodedata

    low = nombre.lower()
    sin_acentos = "".join(c for c in unicodedata.normalize("NFD", low) if unicodedata.category(c) != "Mn")
    compacto = "".join(ch for ch in sin_acentos if ch.isalnum() or ch == "/")
    return not any(p in v for v in (low, sin_acentos, compacto) for p in PROHIBIDAS)


# ── Catálogos ficticios ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
PREFIJOS = ["Distribuidora", "Servicios", "Comercial", "Suministros", "Importadora", "Grupo", "Corporación", "Soluciones"]
NUCLEOS = ["Cuscatlán", "Lempa", "Izalco", "Torogoz", "Quetzal", "Volcán", "Atlacatl", "Apaneca", "Jiboa", "Cuzcachapa"]
COLAS = ["Centro", "Norte", "Oriente", "Occidente", "Sur", "Pacífico"]
SUFIJOS = ["S.A. de C.V.", "S.A. de C.V.", "Ltda. de C.V."]
NOMBRES = ["Carlos", "José", "Luis", "Mario", "Roberto", "Sofía", "Rosa", "Marta", "Jorge", "Ricardo", "Lucía", "Pedro", "Patricia", "Óscar",
           "Karla", "Ernesto", "Silvia", "Mauricio", "Beatriz", "Rafael", "Claudia", "Walter", "Gloria", "Héctor"]
APELLIDOS = ["Mejía", "Quintanilla", "Rivera", "Alvarado", "Mendoza", "Cruz", "Rodríguez", "Flores", "Castillo", "Villalta", "Menjívar",
             "Portillo", "Guardado", "Zelaya", "Chávez", "Barrera", "Rauda", "Campos", "Aguilar", "Escobar", "Lazo", "Pineda"]


# Nombres corrientes que antes se marcaban como «proveedor fantasma» (riesgo crítico) por contener «na», «temp» o «test» dentro de otra palabra.
# Van como proveedores NORMALES en las bases de Cuentas por Pagar y Maestro de Proveedores: los motores NO deben marcarlos.
NOMBRES_TRAMPA = ["Distribuidora Internacional S.A. de C.V.", "Ferretería Nacional S.A. de C.V.", "Panadería La Esperanza", "Servicios Santa Ana S.A. de C.V.",
                  "Corporación Apaneca Ltda. de C.V."]


def empresas(n: int) -> list:
    bases = [f"{p} {c} {t}" for p in PREFIJOS for c in NUCLEOS for t in COLAS]
    rng.shuffle(bases)
    out = []
    for base in bases:
        nombre = f"{base} {SUFIJOS[len(out) % len(SUFIJOS)]}"  # los sufijos se reparten para que no todas terminen igual
        if limpio(nombre):
            out.append(nombre)
        if len(out) == n:
            break
    assert len(out) == n, "no hay suficientes nombres limpios"
    return out


def personas(n: int) -> list:
    todas = [f"{a} {b}" for a in NOMBRES for b in APELLIDOS]
    todas = [p for p in todas if limpio(p)]
    rng.shuffle(todas)
    return todas[:n]


def nit() -> str:
    return f"0614-{rng.randint(100000, 311299):06d}-{rng.randint(100, 999)}-{rng.randint(0, 9)}"


def cuenta_banco() -> str:
    return "".join(str(rng.randint(0, 9)) for _ in range(14))


def direccion() -> str:
    return f"{rng.randint(1, 99)}a Calle {rng.choice(['Poniente', 'Oriente'])} #{rng.randint(100, 999)}, {rng.choice(['San Salvador', 'Santa Tecla', 'Soyapango', 'San Miguel', 'Santa Ana', 'Sonsonate'])}"


def dia_habil(desde: date, hasta: date) -> date:
    while True:
        d = desde + timedelta(days=rng.randint(0, (hasta - desde).days))
        if d.weekday() < 5:
            return d


def iso(d) -> str:
    return d.strftime("%Y-%m-%d")


def monto(lo: float, hi: float) -> float:
    return round(rng.uniform(lo, hi), 2)


def escribir(nombre: str, columnas: list, filas: list) -> None:
    ruta = os.path.join(AQUI, nombre)
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    with open(ruta, "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(columnas)
        for fila in filas:
            w.writerow([fila.get(c, "") for c in columnas])
    print(f"  {nombre}: {len(filas)} filas")


EJ_INI, EJ_FIN = date(2025, 1, 1), date(2025, 12, 31)


# ── 01 Libro Mayor ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
def libro_mayor():
    usuarios = [f"usr{n:02d}" for n in range(1, 12)]
    cuentas = ["1101-Caja", "1102-Bancos", "1201-CxC", "1301-Inventarios", "2101-Proveedores", "4101-Ventas", "5101-Costo de ventas", "6101-Gastos de operación"]
    desc = ["Registro de venta", "Pago a proveedor", "Cobro de cliente", "Compra de mercadería", "Gasto de operación", "Ajuste de inventario", "Planilla mensual"]
    filas = []

    def asiento(fecha, hora, usuario, m):
        filas.append({"fecha": iso(fecha), "hora": hora, "usuario": usuario, "cuenta": rng.choice(cuentas), "descripcion": rng.choice(desc), "monto": m})

    # normales: días hábiles, 08:00–17:59, montos con centavos (nunca redondos), repartidos entre 11 usuarios
    for _ in range(560):
        asiento(dia_habil(EJ_INI, date(2025, 12, 24)), f"{rng.randint(8, 17):02d}:{rng.randint(0, 59):02d}", rng.choice(usuarios), monto(40, 9000))
    # HIGH_VOLUME_USER: un usuario administrador concentra muchísimos asientos
    for _ in range(450):
        asiento(dia_habil(EJ_INI, date(2025, 12, 24)), f"{rng.randint(8, 17):02d}:{rng.randint(0, 59):02d}", "admin_ti", monto(40, 9000))
    # ROUND_AMOUNTS: múltiplos exactos de 1,000
    for _ in range(60):
        asiento(dia_habil(EJ_INI, date(2025, 12, 24)), f"{rng.randint(9, 16):02d}:{rng.randint(0, 59):02d}", rng.choice(usuarios), float(rng.choice([1000, 2000, 3000, 5000, 8000, 10000, 15000, 25000])))
    # END_OF_PERIOD: últimos 3 días del período (29–31 dic)
    for _ in range(130):
        asiento(date(2025, 12, rng.choice([29, 30, 31])), f"{rng.randint(8, 17):02d}:{rng.randint(0, 59):02d}", rng.choice(usuarios), monto(200, 12000))
    # DUPLICATE_AMOUNT_USER: mismo usuario, mismo monto exacto, dos veces
    for _ in range(9):
        m, u = monto(1500, 7000), rng.choice(usuarios)
        for _ in range(2):
            asiento(dia_habil(EJ_INI, date(2025, 12, 24)), f"{rng.randint(8, 17):02d}:{rng.randint(0, 59):02d}", u, m)
    # WEEKEND_ENTRIES
    for _ in range(16):
        d = dia_habil(EJ_INI, date(2025, 12, 20))
        d = d + timedelta(days=5 - d.weekday() + rng.choice([0, 1]))
        asiento(d, f"{rng.randint(9, 15):02d}:{rng.randint(0, 59):02d}", rng.choice(usuarios), monto(300, 9000))
    # OFF_HOURS_ENTRIES: entre semana pero de madrugada o de noche
    for _ in range(90):
        asiento(dia_habil(EJ_INI, date(2025, 12, 24)), f"{rng.choice([0, 1, 2, 3, 4, 5, 22, 23]):02d}:{rng.randint(0, 59):02d}", rng.choice(usuarios), monto(300, 9000))
    rng.shuffle(filas)
    escribir("01_libro_mayor.csv", ["fecha", "hora", "usuario", "cuenta", "descripcion", "monto"], filas)


# ── 02 Cuentas por pagar ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
def cuentas_por_pagar():
    provs = empresas(40)
    ids = {p: f"P{n:03d}" for n, p in enumerate(provs, 1)}
    filas, n = [], 0

    def factura(prov, fecha, m, dias_pago=None, nombre=None, pid=None):
        nonlocal n
        n += 1
        pago = fecha + timedelta(days=dias_pago if dias_pago is not None else rng.randint(25, 45))
        filas.append({"numero_factura": f"F-{n:05d}", "vendor_id": pid or ids[prov], "nombre_proveedor": prov if nombre is None else nombre,
                      "fecha_factura": iso(fecha), "fecha_pago": iso(pago), "monto": m})

    top3 = provs[:3]
    # concentración: 3 proveedores concentran más de la mitad del gasto
    for p in top3:
        for _ in range(34):
            factura(p, dia_habil(EJ_INI, EJ_FIN), monto(6000, 9500))
    for p in provs[3:]:
        for _ in range(rng.randint(3, 6)):
            factura(p, dia_habil(EJ_INI, EJ_FIN), monto(300, 4500))
    # proveedores con nombres corrientes que antes daban falso positivo de «fantasma»: facturas normales, NO deben marcarse
    for k, p in enumerate(NOMBRES_TRAMPA):
        ids[p] = f"P{950 + k}"
        for _ in range(3):
            factura(p, dia_habil(EJ_INI, EJ_FIN), monto(300, 2500))
    # DUPLICATE_INVOICES: mismo proveedor y monto, facturas distintas
    for p in provs[10:16]:
        m = monto(1200, 4000)
        f1 = dia_habil(EJ_INI, date(2025, 11, 30))
        factura(p, f1, m)
        factura(p, f1 + timedelta(days=rng.randint(1, 6)), m)
    # INVOICE_SPLITTING: tres facturas del mismo proveedor en pocos días, cada una bajo el umbral de 10,000, que suman más del 95%
    for p, base in [(provs[20], date(2025, 3, 10)), (provs[21], date(2025, 8, 18))]:
        for k in range(3):
            factura(p, base + timedelta(days=k * 2), round(3300 + rng.uniform(0, 40), 2))
    # GHOST_VENDORS: nombre genérico o vacío
    factura("Proveedor Temporal 01", date(2025, 5, 14), 4800.0, pid="P901")
    factura("XXX Servicios", date(2025, 6, 2), 3900.0, pid="P902")
    factura("", date(2025, 9, 9), 2750.0, pid="P903", nombre="")
    # pagos fuera de término: antes de la factura y a más de 90 días
    for p in provs[25:30]:
        factura(p, dia_habil(date(2025, 2, 1), date(2025, 10, 31)), monto(500, 3000), dias_pago=-rng.randint(2, 9))
    for p in provs[30:38]:
        factura(p, dia_habil(date(2025, 1, 5), date(2025, 7, 31)), monto(500, 3000), dias_pago=rng.randint(100, 150))
    rng.shuffle(filas)
    escribir("02_cuentas_por_pagar.csv", ["numero_factura", "vendor_id", "nombre_proveedor", "fecha_factura", "fecha_pago", "monto"], filas)


# ── 03 Nómina ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
def nomina():
    nombres = personas(130)
    deptos = {"Administración": (900, 1900), "Ventas": (800, 1700), "Operaciones": (700, 1400), "Finanzas": (1100, 2200), "TI": (1200, 2400)}
    aprobadores = ["G. Contreras", "L. Pacheco", "R. Valle", "S. Arévalo"]
    filas = []
    for i in range(110):
        dep = rng.choice(list(deptos))
        bruto = round(rng.uniform(*deptos[dep]), 2)
        filas.append({"id_empleado": f"E{i + 1:04d}", "nombre_empleado": nombres[i], "departamento": dep, "cargo": f"Analista {dep}",
                      "salario_bruto": bruto, "salario_neto": round(bruto * rng.uniform(0.80, 0.88), 2), "aprobado_por": rng.choice(aprobadores) if i % 4 else "G. Contreras",
                      "cuenta_bancaria": cuenta_banco()})
    # APPROVER_CONCENTRATION: un solo aprobador autoriza casi todo
    for f in filas[: int(len(filas) * 0.7)]:
        f["aprobado_por"] = "G. Contreras"
    # GHOST_EMPLOYEES: sin nombre
    for k, i in enumerate((101, 102, 103)):
        filas.append({"id_empleado": f"E{i + 1:04d}", "nombre_empleado": "", "departamento": "Operaciones", "cargo": "Auxiliar", "salario_bruto": 950.0 + k * 10,
                      "salario_neto": 800.0, "aprobado_por": "G. Contreras", "cuenta_bancaria": cuenta_banco()})
    # PAY_OUTLIERS: salarios muy fuera de la distribución
    for i, extra in ((104, 15500.0), (105, 17200.0)):
        filas.append({"id_empleado": f"E{i + 1:04d}", "nombre_empleado": nombres[i], "departamento": "Finanzas", "cargo": "Consultor", "salario_bruto": extra,
                      "salario_neto": round(extra * 0.84, 2), "aprobado_por": "L. Pacheco", "cuenta_bancaria": cuenta_banco()})
    # NET_EXCEEDS_GROSS
    for i in (106, 107, 108):
        b = 1200.0 + i
        filas.append({"id_empleado": f"E{i + 1:04d}", "nombre_empleado": nombres[i], "departamento": "Ventas", "cargo": "Vendedor", "salario_bruto": b,
                      "salario_neto": round(b * 1.15, 2), "aprobado_por": "R. Valle", "cuenta_bancaria": cuenta_banco()})
    # SHARED_BANK_ACCOUNTS: dos «empleados» distintos cobran en la misma cuenta
    comun = cuenta_banco()
    for i in (109, 110):
        filas.append({"id_empleado": f"E{i + 1:04d}", "nombre_empleado": nombres[i], "departamento": "Operaciones", "cargo": "Operario", "salario_bruto": 880.0,
                      "salario_neto": 745.0, "aprobado_por": "S. Arévalo", "cuenta_bancaria": comun})
    rng.shuffle(filas)
    escribir("03_nomina.csv", ["id_empleado", "nombre_empleado", "departamento", "cargo", "salario_bruto", "salario_neto", "aprobado_por", "cuenta_bancaria"], filas)


# ── 04 Benford ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
def benford():
    import math

    # natural: montos que crecen en órdenes de magnitud (log-uniforme) siguen la ley de Benford
    filas = [{"referencia": f"TX-{i:05d}", "monto": round(10 ** rng.uniform(1.0, 5.0), 2)} for i in range(1, 1201)]
    escribir("04a_benford_natural.csv", ["referencia", "monto"], filas)
    # manipulado: montos «inventados» que empiezan casi siempre por 5–9 (y muchos en 7 y 9)
    filas = []
    for i in range(1, 501):
        d = rng.choices([1, 2, 3, 4, 5, 6, 7, 8, 9], weights=[4, 4, 4, 5, 12, 14, 26, 14, 21])[0]
        filas.append({"referencia": f"TX-{i:05d}", "monto": round(d * 10 ** rng.randint(2, 4) + rng.uniform(0, 10 ** rng.randint(2, 4) * 0.99), 2) if False else round((d + rng.random() * 0.99) * 10 ** rng.randint(2, 4), 2)})
    escribir("04b_benford_manipulado.csv", ["referencia", "monto"], filas)


# ── 05 Anomalías (ML) ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
def anomalias():
    filas = []
    for i in range(1, 421):
        q = rng.randint(1, 40)
        precio = rng.uniform(8, 60)
        filas.append({"referencia": f"TX-{i:05d}", "monto": round(q * precio, 2), "cantidad": q, "descuento_pct": round(rng.uniform(0, 8), 1), "dias_credito": rng.choice([0, 15, 30, 30, 45])})
    # combinaciones multivariadas inusuales (monto altísimo con cantidad mínima, descuentos enormes, crédito larguísimo)
    raros = [(48000.0, 1, 0.0, 30), (52000.0, 2, 1.0, 0), (310.0, 40, 55.0, 30), (95.0, 35, 60.0, 15), (1800.0, 3, 2.0, 365), (2200.0, 4, 1.5, 400),
             (76000.0, 1, 0.0, 30), (41000.0, 1, 3.0, 45), (260.0, 38, 48.0, 0), (89000.0, 2, 0.0, 365), (150.0, 30, 70.0, 30), (66000.0, 1, 0.0, 0)]
    for k, (m, q, d, c) in enumerate(raros):
        filas.append({"referencia": f"TX-{500 + k:05d}", "monto": m, "cantidad": q, "descuento_pct": d, "dias_credito": c})
    rng.shuffle(filas)
    escribir("05_anomalias_transacciones.csv", ["referencia", "monto", "cantidad", "descuento_pct", "dias_credito"], filas)


# ── 06 Segregación de funciones ──────────────────────────────────────────────────────────────────────────────────────────────────────
def sod():
    gente = personas(40)
    inocuos = ["Consultar reportes", "Registrar asiento contable", "Emitir factura", "Cargar inventario", "Consultar saldos de clientes", "Preparar conciliación (solo lectura)"]
    filas = []

    def dar(uid, nombre, depto, permisos):
        for p in permisos:
            filas.append({"usuario": uid, "nombre_completo": nombre, "departamento": depto, "permiso": p})

    for i in range(26):
        dar(f"u{i + 1:03d}", gente[i], rng.choice(["Finanzas", "Ventas", "Operaciones", "Bodega"]), rng.sample(inocuos, rng.randint(1, 2)))
    # conflictos del catálogo
    dar("u101", gente[26], "Compras", ["Crear proveedor", "Aprobar pago", "Consultar reportes"])                       # crear proveedor + aprobar pago
    dar("u102", gente[27], "Contabilidad", ["Registrar asiento contable", "Conciliar banco"])                             # asientos + conciliar
    dar("u103", gente[28], "Recursos Humanos", ["Procesar nómina", "Aprobar nómina"])                                     # nómina
    dar("u104", gente[29], "TI", ["Administrar usuarios", "Aprobar transacciones"])                                       # admin + aprobación
    dar("u105", gente[30], "Compras", ["Crear orden de compra", "Aprobar orden de compra"])                               # misma orden
    dar("u106", gente[31], "Ventas", ["Crear cliente", "Aplicar nota de crédito"])                                        # cliente + nota de crédito
    # concentración de accesos sensibles (3+ categorías) sin un par catalogado puntual
    dar("u107", gente[32], "Gerencia", ["Crear proveedor", "Conciliar banco", "Registrar asiento contable", "Crear orden de compra"])
    dar("u108", gente[33], "TI", ["Administrar usuarios", "Registrar asiento contable", "Crear cliente"])
    rng.shuffle(filas)
    escribir("06_matriz_accesos_sod.csv", ["usuario", "nombre_completo", "departamento", "permiso"], filas)


# ── 07 Maestro de proveedores ────────────────────────────────────────────────────────────────────────────────────────────────────────
def maestro_proveedores():
    provs = empresas(90)
    filas = []
    for i, p in enumerate(provs[:80], 1):
        filas.append({"vendor_id": f"P{i:03d}", "nombre_proveedor": p, "nit": nit(), "cuenta_bancaria": cuenta_banco(), "direccion": direccion(),
                      "estado": "Activo", "ultima_actividad": iso(date(2025, 12, 31) - timedelta(days=rng.randint(1, 80)))})
    # DUPLICATE_TAX_ID: dos proveedores distintos con el mismo NIT
    for a, b in ((3, 41), (7, 52), (12, 66)):
        filas[b]["nit"] = filas[a]["nit"]
    # DUPLICATE_BANK_ACCOUNT: misma cuenta bancaria
    for a, b in ((5, 30), (20, 71)):
        filas[b]["cuenta_bancaria"] = filas[a]["cuenta_bancaria"]
    # DUPLICATE_ADDRESS (señal débil)
    for a, b in ((9, 33), (15, 60)):
        filas[b]["direccion"] = filas[a]["direccion"]
    # INACTIVE_WITH_RECENT_ACTIVITY: marcado inactivo pero con movimiento reciente
    for i in (2, 14, 27, 45, 63):
        filas[i]["estado"] = "Inactivo"
        filas[i]["ultima_actividad"] = iso(date(2025, 12, 31) - timedelta(days=rng.randint(2, 30)))
    # proveedores inactivos legítimos (sin movimiento reciente): no deben alertar
    for i in (70, 75):
        filas[i]["estado"] = "Inactivo"
        filas[i]["ultima_actividad"] = iso(date(2025, 3, 1))
    # nombres corrientes que antes daban falso positivo de «identidad débil»: con NIT y dirección completos, NO deben marcarse
    for k, nombre in enumerate(NOMBRES_TRAMPA):
        filas.append({"vendor_id": f"P95{k}", "nombre_proveedor": nombre, "nit": nit(), "cuenta_bancaria": cuenta_banco(), "direccion": direccion(),
                      "estado": "Activo", "ultima_actividad": iso(date(2025, 12, 31) - timedelta(days=rng.randint(1, 80)))})
    # WEAK_IDENTITY: nombre genérico o sin NIT ni dirección
    filas.append({"vendor_id": "P901", "nombre_proveedor": "Proveedor Genérico", "nit": nit(), "cuenta_bancaria": cuenta_banco(), "direccion": direccion(), "estado": "Activo", "ultima_actividad": "2025-11-20"})
    filas.append({"vendor_id": "P902", "nombre_proveedor": provs[80], "nit": "", "cuenta_bancaria": cuenta_banco(), "direccion": "", "estado": "Activo", "ultima_actividad": "2025-10-02"})
    filas.append({"vendor_id": "P903", "nombre_proveedor": provs[81], "nit": "", "cuenta_bancaria": cuenta_banco(), "direccion": "", "estado": "Activo", "ultima_actividad": "2025-09-12"})
    escribir("07_maestro_proveedores.csv", ["vendor_id", "nombre_proveedor", "nit", "cuenta_bancaria", "direccion", "estado", "ultima_actividad"], filas)


# ── 08 Partes relacionadas (dos archivos) ────────────────────────────────────────────────────────────────────────────────────────────
def partes_relacionadas():
    provs = empresas(60)
    nits = {p: nit() for p in provs}
    reg = []
    # registro de partes relacionadas: accionistas, directores, familiares, filiales y empleados
    socios = [("Mauricio Escobar Lazo", "Accionista", "0614-150280-102-4"), ("Rosa Villalta Rauda", "Director", "0614-220375-101-8"),
              ("Inversiones Quetzal Occidente S.A. de C.V.", "Filial", nits[provs[0]]), ("Distribuidora Atlacatl Norte S.A. de C.V.", "Familiar", "0614-100100-101-1"),
              ("Comercial Jiboa Sur S.A. de C.V.", "Filial", "")]
    for nombre, rel, n in socios:
        reg.append({"nombre": nombre, "relacion": rel, "nit": n})
    empleados = personas(12)
    for e in empleados[:8]:
        reg.append({"nombre": e, "relacion": "Empleado", "nit": nit()})
    escribir("08b_registro_partes_relacionadas.csv", ["nombre", "relacion", "nit"], reg)

    filas = []
    for i, p in enumerate(provs[1:], 1):
        for _ in range(rng.randint(1, 4)):
            filas.append({"vendor_id": f"P{i:03d}", "nombre_proveedor": p, "nit": nits[p], "fecha": iso(dia_habil(EJ_INI, EJ_FIN)), "monto": monto(300, 9000)})
    # coincidencia por NIT: la contraparte tiene el NIT de una parte relacionada aunque otro nombre
    filas.append({"vendor_id": "P801", "nombre_proveedor": "Servicios Lempa Pacífico S.A. de C.V.", "nit": nits[provs[0]], "fecha": "2025-06-12", "monto": 18500.0})
    filas.append({"vendor_id": "P802", "nombre_proveedor": "Mauricio Escobar", "nit": "0614-150280-102-4", "fecha": "2025-08-03", "monto": 7200.0})
    # coincidencia por nombre (sin NIT que la confirme)
    filas.append({"vendor_id": "P803", "nombre_proveedor": "Distribuidora Atlacatl Norte S.A. de C.V.", "nit": "", "fecha": "2025-09-17", "monto": 11300.0})
    filas.append({"vendor_id": "P804", "nombre_proveedor": "Comercial Jiboa Sur S.A. de C.V.", "nit": "", "fecha": "2025-10-21", "monto": 4900.0})
    # empleado como contraparte (participación oculta)
    filas.append({"vendor_id": "P805", "nombre_proveedor": empleados[2], "nit": "", "fecha": "2025-07-08", "monto": 3600.0})
    filas.append({"vendor_id": "P806", "nombre_proveedor": empleados[5], "nit": "", "fecha": "2025-11-04", "monto": 2400.0})
    rng.shuffle(filas)
    escribir("08a_partes_relacionadas_transacciones.csv", ["vendor_id", "nombre_proveedor", "nit", "fecha", "monto"], filas)


# ── 09 Gastos de representación ──────────────────────────────────────────────────────────────────────────────────────────────────────
def gastos():
    emp = personas(40)
    cats = ["Alimentación", "Transporte", "Hospedaje", "Atención a clientes", "Combustible"]
    filas = []

    def gasto(i, fecha, m, aprob="G. Contreras"):
        filas.append({"id_empleado": f"E{i + 1:03d}", "nombre_empleado": emp[i], "fecha": iso(fecha), "categoria": rng.choice(cats), "monto": m, "aprobado_por": aprob})

    for _ in range(280):
        i = rng.randrange(4, 40)
        gasto(i, dia_habil(EJ_INI, EJ_FIN), monto(8, 70))
    # concentración: tres ejecutivos acumulan más de la mitad del gasto
    for i in (0, 1, 2):
        for _ in range(75):
            gasto(i, dia_habil(EJ_INI, EJ_FIN), monto(60, 95))
    # NEAR_APPROVAL_THRESHOLD: entre $90 y $99.99 (umbral de $100)
    for _ in range(12):
        gasto(rng.randrange(4, 40), dia_habil(EJ_INI, EJ_FIN), monto(90, 99.99))
    # SPLIT_EXPENSES: el mismo empleado, tres gastos en la misma semana bajo el umbral que suman más
    for i, base in ((10, date(2025, 4, 7)), (20, date(2025, 9, 15)), (31, date(2025, 11, 3))):
        for k in range(3):
            gasto(i, base + timedelta(days=k), round(48 + rng.uniform(0, 6), 2))
    # WEEKEND_EXPENSES
    for _ in range(14):
        d = dia_habil(EJ_INI, date(2025, 12, 15))
        gasto(rng.randrange(4, 40), d + timedelta(days=5 - d.weekday() + rng.choice([0, 1])), monto(15, 80))
    # DUPLICATE_EXPENSES: mismo empleado, mismo monto, misma fecha
    for i in (6, 13, 22, 35):
        d, m = dia_habil(EJ_INI, EJ_FIN), monto(25, 85)
        gasto(i, d, m)
        gasto(i, d, m)
    rng.shuffle(filas)
    escribir("09_gastos_representacion.csv", ["id_empleado", "nombre_empleado", "fecha", "categoria", "monto", "aprobado_por"], filas)


# ── 10 Corte de ingresos ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
def corte_ingresos():
    clientes = empresas(25)
    filas, n = [], 0

    def fac(fecha, m, entrega, cliente=None):
        nonlocal n
        n += 1
        filas.append({"numero_factura": f"FAC-{n:05d}", "cliente": cliente or rng.choice(clientes), "fecha_factura": iso(fecha), "monto": m, "fecha_entrega": iso(entrega) if entrega else ""})

    # período normal (todo entregado el mismo día o un día después)
    for _ in range(260):
        f = dia_habil(date(2025, 12, 1), date(2025, 12, 24))
        fac(f, monto(300, 4500), f + timedelta(days=rng.randint(0, 1)))
    # CUTOFF_DELIVERY_MISMATCH: facturas de los últimos 5 días sin guía o con entrega semanas después (channel stuffing)
    for _ in range(14):
        f = date(2025, 12, rng.choice([27, 29, 30, 31]))
        fac(f, monto(9000, 40000), None if rng.random() < 0.5 else date(2026, 1, rng.randint(6, 20)))
    # CUTOFF_CONCENTRATION: mucha facturación al cierre, ya entregada, pero muy por encima del promedio diario
    for _ in range(30):
        f = date(2025, 12, rng.choice([29, 30, 31]))
        fac(f, monto(6000, 22000), f)
    rng.shuffle(filas)
    escribir("10_corte_ingresos.csv", ["numero_factura", "cliente", "fecha_factura", "monto", "fecha_entrega"], filas)


# ── 11 Licitaciones ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────
def licitaciones():
    oferentes = empresas(14)
    favorito = oferentes[0]
    filas = []

    def licitacion(tid, ofertas, ganador):
        for prov, m in ofertas:
            filas.append({"licitacion": tid, "nombre_proveedor": prov, "monto": round(m, 2), "ganador": "Sí" if prov == ganador else "No"})

    t = 0
    # competitivas normales: precios dispersos (> 10% entre sí)
    for _ in range(18):
        t += 1
        part = rng.sample(oferentes[1:], rng.randint(3, 5))
        base = rng.uniform(40000, 200000)
        ofertas = [(p, base * rng.uniform(0.80, 1.35)) for p in part]
        licitacion(f"LIC-2025-{t:03d}", ofertas, min(ofertas, key=lambda x: x[1])[0])
    # BID_UNIFORMITY: ofertas casi idénticas (variación < 3%)
    for _ in range(3):
        t += 1
        part = rng.sample(oferentes[1:], 4)
        base = rng.uniform(80000, 150000)
        ofertas = [(p, base * rng.uniform(0.995, 1.015)) for p in part]
        licitacion(f"LIC-2025-{t:03d}", ofertas, part[0])
    # CLOSE_LOSING_BIDS: perdedoras apenas por encima del ganador (cover bidding)
    for _ in range(3):
        t += 1
        part = rng.sample(oferentes[1:], 4)
        ganador = base = rng.uniform(60000, 120000)
        ofertas = [(part[0], ganador)] + [(p, ganador * rng.uniform(1.01, 1.045)) for p in part[1:]]
        licitacion(f"LIC-2025-{t:03d}", ofertas, part[0])
    # DISPROPORTIONATE_WIN_RATE: un proveedor gana la mayoría de las licitaciones en que participa
    for k in range(8):
        t += 1
        otros = rng.sample(oferentes[1:], 2)
        base = rng.uniform(50000, 180000)
        ofertas = [(favorito, base)] + [(p, base * rng.uniform(1.10, 1.30)) for p in otros]
        licitacion(f"LIC-2025-{t:03d}", ofertas, favorito if k < 7 else otros[0])
    escribir("11_licitaciones.csv", ["licitacion", "nombre_proveedor", "monto", "ganador"], filas)


# ── 12 Cuentas por cobrar ────────────────────────────────────────────────────────────────────────────────────────────────────────────
def cuentas_por_cobrar():
    clientes = empresas(30)
    filas, n = [], 0

    def fac(cliente, emision, dias_credito, m, nota=False):
        nonlocal n
        n += 1
        filas.append({"numero_factura": f"CXC-{n:05d}", "cliente": cliente, "fecha_factura": iso(emision), "fecha_vencimiento": iso(emision + timedelta(days=dias_credito)),
                      "monto": -m if nota else m, "nota_credito": "Sí" if nota else "No"})

    # vigentes: vencen en diciembre de 2025 (el motor mide la antigüedad contra el vencimiento más reciente del archivo: 31/12/2025)
    for c in clientes[3:]:
        for _ in range(rng.randint(2, 4)):
            venc = date(2025, 12, rng.randint(1, 31))
            fac(c, venc - timedelta(days=30), 30, monto(200, 5000))
    # concentración: tres clientes acumulan más de la mitad del saldo
    for c in clientes[:3]:
        for _ in range(9):
            venc = date(2025, 12, rng.randint(1, 31))
            fac(c, venc - timedelta(days=30), 30, monto(14000, 28000))
    fac(clientes[5], date(2025, 12, 1), 30, 150.0)  # vence el 31/12: fija el «vencimiento más reciente» del archivo
    # SEVERELY_OVERDUE: vencidas hace más de 90 días
    for c in rng.sample(clientes[3:], 14):
        e = date(2025, 12, 31) - timedelta(days=rng.randint(150, 330))
        fac(c, e, 30, monto(800, 9000))
    # POST_PERIOD_CREDIT_NOTES: notas de crédito altas en los últimos 15 días
    for c in rng.sample(clientes, 6):
        fac(c, date(2025, 12, rng.randint(18, 31)), 0, monto(4000, 15000), nota=True)
    rng.shuffle(filas)
    escribir("12_cuentas_por_cobrar.csv", ["numero_factura", "cliente", "fecha_factura", "fecha_vencimiento", "monto", "nota_credito"], filas)


# ── 13 Activo fijo ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
def activo_fijo():
    tipos = [("Vehículo", 5), ("Equipo de cómputo", 3), ("Mobiliario", 10), ("Maquinaria", 8), ("Equipo de oficina", 5)]
    ref = date(2025, 12, 15)
    filas = []
    for i in range(1, 111):
        tipo, vida = rng.choice(tipos)
        adq = ref - timedelta(days=rng.randint(60, 365 * 6))
        costo = round(rng.uniform(400, 45000), 2)
        anios = (ref - adq).days / 365.25
        dep = round(min(costo, costo * anios / vida), 2)
        filas.append({"id_activo": f"AF-{i:04d}", "nombre_activo": f"{tipo} {i:03d}", "costo": costo, "fecha_adquisicion": iso(adq), "vida_util": vida,
                      "depreciacion_acumulada": dep, "estado": "Activo", "ultima_verificacion": iso(ref - timedelta(days=rng.randint(20, 540)))})
    filas[0]["fecha_adquisicion"] = iso(ref)  # fija la fecha de referencia del análisis (la adquisición más reciente)
    filas[0]["depreciacion_acumulada"] = 0.0
    # DEPRECIATION_MISMATCH: depreciación registrada muy distinta de la esperada
    for i in range(5, 13):
        filas[i]["depreciacion_acumulada"] = round(filas[i]["costo"] * rng.choice([0.05, 0.9]), 2)
    # FULLY_DEPRECIATED_STILL_ACTIVE
    for i in range(20, 26):
        filas[i]["fecha_adquisicion"] = iso(ref - timedelta(days=365 * 12))
        filas[i]["vida_util"] = 5
        filas[i]["depreciacion_acumulada"] = filas[i]["costo"]
    # STALE_PHYSICAL_CHECK: más de 2 años sin conteo o nunca verificados
    for i in range(40, 48):
        filas[i]["ultima_verificacion"] = iso(ref - timedelta(days=rng.randint(800, 1500)))
    for i in range(48, 52):
        filas[i]["ultima_verificacion"] = ""
    # dados de baja: no deben alertar
    for i in (60, 61):
        filas[i]["estado"] = "Dado de baja"
    escribir("13_activo_fijo.csv", ["id_activo", "nombre_activo", "costo", "fecha_adquisicion", "vida_util", "depreciacion_acumulada", "estado", "ultima_verificacion"], filas)


# ── 14 Pitufeo / depósitos ───────────────────────────────────────────────────────────────────────────────────────────────────────────
def pitufeo():
    titulares = personas(60)
    filas = []

    def dep(t, f, m):
        filas.append({"titular": t, "fecha": iso(f), "monto": m})

    for _ in range(420):
        dep(rng.choice(titulares[5:]), dia_habil(EJ_INI, EJ_FIN), monto(60, 4200))
    # NEAR_REPORTING_THRESHOLD: depósitos individuales entre $9,000 y $9,999.99 (umbral de $10,000)
    for _ in range(14):
        dep(rng.choice(titulares[5:]), dia_habil(EJ_INI, EJ_FIN), monto(9000, 9999.99))
    # STRUCTURING_PATTERN: el mismo titular, varios depósitos en 3 días, que sumados superan el umbral
    for t, base, m, k in ((titulares[0], date(2025, 3, 11), 3200.0, 4), (titulares[1], date(2025, 6, 24), 4500.0, 3), (titulares[2], date(2025, 9, 9), 2600.0, 5),
                          (titulares[3], date(2025, 11, 18), 3900.0, 3)):
        for j in range(k):
            dep(t, base + timedelta(days=j % 3), round(m + rng.uniform(-80, 80), 2))
    rng.shuffle(filas)
    escribir("14_depositos_pitufeo.csv", ["titular", "fecha", "monto"], filas)


# ── 15 Missing trader ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
def missing_trader():
    provs = empresas(32)
    filas = []
    for p in provs[:24]:
        n_, d_ = nit(), direccion()
        for _ in range(rng.randint(4, 9)):
            filas.append({"nombre_proveedor": p, "fecha": iso(dia_habil(EJ_INI, EJ_FIN)), "monto": monto(300, 5200), "nit": n_, "direccion": d_})
    # BURST_ACTIVITY: aparece, factura fuerte en pocos días y desaparece
    for p, base in ((provs[24], date(2025, 4, 7)), (provs[25], date(2025, 7, 14)), (provs[26], date(2025, 10, 6))):
        n_, d_ = nit(), direccion()
        for k in range(7):
            filas.append({"nombre_proveedor": p, "fecha": iso(base + timedelta(days=k)), "monto": monto(14000, 38000), "nit": n_, "direccion": d_})
    # WEAK_IDENTITY_HIGH_VALUE: sin NIT ni dirección y con montos altos
    for p in (provs[27], provs[28]):
        for _ in range(4):
            filas.append({"nombre_proveedor": p, "fecha": iso(dia_habil(EJ_INI, EJ_FIN)), "monto": monto(7000, 16000), "nit": "", "direccion": ""})
    rng.shuffle(filas)
    escribir("15_missing_trader.csv", ["nombre_proveedor", "fecha", "monto", "nit", "direccion"], filas)


# ── 16 Jurisdicciones de baja tributación ────────────────────────────────────────────────────────────────────────────────────────────
def jurisdicciones():
    provs = empresas(30)
    normales = ["El Salvador", "Guatemala", "Honduras", "México", "Estados Unidos", "Colombia", "España", "Costa Rica", "Alemania"]
    riesgo = ["Panamá", "Islas Caimán", "Islas Vírgenes Británicas", "Delaware", "Bahamas", "Luxemburgo"]
    filas = []
    for _ in range(190):
        filas.append({"nombre_proveedor": rng.choice(provs[:22]), "pais": rng.choice(normales), "fecha": iso(dia_habil(EJ_INI, EJ_FIN)), "monto": monto(400, 9000)})
    for _ in range(26):
        filas.append({"nombre_proveedor": rng.choice(provs[22:]), "pais": rng.choice(riesgo), "fecha": iso(dia_habil(EJ_INI, EJ_FIN)), "monto": monto(4000, 24000)})
    rng.shuffle(filas)
    escribir("16_jurisdicciones.csv", ["nombre_proveedor", "pais", "fecha", "monto"], filas)


# ── 17 Validación DTE (JSON) ─────────────────────────────────────────────────────────────────────────────────────────────────────────
def _b64(obj_o_bytes) -> str:
    raw = obj_o_bytes if isinstance(obj_o_bytes, bytes) else json.dumps(obj_o_bytes, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def dte():
    with open(FIXTURE_DTE, encoding="utf-8") as f:
        base = json.load(f)
    carpeta = os.path.join(AQUI, "17_dte_json")
    os.makedirs(carpeta, exist_ok=True)
    for viejo in os.listdir(carpeta):
        if viejo.endswith(".json"):
            os.remove(os.path.join(carpeta, viejo))

    def sello() -> str:
        return uuid.UUID(int=rng.getrandbits(128)).hex.upper() + uuid.UUID(int=rng.getrandbits(128)).hex.upper()[:8]

    def documento(corr: int, dia: date, **opts):
        d = copy.deepcopy(base)
        cod = str(uuid.UUID(int=rng.getrandbits(128), version=4)).upper() if "codigo" not in opts else opts["codigo"]
        ident = d["identificacion"]
        ident.update({"fecEmi": iso(dia), "ambiente": opts.get("ambiente", "01"), "codigoGeneracion": cod,
                      "numeroControl": f"DTE-01-M001P001-{corr:015d}"})
        s = sello()
        d["respuestaHacienda"] = {"estado": opts.get("estado", "PROCESADO"), "selloRecibido": s, "fhProcesamiento": f"{iso(dia)}T10:00:00", "observaciones": []}
        d["selloRecibido"] = s
        firmado = {"identificacion": {"codigoGeneracion": cod, "tipoDte": "01", "numeroControl": opts.get("numero_firmado", ident["numeroControl"])}}
        d["firmaElectronica"] = f"{_b64({'alg': 'RS512'})}.{_b64(firmado)}.{_b64(bytes(rng.getrandbits(8) for _ in range(48)))}"
        if opts.get("sin_sello"):
            d.pop("respuestaHacienda"), d.pop("selloRecibido")
        if opts.get("sin_firma"):
            d.pop("firmaElectronica")
        if opts.get("romper_estructura"):
            d["emisor"].pop("nrc", None)
            d["resumen"]["totalPagar"] = "no-es-un-numero"
        return d

    docs = []
    for k in range(1, 9):                                                                    # 8 limpios, correlativos 1–8
        docs.append(("ok", documento(k, date(2025, 11, k), )))
    docs.append(("sin_sello", documento(9, date(2025, 11, 10), sin_sello=True)))
    docs.append(("rechazado", documento(10, date(2025, 11, 11), estado="RECHAZADO")))
    docs.append(("firma_alterada", documento(11, date(2025, 11, 12), numero_firmado="DTE-01-M001P001-000000000000999")))
    docs.append(("sin_firma", documento(12, date(2025, 11, 13), sin_firma=True)))
    docs.append(("ambiente_pruebas", documento(13, date(2025, 11, 14), ambiente="00")))
    docs.append(("estructura_invalida", documento(14, date(2025, 11, 17), romper_estructura=True)))
    docs.append(("salto_numeracion", documento(18, date(2025, 11, 18))))                      # faltan 15, 16 y 17
    dup = documento(19, date(2025, 11, 19))
    docs.append(("duplicado_a", dup))
    docs.append(("duplicado_b", documento(20, date(2025, 11, 20), codigo=dup["identificacion"]["codigoGeneracion"])))
    for i, (etiqueta, d) in enumerate(docs, 1):
        with open(os.path.join(carpeta, f"dte_{i:02d}_{etiqueta}.json"), "w", encoding="utf-8", newline="\n") as f:
            json.dump(d, f, ensure_ascii=False, indent=2)
    with open(os.path.join(AQUI, "17_dte_lote_completo.json"), "w", encoding="utf-8", newline="\n") as f:
        json.dump([d for _, d in docs], f, ensure_ascii=False, indent=2)
    print(f"  17_dte_json/: {len(docs)} documentos (+ 17_dte_lote_completo.json con todos en un arreglo)")


# ── 18 Screening de sanciones ────────────────────────────────────────────────────────────────────────────────────────────────────────
def sanciones():
    limpias = empresas(46)
    filas = []
    for p in limpias:
        filas.append({"nombre_proveedor": p, "nit": nit(), "pais": rng.choice(["El Salvador", "Guatemala", "Honduras", "México", "Estados Unidos", "Panamá"])})
    # Entidades y personas de las listas públicas (OFAC SDN / ONU), algunas escritas con variaciones: deben aparecer como coincidencia a revisar.
    # La coincidencia real depende de la copia sincronizada en el servidor.
    sembradas = [("Hizballah", "Líbano"), ("Wagner Group", "Rusia"), ("Lazarus Group", "Corea del Norte"), ("Mahan Air", "Irán"),
                 ("Islamic Revolutionary Guard Corps", "Irán"), ("Joaquin Guzman Loera", "México"), ("Cartel de Jalisco Nueva Generacion", "México"),
                 ("Wagner Grup", "Rusia"), ("Mahan Air Co", "Irán")]
    for nombre, pais in sembradas:
        filas.append({"nombre_proveedor": nombre, "nit": "", "pais": pais})
    rng.shuffle(filas)
    escribir("18_sanciones.csv", ["nombre_proveedor", "nit", "pais"], filas)


# ── Extra: Excel con filas de título antes del encabezado (prueba la detección de encabezado) ──────────────────────────────────────────
def excel_con_titulos():
    from openpyxl import Workbook

    src = os.path.join(AQUI, "01_libro_mayor.csv")
    with open(src, encoding="utf-8", newline="") as f:
        filas = list(csv.reader(f))[:301]
    wb = Workbook()
    ws = wb.active
    ws.title = "Libro Mayor"
    ws.append(["REPORTE DE LIBRO MAYOR — EMPRESA FICTICIA S.A. DE C.V."])
    ws.append(["Ejercicio 2025 · Exportado del ERP (datos sintéticos)"])
    ws.append([])
    for fila in filas:
        ws.append([float(c) if (i == 5 and c not in ("monto",)) else c for i, c in enumerate(fila)])
    ruta = os.path.join(AQUI, "01b_libro_mayor_con_titulos.xlsx")
    wb.save(ruta)
    print(f"  01b_libro_mayor_con_titulos.xlsx: encabezado en la fila 4, {len(filas) - 1} filas")


if __name__ == "__main__":
    print("Generando bases sintéticas en", AQUI)
    libro_mayor()
    excel_con_titulos()
    cuentas_por_pagar()
    nomina()
    benford()
    anomalias()
    sod()
    maestro_proveedores()
    partes_relacionadas()
    gastos()
    corte_ingresos()
    licitaciones()
    cuentas_por_cobrar()
    activo_fijo()
    pitufeo()
    missing_trader()
    jurisdicciones()
    dte()
    sanciones()
    print("Listo.")
