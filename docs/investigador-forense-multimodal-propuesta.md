# Investigador Forense Multi-Modal — Propuesta

**Estado**: propuesta, no implementada. Este documento cubre el *qué* y el *por qué*; el plan de implementación técnico (archivos, endpoints, migraciones) se hace en una ronda aparte una vez que se apruebe el enfoque.

## Resumen ejecutivo

Un nuevo agente/papel de trabajo donde el auditor sube evidencia mixta (audio, PDF, fotos, Excel/CSV, narrativa libre), el sistema la convierte en un **grafo de evidencia conectado** (personas, cuentas, transacciones, fechas, afirmaciones, documentos y sus relaciones), y una IA razona sobre el grafo completo contra un **objetivo que el propio usuario define** (ej. *"determinar si existen indicios de vulneración de controles, fraude en las transacciones X, confesiones involuntarias, evidencia documental"*) — detectando banderas de riesgo incluso sin que se le pida explícitamente.

**Hallazgo clave de la investigación**: no se parte de cero. AuditMind ya tiene construido casi todo el *hardware* de este feature — captura multi-modal con custodia real, extracción estructurada con validación anti-alucinación, 17 motores CAATs invocables genéricamente, y hasta el **nombre del agente ya reservado** (`SHERLOCK`, "Agente de Investigación Forense", con prompt propio pero sin ninguna lógica real detrás). Lo que falta es la pieza conceptualmente nueva: el grafo que conecta evidencia entre sí, y la orquestación que decide qué invocar según el objetivo.

---

## Qué ya existe y es reutilizable (verificado en el código, no supuesto)

| Capacidad | Estado | Dónde vive |
|---|---|---|
| Captura multi-modal (audio/foto/video/texto) + custodia (SHA-256) + transcripción/diarización | ✅ Construido | `FieldEvidenceService` (`apps/api/src/working-papers/field-evidence/`) |
| Extracción estructurada de hallazgos con validación anti-alucinación (cita textual debe existir literal en la fuente) | ✅ Construido | `ejecutarExtraccion`/`extractFieldEvidence` en el mismo servicio |
| Flujo de revisión humana (Pendiente → Aceptado/Descartado → Promovido a hallazgo formal) | ✅ Construido | Mismo servicio, materializa en `PaperReference` real |
| 17 motores CAATs (Benford, partes relacionadas, SoD, anomalías, etc.) con interfaz genérica invocable | ✅ Construido | `AiService.runCaats()` → `POST /ai/analytics/:type`, 17 módulos en `apps/ai-service/app/services/caats/` |
| Parseo de Excel/CSV con detección de fila de encabezado (exports reales de ERP) | ✅ Construido | `POST /connectors/parse` (`apps/ai-service/app/routers/connectors.py`) |
| Sistema de personas IA (14 agentes) — agregar una nueva es una entrada de diccionario | ✅ Construido, trivial de extender | `agent_prompts.py` / `agent-prompts.ts` |
| **Persona "SHERLOCK — Agente de Investigación Forense"** — nombre y prompt ya existen | ⚠️ Solo el prompt, cero lógica de backend detrás | `agent_prompts.py:208-223` |
| Cascada de embeddings (Gemini→Voyage→Jina→Cohere) + pgvector + búsqueda semántica | ✅ Construido, pero **solo para normativa**, scoped por organización, no por auditoría | `apps/ai-service/app/services/rag_pipeline.py` |
| Visualización de grafo (React Flow + dagre, minimapa, tipos de arista coloreados) | ✅ Shell reutilizable, granularidad equivocada hoy (papel↔papel, no entidad↔entidad) | `PapersGraphView.tsx` |

## Qué NO existe y sí hay que construir

