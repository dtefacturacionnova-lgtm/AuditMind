# Inteligencia de Evidencia de Campo — Propuesta de Funcionalidad

> Investigación realizada: 2026-08-16
> Fuentes: dos documentos aportados por el usuario (`AuditMind_Integraciones_v14.0.docx.md` — investigación de mercado de 10 capacidades de sistemas líderes; `Modulo_IA_Analisis_Entrevistas_Auditoria.md` — propuesta técnica de cadena de transcripción/análisis de entrevistas) + verificación directa contra el código real de AuditMind + investigación externa sobre captura de video/anotaciones/notas de campo en herramientas adyacentes.
> Contexto: el usuario pidió evaluar ambos documentos, investigar cómo lo implementan las firmas grandes, y proponer cómo integrar esto a AuditMind — cubriendo no solo audio, sino video corto, anotaciones y lluvia de ideas, en un flujo campo↔oficina, con IA que ordene y busque pistas de auditoría/fraude/riesgo.
> **Estado: DISEÑO APROBADO, sin implementar.** Las preguntas abiertas están resueltas (§5, EVD-01) y el diseño técnico completo del pipeline está en §6 (EVD-02, 2026-08-17) — las actividades EVD-03..11 (Fase 1) implementan ese contrato tal cual.

---

## 0. Corrección importante antes de proponer nada

El documento `AuditMind_Integraciones_v14.0` describe varias cosas como si **ya existieran** en AuditMind (un "Grabador Inteligente de Entrevistas" en el "Plan Enterprise", agentes especializados con capacidades concretas, un concepto "PT Vivo"). Verifiqué cada afirmación contra el código real antes de proponer nada — construir sobre una base que no existe habría producido un plan mal calibrado.

| Afirmación del documento | Estado real (verificado en código) |
|---|---|
| "Grabador Inteligente de Entrevistas" en Plan Enterprise, con transcripción + extracción de PBCs/riesgos, papel "PT de Entrevista (EJ-EN01)" | **No existe.** Solo hay un valor de enum (`WorkingPaperType.INTERVIEW`) y un papel `B-04` "Guía y Papel de Entrevista" declarado en `audit-templates.service.ts` **sin `paperCode` y sin ninguna sección definida en `PAPER_TEMPLATES`** — es un slot vacío. `apps/ai-service/requirements.txt` no tiene ninguna dependencia de audio/voz (sin whisper, sin pyannote, nada). Tampoco existe el código "EJ-EN01" en ningún lado del repo. No existe ningún concepto de "Plan Enterprise" en el código (sin modelo de planes/tiers). |
| Agentes "Argus" (100% de transacciones/CAATs), "Vulcano" (conectores ERP + OCR), "Minerva-QAIP" (revisión de calidad) | **Parcialmente real.** Los nombres SÍ existen como personas de un LLM Router (`apps/ai-service/app/services/llm_router.py`, `agent_prompts.py`), pero con alcance mucho más delgado que el descrito: Argus está etiquetado "Evaluación de Controles", no CAATs de 100% de transacciones (eso vive aparte, en papeles DATA_ANALYSIS con pandas/numpy, sin conectar a "Argus" en código). Vulcano está dividido/ambiguo entre "auditoría de TI" y un router de conectores ETL simulados (SAP RFC simulado, REST, Excel/CSV) — **sin OCR en ningún lado del código**. Minerva-QAIP existe solo como entrada `phase: "Fase 5"` (marcada explícitamente como no construida todavía) en el registro de agentes. Scriptorium es el que más se acerca a lo descrito — genera narrativas reales vía LLM con endpoints funcionando.
| Concepto "PT Vivo" | **No existe ese nombre.** El análogo real es `WpKind.LIVE`/`SMART`/`MASTER` + `PaperGraphService` con cascada de invalidación por staleness — un sistema real, pero sin ese nombre. |
| "Grafo de conocimiento" con trazabilidad | **Real y en uso activo** — `PaperLink`, `PaperGraphService`, `PapersGraphView.tsx`, referencias sección-a-sección. No verificado que la trazabilidad llegue a nivel de oración individual del Memorando como afirma el documento (el grafo opera a nivel de papel/sección/campo). |
| "Portal del Auditado" con PBC | **Real y funcional** — `PbcRequest`, `PbcMessage`, `PbcPaperLink`, portal con token (`apps/web/src/app/portal/[token]/`), ya en producción. |

**Conclusión de esta verificación**: la parte de la propuesta de entrevistas (documento 2) es la más honesta y técnicamente sólida de los dos documentos — está escrita como diseño a construir, no como algo ya hecho. Este documento retoma esa base y la adapta a lo que realmente existe en AuditMind, con dos decisiones de diseño que el documento 2 no tenía que tomar (porque solo cubría audio): si esto va atado a "entrevistas" o es una capacidad general, y cómo extenderlo a video/anotaciones/lluvia de ideas sin construir cuatro sistemas separados.

También verifiqué (investigación externa) dos cifras citadas en el documento 1: **DataSnipper "$1.4B en ahorros" y "1,100% de crecimiento" son datos autorreportados por el propio proveedor, sin metodología publicada** — cítalos como cifras de marketing del proveedor si los usas en material comercial, no como prueba independiente. Y **Sally AI es real pero es una herramienta horizontal de transcripción de reuniones** (también se vende para Ventas, RRHH, Gerencia) — el ángulo "para auditores" aparece solo en un post de blog suyo, no es un producto nativo de auditoría. Ningún sistema de auditoría del mercado (AuditBoard, TeamMate+, Workiva, MindBridge) hace hoy análisis de IA sobre **video** capturado por el auditor — es un vacío real del mercado, no solo de AuditMind.

---

## 1. Decisión de diseño — ¿funcionalidad de entrevistas o capacidad general?

**Recomendación: capacidad general, no atada a entrevistas.**

Razonamiento: lo que el usuario pidió cubrir — audio, video corto, anotaciones, lluvia de ideas — no es exclusivo de una entrevista. Un auditor que hace un arqueo de caja, una observación de inventario físico, o una visita a una planta genera exactamente el mismo tipo de evidencia (una nota de voz, una foto anotada, un video corto del conteo). Diseñar esto como "Grabador de Entrevistas" habría significado construir el mismo patrón de nuevo cuando aparezca la necesidad en Arqueo de Caja o en Observación de Inventario — que es previsible, ya existen esas plantillas.

