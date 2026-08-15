# Integración con Excel — Plantillas Semiautomáticas (Zonas Libres + Zonas Controladas)

> Investigación realizada: 2026-08-15
> Fuente: documentación pública de CaseWare Working Papers/CaseView, Workiva Wdesk, Vena Solutions, TeamMate+/Wolters Kluwer, CCH Axcess Engagement (Thomson Reuters), Confirmation.com/Circit/AuditConfirm, documentación de Microsoft (Office.js, Power Query, protección de hojas)
> Contexto: propuesta de cómo AuditMind puede emular el patrón de "plantilla Excel con zonas amarradas a la base de datos del encargo + zonas libres para el auditor" que usan las firmas grandes — SIN necesitar un Add-in de Office instalado.
> **Estado: EN CONSTRUCCIÓN.** Fase 0 (motor genérico) completa: EXC-01 (diseño + `exceljs`) y EXC-02 (`ExcelTemplateEngineService` — generar/leer, verificado con una prueba de humo de 17 casos contra la base real). Faltan EXC-03 (endpoints REST), EXC-04 (UI) y EXC-05 (prueba end-to-end vía la app + deploy) para cerrar la Fase 0, y luego las 6 plantillas del catálogo (fases 1-5). Este documento existe para no perder el diseño entre sesiones; actualizar la sección 7 (bitácora) cada vez que se retome.
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

## 3.1 Decisiones técnicas (EXC-01, cerrado el 2026-08-15)

Esta subsección fija lo que quedó decidido y ya no se re-discute en EXC-02 y siguientes. **Lo único implementado es el contrato de tipos y la dependencia**: `apps/api/src/working-papers/excel-templates/excel-template.types.ts` y `exceljs@4.4.0` en `apps/api/package.json`.

### 3.1.1 Librería Excel del lado del servidor: `exceljs@4.4.0`

`apps/api` no tenía ninguna librería de Excel. La única del monorepo era `xlsx` (SheetJS) en `apps/web`, usada client-side para importar el Balance de Comprobación (`TrialBalancePanel.tsx`, con `import('xlsx')` diferido). Los requisitos del motor son tres a la vez: **escribir y leer rangos con nombre**, **proteger la hoja dejando zonas desbloqueadas**, y **sobrevivir el round-trip** (generar → el auditor edita en Excel → volver a leer).

| Candidato | Rangos con nombre | Protección + celdas desbloqueadas | Lee y escribe | Veredicto |
|---|---|---|---|---|
| **`exceljs` 4.4.0** (MIT) | Sí — `workbook.definedNames.add()` / `.getRanges()` y `cell.name` | Sí — `worksheet.protect(pwd, opts)` + `cell.protection = { locked: false }` | Sí, ambos | ✅ **Elegida.** Es la única que cubre las tres necesidades en un solo paquete. |
| `xlsx` (SheetJS CE en npm, la que ya usa `apps/web`) | Parcial | Muy limitada | Sí | ❌ **Descartada por seguridad.** La versión publicada en npm está abandonada (el mantenedor migró a distribución propia) y `0.18.5` arrastra dos avisos **HIGH sin arreglo disponible en npm**: prototype pollution al parsear (CVE-2023-30533) y ReDoS (CVE-2024-22363). Parsear archivos subidos por el usuario es exactamente el escenario del primero. |
| `xlsx-populate` | Sí | Sí | Sí | ❌ Sin releases desde 2020. |
| `excel4node` | Sí | Sí | Sólo escribe | ❌ No sirve para el round-trip. |
| `write-excel-file` / `node-xlsx` | No | No | Parcial | ❌ Demasiado limitadas. |

**Contras asumidos de `exceljs` y cómo se mitigan:**

