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

### Railway
| Secret | Descripción | Dónde obtenerlo |
|--------|-------------|-----------------|
| `RAILWAY_TOKEN` | Token de deploy Railway (compartido) | railway.app → Account Settings → Tokens |
| `RAILWAY_SERVICE_ID` | ID del servicio **NestJS API** en Railway | URL del servicio en Railway dashboard |
| `RAILWAY_AI_SERVICE_ID` | ID del servicio **AI Service (FastAPI)** en Railway | URL del servicio en Railway dashboard |

### Vercel
| Secret | Descripción | Dónde obtenerlo |
|--------|-------------|-----------------|
| `VERCEL_TOKEN` | Token de Vercel | vercel.com/account/tokens |
| `VERCEL_ORG_ID` | ID de organización Vercel | `.vercel/project.json` → `orgId` |
| `VERCEL_PROJECT_ID` | ID del proyecto Vercel | `.vercel/project.json` → `projectId` |

> **Nota:** Si Vercel ya está conectado via GitHub App y auto-deploya,
> `deploy-web.yml` es opcional. Solo `RAILWAY_TOKEN` + `RAILWAY_SERVICE_ID`
> + `RAILWAY_AI_SERVICE_ID` son estrictamente necesarios.

---

## Variables de entorno Railway — AI Service (FastAPI)

Configurar en el servicio `ai-service` de Railway (Settings → Variables):

| Variable | Descripción |
|----------|-------------|
| `GEMINI_API_KEY` | ⭐ Requerida — proveedor primario (AI Studio) |
| `DATABASE_URL` | Connection string PostgreSQL de Supabase |
| `SUPABASE_URL` | URL del proyecto Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (acceso admin a DB) |
| `SUPABASE_JWT_SECRET` | JWT secret del proyecto Supabase |
| `WEB_URL` | URL de producción del frontend (para CORS) |
| `API_URL` | URL de producción de la API NestJS (para CORS) |
| `INTERNAL_API_KEY` | Clave interna NestJS ↔ FastAPI (debe coincidir) |
| `ANTHROPIC_API_KEY` | Opcional — solo si se activa Claude como proveedor |

> El `Dockerfile` ya está en `apps/ai-service/`. Railway detecta automáticamente
> `railway.toml` y usa el Dockerfile para construir la imagen.
