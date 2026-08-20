# Backup y Restauración de Encargos — Análisis de Viabilidad y Propuesta

> Investigación realizada: 2026-08-16
> Contexto: el usuario pidió evaluar la viabilidad de una copia completa y restaurable de un encargo de auditoría (datos, archivos, referencias, todo).
> **Estado: PROPUESTA — nada de esto está implementado. Viabilidad confirmada: SÍ es viable, pero es un proyecto real, no una tarea pequeña.**

---

## 1. Viabilidad — respuesta corta

**Sí, es viable**, y el schema de AuditMind ya está bien preparado para esto en un sentido concreto: casi todas las tablas que cuelgan de `Audit` usan `onDelete: Cascade` en su relación — es decir, la base de datos YA sabe, a nivel de integridad referencial, que todas esas filas pertenecen a un único encargo y desaparecen juntas si el encargo desaparece. Eso es exactamente la misma frontera que necesita un backup: "todo lo que se borraría en cascada si se borrara este `Audit`" es, por definición, todo lo que hay que respaldar.

**Pero no existe hoy ningún mecanismo de clonado profundo que se pueda reutilizar.** Investigué el botón "Crear nueva auditoría copiando la estructura de esta" que vi en la pantalla del encargo — es el **Roll-forward** (para abrir el siguiente período), y su propio código lo dice explícitamente: copia los papeles como "shell only — no content, reset status" (`audits.service.ts:335`) — crea el mismo código/título/tipo de cada papel, pero con `content: {}` y estado reiniciado. Es la herramienta correcta para su propósito (un encargo nuevo necesita papeles en blanco, no los saldos del año pasado), pero no sirve como base para un backup real — hay que construir la lógica de copiar DATOS desde cero. Lo único reutilizable de ahí es el *patrón estructural*: crear un `Audit` nuevo → recorrer sus papeles → crear copias con IDs nuevos — ese esqueleto sí aplica a la restauración.

---

## 2. Qué hay que respaldar — el mapa real

Un encargo no es solo `WorkingPaper` + `PaperSection`. Encontré **más de 20 tablas** con `auditId` directo en `schema.prisma`, más varias que cuelgan transitivamente de esas (a través de `paperId`, `requestId`, `jobId`, etc.):

| Grupo | Tablas |
|---|---|
| **Núcleo de papeles** | `WorkingPaper`, `PaperSection`, `PaperReference` (el grafo de conocimiento), `AuditFolder`, `AuditPhase` |
| **Equipo y tiempo** | `AuditTeam`, `TimeEntry` |
| **PBC / cliente** | `PbcRequest`, `PbcMessage`, `PbcPaperLink`, `AuditRequestDocument` |
| **Hallazgos** | `Finding`, `FindingAction`, `FindingComment` |
| **Datos y analítica** | `TrialBalance`, `TrialBalancePaperLink`, `DataAnalysisJob`, `DataFlag`, `ConnectorImport` |
| **Muestreo y confirmaciones** | `ExternalConfirmation` (más lo que vive dentro de `PaperSection.value` para NIA 530) |
| **Cierre e informe** | `AuditProgram`, `AuditReport`, `ComplianceAssessment`, `BcpAudit` |
| **Archivos** | Todo lo referenciado como `EvidenceAttachment` dentro de `PaperSection.value`/`attachments` — los bytes reales viven en Supabase Storage, bucket único `audit-files`, ruta `sections/{paperId}/{sectionKey}/{timestamp}_{nombre}` — es decir, **no hay un solo prefijo "por encargo"** en el storage; hay que enumerar los `WorkingPaper.id` del encargo primero y después listar cada `sections/{paperId}/` — factible, pero es un paso explícito, no una sola consulta. |