En vez de eso, propongo un **layer de "Evidencia Inteligente"** que se engancha al sistema de adjuntos que YA existe (`EvidenceAttachment`, usado en `DocumentEvidencePanel`, `SampleItemRegisterPanel`, `ChecklistPanel` y varios más) en lugar de inventar un `FieldType` nuevo que ocupa toda una sección. Cualquier sección que ya acepta adjuntos gana la capacidad de recibir evidencia "inteligente" (audio/video/nota de voz/foto anotada) sin que cada plantilla tenga que declarar nada especial — mismo principio que ya se aplicó esta sesión con el motor de plantillas Excel: una capacidad genérica y reutilizable, no una feature de un solo papel.

La primera instancia concreta de uso SÍ debería ser el papel de entrevista (B-04, que hoy está vacío) — pero como el primer *consumidor* de la capacidad general, no como el límite de su alcance.

---

## 2. Arquitectura propuesta — un pipeline, múltiples entradas

La observación clave de investigar las 4 modalidades juntas: **el procesamiento de fondo es el mismo sin importar cómo entró la evidencia.** Audio, video, nota de voz de campo y anotación sobre una foto todos terminan en el mismo lugar — un extracto estructurado de hallazgos/riesgos/entidades que el auditor revisa y aprueba. Construir cuatro pipelines de IA separados (uno por modalidad) sería duplicar trabajo; la superficie que sí cambia genuinamente por modalidad es la de **captura** (cómo entra el dato), no la de **análisis**.

```
┌─────────────── CAPTURA (varía por modalidad) ───────────────┐
│  Audio (entrevista/walkthrough)  →  Video corto (recorrido)  │
│  Nota de voz/texto (lluvia de ideas)  →  Foto anotada         │
└───────────────────────────┬───────────────────────────────────┘
                             ▼
              ┌─────────────────────────────┐
              │  1. Ingesta y custodia       │  hash SHA-256, metadatos,
              │                              │  nunca se sobrescribe el original
              └──────────────┬──────────────┘
                             ▼
              ┌─────────────────────────────┐
              │  2. Normalización a texto    │  audio/voz → Whisper (transcripción)
              │                              │  video → muestreo de frames + LLM visión
              │                              │  foto anotada → OCR + descripción de zona marcada
              └──────────────┬──────────────┘
                             ▼
              ┌─────────────────────────────┐
              │  3. Extracción estructurada  │  UN esquema JSON para las 4 modalidades
              │     (LLM Router existente)   │  (ver §2.3) — hallazgos/riesgos/entidades
              └──────────────┬──────────────┘
                             ▼
              ┌─────────────────────────────┐
              │  4. Cruce con el expediente  │  reutiliza PaperReference/mention-index
              │                              │  (mismo mecanismo del grafo de conocimiento)
              └──────────────┬──────────────┘
                             ▼
              ┌─────────────────────────────┐
              │  5. Validación anti-alucin.  │  la cita textual debe existir literal
              │                              │  en la transcripción/descripción fuente
              └──────────────┬──────────────┘
                             ▼
              ┌─────────────────────────────┐
              │  6. Revisión humana          │  el auditor acepta/descarta/edita —
              │     (patrón ya establecido)  │  nunca se auto-aprueba un hallazgo
              └─────────────────────────────┘
```

### 2.1 Paso 2 — normalización a texto, por modalidad

- **Audio de entrevista/walkthrough**: `faster-whisper` autoalojado en el VPS (recomendación del documento 2, y correcta — para entrevistas de RRHH/PLAFT, mantener el audio dentro de la infraestructura propia importa más que la conveniencia de una API gestionada) + `pyannote-audio` para diarización (separar entrevistador de entrevistado). Ninguna de las dos dependencias existe hoy en `apps/ai-service` — hay que agregarlas.
- **Video corto** (recorrido de bodega, conteo físico): sin precedente directo en herramientas de auditoría (verificado — ninguna lo hace hoy). El patrón más cercano viene de seguros (Yembo, VideoPeel) que usan visión por computadora dedicada — pero construir eso desde cero es un proyecto en sí mismo. La ruta pragmática: **muestreo de frames + el mismo LLM Router ya existente, con capacidad de visión** (Gemini/Claude ya soportan imágenes) — se le pide "describe lo que observas, marca cualquier anomalía" sobre 1 frame cada N segundos, no un modelo de visión dedicado. Mucho menor esfuerzo, reutiliza infraestructura, y es honesto sobre no ser tan sofisticado como un CV dedicado — pero es un punto de partida real, no una promesa vacía.
- **Nota de voz / texto de lluvia de ideas**: si es voz, mismo Whisper del punto anterior; si es texto, directo al paso 3. Esta es la modalidad más liviana de capturar (una grabación de 30 segundos o un campo de texto libre) y por eso la recomiendo como el **primer entregable visible** del proyecto — valida el pipeline completo con el menor esfuerzo de captura.
- **Foto anotada**: el auditor dibuja (círculo, flecha, texto) sobre una foto ya subida — patrón ya maduro en QA de construcción y peritaje de seguros (CompanyCam, GoAudits), nada que inventar en la UX, solo una capa de canvas sobre la imagen + metadata de la zona marcada. La región anotada se pasa como contexto al LLM ("el auditor marcó esta zona, ¿qué es relevante ahí?").

### 2.2 Paso 3 — un solo esquema de extracción para las 4 modalidades

Adaptado del esquema del documento 2 (que ya estaba bien pensado para audio), generalizado para que sirva igual sin importar la fuente:

```json
{
  "hallazgos": [
    {
      "tipo": "contradiccion | evasiva | anomalia_visual | riesgo_mencionado | inconsistencia_con_expediente",
      "descripcion": "...",
      "fuente_referencia": "00:14:32 (audio/video) | zona marcada #3 (foto) | n/a (texto)",
      "cita_o_evidencia": "cita textual exacta, o descripción del frame/zona",
      "nivel_riesgo": "bajo | medio | alto",
      "justificacion": "..."
    }
  ],
  "entidades_mencionadas": ["..."],
  "resumen_ejecutivo": "..."
}
```

### 2.3 Paso 4 — cruce con el expediente