- **Grafo de entidades/relaciones entre evidencias** — hoy cada evidencia se analiza contra su propio papel, no contra el resto de evidencia del encargo. Esta es la pieza central de la propuesta.
- **Búsqueda entre los papeles inteligentes del mismo encargo** — no existe un índice semántico ni de texto completo sobre `PaperSection.value`. Solo hay un índice de *etiquetas* (para el autocompletado de `@menciones`) y un mecanismo fijo (no búsqueda) que `FieldEvidence` usa para traer hasta 5 secciones de contexto.
- **Function-calling / orquestación desde el propio modelo** — ningún agente de AuditMind hoy puede "decidir e invocar" una herramienta interna por sí mismo; toda la orquestación vive en código de aplicación (NestJS/ai-service), nunca en un loop agentic del lado del modelo. Esto es una decisión de arquitectura a tomar: no vamos a construir un runtime de tool-calling genérico — vamos a construir una orquestación explícita y determinista (más fácil de auditar y depurar que un agente que decide libremente, y más apropiado para un producto de auditoría donde la trazabilidad importa más que la autonomía).

---

## Ideas adaptadas de proyectos externos (solo conceptos, cero código copiado)

Investigación de proyectos open-source con el mismo problema de fondo (construir un grafo de conocimiento desde documentos con LLMs). Nada de esto se copia — son técnicas ya probadas por otros que evitan que reinventemos con los mismos errores:

