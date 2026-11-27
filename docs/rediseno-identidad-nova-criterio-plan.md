# Rediseño y aplicación de identidad de marca Nova Criterio — plan de trabajo

**Origen del diseño:** canvas de Claude Design «Nova Criterio» — https://claude.ai/artifact/XN57ZNCpbPeaExgqn4Dq4m (lámina S1 = tres direcciones, S2 = paleta/contraste/tipo, S3 = componentes, P1–P6 = pantallas, R1 = informe PDF, L7 = logo final).
**Dirección elegida (2026-11-27, por el usuario):** **«Cuaderno contable»** — tabla con reglas finas, cifras tabulares, esquinas de 2 px, total con doble raya.
**Relación con el renombre de texto:** el nombre «Nova Criterio» ya está en `main` (merge `92e24e1`, sin desplegar; ver `docs/consolidacion-ramas-2026-11-27.md`). Este plan es la fase pendiente de esa rama: **color, logo y rediseño visual**.

## Reglas del plan
- Cada fase se puede desplegar sola y deja la aplicación usable. Mientras una pantalla no se migra, sigue con la paleta actual (azul `primary`); la antigua no se retira hasta la fase 4.
- Las pantallas se migran de a una, con la prueba de que lo no migrado no cambia.
- **Modelo por tarea** (regla global): el diseño ya está hecho y escrito en el canvas, así que se ejecuta con **Sonnet**; Haiku para pruebas y documentación sobre patrones existentes; Opus solo si aparece un fallo raro o una decisión de arquitectura de navegación.
- Nada se despliega sin aprobación del usuario. Ver «Decisiones abiertas».

## Valores de marca (resumen; fuente en código `apps/web/src/lib/brand/tokens.ts`)
| | Oscuro (base del diseño) | Claro |
|---|---|---|
| Fondo / panel / línea | `#0B2A30` / `#103842` / `#1E4A55` | `#F6F3EC` / `#FFFFFF` / `#D8D2C2` |
| Texto / secundario | `#E9E4D6` / `#93AAAD` | `#0B0E14` / `#5A5F66` |
| Acento (ocre) | `#B8934A` | `#8A6A1F` |
| Éxito / advertencia / error | `#3FB68B` / `#F0702A` / `#E5484D` (solo ícono) | `#1F7A58` / `#B24A12` / `#B8292E` |

Tipografías: **Space Grotesk** (títulos y nombre de la marca), **Inter** (cuerpo), **JetBrains Mono** (cifras y referencias, siempre tabulares), **Playfair Display** cursiva (solo el eslogan del logo).
Eslogan: «Inteligencia con criterio. Auditoría con confianza.» · firma «por NovaTech».

## Fases

### Fase 0 — Cimientos de la marca · **HECHA (2026-11-27), sin commit** · Sonnet
Sin cambio visible: nada consume todavía lo que se agrega.
- Valores de marca en un solo sitio (`lib/brand/tokens.ts`) con la función de contraste WCAG.
- Variables CSS `--nc-*` en `globals.css` para claro, oscuro y oscuro-según-el-sistema (`data-theme` en `<html>`; sin atributo, el del sistema).
- Tailwind: colores `nc-*`, familias `font-nc-display|nc-mono|nc-tagline` y `rounded-nc`. **No** se redefine `primary`, `font-sans` ni `font-mono` (las usan decenas de pantallas).
- `layout.tsx`: Space Grotesk, JetBrains Mono y Playfair Display como variables CSS con `preload: false`; el cuerpo sigue en Inter.
- Componente `NovaCriterioLogo` (`symbol`, `wordmark`, `lockup`; tono de marca o de una tinta) y `NovaTechIsotype`.
- **Pruebas** (`tokens.spec.ts`, 45): las cifras de contraste del diseño son ciertas; TypeScript, CSS y Tailwind dicen lo mismo; Tailwind no pisa lo existente; geometría del logo.
- **Verificación:** el CSS compilado de toda la aplicación antes y después solo **añade** líneas (0 quitadas); barrido de 22 mutaciones sin sobrevivientes.