**Punto de atención real**: varias de estas tablas apuntan a cosas que viven FUERA del encargo — sobre todo `User` (quién preparó/revisó/firmó/subió cada cosa). Esos usuarios pertenecen a la Organización, no al encargo. Restaurar en el MISMO entorno no es problema (el usuario ya existe); restaurar en un entorno DISTINTO (otro servidor, recuperación ante desastre) sí necesita decidir qué hacer si ese usuario no existe ahí — degradar a solo el nombre como texto es la salida más simple y segura.

---

## 3. Arquitectura propuesta

### 3.1 Exportar (backup)

```
1. Verificar permiso (rol CAE/Admin — ver §4, no cualquier auditor)
2. Recorrer el árbol de FK desde Audit (la lista de §2) y volcar cada fila a JSON
3. Enumerar todos los WorkingPaper.id del encargo → listar y descargar
   cada archivo bajo sections/{paperId}/ del bucket audit-files
4. Empaquetar todo en un único archivo portable:
   ├── manifest.json       (versión del schema, fecha, quién lo generó, hash de todo)
   ├── data.json           (todas las filas de la tabla, agrupadas por modelo)
   └── files/              (los archivos reales, con la misma ruta relativa que en Storage)
5. Firmar el manifest (mismo patrón HMAC ya usado en el motor de plantillas Excel
   — evita que un archivo de backup alterado a mano se pueda "restaurar" como si fuera legítimo)
```

### 3.2 Restaurar

Dos modos, con implicaciones muy distintas — hay que exponerlos como dos botones separados, no uno con una casilla:

- **Restaurar como encargo nuevo (seguro, recomendado por defecto)**: crea un `Audit` con ID nuevo, y remapea TODOS los IDs internos al recorrer las tablas del `data.json` (mismo patrón que ya usa Roll-forward: nuevo Audit → nuevos WorkingPaper → ahora además nuevas PaperSection con el `value` copiado tal cual, nuevas PaperReference con `sourcePaperId`/`targetPaperId` remapeados a los IDs nuevos, etc.). Nunca pisa nada existente — es un clonado fiel, no una restauración destructiva.
- **Restaurar sobre el encargo original (destructivo, para recuperar de un borrado accidental)**: sobrescribe el encargo existente con lo que hay en el backup. Esto es una acción de alto riesgo real — debe pedir confirmación explícita, mostrar claramente qué se va a perder (todo lo que se hizo después de la fecha del backup), y quedar registrada en el historial de auditoría del sistema (quién restauró, cuándo, desde qué backup).

### 3.3 Validación de integridad al restaurar

Igual que el motor de Excel: el manifest firmado se verifica antes de tocar la base — si el archivo fue alterado a mano o pertenece a otra organización, se rechaza completo, no se restaura parcialmente.

---

## 4. Seguridad — esto no es un botón cualquiera

Un backup completo de un encargo es, por definición, **todos los datos financieros y personales del cliente en un solo archivo portable** — estados de cuenta, información de empleados, hallazgos, y si se construye la propuesta de evidencia de campo (`docs/inteligencia-de-evidencia-de-campo.md`), también transcripciones de entrevistas. Eso cambia el perfil de riesgo del feature:

- **Quién puede generarlo**: restringir a roles CAE/Gerente — no cualquier auditor del equipo.
- **Quién puede descargarlo**: el archivo generado debe quedar disponible solo un tiempo limitado y con un log de quién lo descargó — no un link público permanente.
- **Restaurar destructivo**: doble confirmación, y considerar exigir un segundo rol (ej. que un Admin apruebe la restauración destructiva que pidió un CAE) para encargos ya cerrados/firmados.
- Documentar esto explícitamente en la política de manejo de datos del cliente — un backup mal guardado (ej. en un correo, en un Drive personal) anula buena parte del valor de tener los datos protegidos dentro de Supabase.

---

## 5. Actividades, en orden de implementación

