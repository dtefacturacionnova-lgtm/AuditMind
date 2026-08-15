# Motor de CAATs — Estado Real y Plan de Categorización

> Investigación realizada: 2026-08-15
> Fuente: (a) investigación de código propio (`apps/api/src/ai/`, `apps/ai-service/app/routers/analytics.py` + `app/services/caats/*.py`, `apps/web/src/app/dashboard/analytics/`, `prisma/schema.prisma`); (b) documentación pública de TeamMate Analytics (Wolters Kluwer, ~150-200 pruebas), CaseWare IDEA, ACL/Diligent, ISA 240 (pruebas de asientos contables).
> Ver también: [`integracion-excel-plantillas-inteligentes.md`](./integracion-excel-plantillas-inteligentes.md) — este documento nace de esa investigación (TeamMate Analytics, sección 5) y comparte la misma brecha raíz (falta de detalle transaccional/mayor).
> **Estado: PROPUESTA / DIAGNÓSTICO — la sección 1 es el estado real verificado del código; las secciones 2-4 son plan, nada de lo nuevo está implementado.**

---

## 1. Estado real del motor de CAATs (verificado en el código, no es especulación)

### Lo que SÍ funciona de punta a punta

**Ley de Benford** — único CAAT completamente conectado:
`apps/ai-service/app/services/caats/benford.py` (chi-cuadrado + MAD, escala de Nigrini, clasifica CLOSE/ACCEPTABLE/SUSPECT/NON_CONFORMING) → `AiService.runCaats('benford', ...)` (`apps/api/src/ai/ai.service.ts:356-378`) → `AuditsService` (`apps/api/src/audits/audits.service.ts:479-628`, `POST /audits/trial-balance/:tbId/benford`, rol AUDITOR) → persistido en `TrialBalance.benfordResult` → genera un `Finding` automático → UI real (`BenfordPanel.tsx` + `useBenford.ts`). Corre directo sobre los montos del Balance de Comprobación ya importado — no necesita detalle transaccional.

### Lo que existe como motor pero está desconectado de datos reales

Cuatro motores Python **completos y funcionales**, expuestos vía `POST /ai/analytics/:type` (`apps/api/src/ai/ai.controller.ts:90-98`, montado en `apps/ai-service/app/routers/analytics.py`):

| Motor | Archivo | Qué detecta hoy |
|---|---|---|
| **GL** (mayor/asientos) | `gl_analysis.py` | Montos redondos, asientos de fin de período, duplicados (monto+usuario), asientos de fin de semana, usuario con volumen atípico (>3σ, proxy de segregación de funciones) |
| **AP** (cuentas por pagar) | `ap_analysis.py` | Facturas duplicadas, fraccionamiento bajo el umbral de aprobación, proveedores con nombre sospechoso ("fantasma"), pagos antes/después de la fecha de término, concentración de proveedores |
| **Payroll** (nómina) | `payroll_analysis.py` | Empleados fantasma, outliers de sueldo (z-score, `scipy.stats`), neto mayor que bruto, cuentas bancarias compartidas entre empleados, concentración por aprobador |
| **Anomaly** (genérico) | `anomaly_detection.py` | Isolation Forest (`sklearn`) + z-score sobre cualquier campo numérico |

**Por qué están "a medias"**: los 4 requieren **detalle transaccional** (asientos individuales, facturas, registros de nómina) que AuditMind **no importa hoy** — solo tenemos totales por cuenta del Balance de Comprobación. La pantalla `/dashboard/analytics` (`apps/web/src/app/dashboard/analytics/page.tsx`) existe y tiene selector + botón "Ejecutar análisis", pero envía **datos de muestra hardcodeados** (`SAMPLE_DATA`) — el propio banner de la pantalla dice *"En producción, los datos provendrán de los conectores SAP/REST configurados"*. Es un sandbox de demostración, no una herramienta de trabajo real todavía.

### Hallazgos adicionales (a corregir cuando se retome, no urgente)

- `POST /ai/analytics/:type` **no tiene `@Roles(...)`** — a diferencia de la ruta de Benford (que sí exige AUDITOR), cualquier usuario autenticado puede invocar GL/AP/Payroll/Anomaly hoy. Menor, pero anotado.
- El modelo `DataAnalysisJob` (`schema.prisma:1681-1721` — job genérico con `status`, `resultsSummary`, `flaggedCount`, relación a `DataFlag` con `disposition: ACCEPTED/FALSE_POSITIVE/FINDING_CREATED`) fue diseñado como la infraestructura de "cola de trabajos + triage de hallazgos" pero **no lo referencia ningún archivo de código** — 0% implementado. Es exactamente lo que hace falta para manejar en escala los resultados de GL/AP/Payroll una vez haya datos reales (miles de flags no se revisan uno por uno sin un flujo de aceptar/descartar/convertir en hallazgo).
- `/dashboard/admin/data-sources` (conectores SAP/REST/Excel) existe pero **no está conectado** a `/analytics` ni a `DataAnalysisJob` — son dos piezas construidas por separado que nunca se enlazaron.

---

## 2. Taxonomía de pruebas CAAT de la industria (TeamMate Analytics / IDEA / ACL)

