# IA con el contexto del papel de trabajo — diseño

Fecha: 2026-11-25. Origen: el usuario notó que los botones de IA de los papeles (mejorar redacción, sugerir procedimientos)
«pierden el contexto» y proponen texto genérico. Decisiones del usuario: el problema es parejo en todos los tipos de papel;
acotar los tokens al mínimo sin perder contexto; **si la IA no tiene contexto suficiente, debe decirlo en vez de inventar**.

## 1. Diagnóstico (código leído, no supuesto)

| # | Botón | Ruta | Contexto que recibe hoy |
|---|---|---|---|
| A | Varita «Mejorar redacción» (título, enunciado, desarrollo del procedimiento) | `POST /working-papers/ai/improve-text` → ai-service | Texto + tipo de campo + título y *tipo* del papel en una línea. El tipo del papel es una enumeración genérica. |
| B | Chispa «Borrador IA» (desarrollo del procedimiento) | `POST /working-papers/ai/draft-procedure` → ai-service | Título, enunciado, título/código/tipo del papel. La pantalla no manda `auditType`. Sin alcance, secciones, otros procedimientos ni normativa. |
| C | «Generar sugerencias» (Aprendizaje Cruzado) | `POST /working-papers/by-audit/:id/ai-suggestions` | Código/título/tipo del papel + hallazgos de auditorías anteriores + **20 secciones de TODOS los papeles del encargo** (no las del papel actual). Si la IA falla, devuelve 8 reglas genéricas fijas sin avisar. |
| D | Cuadrícula de procedimientos «Generar con IA» | `POST /audit-procedures/section/:id/ai-suggest` | Solo la etiqueta de la sección + riesgos de PT-A2/PT-STRAT (que solo existen en la Financiera Externa). Prompt fijo «Big 4 / NIA / saldos al 31/12» aunque el encargo sea fiscal, PLD o gubernamental. Crea los registros directo. |
| E | Asistente por sección (borrador de cada sección) | `POST /working-papers/:id/sections/:key/assist` | **Ya es bueno**: papel, sección, hint, otras secciones, encargo, normativa RAG por tipo. Es el modelo a seguir; no se toca su comportamiento. |

## 2. Diseño

**Un solo armador de contexto**, en el API, que los botones A–D reutilizan. El contexto sale de la base por `paperId` (nunca del
navegador) y, de paso, A y B ganan el chequeo de acceso por organización/modo investigación que hoy no tienen.

`apps/api/src/working-papers/paper-ai-context.ts` (funciones puras + un cargador):
- `loadPaperAiInput(prisma, paperId)` — papel (código, título, narrativa, período), encargo (tipo, subtipo, alcance, entidad), secciones
  (clave, etiqueta, valor), procedimientos ya aplicados (`content.procedures`), si el papel tiene plantilla (`PAPER_TEMPLATES`).
- `buildPaperBrief(input, presupuesto)` — **ficha compacta** con tope de caracteres:
  encargo en 1–2 líneas; papel; secciones llenas (clave, etiqueta y primeros ~160 caracteres, máx. 8); secciones vacías solo con la
  etiqueta (dicen de qué trata el papel y cuestan casi nada); procedimientos ya existentes solo con el título (para no repetirlos).
  Dos presupuestos: `ligero` (~1 400 caracteres, mejorar redacción) y `estandar` (~2 600, borrador y sugerencias).
- `assessPaperContext(input)` — suficiencia: el título debe ser informativo (no «Nuevo papel», no una sola palabra) y debe haber al
  menos una señal más (plantilla conocida, una sección llena, un procedimiento, narrativa o alcance del encargo). Si falla →
  **no se llama a la IA** (ahorra tokens) y se responde `insufficientContext` con lo que falta.
- Segunda capa: el prompt ordena a la IA responder `SIN_CONTEXTO: <qué falta>` si, con lo recibido, no puede proponer algo
  específico de ESTE papel; `parseInsufficient` lo detecta.
