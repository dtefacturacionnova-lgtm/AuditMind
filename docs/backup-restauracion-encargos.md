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

- **BKP-09** (frontend de restauración — subir ZIP + confirmar) aún no construido; hoy la restauración solo se puede invocar contra el endpoint `POST /audits/restore-backup` directamente.
- **BKP-12/13** (modo destructivo) no construido — decisión pendiente del usuario según §6.
- Deploy al VPS no autorizado todavía para este feature.