El documento 2 propone que el agente de IA "consulte otras tablas del sistema" para contrastar lo dicho contra hechos ya registrados — exactamente el mismo problema que ya resolvimos esta sesión para el motor de plantillas Excel y para el flujograma: **no hace falta inventar un mecanismo nuevo de acceso a datos**, el `mention-index`/`PaperReference` ya existente (el mismo que alimenta el grafo de conocimiento y que ya usa `FlowchartPanel` para vincular nodos a papeles reales) sirve igual aquí — el LLM recibe como contexto los papeles/secciones relevantes del expediente ya indexados, no necesita una integración nueva.

### 2.4 Paso 6 — revisión humana

No es un paso nuevo que inventar: es el MISMO patrón de "la IA sugiere, el auditor aprueba" ya usado en `seedSubstantiveProcedures`, `ComunicacionAIPanel`, y en general cada sección auto-llenada de este sistema. Los hallazgos extraídos aparecen como filas sugeridas en la sección MATRIX correspondiente (o en `PT-HALL` si se decide promover a hallazgo formal), con la cita/evidencia visible — el auditor acepta, descarta o edita cada uno antes de que cuente como parte oficial del expediente. Esto no es opcional: es el principio de industria citado correctamente en el documento 2 (Deloitte Omnia, IIA) — la IA prepara, el humano firma.

---

## 3. El flujo campo↔oficina — la pieza más cara de esta propuesta, y la más honesta de separar

Aquí es donde hay que ser más cuidadoso que en el resto del documento. El patrón estándar de la industria (verificado vía Microsoft Dynamics 365 Field Service y herramientas de auditoría de campo tipo MyFieldAudits/GoAudits) es: **captura 100% local-first (SQLite/Realm/WatermelonDB en el dispositivo), todo funciona sin conexión, una cola de sincronización sube los cambios cuando vuelve la señal — y el procesamiento de IA se difiere hasta ese momento, nunca corre on-device.** Ningún proveedor serio intenta correr el análisis de IA sin conexión; todos capturan offline y procesan al sincronizar.

Construir ESO — una app móvil o PWA con almacenamiento local real, cola de sincronización con resolución de conflictos — es un proyecto de arquitectura nueva genuina, y mucho más caro que el pipeline de IA de la sección 2 (que en su mayoría reutiliza infraestructura ya existente: LLM Router, mention-index, patrón de revisión). No lo mezclaría en la misma fase.

**Antes de comprometerse a construir esto, vale la pena preguntar**: ¿los auditores de campo de tus clientes realmente trabajan sin conectividad (visitas a zonas rurales, bodegas sin señal), o el caso real es "WiFi lento/intermitente, no ausencia total de señal"? Si es lo segundo, un enfoque mucho más barato — subir la evidencia por la web normal, tolerando reintentos, sin construir almacenamiento local — cubre el 90% del valor por una fracción del costo. Si es lo primero (señal genuinamente ausente en campo), entonces sí se justifica el proyecto de captura offline-first, pero como una fase separada y explícitamente presupuestada así.

---

## 4. Actividades, en orden de implementación

**Fase 5 (captura offline-first campo↔oficina, §3) queda pospuesta por decisión explícita del usuario (2026-08-16)** — la alternativa más barata (EXC-24..30, plantilla Excel genérica) cubre la necesidad real por ahora. No se listan actividades de esa fase aquí; el diseño ya documentado en §3 queda como referencia para cuando se retome.

| # | Actividad | Modelo | Por qué |
|---|---|---|---|
| EVD-01 | Resolver las preguntas abiertas de §5 (Whisper autoalojado vs. API, destino de los hallazgos — ¿`PT-HALL` o fila sugerida) — decisión del usuario, no una tarea de código | — (decisión, no implementación) | El resto de las actividades de Fase 1 dependen de esta respuesta. |
| EVD-02 | Diseñar el esquema JSON único de extracción (§2.2) y el contrato completo del pipeline (§2) — dónde vive cada paso en `ai-service` vs. `api` | **Fable 5 / Opus** | Arquitectura nueva genuina — mismo criterio que EXC-01. Un mal diseño aquí obliga a rehacer las fases siguientes. |
| EVD-03 | Agregar `faster-whisper` a `apps/ai-service/requirements.txt` + endpoint de transcripción | Sonnet | Implementación sobre el diseño ya fijado en EVD-02. |
| EVD-04 | Backend: ingesta con hash SHA-256 de custodia + metadatos obligatorios (fecha, autor, consentimiento) | Sonnet | Requisito de cadena de custodia del documento 2 (§3), aplicable desde la primera modalidad. |
| EVD-05 | Backend: pipeline de extracción estructurada vía el LLM Router ya existente (`llm_router.py`), aplicando el esquema de EVD-02 | Sonnet | Reutiliza infraestructura ya construida — no hay LLM nuevo que integrar. |
| EVD-06 | Backend: validación anti-alucinación — la cita/evidencia debe existir literal en la transcripción antes de mostrarla | Sonnet | Control de calidad explícito del documento 2 — no es opcional. |
| EVD-07 | Backend: cruce con el expediente reutilizando `mention-index`/`PaperReference` ya existente (§2.3) | Sonnet | Cero integración nueva — mismo mecanismo que ya usa el grafo de conocimiento y `FlowchartPanel`. |
| EVD-08 | Dar por fin contenido real al papel B-04: `paperCode` + secciones en `PAPER_TEMPLATES` (hoy es un slot vacío — ver §0) | Sonnet | Es el primer consumidor real de la capacidad — sin esto no hay dónde mostrar los hallazgos. |
| EVD-09 | Frontend: UI de captura rápida (grabar audio corto o escribir texto libre) + panel de revisión humana de hallazgos sugeridos (mismo patrón "IA sugiere, auditor aprueba" ya usado en `seedSubstantiveProcedures`/`ComunicacionAIPanel`) | Sonnet | Modalidad de menor esfuerzo de captura — valida el pipeline completo con el menor riesgo. |
| EVD-10 | Probar con datos demo reales: capturar 2-3 notas de ejemplo, confirmar que los hallazgos extraídos y la trazabilidad de cita funcionan end-to-end | Sonnet | Verificación antes de desplegar. |
| EVD-11 | Type-check, commit, push, deploy — cierra Fase 1 (nota de voz/texto) | Sonnet | — |
| EVD-12 | Fase 2 — entrevista formal: agregar `pyannote-audio` (diarización) + consentimiento obligatorio en el flujo de ingesta | Sonnet | Extiende el pipeline de Fase 1, no lo reemplaza. |
| EVD-13 | Fase 2 — probar con una entrevista de ejemplo real, verificar timestamps trazables al audio | Sonnet | — |
| EVD-14 | Fase 3 — foto anotada: capa de canvas de marcado sobre adjuntos existentes + zona marcada como contexto para el LLM | Sonnet | UX ya madura en otras industrias (§2.1) — bajo riesgo de diseño. |
| EVD-15 | Fase 4 — video corto: muestreo de frames + LLM con visión (Gemini/Claude), mismo esquema de salida de EVD-02 | Sonnet, con revisión de **Fable 5** si el muestreo de frames resulta insuficiente en la primera prueba real | Sin precedente directo en auditoría (verificado) — mayor probabilidad de necesitar iterar el enfoque. |