| # | Actividad | Modelo | Por qué |
|---|---|---|---|
| BKP-01 | Diseñar `manifest.json` (versión de schema, fecha, hash, `areaKey`/org de origen) + el orden exacto de recorrido del árbol de FK — importa: hay que crear `Audit`→`WorkingPaper`→el resto en ese orden, tanto al exportar como al restaurar | **Fable 5 / Opus** | Si el orden o el formato quedan mal diseñados, corrompe datos reales de un cliente — mismo criterio que EXC-01 o el pipeline de evidencia de campo. |
| BKP-02 | Diseñar la estrategia de remapeo de IDs para "restaurar como nuevo" (tabla de correspondencia ID-viejo→ID-nuevo, y cómo se resuelven las FK que apuntan a `User` fuera del árbol del encargo) | **Fable 5 / Opus** | Mismo motivo que BKP-01 — es la parte de mayor riesgo de diseño de todo el feature. |
| BKP-03 | Backend: función de recorrido del árbol de tablas (§2) — volcar cada modelo con `auditId` (directo o transitivo) a `data.json` | Sonnet | Implementación directa sobre el diseño ya fijado en BKP-01. |
| BKP-04 | Backend: enumerar los `WorkingPaper.id` del encargo, listar y descargar los archivos bajo `sections/{paperId}/` del bucket `audit-files` | Sonnet | Extensión mecánica del recorrido — el patrón de ruta ya está confirmado en el código. |
| BKP-05 | Empaquetado del ZIP (`manifest.json` + `data.json` + `files/`) + firma HMAC del manifest, reutilizando `excel-manifest.ts` como referencia de patrón | Sonnet | Mismo mecanismo de firma ya construido y probado para el motor de Excel — no hay que inventar uno nuevo. |
| BKP-06 | Endpoint `POST :auditId/backup` + botón de descarga, restringido a rol CAE/Admin (§4) | Sonnet | Implementación sobre diseño ya fijado; el control de rol es acotado. |
| BKP-07 | Backend: restaurar como encargo nuevo — aplicar el remapeo de IDs de BKP-02 al recorrer `data.json` | Sonnet | El patrón estructural (crear `Audit` nuevo → recorrer papeles → crear copias) ya existe en `rollForward()`; se trata de extenderlo con datos reales en vez de shells vacíos. |
| BKP-08 | Backend: subir archivos de vuelta a Storage con las rutas remapeadas a los `paperId` nuevos | Sonnet | Continuación directa de BKP-07. |
| BKP-09 | Frontend: subir el ZIP + confirmar "restaurar como nuevo encargo" | Sonnet | UI estándar de subida + confirmación, mismo patrón de otros flujos de este sistema. |
| BKP-10 | Probar end-to-end con un encargo demo real: exportar → restaurar como nuevo → verificar que todas las tablas y archivos llegaron completos | Sonnet | Verificación, no diseño — pero es el paso que confirma que BKP-01/02 se ejecutaron bien. |
| BKP-11 | Type-check, commit, push, deploy (solo exportar + restaurar como nuevo — sin el modo destructivo todavía) | Sonnet | Cierra el entregable seguro (no destructivo) del feature. |
| BKP-12 | Restaurar destructivo: sobrescribir el encargo original — doble confirmación, mostrar qué se perdería, logging de quién/cuándo/desde qué backup | Sonnet, con revisión de **Fable 5** antes de habilitarlo en producción | Es la parte de mayor blast-radius de todo el feature — justifica una segunda mirada antes de que alguien pueda sobrescribir un encargo real por accidente. |
| BKP-13 | Type-check, commit, push, deploy del modo destructivo | Sonnet | Cierre del feature completo. |

*(BKP-12/13 se pueden posponer indefinidamente si la respuesta a la pregunta del §6 es "solo portabilidad" — ver ahí.)*

---

## 6. Pregunta abierta

¿El caso de uso principal es más bien "backup preventivo/disaster recovery" (poca frecuencia, alto valor si algo se pierde) o también "portabilidad" (mover un encargo entre organizaciones/entornos, por ejemplo de un ambiente de prueba a producción, o entre dos instalaciones)? La Fase 2 (restaurar como nuevo) cubre ambos casos igual de bien, pero afecta si vale la pena invertir en la Fase 3 (restaurar destructivo) pronto o dejarla para después — si el caso real es solo portabilidad, la Fase 3 se puede posponer indefinidamente.

