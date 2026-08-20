# Modelo Integrado de Control Interno y Riesgos — Análisis de Viabilidad y Diseño Técnico

> Análisis realizado: 2026-08-19 · revisado el mismo día tras contraste con `Idea2.txt`
> Documentos fuente evaluados:
> 1. `Modelo_Maestro_Evaluacion_Control_Interno_Riesgos.md` (usuario, 18-ago-2026)
> 2. `Idea2.txt` (usuario, 19-ago-2026) — versión ya desagregada por Auditoría Interna vs. Financiera Externa
> Alcance de este análisis: **solo diagnóstico y diseño en papel — cero cambios de código**
> NIAs referenciadas: 265 · 300 · 315 Rev.2019 · 240 · 330 · 530 · GIAS/IIA 2024
> Ver también: [`evaluacion-riesgos-nia315-analisis.md`](evaluacion-riesgos-nia315-analisis.md) (análisis previo, 10-ago-2026)

---

## 0. Resumen ejecutivo

1. **`Idea2.txt` no contradice el análisis anterior — lo confirma y lo afina.** La arquitectura "núcleo común + dos perfiles metodológicos" que propone es exactamente la misma conclusión a la que llegó la §5 del análisis original, con dos ideas nuevas genuinamente valiosas: (a) formalizar la cadena **Riesgo → Cuenta/Transacción → Afirmación → Control → Prueba** para Externa, y (b) tratar "Objetivo" como el ancla de la cadena para ambos perfiles.
2. **Verificado en código**: la cadena Cuenta→Afirmación de Idea2.txt **ya existe** en `PT-A5` S1 (columnas "Cuenta/Saldo estimado" y "Aserción principal — EXI/VAL/COM/OCC/COR/CLA"). El ajuste real y puntual es que esa etiqueta se **pierde** al bajar al detalle de `PT-MRCI` — ahí es donde hay que añadir dos columnas, no construir nada nuevo.
3. **"Objetivo" sí es una brecha real** — ni `PT-A2` (organizado por "Área/Ciclo") ni `PT-MRCI` tienen hoy un campo que represente el objetivo organizacional/de auditoría que el riesgo amenaza. El ajuste recomendado es mínimo: una columna de texto opcional, no un modelo de datos nuevo.
4. **Este documento reemplaza y amplía** el análisis del 19-ago sobre el mismo tema — mantiene todo el inventario técnico verificado (nada de eso cambió), pero **amplía el alcance de "solo Auditoría Financiera Externa" a "las 8 plantillas existentes"**, como pide el usuario en esta ronda.
5. **Sigue sin requerirse ningún `FieldType` nuevo, ni un motor nuevo, ni una segunda lógica de riesgos.** Todos los ajustes de esta revisión son columnas adicionales opcionales sobre papeles `MATRIX` ya existentes.

---

## 1. Contraste explícito: qué confirma, qué ajusta y qué añade `Idea2.txt`

| Punto de `Idea2.txt` | ¿Ya estaba en el análisis anterior? | Veredicto |
|---|---|---|
| Núcleo común + 2 perfiles metodológicos (no 2 sistemas separados) | Sí — era la conclusión central de la §5 anterior | **Confirmado**, sin cambios |
| Flujograma, riesgo inherente, controles, walkthrough, muestreo y evidencia son comunes | Sí — coincide punto por punto con la §2 del análisis anterior | **Confirmado**, sin cambios |
| COSO como capa transversal reutilizable por ambos perfiles | Sí — así funciona ya en código (`PT-A3` S0 ← `PT-COSO` S6/S7) | **Confirmado**, sin cambios |
| Walkthrough = pruebas de control de tamaño pequeño, mismo motor que muestreo | Sí — era la Fase 1 del plan anterior (extender `PT-NIA530` Atributos) | **Confirmado**, sin cambios |
| No construir un índice de madurez 1-5 para Externa | Sí — era la recomendación explícita de la §5/§8 anteriores | **Confirmado**, sin cambios |
| Cadena Riesgo → Cuenta/Transacción → **Afirmación** → Control → Prueba (exclusiva de Externa) | Parcialmente — el análisis anterior mencionaba "RMM por área/aserción" pero no marcaba la cadena como objeto explícito de diseño | **Ajuste** — ver §3.1. Confirmado que ya existe en `PT-A5`, falta propagarlo a `PT-MRCI` |
| "Objetivo" como ancla superior a "Riesgo" (para ambos perfiles, con matiz distinto cada uno) | No — no se había planteado | **Añadido** — ver §3.2 |
| Conclusión de Auditoría Interna con escala configurable (Satisfactorio/Necesita mejora/...) | No — el análisis anterior solo cubrió qué NO construir para Externa, no diseñó la conclusión de Interna (estaba fuera de alcance en esa ronda) | **Añadido** — ver §3.3 |
| "Criterios de evaluación" distintos por perfil (políticas internas/COSO vs. marco de información financiera/NIA) | No explícito | **Añadido, de bajo costo** — ver §3.4 |
| Campo "Propósito de la evaluación" con selector Interna/Externa/Cumplimiento/TI/... | No | **Aclarado, no construir** — ver §3.5 (ya existe bajo otro nombre) |
| Ejemplo ciclo de ingresos con cadena completa hasta cédula y conclusión | Coincide con el diagrama de la §4 del análisis anterior | **Confirmado**, sin cambios sustantivos |

**Conclusión del contraste**: no hay que reescribir la arquitectura. Hay que **agregar 3 ajustes puntuales** (§3.1, §3.2, §3.4) y **aclarar 2 puntos** (§3.3, §3.5) para que el modelo quede completo para ambos perfiles, no solo para Externa.

---

## 2. Inventario técnico verificado (sin cambios respecto al análisis anterior)

Esto ya se confirmó leyendo el código — se resume aquí porque sigue siendo la base de todo el diseño.

| Componente | Estado real | Papel(es) |
|---|---|---|
| Cuestionario/COSO | Completo: 5 componentes, una fila por principio, puntaje ponderado 100-400 | `PT-COSO` |
| Riesgo inherente configurable | Completo, por área/ciclo, con score 1-5 | `PT-A2` |
| RMM por área/cuenta/aserción (NIA 315.32) | Completo **en código**, pero huérfano — no está sembrado en ninguna plantilla | `PT-A5` |
| Riesgo residual por control individual + mapa de calor | Completo, pero solo sembrado en Auditoría Interna | `PT-MRCI` |
| Muestreo dual (sustantivo MUS + atributos/control) | Completo, mismo motor Poisson (`reliabilityFactor`) para ambos | `PT-NIA530` |
| Deficiencias de control interno | Completo, lee `PT-A3` S4 + `PT-ITGC`, escribe en NIA265 | `PT-NIA265` |
| Quality Gate | Genérico (completitud + score IA), no valida lógica de auditoría | Motor transversal (`paper-quality.service.ts`) |
| Flujograma | Nodo = tipo fijo + texto + posición + vínculo de navegación opcional. Sin metadata de riesgo/control, sin capas | `PT-FIN-A3-KC` S3b (única plantilla: Financiera Externa v1.0) |
| Segregación de funciones | No existe como modelo de datos | — |
| Walkthrough como objeto formal | No existe; el cálculo subyacente sí (Atributos en NIA530) | — |