---

## 5. Preguntas abiertas para decidir antes de empezar

1. ~~¿Empezamos por la Fase 1 (nota de voz/texto)?~~ **Resuelto (2026-08-16): sí** — el orden de actividades aprobado por el usuario (§4) arranca por Fase 1 (EVD-03..11) antes de diarización/foto/video.
2. ~~Connectividad real en campo — ¿justifica offline-first?~~ **Resuelto (2026-08-16): pospuesto — la plantilla Excel genérica (EXC-24..30 en `docs/integracion-excel-plantillas-inteligentes.md`) cubre la necesidad por ahora.**
3. ~~¿El audio de entrevistas de PLAFT/RRHH debe procesarse 100% dentro de tu infraestructura o vía API externa?~~ **Resuelto (2026-08-16): Whisper autoalojado (`faster-whisper` en el VPS).** El audio de entrevistas PLAFT/RRHH nunca sale de la infraestructura propia — prioridad sobre la conveniencia de una API gestionada, dado que es el tipo de dato más sensible que maneja el sistema (testimonios de empleados, denuncias, información bajo secreto profesional). Implica: EVD-03 agrega `faster-whisper` como dependencia nueva de `apps/ai-service` (no una llamada a API externa), y el VPS necesita CPU suficiente para transcribir en tiempo razonable — sin GPU, una entrevista de 45 min puede tardar varios minutos; a evaluar en EVD-10 si el tamaño de modelo elegido (tiny/base/small/medium/large) da un balance aceptable de velocidad vs. precisión antes de invertir en GPU.
4. ~~¿Los hallazgos extraídos van a `PT-HALL` o quedan como filas sugeridas?~~ **Resuelto (2026-08-17): filas sugeridas + promoción opcional.** Los hallazgos aparecen como filas sugeridas junto a la evidencia (patrón "IA sugiere, auditor aprueba"); una fila ya aceptada puede promoverse a `PT-HALL` con una acción explícita del auditor — reutilizando el flujo PT-HALL→`Finding` que ya existe en el Dashboard de Hallazgos. Nunca se crea un hallazgo formal automáticamente.

**Con esto, EVD-01 queda completamente resuelto (2026-08-17).**

---

## 6. Diseño técnico del pipeline (EVD-02, 2026-08-17)

> Este es el contrato que implementan EVD-03..EVD-11 (Fase 1: nota de voz/texto). Está escrito contra el código real — cada decisión cita el precedente o la restricción concreta que la motiva. Verificado con exploración exhaustiva de `apps/ai-service` y `apps/api` antes de diseñar (2026-08-17).

### 6.0 Hechos del código que condicionan el diseño

1. **`ai-service` no tiene ningún patrón asíncrono** (grep de BackgroundTasks/celery/queues: 0 resultados) — todo es request/response síncrono. El único patrón de tarea larga del sistema vive en NestJS: `ConnectorImport` (`data-sources.service.ts:158` — fila `RUNNING` + ejecución fire-and-forget sin `await` + polling del cliente). Debilidad conocida: si el proceso Node reinicia a mitad, la fila queda `RUNNING` para siempre (no hay reaper ni scheduler en todo el repo).
2. **El shape `EvidenceAttachment`** (`{id, filename, url, mimeType, size, uploadedAt}`) **no sirve para custodia**: no guarda `storageKey`, ni autor, ni hash. El molde correcto es `StepEvidence` (modelo Prisma real con `storageKey`, `uploadedById/Name`, `uploadedAt`).
3. **`DataFlag`** ya modela la disposición humana que necesitamos (`reviewedBy`, `reviewedAt`, `disposition: ACCEPTED | FALSE_POSITIVE | FINDING_CREATED`) — pero es huérfano de servicio, igual que `DataAnalysisJob` (declarado en schema, jamás usado). Se copia el patrón, no las tablas.
4. **El LLM Router de Python no usa JSON mode** — hoy todo es "responde solo JSON" + parseo manual (dos parsers distintos duplicados). El SDK `google-genai>=1.0.0` ya instalado SÍ soporta `response_mime_type="application/json"` + `response_schema` (acepta un modelo Pydantic directamente) — el pipeline nuevo lo usa desde el día uno.
5. **Restricción de memoria real en producción**: PM2 corre uvicorn con `--workers 2` y `max_memory_restart: '800M'` (`ecosystem.config.cjs:82`). Un modelo Whisper cargado por worker cuenta contra ese límite.
6. **Ya existe el molde multipart** (`POST /rag/ingest/pdf`: `UploadFile` + campos `Form` + header `x-internal-key` + límite 50MB + tempfile con `finally: os.unlink`) y el molde NestJS→ai-service (`ingestPdf` en `ai.service.ts:299`: `FileInterceptor` → `file.buffer` → `FormData` con `Blob`).
7. **Auth entre servicios**: header `x-internal-key`; Python lee `INTERNAL_API_KEY`, NestJS lee `AI_SERVICE_INTERNAL_KEY` (PM2 hace el puente). El helper `verify_internal_key` está copiado 3 veces en routers — el router nuevo lo factoriza a `app/services/auth.py` en vez de copiarlo una cuarta.
8. **Convención en la frontera**: los endpoints nuevos de ai-service usan **snake_case** en sus modelos Pydantic (como `agents.py`); NestJS convierte al cruzar. Hoy conviven ambas convenciones — este pipeline fija una.
9. **Punto de entrada de audio que YA existe**: `audit-folders.service.ts:631` mapea `audio/*` → `WorkingPaperType.INTERVIEW` al subir archivos sueltos al expediente (`wpKind: FILE`). No se toca en Fase 1, pero es el candidato natural para "procesar este audio ya subido" en una fase posterior.

### 6.1 Reparto de responsabilidades api ↔ ai-service