---

## 7. Implementación y verificación (BKP-01..11, 2026-08-16/17)

**Estado: implementado y verificado localmente el modo seguro completo (exportar + restaurar como encargo nuevo). Pendiente autorización explícita de deploy al VPS. El modo destructivo (BKP-12/13) no está construido — sigue siendo opcional según la respuesta al §6.**

### 7.1 Decisiones de diseño (BKP-01/02)

- **Lista explícita y ordenada de modelos** (`AUDIT_SCOPED_MODELS` en `audit-backup.types.ts`), no introspección automática del DMMF para el recorrido de exportación — un backup de datos financieros/personales debe ser auditable por una persona, y el orden de dependencia (quién debe existir antes que quién al restaurar) no se puede inferir solo con metadata. **32 modelos** verificados 1:1 contra el schema real (`verificarCompletitudModelos()`, que sí usa el DMMF — para *detectar* huecos, no para reemplazar la lista a mano).
- **Remapeo de IDs**: cada fila recibe un ID nuevo generado por Prisma; las FK internas al backup se remapean con un `Map` construido incrementalmente; las FK a `User`/`AuditEntity`/`AuditTemplate` se conservan solo si existen en la organización que restaura (si no, quedan `null` con advertencia — nunca se remapean a un usuario distinto); `Organization` siempre pasa a ser la del usuario que restaura; una referencia cruzada colgante (`PaperLink`/`PaperReference` fuera del backup) omite la fila completa si la FK es requerida, o la deja vacía si es opcional.
- **FKs derivadas del schema real** (`obtenerFksDeModelo()` en `audit-backup-schema.ts`, vía `Prisma.dmmf.datamodel.models`) en vez de una tabla de FKs mantenida a mano — mismo criterio de "verificar contra el schema real" que `verificarCompletitudModelos()`.
- **Alcance: portabilidad dentro de la misma organización.** `verificarBackupManifest()` rechaza un backup cuya `organizationId` no coincida con la del usuario que restaura — es una frontera de seguridad real, no solo una validación de conveniencia.
- **Archivos**: se detectan recorriendo TODO el `data.json` ya exportado en busca de cualquier string que contenga el bucket `audit-files` o el patrón `sections/{paperId}/...` — más robusto que enumerar a mano "qué campo de qué modelo tiene adjuntos" (encontró en pruebas reales un patrón `procedures/{paperId}/{procId}/...` no anticipado). Al restaurar, los archivos se suben recién después de que TODAS las filas existen (para conocer el `paperId` nuevo), y luego se parchean las URLs ya guardadas en `PaperSection.attachments`/`value` para apuntar a las rutas nuevas.

### 7.2 Bugs reales encontrados en pruebas end-to-end (no por revisión de código)

1. **Orden de modelos**: `workingPaper` estaba listado antes que `auditPhase`/`auditFolder`, pero `WorkingPaper.folderId → AuditFolder.id` — el `folderId` nunca se podía remapear (quedaba `null` silenciosamente). Corregido reordenando a `auditPhase → auditFolder → workingPaper` al inicio del nivel 1.
2. **Autorreferencia de `AuditFolder`** (`parentId` apunta a otra fila del mismo modelo — árbol de carpetas): el remapeo genérico solo resuelve dependencias ENTRE modelos, no el orden dentro de un mismo modelo. Se agregó `ordenarPorJerarquia()` (orden topológico: padres antes que hijos) aplicado solo al array de `auditFolder` antes de crearlo.
3. **Subida de archivos grandes intermitentemente fallida** ("fetch failed" — error de transporte de Node, sin respuesta estructurada de Supabase): reproducido de forma consistente en pruebas reales con un adjunto de ~3.9MB, consistente con la flakiness de red ya documentada de este entorno. Corregido con reintentos (hasta 3, backoff simple) en `AuditBackupFilesService.subirArchivo()` — solo reintenta errores de transporte, no rechazos válidos de la API.

