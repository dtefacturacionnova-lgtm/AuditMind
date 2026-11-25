# Bases sintéticas para probar el portal de CAATs

Una base por motor (18 motores), con **anomalías sembradas a propósito** para que cada prueba tenga algo que detectar. Todo es ficticio:
empresas, personas, NIT, cuentas y direcciones se inventan en `generar_datos_sinteticos.py`. La única excepción es `18_sanciones.csv`, que
incluye nombres de entidades de las listas públicas (OFAC/ONU) para poder comprobar coincidencias.

**Ejercicio simulado:** 2025 (corte 31/12/2025). **Reproducible:** la semilla es fija; volver a ejecutar el generador crea los mismos archivos.

## Cómo usarlas

- **Analytics** (`/dashboard/analytics`): elegir el análisis → «Subir archivo» → subir el CSV → revisar el mapeo de columnas → «Ejecutar análisis».
- **Papel PT-B4** (sección «Análisis de datos CAATs»): elegir el motor en las tarjetas y subir el mismo archivo.
- Los archivos usan nombres de columna que el portal reconoce solo: no hace falta mapear nada a mano (basta revisar el mapeo propuesto).

## Qué trae cada base y qué debe aparecer

Las cifras son las que devuelven los motores reales con estos archivos (verificado con `verificar_con_motores.py`). Donde el número es mayor
que lo sembrado es porque el motor también cuenta coincidencias naturales del resto de los datos (por ejemplo, gastos pequeños del mismo
empleado en la misma semana).

