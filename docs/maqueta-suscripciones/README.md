# Maqueta de suscripciones (2026-11-21)

Copia de seguridad de la maqueta navegable de planes y suscripciones de AuditMind. Es el **diseño aprobado por el usuario** como punto de partida de la construcción; el documento que lo explica es `../suscripciones-y-planes-propuesta.md` (§10 y §11).

- **Enlace vivo (artefacto privado de Claude):** https://claude.ai/artifact/1LQYJfPmGBFZB7toSi2GmP
- **Qué hay aquí:** el código fuente de cada pantalla (`*.dc.html`, formato de lienzo de diseño de Claude) y `canvas.json` (posición de las pantallas). No se ejecutan dentro de la aplicación: son referencia visual.

| Archivo | Pantalla |
|---|---|
| `Main.dc.html` | 1 · Catálogo público `/precios` |
| `Editor.dc.html` | 2 · Editor de plan (superadmin) |
| `MiPlan.dc.html` | 3 · Mi plan (cliente) |
| `Bloqueado.dc.html` | 4 · Módulo fuera del plan |
| `Suscripciones.dc.html` | 5 · Suscripciones y pagos (superadmin) |
| `Comprar.dc.html` | 6 · Comprar más (cliente) |
| `Consumo.dc.html` | 7 · Consumo y costos (superadmin) |

**Datos de ejemplo:** los precios, las organizaciones y los consumos son ficticios; los precios son hipótesis a validar y en la aplicación real serán datos editables del plan.