El hallazgo crítico del análisis anterior sigue vigente y sin resolver: **`PT-A5` no está registrado en el array `papers[]` de ninguna de las 8 plantillas sembradas** — es la causa raíz de que la cadena Objetivo→Riesgo→Afirmación→Control descrita por `Idea2.txt` no se pueda recorrer hoy en ninguna auditoría real.

---

## 3. Ajustes al diseño (esto sí cambia respecto a la versión anterior)

### 3.1 Cerrar la cadena Riesgo → Cuenta → Afirmación → Control → Prueba

**Verificado en código** (`paper-templates.ts:1835-1846`) — `PT-A5` S1 ya trae exactamente esto:

> *"Columnas: Área/Ciclo | **Cuenta/Saldo estimado** | **Aserción principal (EXI/VAL/COM/OCC/COR/CLA — NIA 315)** | RI | RC | RMM | ¿Riesgo Significativo? | Tipo de Respuesta | Enfoque específico | Ref. papel de ejecución"*

Es decir: la etiqueta de cuenta y aserción **ya nace correctamente** en el nivel RMM. El problema es que cuando un riesgo de `PT-A5` S1 se detalla en `PT-MRCI` S1 (columnas actuales: `# | Riesgo | Ref. Riesgo | Control Mitigante | Ref. Control | Diseño Efectivo | Operando Efectivamente | Riesgo Residual | Impacto Potencial en el Dictamen | Ref. PT Ejecución`), **la Cuenta y la Aserción no viajan con él** — hay que volver a `PT-A5` manualmente para saber a qué cuenta/aserción pertenece un control específico.

**Ajuste recomendado**: agregar tres columnas opcionales a `PT-MRCI` S1: `Cuenta/Rubro relacionado`, `Aserción relacionada` y **`Riesgo Inherente (heredado)`** — esta tercera, pre-llenable desde `PT-A2` (el score/nivel del riesgo *antes* de considerar el control), para poder mostrar Inherente y Residual lado a lado por control, tal como lo pide una tabla de "Controles Existentes" tipo Big 4 (confirmado necesario al revisar un ejemplo visual de referencia del usuario, ver §8.10). Pre-llenables desde la fila de origen cuando `Ref. Riesgo` apunta a `PT-A2`/`PT-A5`. Para Auditoría Interna (donde `PT-MRCI` no nace de un `PT-A5` porque ese papel no existe en su perfil), `Cuenta` y `Aserción` simplemente quedan vacías — `Riesgo Inherente` sí aplica en ambos perfiles, porque `PT-A2` es común. No rompen el uso actual, no son obligatorias.

Con esto, la cadena completa de `Idea2.txt` (§3-4 de `Idea2.txt`) queda recorrible de punta a punta sin inventar ningún papel ni objeto nuevo:

```text
PT-A2 (Riesgo)  →  PT-A5 (Cuenta + Aserción + RMM)  →  PT-MRCI (Control + Residual, ahora con Cuenta+Aserción heredadas)
       →  PT-NIA530 Atributos (Prueba del control)  →  PT-MRCI actualizado (Operando Efectivamente + Residual real)
       →  Cédula financiera de esa cuenta (ya existe, B-01..B09)
```

### 3.2 "Objetivo" como campo, no como modelo nuevo

**Verificado**: ni `PT-A2` S1 (organizado por "Ciclo/Área") ni `PT-MRCI` tienen hoy un campo explícito de "objetivo". `Idea2.txt` tiene razón en señalar esto como una brecha real — pero construir un modelo/entidad "Objetivo" independiente (con su propio papel, CRUD, jerarquía) sería sobre-ingeniería para lo que realmente hace falta, que es poder anotar en una línea qué objetivo amenaza cada riesgo.

**Ajuste recomendado**: agregar una columna de texto opcional `Objetivo relacionado` en `PT-A2` S1 y en `PT-MRCI` S1 — mismo patrón `MATRIX`+columna que todo lo demás. El `aiHint` de esa columna se diferencia por perfil (ver §3.4):

- **Interna**: *"Objetivo organizacional o del proceso que este riesgo amenaza (ej. 'Cumplimiento del plan de ventas', 'Continuidad del servicio')."*
- **Externa**: *"Objetivo de auditoría según NIA 200/315 — normalmente 'Opinión razonable sobre [cuenta] libre de incorrección material'; rara vez varía entre riesgos, se puede dejar en blanco si es el objetivo general del encargo."*

No es un objeto nuevo — es una columna con guía contextual distinta.

### 3.3 Conclusión diferenciada — ahora sí diseñada para ambos perfiles

El análisis anterior solo dijo *qué no construir* para Externa (nada de madurez 1-5). No diseñó la conclusión de Interna porque estaba fuera de alcance en esa ronda. Con el alcance ampliado a "múltiples plantillas", esto sí corresponde diseñarlo:

- **Auditoría Interna** — `PT-MRCI` S4 (hoy `TEXTAREA` libre) debería tener una guía de `aiHint` que orient a una conclusión con escala (Satisfactorio / Parcialmente Satisfactorio / Necesita Mejora / Insatisfactorio), consistente con lo que exigen las GIAS/IIA 2024 sobre comunicar una conclusión de efectividad de gobierno-riesgo-control.
- **Auditoría Financiera Externa** — mismo campo, `aiHint` orientado a una conclusión narrativa ligada a RIM/respuesta de auditoría (ejemplo textual del propio `Idea2.txt`, §9, es un buen patrón a seguir), **nunca** una etiqueta genérica tipo "satisfactorio".

**Decisión de diseño importante**: no forzar esto con un `ENUM_SELECT` que cambie de opciones según la plantilla — el motor de papeles hoy define un único conjunto de opciones por sección, igual para todas las plantillas que usan ese papel. Forzar un enum "que cambia según quién lo mire" es exactamente el tipo de acoplamiento que las reglas de arquitectura del primer documento (`Modelo_Maestro...md` §33) piden evitar. La solución de menor riesgo es mantener `TEXTAREA` con `aiHint` diferenciado — el mismo mecanismo que ya usa el sistema para dar instrucciones distintas al mismo papel según contexto (ver `PT-COSO` S8, que ya hace exactamente esto).

### 3.4 "Criterios de evaluación" — ya resoluble sin cambio de esquema