| Contra | Mitigación adoptada |
|---|---|
| Cadencia de releases baja (4.4.0 es de 2023). | Versión **fijada exacta** (`"exceljs": "4.4.0"`, sin `^`) y uso deliberado de la superficie de API más básica y estable. |
| [#1497](https://github.com/exceljs/exceljs/issues/1497) — nombres repetidos en hojas distintas pierden rangos. | El contrato exige que `rangoNombre` sea **único en todo el libro** y lleve prefijo `AM_`. Nunca se usan nombres con alcance por hoja. |
| [#1174](https://github.com/exceljs/exceljs/issues/1174) — rangos de fila/columna completa (`Hoja!$1:$10`) se pierden al leer. | El contrato exige **rectángulos de celdas con referencia absoluta** (`'Hoja'!$B$6:$E$45`). Nunca filas ni columnas completas. |
| Avisos de `npm audit` en la rama de dependencias. | El único aviso que `exceljs` aporta es *moderate* vía `uuid@8` (falta de bounds check **sólo cuando se pasa `buf`**, cosa que exceljs no hace); `uuid` ya estaba en el árbol por `@nestjs/schedule` y `bull`. El aviso *high* de `tmp` **no aplica**: exceljs trae `tmp@0.2.7` (ya parcheado) y sólo lo usa el lector en streaming (`lib/stream/xlsx/workbook-reader.js`), que este motor no usa — lee con `workbook.xlsx.load(buffer)`. |

**Nota sobre "Allow Edit Ranges":** ExcelJS **no** escribe el elemento `<protectedRanges>` de OOXML (el diálogo *Review → Allow Edit Ranges*, que sirve para contraseñas por rango y permisos por usuario de dominio). No hace falta: la separación zona controlada / zona libre se logra con el mecanismo base de Excel, que sí está soportado — `worksheet.protect()` + `cell.protection = { locked: false }` en las celdas libres. El resultado visible para el auditor es idéntico. En cualquier caso, la protección de Excel es una barrera de **usabilidad, no de seguridad**: se puede quitar. El motor nunca confía en que la zona controlada regresó intacta — simplemente no la lee.

### 3.1.2 Contrato de tipos

Archivo: **`apps/api/src/working-papers/excel-templates/excel-template.types.ts`** (compila limpio con `npx tsc --noEmit -p apps/api/tsconfig.json`).

El boceto de la sección 3 se mantuvo en espíritu y en nomenclatura, con cuatro cambios de fondo que salieron de leer el backend real:

| Cambio respecto al boceto | Por qué |
|---|---|
| `origen[]` pasa de "de dónde sale el dato" a **declarar el layout completo del libro**: cada entrada es `{ rango: ExcelRangoDef, fuente? }`. Todo rango con nombre —incluidos los vacíos que sólo sirven de zona libre— se declara ahí; `fuente` es opcional. | Sin layout declarado, el motor no puede generar nada. Y al obligar a que `destino.rangoNombre` exista en `origen[]`, la regla de seguridad "sólo se lee lo que nosotros escribimos" queda **impuesta por el tipo**, no por disciplina del programador. |
| `ExcelZona` (`CONTROLADA` \| `LIBRE`) se puede definir **por columna**, no sólo por rango. | Es el caso normal, no la excepción: en circularización de CxC la misma tabla lleva columnas bloqueadas (cliente, ref., valor en libros) y libres (respuesta, valor auditado). Es exactamente el look de Workiva. |
| Se agregó `modo: 'REEMPLAZA' \| 'FUSIONA_POR_CLAVE'` + `claveFusion` en `destino`. | `PT-NIA530 S5` guarda por ítem más campos de los que viaja la plantilla. Con `REEMPLAZA` a secas, subir el Excel **borraría trabajo hecho en pantalla**. El motor además nunca borra por omisión: filas que están en la BD y no en el Excel se conservan. |
| Se agregó `version: number` por plantilla, sellada en el manifiesto (§3.1.3). | Si el layout cambia (una tabla se mueve de sitio), un archivo generado con la versión anterior debe rechazarse, no leerse en las coordenadas equivocadas. |

`TemplateContext` (ahora `ExcelTemplateContext`) se diseñó a partir de lo que las plantillas del §4 realmente necesitan y de cómo el backend ya lee esos datos hoy: identidad validada (`user`, `organizationId`, `auditId`, `paperId`, `paperCode`, `areaKey?`), cabecera del encargo, y accesores **pre-scopeados al encargo** — `seccion()`/`filas()` (mismo papel, precargado, síncrono), `seccionDePapel()`/`filasDePapel()` (otro papel del mismo encargo, por `paperCode`), `saldosTB()` (PT-FIN-B00 S2, con la forma literal que ya usa `propagateTrialBalance`) y `materialidad()` (PT-A4 S3/S4/S5, la misma que `getMaterialidadByAudit`). **Ningún accesor recibe un `auditId` ni un `paperId` por parámetro**, para que una plantilla mal escrita no pueda alcanzar otro encargo.

### 3.1.3 Seguridad

Un `.xlsx` arbitrario subido por un usuario autenticado es superficie de ataque real. El diseño se apoya en un invariante y siete controles.

**Invariante:** *sólo se lee lo que el propio motor escribió.* No existe "abrir el libro y ver qué encaja". Se recorre `destino[]`, y para cada entrada se busca **ese** rango con nombre. Hojas extra, rangos con nombre añadidos por el usuario, fórmulas y cualquier otro contenido se ignoran por completo.

| # | Control | Decisión y razonamiento |
|---|---|---|
| 1 | **Tamaño** | **10 MB**, más bajo que los 25 MB que usan el resto de adjuntos de papeles (`working-papers.controller.ts`). El archivo aceptado es uno que *nosotros* generamos y cuyo tamaño ya está acotado por `filasMaximas`; un umbral bajo reduce el material disponible para una bomba de descompresión, porque el `.xlsx` es un ZIP y `workbook.xlsx.load()` lo descomprime **entero en memoria**. |
| 2 | **Sólo `.xlsx`, nunca `.xlsm`** | Se valida extensión **y** MIME (`…spreadsheetml.sheet`) **y** la firma ZIP `PK\x03\x04` sobre el buffer, porque ni la extensión ni el MIME que manda el navegador son confiables. Se rechaza cualquier libro con macros. El motor tampoco ejecuta ni evalúa nada del archivo: ExcelJS no tiene motor de cálculo. |
| 3 | **Fórmulas nunca se confían** | Si una celda destino trae fórmula, se toma **sólo el resultado cacheado**, nunca la expresión. El lector reduce además rich-text a texto plano, hipervínculos a su texto (la URL se descarta — no se guarda una URL controlada por el usuario en la BD que la UI pudiera renderizar) y celdas de error (`#REF!`, `#DIV/0!`) a `null` con advertencia. Nada de tipo `ExcelValorCelda` sale sin sanear. |
| 4 | **Aislamiento multi-tenant** | El motor **nunca escribe directo a Prisma**. Toda escritura pasa por `PaperSectionsService.updateSection(paperId, sectionKey, value, user)`, que ejecuta `assertPaperAccess` → carga el papel con su `audit.organizationId` y lanza `ForbiddenException` si no coincide con `user.organizationId` **en cada llamada**. Esto es correcto y suficiente como frontera de tenencia, pero **no es suficiente por sí solo** — ver los controles 5, 6 y 7, que cubren huecos que `updateSection` no cubre. |
| 5 | **Coherencia plantilla ↔ papel** | Antes de leer nada se verifica que el `paperCode` real del `paperId` de la URL esté en `paperCodeAplicable` de la plantilla. Sin esto se podría subir una plantilla de conciliación bancaria a un papel de otro tipo. |
| 6 | **Manifiesto sellado (HMAC)** | El archivo generado lleva, en una hoja oculta `_AuditMind`, un manifiesto con `templateKey`, `templateVersion`, `paperId`, `auditId`, `organizationId`, `generadoEn`, `generadoPor` y una **firma HMAC-SHA256** con secreto de servidor. Al subir se revalida contra el contexto de la petición. **Falla cerrado**: si falta la hoja, el JSON no parsea, la firma no valida o cualquier campo no coincide, se rechaza el archivo entero y no se escribe nada. No es la frontera de seguridad (esa la da el control 4, que revalida contra el JWT) — es el control de **integridad** que evita en la práctica subir el archivo al papel equivocado, de otro encargo, de una versión de layout retirada, o un libro fabricado a mano con rangos inventados. |
| 7 | **`sectionKey` debe existir** | ⚠️ `updateSection` hace `upsert`: si el `sectionKey` no existe, **lo crea** con `fieldType: 'TEXTAREA'` y `sortOrder: 999` en vez de fallar. Un `sectionKey` mal escrito en un `ExcelTemplateDef` ensuciaría el papel en silencio. El motor valida contra `PAPER_TEMPLATES[paperCode]` que cada `destino.escribeEn.sectionKey` exista **antes** de escribir. |

**Otros riesgos identificados y su tratamiento** (todos codificados en `EXCEL_LIMITES_POR_DEFECTO`):

- **Amplificación / zip bomb**: además del tope de tamaño, topes duros de `maxHojas` (12), `maxFilasPorTabla` (5 000), `maxColumnasPorTabla` (60), `maxCeldasLeidas` (100 000) y `maxLargoTextoCelda` (4 000). Un archivo pequeño puede declarar una malla enorme; el tope de celdas corta esa vía.
- **Timeout de parseo**: el parseo de ExcelJS **no es cancelable**, así que la lectura corre con `parseTimeoutMs` (15 s) y se aborta la petición si lo excede. En EXC-02 hay que decidir si además se aísla en un worker thread — es la única forma de recuperar de verdad el hilo si el parseo se cuelga.
- **Rol**: los endpoints de generación y subida llevan `@Roles(UserRole.AUDITOR)`. El `RolesGuard` es jerárquico (`>=`), así que eso deja fuera a `AUDITEE` (20) y `READ_ONLY` (10) y deja dentro a `SENIOR_AUDITOR` para arriba.
- **Estado del papel**: ⚠️ `assertPaperAccess` **no** mira `status` ni `checkedOutById`. Un papel `SIGNED_OFF`/`CLOSED` es hoy escribible por esta vía. El motor debe rechazar la subida en esos estados **por su cuenta** (`updateSection` no lo hará por él).
- **Límites al generar**: los mismos topes aplican en la escritura, para que el propio motor no produzca un libro que después rebote contra sus propios límites al volver.

### 3.1.4 Qué NO quedó decidido en EXC-01

La implementación de `generarExcelDesdeTemplate` / `leerExcelSegunTemplate` (EXC-02), los endpoints REST (EXC-03), el componente de UI (EXC-04) y las 6 plantillas del catálogo (§4). En EXC-02 hay que resolver además dos puntos abiertos: si el parseo se aísla en worker thread, y cómo se comporta un rango con nombre que el auditor dejó en `#REF!` por haber borrado filas (hoy el diseño dice: advertencia + saltar ese rango, sin abortar los demás).

---

## 3.2 Implementación del motor (EXC-02, cerrado el 2026-08-15)

Tres archivos nuevos en `apps/api/src/working-papers/excel-templates/`, más el registro del servicio en `working-papers.module.ts`:

| Archivo | Responsabilidad |
|---|---|
| `excel-manifest.ts` | Firma y verificación HMAC del manifiesto (control #6 de §3.1.3). Aislado a propósito — es la pieza de integridad más sensible; nunca lanza, siempre devuelve `{ok:false, razon}` ante cualquier duda. |
| `excel-cell-utils.ts` | Direcciones A1 puras (parseo/armado de rangos con nombre) + `sanearValorCelda` (control #3: fórmulas → resultado cacheado, rich text → texto, hipervínculos → solo el texto visible, errores → `null`) + coerción por `ExcelFormatoCelda`. |
| `excel-template-engine.service.ts` | `ExcelTemplateEngineService.generar()` / `.leer()` — el motor completo: construye el `ExcelTemplateContext` (identidad ya validada + accesores pre-scopeados), escribe/lee rangos con nombre, aplica protección de hoja, arma y verifica el manifiesto, aplica los 7 controles de seguridad de §3.1.3. |

**Dos precisiones sobre el boceto de EXC-01** (ambas documentadas también en los comentarios del código):
1. La convención de layout se fijó explícitamente: en la primera hoja, las filas 1-4 quedan reservadas para la cabecera del encargo que el motor imprime (título, cliente, fecha) — cualquier `ancla` de esa hoja debe empezar en la fila 6 o después.
2. El rótulo (`etiqueta`) de un rango se imprime siempre en la fila inmediatamente encima de su `ancla` — tanto para ESCALAR como para TABLA. El boceto original sugería "a la izquierda" para ESCALAR; se unificó a "encima" para no depender de que exista una columna libre a la izquierda (más robusto ante layouts que empiezan en la columna A).

**Comportamiento no trivial, documentado para quien construya las plantillas de fase 1+:**
- `FUSIONA_POR_CLAVE` hace merge campo a campo por fila (`Object.assign`) contra la fila existente que comparte `claveFusion` — preserva cualquier campo que la app haya agregado y que no viaja en la plantilla Excel; filas del Excel sin correspondencia se agregan, filas de la BD sin correspondencia se conservan.
- El timeout de parseo (`parseTimeoutMs`) evita que la petición HTTP quede colgada, pero **no** cancela el trabajo de CPU en curso — ExcelJS no es cancelable. Aislarlo en un worker thread queda abierto (no resuelto en EXC-02, ver también §3.1.4).
- Rechazo por manifiesto inválido: si se altera cualquier campo del manifiesto (incluida una prueba deliberada con `organizationId`), la verificación de firma HMAC lo atrapa primero — es la capa más fuerte y dispara antes que las comparaciones de campo individuales (paperId/auditId/organizationId), que solo importan cuando la firma sí es válida (p. ej. un archivo correctamente firmado para OTRO papel de trabajo).

**Verificación**: prueba de humo (script de un solo uso, no persistido en el repo, siguiendo el patrón ya usado toda la sesión) contra la base de datos real — crea un `WorkingPaper` temporal + una entrada temporal en `PAPER_TEMPLATES` (solo en memoria del proceso), corre `generar()` → simula al auditor editando la zona libre con ExcelJS → `leer()`, y cubre: round-trip de valores ESCALAR y TABLA, `FUSIONA_POR_CLAVE` (incluida la preservación de campos app-only y la no-duplicación al re-subir el mismo archivo), rechazo de manifiesto manipulado, rechazo de archivo válido subido al papel equivocado, y omisión silenciosa (sin escritura) de un `sectionKey` inexistente en `PAPER_TEMPLATES`. **17/17 verificaciones pasaron.** El papel temporal y sus secciones se eliminaron al final; no quedó ningún dato de prueba en la base.

**Pendiente explícito para EXC-03+**: `EXCEL_MANIFEST_SECRET` no está definido en `apps/api/.env` — el motor usa `JWT_SECRET` como respaldo (con una advertencia en el log al arrancar). Definir un secreto dedicado antes de exponer los endpoints en producción.

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
| 2026-08-15 | **EXC-01** — decisiones técnicas del motor (§3.1): librería elegida (`exceljs@4.4.0`), contrato de tipos final y diseño de seguridad (7 controles + límites duros) | **Implementado:** `apps/api/src/working-papers/excel-templates/excel-template.types.ts` + dependencia `exceljs@4.4.0` en `apps/api`. Type-check limpio. El motor y las plantillas siguen sin implementarse. |
| 2026-08-15 | **EXC-02** — implementación del motor (§3.2): `ExcelTemplateEngineService.generar()`/`.leer()`, `excel-manifest.ts`, `excel-cell-utils.ts`, registrado en `WorkingPapersModule` | **Implementado y verificado:** prueba de humo de 17 casos contra la base real (round-trip ESCALAR/TABLA, `FUSIONA_POR_CLAVE`, rechazo de manifiesto manipulado, rechazo de archivo de otro papel, `sectionKey` inexistente) — 17/17 OK. Falta EXC-03 (endpoints), EXC-04 (UI) y EXC-05 (prueba end-to-end vía la app + deploy) para cerrar la Fase 0. Pendiente: definir `EXCEL_MANIFEST_SECRET` en `.env` antes de exponer endpoints. |
