# Consolidación de ramas en `main` — 2026-11-27

Revisión de todas las ramas y worktrees del repositorio y qué se hizo con cada una.

## Resultado

| Rama | Estado | Decisión |
|---|---|---|
| `marca/nova-criterio` | 3 commits completos del renombre «AuditMind → Nova Criterio» (solo el nombre visible), ya reubicados sobre main | **Fusionada en main** (`92e24e1`, sin conflictos). **NO desplegada.** |
| `claude/festive-margulis-d445e8` (worktree `relaxed-pare-81d6fa`) | WIP del 2026-10-25: diseño, esquema y SQL del código por correo del portal PBC («sin implementar») | **Superada, no se fusiona.** Main ya trae el SQL (`2026-10-pbc-portal-otp.sql` y su reversa), el documento `portal-pbc-codigo-por-correo.md` y el esquema, además de 80 commits posteriores. Fusionarla revertiría trabajo de main. |
| `claude/pensive-shamir-09d703` (worktree `adoring-yonath-71d1fd`) | WIP del 2026-10-25: barrido del modo investigación (parcial) | **Superada, no se fusiona.** Ese mismo WIP ya está en main (`a6d77bf`) y los 14 lotes del barrido se completaron y desplegaron después (`db681bd`…`162600b`). |
| `main` | Al día con `origin/main` | — |

No había stashes.

## Pendiente (anotado)

1. **Desplegar el renombre «Nova Criterio» — decisión del usuario.** Está en `main` pero el servidor corre el commit anterior al merge. Antes de `deploy.sh`:
   - `EMAIL_FROM_NAME` del `.env` del VPS: el valor lleva un espacio y `deploy.sh` hace `source .env` con `set -euo pipefail`; **debe ir entre comillas** (p. ej. `EMAIL_FROM_NAME="Nova Criterio"`) o el despliegue aborta.
   - Cualquier despliegue de `main` desde ahora **publica el renombre** (login, correos, textos de IA, nombres de archivos de descarga).
   - Siguen pendientes de esa fase: color y logo.
2. **Worktrees y ramas WIP superados** (`claude/festive-margulis-d445e8`, `claude/pensive-shamir-09d703` y sus carpetas en `.claude/worktrees/`): se dejaron como están. Pueden eliminarse cuando el usuario lo confirme (borrado no reversible de ramas locales sin fusionar).
3. **Cambio sin commitear en el worktree `relaxed-pare-81d6fa`:** `@prisma/client` `^5.18.0` → `^5.22.0` en `apps/api/package.json` y `package-lock.json`. Parece incidental (alineó la versión instalada); no se llevó a main. Si se quiere esa versión, hacerlo como un cambio deliberado y con pruebas.
4. **Fallo corregido durante la consolidación:** el controlador `paper-library` (biblioteca por papel, `da5dc25`) no estaba declarado en `CORE_ROUTES` y la prueba guardia de `route-entitlements` fallaba. Sin efecto en ejecución (una ruta sin declarar se trata como núcleo), pero corregido en `e60421d`. **Está en `main`, aún no en el servidor** (se despliega con el siguiente deploy).
5. **Verificación visual pendiente** de la pestaña «Visitas» de B-00 y del puente (pasos 3 y 4, ya en producción): exige iniciar sesión.

## Estado de producción al cierre

El servidor corre `ab647c8` (visitas, pasos 2, 3 y 4). `main` está dos commits adelante (`92e24e1` renombre y `e60421d` ruta del núcleo), sin desplegar.