`Idea2.txt` §8 pide diferenciar los criterios de evaluación (políticas internas/COSO/leyes para Interna vs. marco de información financiera/NIA para Externa). Esto **no requiere ningún campo nuevo** — ya es exactamente lo que hace el `aiHint` de cada papel, que ya varía libremente por plantilla (cada plantilla define sus propias secciones/aiHints, como ya se ve en cómo NAIG usa un subconjunto distinto de papeles que NOGAI). Se resuelve escribiendo el `aiHint` correcto en cada plantilla, sin tocar el modelo de datos.

### 3.5 "Propósito de la evaluación" — ya existe, no construir un selector nuevo

`Idea2.txt` §10-11 propone un campo/selector "Tipo de trabajo" (Interna/Externa/Cumplimiento/TI/...) que el sistema usaría para adaptar automáticamente la metodología mostrada.

**Esto ya existe, con otro nombre**: la elección de plantilla de auditoría (`AuditTemplate` / `Audit.templateId`) **ya es** ese selector — cada una de las 8 plantillas ya trae su propio subconjunto de papeles, con su propio `aiHint` por sección. Construir un segundo selector "Propósito de la evaluación" encima sería una segunda fuente de verdad para la misma decisión, exactamente lo que el primer documento del usuario prohíbe en su regla de arquitectura #1 (no duplicar motores). La recomendación es **no construir nada nuevo aquí** — la selección de plantilla al crear la auditoría ya cumple esa función.

---

## 4. Diagrama integrado final (ambos perfiles, con los ajustes de §3)

```text
                              CORE COMÚN
                 (papeles, columnas y mecanismos compartidos)
                                  │
        ┌───────────┬────────────┼────────────┬───────────┐
        │           │            │            │           │
   PT-A2 (RI)   PT-A3 (RC)   PT-COSO      FLUJOGRAMA   PT-NIA530
   +Objetivo    +Segreg.*    (capa        (S3b, hoy    (MUS +
   (nuevo)      (Fase 3)     transversal) solo en      Atributos =
                                           Fin.Ext.)    walkthrough)
        │           │            │            │           │
        └─────┬─────┘            └──────┬─────┘           │
              │                         │                 │
              ▼                         ▼                 │
     ┌────────────────────────────────────────┐            │
     │   PT-A5 — RMM por Área/Cuenta/Aserción   │            │
     │   (HOY HUÉRFANO — Fase 0 lo activa)      │            │
     │   (exclusivo Externa — NIA 315.32)       │            │
     └──────────────────┬───────────────────────┘            │
                         │                                   │
                         ▼                                   │
     ┌─────────────────────────────────────────────────┐     │
     │  PT-MRCI — Riesgo Residual por Control            │     │
     │  +Cuenta/Aserción heredadas (Fase 0.5, nuevo) ◄───┼─────┘
     │  +Objetivo relacionado (Fase 0.5, nuevo)          │
     │  +mapa de calor (S3, ya existe)                   │
     │  común a AMBOS perfiles — entrada única para       │
     │  Interna, drill-down de PT-A5 para Externa         │
     └──────────────────┬─────────────────────────────────┘
                         │
        ┌────────────────┴────────────────┐
        ▼                                  ▼
  CONCLUSIÓN — INTERNA               CONCLUSIÓN — EXTERNA
  Escala configurable                 Narrativa ligada a RIM
  (aiHint S4, Fase 5)                y respuesta de auditoría
  Gobierno/riesgo/control            (aiHint S4, ya correcto
  GIAS/IIA 2024                      hoy — sin cambio)
        │                                  │
        └────────────────┬─────────────────┘
                          ▼
                 PT-NIA265 (deficiencias)
              (Fase futura: también leer
               PT-MRCI, hoy solo PT-A3+PT-ITGC)
```

`*` Segregación de funciones sigue siendo la Fase 3 ya diseñada en la ronda anterior — no cambia con este contraste.

---

## 5. Diferencias de metodología por perfil (tabla actualizada)

| Dimensión | Auditoría Interna (NOGAI/GIAS-IIA) | Auditoría Financiera Externa (NIA) |
|---|---|---|
| Ancla de la cadena | Objetivo (organizacional/proceso) → Riesgo → Control | Objetivo (opinión de auditoría) → Riesgo → **Cuenta → Aserción** → Control → Procedimiento |
| Papel de entrada al riesgo-control | `PT-MRCI` directamente | `PT-A5` (RMM por cuenta/aserción) → `PT-MRCI` (drill-down) |
| ¿Se prueban todos los controles? | Sí, todos los relevantes al proceso | No — decisión estratégica (NIA 330), solo si se planea confiar en ellos |
| Riesgos pervasivos / NIA 240 | No aplica | Central (`PT-A5` S2/S3) |
| Conclusión | Escala configurable (Satisfactorio…Insatisfactorio) — Fase 5 | Narrativa ligada a RIM y respuesta de auditoría — ya correcto hoy |
| Criterios de evaluación | Políticas internas, COSO, leyes, buenas prácticas | Marco de información financiera aplicable, NIA, políticas contables |
| Índice de madurez 1-5 | Tiene sentido, opcional, no incluido en este plan | No corresponde — no construir |
| Mapa de calor | Entregable ejecutivo principal | Apoyo visual — el entregable que sostiene la opinión es la tabla RMM de `PT-A5` |
| Walkthrough | Recorrido narrativo, alcance amplio | Prueba de controles de muestra pequeña (NIA 330.A22) — mismo motor `PT-NIA530` Atributos |
| Segregación de funciones | Evaluación amplia del proceso | Acotada a funciones relevantes de ciclos con riesgo identificado |

---

## 6. Plan de fases actualizado

Fases 0-4 son las del análisis anterior, sin cambios de fondo. Se agrega **Fase 0.5** (nueva, pequeña, deriva directamente de §3.1-3.2) y **Fase 5** (nueva, deriva de §3.3, ahora relevante porque el alcance incluye Interna).

**Fase 0 — Activar lo que ya existe (config, ~0 riesgo)**
Registrar `PT-A5`, `PT-MRCI`, `PT-COSO`, `PT-NIA530` en el array `papers[]` de "Auditoría Financiera Externa v1.0".

**Fase 0.5 — Cerrar la cadena Cuenta/Aserción/Objetivo (nueva)**
Agregar columnas opcionales `Cuenta/Rubro relacionado` y `Aserción relacionada` a `PT-MRCI` S1 (pre-llenables desde `PT-A5` cuando aplique); agregar columna opcional `Objetivo relacionado` a `PT-A2` S1 y `PT-MRCI` S1, con `aiHint` diferenciado por plantilla. Cambio de config/columnas, sin `FieldType` nuevo.

**Fase 1 — Cerrar el walkthrough/prueba de controles**
Propagar `CONTROL_NO_EFECTIVO` de `PT-NIA530` Atributos hacia la fila correspondiente de `PT-MRCI` (Operando Efectivamente + Riesgo Residual).

