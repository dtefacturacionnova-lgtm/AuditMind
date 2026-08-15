# Integración con Excel — Plantillas Semiautomáticas (Zonas Libres + Zonas Controladas)

> Investigación realizada: 2026-08-15
> Fuente: documentación pública de CaseWare Working Papers/CaseView, Workiva Wdesk, Vena Solutions, TeamMate+/Wolters Kluwer, CCH Axcess Engagement (Thomson Reuters), Confirmation.com/Circit/AuditConfirm, documentación de Microsoft (Office.js, Power Query, protección de hojas)
> Contexto: propuesta de cómo AuditMind puede emular el patrón de "plantilla Excel con zonas amarradas a la base de datos del encargo + zonas libres para el auditor" que usan las firmas grandes — SIN necesitar un Add-in de Office instalado.
> **Estado: PROPUESTA — nada de esto está implementado todavía.** Este documento existe para no perder el diseño entre sesiones; actualizar la sección 7 (bitácora) cada vez que se retome.
> Ver también: [`motor-caats-estado-y-plan.md`](./motor-caats-estado-y-plan.md) — diagnóstico real del motor de CAATs (Benford/GL/AP/Payroll/Anomaly) y por qué comparte la misma brecha raíz que este documento (falta de importador de detalle transaccional/mayor).

---

## 1. Qué hacen las firmas grandes (hallazgos de la investigación)

| Producto | Mecanismo | Dato clave |
|---|---|---|
| **CaseWare Working Papers / CaseView** | "Documentos Automáticos" — ~20 tipos predefinidos, cada uno con campos enlazados en vivo al Trial Balance / Data Store del encargo. Los enlaces se pueden extender a Word/Excel/PowerPoint externos. | Es el competidor más directo de AuditMind — confirma que este patrón es la norma, no una idea aislada. |
| **Workiva Wdesk** | "Smart linking" — celda origen → celdas destino "conectadas" (bloqueadas, solo se refrescan con un botón). Resto de la hoja libre. Auditoría completa por celda. | El ejemplo más pulido visualmente de "zona libre + zona controlada". |
| **Vena Solutions** (FP&A, no auditoría, pero arquitectura idéntica) | Add-in de Excel que "templatiza" el libro — ciertas celdas amarradas a una base de datos central (CubeFLEX), resto libre. | Confirma el patrón fuera del mundo de auditoría — es una técnica genérica de la industria financiera. |
| **TeamMate+ / CCH Axcess Engagement (Thomson Reuters)** | Barra de herramientas en Word/Excel — "Insert TB Link" crea una fórmula de enlace a la cuenta del Trial Balance. **No se auto-actualiza**: al abrir el archivo muestra un mensaje pidiendo "recalcular" manualmente si hay diferencias. | Valida nuestro enfoque (Nivel 1, más abajo): incluso los líderes de mercado no hacen refresco 100% automático — requieren una acción explícita del usuario ("recalcular" / "actualizar"). |
| **TeamMate Analytics** | Librería de ~150 CAATs (Computer Aided Audit Tools) embebidos DENTRO de Excel — un eje de integración distinto al de "plantillas con zonas", más parecido a nuestro `ai-service`/módulo de muestreo estadístico. | Ver sección 6 — posible línea de trabajo separada, no se mezcla con este documento. |
| **Confirmation.com / Circit / AuditConfirm (Thomson Reuters)** | Plataformas dedicadas de confirmación externa (bancaria, legal, CxC) con API propia — el software de auditoría (ej. AuditFile) se integra vía API, no vía Excel. | Para confirmaciones externas específicamente, la práctica líder ya NO es "Excel" — es una plataforma de confirmación dedicada. Ver nota en sección 4.2. |

### Los mecanismos de Excel/Office que hacen esto posible (ninguno es propietario)

