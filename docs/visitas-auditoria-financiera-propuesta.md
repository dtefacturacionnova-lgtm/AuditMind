# Visitas en la Auditoría Financiera Externa — investigación y propuesta

> Estado: **DISEÑO CERRADO para F1+F2 (§8), nada construido.** Fecha: 2026-11-25. Decisiones del usuario registradas en §7.
> Alcance: plantilla «Auditoría Financiera Externa v1.0» (papeles B-00 a B-09) y todo lo que toca saldos por visita.

---

## 1. Cómo trabajan los auditores las visitas

**Qué es una visita.** Una auditoría externa rara vez se hace de una sola vez. Lo habitual son 2 o 3 visitas al cliente, cada una con un corte de saldos distinto:

| Visita | Cuándo | Qué se hace | Qué saldos se usan |
|---|---|---|---|
| Planificación / preliminar | Meses antes del cierre | Entender al cliente, evaluar riesgos, analíticos preliminares, fijar materialidad | Balance a una fecha reciente (a veces el del año anterior ya auditado) |
| **Interina** | Antes del cierre (p. ej. a septiembre) | Pruebas de controles y, a veces, pruebas sustantivas anticipadas | Balance a la fecha de corte de la visita |
| **Final / de cierre** | Al cierre del período o después | Saldos al cierre, ajustes, eventos posteriores, conclusión y opinión | Balance al 31 de diciembre (y ajustado) |
| Seguimiento (opcional) | Después del informe o entre visitas | Revisar si la entidad corrigió lo observado | Solo las cuentas afectadas |