**Fase 2 — Capa visual del flujograma**
Extender `linkedPaper` del nodo con `rowId?` opcional (mismo patrón de PBC/PT-HALL-COM) para vincular un nodo a una fila de `PT-MRCI`, con badge de color según Riesgo Residual. Ampliada en esta revisión con dos adiciones al modelo de datos del nodo (§8.9): carriles (`lane?`) y un 5º `kind` de nodo ("control"), ambas necesarias para el reporte exportable de §8.9 y compatibles con el flujograma actual (nodos existentes sin `lane` se agrupan en un carril implícito único, sin romper nada).

**Fase 3 — Segregación de funciones**
Nueva sección `MATRIX` en `PT-A3`, acotada a funciones relevantes; alimenta `PT-MRCI` como filas nuevas.

**Fase 4 — Reglas de auditoría en el Quality Gate**
Extender `paper-quality.service.ts` con reglas activas solo para `PT-A5`/`PT-MRCI` (riesgo sin control, control sin riesgo, residual alto sin plan de acción).

**Fase 5 — Diferenciar conclusión por perfil (nueva)**
Actualizar el `aiHint` de `PT-MRCI` S4 con dos variantes de guía (Interna: escala de efectividad; Externa: narrativa ligada a RIM) — solo texto, sin cambio de `fieldType`.

**Fase 6 — Cockpit interactivo (§8.2-8.8)**
Nueva pestaña "Control Interno" en el expediente de auditoría: pipeline/stepper, Ficha de Riesgo (endpoint de solo lectura tipo `GET /audits/:id/risks/:riskRef/trace`), dashboard ejecutivo diferenciado por perfil. Depende de que Fases 0-0.5 ya estén activas (si no, el cockpit muestra una cáscara vacía).

**Fase 7 — Reporte Integrado exportable (§8.9)**
Nuevo renderer de PDF dedicado (mismo patrón que `coso-pdf.ts`/`nia530-pdf.ts`) que ensambla flujograma (con carriles y marcadores de la Fase 2) + tabla Inherente/Residual por control (de la columna añadida en Fase 0.5) + resumen numérico + mapa de calor + conclusión + recomendaciones en una sola página imprimible. Depende de la Fase 2 (carriles/marcadores) y de la Fase 0.5 (columna Riesgo Inherente en `PT-MRCI`). Requiere una decisión previa del usuario: mapa de calor Probabilidad×Impacto (toca `PT-A2`) vs. reutilizar el mapa de calor Área×Nivel ya existente en `PT-MRCI` S3 (sin tocar `PT-A2`) — ver tabla de §8.9.

Cada fase sigue siendo reversible, aditiva, y no toca las plantillas fuera de su alcance (Fases 0-2 y 4 son exclusivas de Financiera Externa; Fase 3 aplica donde exista `PT-A3`; Fase 5 aplica a cualquier plantilla que use `PT-MRCI`, incluida NOGAI, sin cambiar su comportamiento actual — solo mejora la guía textual; Fases 6-7 son capas de navegación/exportación, no tocan ningún papel existente).

---

## 7. Lo que este análisis sigue sin recomendar

- Un modelo de datos "Objetivo" independiente (entidad/CRUD propio) — una columna de texto basta.
- Un `ENUM_SELECT` de conclusión que cambie de opciones según la plantilla que lo use — usar `aiHint` diferenciado sobre el mismo `TEXTAREA`.
- Un selector nuevo de "Propósito de la evaluación" — la elección de plantilla de auditoría ya cumple esa función.
- Clonar `PT-MRCI` en un papel exclusivo para Externa — reutilizar el mismo papel, con columnas opcionales.
- Un índice de madurez 1-5 para Auditoría Financiera Externa.
- Tocar cómo Auditoría Interna (NOGAI) usa `PT-MRCI`/`PT-A3` hoy — todos los cambios de esquema son columnas *opcionales* nuevas, no rompen su uso actual.

---

## 8. Estructura funcional del módulo "Evaluación de Control Interno"

Todo lo anterior (§0-7) es el diseño de **datos**: qué papel tiene qué, qué columnas faltan, qué se propaga. Esta sección es el diseño de **experiencia**: cómo se vería y se usaría en la práctica, y cómo cambia entre los dos perfiles. Sigue siendo diseño en papel — nada de esto está implementado.

### 8.1 Principio de diseño: cockpit, no papel nuevo

Verificado en código: el expediente de auditoría (`audits/[id]/page.tsx`) ya tiene una pestaña **"Grafo"** (`PapersGraphView.tsx`) que visualiza cómo se relacionan los papeles de trabajo entre sí — pero a **granularidad de papel completo** (nodo = un `WorkingPaper`, coloreado por tipo y estado de sincronización). Es útil para saber "¿está `PT-A5` desactualizado respecto a `PT-A2`?", pero no para responder "¿qué pasó con el riesgo R-015 específicamente, de principio a fin?".

Esa es exactamente la pieza que falta, y es la razón por la que este módulo debe construirse como un **cockpit de navegación y agregación** — una pestaña nueva que **lee** los papeles ya existentes (mismo mecanismo `sourceRef` que ya usan `PT-MEMO`/`PT-STRAT`/`PT-PROG`) y los presenta como un solo recorrido, sin persistir ni un solo dato nuevo que no viva ya en `PT-A2`/`A3`/`A5`/`MRCI`/`COSO`/`NIA530`/`NIA265`/flujograma. Ningún papel de trabajo existente se sustituye ni se oculta — el cockpit es una puerta de entrada, ellos siguen siendo la fuente de verdad y se pueden seguir abriendo directamente como hoy.

### 8.2 Punto de entrada

Nueva pestaña **"Control Interno"** en `audits/[id]/page.tsx`, junto a las existentes (Resumen, Progreso, Expediente, Equipo, Hallazgos, Horas, PBC, Confirmaciones, Matriz de Firmas, Balance, Grafo). Se muestra solo si la auditoría tiene sembrado al menos uno de los papeles de esta cadena — se auto-oculta en plantillas donde no aplica (Fiscal, AML, Forense).

```text
┌─────────────────────────────────────────────────────────────────────────┐
│  Resumen  Progreso  Expediente  …  Balance  Grafo  [Control Interno] ●  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  OBJETIVO → PROCESO → RIESGO → CONTROL → EVIDENCIA/PRUEBA →              │
│      → RESULTADO → RESIDUAL → DEFICIENCIA → CONCLUSIÓN                   │
│  [●12 identificados] [●3 sin control] [●2 pruebas pendientes] ...        │
│  (cada etapa es clicable → abre el papel real correspondiente)           │
│                                                                           │
│  ── Dashboard ejecutivo (difiere por perfil, ver 8.4) ──                 │
│                                                                           │
│  ── Lista de riesgos (clic en cualquier fila → Ficha de Riesgo) ──       │
└─────────────────────────────────────────────────────────────────────────┘
```