| Paso del pipeline (§2) | Vive en | Por qué |
|---|---|---|
| 1. Ingesta y custodia (hash, Storage, metadatos, consentimiento) | **NestJS** | NestJS ya es el único que toca Supabase Storage (bucket `audit-files`); el hash SHA-256 es `crypto` nativo; el modelo de datos es Prisma. |
| 2. Normalización a texto (transcripción Whisper) | **ai-service** | Es Python/ML puro — `faster-whisper` es una librería Python. Endpoint síncrono; la asincronía la maneja NestJS (ver 6.3). |
| 3. Extracción estructurada (LLM) | **ai-service** | El LLM Router vive ahí; JSON mode de Gemini vía `google-genai`. |
| 4. Cruce con expediente (contexto) | **NestJS construye el contexto, ai-service lo consume** | NestJS es dueño de Prisma/mention-index; arma un digest compacto y lo pasa en el payload de extracción. El ai-service nunca consulta la BD de papeles. |
| 5. Validación anti-alucinación | **NestJS** | Es quien persiste los hallazgos — valida la cita contra el transcript antes de crear cada fila (regla exacta en 6.9). |
| 6. Revisión humana (aceptar/descartar/promover) | **NestJS + web** | Endpoints de disposición + panel de revisión. |

**Orquestación**: NestJS es el orquestador único. El ai-service expone dos endpoints tontos y síncronos (`transcribe`, `extract`); no conoce el ciclo de vida, no guarda estado, no toca Storage.

### 6.2 Modelo de datos (Prisma — dos modelos nuevos, tres enums)

```prisma
enum FieldEvidenceKind {
  TEXT_NOTE        // texto libre / lluvia de ideas — Fase 1
  AUDIO_NOTE       // nota de voz corta del auditor — Fase 1
  INTERVIEW_AUDIO  // entrevista formal (diarización) — Fase 2
  ANNOTATED_PHOTO  // foto anotada — Fase 3
  SHORT_VIDEO      // video corto — Fase 4
}

enum FieldEvidenceStatus {
  UPLOADED      // ingesta completa (custodia sellada), pipeline no arrancado
  TRANSCRIBING  // en el ai-service (solo kinds con audio/video)
  EXTRACTING    // transcripción lista, extracción LLM en curso
  READY         // hallazgos sugeridos disponibles para revisión
  FAILED        // errorMsg poblado; reintentable
}

enum EvidenceFindingDisposition {
  PENDING    // sugerido por la IA, sin revisar
  ACCEPTED   // el auditor lo aceptó (fila materializada en la sección destino)
  DISCARDED  // el auditor lo descartó
  PROMOTED   // aceptado Y promovido a PT-HALL
}

model FieldEvidence {
  id             String              @id @default(cuid())
  auditId        String              // denormalizado — consultas y alcance de backup
  paperId        String
  sectionKey     String              // granularidad: (papel, sección) — §1 "capacidad general"
  kind           FieldEvidenceKind
  status         FieldEvidenceStatus @default(UPLOADED)

  // ── Custodia (molde: StepEvidence, extendido) ──
  storageKey     String?   // ruta bare en bucket audit-files; null para TEXT_NOTE
  filename       String?
  mimeType       String?
  size           Int       @default(0)
  sha256         String    // SHA-256 de los bytes originales (TEXT_NOTE: del texto UTF-8)
  textoOriginal  String?   // solo TEXT_NOTE — el texto ES la evidencia
  capturedById   String
  capturedByName String    // snapshot — sobrevive si la cuenta se elimina
  capturedAt     DateTime  // cuándo se capturó en campo (puede ≠ uploadedAt)
  uploadedAt     DateTime  @default(now())
  consentimiento Boolean   @default(false) // obligatorio true para INTERVIEW_AUDIO
  lugar          String?   // "Bodega central, Soyapango"
  descripcion    String?   // contexto del auditor: "arqueo de caja chica, turno noche"

  // ── Resultado del pipeline ──
  transcript          Json?    // shape en 6.6 — texto + segmentos con timestamps
  extraccionRaw       Json?    // salida cruda del LLM (trazabilidad) — los hallazgos viven en su tabla
  procesamientoIniciado DateTime? // para el reaper perezoso (6.3)
  errorMsg            String?
  processingMs        Int?
  modeloTranscripcion String?  // "faster-whisper/base/int8"
  modeloLlm           String?  // del retorno del LLM Router

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  audit      Audit                  @relation(fields: [auditId], references: [id], onDelete: Cascade)
  paper      WorkingPaper           @relation(fields: [paperId], references: [id], onDelete: Cascade)
  capturedBy User                   @relation(fields: [capturedById], references: [id])
  findings   FieldEvidenceFinding[]

  @@index([auditId])
  @@index([paperId])
  @@index([status])
  @@map("field_evidences")
}

model FieldEvidenceFinding {
  id           String  @id @default(cuid())
  evidenceId   String
  tipo         String  // contradiccion | evasiva | anomalia_visual | riesgo_mencionado | inconsistencia_con_expediente | incumplimiento_mencionado
  descripcion  String
  citaTextual  String  // debe existir literal en la fuente (6.9)
  fuenteRef    String? // "mm:ss" (audio/video) | "zona #N" (foto) | null (texto)
  nivelRiesgo  String  // bajo | medio | alto
  justificacion String?
  validadaCita Boolean // resultado del check anti-alucinación
  referenciasExpediente Json? // [{code, sectionKey?, motivo}] — propuestas por el LLM

  // ── Disposición humana (molde: DataFlag) ──
  disposition       EvidenceFindingDisposition @default(PENDING)
  reviewedById      String?
  reviewedAt        DateTime?
  targetSectionKey  String?  // dónde se materializó la fila al aceptar
  promotedToPaperId String?  // WorkingPaper PT-HALL creado al promover

  createdAt DateTime @default(now())

  evidence FieldEvidence @relation(fields: [evidenceId], references: [id], onDelete: Cascade)

  @@index([evidenceId])
  @@map("field_evidence_findings")
}
```