| Archivo | Motor | Anomalías sembradas | Debe aparecer |
|---|---|---|---|
| `01_libro_mayor.csv` (1,324 asientos) y `01b_libro_mayor_con_titulos.xlsx` | Libro Mayor | Montos redondos, asientos de los últimos días, mismo monto por el mismo usuario, fines de semana, madrugada/noche, un usuario con 450 asientos | `ROUND_AMOUNTS` 60 · `END_OF_PERIOD` 130 · `DUPLICATE_AMOUNT_USER` 46 · `WEEKEND_ENTRIES` 16 · `OFF_HOURS_ENTRIES` 90 · `HIGH_VOLUME_USER` |
| `02_cuentas_por_pagar.csv` (316 facturas) | Cuentas por Pagar | 6 pares de facturas duplicadas, 2 proveedores con facturas fraccionadas bajo el umbral, 3 proveedores «fantasma» (nombre genérico o vacío) —y 5 proveedores con nombres corrientes («Internacional», «Nacional»…) que **no** deben marcarse—, pagos antes de la factura y a más de 90 días, 3 proveedores concentran más del 50 % | `DUPLICATE_INVOICES` 12 · `INVOICE_SPLITTING` · `GHOST_VENDORS` 3 · `EARLY_PAYMENT` 5 · `LATE_PAYMENT` 8 · `VENDOR_CONCENTRATION` |
| `03_nomina.csv` (120 empleados) | Nómina | 3 empleados sin nombre, 2 salarios muy atípicos, 3 netos mayores al bruto, una cuenta bancaria compartida, un aprobador autoriza la mayoría | `GHOST_EMPLOYEES` 3 · `PAY_OUTLIERS` 2 · `NET_EXCEEDS_GROSS` 3 · `SHARED_BANK_ACCOUNTS` 2 · `APPROVER_CONCENTRATION` |
| `04a_benford_natural.csv` / `04b_benford_manipulado.csv` | Ley de Benford | **04a**: montos naturales (cumplen Benford). **04b**: montos «inventados» con dígitos iniciales 5–9 sobrerrepresentados | 04a → conformidad *Cercano*; 04b → *No conforme* (MAD ≈ 0.12). Columna de montos: `monto` |
| `05_anomalias_transacciones.csv` (432) | Anomalías (ML) | 12 transacciones multivariadas raras (monto altísimo con cantidad mínima, descuentos enormes, crédito de 365+ días) | El modelo detecta ~22 registros y **incluye los 12 sembrados** (`TX-00500` a `TX-00511`). Columnas numéricas: `monto`, `cantidad`, `descuento_pct`, `dias_credito` |
| `06_matriz_accesos_sod.csv` (60 asignaciones) | Segregación de Funciones | 6 usuarios con pares incompatibles del catálogo y 2 con 3+ categorías sensibles | 6 conflictos del catálogo (uno por par) + `ACCESS_CONCENTRATION` 2 usuarios |
| `07_maestro_proveedores.csv` (88) | Maestro de Proveedores | 3 NIT duplicados, 2 cuentas duplicadas, 2 direcciones duplicadas, 5 inactivos con actividad reciente, 3 identidades débiles (y 5 proveedores con nombres corrientes que **no** deben marcarse) | `DUPLICATE_TAX_ID` 3 · `DUPLICATE_BANK_ACCOUNT` 2 · `DUPLICATE_ADDRESS` 2 · `INACTIVE_WITH_RECENT_ACTIVITY` 5 · `WEAK_IDENTITY` 3 |
| `08a_partes_relacionadas_transacciones.csv` + `08b_registro_partes_relacionadas.csv` | Partes Relacionadas | 2 coincidencias por NIT, 4 por nombre sin NIT, 2 empleados como contraparte | `RELATED_PARTY_MATCH_TAX_ID` 2 · `RELATED_PARTY_MATCH_NAME` 4 · `EMPLOYEE_AS_COUNTERPARTY` 2. **Requiere los dos archivos**: 08a como principal y 08b en «Registro de Partes Relacionadas» |
| `09_gastos_representacion.csv` (548) | Gastos de Representación | Gastos de $90–99 (umbral $100), 3 empleados con 3 gastos en la misma semana, fines de semana, 4 pares duplicados, 3 ejecutivos concentran más del 50 % | `NEAR_APPROVAL_THRESHOLD` · `SPLIT_EXPENSES` · `WEEKEND_EXPENSES` 14 · `DUPLICATE_EXPENSES` 8 · `EMPLOYEE_CONCENTRATION` |
| `10_corte_ingresos.csv` (304) | Corte de Ingresos | 14 facturas de los últimos días sin guía de entrega o entregadas semanas después, y 30 facturas al cierre muy por encima del promedio diario | `CUTOFF_DELIVERY_MISMATCH` 14 · `CUTOFF_CONCENTRATION` |
| `11_licitaciones.csv` (118 ofertas) | Licitación Colusoria | 3 licitaciones con precios casi idénticos, 3 con ofertas perdedoras pegadas a la ganadora, un proveedor que gana 7 de 8 | `BID_UNIFORMITY` · `CLOSE_LOSING_BIDS` · `DISPROPORTIONATE_WIN_RATE` |
| `12_cuentas_por_cobrar.csv` (128) | Antigüedad de CxC | 14 facturas con más de 90 días vencidas, 3 clientes concentran más del 50 %, 6 notas de crédito en los últimos 15 días | `SEVERELY_OVERDUE` 14 · `CUSTOMER_CONCENTRATION` · `POST_PERIOD_CREDIT_NOTES` 6 |
| `13_activo_fijo.csv` (110) | Activo Fijo | 8 con depreciación distinta de la esperada, 6 totalmente depreciados y activos, 12 sin verificación física en 2+ años | `DEPRECIATION_MISMATCH` 7 · `FULLY_DEPRECIATED_STILL_ACTIVE` · `STALE_PHYSICAL_CHECK` 12 |
| `14_depositos_pitufeo.csv` (449) | Pitufeo / Smurfing | 14 depósitos entre $9,000 y $9,999 (umbral $10,000), 4 titulares que fraccionan en 3 días | `NEAR_REPORTING_THRESHOLD` 14 · `STRUCTURING_PATTERN` |
| `15_missing_trader.csv` (184) | Missing Trader | 3 proveedores que facturan fuerte en 7 días y desaparecen, 2 sin NIT ni dirección con montos altos | `BURST_ACTIVITY` 3 · `WEAK_IDENTITY_HIGH_VALUE` 2 |
| `16_jurisdicciones.csv` (216) | Jurisdicciones de Baja Tributación | 26 transacciones a Panamá, Caimán, Islas Vírgenes, Delaware, Bahamas y Luxemburgo (más del 15 % del monto) | `LOW_TAX_JURISDICTION_TRANSACTIONS` 26 · `HIGH_HAVEN_CONCENTRATION` |
| `17_dte_json/` (17 archivos) y `17_dte_lote_completo.json` | Validación DTE | 8 DTE correctos y 9 con un defecto cada uno (en el nombre del archivo) | `STRUCTURAL_SCHEMA` 1 · `MISSING_SELLO` 1 · `REJECTED_OR_OBSERVED` 1 · `SIGNATURE_INTEGRITY` 2 (firma alterada y sin firma) · `DUPLICATE_CODIGO_GENERACION` 1 · `CORRELATIVO_GAP` 3 · `AMBIENTE_PRUEBAS` 1 |
| `18_sanciones.csv` (55) | Screening de Sanciones | 46 empresas ficticias y 9 nombres de las listas públicas, 2 con variación de escritura | Coincidencias para Hizballah, Wagner Group, Lazarus Group, Mahan Air, Islamic Revolutionary Guard Corps, Joaquín Guzmán Loera y Cártel de Jalisco, más las 2 variantes. **No se pudo comprobar aquí** (ver más abajo) |

