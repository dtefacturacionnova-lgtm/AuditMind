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

## 6. Orden de implementación recomendado

1. **Motor genérico** (`ExcelTemplateDef` + endpoint de generación/lectura) — una sola vez.
2. **Composición de Cuenta** — la más simple y reutilizable de inmediato en cualquier área.
3. **Conciliación Bancaria** — segunda más simple, cierre rápido hacia B-08.
4. **Revisión Analítica** (nueva de esta ronda) — reutiliza cálculos que YA existen en `AnalyticsCharts.tsx`, solo falta la ida/vuelta a Excel para la explicación de variación NIA 520.
5. **Circularización de CxC** — la más valiosa, pero depende de que PT-NIA530 S5 ya tenga la muestra cargada.
6. **Arqueo de Caja** — variante menor de la #3, casi gratis una vez hecha.
7. *(Evaluar aparte, no en este orden)* Importador de mayor/detalle transaccional — habilitador de varias plantillas futuras y de CAATs más ricos.

---

## 7. Bitácora — actualizar cada vez que se retome este trabajo

| Fecha | Qué se hizo | Estado |
|---|---|---|
| 2026-08-15 | Investigación inicial (CaseWare, Workiva, Vena, TeamMate+, Power Query/Office.js) + propuesta de 3 niveles + primeras 4 plantillas | Documentado, nada implementado |
| 2026-08-15 | Ampliación: catálogo completo de los ~20 tipos de CaseWare, revisión específica de TeamMate+, plantilla "Revisión Analítica" agregada, brecha de "General Ledger" documentada | Documentado, nada implementado |