| Mecanismo | Para qué sirve |
|---|---|
| **Rangos con nombre / Tablas** | Dirección estable que un programa externo puede leer/escribir sin depender de la posición de fila/columna. |
| **Proteger hoja + "Permitir editar rangos" (Review → Allow Edit Ranges)** | Nativo desde Excel 2002 — divide la hoja en zonas bloqueadas (controladas) y desbloqueadas (libres), por rango, incluso con contraseña por rango. **Es exactamente el mecanismo que pedimos.** |
| **Power Query** | Motor ETL nativo de Excel — trae datos de un feed REST/OData autenticado a una tabla, refrescable con un botón. Convive con celdas de análisis manuales en la misma hoja. |
| **Office.js — `Bindings` API** | SDK con el que TeamMate+/Vena construyen su barra de herramientas — lee/escribe un rango con nombre desde una tarjeta lateral embebida en Excel. Requiere un Add-in instalado (Nivel 2). |

---

## 2. Los 3 niveles propuestos

| Nivel | Mecanismo | Esfuerzo | Limitación |
|---|---|---|---|
| **0** | Feed REST/OData autenticado por encargo + plantillas .xlsx con Power Query ya conectado, usando "Allow Edit Ranges" para separar zona importada de zona libre. | Muy bajo — solo exponer un endpoint + publicar plantillas. | Una sola vía (BD → Excel). No hay regreso automático de datos. |
| **1** ⭐ (foco de este documento) | Motor genérico de plantillas: al descargar, se escriben datos de AuditMind en rangos con nombre designados + zonas libres protegidas con "Allow Edit Ranges"; al volver a subir, el importador (ya tenemos parsing de .xlsx vía la lógica de `TrialBalanceImporter`) lee SOLO los rangos designados y los enruta a la(s) `PaperSection` correspondiente(s). | Bajo-medio — reutiliza infraestructura de subida/parseo de .xlsx que ya existe. Sin Add-in, sin aprobación de TI del cliente. | El auditor debe re-subir el archivo manualmente (no hay refresco en vivo dentro de Excel). |
| **2** | Add-in de Office (Office.js) con sesión ligada a AuditMind — amarre en vivo de celdas, resaltado visual, refresco sin re-subir, roll-forward automático de un período a otro. | Alto — manifiesto de Add-in, hosting del task pane, distribución (AppSource o sideload), consentimiento de administrador del tenant M365 del cliente (fricción real de adopción). | Ninguna funcional — es la opción más completa, pero no es necesaria para tener el round-trip funcionando. |

**Confirmado con la investigación de esta ronda**: el hecho de que incluso CCH Axcess Engagement (Thomson Reuters) requiera "recalcular" manualmente para refrescar sus enlaces de Trial Balance valida que el Nivel 1 (recarga manual, no streaming en vivo) **no es una versión diminuida** del patrón — es como lo hacen los líderes del mercado en la práctica.

---

## 3. Diseño del motor genérico (Nivel 1)

Inspirado directamente en que CaseWare llama **"Spreadsheet Analysis"** al primitivo genérico del que se construyen sus ~20 tipos de "Documento Automático" — no se construye cada plantilla a mano, se declara.

```ts
interface ExcelTemplateDef {
  key: string;                    // 'CONCILIACION_BANCARIA' | 'COMPOSICION_CUENTA' | ...
  label: string;
  paperCodeAplicable: string[];   // ej. ['PT-FIN-C-SUST'] — reutilizable por área (C-01..C-12)

  // Qué se escribe en el .xlsx al generarlo, y en qué rango con nombre
  origen: Array<{
    rangoNombre: string;          // 'AM_SaldoLibros', 'AM_MuestraNIA530', etc.
    fuente: (ctx: TemplateContext) => unknown;  // de qué PaperSection/tabla sale el dato
  }>;

  // Qué rangos se leen al volver a subir el archivo, y a qué PaperSection(s) se escriben
  destino: Array<{
    rangoNombre: string;
    escribeEn: { paperCode: string; sectionKey: string; areaKey?: string };
    transformacion?: (valorLeido: unknown) => unknown;
  }>;
}
```

Un registro de `ExcelTemplateDef[]` reemplaza tener que programar cada plantilla como una integración aparte — coincide con cómo CaseWare arquitecta esto internamente (confirmado en la documentación pública).

