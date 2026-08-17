# Inteligencia de Evidencia de Campo — Propuesta de Funcionalidad

> Investigación realizada: 2026-08-16
> Fuentes: dos documentos aportados por el usuario (`AuditMind_Integraciones_v14.0.docx.md` — investigación de mercado de 10 capacidades de sistemas líderes; `Modulo_IA_Analisis_Entrevistas_Auditoria.md` — propuesta técnica de cadena de transcripción/análisis de entrevistas) + verificación directa contra el código real de AuditMind + investigación externa sobre captura de video/anotaciones/notas de campo en herramientas adyacentes.
> Contexto: el usuario pidió evaluar ambos documentos, investigar cómo lo implementan las firmas grandes, y proponer cómo integrar esto a AuditMind — cubriendo no solo audio, sino video corto, anotaciones y lluvia de ideas, en un flujo campo↔oficina, con IA que ordene y busque pistas de auditoría/fraude/riesgo.
> **Estado: PROPUESTA — nada de esto está implementado todavía.** Este documento es el punto de partida para decidir alcance y empezar, no un registro de trabajo hecho.

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

1. ¿Empezamos por la Fase 1 (nota de voz/texto, la más barata) para validar el pipeline completo antes de invertir en entrevista formal con diarización?
2. ~~Connectividad real en campo — ¿justifica offline-first?~~ **Resuelto (2026-08-16): pospuesto — la plantilla Excel genérica (EXC-24..30 en `docs/integracion-excel-plantillas-inteligentes.md`) cubre la necesidad por ahora.**
3. ¿El audio de entrevistas de PLAFT/RRHH debe procesarse 100% dentro de tu infraestructura (Whisper autoalojado, como recomienda el documento 2) o hay tolerancia a usar una API externa gestionada para ir más rápido al mercado, revisando después las cláusulas de retención del proveedor?
4. ¿Los hallazgos extraídos deben poder promoverse directamente a `PT-HALL` (Hallazgo Individual), o quedarse solo como filas sugeridas dentro de la sección donde se adjuntó la evidencia?