### 7.3 Verificación

Prueba end-to-end contra el encargo demo principal (`Empresa Comercial Demo SA de CV`, 133 filas exportadas, 6 archivos incluyendo un adjunto de ~3.9MB): exportar → restaurar como nuevo → verificar conteos idénticos de `WorkingPaper`/`PaperSection`, todas las FK internas apuntando al encargo nuevo (nunca al original), URLs de adjuntos reescritas a rutas nuevas, encargo de prueba borrado en cascada sin afectar el original. **12/12 checks OK, 0 advertencias, dos corridas consecutivas estables** tras los tres fixes de §7.2.

Verificado también en navegador real: botón "Backup" en la pantalla del encargo (`/dashboard/audits/[id]`) descarga el ZIP con 200 OK, sin errores de consola.

### 7.4 Pendiente

- Deploy al VPS no autorizado todavía para este feature.

---

## 8. Modo destructivo (BKP-12/13, 2026-08-17)

**Estado: implementado y verificado localmente.** El usuario decidió construirlo (en vez de posponerlo indefinidamente según §6) — el caso de uso real es "recuperar un encargo de un borrado/daño accidental", no solo portabilidad.

### 8.1 Diferencias de diseño frente al modo seguro (§7)

- **El manifest SÍ se valida contra el `auditId` destino** — a diferencia de "restaurar como nuevo" (que nunca compara `auditId`, ver `audit-backup-manifest.ts`), el modo destructivo exige que el backup sea **del mismo encargo** que se está restaurando. Restaurar destructivamente el backup de un encargo distinto queda rechazado explícitamente — evita la forma más peligrosa de error humano (subir el ZIP equivocado y borrar el encargo correcto).
- **Confirmación escrita, no un clic**: el endpoint exige un campo `confirmarTitulo` que debe calzar EXACTO con el título actual del encargo — mismo patrón que GitHub/Vercel usan para "escribe el nombre del repo para confirmar".
- **Rol elevado**: `ADMIN` o superior (un nivel arriba de `CAE`, que basta para exportar/restaurar como nuevo) — es la acción de mayor blast-radius de todo el feature.
- **El `Audit` se conserva** (mismo `id`, mismo `createdAt`) — solo se actualizan sus campos escalares desde el backup; todo lo demás (working papers, secciones, hallazgos, etc.) se borra y se recrea con IDs nuevos, igual que en "restaurar como nuevo". `planId` explícitamente no se toca (fuera de alcance, igual que en el modo seguro).
- **Previsualización sin efectos secundarios**: un endpoint separado (`POST :id/backup/restore-preview`) desempaqueta y valida el backup, y devuelve el conteo de filas del backup vs. el conteo ACTUAL del encargo — el frontend muestra solo los modelos donde el conteo difiere, para responder directamente "qué se va a perder" (requisito de §4) antes de pedir la confirmación escrita.
- **Borrado explícito, no solo `Audit.delete()` + cascada**: se consideró borrar y recrear el `Audit` completo (más simple, apoyándose en `onDelete: Cascade`), pero se descartó — perdería el `createdAt` original y depende de que TODAS las relaciones tengan cascade configurado (la mayoría lo tiene, pero no se quiso asumirlo). En su lugar, se recolectan los IDs actuales de cada modelo (reutilizando el mismo `construirWhereParaModelo` de la exportación) y se borran explícitamente en orden INVERSO de dependencia (hijos antes que padres) — un fallo aquí es FATAL a propósito, para no arriesgar datos duplicados/mezclados en silencio.
- **Sin transacción de base de datos**: con 100+ filas a crear secuencialmente, una transacción interactiva larga es un riesgo real contra el connection pooling en modo transacción de Supabase, no solo teórico — se aceptó el mismo trade-off de tolerancia a fallos por fila que ya rige el resto del feature (advertencias en vez de aborto silencioso) en vez de una atomicidad que podría fallar de una forma peor.
- **Bitácora nueva** (`AuditRestoreLog`, tabla propia — no forma parte de `AUDIT_SCOPED_MODELS` porque es metadata DEL SISTEMA sobre el encargo, no del encargo en sí): un registro por restauración destructiva con quién, cuándo, y desde qué backup (fecha de generación, quién lo generó, título en el momento del backup) — requisito explícito de §4.

