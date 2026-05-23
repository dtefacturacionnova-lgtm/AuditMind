# Branch Protection Rules — main

Configure en: **Settings → Branches → Add rule → `main`**

## Reglas requeridas

| Setting | Value |
|---------|-------|
| Require status checks to pass before merging | ✅ |
| Required checks | `✅ CI Passed` (job `ci-passed`) |
| Require branches to be up to date | ✅ |
| Require pull request reviews | ✅ (1 approver recomendado) |
| Dismiss stale reviews on new pushes | ✅ |
| Do not allow bypassing the above settings | ✅ |

## Secrets requeridos (Settings → Secrets → Actions)

| Secret | Descripción | Dónde obtenerlo |
|--------|-------------|-----------------|
| `RAILWAY_TOKEN` | Token de deploy Railway | railway.app → Account Settings → Tokens |
| `RAILWAY_SERVICE_ID` | ID del servicio API en Railway | URL del servicio en Railway dashboard |
| `VERCEL_TOKEN` | Token de Vercel | vercel.com/account/tokens |
| `VERCEL_ORG_ID` | ID de organización Vercel | `.vercel/project.json` → `orgId` |
| `VERCEL_PROJECT_ID` | ID del proyecto Vercel | `.vercel/project.json` → `projectId` |

> **Nota:** Si Vercel ya está conectado via GitHub App y auto-deploya,
> `deploy-web.yml` es opcional. Solo `RAILWAY_TOKEN` + `RAILWAY_SERVICE_ID`
> son estrictamente necesarios para el deploy automático de la API.