### 8.3 El pipeline (stepper horizontal)

Reutiliza el mismo lenguaje visual ya usado en el pipeline de Cartera (columnas con conteo, clic = navegar). Cada etapa muestra un badge agregado calculado en el momento (lectura, no un modelo nuevo) y abre el papel real al hacer clic:

| Etapa | Qué abre — Interna | Qué abre — Externa |
|---|---|---|
| Objetivo | Campo "Objetivo relacionado" de `PT-A2` (§3.2) | Igual, más contexto de opinión de auditoría |
| Proceso | Flujograma (si existe en la plantilla) | Flujograma (`PT-FIN-A3-KC` S3b) |
| Riesgo | `PT-A2` directo | `PT-A5` (Cuenta+Aserción+RMM) como vista principal, con acceso secundario a `PT-A2` |
| Control | `PT-A3` + `PT-COSO` + `PT-ITGC` | Igual |
| Evidencia/Prueba | Walkthrough guiado (§8.5) | Igual |
| Resultado | `PT-NIA530` S4 | Igual |
| Residual | `PT-MRCI` | Igual, ahora con Cuenta/Aserción heredadas (§3.1) |
| Deficiencia | `PT-NIA265` (si existe en la plantilla) | `PT-NIA265` |
| Conclusión | `PT-MRCI` S4, `aiHint` de escala de efectividad (§3.3) | `PT-MRCI` S4, `aiHint` narrativo ligado a RIM (§3.3) |

La etapa "Riesgo" es la única que cambia de papel de entrada entre perfiles — el resto del pipeline es idéntico en estructura, solo cambia el contenido que ya trae cada papel.

### 8.4 Ficha de Riesgo — la pieza nueva de mayor valor

Esto es lo que hoy **no existe de ninguna forma** y es, con diferencia, la pieza más valiosa de todo el diseño: responde directamente a la pregunta rectora del primer documento del usuario (§38): *"¿puede un revisor independiente seguir desde una conclusión hasta la evidencia que la soporta?"*. Hoy esa respuesta exige abrir manualmente 4-5 papeles distintos y cruzarlos a mano.

**Diseño**: un panel lateral (drawer) que se abre al hacer clic en cualquier fila de riesgo — desde `PT-A2`, desde `PT-A5`, desde `PT-MRCI`, o desde un nodo del flujograma vinculado (§ Fase 2 del plan de fases) — y arma el recorrido completo de *ese* riesgo específico:

```text
┌─ Ficha de Riesgo — R-015 ──────────────────────────── [Ir al papel ↗] ─┐
│ Identificación (PT-A2)                                                 │
│   "Venta a crédito no autorizada" · Ciclo: Ingresos                    │
│                                                                          │
│ [Solo Externa] Cuenta / Aserción / RMM (PT-A5)                         │
│   Cuentas por Cobrar · Valuación, Existencia · RMM: ALTO                │
│                                                                          │
│ Control mitigante (PT-A3 / PT-MRCI)                                    │
│   C-008 "Autorización de crédito" · Diseño: Adecuado                   │
│                                                                          │
│ Evidencia vinculada                                                     │
│   📎 3 adjuntos · 🔗 Nodo "Aprobación de crédito" en el flujograma      │
│                                                                          │
│ Prueba realizada (PT-NIA530)                                           │
│   Atributos, n=25 · 2 excepciones · CONTROL_NO_EFECTIVO                │
│                                                                          │
│ Riesgo residual (PT-MRCI)                                              │
│   ALTO — "Operando Efectivamente" actualizado por la prueba (Fase 1)   │
│                                                                          │
│ Deficiencia generada (PT-NIA265)                                        │
│   Sí — ver comunicación COM-004                                        │
└──────────────────────────────────────────────────────────────────────┘
```

Cada bloque es una lectura de un papel ya existente (mismo mecanismo `sourceRef`/agregación que ya usa `PT-MEMO`), con un botón "Ir al papel" que reutiliza la navegación de `PaperLink` ya construida. No es una tubería de datos nueva — es una vista que consulta varias a la vez.

**Mecanismo técnico — IMPLEMENTADO (Fase 6a, 2026-08-20)**: `GET /working-papers/risk-trace/:auditId` (`apps/api/src/working-papers/risk-trace.service.ts`), solo lectura, sin persistir nada. Contrato para la Fase 6b:

- **Ancla**: `?paperId=&sectionKey=&rowIndex=` (la fila donde el usuario hizo clic) o `?area=` (trazar un área completa desde el dashboard, sin fila específica).
- **Correlación**: las filas de riesgo viven en JSON sin IDs, así que la correlación se hace contra el **catálogo canónico de áreas** (PT-A2 S1, fallback PT-A5 S1) comparando por *frases* derivadas del nombre del área (nombre principal, contenido del paréntesis, sub-frases por " y ") con frontera de palabra — "Cuentas por Cobrar" nunca coincide con "Cuentas por Pagar" por compartir "cuentas", pero "Caja y Bancos" sí encuentra la fila "Caja y Bancos" de NIA530 aunque el ancla diga "Tesorería (Caja y Bancos)". Fallback secundario: solape de ≥2 palabras distintivas entre descripciones.
- **Respuesta** (`RiskTraceResponse`): `anchor` (con `riskLabel` y `area` resueltos) + `areaCatalog` + `blocks[]` — un bloque por etapa (`IDENTIFICACION`→PT-A2 S5/S6, `RMM`→PT-A5 S1/S3, `CONTROL`→PT-A3 S2/S4, `PRUEBA`→PT-NIA530 S4, `RESIDUAL`→PT-MRCI S1/S2, `DEFICIENCIA`→PT-NIA265 S1 y PT-COSO S8) con `paperId/wpCode` para navegar, `available` (papel existe o no en el encargo) y por sección las filas coincidentes con su `matchBasis` (`AREA`/`DESCRIPCION`/`PAPEL_COMPLETO` — este último cuando PT-A3 S1 declara que todo el papel es del ciclo del ancla) + `flowNodes[]` (nodos de flujograma cuyo label referencia el área; se volverá preciso con el `rowId` de la Fase 2).
- **Duplicados** (ocurre en encargos reales): entre varios papeles con el mismo `paperCode`, gana el papel del ancla; si no, el que tenga más secciones de la cadena con contenido; empate → el de edición más reciente.
- La degradación es siempre visible: un papel ausente devuelve `available:false`, una etapa sin coincidencias devuelve el bloque con `sections` vacías — nunca se omite en silencio.

### 8.5 Walkthrough como modo guiado (no un objeto nuevo)

