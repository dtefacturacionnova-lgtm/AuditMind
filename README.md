# AuditMind Intelligence Platform

> Plataforma de auditoría inteligente de clase mundial — Score 91/100

## Stack Tecnológico

| Capa | Tecnología |
|------|-----------|
| Frontend | Next.js 15 + TypeScript + TailwindCSS + shadcn/ui |
| Backend API | NestJS + TypeScript + Prisma ORM |
| Motor IA | FastAPI + Python + Claude API + LangChain |
| Base de Datos | Supabase (PostgreSQL) + pgvector (RAG) |
| Auth | Supabase Auth + SAML 2.0 + MFA + JWT + RLS |
| Cache/Colas | Upstash Redis + BullMQ |
| Búsqueda | Meilisearch |

## Estructura del Monorepo

```
apps/
  web/          → Dashboard auditores (Next.js 15, puerto 3000)
  api/          → Backend API (NestJS, puerto 3001)
  ai-service/   → Motor IA (FastAPI Python, puerto 8000)
  portal/       → Portal del auditado (Next.js 15, puerto 3002)
packages/
  shared/       → Tipos TypeScript compartidos
  ui/           → Design system y componentes
  config/       → Configuraciones ESLint/TSConfig
infrastructure/
  docker/       → Docker Compose para desarrollo
  scripts/      → RLS SQL, pgvector setup, migraciones
```

## Inicio Rápido

### 1. Pre-requisitos
- Node.js >= 22
- Python >= 3.11
- Docker Desktop

### 2. Configurar variables de entorno
```bash
cp .env.example .env
# Editar .env con tus credenciales de Supabase, Anthropic API, etc.
```

### 3. Levantar servicios de desarrollo
```bash
# Redis + Meilisearch + MailHog
docker-compose -f infrastructure/docker/docker-compose.yml up -d
```

### 4. Instalar dependencias
```bash
npm install
cd apps/api && npm install
cd apps/web && npm install
cd apps/portal && npm install
cd apps/ai-service && pip install -r requirements.txt
```

### 5. Configurar la base de datos

En Supabase SQL Editor, ejecutar en orden:
1. `infrastructure/scripts/pgvector_setup.sql`
2. `infrastructure/scripts/rls.sql`

Luego desde el API:
```bash
cd apps/api
npx prisma migrate dev --name init
npx prisma generate
npx prisma db seed
```

### 6. Iniciar en desarrollo
```bash
# Desde la raíz del monorepo
npm run dev
```

Accesos:
- Dashboard: http://localhost:3000
- API + Swagger: http://localhost:3001/api/docs
- Portal: http://localhost:3002
- Motor IA: http://localhost:8000/docs
- MailHog: http://localhost:8025

## Módulos del Sistema

| # | Módulo | Fase |
|---|--------|------|
| 01 | Administración y Seguridad | MVP |
| 02 | Universo de Auditoría | MVP |
| 03 | Planificación Inteligente | MVP |
| 04 | Evaluación de Riesgos | MVP |
| 05 | Ejecución de Auditoría | MVP |
| 06 | Portal del Auditado | MVP |
| 07 | Hallazgos y Recomendaciones | MVP |
| 08 | Analytics de Datos | Fase 2 |
| 09 | Reportería Inteligente | Fase 2 |
| 10 | Dashboards y KPIs | Fase 2 |
| 11 | Motor IA y Agentes | Fase 3 |
| 12 | ESG y Sostenibilidad | Fase 6 |
| 13 | QAIP y Calidad | Fase 5 |
| 14 | Comité de Auditoría | Fase 5 |
| 15 | BCP/DRP | Fase 5 |
