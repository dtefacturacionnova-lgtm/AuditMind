# Integración con Excel — Plantillas Semiautomáticas (Zonas Libres + Zonas Controladas)

> Investigación realizada: 2026-08-15
> Fuente: documentación pública de CaseWare Working Papers/CaseView, Workiva Wdesk, Vena Solutions, TeamMate+/Wolters Kluwer, CCH Axcess Engagement (Thomson Reuters), Confirmation.com/Circit/AuditConfirm, documentación de Microsoft (Office.js, Power Query, protección de hojas)
> Contexto: propuesta de cómo AuditMind puede emular el patrón de "plantilla Excel con zonas amarradas a la base de datos del encargo + zonas libres para el auditor" que usan las firmas grandes — SIN necesitar un Add-in de Office instalado.
> **Estado (2026-08-15): CATÁLOGO COMPLETO — LAS 5 PLANTILLAS IMPLEMENTADAS Y VERIFICADAS.** Motor genérico (EXC-01/02), endpoints REST (EXC-03) y componente de UI (EXC-04) construidos, verificados en dos niveles y reforzados tras una revisión de calidad (§3.2.1), desplegados y confirmados en producción. Sobre esa base ya se construyeron y probaron con datos demo reales las 5 plantillas del catálogo: **fase 1** Composición de Cuenta (§3.6, desplegada), **fase 2** Conciliación Bancaria (§3.7), **fase 3** Revisión Analítica NIA 520 (§3.8), **fase 4** Circularización de CxC NIA 505 (§3.9) y **fase 5** Arqueo de Caja NIA 501 (§3.10) — estas últimas 4 con deploy PENDIENTE, batched a la espera de que el usuario tenga datos móviles (la ruta de red rota entre su ISP y el datacenter de Hostinger solo se resuelve así). Este documento existe para no perder el diseño entre sesiones; actualizar la sección 7 (bitácora) cada vez que se retome.
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

### 3.2.1 Refuerzos de la revisión de calidad (Fable, 2026-08-15)

Revisión línea por línea de EXC-01..EXC-04 con 8 hallazgos, todos corregidos y cubiertos por pruebas nuevas:

| # | Hallazgo | Corrección |
|---|---|---|
| 1 | **`FUSIONA_POR_CLAVE` sobreescribía columnas CONTROLADAS** en filas emparejadas — quien quitara la protección de Excel y alterara p. ej. `bookValue` lo metía a la BD, contradiciendo el invariante de §3.1.3. | El merge ahora copia **sólo columnas de zona LIBRE** en filas emparejadas; las CONTROLADAS nunca tocan la BD (la clave de fusión se usa sólo para emparejar). Filas NUEVAS (obra del auditor) sí entran completas. |
| 2 | **Filas sin valor en la clave de fusión se agregaban siempre** — cada re-subida del mismo archivo duplicaba esas filas sin posibilidad de emparejarlas. | Se omiten con advertencia visible al auditor. Además una clave repetida dentro del mismo archivo ya no genera duplicados (se registra al agregar). |
| 3 | **`areaKey` se perdía en el round-trip** — crítico porque C-01..C-12 comparten `paperCode` (`PT-FIN-C-SUST`): al importar, `transformacion`/`validacion` no sabían de qué área venía el archivo. | `areaKey` viaja **dentro de la firma HMAC del manifiesto** y el motor lo restaura en el contexto al importar. El endpoint de descarga acepta `?areaKey=` y `ExcelTemplateBar` lo expone como prop. |
| 4 | **`sanearValorCelda` no reconocía `sharedFormula`** (fórmulas arrastradas/auto-rellenadas, que en ExcelJS no traen la clave `formula`) — se perdían como "tipo no reconocido". | Se tratan igual que `formula`: sólo el resultado cacheado. |
| 5 | **Fechas `dd/mm/yyyy` tecleadas como texto fallaban** (`new Date('15/08/2026')` es inválido en V8, que parsea estilo US) — exactamente como escriben fechas los usuarios de LATAM. | Parser explícito `dd/mm/yyyy` (y variantes con `-`/`.`) con validación de rango, antes del fallback ISO. |
| 6 | `ENTERO` no redondeaba (aceptaba 3.7 como entero). | `Math.round` en la coerción. |
| 7 | **`validarDef` no validaba el layout** — un `ExcelTemplateDef` mal escrito (ancla pisando la cabecera, hoja con nombre ilegal o reservado, opciones de lista con comas o >250 caracteres, `claveFusion` que no es columna, FUSIONA sobre un ESCALAR) fallaba tarde o en silencio. | Validación estructural completa al arrancar cualquier operación, con mensajes que nombran la plantilla y el rango exactos. |
| 8 | `worksheet.protect()` pasaba `objects: true, scenarios: true` — en la semántica de exceljs son banderas de **permiso**, es decir permitía manipular objetos/escenarios en la hoja protegida. | Ambas en `false`; sólo se permite seleccionar celdas. |

Durante la verificación, la propia suite atrapó un error introducido por el refuerzo #3 (la verificación del manifiesto reconstruía el payload sin `areaKey` → toda firma con área fallaba) — corregido antes de commitear. **Suites finales: 25/25 (nivel servicio, incluye casos nuevos de manipulación de columna controlada, fila sin llave, fecha dd/mm/yyyy, areaKey restaurado y rechazo de layout inválido) + 10/10 (HTTP real, incluye descarga con `?areaKey=`).**

Notas para autores de plantillas (fases 1-5), también en los comentarios del contrato: en modo `REEMPLAZA` las columnas controladas sí regresan del archivo (usar tablas de zona LIBRE completa o datos re-derivables); el override de `maxUploadBytes` por plantilla sólo puede bajar el límite efectivo (el `FileInterceptor` corta en 10 MB).