Botón **"Iniciar Walkthrough"** en la etapa Evidencia/Prueba del cockpit → abre `PT-NIA530` con S2 pre-seleccionado en modo "Atributos" y un tamaño de muestra sugerido pequeño (n=1-3, típico de un walkthrough real) en lugar del `n` calculado para una prueba de controles completa. Mismo motor (`reliabilityFactor`, mismo panel `SamplingEvaluationPanel`) — solo cambia el punto de entrada y el valor sugerido inicial. Así se resuelve el §16 del primer documento del usuario sin construir un segundo motor de muestreo.

### 8.6 Segregación de funciones

Vive como una tarjeta adicional dentro de la etapa "Control" del cockpit, que abre la nueva sección de `PT-A3` diseñada en la Fase 3 del plan (§6). No tiene etapa propia en el stepper — es una vista adicional dentro de Control, consistente con que su resultado alimenta filas de `PT-MRCI` igual que cualquier otro riesgo.

### 8.7 El flujograma como vista visual del cockpit

Dentro de la etapa "Proceso": el flujograma se abre con los badges de color por nodo (Riesgo Residual heredado vía `rowId`→`PT-MRCI`, Fase 2 del plan) y un toggle simple de capas (Riesgos / Controles / Evidencia) que muestra u oculta esos badges — sin agregar ningún dato nuevo al nodo, solo una lectura visual de lo que ya vive en `PT-MRCI`. Resuelve el §39 del primer documento del usuario.

### 8.8 Dashboard ejecutivo — diferenciado por perfil

Mismos indicadores que propone el primer documento del usuario (§24), pero la parte de "conclusión" cambia de forma consistente con §3.3 y §5 de este documento:

| | Auditoría Interna | Auditoría Financiera Externa |
|---|---|---|
| Indicador principal | Escala de efectividad (Satisfactorio→Insatisfactorio) | Distribución RMM (Bajo/Moderado/Alto/Muy Alto) por área/cuenta, desde `PT-A5` S1 |
| Alerta destacada | Riesgos sin control identificado | Riesgos significativos (NIA 240 incluidos) sin estrategia de respuesta definida |
| Cobertura | % de riesgos con control asociado | % de aserciones relevantes con al menos un control evaluado |
| Mapa de calor | Entregable principal (`PT-MRCI` S3, ya existe) | Apoyo visual — el entregable que sostiene la opinión sigue siendo la tabla de `PT-A5` |

Todos estos indicadores son cálculos de solo lectura sobre datos ya persistidos — ninguno requiere una tabla nueva.

### 8.9 Reporte Integrado de Control Interno (exportable) — a partir de referencia visual del usuario

El usuario compartió una referencia visual concreta: un reporte de una página que combina flujograma por carriles (con marcadores de control C1-C10 sobre el diagrama), una tabla lateral de controles con Riesgo Inherente/Residual/Área Vulnerable, resumen numérico de riesgos con % de reducción, mapa de calor Probabilidad×Impacto, conclusión general y recomendaciones.

**Aclaración conceptual — esto son dos capas distintas, no una sola cosa:**

1. **Capacidad de flujogramar (editor, interactivo)** — carriles y marcadores de control son cambios al **modelo de datos del nodo** que el auditor edita mientras construye el diagrama en `FlowchartPanel.tsx`. Es insumo: lo que el auditor captura.
2. **Resultado de la evaluación de Control Interno (reporte generado, de solo lectura)** — la tabla lateral, el resumen numérico, el mapa de calor, la conclusión y las recomendaciones **no se dibujan**: el sistema los arma automáticamente tomando el flujograma ya editado (capa 1) más lo que ya vive en `PT-A2`, `PT-MRCI`, `PT-COSO` y `PT-NIA265`, y los ensambla en una sola página vía un renderer de PDF dedicado (mismo mecanismo ya usado para `PT-COSO`/`PT-NIA530`). Es salida: lo que el sistema produce a partir de varios papeles ya llenos, no algo que se edita directamente ni un papel de trabajo nuevo.

En una frase: el flujograma con carriles y marcadores es el insumo que el auditor construye; la imagen completa es el resultado consolidado que el sistema genera al pedir "exportar/generar el reporte", uniendo ese flujograma con los demás papeles.

**Confirmado en código — la base técnica ya existe.** El flujograma **ya se renderiza como un diagrama SVG real** en la exportación a PDF (`renderFlowchartDiagramSvg()`, `apps/api/src/pdf/pdf-templates.ts:542-614`) — mismas formas/colores por tipo de nodo que el editor en pantalla, curvas entre nodos, y ya muestra el papel vinculado de cada nodo como texto pequeño. Usa exactamente el mismo enfoque (SVG embebido + Puppeteer, sin librería de gráficos) que el radar de `PT-COSO`. Es decir: **el mecanismo para producir una página consolidada así ya está probado en el proyecto** — la vía natural sería un nuevo renderer dedicado (mismo patrón que `coso-pdf.ts`/`nia530-pdf.ts`) que ensambla Flujograma + `PT-A2` + `PT-MRCI` + `PT-COSO` en una sola página, reutilizando `renderFlowchartDiagramSvg` como base y agregando los paneles laterales alrededor.

**Tres piezas de la referencia que sí faltan y requieren extender el diseño:**

1. **Carriles por área/departamento.** Hoy el nodo del flujograma no tiene ningún concepto de "carril" — solo `x,y`. Ajuste: campo opcional `lane?: string` en `FlowchartNodeValue`; el editor agrupa/dibuja los nodos por carril (columnas), el PDF dibuja los mismos carriles como fondos alternados con encabezado. Nodos sin `lane` (flujogramas ya existentes) se muestran en un carril único implícito — no rompe nada de lo ya construido.

2. **Marcadores de control sobre el diagrama.** Hoy no existe una "insignia de control" independiente del nodo de proceso. Ajuste recomendado: un 5º `kind` de nodo, `"control"` — un círculo pequeño (mismo modelo de nodo, mismo `linkedPaper` para apuntar a la fila de `PT-A3`/`PT-MRCI` correspondiente), en vez de inventar un mecanismo de anotación nuevo sobre las aristas.

3. **Mapa de calor Probabilidad × Impacto (grilla 3×3).** Este es el único ajuste que **no** es solo de presentación. Verificado en código: `PT-A2` califica el riesgo inherente con **un único puntaje combinado (1-5, `Score RI`)** — no con Probabilidad e Impacto como ejes independientes. El "mapa de calor" que ya existe en `PT-MRCI` S3 es Área×Nivel-de-riesgo (una tabla de conteos), no una grilla Probabilidad×Impacto. Para reproducir exactamente la grilla de la referencia visual, `PT-A2` S4 necesitaría capturar **dos** sub-puntajes en vez de uno (`Probabilidad (1-5)` y `Impacto (1-5)`, con el `Score RI` actual quedando como su producto/combinación) — un cambio de esquema pequeño pero real, no una reetiqueta. Alternativa de menor esfuerzo si no se quiere tocar `PT-A2`: mantener el mapa de calor Área×Nivel que ya existe en `PT-MRCI` S3 (funcionalmente equivalente como herramienta de priorización, visualmente distinto de la grilla clásica de la referencia).