---

## 4. Catálogo de plantillas

### 4.1 Ya propuestas (sesión anterior, mantener)

| Plantilla | Papel base | Sale hacia Excel | Auditor trabaja libre | Regresa hacia |
|---|---|---|---|---|
| **Conciliación Bancaria** | C-01 (Caja y Bancos) | Saldo s/libros (TB), saldo s/banco si ya hay confirmación, partidas del período anterior (roll-forward), UAE/materialidad de referencia | Depósitos en tránsito, cheques pendientes, notas no registradas | S1 de C-01 → fluye solo a **B-08** vía "Consolidar Diferencias" |
| **Circularización / Conciliación de CxC** | C-02 | La **muestra ya seleccionada en PT-NIA530 S5** (cliente, ref., valor en libros) | Registra respuesta por cliente, procedimiento alternativo a "sin respuesta" | `auditedValue` por ítem → directo a **PT-NIA530 S5** (cierra el ciclo: seleccionar → confirmar → recalcular UEL automático) |
| **Arqueo de Caja** | C-01 | Saldo s/libros al momento del arqueo | Conteo de denominaciones, vales pendientes | S1 de C-01 (mismo destino que conciliación bancaria) |
| **Composición / Análisis de Cuenta** | Cualquier C-0X | Saldo total (TB actual + período anterior) | Desglose por concepto/categoría (detalle que el auditor aporta — ver 4.3 sobre el límite de detalle transaccional) | Subtotales por categoría + partidas inusuales → S1 de C-0X; partida inusual marcada = fila **sugerida** (no automática) en PT-HALL |

### 4.2 Nuevas — inspiradas en los ~20 "Documentos Automáticos" de CaseWare que todavía no cubríamos

Lista confirmada de CaseWare: *Account analysis, Account reconciliation, Analytical review, Chart of accounts, Chart of mapping numbers, Consolidation, Diagnostics, Document index, Document Manager, Financial statements, General ledger, History, Issues, Journals, Leadsheet/grouping, Program/checklist, Spreadsheet analysis, Tax reconciliation, Trial balance, Uncorrected misstatements.*

| Tipo CaseWare | ¿Ya lo tenemos nativo (sin Excel)? | Propuesta de plantilla Excel nueva |
|---|---|---|
| **Analytical review** | Parcial — `RatioTrendChart`/`ConcentrationChart`/`VariationChart` en PT-FIN-B07 ya calculan variaciones, pero no hay documentación de la explicación (NIA 520) por línea. | **Nueva plantilla "Revisión Analítica"**: sale la variación % ya calculada (actual vs. anterior) por cuenta/grupo; el auditor solo escribe la "Explicación de la variación" y si es razonable (Sí/No); regresa a PT-FIN-B07 como columna de explicación por fila — cierra el requisito NIA 520 que hoy no se documenta en ningún lado. |
| **Diagnostics** | Sí — `AccountSemaforo` (B-00 S6) ya marca saldos inusuales/negativos internamente. | Baja prioridad — ya está resuelto en pantalla; solo valdría la pena si se quiere un checklist de "explicado/pendiente" por auditor, exportable. |
| **Tax reconciliation** | No — específico de conciliación libro-fiscal. | **Nueva plantilla para PT-FISC-\*** (línea fiscal SV): sale la utilidad contable y las partidas no deducibles/exentas ya conocidas; el auditor concilia hasta la renta imponible; regresa la conciliación estructurada a `PT-FISC-DICT` o el papel fiscal correspondiente. Relevante para el módulo fiscal, no el financiero. |
| **General ledger** | **No — brecha real.** Solo tenemos totales de balance de comprobación (TB), no detalle transaccional. | No es una plantilla en sí — es un **habilitador**: si se construye un importador de mayor/detalle transaccional (fecha, cuenta, descripción, débito, crédito, referencia), esto fortalece de inmediato "Composición de Cuenta" (hoy limitada a que el auditor aporte el detalle) y **desbloquea 4 motores de CAATs que ya están escritos y funcionando pero sin datos reales** (GL/AP/Payroll/Anomaly — ver [`motor-caats-estado-y-plan.md`](./motor-caats-estado-y-plan.md)). **Es la pieza de mayor apalancamiento de todo este plan — desbloquea dos iniciativas a la vez.** |
| Trial balance, Leadsheet/grouping, Financial statements, Uncorrected misstatements, Journals, Issues, Program/checklist, Chart of accounts, Document index/Manager | **Sí, todos nativos** — PT-FIN-B00 (TB), PT-FIN-B01-B06 (leadsheets), PT-EEFF/PT-FIN-DICT (EEFF), PT-FIN-B08 (diferencias), PT-FIN-B09/AJEs (journals), PT-HALL (issues), PT-PROG/ProcedureGridPanel (program/checklist), AccountClassifier (chart of accounts), árbol de carpetas (document index). | No requieren Excel — ya viven mejor dentro de AuditMind que en una hoja de cálculo suelta. Se mencionan solo para dejar constancia de que el catálogo de CaseWare está cubierto casi en su totalidad, nativamente. |
| Consolidation, History | No aplican todavía | Consolidación multi-entidad (NIA 600) no es un caso de uso actual de AuditMind (un encargo = una entidad). Historial multi-período parcialmente cubierto por `RatioTrendChart`. Quedan fuera de alcance por ahora. |