**Mapeo:** todas las bases se mapean solas en el portal (el portal reconoce `cliente` como nombre de cliente desde que se agregaron esos alias).

`01b_libro_mayor_con_titulos.xlsx` trae 3 filas de título antes del encabezado (que está en la fila 4): sirve para probar que el portal detecta
solo la fila de encabezado.

`17_dte_json/`: se pueden subir los 17 archivos juntos, o `17_dte_lote_completo.json` (los mismos 17 en un arreglo). La opción «Confirmar
también con Hacienda» consulta el servicio público del MH: estos documentos son sintéticos y **no existen allí**, así que con esa opción activada
saldrán como «no registrados en Hacienda» (es lo esperado).

## Verificación automática

El script `verificar_con_motores.py` pasa cada archivo por el mismo camino que el portal (lectura del CSV, mapeo automático de columnas y la
misma función de `analytics.py`) y falla si alguna anomalía sembrada no se detecta. Desde `apps/ai-service`:

```powershell
venv/Scripts/python.exe ../../Ejemplosdemo/caats/verificar_con_motores.py --ver
```

Para regenerar los archivos:

```powershell
venv/Scripts/python.exe ../../Ejemplosdemo/caats/generar_datos_sinteticos.py
```

Lo que **no** se pudo verificar aquí: el screening de sanciones (lee la lista de la base de datos del servidor, que no estaba accesible desde esta
máquina). Con la lista sincronizada deberían salir las coincidencias de arriba; cualquier otra coincidencia sobre las empresas ficticias sería un
falso positivo del motor y vale la pena anotarla.

## Dos problemas de los motores que estas bases dejaron al descubierto (ya corregidos)

1. **Falsos positivos de «proveedor fantasma».** Cuentas por Pagar y el Maestro de Proveedores buscaban patrones como `na`, `temp` o `test`
   **dentro** del nombre (el Maestro, además, quitaba los espacios antes de buscar). Con nombres corrientes marcaban como fantasma, con riesgo
   crítico, a «Distribuidora Internacional», «Ferretería Nacional», «Panadería La Esperanza», «Servicios Santa Ana» o «Corporación Apaneca».
   Ahora el patrón debe ser una **palabra completa** del nombre (`apps/ai-service/app/services/caats/name_patterns.py`). Estas bases incluyen
   esos cinco nombres como proveedores normales, y el verificador exige que **no** se marquen (exactamente 3 fantasmas y 3 identidades débiles).
2. **Clientes sin alias.** El mapeo automático no reconocía `cliente` / `nombre_cliente` / `customer_name` / `razon_social` como nombre de
   cliente (campo obligatorio de Corte de Ingresos y Antigüedad de CxC). Ahora sí (`apps/web/src/lib/caats-fields.ts`).