### 8.2 Verificación

Prueba end-to-end (nunca contra el encargo demo real directamente — primero se clona vía "restaurar como nuevo" ya probado en §7, y TODO lo destructivo ocurre sobre ese clon desechable): previsualización (conteos correctos), rechazo de un backup de OTRO encargo, rechazo de un `confirmarTitulo` incorrecto, verificación de que ambos rechazos no tocan ningún dato, restauración real (mismo `id` del encargo conservado, mismo conteo de filas antes/después, un solo `AuditRestoreLog` creado con los datos correctos, todas las FK internas apuntando al encargo correcto), y confirmación de que el encargo ORIGINAL nunca se tocó. **17/17 checks OK, dos corridas consecutivas estables.**

Verificado también en navegador real: la "Zona de riesgo" (colapsada por defecto) se expande correctamente en la pantalla del encargo, el modal muestra el título real del encargo en la advertencia, y — hallazgo útil de la propia prueba — el endpoint rechazó correctamente el intento de un usuario con rol `CAE` (el rol que sí alcanza para exportar/restaurar como nuevo) con `403 Acceso denegado. Se requiere rol: ADMIN`, confirmando que la elevación de rol de §8.1 funciona de punta a punta, no solo en el guard aislado.

### 8.3 Pendiente

- Deploy al VPS no autorizado todavía para este feature.

---

## 9. Borrado COMPLETO de un encargo (2026-08-20)

**Estado: implementado localmente, tipo-chequeado (API y Web), servidor arranca limpio. Verificación end-to-end en navegador BLOQUEADA — ver §9.4. No desplegado al VPS.**

Motivado por una pregunta directa del usuario: "si borro un encargo completo, ¿se borra correctamente — incluidos los adjuntos?". La respuesta (investigada, no implementada todavía en ese momento) era **no existe ese botón**, y si se construyera con un `prisma.audit.delete()` ingenuo: (a) fallaría con violación de FK en `AuditPlanItem`/`TimeEntry`/`Engagement`/`ConnectorImport` (las 4 relaciones a `Audit` sin `onDelete: Cascade`, compilan a `RESTRICT`), y (b) aunque no fallara, el cascade de Prisma solo borra filas — nunca los archivos en Supabase Storage.

### 9.1 Decisión de diseño — reutilizar BKP-12, no reinventar

En vez de escribir la lógica de borrado desde cero, se reutiliza tal cual el mecanismo ya construido y probado en producción para la restauración destructiva (§8): `AUDIT_SCOPED_MODELS` (la lista explícita de todo lo que cuelga de un `Audit`) + `AuditBackupRestoreService.eliminarDatosExistentes()` (borrado explícito en orden inverso de dependencia — nunca depende de que la FK tenga cascade) + `AuditBackupExportService.exportarEncargo()` (recorrido de datos) + `AuditBackupFilesService.extraerRutasDeArchivo()` (detección de archivos embebidos). Es literalmente el mismo primer paso de una restauración destructiva — nuevo (`apps/api/src/audits/backup/audit-delete.service.ts`) es solo lo que pasa DESPUÉS: en vez de recrear filas desde un backup, se borra el `Audit` mismo.