### 4.3 Límite honesto a documentar

"Composición de Cuenta" y cualquier plantilla que dependa de detalle transaccional (no solo el saldo total del TB) están limitadas mientras no exista un importador de mayor/detalle de transacciones. Hoy el auditor aporta ese detalle manualmente en la zona libre — es útil igual, pero no es "traer los datos reales del sistema" hasta que se resuelva el punto de "General ledger" arriba.

---

## 5. TeamMate+ — qué tiene "más avanzado" y qué no

El usuario preguntó específicamente por TeamMate+ asumiendo que tiene más avanzada la integración. Con lo investigado:

- **En el mecanismo de enlace de celdas (el tema de este documento)**: TeamMate+/CCH Axcess Engagement usa el mismo patrón que CaseWare — fórmula de enlace a la cuenta del TB + recalculo manual. No es más avanzado en este eje específico.
- **Donde SÍ es más fuerte**: **TeamMate Analytics** — ~150 CAATs (pruebas de auditoría asistidas por computadora) embebidos directamente dentro de Excel como un panel de tareas, con una librería de tests reutilizable firm-wide ("Expert Analyzer"). Esto es un **eje de integración distinto**: no es "plantilla con zonas", es "motor de analítica corriendo dentro de Excel". AuditMind ya tiene el equivalente conceptual (el `ai-service`/módulo de muestreo estadístico, la evaluación MUS de PT-NIA530), solo que vive dentro de la web app, no dentro de Excel.
- **Conclusión**: no hace falta copiar a TeamMate+ en el eje de "zonas controladas" (ya lo cubre el Nivel 1 igual de bien que ellos) — si se quiere emular su verdadera fortaleza, sería una iniciativa futura separada: exponer las funciones de CAAT/muestreo del `ai-service` como un panel embebido en Excel (Nivel 2, con Office.js) en vez de solo dentro de la web app.

---

## 6. Plan de trabajo — Nivel 1 (actividades concretas)

> Convertido a actividades el 2026-08-15 a partir del orden ya acordado arriba. Cada actividad indica el modelo de Claude recomendado para ejecutarla, según la regla estándar del usuario (Fable 5/Opus = arquitectura nueva o seguridad multi-tenant; Sonnet = implementación sobre patrón ya establecido; Haiku = documentación/ajustes mecánicos). **Nada de esto está implementado — es la lista para revisar antes de empezar.**