- Normativa (solo borrador B, sugerencias C y programa D, no la varita): la misma tabla tipo de encargo → base RAG del asistente por
  sección (`FISCAL→FISCAL_SV`, `AML→AML_SV`, …), **3 fragmentos de 350 caracteres como máximo**. Sin RAG para la varita.

**Cambios por botón**
- A y B: el front manda `paperId`; el API arma la ficha, valida acceso y la pasa al servicio de IA (`contextBrief`, `ragBlock`).
  El ai-service arma el prompt con funciones puras (`app/services/paper_prompts.py`) y entiende `SIN_CONTEXTO`.
- C: la ficha del papel actual **reemplaza** las 20 secciones de todo el encargo (se mantienen los hallazgos históricos, que son el
  «aprendizaje cruzado»). Con `paperId`, si la IA falla o no hay contexto suficiente ya **no** se rellena con reglas genéricas: se
  devuelve vacío con un aviso. Sin `paperId` (vista del encargo) queda el comportamiento anterior.
- D: el prompt deja de asumir financiera: marco y persona según el tipo de encargo, ficha del papel, normativa RAG, y riesgos de
  PT-A2/PT-STRAT solo si existen. Las aserciones NIA 315 aplican solo a estados financieros (en otro caso `[]`). Si no hay contexto
  suficiente responde error legible (el front ya muestra el mensaje) y no crea nada.
- Front: mensaje visible cuando la IA dice que no tiene contexto (A/B inline, C en el panel); D ya muestra el error.

**Fuera de alcance**: E (ya funciona), el Agente del papel (chat) y el panel COSO. Sin cambios de esquema ni SQL.

## 3. Pruebas que lo validan

- Ficha: dos papeles distintos del mismo encargo producen fichas distintas; el título, el tipo de encargo y el alcance aparecen;
  respeta el tope de caracteres aunque haya 200 secciones/procedimientos; no incluye secciones vacías con contenido, sí su etiqueta;
  matrices/cuadrículas se resumen («N filas»), no se vuelcan.
- Suficiencia: papel de plantilla conocida → suficiente; título genérico sin nada más → insuficiente con motivos; papel libre con
  título claro + alcance → suficiente.
- `SIN_CONTEXTO`: se detecta con y sin espacios/mayúsculas; texto normal no se confunde.
- Aislamiento: A/B/C/D rechazan un papel de otra organización o de un encargo en modo investigación ajeno.
- C: con `paperId`, fallo de IA ⇒ lista vacía + aviso (no las 8 reglas genéricas).
- ai-service: los prompts incluyen la ficha y la regla `SIN_CONTEXTO`; sin ficha (clientes antiguos) siguen funcionando igual.
- Mutaciones sobre las reglas de la ficha y de la suficiencia.

## 4. Orden y modelo sugerido por paso

| Paso | Qué | Modelo |
|---|---|---|
| 1 | `paper-ai-context.ts` + pruebas (este diseño) | Opus/Sonnet (reglas con casos borde; el diseño ya está escrito) |
| 2 | A y B: DTO con `paperId`, servicio, ai-service (`paper_prompts.py`) + pruebas | Sonnet |
| 3 | C y D: fichas, normativa, avisos, sin relleno genérico + pruebas | Sonnet |
| 4 | Front: mandar `paperId`, mostrar «sin contexto» | Sonnet |
| 5 | Barrido de mutaciones y revisión independiente | Opus |
| 6 | Guía de uso (cómo leer el aviso «sin contexto») | Haiku |

## 5. Biblioteca por papel — ahorrar tokens con contenido curado (idea del usuario, 2026-11-25)

**Idea:** cada papel tiene su biblioteca de procedimientos y de información útil (redacciones modelo, criterios, errores frecuentes),
llenada una sola vez con la investigación previa; la IA solo *amplía o adapta* lo que ya está, y solo cuando el auditor lo pide.

