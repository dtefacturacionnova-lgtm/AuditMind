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

## 5. Plan de fases

| Fase | Qué construye | Modelo recomendado | Por qué |
|---|---|---|---|
| **0 — Diseño del formato de export/import y del remapeo de IDs** | Definir el `manifest.json`, el orden exacto de recorrido del árbol de FK (importa: hay que crear los `Audit`/`WorkingPaper` antes que las filas que los referencian), la estrategia de remapeo | **Fable 5 / Opus** | Es la parte que si se diseña mal, corrompe datos reales de un cliente — mismo criterio que el motor de Excel (EXC-01) o el pipeline de evidencia de campo (Fase 0 de esa propuesta). |
| **1 — Exportar (solo lectura, sin restaurar todavía)** | Recorrido del árbol de FK, empaquetado, firma del manifest — entregable: un botón que descarga el ZIP | **Sonnet** | Implementación sobre el diseño ya fijado en Fase 0; no hay ambigüedad de diseño pendiente. |
| **2 — Restaurar como encargo nuevo** | El remapeo de IDs, reutilizando el patrón ya probado de Roll-forward | **Sonnet** | Mismo motivo — el patrón estructural ya existe en el código, es extenderlo con más tablas y con los valores reales (no vacíos). |
| **3 — Restaurar destructivo + controles de seguridad de §4** | Confirmaciones, logging, restricción de rol | **Sonnet**, con revisión de **Fable 5** antes de habilitarlo en producción | Es la parte de mayor blast-radius de todo el feature — vale la pena una segunda mirada antes de que alguien pueda sobrescribir un encargo real por accidente. |

---

## 6. Pregunta abierta

¿El caso de uso principal es más bien "backup preventivo/disaster recovery" (poca frecuencia, alto valor si algo se pierde) o también "portabilidad" (mover un encargo entre organizaciones/entornos, por ejemplo de un ambiente de prueba a producción, o entre dos instalaciones)? La Fase 2 (restaurar como nuevo) cubre ambos casos igual de bien, pero afecta si vale la pena invertir en la Fase 3 (restaurar destructivo) pronto o dejarla para después — si el caso real es solo portabilidad, la Fase 3 se puede posponer indefinidamente.