---

## 3.3 Endpoints y registro de plantillas (EXC-03, cerrado el 2026-08-15)

- `apps/api/src/working-papers/excel-templates/excel-templates.registry.ts` — `EXCEL_TEMPLATES: Partial<Record<ExcelTemplateKey, ExcelTemplateDef>>`, espeja la convención de `PAPER_TEMPLATES`. **Vacío a propósito**: las 6 plantillas del catálogo (§4) son las fases 1-5, todavía sin construir. Agregar una entrada aquí es lo único que hace falta para publicar cada una — el motor y los endpoints ya están listos.
- `GET /working-papers/:id/excel-template/:key` — descarga (`@Roles(AUDITOR)`); 404 si `key` no está en el registro.
- `POST /working-papers/:id/excel-template/:key/import` — subida (`@Roles(AUDITOR)`, `FileInterceptor`, 10 MB); valida extensión `.xlsx` antes de pasarle el buffer al motor.
- Ambos reutilizan el patrón ya existente en el controlador para PDF/adjuntos (mismo estilo de `Content-Disposition` y de `FileInterceptor` que `GET :id/pdf` y `POST :id/sections/:sectionKey/attachments`).

---

## 3.4 Componente de UI genérico (EXC-04, cerrado el 2026-08-15)

- `apps/web/src/components/working-papers/ExcelTemplateBar.tsx` — `<ExcelTemplateBar paperId templateKey label description? />`. Dos botones ("Descargar plantilla" / "Subir completada") + input de archivo oculto + resumen del resultado (secciones actualizadas, advertencias por rango). Reutiliza `apiClient.downloadFile`/`apiClient.postForm`, que ya existían (usados hoy por PDF y por Anexo 12 fiscal) — no hizo falta agregar plumbing nuevo de red.
- `useImportExcelTemplate()` en `useWorkingPaperGraph.ts` — mutación con `postForm`, invalida `['wp', paperId]` al terminar, mismo patrón que `usePropagateDiferencias` y el resto de los botones "Bar".
- **A propósito, todavía NO se inserta en ningún papel real** — según el orden del plan (§6), conectarlo a una plantilla concreta es tarea de cada fase (p. ej. EXC-07 para Composición de Cuenta), no de EXC-04. Con el registro de plantillas vacío (§3.3), no hay ningún `templateKey` real contra el cual probarlo en la UI todavía.

---

## 3.5 Prueba de extremo a extremo (EXC-05, cerrado el 2026-08-15)

A diferencia de la prueba de humo de EXC-02 (que llamaba a `ExcelTemplateEngineService` directo), esta prueba levanta la app NestJS **completa** (`NestFactory.create` + los mismos pipes/prefijo de `main.ts`) en un puerto local efímero y ejercita los endpoints con `fetch` real — cubre exactamente lo que EXC-02 no podía: el guard de roles, `FileInterceptor`/multipart real, y los códigos de estado HTTP.

- Login real contra Supabase con el usuario demo `cae@demo.cl` (rol CAE, jerárquicamente por encima de AUDITOR — el mismo mecanismo de `RolesGuard` ya usado por el resto de la API).
- Plantilla trivial registrada solo en memoria del proceso de prueba (un rango ESCALAR de moneda) + un `WorkingPaper` temporal, igual que en EXC-02.
- **9/9 verificaciones pasaron**: sin token → 401 · clave inexistente → 404 · descarga → 200 con `Content-Disposition` · extensión inválida (`.txt`) → 400 · subida válida → 201 (default de NestJS para `@Post`, no es un error) · la sección se actualizó correctamente en la base tras el ciclo HTTP completo.
- Papel temporal y sesión se limpiaron al final; no quedó ningún dato de prueba.
- **Deploy: COMPLETO.** El primer intento (`ssh vps-muestreo`) falló por timeout de conexión SSH — diagnosticado en vivo con el usuario: no era un problema del VPS (el panel de Hostinger lo mostraba `Running`, 1% CPU, y la web pública respondía desde un vantage externo) sino una ruta de red rota entre el ISP del usuario y el datacenter de Hostinger en Boston (confirmado con traceroute — los paquetes morían tras el salto a `telefonica-ca.net`). Cambiar a datos móviles resolvió la ruta. Con conectividad restablecida: `git pull` (confirmado en `fa789da`) → `npm install --workspace=apps/api` (instala `exceljs`) → `turbo build --filter=@auditmind/api --filter=@auditmind/web` (2/2 exitoso, 1m41s, lanzado con `nohup` para sobrevivir cortes de la red móvil) → `pm2 restart auditmind-api auditmind-web`.
- **Verificación post-deploy**: `pm2 list` con PIDs nuevos y estado `online` · log de arranque con `Nest application successfully started` sin errores · el warning diseñado de `EXCEL_MANIFEST_SECRET` se disparó exactamente como se esperaba (confirma que ese código realmente corre en producción, no solo en local) · las 2 rutas nuevas (`GET`/`POST .../excel-template/:key[/import]`) aparecen mapeadas en el log · `curl` contra el endpoint real sin token → `401` (el guard de roles funciona) · la web pública responde `307` (redirect a `/login`, comportamiento normal sin sesión).
- **Pendiente para producción**: definir `EXCEL_MANIFEST_SECRET` en `apps/api/.env` del VPS (hoy usa el respaldo `JWT_SECRET`, con advertencia en el log — funcional pero no ideal a largo plazo).