**Decisión técnica pendiente de confirmar en EXC-01**: hoy `apps/api` (NestJS) no tiene ninguna librería de Excel — el único uso de `xlsx` (SheetJS) es client-side en `apps/web` para el import de Balance de Comprobación. Para escribir/leer rangos con nombre + protección de rango en el servidor se necesita algo más capaz que SheetJS community edition (que no escribe protección de hoja de forma confiable); la opción estándar en Node es **`exceljs`** (soporta `definedNames`, `protect()`, rangos protegidos). Se confirma como parte de EXC-01, no se asume todavía.

### Fase 0 — Motor genérico (una sola vez, todo lo demás depende de esto)

| ID | Actividad | Depende de | Modelo recomendado |
|---|---|---|---|
| EXC-01 | **Diseño del motor**: elegir librería Excel server-side (`exceljs` u alternativa), fijar el contrato final de `ExcelTemplateDef`, decidir cómo se nombran/versionan los rangos con nombre, y — punto crítico de seguridad — diseñar la validación del archivo subido (límite de tamaño, solo leer *valores* de los rangos declarados nunca fórmulas, rechazar hojas con macros, evitar que un rango de una organización pueda escribir en un `PaperSection` de otra). | — | **Fable 5 / Opus** — arquitectura nueva + superficie de ataque real (archivo arbitrario subido y parseado en el servidor) + aislamiento multi-tenant |
| EXC-02 | Implementar el motor: función `generarExcelDesdeTemplate(def, ctx)` y función `leerExcelSegunTemplate(def, buffer)`, siguiendo el diseño ya fijado en EXC-01. | EXC-01 | Sonnet |
| EXC-03 | Endpoints REST genéricos: `GET /working-papers/:id/excel-template/:key` (descarga) y `POST /working-papers/:id/excel-template/:key/import` (sube + enruta a las `PaperSection` destino), con `@Roles(AUDITOR)` igual que el resto del módulo. | EXC-02 | Sonnet |
| EXC-04 | Componente UI genérico reutilizable ("Descargar plantilla" / "Subir plantilla completada" con estado de progreso y errores), en el mismo estilo que las barras ya existentes (`DiferenciasPropagateBar`, etc.), listo para insertarse en cualquier papel. | EXC-03 | Sonnet |
| EXC-05 | Prueba end-to-end del motor con una plantilla trivial de un solo campo (sin lógica de negocio real todavía) + deploy a VPS, para validar el round-trip completo antes de invertir en las plantillas reales. | EXC-04 | Sonnet |

### Fase 1 — Composición de Cuenta (primera plantilla real, la más simple)

| ID | Actividad | Depende de | Modelo |
|---|---|---|---|
| EXC-06 | Definir el `ExcelTemplateDef` de Composición de Cuenta (origen: saldo TB actual + período anterior; destino: subtotales por categoría + partidas inusuales marcadas). | EXC-05 | Sonnet |
| EXC-07 | Insertar el botón de descarga/subida (EXC-04) en la vista de cualquier papel `PT-FIN-C-SUST` (C-01..C-12). | EXC-06 | Sonnet |
| EXC-08 | Probar con datos del encargo demo + deploy. | EXC-07 | Sonnet |

### Fase 2 — Conciliación Bancaria (cierre rápido hacia B-08)

| ID | Actividad | Depende de | Modelo |
|---|---|---|---|
| EXC-09 | Definir `ExcelTemplateDef` (origen: saldo s/libros, saldo s/banco si ya hay confirmación, partidas conciliatorias del período anterior; destino: S1 de C-01). | EXC-05 | Sonnet |
| EXC-10 | Wire en C-01 + confirmar que las diferencias resultantes fluyen a **B-08** vía `propagateDiferencias` (ya construido esta sesión, no requiere cambios). | EXC-09 | Sonnet |
| EXC-11 | Probar + deploy. | EXC-10 | Sonnet |

### Fase 3 — Revisión Analítica (NIA 520 — hoy sin ningún lugar donde documentarse)