**Decisiones dentro del modelo:**
- **La fila de evidencia ES el job** — no hay tabla de jobs separada (precedente: `KnowledgeDocument.status`). Menos piezas, y el estado del pipeline es un atributo natural de la evidencia.
- **Los hallazgos sugeridos van en tabla relacional, no en `value` JSON** — porque necesitan disposición individual con quién/cuándo (imposible de auditar en filas MATRIX) y trazabilidad de promoción. Precedente: `PROCEDURE_GRID` ya renderiza secciones respaldadas por modelos reales (`AuditProcedure`/`AuditStep`), no por `value`.
- `status` y `disposition` son **enums Prisma**, no `String` — corrige el error de `DataAnalysisJob` señalado en la exploración.
- `tipo`/`nivelRiesgo` quedan `String` a propósito: sus valores los produce el LLM y el catálogo puede crecer sin migración; el `response_schema` de Gemini (6.8) los restringe en origen.
- Aplicar con `npx prisma db push` (lección #18 — `migrate dev` falla con P3006 en esta BD).

### 6.3 Ciclo de vida — máquina de estados y orquestación

```
TEXT_NOTE:    UPLOADED ──────────────► EXTRACTING ──► READY
AUDIO_NOTE:   UPLOADED ──► TRANSCRIBING ──► EXTRACTING ──► READY
                   (cualquier paso) ──► FAILED ──(retry)──► re-entra donde corresponde
```

Patrón `ConnectorImport` con dos mejoras contra sus debilidades conocidas:

1. **Fire-and-forget con estado granular**: `POST …/evidence` crea la fila (custodia completa) y dispara `procesarEvidenciaBackground(evidenceId)` **sin await**; devuelve `201 { evidenceId, status }` de inmediato. El cliente hace polling a `GET …/evidence/:id`.
2. **Reaper perezoso (sin scheduler — no existe ninguno en el repo y no se introduce uno para esto)**: al ejecutar `GET` de una evidencia en `TRANSCRIBING`/`EXTRACTING` con `procesamientoIniciado` hace más de **30 minutos**, el propio GET la marca `FAILED` con `errorMsg: 'timeout — el proceso pudo reiniciarse a mitad del procesamiento'`. Un job zombi se auto-sana en la primera consulta, sin cron.
3. **Reintento real**: `POST …/evidence/:id/retry` re-corre el pipeline **desde el original custodiado** (descarga `storageKey` de Storage, o usa `textoOriginal`) — posible precisamente porque la custodia nunca sobrescribe la fuente. Antes de re-correr, borra los `FieldEvidenceFinding` en `PENDING` de esa evidencia (los ya dispuestos — ACCEPTED/DISCARDED/PROMOTED — se conservan; los nuevos se deduplican contra ellos por `citaTextual`).

### 6.4 Esquema JSON de extracción — definitivo (refina §2.2)

Salida del LLM (snake_case — es la frontera Python), **validada con Pydantic en el ai-service y re-validada en NestJS antes de persistir**:

```json
{
  "resumen_ejecutivo": "2-4 frases, obligatorio",
  "temas": ["tema 1", "tema 2"],
  "entidades_mencionadas": [
    { "nombre": "Lic. Fulano Pérez", "tipo": "persona" }
  ],
  "hallazgos": [
    {
      "tipo": "contradiccion",
      "descripcion": "El entrevistado afirma X pero antes dijo Y",
      "cita_textual": "subcadena LITERAL de la fuente — sin parafrasear",
      "fuente_ref": "14:32",
      "nivel_riesgo": "alto",
      "justificacion": "por qué esto importa para la auditoría",
      "referencias_expediente": [
        { "code": "A-02", "section_key": "S3", "motivo": "contradice el riesgo R-04 documentado" }
      ]
    }
  ]
}
```

- `tipo` ∈ `contradiccion | evasiva | anomalia_visual | riesgo_mencionado | inconsistencia_con_expediente | incumplimiento_mencionado` (el sexto valor se agregó sobre §2.2: "mencionaron que no se hace X que la norma exige" no calza en los cinco originales).
- `temas` es nuevo sobre §2.2 — responde directamente al pedido del usuario de que la lluvia de ideas "el sistema sea capaz de ordenar": el panel agrupa por tema.
- `entidades_mencionadas` pasa de `string[]` a objetos con `tipo` (`persona | area | sistema | documento | monto | fecha | otro`) — costo marginal en el schema, habilita cruces futuros sin re-extraer.
- `fuente_ref` es `null` para TEXT_NOTE.
- Un solo esquema para las 4 modalidades (principio de §2) — `anomalia_visual` simplemente no aparecerá en evidencia de solo-texto/audio.

### 6.5 Contrato de endpoints — NestJS (módulo nuevo `field-evidence` dentro de `working-papers`)

Convenciones existentes: `@Roles` con jerarquía (`RolesGuard`), `FileInterceptor` con `memoryStorage`, validación de organización vía el papel.

| Endpoint | Rol | Contrato |
|---|---|---|
| `POST working-papers/:id/evidence` | AUDITOR | Multipart: `file` (opcional si `kind=TEXT_NOTE`) + form: `kind`, `sectionKey`, `capturedAt` (ISO), `consentimiento` ('true'/'false'), `lugar?`, `descripcion?`, `texto?` (obligatorio para TEXT_NOTE). Límite archivo: **100MB** (una entrevista de 45 min a 128kbps ≈ 43MB; el límite de 25MB de los adjuntos normales no alcanza). Valida: `INTERVIEW_AUDIO` sin `consentimiento=true` → 400. Sella custodia (SHA-256, Storage en `evidence/{auditId}/{paperId}/{evidenceId}_{safeName}`), crea fila, dispara pipeline, devuelve `201 {evidenceId, status}`. |
| `GET working-papers/:id/evidence` | AUDITOR | Lista de evidencias del papel con sus findings (`disposition != DISCARDED` por defecto; `?all=true` incluye todo). Ejecuta el reaper perezoso sobre las filas devueltas. |
| `GET working-papers/:id/evidence/:evidenceId` | AUDITOR | Polling de estado. Incluye transcript y findings cuando `READY`. |
| `POST working-papers/:id/evidence/:evidenceId/retry` | AUDITOR | Solo si `FAILED`. Re-corre desde el original (6.3.3). |
| `DELETE working-papers/:id/evidence/:evidenceId` | SENIOR_AUDITOR | Borra fila (+cascada findings) y el archivo de Storage. Rol elevado: eliminar evidencia de campo es un acto de custodia, no de edición. |
| `POST working-papers/:id/evidence/findings/:findingId/accept` | AUDITOR | Body: `{ targetSectionKey?: string }` (default: la `sectionKey` de la evidencia). Materializa la fila (6.10), crea `PaperReference` por cada `referenciasExpediente` resoluble, marca `ACCEPTED` + `reviewedById/At`. |
| `POST working-papers/:id/evidence/findings/:findingId/discard` | AUDITOR | Marca `DISCARDED` + `reviewedById/At`. Nada más. |
| `POST working-papers/:id/evidence/findings/:findingId/promote` | SENIOR_AUDITOR | Solo si ya `ACCEPTED`. Crea papel `PT-HALL` (o agrega fila a S1 del PT-HALL del encargo si ya existe) con condición=descripcion, evidencia=citaTextual + link a la evidencia; marca `PROMOTED` + `promotedToPaperId`. Reutiliza el flujo PT-HALL→`Finding` existente después, sin tocarlo. |

### 6.6 Contrato de endpoints — ai-service (router nuevo `app/routers/evidence.py`)

Ambos síncronos, ambos con `x-internal-key` (helper factorizado), ambos snake_case.

**`POST /evidence/transcribe`** — multipart (molde `/rag/ingest/pdf`):
```python
file: UploadFile = File(...)          # límite 100MB, mismo patrón tempfile+finally
language: str | None = Form(None)     # hint ("es"); None = autodetección
x_internal_key: str | None = Header(default=None, alias="x-internal-key")
```
Respuesta:
```json
{
  "texto": "transcripción completa",
  "segmentos": [ { "inicio": 0.0, "fin": 4.2, "texto": "..." } ],
  "idioma": "es",
  "duracion_seg": 312.4,
  "modelo": "faster-whisper/base/int8",
  "processing_ms": 48210
}
```
(El campo `hablante` se añade a `segmentos` en Fase 2 con pyannote — el shape ya lo admite sin romper nada.)

**`POST /evidence/extract`** — JSON:
```json
{
  "fuente_tipo": "texto | transcripcion_audio",
  "contenido": "el texto o transcript completo",
  "segmentos": [ ... ] ,
  "contexto_expediente": {
    "audit_title": "...", "audit_type": "...",
    "papeles": [ { "code": "A-02", "title": "...", "sections": [{"key": "S3", "label": "..."}] } ],
    "extractos": [ { "code": "A-02", "section_key": "S3", "resumen": "texto plano compacto" } ]
  },
  "instrucciones_extra": "descripcion/lugar aportados por el auditor"
}
```
Respuesta: el esquema 6.4 + `{ "modelo": "...", "input_tokens": n, "output_tokens": n }`.

**Contexto de expediente (paso 4, lado NestJS)**: `getMentionIndex` devuelve solo etiquetas (verificado — no incluye `value`), así que el orquestador arma: (a) el índice completo de `papeles` (barato), y (b) `extractos` con el `value` aplanado a texto de **como máximo 5 secciones**: las del propio papel de la evidencia + `PT-A2` (riesgos) si existe en el encargo. Tope duro de ~8k caracteres por extracto — el objetivo de Fase 1 es que el LLM pueda citar códigos reales en `referencias_expediente`, no un RAG completo (eso sería scope creep; el RAG existente puede integrarse en una fase posterior si hace falta).

### 6.7 Transcripción — decisiones operativas de faster-whisper

- **Dependencia**: `faster-whisper>=1.0.0` (trae `ctranslate2` + `av`; PyAV empaqueta ffmpeg — **no hay que instalar ffmpeg de sistema**, el Dockerfile/VPS no cambian por esto).
- **Modelo inicial: `base`, `compute_type="int8"`, `device="cpu"`** (~150MB RAM). Razón: el límite PM2 de 800MB con 2 workers hace inviable arrancar con `small` (~500MB pico por worker). `base` en español es aceptable para notas de voz; EVD-10 evalúa calidad real y decide si subir a `small` + subir `max_memory_restart` (recomendación si se sube: `1600M`).
- **Carga perezosa, singleton por proceso**: el modelo se carga en el primer request de transcripción, no al arrancar (los workers que nunca transcriben no pagan la RAM). Config por env: `WHISPER_MODEL_SIZE` (default `base`), `WHISPER_COMPUTE_TYPE` (default `int8`), `WHISPER_DEVICE` (default `cpu`) — declaradas en `Settings` **y** propagadas en el bloque `auditmind-ai` de `ecosystem.config.cjs` (el bloque enumera vars explícitamente, no hereda el .env — hecho verificado).
- **La descarga del modelo ocurre en el primer uso** (HuggingFace) — en el VPS, el primer request tras cada deploy será lento una vez; aceptable en Fase 1, documentar en el runbook de deploy.
- Timeout del `fetch` NestJS→ai-service para transcribir: **10 minutos** (`AbortSignal.timeout(600_000)`) — las llamadas actuales al ai-service no llevan timeout (verificado); ésta sí lo necesita porque 45 min de audio en CPU puede tardar varios minutos, pero no debe colgar para siempre.

### 6.8 Extracción — salida estructurada real

- Se agrega a `llm_router.py` una función nueva (no se toca `chat_with_agent`, que 6 routers ya usan):
  ```python
  async def generate_structured(agent_type: str, system_prompt: str, user_content: str,
                                response_schema: type[BaseModel], max_tokens: int = 8192,
                                temperature: float = 0.1) -> dict
  ```
  Gemini primario con `GenerateContentConfig(response_mime_type="application/json", response_schema=..., temperature=...)`; fallback Claude con instrucción JSON + **un único parser compartido** (se promueve `_parse_json_response` de `scriptorium.py` a `app/services/json_utils.py` — no un tercer parser duplicado). Validación Pydantic del resultado en ambas rutas; si no valida, **un reintento** con el error de validación anexado al prompt, luego error.
- `temperature=0.1` — extracción es tarea determinista, no creativa (el 0.7 fijo actual de `_chat_gemini` es otra razón para función nueva).
- Prompt de sistema: vive en `app/routers/evidence.py` (patrón scriptorium: cada router arma sus prompts; `agent_prompts.py` es para los agentes conversacionales). Registra telemetría en `AIInteraction` igual que el resto (lado NestJS, que es quien la escribe hoy).

### 6.9 Validación anti-alucinación — regla exacta

Al recibir la extracción, NestJS valida **cada** `cita_textual` contra la fuente (transcript.texto o textoOriginal):

1. Normalización de ambos lados: minúsculas + colapso de espacios en blanco (`\s+` → un espacio). **No** se quitan tildes ni puntuación — "literal" significa literal; Whisper y el LLM ven el mismo texto, no hay excusa de OCR.
2. `fuenteNormalizada.includes(citaNormalizada)` → `validadaCita: true/false`.
3. Los hallazgos con `validadaCita: false` **se persisten** (trazabilidad de qué alucinó el modelo) pero **quedan excluidos de la lista de sugerencias por defecto** — el panel muestra solo un contador: "N hallazgo(s) descartado(s) por cita no verificable" con opción de expandir. No se pueden aceptar ni promover (400 en el endpoint de accept). El principio del documento 2 ("la cita debe existir antes de mostrarla") se cumple sin ocultar al auditor que el modelo falló.

### 6.10 Aceptar — materialización de la fila

Al aceptar un hallazgo contra una sección MATRIX (el caso normal), se aplica el patrón aditivo de `seedSubstantiveProcedures` (merge, nunca reemplazo, respetando columnas existentes) con la convención de extras de `MatrixGridPanel` (claves `_` que el grid nunca trata como columnas de datos):

```
{ ...columnas visibles mapeadas,       // Descripción → descripcion, Riesgo → nivelRiesgo, etc.
  "_id": <rowId nuevo>,
  "_origen": "evidencia",
  "_evidenciaId": <FieldEvidence.id>,
  "_findingId": <FieldEvidenceFinding.id>,
  "_cita": <citaTextual> }
```

- La fila materializada lleva la procedencia completa — desde cualquier papel se puede volver a la evidencia y a la cita.
- Si la sección destino no es MATRIX (p. ej. TEXTAREA), el accept marca `ACCEPTED` y el panel muestra el hallazgo como aceptado sin materializar fila (el auditor redacta a mano usando la cita) — se registra `targetSectionKey: null`.
- `PaperReference`: por cada `referencias_expediente` cuyo `code` exista en el encargo, se crea referencia `sourcePaperId=papel de la evidencia, targetPaperId=resuelto por code, refType=FIELD|INDEX` vía el `createReference` existente — así los cruces alimentan el grafo de conocimiento real.

### 6.11 PT-ENTREV — contenido para B-04 (EVD-08)

`B-04` de la plantilla NOGAI recibe `paperCode: 'PT-ENTREV'` y la clave se crea en `PAPER_TEMPLATES` (nota verificada: `PT-B1/PT-B2/PT-B4` de esa plantilla tampoco existen como claves — deuda preexistente separada, no se arregla aquí):

| Key | Label | FieldType | Columnas (vía `aiHint`, convención `'Columnas: A \| B \| C'`) |
|---|---|---|---|
| S1 | Planificación de la Entrevista | MATRIX | `#`, `Tema/Pregunta`, `Objetivo de auditoría`, `Respuesta esperada` |
| S2 | Registro de Sesiones | MATRIX | `Fecha`, `Entrevistado`, `Cargo`, `Modalidad`, `Consentimiento`, `Duración` |
| S3 | Hallazgos de la Evidencia | MATRIX | Destino por defecto del "aceptar": `#`, `Tipo`, `Descripción`, `Riesgo`, `Fuente` |
| S4 | Conclusión del Auditor | TEXTAREA | — |

**El panel de captura/revisión (`FieldEvidencePanel`) NO es un `FieldType` nuevo** — se monta una vez por papel en `SmartPaperSections` (mismo patrón que `WorkOfflinePanel`), colapsado por defecto, disponible en TODO papel inteligente. Así la capacidad es general (§1) sin tocar el enum ni las 64 plantillas; PT-ENTREV es solo su primer consumidor con secciones pensadas para ella.

### 6.12 Config y deploy — cambios exactos

| Dónde | Cambio |
|---|---|
| `apps/ai-service/requirements.txt` | + `faster-whisper>=1.0.0` |
| `apps/ai-service/app/config.py` | + `WHISPER_MODEL_SIZE: str = "base"`, `WHISPER_COMPUTE_TYPE: str = "int8"`, `WHISPER_DEVICE: str = "cpu"` |
| `apps/ai-service/app/services/auth.py` (nuevo) | `verify_internal_key` factorizado (los 3 routers existentes pueden migrar después; el nuevo lo usa desde el inicio) |
| `ecosystem.config.cjs` (VPS, al desplegar) | Propagar las 3 vars WHISPER_* en el bloque `auditmind-ai`; evaluar `max_memory_restart` si se sube de modelo (6.7) |
| NestJS | Sin vars nuevas (`AI_SERVICE_URL`/`AI_SERVICE_INTERNAL_KEY` ya existen) |

### 6.13 Integración con el backup de encargos (BKP)

- `fieldEvidence` entra a `AUDIT_SCOPED_MODELS` como `auditId_directo`, **ordenado después de `workingPaper`** (su `paperId` debe ser remapeable — misma lección del bug de orden de BKP-10). `fieldEvidenceFinding` entra con un filtro nuevo `via_evidenceId`.
- Las rutas `evidence/{auditId}/...` son bare `storageKey` — el regex de rutas bare del backup (`audit-backup-files.service.ts`) debe ampliarse para reconocerlas. **Hallazgo colateral de esta exploración**: ese regex ya tiene un hueco preexistente — tampoco reconoce las rutas `procedures/steps/...` de `StepEvidence`, así que esos archivos hoy se omiten silenciosamente del backup (flageado como tarea separada).

### 6.14 Riesgos aceptados y no-objetivos de Fase 1

1. **Jobs fire-and-forget siguen sin sobrevivir un restart** — mitigado (reaper perezoso + retry desde el original custodiado), no eliminado. Introducir una cola real (BullMQ) por esto solo sería sobre-ingeniería hoy.
2. **Calidad de `base` en español no está garantizada** — EVD-10 la evalúa con audio real antes de dar la fase por cerrada; el plan B (modelo `small` + más memoria PM2) queda pre-decidido en 6.7.
3. **El cruce con expediente de Fase 1 es superficial a propósito** (índice + ≤5 extractos) — suficiente para `inconsistencia_con_expediente` básicas; integración con el RAG existente queda explícitamente fuera de alcance.
4. **`AIInteraction`/telemetría**: se registra desde NestJS como hoy; no se construye telemetría nueva en el ai-service.
5. **No se toca `chatWithAgent` ni ningún endpoint existente del ai-service** — todo lo nuevo es aditivo (router nuevo, función nueva en llm_router, helper de auth nuevo).