**`Engagement` (Cartera) se desvincula, nunca se borra**: `Engagement.auditId` es opcional — antes de borrar el árbol del encargo, se hace `updateMany({ where: { auditId }, data: { auditId: null } })`. El registro comercial (Cliente → Radar de Aceptación → Propuesta → Carta de Compromiso) es historia real del cliente que sobrevive al encargo técnico que originó, no datos que cuelguen de él — por eso queda deliberadamente FUERA de `AUDIT_SCOPED_MODELS`.

**Endpoints** (mismo controller que BKP-12, mismo rol `ADMIN` — la acción de mayor blast-radius del sistema, ahora empatada con restore-destructive): `GET :id/delete-preview` (sin efectos secundarios, cuenta qué se perdería) y `POST :id/delete` (con `confirmarTitulo` en el body — mismo patrón de "escribe el título exacto" que el resto de la zona de riesgo).

### 9.2 Dos bugs reales encontrados en el camino (no en el feature nuevo — en BKP-12/BKP-03, ya en producción)

Al mapear qué hay que borrar/detectar para este feature, se re-ejecutó `AuditBackupExportService.verificarCompletitudModelos()` (la propia red de seguridad que `AUDIT_SCOPED_MODELS` ya tenía diseñada para esto) contra el schema actual:

1. **`fieldEvidence`/`fieldEvidenceFinding` (Evidencia de Campo, EVD-01..18) faltaban en `AUDIT_SCOPED_MODELS`** — se construyeron el 2026-08-19, un día después de la verificación original de esta lista (2026-08-16). Efecto real: un backup de un encargo con evidencia de campo (fotos/audio/video de campo) omite esos datos silenciosamente — ni la exportación los incluye, ni la restauración destructiva los borraba/recreaba. Corregido agregando ambos modelos (nivel 1 y 2) — verificado que el discovery de FKs para el remapeo al restaurar es 100% dirigido por el DMMF de Prisma (`audit-backup-schema.ts`), así que no hace falta ningún ajuste adicional en la lógica de restauración: los campos nuevos (`paperId`, `capturedById`, `evidenceId`) se descubren y remapean solos.
2. **`AuditBackupFilesService.extraerRutaDeTexto()` solo reconocía el prefijo bare-key `sections/`** — pero `StepEvidence.storageKey` (`procedures/steps/...`) y `FieldEvidence.storageKey` (`evidence/...`) también son bare keys reales, con prefijos distintos, que nunca se detectaban. Efecto real: los archivos de evidencia de pasos de procedimiento y de evidencia de campo quedaban huérfanos en Storage tanto al hacer backup como (ahora) al borrar un encargo. Corregido ampliando a una lista explícita de prefijos conocidos (`sections/`, `procedures/`, `docevidence/`, `acct-schedule/`, `evidence/`).

Ambos bugs preexistían en el feature de backup ya desplegado — se corrigieron aquí porque el nuevo feature de borrado reutiliza exactamente ese mecanismo, y dejarlos rotos habría vuelto a dejar archivos huérfanos.

**Tercer bug, encontrado EN PRODUCCIÓN tras el primer deploy de este feature (2026-08-20)**: `construirWhereParaModelo()` armaba el `where` de `pbcMessage` con un campo `pbcId` hardcoded — pero el campo real en el schema es `PbcMessage.requestId` (`pbcId` sí es el nombre correcto para `pbcPaperLink`, otro modelo que comparte el mismo `filtro.tipo: 'via_pbcId'`; ambos asumían el mismo nombre de campo cuando en realidad difieren). `GET :id/delete-preview` contra `cmpbrhl090008fs656ozrmqhc` (un encargo real con `PbcRequest` pero además con filas de `PbcMessage`) devolvió `500 Internal server error` — el primer caso real que ejercitó esta rama de código, porque requiere un encargo con AMBOS, `PbcRequest` Y `PbcMessage`, no solo lo primero. El mismo bug ya estaba latente en BKP-03 (exportación de backup) desde que se construyó, simplemente ningún backup de prueba anterior tocó un encargo con mensajes PBC reales. Corregido haciendo que `via_pbcId` cargue el nombre de campo (`pbcIdField`), mismo patrón ya usado por `via_paperId` (`paperIdField`) — `pbcPaperLink` usa `'pbcId'`, `pbcMessage` usa `'requestId'`.