### Fase 1 — Acceso y marco de la aplicación · Sonnet (revisión Opus si se reestructura la navegación)
- Pantalla de acceso (lámina P1): logo completo, reglas de cuaderno, pie legal.
- Barra superior (P2): logo, pestañas, buscador `Ctrl K`, avatar. Ver decisión de navegación.
- **Selector de tema** (claro / oscuro / sistema) y su persistencia; activar `preload` de las fuentes.
- Título de la pestaña, favicon y metadatos con la marca.
- Páginas públicas que ve el cliente del despacho: `/firmar`, `/verificar` y el portal PBC (primera impresión externa).

### Fase 2 — Componentes y pantallas de trabajo · Sonnet (pruebas de lógica: Haiku)
- Componentes base (lámina S3): botón principal/secundario/de texto, campo, etiqueta de estado con ícono, indicador de riesgo, marcas de auditoría (✓ cotejado, ^ sumado, A ajuste, F por confirmar), tabla de cuaderno con fila de 32 / 40 px y **total con doble raya**, cifras tabulares a la derecha.
- Estados vacío y error (P5).
- Migración por prioridad: **lista de auditorías** (P2/P6, incluida la densidad compacta a 1024 × 768) → **papel de trabajo C-1** (P3) → **hallazgos** (P4) → papeles de trabajo restantes → Cartera, Horas, Comité, Administración.

### Fase 3 — Informes, correos y archivos generados · Sonnet
- Informe PDF tamaño carta (lámina R1), reportes DOCX/XLSX, encabezados y logo de una tinta.
- Plantillas de correo de la API y de Supabase Auth (remitente y pie).
- Iconos de aplicación y de la página (PWA/favicon) en todos los tamaños.

### Fase 4 — Cierre · Haiku (la limpieza de la paleta antigua: Sonnet)
- Retirar el azul `primary` y los estilos sueltos cuando ya no quede ninguna pantalla que los use.
- Pruebas de contraste y de regresión sobre las pantallas migradas.
- Guía de marca breve para el equipo (qué color, qué tipo, cuándo la versión de una tinta).

## Decisiones abiertas
| # | Decisión | Propuesta | Cuándo hace falta |
|---|---|---|---|
| 1 | **Navegación:** el diseño usa barra superior con pestañas; la aplicación tiene barra lateral | Decidir antes de la fase 1; la barra superior alcanza para 5 módulos pero hoy hay más (Cartera, Horas, Comité, Administración, Biblioteca…) | Fase 1 |
| 2 | **Tema por defecto:** el diseño parte del oscuro | Seguir el del sistema, con selector manual | Fase 1 |
| 3 | **Razón social del pie:** «NOVATECH INTELLIGENT SYSTEMS, S.A. de C.V.» | Confirmar que es la correcta antes de publicarla | Fase 1 |
| 4 | **Isotipo NovaTech:** las láminas N1/N2 son variantes; las pantallas usan la versión «círculo con N» | Confirmar cuál es la definitiva | Fase 1 |
| 5 | **Desplegar el renombre de texto antes o junto con la fase 1** | Junto, para no mostrar el nombre nuevo con el estilo viejo | Antes de desplegar `main` |
| 6 | Antes de ese despliegue: `EMAIL_FROM_NAME="Nova Criterio"` **entre comillas** en el `.env` del VPS | — | Despliegue |

## Riesgos y cosas a cuidar
- **Error rojo en oscuro** (`#E5484D`) da 3.9:1: solo como ícono; el texto del error va en color principal (regla del diseño, verificada por las pruebas).
- **Fuentes:** `next/font` las descarga en el `build`; el VPS ya lo hace con Inter, pero hay que verificarlo en el primer despliegue que las use.
- **Densidad:** el diseño asume fila de 32 px y cifra de 12 px para el uso diario; revisar legibilidad con los auditores antes de migrar las pantallas más usadas.
- **Verificación visual:** exige sesión y el entorno local comparte base con producción; se verifica con el usuario o con una cuenta de demostración.