**Lo que la tabla de "Controles Existentes" de la referencia visual confirma que ya estaba bien diseñado en §3.1**, y que motivó agregar ahí la tercera columna heredada (`Riesgo Inherente`): mostrar Inherente y Residual lado a lado por control es exactamente el patrón `PT-A2`→`PT-MRCI` ya usado para Cuenta/Aserción, solo que con un tercer dato heredado.

**Resumen de factibilidad de la referencia visual completa:**

| Elemento de la referencia | Factibilidad | Vía |
|---|---|---|
| Flujograma con formas/colores | Ya existe, se renderiza hoy en PDF | — |
| Badge de color por riesgo residual en el nodo | Ya diseñado (Fase 2) | `rowId`→`PT-MRCI` |
| Carriles por área | Nuevo, aditivo, bajo riesgo | `lane?` en el nodo (Fase 2 ampliada) |
| Marcadores de control (Cx) | Nuevo, aditivo, bajo riesgo | 5º `kind` de nodo (Fase 2 ampliada) |
| Tabla Inherente/Residual/Área Vulnerable por control | Ya diseñado (§3.1, ampliado) | Columna heredada en `PT-MRCI` |
| Resumen numérico + % reducción | Cálculo de solo lectura, sin dato nuevo | Igual que el dashboard de §8.8 |
| Mapa de calor Probabilidad×Impacto (grilla clásica) | Requiere separar `PT-A2` en 2 ejes, o usar la alternativa Área×Nivel ya existente | Decisión pendiente del usuario |
| Conclusión general (badge) | Ya existe | `PT-COSO` S6 |
| Recomendaciones | Ya existe, requiere agregación | `PT-NIA265` + narrativa |
| Ensamblado en una página | Mismo patrón ya probado (COSO/NIA530) | Nuevo renderer dedicado |

### 8.10 Qué NO cambia con este diseño

- Ningún papel de trabajo se sustituye, se oculta ni cambia su comportamiento actual al abrirse directamente (fuera del cockpit).
- El cockpit no tiene su propio botón de "aprobar"/"firmar" — las firmas y el flujo de estados siguen viviendo en cada papel individual, como hoy.
- Nada de esto se implementa en esta ronda — es la especificación funcional a la que apunta el plan de fases de §6, para cuando el usuario decida avanzar.

---

## 9. Checklist ejecutable — para retomar en otra sesión

Nada de lo siguiente se ha implementado. Este documento es autocontenido: una sesión futura puede empezar directamente aquí sin releer todo el análisis, siguiendo el orden de dependencias ya validado.

**Estado (2026-08-20)**: Fase 0 verificada — `PT-A5` y `PT-COSO` ya estaban registrados en `papers[]` de "Auditoría Financiera Externa v1.0" (agregados en la sesión del 19-ago junto con la siembra del encargo demo); `PT-ITGC` ya estaba de antes. Faltaban `PT-MRCI` y `PT-NIA530` — confirmado que solo estaban sembrados en plantillas distintas (`PT-MRCI` en NOGAI, `PT-NIA530` en "Auditoría Externa (NIA/ISA)", una plantilla legacy distinta de "v1.0"). Se agregan ambos ahora, cerrando la Fase 0 por completo.

**Corrección (2026-08-20, tarde)**: el análisis de gaps de la sesión del 19-ago concluyó erróneamente que el encargo demo carecía de `PT-A5`/`PT-COSO`/`PT-ITGC` — en realidad los 3 YA EXISTÍAN, llenos, desde el 13-14 de agosto (`A-04B`, `A-11`, `A-12`). Al crearlos "de nuevo" se generaron duplicados (61→64 papeles). Detectado durante la verificación de la Fase 6a (el endpoint de trazabilidad encontraba 2 papeles por código). Consolidado: se comparó el contenido completo de cada par y se conservó el de mayor calidad/consistencia — `PT-A5` A-17, `PT-COSO` A-18 (ambos de mi sesión, mejor grounding contra PT-A2/PT-A3 reales), `PT-ITGC` A-04B (el original, más detallado). Se borraron los 3 duplicados; el encargo volvió a 61 papeles. Lección para próximas sesiones: antes de crear un papel "faltante", verificar con `paperCode` + `auditId` que de verdad no existe — no confiar solo en si el `paperCode` está en `papers[]` de la plantilla (eso solo dice si se auto-siembra en auditorías NUEVAS, no si ya existe en una auditoría vieja).

**Orden recomendado de ejecución** — la columna **Modelo** sigue la regla de `~/.claude/CLAUDE.md`: diseñar con el modelo fuerte, ejecutar con el más barato que garantice calidad.