| Prueba | ¿Necesita detalle transaccional? |
|---|---|
| Detección de duplicados (exacta y difusa, hasta 3 campos) | Sí |
| Detección de huecos (folios, cheques, facturas consecutivas) | Sí |
| Ley de Benford (1er, 2do, primeros-2 dígitos) | No — funciona con una lista de montos |
| Análisis de números redondos (terminan en 000/999, valores en cero) | Parcial — mejor con transacciones, aproximable con saldos |
| Estratificación | No — parámetro de diseño, no un análisis en sí |
| Antigüedad de saldos (aging CxC/CxP) | Sí (subledger con fechas de vencimiento) |
| Pruebas de Asientos Contables (JET, NIA 240.A44: fuera de horario, por alta gerencia, cuentas inusuales, montos redondos, fin de semana, sin segundo aprobador, asientos post-cierre revertidos) | Sí |
| Conciliación a tres vías (Orden de Compra ↔ Factura ↔ Recepción) | Sí, de 3 fuentes distintas |
| Empleados / proveedores fantasma | Sí |
| Matriz de conflicto — Segregación de Funciones | Sí (requiere quién-hizo-qué, no solo montos) |

---

## 3. Categorización — a qué destino va cada una

| Prueba | Destino recomendado | Justificación |
|---|---|---|
| Ley de Benford | **Motor CAATs — ya terminado** | Sin trabajo pendiente salvo pulir (ej. correr por cuenta/ciclo en vez de solo el TB completo) |
| Números redondos (versión ligera, sobre saldos de TB) | **Motor CAATs — se puede activar ya**, sin esperar el importador de mayor | Igual que Benford, alcanza con los montos que ya tenemos; crear `number_analysis.py` liviano reutilizando el patrón de `benford.py` |
| Duplicados (facturas, pagos, asientos) | **Motor CAATs** — el algoritmo ya existe en `ap_analysis.py`/`gl_analysis.py`, bloqueado solo por datos | Es análisis de población completa — encaja mejor como job de backend que como plantilla manual |
| Huecos de secuencia | **Motor CAATs** — no implementado aún, pero mismo patrón que arriba | Full-population, backend |
| Pruebas de Asientos Contables (JET, NIA 240) | **Motor CAATs** — `gl_analysis.py` YA cubre buena parte (redondos, fin de período, fin de semana, usuario atípico) | No hay que inventar el motor, solo conectarlo a datos reales + UI real |
| Empleados / proveedores fantasma | **Motor CAATs** — motor ya escrito en `payroll_analysis.py`/`ap_analysis.py` | Igual, bloqueado solo por falta de datos reales |
| Segregación de Funciones (matriz de conflicto explícita) | **Motor CAATs** — mejora sobre el proxy actual (outlier de volumen en `gl_analysis.py`) | Requiere datos de "quién hizo qué"; hoy solo hay una aproximación |
| **Antigüedad de saldos (aging CxC/CxP)** | **Plantilla Excel semiautomática (Nivel 1)** | El auditor necesita trabajar manualmente el detalle del cliente — es una cédula de trabajo, no un "correr y listo". Incluir en el catálogo del otro documento junto a Composición de Cuenta. |
| **Conciliación a tres vías** | **Plantilla Excel semiautomática primero**; motor CAATs después si se logra importar las 3 fuentes integradas | Rara vez tendremos PO+Factura+Recepción integradas de entrada — el auditor típicamente ya trae su propio cruce armado en Excel del cliente; encaja mejor como plantilla |
| Estratificación | **Ya vive en PT-NIA530** (mejorar ahí, no crear nada nuevo) | Es parte del diseño de muestreo que ya se construyó — no es una prueba CAAT aislada |

---

## 4. La conclusión que conecta ambos documentos

El hallazgo más importante de esta ronda: **el cuello de botella no es escribir más algoritmos — los 4 motores (GL/AP/Payroll/Anomaly) ya están escritos y funcionan.** El cuello de botella es la **ausencia de un importador de detalle transaccional/mayor** — la misma brecha que ya se había anotado en `integracion-excel-plantillas-inteligentes.md` (sección 4.2, fila "General Ledger") como limitante de "Composición de Cuenta".

Esto significa que construir ese importador **desbloquea dos iniciativas a la vez**:
1. Plantillas Excel más ricas (Composición de Cuenta, Antigüedad de Saldos) con datos reales en vez de que el auditor aporte todo el detalle a mano.
2. Los 4 motores CAAT ya escritos empiezan a correr sobre datos reales — sin escribir una sola línea nueva de análisis.

**Se recomienda priorizar el importador de detalle transaccional por encima de construir nuevas plantillas o nuevos CAATs individuales** — es la única pieza que falta para que gran parte de lo que ya existe (motor + plantillas) deje de ser una demo y empiece a producir valor real.

### Orden sugerido si se retoma esta línea

1. Importador de detalle de mayor/transacciones (fecha, cuenta, descripción, débito, crédito, referencia, usuario) — el habilitador común.
2. Conectar `/dashboard/analytics` a datos reales (reemplazar `SAMPLE_DATA`) + agregar `@Roles(AUDITOR)` a la ruta `/ai/analytics/:type`.
3. Activar `DataAnalysisJob`/`DataFlag` como cola de resultados con triage (aceptar / falso positivo / convertir en hallazgo) — la infraestructura ya está diseñada, solo falta conectarla.
4. Con datos reales fluyendo: número redondos ligero (sobre TB, sin esperar el importador) puede activarse en paralelo, es independiente.
5. Plantillas Excel de Antigüedad de Saldos y Conciliación a Tres Vías, una vez el importador esté disponible.

---

## 5. Bitácora

| Fecha | Qué se hizo | Estado |
|---|---|---|
| 2026-08-15 | Investigación de código (motor CAATs real) + investigación externa (TeamMate/IDEA/ACL, taxonomía) + categorización motor-vs-Excel + identificación de la brecha común (importador de detalle transaccional) | Documentado, nada nuevo implementado — el motor Benford/GL/AP/Payroll/Anomaly ya existía antes de esta sesión, solo se diagnosticó |