**Fase 0 completa: en código, verificada y en producción.** El motor genérico, los endpoints y el componente de UI están construidos, verificados en tres niveles (servicio, HTTP real local, y arranque/enrutado en producción) y desplegados. Lo único que falta para que un auditor pueda usar esto de verdad es construir la primera plantilla real (§6, fase 1: Composición de Cuenta).

---

## 3.6 Fase 1 — Composición de Cuenta (primera plantilla real, cerrada el 2026-08-15)

**Decisión de diseño que cambia lo propuesto en §4.1**: el destino original especulaba "Subtotales por categoría + partidas inusuales → S1 de C-0X". Al implementar se descubrió que `PT-FIN-C-SUST` ya tiene una sección **S7 — "Analítica de Cuentas — Desagregación por Cuenta del Mayor"** (`FieldType.ACCOUNT_SCHEDULE`, componente `AccountScheduleSection.tsx`) que es EXACTAMENTE el concepto de "Composición de Cuenta": una fila libre por cuenta del mayor, con ajustes, reclasificaciones, marca de auditoría (tick mark) y adjunto por fila. La plantilla Excel hace **round-trip de S7**, no escribe en S1 (que es para diferencias/excepciones — un concepto distinto). Esto es mejor que el diseño original: reutiliza una interfaz ya tipada y ya usada en pantalla, en vez de inventar un destino nuevo.