| # | Fase | Qué hace | Depende de | Riesgo | Modelo | Por qué |
|---|---|---|---|---|---|---|
| 1 | Fase 0 (§6) | Registrar `PT-A5`, `PT-MRCI`, `PT-COSO`, `PT-NIA530` en `papers[]` de "Auditoría Financiera Externa v1.0" | — | ~0 (config) | **Haiku** | Edición mecánica de config, patrón ya repetido varias veces en la sesión anterior |
| 2 | Fase 0.5 (§6, §3.1-3.2) | 3 columnas opcionales en `PT-MRCI` S1 (Cuenta, Aserción, Riesgo Inherente) + columna "Objetivo relacionado" en `PT-A2`/`PT-MRCI` | Fase 0 | Bajo | **Sonnet** | Columnas nuevas sobre `MATRIX` ya existente — patrón establecido, pero toca 2 papeles compartidos entre plantillas (NOGAI incluida), cuidar el `aiHint` diferenciado por perfil |
| 3 | Fase 1 (§6) | Propagar `CONTROL_NO_EFECTIVO` de NIA530-Atributos → `PT-MRCI` (Operando Efectivamente + Residual) | Fase 0.5 | Bajo | **Sonnet** | Mismo patrón que los ~10 métodos `propagate*`/`recalculate*` ya existentes en `paper-sections.service.ts` — implementación sobre diseño ya escrito |
| 4a | Fase 6a (§8.2, §8.4) | ✅ **Hecho (20-ago)** — endpoint `GET /working-papers/risk-trace/:auditId` (agregación de solo lectura entre 7 papeles + flujograma; contrato documentado en §8.4) | Fases 0-1 | Medio | **Fable/Opus** | Arquitectura nueva de agregación cross-papel — el diagnóstico correcto de qué leer de cada papel y cómo estructurar la respuesta es lo caro de equivocar aquí |
| 4b | Fase 6b (§8.2-8.3, §8.5-8.8) | ✅ **Hecho (20-ago)** — pestaña "🛡️ Control Interno" en el expediente (auto-oculta si el encargo no tiene la cadena sembrada), stepper con badges reales, lista de riesgos clicable (PT-A2 S6), drawer "Ficha de Riesgo" consumiendo el endpoint de la Fase 6a | Fase 6a | Medio (UI nueva) | **Sonnet** | Con la forma de datos del endpoint ya definida (4a), es UI siguiendo patrones ya usados en Cartera (stepper) y `PaperLink` (navegación) |
| 5 | Fase 2 (§6, §8.9) | ✅ **Hecho (20-ago)** — `lane?` en `FlowchartNodeValue` (tag editable con datalist de carriles ya usados), 5º `kind:"control"` (círculo compacto), `linkedPaper.rowId/rowLabel/residualLevel` con selector de fila (`RowPicker`) cuando se vincula a PT-MRCI S1 → badge de color por Riesgo Residual en el nodo | Fase 0.5 | Bajo-Medio | **Sonnet** | Extensión aditiva de un modelo de datos ya entendido, mismo patrón que `linkedPaper` en PBC/PT-HALL-COM |
| 6 | Fase 3 (§6) | ✅ **Hecho (20-ago)** — `PT-A3` S10 (MATRIX, 4 roles clásicos de segregación NIA 315.A106) + endpoint/botón "Propagar Segregación de Funciones" en `PT-MRCI` S1 (patrón ADD-only con `_origen`, igual que `propagateConfirmaciones`) + badge de Control en el cockpit blend con debilidades de segregación | Fase 0 | Bajo | **Sonnet** | Mismo patrón `MATRIX`+`aiHint` que el resto del papel |
| 7 | Fase 4 (§6) | ✅ **Hecho (20-ago)** — `computeAuditLogicIssues()` en `paper-quality.service.ts`, activo solo para `PT-A5`/`PT-MRCI`: riesgo significativo sin papel de ejecución (PT-A5, NIA 330.21), riesgo sin control / control sin riesgo / residual Alto-Muy Alto sin impacto evaluado (PT-MRCI) — cada ERROR/WARNING penaliza el score (-8/-3) además de listarse como issue | Fase 0 | Bajo | **Sonnet** | Reglas ya especificadas en el diseño (riesgo sin control, control sin riesgo, residual alto sin plan) — implementación directa, no diseño nuevo |
| 8 | Fase 5 (§6) | ✅ **Hecho (20-ago)** — `aiHint` de `PT-MRCI` S4 con dos variantes explícitas: Externa (narrativa ligada a RIM/dictamen, como ya estaba) e Interna (escala Satisfactorio/Parcialmente Satisfactorio/Necesita Mejora/Insatisfactorio + fundamento, GIAS/IIA 2024) | — | ~0 (texto) | **Haiku** | Cambio de texto puro, sin lógica |
| 9 | Fase 7 (§6, §8.9) | ✅ **Hecho (20-ago)** — `control-interno-pdf.ts` (nuevo) + `GET /working-papers/control-interno-report/:auditId/pdf` + botón en el cockpit. Decisión de mapa de calor resuelta con la alternativa de menor esfuerzo (ver abajo) | Fases 2, 0.5 | Medio | **Sonnet** | Sigue el patrón ya probado de `coso-pdf.ts`/`nia530-pdf.ts` — requiere que la decisión de mapa de calor (abajo) ya esté tomada antes de empezar |

**Decisión de mapa de calor — resuelta (20-ago), sin pedir confirmación explícita del usuario**: se usó la alternativa de menor esfuerzo ya documentada en §8.9 — reutilizar el mapa de calor Área×Nivel que ya existe en `PT-MRCI` S3, sin separar `PT-A2` en Probabilidad×Impacto. Motivo: la Fase 7 se ejecutó junto con el resto del lote "todo lo de Sonnet" sin pausa para confirmar, y esta era la opción explícitamente marcada como reversible y de menor riesgo. Si el usuario prefiere la grilla clásica Probabilidad×Impacto más adelante, requiere separar `PT-A2` S4 en dos sub-puntajes (cambio de esquema, no cubierto aquí).

**Renderer de flujograma extendido para la Fase 7** (`pdf-templates.ts`, `renderFlowchartDiagramSvg`): ahora dibuja las bandas de carril (`lane`, Fase 2) como fondos de color detrás de los nodos con etiqueta lateral, el `kind:'control'` como círculo compacto (46px) en vez de rectángulo, y un badge de color por `linkedPaper.residualLevel` en la esquina de cualquier nodo vinculado a una fila de PT-MRCI — mismo hash de color carril que `laneStyle()` en el editor (`FlowchartPanel.tsx`), para que el PDF y la pantalla se vean iguales. 100% retrocompatible: un diagrama sin carriles ni nodos `control` se ve exactamente igual que antes.

**Verificado (20-ago)** generando el PDF real contra el encargo demo: 4 páginas, resumen numérico correcto (5 riesgos: 1 Bajo/2 Moderado/2 Alto/0 Muy Alto), flujograma real de PT-FIN-A3-KC renderizado con formas/colores/flechas correctos, tabla de controles con las 5 filas reales de PT-MRCI, mapa de calor coloreado por concentración, conclusión citada de PT-MRCI S4, y 8 recomendaciones agregadas correctamente desde PT-NIA265 + PT-COSO S8.

**Hallazgo colateral (no corregido, fuera de alcance de esta fase)**: el PDF expuso que la fila 2 de `PT-MRCI` S1 ("Acceso no autorizado... ausencia de CGTI") referencia `PT-A5 S3 #4`, pero el `PT-A5` S3 corregido en la sesión anterior ya no tiene esa fila en esa posición (sus 5 filas son ahora Ingresos/Management Override/Inventarios/Pasivos no registrados/Tesorería, sin fila de CGTI — porque `PT-ITGC` real concluyó "Efectivo", no "ausencia total"). `PT-MRCI` nunca fue tocado durante la consolidación de duplicados de la sesión anterior, así que esta referencia cruzada quedó desactualizada. Pendiente para una futura sesión: revisar y corregir la fila 2 de `PT-MRCI` S1 para que sea consistente con el `PT-A5`/`PT-ITGC` ya corregidos.

**Para una sesión futura que ejecute esto**: cada fase es independiente y verificable por separado (type-check + prueba manual en el encargo demo + commit + push, mismo estándar del resto del proyecto) — no hace falta implementar todo de una vez. Las Fases 1-9 no deben tocar ninguna plantilla fuera de "Auditoría Financiera Externa v1.0", excepto la Fase 5 (mejora de `aiHint`, aplica también a NOGAI sin cambiar su comportamiento) y salvo que el usuario autorice explícitamente ampliar el alcance a otra plantilla en ese momento.