- **[Microsoft GraphRAG](https://github.com/microsoft/graphrag)** (MIT) — agrupa el grafo en comunidades (Leiden) y genera un resumen narrativo por comunidad a varios niveles de abstracción. **Se adapta como**: "clusters de riesgo" con un brief narrativo por cluster que el auditor puede expandir, en vez de una lista plana de hallazgos.
- **[Neo4j LLM Graph Builder](https://github.com/neo4j-labs/llm-graph-builder)** (Apache-2.0) — separa un "grafo léxico" (documento→fragmentos) de un "grafo de entidades" encima, con cada entidad enlazada de vuelta a su fragmento fuente. **Se adapta como**: toda entidad extraída lleva un FK obligatorio a su evidencia de origen — ninguna afirmación del investigador sin cita rastreable, mismo principio que ya aplica `FieldEvidence` hoy.
- **[Graphiti (Zep)](https://github.com/getzep/graphiti)** (Apache-2.0) — aristas con validez temporal (`t_valid`/`t_invalid`); una afirmación contradicha no se borra, se invalida y queda el historial. **Se adapta como**: cuando dos evidencias se contradicen (ej. dos entrevistas con versiones distintas), el grafo conserva ambas con su vigencia, no sobrescribe.
- **[Mem0](https://github.com/mem0ai/mem0)** (Apache-2.0) — enruta hechos extraídos a vector store / key-value / grafo según el tipo de hecho. **Se adapta como**: confirma que NO hace falta una base de datos de grafos dedicada (Neo4j, etc.) — Postgres con una tabla de aristas + pgvector para similitud es suficiente para esta escala.
- **[OpenCTI](https://github.com/opencti-platform/opencti)** (Apache-2.0, edición Community) — define una ontología fija de tipos (persona, indicador, relación) *antes* de extraer, en vez de dejar que el LLM invente categorías libremente. **Se adapta como**: la ontología de la sección siguiente se fija de entrada, no se deja "abierta" a lo que el LLM decida llamar cada cosa — clave para que el grafo sea consistente y consultable.
- Ningún proyecto revisado hace ya extracción conjunta audio+OCR+tabular en un solo grafo — la recomendación práctica (de Neo4j Graph Builder, el más cercano) es normalizar toda fuente a "fragmento + metadata de procedencia" (tipo de fuente, página/timestamp, confianza) *antes* de extraer, para que audio, PDF y filas de Excel entren por la misma puerta de extracción.

## Ontología propuesta (fija, no libre)

Entidades: **Persona**, **Cuenta**, **Transacción**, **Documento**, **Afirmación** (claim/testimonio), **Fecha/Evento**. Cada arista lleva **tipo** (ej. `AUTORIZÓ`, `CONTRADICE`, `MENCIONA`, `INVOLUCRA`), **confianza** (0-1, del LLM extractor) y **procedencia obligatoria** (FK a la evidencia/sección/hallazgo CAATs de origen — nunca una relación sin fuente citable).

---

## Fase 1 — Fundación: el grafo, sin agente todavía

**Objetivo**: que exista un grafo de evidencia real y navegable por encargo, construido sobre lo que ya está probado en producción. Sin razonamiento autónomo todavía — solo estructura y visualización.

- Dos tablas nuevas (`investigation_entities`, `investigation_edges`), con FK de procedencia hacia `FieldEvidence`, `PaperSection`, o un resultado CAATs.
- Un paso de extracción adicional, pequeño, encadenado al final de `ejecutarExtraccion()` (que YA validó que las citas no son alucinadas) — reutiliza esa misma garantía en vez de reinventarla, solo agrega "de este texto ya validado, extrae entidades/relaciones según la ontología fija".
- Reutilizar el shell de `PapersGraphView.tsx` (React Flow + dagre) para una nueva vista "Grafo de Evidencia" — cambiar qué datos consume, no cómo se dibuja.
- Los resultados de CAATs (cuando el auditor corre uno manualmente desde `CaatsAnalysisPanel`) también alimentan el grafo con el mismo paso de extracción — así una transacción marcada por Benford ya aparece como nodo conectado a la evidencia relacionada.
- **Sin objetivo de usuario ni razonamiento todavía** — es la capa de datos y visualización primero, para poder validar que la extracción es de calidad antes de construir el investigador encima.

## Fase 2 — El investigador: agente SHERLOCK real

**Objetivo**: darle cuerpo real a la persona `SHERLOCK` que ya existe solo como prompt. El auditor define un objetivo en texto libre, y el sistema orquesta (de forma explícita y determinista, no como un loop agentic abierto) qué invocar:

- Recorre el grafo de evidencia de Fase 1 en busca de patrones relevantes al objetivo.
- Si hay evidencia tipo Excel/CSV sin analizar todavía, sugiere/ejecuta el motor CAATs correspondiente (`runCaats()`, ya genérico) y vuelca el resultado al grafo.
- **Búsqueda en los papeles inteligentes del encargo** (pedido explícito del usuario): primera versión como búsqueda SQL simple sobre `PaperSection.value` del mismo `auditId` (barato, sin nueva infraestructura) — mejorable después a una extensión con scope por auditoría del pipeline pgvector ya existente (§ arriba), reusando toda la cascada de embeddings, solo agregando ingesta de contenido de auditoría además de normativa.
- Adopta la idea de "clusters con resumen narrativo" (GraphRAG) — el investigador no entrega una lista plana, entrega grupos de hallazgos relacionados con un brief citable cada uno, más una conclusión general contra el objetivo planteado.
- Aristas con vigencia temporal (Graphiti) para cuando dos fuentes se contradicen — no se pierde ninguna versión.
- Vive como un nuevo tipo de papel de trabajo (o un panel tipo `CosoAssessmentPanel`/`FieldEvidencePanel`) con el mismo flujo de revisión humana que ya usa `FieldEvidence`: los hallazgos del investigador son sugerencias promovibles a `PT-HALL`, nunca se auto-aprueban.
- **Salida dividida en dos grupos, nunca uno solo**: "Hallazgos relacionados al objetivo" (lo que el auditor pidió) y "Otras banderas detectadas" (lo que la IA notó de pasada, fuera del objetivo puntual). Nunca se omite nada en silencio — coincide con lo que ya pedía la propuesta original ("detecte incluso sin que le pidan nada") y con el criterio de un auditor real (indicios materiales fuera de alcance igual deben evaluarse, no descartarse).
- **Campo de "contexto previo del auditor", separado del objetivo** — texto amplio (o dictado por voz, mismo mecanismo TEXT_NOTE/AUDIO_NOTE con transcripción que ya captura evidencia, sin construir un input nuevo) donde el auditor describe hechos previos que ya conoce. Pasa por la MISMA extracción que la evidencia, generando sus propias entidades `AFIRMACION`, pero etiquetadas explícitamente como "aportadas por el auditor" — nunca se mezclan con lo "extraído de evidencia objetiva" como si pesaran igual. **Tercera salida del investigador**: por cada afirmación del auditor, el resultado indica **Confirmada / Contradicha / Sin evidencia suficiente** contra lo que el grafo de evidencia realmente muestra — sirve tanto para reforzar el objetivo del análisis como para detectar cuando el propio entendimiento del auditor estaba incompleto o equivocado. **Salvaguarda de diseño**: la extracción de la evidencia debe hacerse CIEGA al contexto del auditor — si el LLM ve primero la hipótesis del auditor y luego analiza la evidencia, hay riesgo real de sesgo de confirmación (que "encuentre" lo que se le sugirió). La comparación contra el contexto del auditor es un paso aparte, después de que la extracción de evidencia ya ocurrió de forma independiente.

**Correcciones/mejoras a Fase 1 que se incorporan aquí** (identificadas al revisar la Fase 1 ya construida — ninguna estaba explícitamente en Fase 2 ni Fase 3 antes de esta ronda):

- **Las relaciones de Fase 1 solo conectan cosas DENTRO de una misma evidencia** — cada extracción solo ve el texto de su propia evidencia, así que dos evidencias distintas que se contradicen (ej. dos entrevistas separadas) no generan una relación `CONTRADICE` automática hoy. Detectar relaciones ENTRE evidencias distintas es trabajo central de Fase 2 (necesita que el investigador razone sobre el grafo completo, no una extracción aislada) — se deja explícito para no asumir que ya "funciona" por cómo se ve una demo dentro de una sola evidencia.
- **Fusión manual de entidades duplicadas por variante de nombre** ("Juan Pérez" / "J. Pérez" / "el Sr. Pérez" quedan como nodos separados hoy, dedup solo exacto). No se propone resolución automática fuzzy/semántica (cara, riesgosa) — sí un botón simple "¿es la misma persona?" que el auditor confirme con un clic, mismo criterio de revisión humana que ya rige todo el resto del sistema.
- **Reproceso**: ni evidencia capturada antes de este deploy, ni evidencia cuyo paso de grafo falló después de que los hallazgos ya quedaron `READY`, se pueden reprocesar hoy. Agregar un botón "reprocesar grafo" sobre evidencia ya existente.
- **Usar el campo `confianza`**: se guarda desde Fase 1 pero no hace nada todavía — atenuar visualmente (línea punteada, opacidad) relaciones/menciones de baja confianza en el grafo, y usarlo como señal de priorización en el razonamiento del investigador.
- **Conectar el grafo con el flujo de aceptar/promover ya existente** de `FieldEvidenceFinding` — hoy son sistemas paralelos que no se hablan. El grafo debería distinguir visualmente "esto es solo lo que la IA sugirió" de "esto el auditor ya lo confirmó como hallazgo real" (`disposition: ACCEPTED/PROMOTED`), dándole mucho más peso como evidencia real y no solo como sugerencia de IA sin revisar.
- **Modal proactivo cuando el universo de datos es muy amplio**: antes de correr el investigador sobre un encargo con mucha evidencia/papeles, si el volumen es grande, mostrar un modal profesional (no solo un filtro pasivo) indicando que existe un universo amplio de datos y sugiriendo acotar el análisis por fecha, por papel específico, o por otro criterio — para que el auditor decida el alcance conscientemente en vez de lanzar un análisis costoso y difuso sobre todo el encargo sin darse cuenta.
- **Filtro/búsqueda en el grafo** cuando el volumen crezca (por tipo de entidad, por texto, por confianza/validación) — menor prioridad, pero necesario antes de usar esto en un encargo real grande.

**Detección de calidad de fuentes — PDF, audio y video** (pedido explícito del usuario, no estaba considerado):

- **PDF no es hoy un `FieldEvidenceKind`** — la propuesta original sí lo nombraba como fuente deseada, pero la Fase 1 solo extendió los tipos de evidencia YA existentes (texto/audio/foto/video), sin agregar PDF. Agregarlo es trabajo de base necesario antes de poder aplicar lo siguiente — encaja al inicio de Fase 2.
- Una vez que exista el tipo PDF: al ingerir, detectar si el PDF no trae capa de texto (mismo chequeo "0 caracteres extraíbles vía pdfplumber" que YA usa la cascada de OCR del pipeline RAG) → invocar automáticamente el mismo OCR de Stirling-PDF que ya usa "Notario PDF" (Fase B) y el auto-OCR de adjuntos (Fase A) — no hay que construir un OCR nuevo, solo conectar el que ya existe a esta nueva ruta de ingesta.
- Si el PDF sale oscuro/ilegible incluso después de OCR (poco texto extraído respecto a las páginas, o una proporción alta de ruido no alfanumérico en el resultado — heurística a definir con datos reales de Stirling), no forzar un resultado — marcar ese documento específico como **fuente no validada** en el resultado final del investigador, con el motivo, en vez de fingir que sí se analizó.
- **Mismo criterio para audio/video** — factores reales que dificultan la transcripción, para detectar y reportar en vez de ignorar: volumen bajo, ruido de fondo (tráfico, viento, maquinaria), múltiples personas hablando a la vez (dificulta diarización), acento/dialecto marcado, calidad de compresión baja (audio reenviado por WhatsApp, re-codificado varias veces), clipping/distorsión por sobre-modulación, cambio de idioma a media oración, y para video además: poca luz, movimiento de cámara, sujeto lejos del encuadre, resolución baja que impide leer documentos/pantallas en la imagen. Señal técnica concreta y ya disponible sin construir nada nuevo: **faster-whisper expone `no_speech_prob` y probabilidad/log-probabilidad por segmento** — un segmento con `no_speech_prob` alto o probabilidad baja es exactamente la señal de "esto probablemente salió mal", reutilizable directo para marcar tramos de baja confianza sin necesitar un analizador de calidad de audio aparte.
- El resultado final del investigador (Fase 2) debe incluir una sección explícita de **fuentes no validadas/degradadas**, detallando qué documento/audio/video específico no se pudo procesar con confianza y por qué — para que el auditor sepa dónde el análisis tiene puntos ciegos, en vez de asumir que toda la evidencia se cubrió por igual.

## Fase 3 — A futuro, no comprometida todavía

Ideas que quedan mejor para después de validar Fases 1-2 en uso real: ingesta incremental sin reprocesar todo el grafo cada vez (patrón LightRAG), un score estadístico de anomalía de grafo (tipo GNN) como señal adicional junto al razonamiento narrativo del LLM, y aprendizaje de patrones de fraude ya vistos en otros encargos de la misma organización.

---

## Riesgos y consideraciones a resolver antes de implementar

- **Costo de LLM**: un paso de extracción adicional por cada evidencia (Fase 1) y llamadas de orquestación por cada consulta del investigador (Fase 2) — hay que estimar volumen real antes de comprometer presupuesto de tokens.
- **Falsos positivos / sobre-confianza**: el mismo principio que ya rige `FieldEvidence` (nada se auto-promueve, todo pasa por revisión humana) debe aplicar aquí con más razón — un "investigador" que sugiere fraude sin supervisión es un riesgo reputacional serio para el producto.
- **Ontología cerrada vs. flexible**: empezar con la ontología fija (6 tipos de entidad) es deliberado — se puede ampliar después, pero abrir el catálogo desde el día uno hace el grafo inconsistente e inconsultable.

## Siguiente paso

Con esta propuesta aprobada (o ajustada), la siguiente ronda es el plan de implementación técnico de la Fase 1: migraciones de Prisma, el nuevo paso de extracción, y la vista de grafo — con archivos y endpoints concretos, como se ha hecho para el resto de este roadmap.