- **Archivo**: `apps/api/src/working-papers/excel-templates/composicion-cuenta.template.ts`, registrado en `excel-templates.registry.ts`.
- **Diseño de zonas**: NINGUNA columna es CONTROLADA en la hoja "Cédula" — ni siquiera el saldo, porque en S7 el propio auditor transcribe y verifica el saldo contra el TB (no es un valor que la app imponga). Por eso se agregó una segunda hoja "Saldos TB" (CONTROLADA, de solo consulta, nunca se lee de vuelta) con el Balance de Comprobación completo (`ctx.saldosTB()`), para que el auditor tenga la referencia sin salir de Excel.
- **`transformacion` hace su propio merge por `accountCode`**, en vez de usar `modo: 'FUSIONA_POR_CLAVE'` del motor genérico: una fila NUEVA de `AccountScheduleRow` necesita `id` y `attachments` que el motor no puede fabricar de forma segura para filas nuevas sin arriesgar pisarlos en las existentes. Se implementó con acceso directo a la fila completa vía `ctx.filas('S7')`.
- **Bug encontrado y corregido durante la prueba** (no en el motor — en esta plantilla específica): la primera versión de `transformacion` solo hacía fallback al valor previo en `accountName`; los demás campos (`balanceCurrent`, `adjustments`, `reclassifications`, `tickMark`, `notes`) se reseteaban a `0`/`''` si la celda venía en blanco en una re-subida, en vez de conservar el valor existente. Corregido con dos helpers (`strOr`/`numOr`) que aplican la misma regla a los 5 campos: celda en blanco en una fila YA existente = "el auditor no la tocó" → se conserva; solo una fila NUEVA usa el default. Se agregaron 4 verificaciones de regresión específicas para este caso.
- **Verificación**: prueba de humo contra un papel `PT-FIN-C-SUST` REAL del audit demo "Auditoria Financiera FECE" (`IN_PROGRESS`, no `SIGNED_OFF` — el propio control de seguridad #4 de EXC-QA rechazó correctamente el primer intento contra un papel firmado del audit "Empresa Comercial Demo" principal, confirmando que ese control funciona en un caso real, no solo simulado). **17/17 verificaciones pasaron**, incluida la regresión del bug de arriba. La sección S7 del papel "Caja y Bancos — Conciliaciones Bancarias y Arqueo" quedó llena con un ejemplo realista (2 cuentas, un ajuste propuesto, notas de auditoría) — no se revirtió, enriquece el demo.
- **UI**: `ExcelTemplateBar` insertado en `SectionField.tsx`, condicionado a `section.fieldType === 'ACCOUNT_SCHEDULE' && paperCode === 'PT-FIN-C-SUST' && !readonly` (S7 con `ACCOUNT_SCHEDULE` también existe en otros 3 papeles no relacionados — el filtro por `paperCode` evita que el botón aparezca ahí).
- **Deploy: COMPLETO.** `git pull` (commit `f6e26ee`) → `turbo build` (2/2, ~1m) → `pm2 restart`. Verificado: log de arranque limpio, las 2 rutas del motor siguen mapeadas, y `grep COMPOSICION_CUENTA` contra el `dist/` compilado del VPS confirma que el registro quedó publicado en producción.
- **Anomalía observada durante la verificación manual en navegador (no en el código de esta fase)**: al abrir por primera vez la página del papel en un servidor de desarrollo local, el valor de S7 volvió a `null` una sola vez. Diagnóstico: `PaperSectionsService.getSections()` tiene una lógica de auto-sincronización pre-existente (de una fase anterior de este proyecto, no tocada hoy) que limpia el valor de una sección cuando detecta que su `fieldType` migró hacia un tipo estructural — probablemente esta fila de `PaperSection` llevaba tiempo sin que nadie abriera esa página real, así que fue la primera vez que ese chequeo corrió contra ella. El motor de Excel escribe por una ruta completamente distinta (`updateSection` directo, sin pasar por `getSections()`), así que no es una falla del código de EXC-06/07/08. Se restauró el contenido y se confirmó que `getSections()` llamado dos veces seguidas ya no lo vuelve a limpiar (queda estable). **Efecto secundario real y honesto**: correr varios servidores de desarrollo locales en paralelo (web + API) agotó momentáneamente el pool de conexiones compartido de Supabase (`max clients reached, pool_size: 15`), lo cual también generó un par de errores breves en los logs de la API de **producción** (mismo pool). Se detuvieron los servidores locales de inmediato al notarlo. No hubo impacto visible más allá de esos dos errores puntuales en el log.

---

## 3.7 Fase 2 — Conciliación Bancaria (cerrada el 2026-08-15)

**Primera plantilla que combina varios rangos en un solo cálculo** — saldo según banco, saldo según libros y fecha de corte (3 celdas ESCALAR independientes) más una tabla de partidas conciliatorias, todo reducido a UNA fila calculada. Esto expuso una limitación real del motor: `transformacion` solo veía el valor de SU PROPIO rango, no el de sus rangos hermanos de la misma subida.

- **Refuerzo de motor (EXC-09)**: nuevo accesor `ExcelTemplateContext.rangoLeido(rangoNombre)` — expone el valor YA parseado de cualquier otro rango declarado en `origen[]` de la MISMA subida (no hace falta que sea un `destino`). Solo tiene valor real durante `leer()`; en `generar()` siempre es `null`. Implementación: el `Map<rangoNombre, ExcelValorLeido>` que ya existía se declara ANTES de construir `ctxImport`, y el accesor es un cierre sobre ese mismo Map — para cuando el bucle de `destino` llama a `transformacion`, el Map ya está completo. Refuerzo genérico y reutilizable, no específico de esta plantilla.
- **Archivo**: `apps/api/src/working-papers/excel-templates/conciliacion-bancaria.template.ts`. Hoja "Conciliación" (100% LIBRE: `AM_SaldoBanco`, `AM_SaldoLibros`, `AM_FechaCorte` como ESCALAR + `AM_Partidas` como TABLA con columnas `tipo`/`afecta`/`descripcion`/`monto`/`fecha`) + hoja "Saldos TB" (referencia, mismo patrón que fase 1).
- **Diseño de la tabla de partidas**: en vez de adivinar el signo por `tipo` (frágil — "depósito en tránsito" no siempre suma, depende de la convención del papel), cada partida declara explícitamente **`afecta`** (Banco/Libros) y un **`monto` con signo** que el propio auditor decide. Esto es más simple de explicar y evita un mapeo tipo→signo que se rompe con la primera excepción real.
- **Destino**: `transformacion` (anclado a `AM_Partidas`, lee `AM_SaldoBanco`/`AM_SaldoLibros`/`AM_FechaCorte` vía `rangoLeido`) calcula `saldoBancoConciliado`/`saldoLibrosConciliado`/`diferencia`, y escribe (o retira) una fila en **S1** ("Diferencias Identificadas", la MATRIX que ya alimenta B-08). Merge propio por marcador `_excelOrigen` (prefijo `_` = campo interno, `MatrixGridPanel.deriveColumns()` ya lo excluye de las columnas visibles — confirmado leyendo el código, no asumido): cada re-subida reemplaza SOLO la fila que esta plantilla escribió antes, nunca toca hallazgos que el auditor agregó a mano en la UI. Si la diferencia recalculada da `< 0.01`, la fila se retira en vez de dejarse en cero.
- **Nota de alcance conocida**: `PT-FIN-C-SUST` es el mismo `paperCode` de las 14 áreas sustantivas (C-01..C-14) y no hay señal programática para distinguir "esta instancia es Caja y Bancos" — el botón se muestra en S1 de cualquier área. Documentado en el registro; una mejora futura sería un `areaTag` en `WorkingPaper`.
- **Verificación**: 11/11 en la prueba de humo de la plantilla contra el mismo papel demo real de fase 1 (diferencia calculada correctamente, marca `_excelOrigen`, re-subida no duplica, la conciliación sin diferencia retira la fila sin tocar un hallazgo manual simulado, estado restaurado al final) + **verificación end-to-end adicional del ciclo completo hacia B-08**: se generó una diferencia real vía la plantilla, se corrió `propagateDiferencias` (el mismo "Consolidar Diferencias" que usa la UI) contra el papel B-08 real de la auditoría demo, y se confirmó que la diferencia llegó con el monto exacto — 2/2 OK, con restauración completa de B-08 S1/S2/S3 y de C-01 S1 al finalizar (`propagateDiferencias` sobrescribe S1/S2/S3 por completo, así que se capturó y restauró el estado original antes de correr la prueba).
- **UI**: `ExcelTemplateBar` insertado en `SectionField.tsx`, justo antes del render genérico de MATRIX, condicionado a `paperCode === 'PT-FIN-C-SUST' && section.sectionKey === 'S1' && !readonly`.

---

## 3.8 Fase 3 — Revisión Analítica / NIA 520 (cerrada el 2026-08-15)

**Decisión de diseño**: el catálogo (§4.2) especulaba escribir la explicación de cada variación como columnas nuevas en **S1** de `PT-FIN-B07`. Se descartó al leer `propagateFinancialAnalysis` en `paper-sections.service.ts`: cada vez que el auditor pulsa "Propagar desde Balance" hace un `update` directo de S1 completo (sin merge alguno), así que cualquier columna agregada ahí se habría perdido en el primer refresco del análisis horizontal. Se creó en su lugar una sección **nueva e independiente, `S1c`** (`MATRIX`, `sortOrder: 3`, con renumeración de S2-S6 para hacerle espacio en `paper-templates.ts`), que esa propagación nunca toca.

- **Archivo**: `apps/api/src/working-papers/excel-templates/revision-analitica.template.ts`, registrado en `excel-templates.registry.ts`. Una sola hoja ("Explicación de Variaciones"), un solo rango TABLA (`AM_Explicaciones`, `filasMinimas: 5`).
- **Primera plantilla del catálogo sin `transformacion` propia**: usa `modo: 'FUSIONA_POR_CLAVE'` (`claveFusion: 'codigo'`) nativo del motor genérico directamente. A diferencia de Composición de Cuenta (necesita fabricar `id`/`attachments`) o Conciliación Bancaria (una sola fila calculada con marcador `_excelOrigen`), `S1c` es un MATRIX plano sin campos especiales — el merge por clave del motor alcanza sin ayuda: las columnas CONTROLADA (`codigo`, `cuenta`, `variacionPct`) se refrescan solas en cada descarga, las LIBRE (`explicacion`, `esRazonable`) las conserva el motor automáticamente.
- **Filtro de significancia**: `fuente` lee `ctx.filas('S1')` y `ctx.materialidad()`, y solo trae variaciones con `|Variación %| > 20` **y** `|Variación $| > Materialidad de Ejecución` — evita que el auditor tenga que revisar decenas de cuentas con movimiento trivial, alineado con el `aiHint` que S1 ya documentaba pero que ningún flujo real forzaba.
- **`fuente` también fusiona con lo ya documentado**: antes de devolver las filas, cruza cada variación significativa contra `ctx.filas('S1c')` (lo que el auditor ya haya guardado en una subida anterior) por `codigo`, y conserva `explicacion`/`esRazonable` si existen — mismo principio que el round-trip de S7 en fase 1: una re-descarga nunca debe mostrar en blanco un avance que ya existía.
- **Verificación**: prueba de humo contra el papel `PT-FIN-B07` real de "Auditoria Financiera FE&CE 2025" (18 filas reales de Análisis Horizontal, materialidad ya cargada vía PT-A4: MG=25000, ME=15000). **12/12 verificaciones pasaron**, incluida la protección de columna CONTROLADA (alterar `variacionPct` a mano en el Excel no sobrescribe el valor real) y el round-trip de lo ya documentado. Dos bugs encontrados fueron de la PRUEBA, no del motor ni de la plantilla: (1) el conteo de "4 variaciones significativas" inicialmente incluía la fila de relleno de `filasMinimas` (celda vacía) como si fuera dato — corregido filtrando `codigo` no vacío antes de contar; (2) la comparación de `variacionPct` fallaba por `===` estricto entre número y string — corregido a `Number(...) === 26.32`, ya que la columna se guarda como número real (`formato: 'NUMERO'`), no como texto. S1c se restauró a su estado original (vacía) al finalizar.
- **UI**: `ExcelTemplateBar` insertado en `SectionField.tsx`, condicionado a `section.fieldType === 'MATRIX' && paperCode === 'PT-FIN-B07' && section.sectionKey === 'S1c' && !readonly`.
- **Deploy: PENDIENTE** — junto con fase 2, a la espera de que el usuario tenga datos móviles disponibles para una sola subida batched (la ruta de red rota entre su ISP y el datacenter de Hostinger solo se resuelve con datos móviles, y el usuario se quedó sin saldo).

---

## 3.9 Fase 4 — Circularización de CxC / NIA 505 (cerrada el 2026-08-15)

**Sin cambios de esquema**: a diferencia de fase 3 (que necesitó una sección nueva), esta plantilla hace round-trip directo de `PT-NIA530 S5` (`SampleItemRegisterPanel.tsx`, tipo `SampleItemRow`) sin tocar `paper-templates.ts` ni el modelo de datos. Los campos que NIA 505 necesita ya existían en `SampleItemRow`: `descripcion` sirve para la respuesta del cliente o la nota del procedimiento alternativo, `execRef` para la referencia del papel de ejecución cuando no hubo respuesta, `fecha` para la fecha de respuesta, y `auditedValue` es literalmente el valor confirmado — el mismo campo que ya alimenta el cálculo de tainting % en pantalla y el UEL de S4. Se descartó agregar un campo enum de "tipo de respuesta" (Confirmado sin diferencia / con diferencia / sin respuesta) — habría tocado `SampleItemRegisterPanel.tsx`, `SamplingEvaluationPanel.tsx` y el renderer de PDF de `PT-NIA530` para un beneficio marginal frente a dejar que el auditor lo describa en `descripcion`, ya libre.

- **Archivo**: `apps/api/src/working-papers/excel-templates/circularizacion-cxc.template.ts`, registrado en `excel-templates.registry.ts`. Una sola hoja ("Circularización"), un solo rango TABLA (`AM_Confirmaciones`).
- **Segunda plantilla sin `transformacion` propia** (tras Revisión Analítica): `FUSIONA_POR_CLAVE` nativo, pero por primera vez la `claveFusion` es el **`id` interno** del ítem (`smpl_...`, asignado por la app al crear la fila) en vez de un campo de negocio como `accountCode` o `codigo`. Es la única clave segura aquí: `itemRef` (la referencia que el propio auditor escribe) no está garantizada única entre ítems de áreas distintas dentro de la misma S5 — usarla como llave habría arriesgado fusionar por accidente dos ítems de áreas distintas que compartieran referencia.
- **Diseño de zonas**: CONTROLADA — `id` (bloqueada y rotulada "no editar", es la llave interna, no un dato de negocio), `area`, `itemRef`, `bookValue` (se refrescan solos en cada descarga). LIBRE — `descripcion`, `auditedValue`, `fecha`, `execRef` (donde trabaja el auditor).
- **`id` como llave protege contra creación accidental de ítems nuevos**: como es CONTROLADA, una fila de relleno (`filasMinimas`) sin `id` se omite (`omitidasSinClave`) en vez de crearse — la plantilla es puramente de RESPUESTA sobre ítems que ya existen (creados en pantalla o importados de PT-A4 en fase anterior), nunca de alta. Documentado como riesgo aceptado si alguien altera el `id` a mano (idéntico al de `codigo`/`accountCode` en fases 2-3, no específico de esta).
- **Nota de alcance conocida** (mismo patrón que Conciliación Bancaria): `PT-NIA530` es un solo papel para TODO el encargo — S5 mezcla ítems de CxC, CxP, Inventarios, Caja, etc. en la misma tabla. La plantilla trae TODOS los ítems, no solo los de C-02; el auditor solo trabaja las filas que le correspondan. El mecanismo de filtro por `areaKey` ya existe en el motor desde EXC-09 (sellado en el manifiesto, restaurado al importar) pero no se usó aquí — falta una UI para elegir el área antes de descargar, que no existe hoy en `ExcelTemplateBar`. Se deja para una mejora futura si el volumen de ítems por encargo lo justifica.
- **Verificación**: prueba de humo contra el papel `PT-NIA530` real de "Empresa Comercial Demo SA de CV" (18 ítems reales de muestreo, `NOT_STARTED`). **16/16 verificaciones pasaron**: los 18 IDs del Excel calzan exactamente con los de la BD, tres escenarios de respuesta simultáneos (confirmación sin diferencia, confirmación con diferencia, sin respuesta con procedimiento alternativo — con el campo `auditedValue` quedando en `null`, no en `0`, cuando la celda se deja en blanco), protección de columnas CONTROLADA (alterar `area`/`bookValue` a mano no sobrescribe la BD), y — el caso propio de esta plantilla — los `attachments` de un ítem no tocado sobreviven intactos porque el merge por clave escribe sobre el objeto completo existente, no lo reemplaza. Estado restaurado al final.
- **UI**: `ExcelTemplateBar` insertado en `SectionField.tsx`, condicionado a `section.fieldType === 'SAMPLE_ITEM_REGISTER' && paperCode === 'PT-NIA530' && !readonly`.
- **Deploy: PENDIENTE** — junto con fases 2-3, a la espera de que el usuario tenga datos móviles disponibles para una sola subida batched.

---

## 3.10 Fase 5 — Arqueo de Caja / NIA 501 (cerrada el 2026-08-15, catálogo completo)

**Última plantilla del catálogo.** Estructura casi idéntica a Conciliación Bancaria (fase 2): varios rangos ESCALAR + TABLA combinados en un solo cálculo vía `ctx.rangoLeido()`, una única fila calculada escrita en S1 de `PT-FIN-C-SUST`. La diferencia real es que aquí son DOS tablas de origen, no una — conteo de denominaciones (billetes y monedas USD, `opciones` con los 12 valores estándar: $100 a $0.01) y vales/comprobantes de caja chica pendientes de reembolso —, ambas leídas por la `transformacion` anclada en la tabla de denominaciones. El subtotal por denominación (`denominación × cantidad`) y el total se calculan al procesar el archivo — la plantilla no depende de que el auditor escriba fórmulas de Excel, que de todas formas el motor solo lee como su resultado cacheado (control de seguridad #3, ya documentado en §3.1.3).

- **Archivo**: `apps/api/src/working-papers/excel-templates/arqueo-caja.template.ts`, registrado en `excel-templates.registry.ts`. Hoja "Arqueo de Caja" (saldo según libros, fecha, tabla de denominaciones, tabla de vales) + hoja "Saldos TB" (referencia, mismo patrón que fase 2).
- **Marcador `_excelOrigen` propio y DISTINTO al de Conciliación Bancaria a propósito**: ambas plantillas comparten destino (S1 de C-01) porque un mismo papel de Caja y Bancos normalmente necesita las dos — una concilia el banco, la otra arquea el efectivo físico. Si se usaran el mismo marcador, la segunda plantilla en subirse borraría el resultado de la primera. Con marcadores distintos (`CONCILIACION_BANCARIA` vs `ARQUEO_CAJA`), cada una reemplaza únicamente su propia fila, sin tocar la de la otra ni los hallazgos que el auditor haya agregado a mano.
- **Verificación**: prueba de humo contra el mismo papel `PT-FIN-C-SUST` real de fase 2 ("Caja y Bancos — Conciliaciones Bancarias y Arqueo" de "Auditoria Financiera FECE"), con un hallazgo manual simulado Y una fila de Conciliación Bancaria simulada YA presentes en S1 antes de correr la prueba. **16/16 verificaciones pasaron**: un descuadre real ($1,380 según libros vs. $1,250 contado = diferencia de -$130) se agrega correctamente sin tocar las otras 2 filas; una re-subida con conteo que sí cuadra retira la fila propia de Arqueo de Caja sin afectar la de Conciliación Bancaria ni el hallazgo manual. Un hallazgo de la prueba (no del motor): la comparación por `JSON.stringify` de filas leídas de vuelta desde Postgres fallaba porque JSONB reordena las claves del objeto al persistir — se corrigió comparando por claves ordenadas. Estado restaurado al final.
- **UI**: `ExcelTemplateBar` insertado en `SectionField.tsx`, junto al de Conciliación Bancaria — misma condición (`paperCode === 'PT-FIN-C-SUST' && section.sectionKey === 'S1' && !readonly`), ambos botones visibles a la vez.
- **Deploy: PENDIENTE** — junto con fases 2-4, a la espera de que el usuario tenga datos móviles disponibles para una sola subida batched.

**Catálogo completo: las 5 plantillas planificadas están construidas y verificadas.** Queda pendiente únicamente el deploy batched de fases 2-5 (fase 1 ya está en producción) y, aparte del catálogo original, la brecha de "General Ledger" (§4.2) documentada como la pieza de mayor apalancamiento pendiente del plan más amplio.

---

## 4. Catálogo de plantillas

### 4.1 Ya propuestas (sesión anterior, mantener)

| Plantilla | Papel base | Sale hacia Excel | Auditor trabaja libre | Regresa hacia |
|---|---|---|---|---|
| **Conciliación Bancaria** ✅ **IMPLEMENTADA (fase 2, 2026-08-15)** | PT-FIN-C-SUST (cualquier área — ver nota de alcance en el registro) | Todo el TB (hoja de referencia) | Saldo banco, saldo libros, fecha de corte, partidas conciliatorias (depósitos en tránsito, cheques pendientes, notas no registradas) — todo LIBRE | Si queda diferencia real (\|dif\| ≥ 0.01): fila calculada en **S1** (marcada `_excelOrigen`, se reemplaza sola en cada re-subida, nunca toca hallazgos manuales) → fluye a **B-08** vía "Consolidar Diferencias" (verificado end-to-end) |
| **Circularización / Conciliación de CxC** ✅ **IMPLEMENTADA (fase 4, 2026-08-15)** | C-02 (aplica sobre `PT-NIA530`, el mismo papel que centraliza el muestreo de todo el encargo — ver nota de alcance en §3.9) | La **muestra ya seleccionada en PT-NIA530 S5** (área, ítem/ref., valor en libros — CONTROLADA) | Valor confirmado, descripción/respuesta del cliente, fecha de respuesta y, si no hubo respuesta, la referencia del procedimiento alternativo | `auditedValue` (+ descripción/fecha/ref.) por ítem → directo a **S5 de PT-NIA530** vía `FUSIONA_POR_CLAVE` nativo por `id` (cierra el ciclo: seleccionar → confirmar → recalcular UEL con el botón ya existente en S4) |
| **Arqueo de Caja** ✅ **IMPLEMENTADA (fase 5, 2026-08-15)** | C-01 (aplica sobre `PT-FIN-C-SUST`, misma nota de alcance que Conciliación Bancaria) | Saldo s/libros al momento del arqueo (CONTROLADA) + Balance de Comprobación (hoja de referencia) | Conteo de denominaciones (billetes y monedas USD), vales/comprobantes de caja chica pendientes de reembolso | Fila calculada en S1 de C-01 con marcador propio `_excelOrigen: 'ARQUEO_CAJA'` (coexiste con la fila de Conciliación Bancaria, que usa su propio marcador) — ver §3.10 |
| **Composición / Análisis de Cuenta** ✅ **IMPLEMENTADA (fase 1, 2026-08-15)** | Cualquier C-0X | Todo el TB (hoja de referencia, solo consulta) | Toda la cédula (S7 es 100% zona libre — ni el saldo es dato controlado por la app) | S7 de C-0X (Analítica de Cuentas), no S1 como se especulaba aquí originalmente — ver §3.6 para el detalle y el porqué del cambio |

### 4.2 Nuevas — inspiradas en los ~20 "Documentos Automáticos" de CaseWare que todavía no cubríamos

Lista confirmada de CaseWare: *Account analysis, Account reconciliation, Analytical review, Chart of accounts, Chart of mapping numbers, Consolidation, Diagnostics, Document index, Document Manager, Financial statements, General ledger, History, Issues, Journals, Leadsheet/grouping, Program/checklist, Spreadsheet analysis, Tax reconciliation, Trial balance, Uncorrected misstatements.*

| Tipo CaseWare | ¿Ya lo tenemos nativo (sin Excel)? | Propuesta de plantilla Excel nueva |
|---|---|---|
| **Analytical review** ✅ **IMPLEMENTADA (fase 3, 2026-08-15)** | Ya calculaba variaciones (S1), pero no había documentación de la explicación NIA 520 por línea — ni siquiera con la plantilla, ver §3.8: no es una columna de S1 (que se sobrescribe por completo), es una sección nueva `S1c` dedicada. | Solo variaciones significativas (>20% y > Materialidad de Ejecución) — el auditor escribe "Explicación de la variación" y "¿Es razonable?" (Sí/No/Requiere procedimiento adicional); destino `S1c` de `PT-FIN-B07`, vía `FUSIONA_POR_CLAVE` nativo del motor (primera plantilla sin `transformacion` propia) |
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
| 2026-08-15 | **EXC-03** — endpoints REST + registro de plantillas (§3.3): `excel-templates.registry.ts` (vacío a propósito) + `GET/POST :id/excel-template/:key[/import]` en `working-papers.controller.ts` | **Implementado**, type-check limpio. El registro vacío significa que hoy ambos endpoints devuelven 404 para cualquier `key` — correcto hasta que fases 1-5 agreguen plantillas reales. Falta EXC-04 (UI) y EXC-05 (prueba end-to-end + deploy). |
| 2026-08-15 | **EXC-04** — componente UI genérico (§3.4): `ExcelTemplateBar.tsx` + `useImportExcelTemplate()` | **Implementado**, type-check limpio. Deliberadamente sin insertar en ningún papel real todavía (esa conexión es tarea de cada fase concreta). Falta EXC-05 (prueba end-to-end + deploy) para cerrar la Fase 0. |
| 2026-08-15 | **EXC-05** — prueba de extremo a extremo vía HTTP real (§3.5): app Nest completa + login demo real + fetch contra los 2 endpoints — 9/9 OK (10/10 tras el refuerzo QA de `areaKey`). | **Verificado en código.** Deploy inicial bloqueado por una ruta de red rota entre el ISP del usuario y Hostinger (no el VPS — diagnosticado con traceroute); resuelto cambiando a datos móviles. **Deploy completado y verificado en producción** más tarde el mismo día — ver §3.5 para el detalle. |
| 2026-08-15 | **Revisión de calidad (Fable)** — validación línea por línea de EXC-01..EXC-04 (§3.2.1): 8 hallazgos corregidos, los de fondo: FUSIONA respeta zonas (CONTROLADA nunca sobreescribe la BD), filas sin llave se omiten (fin de duplicados en re-subidas), `areaKey` sellado en la firma del manifiesto y restaurado al importar (habilita C-01..C-12), fechas dd/mm/yyyy, `sharedFormula`, validación estructural de plantillas, protección de hoja sin permisos extra. | **Implementado y verificado**: suites ampliadas 25/25 (servicio) + 10/10 (HTTP). La propia suite atrapó y forzó a corregir un bug del refuerzo de firma antes de commitear. Deploy sigue pendiente (VPS inalcanzable). |
| 2026-08-15 | **Fase 1 — Composición de Cuenta** (§3.6, EXC-06/07/08): round-trip de S7 (`ACCOUNT_SCHEDULE`) de `PT-FIN-C-SUST` — no S1 como especulaba §4.1 originalmente. Hoja "Cédula" (todo LIBRE) + hoja "Saldos TB" (referencia CONTROLADA). Botón insertado en `SectionField.tsx`. | **Implementado, verificado y desplegado en producción** (commit `f6e26ee`). Prueba contra datos demo reales (audit "Auditoria Financiera FECE", papel Caja y Bancos IN_PROGRESS): 17/17 OK, incluida la regresión de un bug real encontrado y corregido durante la prueba (celdas en blanco en re-subida reseteaban campos en vez de conservarlos — solo `accountName` tenía el fallback correcto, ahora los 5 campos lo tienen). Confirmó en un caso real que el control "papel SIGNED_OFF rechaza escritura" (EXC-QA) funciona: el primer intento contra el audit demo principal (todo firmado) fue correctamente rechazado. Durante la verificación manual en navegador se observó y corrigió una anomalía de una lógica pre-existente no relacionada (`getSections()` limpió S7 una vez) — ver §3.6 para el detalle completo. S7 del papel de prueba quedó con un ejemplo realista, confirmado también en la base de datos de producción tras el deploy. |
| 2026-08-15 | **Fase 2 — Conciliación Bancaria** (§3.7, EXC-09/10/11/12): nuevo accesor de motor `rangoLeido()` (combina rangos hermanos de la misma subida) + plantilla que calcula una diferencia de conciliación y la escribe/retira en S1 vía marcador `_excelOrigen`. Botón insertado junto al MATRIX de S1. | **Implementado y verificado**: 11/11 en la prueba de la plantilla + 2/2 en una verificación adicional del ciclo completo hacia B-08 (`propagateDiferencias` real, con captura/restauración del estado original de B08 S1/S2/S3 antes de la prueba). Pendiente: deploy. |
| 2026-08-15 | **Fase 3 — Revisión Analítica** (§3.8, EXC-13/14/15/16): sección nueva `S1c` en `PT-FIN-B07` (independiente de S1, que `propagateFinancialAnalysis` sobrescribe por completo) + primera plantilla del catálogo usando `FUSIONA_POR_CLAVE` nativo del motor sin `transformacion` propia + filtro de significancia (>20% y > Materialidad de Ejecución) + `fuente` que fusiona con lo ya documentado en subidas previas. Botón insertado en S1c. | **Implementado y verificado**: 12/12 en la prueba de humo contra el papel `PT-FIN-B07` real de "Auditoria Financiera FE&CE 2025" (18 filas de Análisis Horizontal, materialidad real vía PT-A4), incluida la protección de columna CONTROLADA y el round-trip de avance ya guardado. Dos bugs encontrados fueron de la prueba, no del motor. S1c restaurada al estado original. Pendiente: deploy (junto con fase 2, a la espera de datos móviles del usuario para una sola subida batched). |
| 2026-08-15 | **Fase 4 — Circularización de CxC** (§3.9, EXC-18/19/20): round-trip directo de `PT-NIA530 S5` sin cambios de esquema (reutiliza campos ya existentes de `SampleItemRow`) + primer uso de un `id` interno (no un campo de negocio) como `claveFusion`, evitando altas accidentales de ítems. Botón insertado en S5. | **Implementado y verificado**: 16/16 en la prueba de humo contra el papel `PT-NIA530` real de "Empresa Comercial Demo SA de CV" (18 ítems reales), incluidos tres escenarios de respuesta simultáneos, protección de columnas CONTROLADA, y conservación de `attachments` de ítems no tocados por el merge. S5 restaurada al estado original. Pendiente: deploy (junto con fases 2-3, a la espera de datos móviles del usuario). |
| 2026-08-15 | **Fase 5 — Arqueo de Caja** (§3.10, EXC-21/22/23, catálogo completo): dos tablas de origen (denominaciones + vales) combinadas vía `rangoLeido()`, fila calculada en S1 de C-01 con marcador `_excelOrigen: 'ARQUEO_CAJA'` propio y distinto al de Conciliación Bancaria para que ambas coexistan en el mismo papel. Botón insertado junto al de Conciliación Bancaria. | **Implementado y verificado**: 16/16 en la prueba de humo contra el mismo papel `PT-FIN-C-SUST` real de fase 2, con un hallazgo manual y una fila de Conciliación Bancaria simulados YA presentes — un descuadre real se agrega sin tocar ninguna otra fila, y una re-subida que cuadra retira solo la fila propia. S1 restaurada al estado original. Pendiente: deploy (junto con fases 2-4, a la espera de datos móviles del usuario). **Las 5 plantillas del catálogo están construidas y verificadas.** |