**Lo que dice la norma (fuente primaria).** La NIA 330 permite hacer pruebas de controles o pruebas sustantivas en una fecha intermedia, pero exige dos cosas: (a) pruebas adicionales sobre el período que falta hasta el cierre, y (b) para los controles probados en la interina, evidencia de cambios significativos posteriores. Esa es la base del «puente» (*roll-forward*): extender las conclusiones de la interina hasta la fecha del balance. Fuente: [ISA 330 (texto IAASB)](https://ktkt.uel.edu.vn/Resources/Docs/SubDomain/ktkt/VanBan/ISA/ISA%20330.pdf) y [FRC, ISA (UK) 330](https://media.frc.org.uk/documents/ISA_UK_330_-_Revised_July_2017_Updated_May_2022_ooi6JjX.pdf).

**Lo que se repite en la práctica** (fuentes secundarias, material de estudio y guías de firmas; úsese como referencia de práctica, no como norma):
- Los **controles** se prueban sobre todo en la interina; lo **sustantivo** pesa más en la final. [ACCA, interina vs. final](https://www.acowtancy.com/classes/acca-aa/b6-audit-planning-and-documentation/interim-v-final-audit) · [OpenTuition](https://opentuition.com/glossary/interim-audit/).
- Lo hecho en la interina **no cubre el año completo**: siempre hay que cubrir saldos al cierre y hechos posteriores. [Ch. 11 (apuntes)](https://jaeyoonyu.github.io/assets/ACC531/Ch11-Lecture.pdf).
- El ejemplo típico del puente es el inventario: se observa el conteo en una fecha anterior al cierre y se «rueda» hasta el 31 de diciembre. [Ch. 11 (apuntes)](https://jaeyoonyu.github.io/assets/ACC531/Ch11-Lecture.pdf).
- La NIA 450 pide **acumular** las incorrecciones identificadas durante toda la auditoría (salvo las claramente insignificantes) y evaluarlas **en total** contra la materialidad; antes de evaluar las no corregidas hay que **reconfirmar si la materialidad sigue siendo adecuada**. Fuente: [ISA 450](https://ktkt.uel.edu.vn/Resources/Docs/SubDomain/ktkt/VanBan/ISA/ISA%20450.pdf) · [ACCA, evaluación de incorrecciones](https://accaglobal.com/hk/en/student/exam-support-resources/professional-exams-study-resources/p7/technical-articles/misstatements.html).
- Las **observaciones** (cartas a la gerencia, NIA 265) se siguen visita a visita: estado, respuesta de la gerencia, plazo y evidencia del seguimiento; lo no resuelto pasa a la visita siguiente. Ejemplo de exigencia formal: [Academy Trust management letters (UK)](https://www.gov.uk/government/publications/understanding-management-letters-for-academy-trusts/academy-trust-management-letters).
- **Herramientas del mercado:** CaseWare Cloud permite importar el balance como «de planificación» o «final» y cambiar el encargo entre ambos modos; al **reimportar, sobrescribe** los saldos de las cuentas con el mismo número (no guarda cada carga como una foto). [CaseWare, importar balance](https://www.caseware.com/docs/en/cloud/caseware-cloud/engagement-management/data-import/import-the-trial-balance-from-a-csv-or-excel-file).

**Limitaciones de esta investigación.** No encontré una guía pública de ninguna firma sobre cómo arrastrar la lista de incorrecciones acumuladas de la interina a la final, ni cómo lo resuelven TeamMate+ o Audit Desktop con varios cortes. Lo que propongo abajo en ese punto es diseño nuestro apoyado en el texto de la norma, no una práctica copiada.

---

## 2. Cómo funciona hoy AuditMind (verificado en el código)

1. **Dos formas de cargar saldos, ninguna conoce «visitas»:**
   - *Papel B-00 (`TrialBalancePanel`)*: un solo archivo con tres columnas fijas — `saldo_actual`, `saldo_anterior`, `saldo_anterior2` — guardado como valor de la sección del papel. Es la «sola carga» que describes: el año auditado y dos históricos llegan juntos.
   - *Pestaña Balance del encargo (`TrialBalance`)*: cada importación es un registro con `periodLabel` en texto libre («Diciembre 2024»). Ya admite varias cargas por encargo, pero no tienen fecha de corte, tipo ni orden, y nada las compara entre sí.
2. **El análisis de variaciones (B-07)** compara columnas de una misma carga; no compara «interina vs. final».
3. **Procedimientos:** cada paso (`AuditStep`) ya tiene `timing` con valores `INTERIM`, `YEAR_END` y `ROLLFORWARD`. O sea, el concepto de «hacer esto en la interina / en el puente / al cierre» existe, pero no está atado a una visita ni a una carga de saldos.
4. **Hallazgos (`Finding`):** tienen estados (`IN_PROGRESS`, `CLOSED`, `OVERDUE`, `ACCEPTED_RISK`…), plan de acción, y los campos `isRecurring` / `previousFindingId` para reincidencia **entre encargos**. No hay estado «revisado en la visita N».
5. **Roll-forward existente (`RollForwardModal`)** es otra cosa: copia la estructura de un encargo al **año siguiente** (con la opción de arrastrar hallazgos abiertos). No es el puente interina→cierre.
6. **Cédula de diferencias / AJEs (B-08, B-09)** están definidos en la plantilla (`PT-FIN-B08`, `PT-FIN-B09`). Su modelo de datos no tiene noción de visita, así que no podrían distinguir en qué visita se encontró cada diferencia. *(No revisé a fondo cuánto de la automatización descrita en el documento v13 está construida; conviene verificarlo en F4.)*

---

## 3. Brechas frente a lo que hacen los auditores

| # | Brecha | Consecuencia hoy |
|---|---|---|
| G1 | No existe el objeto «visita» (fecha de corte, alcance, estado, equipo) | No se puede decir qué se hizo cuándo |
| G2 | Un balance por papel, con columnas fijas; la 2.ª visita obliga a re-cargar y pisar o a abrir otro papel | Se pierde la foto de la interina; no hay puente |
| G3 | Nada compara visita contra visita (cuentas nuevas, desaparecidas, movimiento del período que falta) | El auditor lo hace a mano en Excel |
| G4 | No hay mapa de **cobertura**: qué cuentas se vieron en qué visita | Riesgo de olvidar cuentas en la final o repetir trabajo |
| G5 | El seguimiento de observaciones no está atado a visitas | Lo pendiente no «aparece solo» al abrir la visita siguiente |
| G6 | Las diferencias acumuladas (NIA 450) no dicen en qué visita nacieron | No se puede ver la evolución ni reconfirmar materialidad por visita |
| G7 | El mapeo de cuentas a sub-sumarias (B-00 S2) se repite en cada carga | Trabajo duplicado |

---

## 4. Propuesta

### 4.1 Idea central
Pasar de «una carga con tres columnas» a **«una línea de tiempo de visitas, cada una con su propia foto de saldos»**, y que el sistema calcule solo lo que el auditor hoy hace a mano: comparar fotos, armar el puente, mostrar cobertura y arrastrar lo pendiente.

Se **conserva** la carga actual con histórico (sigue sirviendo para el comparativo de años anteriores). Lo nuevo es que el «saldo actual» deja de ser una sola cosa: es el saldo **de la visita**.

### 4.2 Modelo de datos (borrador)
- **`AuditVisit`** (nuevo): `auditId`, `organizationId`, `kind` (`PLANNING` | `INTERIM` | `FINAL` | `FOLLOW_UP` | `OTHER`), `label`, `cutoffDate` (fecha de corte de los saldos), `fieldworkStart/End`, `status` (`PLANNED` | `IN_PROGRESS` | `CLOSED`), `closedById/At`, `notes`. Un encargo puede tener 1 a N visitas; el `FINAL` es único.
- **`TrialBalance`** (existente): se le agregan `visitId?` y `asOfDate?`. Sigue guardando las cuentas en JSON (suficiente: la comparación se hace por código de cuenta en el servicio, sin tabla de filas). Las cargas viejas quedan sin visita y siguen funcionando.
- **`AccountVisitCoverage`** (nuevo, o derivado): por visita y cuenta/sub-sumaria, estado `NOT_REVIEWED | REVIEWED | REVIEWED_WITH_EXCEPTIONS`, referencia al papel y a los pasos de procedimiento. Se puede **derivar** de los pasos con `timing` + un `visitId` nuevo en el paso, en vez de guardarlo aparte.
- **`FindingVisitReview`** (nuevo): `findingId`, `visitId`, `status` (`OPEN` | `IN_FOLLOW_UP` | `RESOLVED` | `PERSISTS` | `ESCALATED`), `managementResponse`, `dueDate`, `evidence`. Da la historia de cada observación a lo largo de las visitas, sin tocar los estados actuales de `Finding`.
- **Diferencias de B-08**: agregar `visitId` a cada diferencia (cuándo se identificó).
- Todo lo nuevo con **RLS activado y `REVOKE` a anon/authenticated** (regla de la auditoría de seguridad de 2026-10-18) y SQL aplicado a la base compartida solo con aprobación expresa.

### 4.3 Qué se automatiza

**A1 — Carga por visita.** Al crear la visita se sube el balance a esa fecha de corte con el mismo importador de hoy. Al importar el sistema:
- reutiliza el **mapeo a sub-sumarias** de la visita anterior (G7); solo pide mapear cuentas **nuevas**;
- marca cuentas **nuevas**, **desaparecidas** y las que **pasaron a cero**;
- verifica cuadre y avisa si el total cambió de forma rara contra la visita anterior.

**A2 — Puente interina → cierre (por cuenta).** Tabla automática: saldo a la interina · movimiento del período restante · saldo final · movimiento esperado · desvío. El «esperado» puede ser proporcional al tiempo o basado en el mismo tramo del año anterior (cuando hay histórico). Los desvíos sobre la materialidad de ejecución generan **pasos de procedimiento `ROLLFORWARD` sugeridos** (el `timing` ya existe), que el auditor acepta con un clic. Es lo que la NIA 330 exige para el período restante.

**A3 — Matriz de cobertura.** Cuentas × visitas: qué se vio, dónde, con qué resultado. Al abrir la final, el sistema señala **cuentas materiales no cubiertas en ninguna visita** y cuentas con excepciones en la interina que aún no tienen prueba de cierre.

**A4 — Seguimiento automático al abrir la visita.** Al crear la visita N+1, se genera una lista «Pendientes de la visita anterior»: observaciones abiertas o persistentes, planes de acción vencidos, solicitudes PBC sin respuesta, diferencias no ajustadas por el cliente. El auditor marca el resultado de cada una (resuelta / persiste / escalada) con evidencia; lo que persiste pasa sola a la siguiente. Al cerrar la visita el estado queda congelado (historia).

**A5 — Diferencias acumuladas por visita (NIA 450).** B-08 muestra el total de diferencias no corregidas **por visita y acumulado**, contra los umbrales de materialidad. Al abrir la visita final pide **reconfirmar la materialidad** (con su justificación) antes de evaluar lo acumulado, como indica la norma.

**A6 — Variaciones en tres ejes (B-07).** Horizontal entre años (como hoy) + entre visitas + proyección al cierre. El comentario de variación (Argus) y los procedimientos sugeridos usan el eje que corresponda.

**A7 — Propagación a sumarias.** B-01..B-06 muestran columna «saldo por visita» seleccionable; los ajustes de B-08 siguen entrando en «saldo auditado» solo para la final.

### 4.4 Pantallas
- Pestaña **Visitas** del encargo: línea de tiempo (planificación → interina → final), estado, fecha de corte, avance, botón «Nueva visita».
- Dentro de cada visita: **Saldos** (carga y comparación con la anterior), **Puente**, **Cobertura**, **Seguimiento**.
- B-00 sigue existiendo; deja de pedir «una sola carga con tres columnas» cuando el encargo tiene visitas.

---

## 5. Plan por fases (con modelo de Claude recomendado, según la regla global)

| Fase | Entrega | Riesgo | Modelo |
|---|---|---|---|
| **F0** | Cerrar decisiones de §7 y dejar el diseño de datos/estados escrito | Diseño con consecuencias multi-organización | **Fable 5 / Opus** |
| **F1** | `AuditVisit` + `visitId` en carga de saldos + importar por visita con mapeo heredado + comparación entre visitas (A1) · SQL con RLS | Migración sobre base compartida | Opus para el SQL y las reglas; **Sonnet** para API y pantalla |
| **F2** | Puente por cuenta + pasos `ROLLFORWARD` sugeridos (A2) | Lógica de «esperado» | Opus (definir la regla) → Sonnet |
| **F3** | Seguimiento entre visitas (A4) + `FindingVisitReview` | Integración con hallazgos/PBC existentes | Sonnet sobre patrones ya existentes |
| **F4** | Matriz de cobertura (A3) + diferencias por visita y materialidad (A5) | Toca B-08 | Sonnet; revisión de la regla de NIA 450 con Opus |
| **F5** | B-07 en tres ejes (A6), columnas por visita en sumarias (A7) | Cambia papeles existentes | Sonnet |
| **F6** | Pruebas de regresión (Postgres real), guía de uso | — | **Haiku** |

Cada fase se puede desplegar sola y deja la app usable; las cargas existentes no se tocan.

---

## 6. Riesgos y cosas a cuidar
- **Encargos en curso:** los que ya cargaron saldos en B-00 deben seguir igual. Propuesta: encargos sin visitas = comportamiento actual; el modo visitas se activa por encargo.
- **Base compartida (dev = producción):** toda tabla nueva requiere SQL aprobado, RLS y verificación; hay organizaciones reales (Pérez Cortez, FE & CE).
- **Tamaño:** el JSON de cuentas por carga es razonable para miles de cuentas; si un cliente trae decenas de miles, habría que normalizar en filas. No es el caso hoy.
- **No sobrevender la IA:** el «esperado» del puente es una referencia, no una conclusión; cada desvío requiere la prueba del auditor.
- **Cierre de visita:** una vez cerrada, sus saldos no se pisan (a diferencia de la reimportación de CaseWare); corregir un balance crea una versión nueva dentro de la misma visita.

---

## 7. Decisiones del usuario (2026-11-25)

| # | Pregunta | Respuesta | Efecto en el diseño |
|---|---|---|---|
| 1 | ¿Cuántas visitas? | **Siempre 3: planificación + interina + final** | `kind` fijo con 3 valores, una visita de cada tipo por encargo (único `auditId + kind`). No hace falta número libre ni «visitas por trimestre». |
| 2 | ¿Interina sustantiva o de controles? | **Ambas, depende del encargo** | El puente no puede ser obligatorio: se calcula para todas las cuentas, y se usa sobre las que tengan pruebas sustantivas en la interina (pasos `INTERIM`). |
| 3 | ¿Seguimiento de observaciones? | **Solo dentro del mismo año** | `FindingVisitReview` queda acotado al encargo. El seguimiento entre años (`previousFindingId`) queda como está. |
| 4 | ¿Cambian el catálogo de cuentas? | **No** | Se **elimina** el mapa de equivalencias de cuentas. Las cuentas se emparejan por código. Siguen marcándose cuentas nuevas/desaparecidas (aparecen por la operación normal, no por cambio de catálogo). |
| 5 | ¿Por dónde empezar? | **Saldos y puente — sin perder los análisis actuales** | F1 + F2 primero. Restricción dura: B-00 y todo lo que sale de él (S2–S14) debe seguir funcionando igual (ver §8.3). |

---

## 8. Diseño cerrado de F1 + F2 (saldos por visita y puente)

### 8.1 Qué se construye
1. **Visitas del encargo** (siempre 3: planificación, interina, final) con fecha de corte y estado.
2. **Un balance por visita**, cargado con el mismo importador de hoy.
3. **Comparación entre visitas** (cuentas nuevas, desaparecidas, en cero, variación).
4. **Puente interina → final** por cuenta, con alertas y sugerencia de pasos `ROLLFORWARD`.
5. **Base de análisis**: qué visita alimenta el `saldo_actual` de B-00 (por defecto la final; si aún no hay, la última cargada).

### 8.2 Datos
- Tabla nueva **`audit_visits`**: `id`, `auditId` (FK cascade), `organizationId`, `kind` (`PLANNING|INTERIM|FINAL`), `cutoffDate` (date), `status` (`PLANNED|IN_PROGRESS|CLOSED`), `isAnalysisBase` (boolean), `notes`, `closedAt/closedById`, `createdAt/updatedAt`. Único `(auditId, kind)`. Un solo `isAnalysisBase = true` por encargo (índice único parcial).
- Tabla **`trial_balances`** (existe): + `visitId` (FK nullable, `ON DELETE SET NULL`) y `asOfDate` (date nullable). Todo lo cargado hasta hoy queda con `visitId` nulo y se comporta igual.
- **Sin tabla de filas:** las cuentas siguen en el JSON `accounts`; el servicio las cruza por código. Suficiente para miles de cuentas.
- El SQL son 1 tabla + 2 columnas, con RLS activado y `REVOKE` a anon/authenticated (regla de la auditoría de seguridad). **Se aplica a la base compartida solo con tu aprobación explícita**, con script de reversa y verificador, como las etapas de suscripciones.
- Un balance de una visita **cerrada** no se pisa: corregirlo crea otro registro `TrialBalance` en la misma visita y el último es el vigente (el anterior queda como historia).

### 8.3 Compatibilidad: cómo NO se pierde ningún análisis actual
- B-00 conserva S1..S14 y sus pestañas tal cual. S3..S14 siguen calculando desde `S1` (`saldo_actual`, `saldo_anterior`, `saldo_anterior2`).
- Lo único nuevo es **de dónde sale `saldo_actual`**: si el encargo tiene visitas, el botón «Usar como base de análisis» copia el balance de esa visita a la columna `saldo_actual` de S1 (los históricos no se tocan).
- Cambiar la base **no recalcula solo** las clasificaciones y análisis: la pantalla muestra el aviso «Los análisis se calcularon con otra base — Guardar clasificación y Propagar a Cédulas» (los mismos botones de hoy), para que el auditor controle cuándo se actualiza el expediente.
- Encargos **sin visitas**: nada cambia (la pestaña nueva muestra «Activar visitas» y no más).
- Pestaña nueva **«Visitas»** en B-00 (junto a Importación, Clasificación, etc.), que contiene: línea de tiempo de las 3 visitas, carga de saldos por visita, comparación y puente.

### 8.4 API (sobre el controlador de auditorías existente)
- `POST /audits/:id/visits` crea las 3 visitas (fechas de corte editables); `GET /audits/:id/visits` las lista con resumen de su balance; `PATCH /audits/visits/:visitId` (corte, estado, base de análisis).
- `POST /audits/visits/:visitId/trial-balance` importa un balance a esa visita (reutiliza `importTrialBalance`, agregando `visitId` y `asOfDate`).
- `GET /audits/:id/visits/compare?from=PLANNING&to=INTERIM` → cuentas nuevas, desaparecidas, en cero, variación $ y %.
- `GET /audits/:id/visits/bridge` → puente interina→final por cuenta.
- Todas con la validación habitual de organización y de encargo visible (`assertAuditVisible`), y roles de escritura como el resto de saldos.

### 8.5 Reglas del puente (referencia, no conclusión)
- **Cuentas de balance** (activo, pasivo, patrimonio): se muestra saldo interina, saldo final y movimiento. Se alerta cuando |movimiento| supera la **materialidad de ejecución** del encargo (`Audit.materialityExecution`).
- **Cuentas de resultados** (acumulan en el año): esperado final = saldo interina × (meses del año ÷ meses transcurridos a la fecha de corte). Se alerta si |final − esperado| supera la materialidad de ejecución **y** una variación porcentual configurable (por defecto 20%, el mismo umbral que ya usa B-00).
- Cada alerta puede convertirse en un **paso `ROLLFORWARD` sugerido** (el auditor lo acepta; no se crean solos).
- Cuenta sin materialidad definida en el encargo → el puente funciona pero sin alertas por monto, y lo dice.
- El puente se calcula por código de cuenta; cuentas que existen en una visita y no en la otra se listan aparte, no se descartan.

### 8.6 Pruebas (obligatorias antes de entregar)
- Reglas puras con pruebas unitarias (emparejado por código, nuevas/desaparecidas, anualización de resultados, umbrales).
- Pruebas de integración en Postgres real (la base Docker de pruebas) para: unicidad de visita, una sola base de análisis, aislamiento entre organizaciones, balance de visita cerrada no se pisa.
- Prueba de regresión: un encargo **sin visitas** produce exactamente los mismos resultados de B-00 que hoy.
- Barrido con mutaciones sobre las reglas del puente, como en las etapas anteriores.

### 8.7 Orden de entrega y modelo
| Paso | Entrega | Modelo |
|---|---|---|
| 1 | Modelo + SQL + reglas puras + pruebas | Opus (SQL y reglas) |
| 2 | API de visitas, importación por visita y comparación | Sonnet |
| 3 | Pestaña «Visitas» en B-00 (línea de tiempo, carga, comparación, base de análisis) | Sonnet |
| 4 | Puente y pasos `ROLLFORWARD` sugeridos | Opus (regla) → Sonnet |
| 5 | Pruebas de regresión y guía de uso | Haiku |
Se puede desplegar tras el paso 3 (saldos por visita) y luego el puente.

### 8.8 Lo que queda fuera de esta entrega
Seguimiento de observaciones por visita (F3), matriz de cobertura y diferencias por visita (F4), B-07 en tres ejes (F5). El diseño de §4 sigue vigente para esas fases.

### 8.9 Paso 3 construido (2026-11-27): pestaña «Visitas» en B-00
**Dónde:** B-00 (`PT-FIN-B00`) muestra una pestaña **Visitas** al final de su barra solo cuando el tipo de encargo admite visitas (financiera externa, financiera, externa). No es una sección del papel: no cambia la plantilla ni lo ya guardado. Un encargo sin visitas ve «Activar visitas» y nada más cambia.

**Qué hace:**
- **Activar** (Gerente): tres fechas de corte (propuestas: 31/03, 30/09 y 31/12 del año, editables), validadas en orden estricto.
- **Línea de tiempo**: una tarjeta por visita con estado (planificada / en curso / cerrada), fecha de corte, balance vigente (archivo, cuentas, fecha de carga, cuadre, cuántas cargas) y la marca «Base de análisis» o «Sugerida».
- **Cargar balance** (Auditor o más): mismo lector de S1 (Excel/CSV con Cuenta, Descripción, Saldo). Muestra una **vista previa** (cuentas, totales, si cuadra, filas omitidas) y solo guarda al confirmar. Una carga nueva no pisa la anterior: queda como vigente y la anterior como historia. En una visita cerrada solo un Gerente carga correcciones.
- **Estados y fecha** (Gerente): iniciar, cerrar, reabrir; cambiar la fecha de corte mientras no esté cerrada.
- **Usar como base de análisis** (Gerente, papel no bloqueado): marca la visita y **copia su balance a `saldo_actual` de S1**, con confirmación. Reglas de la copia (`buildS1FromVisit`): los históricos (`saldo_anterior`, `saldo_anterior2`) y las descripciones ya escritas no se tocan; una cuenta de S1 que la visita no trae queda en **cero, no se borra** (puede tener histórico y es una baja que el auditor debe ver); las cuentas nuevas se agregan al final con histórico en cero; un código repetido en S1 recibe el saldo una sola vez.
- **No recalcula solo**: tras copiar, avisa que en la clasificación (S2) hay que usar «Sync desde balance», «Guardar Clasificación» y «Propagar a Cédulas». Un bloque **«Base de los análisis»** compara en vivo S1 contra la visita base y S2 contra S1 (por código, en centavos) y muestra el aviso «Los análisis se calcularon con otra base» mientras no coincidan; no guarda ningún estado aparte que pueda quedar viejo.
- **Comparar visitas**: dos visitas con balance, filtros (con diferencias, nuevas, desaparecidas, pasaron a cero, con cambio, sin cambio) y tabla con variación $ y %; muestra hasta 300 filas y lo dice.

**API añadida:** `GET /audits/visits/:visitId/trial-balance` (Auditor): las cuentas del balance vigente de la visita, normalizadas (una fila por código, saldo neto). La copia a S1 se hace desde la pantalla con el mismo guardado de sección de siempre, así que respeta los mismos permisos y bloqueos del papel.

**Corrección encontrada al probar:** una diferencia de **un centavo** se daba por «cuadrada» (`1000.01 − 1000` da `0.00999…` y se comparaba `< 0.01`). Ahora el cuadre se decide en centavos enteros, en la API (`isBalanced`) y en la pantalla.

**Pruebas:** `lib/visits/visit-base.spec.ts` (lógica de la copia, comparación con S1/S2, archivo → cuentas, fechas y estados) y ampliación de `audit-visits.service.integration.spec.ts` (cuentas vigentes normalizadas, visita sin balance, otra organización, investigación ajena, diferencia de un centavo). Sin SQL nuevo.

**Pendiente de este paso:** verificación visual click a click con una sesión real (la pantalla exige iniciar sesión, y el entorno local comparte la base con producción).

### 8.10 Paso 4 construido (2026-11-27): puente interina → final y pasos `ROLLFORWARD` sugeridos
**Dónde:** al final de la pestaña **Visitas** de B-00, cuando la interina y la final tienen balance cargado.

**Cálculo** (reglas de §8.5, ya construidas y probadas en el paso 1: `buildBridge`): cuentas de balance alertan cuando |movimiento| supera la materialidad de ejecución; cuentas de resultados, cuando el saldo final se aparta del **esperado** (saldo de la interina × días del ejercicio ÷ días transcurridos) por más de la materialidad **y** del porcentaje elegido (10, 20, 30 o 50 %; por defecto 20 %); una cuenta que existe en una sola visita se lista aparte y alerta si su saldo supera la materialidad. Si el corte de la interina cae fuera del ejercicio, la proyección no se calcula y las cuentas de resultados se comparan por su movimiento (con aviso).

**De dónde sale cada dato (y la pantalla lo dice):**
- **Materialidad de ejecución:** la del papel A-06 **PT-A4 (S4)** si es un número mayor que cero; si no, la guardada en el encargo; si no hay ninguna, el puente se calcula completo pero **sin alertas por monto** y avisa.
- **Ejercicio auditado:** `auditPeriodStart` / `auditPeriodEnd` del encargo; si faltan, se asume el año calendario de la fecha de corte de la interina (y la pantalla lo indica).

**Pasos sugeridos:** cada alerta trae un texto de paso de período restante (NIA 330). El auditor marca las cuentas y acepta: se crea el procedimiento **«RF-NIA330 — Período restante»** (una sola vez) en la cuadrícula de procedimientos que elija (por defecto la primera de pruebas sustantivas, «C-…») y un paso por cuenta con `timing = ROLLFORWARD`, estado borrador y conclusión pendiente; en «población» queda el saldo de la interina, el de la final y el movimiento. **Nada se crea solo.**
- El texto lo arma el **servidor** con el puente recalculado: el cliente solo manda las cuentas y la cuadrícula. Cuentas sin alerta o que no figuran en el puente se omiten con su motivo.
- **Un paso por cuenta en todo el encargo:** si ya existe, no se repite aunque se elija otra cuadrícula. Dos personas aceptando a la vez no duplican (la creación se serializa por encargo con un candado de transacción).
- Quien tenga rol Auditor o superior puede aceptar; la sección elegida debe ser una cuadrícula de procedimientos de **este** encargo y de la misma organización.

**API añadida:** `GET /audits/:id/visits/bridge?pct=`, `GET /audits/:id/visits/bridge/targets`, `POST /audits/:id/visits/bridge/steps`. Sin SQL nuevo (usa `audit_procedures` y `audit_steps`, que ya existen).

**Pruebas:** `audit-visits.service.integration.spec.ts` (alertas por tipo, origen de la materialidad y del ejercicio, umbral y su validación, visitas sin balance, aislamiento por organización e investigación, destinos, creación, no repetir, concurrencia, sección inválida) y `lib/visits/bridge-view.spec.ts` (filtros, qué se puede aceptar, selección, destino por defecto).

**Fuera de este paso:** columnas «saldo por visita» en las sumarias (F5), matriz de cobertura (F4) y seguimiento de observaciones (F3).

---

## 9. Fuentes
- IAASB, [ISA 330 — Respuestas del auditor a los riesgos valorados](https://ktkt.uel.edu.vn/Resources/Docs/SubDomain/ktkt/VanBan/ISA/ISA%20330.pdf) (pruebas en fecha intermedia y período restante).
- FRC, [ISA (UK) 330](https://media.frc.org.uk/documents/ISA_UK_330_-_Revised_July_2017_Updated_May_2022_ooi6JjX.pdf).
- IAASB, [ISA 450 — Evaluación de incorrecciones](https://ktkt.uel.edu.vn/Resources/Docs/SubDomain/ktkt/VanBan/ISA/ISA%20450.pdf); ACCA, [Evaluation of misstatements](https://accaglobal.com/hk/en/student/exam-support-resources/professional-exams-study-resources/p7/technical-articles/misstatements.html).
- ISA 265 y seguimiento de cartas a la gerencia: [ISA 265 (IAASB)](https://ktkt.uel.edu.vn/Resources/Docs/SubDomain/ktkt/VanBan/ISA/ISA%20265.pdf); [Academy Trust management letters (gov.uk)](https://www.gov.uk/government/publications/understanding-management-letters-for-academy-trusts/academy-trust-management-letters).
- Práctica interina/final (secundarias): [ACCA AA, interim v final](https://www.acowtancy.com/classes/acca-aa/b6-audit-planning-and-documentation/interim-v-final-audit); [OpenTuition, interim audit](https://opentuition.com/glossary/interim-audit/); [Ch. 11 Lecture](https://jaeyoonyu.github.io/assets/ACC531/Ch11-Lecture.pdf); [PCAOB AU 313 (archivada)](https://pcaobus.org/oversight/standards/archived-standards/details/AU313).
- Herramientas: [CaseWare Cloud — importar balance](https://www.caseware.com/docs/en/cloud/caseware-cloud/engagement-management/data-import/import-the-trial-balance-from-a-csv-or-excel-file).
- Interno: `apps/web/src/components/working-papers/TrialBalancePanel.tsx`, `apps/api/prisma/schema.prisma` (`TrialBalance`, `AuditTiming`, `Finding`), `MD/AuditMind_FinancieroAuto_v13.0_AuditBrain.docx.md` (B-00..B-09).