**Veredicto: es posible y es la mejor palanca de ahorro; se construye DESPUÉS de las fichas (§2), porque la IA sigue siendo la capa que
adapta el ítem al papel concreto.** No se partió de cero:

- Ya existe `ContentLibraryItem` (por organización, editable, con «Restaurar biblioteca» y pantalla de administración), pero solo con
  57 procedimientos sustantivos de la Financiera Externa (áreas C-01..C-12) y 17 preguntas COSO, y solo alimenta los botones
  «Cargar procedimientos sugeridos» (PT-FIN-C-SUST) y «Cargar preguntas» (PT-COSO). **Ningún botón de IA la consulta.**
- `PAPER_TEMPLATES` ya trae ~80 papeles con ~566 pistas (`aiHint`) escritas por sección: son la materia prima de qué trata cada papel.
- La base RAG (≈12 000 fragmentos de 5 marcos) es la fuente citable para fundamentar el contenido fiscal, PLD, IIA, NAIG y CVPCPA.

**Diseño propuesto**
- Clave de la biblioteca = `paperCode` (+ tipo de encargo cuando el papel se reutiliza). Reusa `ContentLibraryItem` (`groupKey = paperCode`);
  único cambio de esquema: valores nuevos en `ContentLibraryKind` (`PAPER_PROCEDURE`, `PAPER_WORDING`, `PAPER_NOTE`) → un `ALTER TYPE … ADD VALUE`
  que se aplica **antes** de desplegar (regla de esquema+SQL).
- Contenido: `PAPER_PROCEDURE` = título + enunciado + técnica + referencia normativa + desarrollo modelo con marcadores `[completar…]`;
  `PAPER_WORDING` = redacciones modelo (objetivo, conclusión); `PAPER_NOTE` = criterio / error frecuente / dato a tener a mano.
- Uso, de menor a mayor gasto: (1) «Generar sugerencias» muestra **primero** lo de la biblioteca del papel (0 tokens, marcado «Biblioteca»);
  (2) «Aplicar» copia el ítem tal cual, con su desarrollo modelo (0 tokens); (3) un botón «Adaptar con IA» envía **un solo ítem + la ficha**
  (~800 tokens) en vez de pedir 6–8 procedimientos desde cero (~3 000); (4) la IA que genera desde cero queda como último recurso
  cuando el papel no tiene biblioteca, y dice «sin contexto» si tampoco hay ficha suficiente.
- Llenado: un script que, por papel, toma las pistas de la plantilla + los fragmentos RAG del marco del encargo y genera un borrador de
  biblioteca **una sola vez**; luego se revisa (citas verbatim, nada inventado) y se siembra. Con `reviewedAt` para saber cuándo una
  norma cambió y hay que revisar.

**Lo que NO elimina:** «Mejorar redacción» siempre necesita IA (reescribe el texto del propio auditor). El ahorro está en sugerencias,
borradores y programas, que son las llamadas grandes.

**Riesgos y decisiones abiertas:** (a) calidad y vigencia del contenido jurídico → revisión humana y citas verificadas contra el RAG;
(b) volumen: ~80 papeles × ~6 ítems ≈ 500 ítems → empezar por los 10–15 papeles más usados de cada tipo de encargo;
(c) por organización (editable, como hoy) o catálogo global de solo lectura + ajustes por despacho — recomiendo el patrón actual.

| Paso | Qué | Modelo |
|---|---|---|
| L1 | Valores del enum + SQL + lectura de la biblioteca por papel + «Biblioteca primero» en C | Sonnet |
| L2 | Generador del borrador de biblioteca (plantilla + RAG) y revisión de calidad | Opus (diseño del generador y revisión del contenido) |
| L3 | «Adaptar con IA» sobre un ítem; pantalla de administración por papel | Sonnet |
| L4 | Sembrado de los papeles prioritarios y guía | Haiku |