| ID | Actividad | Depende de | Modelo |
|---|---|---|---|
| EXC-12 | Agregar a `PT-FIN-B07` el campo/columna "Explicación de la variación" (patrón idéntico al usado toda esta sesión para extender `paper-templates.ts`, sin `FieldType` nuevo si un tipo tabla ya sirve). | EXC-05 | Sonnet |
| EXC-13 | Definir `ExcelTemplateDef` (origen: % de variación ya calculado por cuenta/grupo, tomado de los mismos datos que alimentan `RatioTrendChart`/`VariationChart`; destino: la columna nueva de EXC-12). | EXC-12 | Sonnet |
| EXC-14 | Wire en PT-FIN-B07 + probar + deploy. | EXC-13 | Sonnet |

### Fase 4 — Circularización / Conciliación de CxC (la más valiosa — cierra el ciclo con el muestreo MUS)

| ID | Actividad | Depende de | Modelo |
|---|---|---|---|
| EXC-15 | Definir `ExcelTemplateDef` (origen: filas de **PT-NIA530 S5** filtradas por área CxC — `itemRef`, `descripcion`, `bookValue`; destino: `auditedValue` de vuelta a esas mismas filas, emparejado por `itemRef`, mismo criterio de matching que el bridge PT-A4→S5 ya construido). | EXC-05 | Sonnet |
| EXC-16 | Wire en C-02, condicionado a que exista una muestra ya cargada en PT-NIA530 (si no hay muestra, el botón debe explicar por qué está deshabilitado, no fallar en silencio). | EXC-15 | Sonnet |
| EXC-17 | Tras importar las respuestas, invocar (u ofrecer con un botón) el `recalculateSamplingEvaluation` ya existente, para que el UEL se actualice sin pasos manuales adicionales. | EXC-16 | Sonnet |
| EXC-18 | Probar + deploy. | EXC-17 | Sonnet |

### Fase 5 — Arqueo de Caja (variante menor de la Fase 2, casi gratis)

| ID | Actividad | Depende de | Modelo |
|---|---|---|---|
| EXC-19 | Definir `ExcelTemplateDef` (origen: saldo s/libros al momento del arqueo; destino: S1 de C-01, mismo destino que Conciliación Bancaria). | EXC-11 | Sonnet |
| EXC-20 | Wire + probar + deploy. | EXC-19 | Sonnet |

### Transversal — documentación

| ID | Actividad | Cuándo | Modelo |
|---|---|---|---|
| EXC-DOC | Actualizar la bitácora (sección 7) al cerrar cada fase — qué se implementó, estado real, cualquier desviación del diseño original. | Al final de cada fase | Haiku |

*(Fuera de este plan, evaluar aparte)* Importador de mayor/detalle transaccional — habilitador de plantillas futuras (Antigüedad de Saldos, Conciliación a Tres Vías) y de los 4 motores CAAT ya escritos. Ver [`motor-caats-estado-y-plan.md`](./motor-caats-estado-y-plan.md).

**Nota de secuencia**: EXC-06 a EXC-20 (fases 1-5) no dependen entre sí una vez que EXC-05 está listo — se pueden reordenar o hacer en paralelo en distintas sesiones si conviene. El único bloqueador real y compartido es completar la Fase 0.

---

## 7. Bitácora — actualizar cada vez que se retome este trabajo

| Fecha | Qué se hizo | Estado |
|---|---|---|
| 2026-08-15 | Investigación inicial (CaseWare, Workiva, Vena, TeamMate+, Power Query/Office.js) + propuesta de 3 niveles + primeras 4 plantillas | Documentado, nada implementado |
| 2026-08-15 | Ampliación: catálogo completo de los ~20 tipos de CaseWare, revisión específica de TeamMate+, plantilla "Revisión Analítica" agregada, brecha de "General Ledger" documentada | Documentado, nada implementado |
| 2026-08-15 | Sección 6 convertida de "orden recomendado" a plan de trabajo con actividades concretas (EXC-01..EXC-20 + EXC-DOC), cada una con modelo de Claude recomendado; confirmado que `apps/api` no tiene librería Excel server-side hoy (decisión pendiente en EXC-01) | Documentado, nada implementado — pendiente que el usuario confirme por dónde empezar |
