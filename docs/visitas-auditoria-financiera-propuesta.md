# Visitas en la Auditoría Financiera Externa — investigación y propuesta

> Estado: **PROPUESTA, nada construido.** Fecha: 2026-11-25. Pendiente de decisiones del usuario (ver §7).
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

## 7. Decisiones que necesito del usuario
1. **¿Cuántas visitas son típicas en sus encargos?** (¿planificación + interina + final, o solo interina + final? ¿hay visitas por trimestre?) Determina si `kind` basta o hace falta un número de visita libre.
2. **¿Qué se hace hoy con los saldos de la interina en un encargo real?** ¿Se prueban cuentas sustantivamente (inventario, caja, confirmaciones) o es sobre todo control interno? Cambia el peso del puente (F2).
3. **Seguimiento:** ¿el seguimiento de observaciones lo quieren **dentro del encargo** (de la interina a la final del mismo año) y **entre años** (de un año al siguiente), o solo lo primero para empezar?
4. **Mapeo de cuentas:** ¿el cliente cambia su catálogo entre visitas con frecuencia? Si sí, hay que prever un «mapa de equivalencias» de cuentas.
5. **Alcance de la primera entrega:** ¿F1 + F2 (saldos y puente) primero, o F3 (seguimiento) primero?

---

## 8. Fuentes
- IAASB, [ISA 330 — Respuestas del auditor a los riesgos valorados](https://ktkt.uel.edu.vn/Resources/Docs/SubDomain/ktkt/VanBan/ISA/ISA%20330.pdf) (pruebas en fecha intermedia y período restante).
- FRC, [ISA (UK) 330](https://media.frc.org.uk/documents/ISA_UK_330_-_Revised_July_2017_Updated_May_2022_ooi6JjX.pdf).
- IAASB, [ISA 450 — Evaluación de incorrecciones](https://ktkt.uel.edu.vn/Resources/Docs/SubDomain/ktkt/VanBan/ISA/ISA%20450.pdf); ACCA, [Evaluation of misstatements](https://accaglobal.com/hk/en/student/exam-support-resources/professional-exams-study-resources/p7/technical-articles/misstatements.html).
- ISA 265 y seguimiento de cartas a la gerencia: [ISA 265 (IAASB)](https://ktkt.uel.edu.vn/Resources/Docs/SubDomain/ktkt/VanBan/ISA/ISA%20265.pdf); [Academy Trust management letters (gov.uk)](https://www.gov.uk/government/publications/understanding-management-letters-for-academy-trusts/academy-trust-management-letters).
- Práctica interina/final (secundarias): [ACCA AA, interim v final](https://www.acowtancy.com/classes/acca-aa/b6-audit-planning-and-documentation/interim-v-final-audit); [OpenTuition, interim audit](https://opentuition.com/glossary/interim-audit/); [Ch. 11 Lecture](https://jaeyoonyu.github.io/assets/ACC531/Ch11-Lecture.pdf); [PCAOB AU 313 (archivada)](https://pcaobus.org/oversight/standards/archived-standards/details/AU313).
- Herramientas: [CaseWare Cloud — importar balance](https://www.caseware.com/docs/en/cloud/caseware-cloud/engagement-management/data-import/import-the-trial-balance-from-a-csv-or-excel-file).
- Interno: `apps/web/src/components/working-papers/TrialBalancePanel.tsx`, `apps/api/prisma/schema.prisma` (`TrialBalance`, `AuditTiming`, `Finding`), `MD/AuditMind_FinancieroAuto_v13.0_AuditBrain.docx.md` (B-00..B-09).