### 9.3 Verificación hecha

- Type-check limpio en `apps/api` y `apps/web` (`npx tsc --noEmit`).
- Servidor local reiniciado, arranca sin errores.
- El guard de rol confirmado end-to-end contra el endpoint real: un token de rol `CAE` (el más alto que existe hoy en la organización demo) recibe `403 Acceso denegado. Se requiere rol: ADMIN` en `GET :id/delete-preview` — el gate está correctamente conectado, no solo declarado.

### 9.4 Bloqueante real para terminar de verificar — no existe ningún usuario `ADMIN`/`SUPER_ADMIN`

Consultada la tabla `User` completa: el rol más alto que existe HOY en cualquier organización de este entorno es `CAE` (`cae@demo.cl`, `jsiguenzatorres@gmail.com`, ambos org `cmpbrhg8b0000fs65tj0aadbp`). **Nadie puede ejecutar ni este feature ni BKP-12 (restore-destructive, ya en producción) en este momento** — ambos exigen `ADMIN`. La verificación E2E de BKP-12 documentada en §8.2 debió haberse hecho con una cuenta elevada temporalmente para la prueba y luego revertida (mismo patrón de "clonado desechable" del resto de esa sección) — no quedó ningún usuario `ADMIN` real después.

**Requiere una decisión del usuario, no algo que se resuelva solo**: elevar el rol de una cuenta real (candidatas obvias: `jsiguenzatorres@gmail.com` o `cae@demo.cl`) a `ADMIN` es un cambio de permisos sobre una cuenta de persona real — fuera de lo que se debe hacer sin pedir permiso explícito, incluso en un entorno de desarrollo local.

### 9.5 Encargos "basura" identificados para la prueba manual (ninguno tocado)

Consultada la tabla `Audit` completa (15 encargos) — candidatos reales para probar el borrado sin arriesgar el encargo demo canónico (`cmsrskxz80001jjekqqy3t4xy`, ver [[fixes_and_lessons]] #21):

| ID | Título | Papeles | Por qué es candidato |
|---|---|---|---|
| `audit-01` / `audit-02` / `audit-03` | "Auditoría...Q1/Q4 2026" | 0–5 | IDs literales de seed, no `cuid()` — inequívocamente datos de arranque, no un encargo real |
| `cmsxcvmmm0001nr8dck5zea1f` | "DEMO — Restaurado desde Backup (funcionalidad BKP)" | 32 | Residuo de la prueba E2E de BKP-10 (§7.3) — debió borrarse tras esa prueba y no se hizo |
| `cmsxe4brl000110zzm26zayiu` | "DEMO — Restaurado desde Backup (funcionalidad BKP)" | 60 | Mismo caso, segunda instancia — hay DOS residuos de esa prueba, no uno |
| `cmpz12znu0001761sveexamvi` | "Auditoria Financiera" | 32 | Ya documentado en [[fixes_and_lessons]] #21 como encargo antiguo sin relación con las demos vigentes |
| `cmpz1qi3j0007i8grz5r8h50r` / `cmq02zopm0001jp1ntcpq0cf9` | "Auditoria IIA" / "Auditoria 2" | 21 / 30 | Nombres genéricos, sin contenido narrativo — candidatos probables de prueba antigua |

`cmt0dqwy8000mcw62ngp6auyz` ("Cliente Piloto Cartera SA de CV") es distinto — **no es basura**, es la prueba E2E real del pipeline de Cartera (§ver [[project_auditmind]]) y tiene un `Engagement` vinculado de verdad. Es el candidato ideal para probar específicamente el paso de desvinculación (§9.1) — verificar que tras borrarlo, el `Engagement`/`Client` siguen existiendo en `/dashboard/portfolio` sin encargo asociado.
