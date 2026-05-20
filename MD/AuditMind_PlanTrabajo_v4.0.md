# PLAN DE TRABAJO — AuditMind Intelligence Platform v4.0
## Sistema de Auditoría Inteligente — Plan de Ejecución Completo con Claude Code
> **Herramienta única:** Claude Code para todo — arquitectura, lógica, UI, IA, seguridad, scaffolding.
> **Stack:** Next.js 15 + NestJS + FastAPI Python + Supabase + pgvector + Prisma + Turborepo

---

## RESUMEN EJECUTIVO DEL SISTEMA

| Dimensión | Detalle |
|---|---|
| **Módulos** | 15 módulos (12 originales + QAIP, Comité de Auditoría, BCP/DRP) |
| **Agentes IA** | 14 agentes especializados |
| **Bases RAG** | 9 bases de conocimiento vectorial |
| **Funcionalidades IA** | 9 capacidades avanzadas (Athena/Hermes/Minerva, Skills, Plantillas Dinámicas, etc.) |
| **Cobertura normativa** | IIA 2025, COBIT 2019, NIST CSF 2.0, ISO 27001:2022, ISO 22301:2019, NIA/ISA, ACFE, EU AI Act |
| **Score objetivo** | 91/100 (competitivo enterprise) |

---

## MAPA DE FASES

| Fase | Período | Contenido Principal |
|---|---|---|
| **Fase 0** | Día 1 (3-4 h) | Entorno, monorepo, Docker, Supabase |
| **Fase 1A** | Semana 1 (8-10 h) | Schema BD + RLS + Auth |
| **Fase 1B** | Semana 2 (8-10 h) | Módulos CRUD core + API |
| **Fase 1C** | Semana 3 (10-12 h) | Hallazgos + Portal + Materialidad + Riesgo Auditoría |
| **Fase 1D** | Semana 4 (8-10 h) | Dashboards + Seed + MVP demo-able |
| **Fase 2** | Meses 2-4 | Analytics, Reportería, Dashboards avanzados |
| **Fase 3** | Meses 4-7 | Motor IA, 9 Agentes base, RAG, Asistentes por rol |
| **Fase 4** | Meses 7-10 | Integraciones ERP, Skills marketplace, Modo offline |
| **Fase 5** | Meses 10-14 | IA avanzada (Minerva/Atlas/Fenix/Lex/Sherlock), QAIP, Comité |
| **Fase 6** | Meses 14-18 | ESG, BCP/DRP, EU AI Act, benchmark sectorial |

---

# FASE 0 — PREPARACIÓN DEL ENTORNO
> **Día 1 — 3-4 horas** | Sin código del sistema, solo infraestructura

---

## TAREA 0.1 — Instalar y verificar herramientas base
**⏱ 30 min | 🟠 CLAUDE CODE**

```
Actúa como un ingeniero DevOps senior configurando un entorno de desarrollo en Windows 10.

Necesito verificar e instalar las siguientes herramientas para el proyecto AuditMind:
1. Node.js LTS v22 — verificar con `node --version`, instalar si no está
2. Git — configurar nombre y email globales
3. Docker Desktop — verificar con `docker ps`
4. npm global packages: turbo, prisma CLI
5. Python 3.11+ — verificar con `python --version`

Para cada herramienta:
- Comando exacto de verificación (PowerShell)
- Comando de instalación si no está presente
- Cómo confirmar que funciona correctamente

Sistema operativo: Windows 10. Shell: PowerShell.
```

**✅ Resultado:** Node 22, Git, Docker, Turbo, Prisma CLI, Python 3.11 instalados y verificados.

---

## TAREA 0.2 — Crear monorepo con Turborepo
**⏱ 60 min | 🟠 CLAUDE CODE**

```
Eres un arquitecto de software senior especializado en monorepos TypeScript enterprise.

Crea la estructura COMPLETA del monorepo AuditMind con Turborepo. El sistema es un SaaS de auditoría inteligente con IA.

ESTRUCTURA EXACTA requerida:
```
auditoria-inteligente/           ← raíz del monorepo
  apps/
    web/                         → Next.js 15 (dashboard auditores)
    api/                         → NestJS (backend principal REST+GraphQL+WS)
    ai-service/                  → FastAPI Python (motor IA, agentes, analytics)
    portal/                      → Next.js 15 (portal del auditado, acceso público)
  packages/
    shared/                      → Tipos TypeScript compartidos (DTOs, interfaces, enums)
    ui/                          → Componentes React compartidos (design system)
    config/                      → ESLint, Prettier, TypeScript configs
  infrastructure/
    docker/                      → Dockerfiles por servicio + docker-compose.yml
    scripts/                     → Migraciones, seeds, utilidades
    terraform/                   → Infraestructura AWS (producción)
```

Incluye:
- turbo.json con pipelines: build, dev, test, lint
- package.json raíz con workspaces y scripts globales
- .gitignore completo para TypeScript + Python + Next.js
- .env.example con TODAS las variables del sistema:
  SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
  ANTHROPIC_API_KEY, GOOGLE_AI_API_KEY (fallback),
  UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN,
  MEILISEARCH_HOST, MEILISEARCH_MASTER_KEY,
  RESEND_API_KEY, NOVU_API_KEY,
  AWS_S3_BUCKET, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY,
  NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_API_URL, DATABASE_URL
- README.md con instrucciones de arranque

Muestra el contenido completo de cada archivo de configuración.
```

**✅ Resultado:** Monorepo completo listo para desarrollo.

---

## TAREA 0.3 — Docker Compose para desarrollo local
**⏱ 30 min | 🟠 CLAUDE CODE**

```
Crea docker-compose.yml para desarrollo local de AuditMind.

Servicios requeridos:
- redis: imagen redis:7-alpine, puerto 6379, con persistencia AOF
- meilisearch: imagen getmeili/meilisearch:v1.6, puerto 7700,
  MEILI_MASTER_KEY=dev_master_key_local
- mailhog: para capturar emails en desarrollo, puerto 8025 (UI) y 1025 (SMTP)

Incluye:
- volumes nombrados para persistencia
- healthchecks para cada servicio
- red interna "auditoria-network"
- .env.docker con variables de cada servicio

El ai-service (FastAPI Python) también necesita:
- requirements.txt con: fastapi, uvicorn, anthropic, langchain, langchain-anthropic,
  torch, scikit-learn, pandas, numpy, pgvector, psycopg2-binary, python-dotenv,
  openai (para embeddings), pytesseract, pdfplumber, spacy, httpx
- Dockerfile para el ai-service

Muestra el código completo de todos los archivos.
```

**✅ Resultado:** Docker Compose funcional con Redis, Meilisearch y MailHog.

---

## TAREA 0.4 — Configurar pgvector en Supabase
**⏱ 20 min | 🟠 CLAUDE CODE**

```
Genera el SQL para habilitar pgvector en Supabase y crear las tablas de embeddings
necesarias para el sistema RAG de AuditMind.

Tablas requeridas:
1. knowledge_chunks: almacena los chunks de documentos normativos con sus vectores
   - id, doc_id (FK), organization_id, rag_base (enum), content (text),
     embedding (vector(1536)), chunk_index, metadata (jsonb), created_at

2. knowledge_documents: registro de documentos procesados
   - id, organization_id, title, doc_type, rag_base (enum: GLOBAL|CLIENT),
     scope (enum: IIA|TI|BCP|COMPLIANCE|FRAUD|AI_GOV|CLIENT|FINANCIAL|SECTOR),
     file_url, status (enum: PENDING|PROCESSING|READY|FAILED),
     chunk_count, processed_at, created_at

RAG bases enum: IIA_2025 | AUDIT_TI | CONTINUITY | COMPLIANCE | ANTI_FRAUD |
                AI_GOVERNANCE | CLIENT_NORMATIVE | FINANCIAL | SECTOR_SPECIFIC

Funciones SQL a crear:
- match_knowledge(query_embedding vector, match_threshold float, match_count int,
  org_id uuid, rag_bases text[]) → tabla de chunks relevantes ordenados por similitud
- Índices HNSW para búsqueda vectorial eficiente en cada columna embedding

Formato: SQL listo para ejecutar en el SQL Editor de Supabase.
```

**✅ Resultado:** pgvector habilitado, tablas de RAG creadas, función de búsqueda vectorial lista.

---

# FASE 1A — BASE DE DATOS Y AUTENTICACIÓN
> **Semana 1 — 8-10 horas** | El cimiento que no puede tener errores

---

## TAREA 1.1 — Schema completo de base de datos (Prisma)
**⏱ 120 min | 🟠 CLAUDE CODE — Tarea más crítica del proyecto**

```
Eres un arquitecto de datos senior especializado en sistemas SaaS enterprise multi-tenant.

Crea el schema.prisma COMPLETO para AuditMind. Es un sistema de auditoría inteligente
con 15 módulos, 14 agentes IA y 9 bases RAG.

═══════════════════════════════════════════════
ENUMS REQUERIDOS (definir todos primero):
═══════════════════════════════════════════════

UserRole: SUPER_ADMIN | ADMIN | CAE | AUDIT_MANAGER | SENIOR_AUDITOR | AUDITOR | AUDITEE | READ_ONLY

AuditType: INTERNAL | EXTERNAL | OPERATIONAL | FINANCIAL | IT | COMPLIANCE | ESG | FORENSIC | BCP_DRP

AuditStatus: PLANNING | IN_PROGRESS | REVIEW | CLOSED | CANCELLED

WorkingPaperType: PLANNING_UNDERSTANDING | CONTROL_EVALUATION | SUBSTANTIVE_TEST |
                  DATA_ANALYSIS | FINDING | CLOSURE_CONCLUSION | INTERVIEW | CONFIRMATION

WorkingPaperStatus: DRAFT | IN_REVIEW | APPROVED | ARCHIVED

FindingSeverity: CRITICAL | HIGH | MEDIUM | LOW | INFORMATIONAL

FindingStatus: DRAFT | IN_REVIEW | APPROVED | IN_PROGRESS | CLOSED | OVERDUE | ACCEPTED_RISK

PbcRequestStatus: PENDING | SUBMITTED | ACCEPTED | REJECTED | OVERDUE

RagBase: IIA_2025 | AUDIT_TI | CONTINUITY | COMPLIANCE | ANTI_FRAUD |
         AI_GOVERNANCE | CLIENT_NORMATIVE | FINANCIAL | SECTOR_SPECIFIC

DocScope: GLOBAL | CLIENT

AuditRisk: LOW | MODERATE | HIGH | VERY_HIGH

AuditApproach: CONTROLS_RELIANCE | SUBSTANTIVE_FOCUS | COMBINED

EscalationLevel: NONE | AUDITOR | MANAGER | CAE | COMMITTEE

ComplianceFramework: SOX | BASEL_III | GDPR | LGPD | FATF | PCI_DSS | IFRS | EU_AI_ACT | COBIT | NIST_CSF | ISO_27001 | ISO_22301

CertificationType: CIA | CISA | CFE | CPA | CRMA | CGAP | PMP | ISO27001_LA | ISO22301_LA | CISSP | CDPSE

TickMark: VERIFIED | EXCEPTION | ESTIMATED | CONFIRMED_THIRD | RECALCULATED | FOOTED | CROSS_FOOTED | NOT_APPLICABLE | PENDING | ATTENTION

═══════════════════════════════════════════════
MODELOS PRINCIPALES:
═══════════════════════════════════════════════

// ── NÚCLEO MULTI-TENANT ──────────────────────
Organization: id, name, slug (unique), plan, settings (Json),
  logoUrl, primaryColor, active, trialEndsAt, createdAt, updatedAt

User: id, organizationId (FK → Organization), email (unique), name, role (UserRole),
  avatarUrl, active, lastLoginAt, timezone, preferredLanguage,
  aiAssistantPersonality (enum: ATHENA|HERMES|MINERVA), createdAt, updatedAt

UserCertification: id, userId, certificationType (CertificationType), certNumber,
  issuedAt, expiresAt, isActive, verificationUrl

UserCompetency: id, userId, area (text), expertiseLevel (1-5), yearsExperience

CpeRecord: id, userId, year, category (text), hours, description, completedAt

// ── MÓDULO 02: UNIVERSO DE AUDITORÍA ─────────
AuditEntity: id, organizationId, name, description, category, parentEntityId (self-FK),
  responsible, location, sector, relatedSystems (Json), inherentRiskScore,
  lastAuditDate, recommendedFrequencyMonths, active, excluded, exclusionJustification,
  createdAt, updatedAt

// ── MÓDULO 03: PLANIFICACIÓN ──────────────────
AuditPlan: id, organizationId, year, name, status, approvedBy (FK → User),
  approvedAt, totalHours, objectives (Json), createdAt, updatedAt

AuditPlanItem: id, planId, auditEntityId, estimatedHours, tentativeStartDate,
  tentativeEndDate, priority, notes

// ── MÓDULO 04: EVALUACIÓN DE RIESGOS ─────────
RiskMatrix: id, organizationId, name, probabilityLevels (Json), impactLevels (Json),
  riskAppetite (Json), active, createdAt

RiskRegister: id, organizationId, auditEntityId, title, description,
  category (text), probability (1-5), impact (1-5), inherentScore,
  controlsScore, residualScore, kris (Json), trend, lastUpdated

// ── MÓDULO 05: EJECUCIÓN ──────────────────────
Audit: id, organizationId, planId (FK nullable), auditEntityId, title,
  type (AuditType), status (AuditStatus), scope, objectives (text),
  startDate, endDate, estimatedHours, actualHours,
  leadAuditorId (FK → User), isInvestigationMode (Boolean, default false),
  materiality (Decimal nullable), materialityExecution (Decimal nullable),
  materialityAccumulation (Decimal nullable), materialityBase (text nullable),
  auditRiskModel (Json nullable),
  createdAt, updatedAt

AuditTeam: id, auditId, userId, role (text), assignedAt

AuditProgram: id, auditId, title, objectives (text), steps (Json),
  generatedByAI (Boolean), approvedAt, createdAt

WorkingPaper: id, auditId, code, title, type (WorkingPaperType),
  status (WorkingPaperStatus), indexSection (text), content (Json),
  preparedById (FK → User), reviewedById (FK → User nullable),
  qualityScore (Int nullable), version (Int, default 1),
  tickMarks (Json), crossReferences (Json), aiAssisted (Boolean),
  conclusion (text nullable), parentPaperId (FK self nullable),
  createdAt, updatedAt

WorkingPaperVersion: id, paperId, version, content (Json), changedBy, changedAt, diff (Json nullable)

WorkingPaperComment: id, paperId, authorId, content, resolved, resolvedBy nullable, createdAt

TickMarkEntry: id, paperId, fieldPath (text), tickMark (TickMark), note (text nullable),
  createdBy, createdAt

// ── MÓDULO 05: CONFIRMACIONES EXTERNAS (NIA 505) ──
ExternalConfirmation: id, auditId, type (enum: BANK|CLIENT|LAWYER|SUPPLIER|OTHER),
  respondentName, respondentEmail, amount (Decimal nullable), accountRef,
  sentAt, sentBy, responseReceivedAt, responseContent (text nullable),
  difference (Decimal nullable), differenceExplanation (text nullable),
  status (enum: DRAFT|SENT|RECEIVED|RECONCILED|NO_RESPONSE|ALT_PROCEDURE),
  alternativeProcedure (text nullable), createdAt

// ── MÓDULO 06: PORTAL DEL AUDITADO ───────────
PbcRequest: id, auditId, organizationId, title, description,
  requestedToEmail, requestedToName, dueDate, status (PbcRequestStatus),
  portalToken (unique), fileUrls (Json), rejectionReason (text nullable),
  submittedAt, acceptedAt, templateId (FK nullable), createdBy, createdAt, updatedAt

PbcMessage: id, requestId, senderEmail, senderName, isAuditor (Boolean),
  content, attachmentUrls (Json), createdAt

// ── MÓDULO 07: HALLAZGOS ──────────────────────
Finding: id, auditId, workingPaperId (FK nullable), organizationId,
  title, condition (text), criteria (text), cause (text), effect (text),
  risk (text), recommendation (text), managementResponse (text nullable),
  severity (FindingSeverity), status (FindingStatus),
  qualityScore (Int), aiDraftUsed (Boolean),
  normativeReference (text nullable), normativeArticle (text nullable),
  isMaterial (Boolean nullable), effectAmount (Decimal nullable),
  responsibleId (FK → User nullable), dueDate (DateTime nullable),
  closedAt (DateTime nullable), closedBy (FK → User nullable),
  isRecurring (Boolean, default false), previousFindingId (FK self nullable),
  escalationLevel (EscalationLevel, default NONE),
  createdAt, updatedAt

FindingAction: id, findingId, organizationId, description, responsibleId,
  dueDate, completionDate, status, progressPct (Int),
  evidenceUrls (Json), comments (text nullable), createdAt, updatedAt

FindingComment: id, findingId, authorId, content, isInternal (Boolean), createdAt

// ── MÓDULO 08: ANALYTICS ──────────────────────
DataAnalysisJob: id, auditId, organizationId, type (text), status,
  parameters (Json), resultsSummary (Json nullable), flaggedCount (Int),
  processingTimeMs (Int nullable), createdAt, completedAt

DataFlag: id, jobId, auditId, entityRef (text), description,
  riskScore (Float), anomalyType (text), rawData (Json),
  reviewedBy (FK nullable), reviewedAt, disposition (text nullable)

// ── MÓDULO 09: REPORTERÍA ─────────────────────
AuditReport: id, auditId, organizationId, type (text), title,
  content (Json), version (Int), aiGenerated (Boolean),
  aiModelUsed (text nullable), status, approvedBy nullable, approvedAt,
  distributionList (Json), scheduledAt nullable, createdAt, updatedAt

// ── MÓDULO 10: PLANTILLAS ─────────────────────
Template: id, organizationId nullable, title, category, type,
  content (Json), dynamicFields (Json), isPublic (Boolean),
  isGlobal (Boolean), tags (Json), usageCount (Int, default 0),
  createdBy, createdAt, updatedAt

// ── MÓDULO 11: MOTOR IA ───────────────────────
AIInteraction: id, organizationId, userId, agentName, modelUsed,
  inputTokens (Int), outputTokens (Int), latencyMs (Int),
  prompt (text), response (text), approved (Boolean nullable),
  feedbackScore (Int nullable), metadata (Json), createdAt

LLMRouterLog: id, organizationId, taskType, modelSelected, fallbackUsed (Boolean),
  tokensUsed (Int), costUsd (Float), success (Boolean), errorMsg nullable, createdAt

// ── MÓDULO 12: ESG ────────────────────────────
EsgFramework: id, organizationId, framework (text), year, status,
  dataPoints (Json), verifiedAt nullable, createdAt

// ── MÓDULO 13: QAIP ───────────────────────────
QaipEvaluation: id, organizationId, type (enum: INTERNAL_CONTINUOUS|INTERNAL_PERIODIC|EXTERNAL),
  period, results (Json), overallScore (Int), status,
  conductedBy, conductedAt, nextDueAt, createdAt

IndependenceDeclaration: id, organizationId, caeId, year,
  declarationText (text), signedAt, documentUrl nullable, createdAt

AuditCharter: id, organizationId, version, content (Json),
  approvedBy, approvedAt, effectiveDate, createdAt

// ── MÓDULO 14: COMITÉ DE AUDITORÍA ───────────
CommitteeSession: id, organizationId, sessionDate, agenda (Json),
  minutes (Json nullable), attendees (Json), status, nextSessionDate nullable,
  createdAt, updatedAt

CommitteeReport: id, organizationId, sessionId nullable, period,
  type (enum: QUARTERLY|ANNUAL|SPECIAL), content (Json),
  preparedById, approvedById nullable, approvedAt nullable, createdAt

// ── MÓDULO 15: BCP/DRP ────────────────────────
BcpAudit: id, auditId, organizationId, framework (text),
  bcpMaturityScore (Int nullable), components (Json),
  rtoRpoAssessment (Json nullable), lastTestedAt nullable,
  recommendations (Json), createdAt

// ── COMPLIANCE ────────────────────────────────
ComplianceAssessment: id, organizationId, auditId nullable,
  framework (ComplianceFramework), year, gapAnalysis (Json),
  overallScore (Int), status, createdAt, updatedAt

NormativeException: id, organizationId, framework (text), controlRef,
  justification (text), compensatingControl (text nullable),
  approvedBy, approvedAt, expiresAt, residualRiskLevel,
  riskOwnerSignature nullable, active (Boolean), createdAt

// ── NOTIFICACIONES ────────────────────────────
Notification: id, organizationId, userId, type, title, body,
  entityType, entityId, read (Boolean), readAt nullable,
  channel (enum: IN_APP|EMAIL|SLACK|TEAMS), createdAt

═══════════════════════════════════════════════
REGLAS GLOBALES:
═══════════════════════════════════════════════
- Todos los modelos tienen createdAt y updatedAt (excepto logs)
- organizationId presente en todos los modelos del tenant
- Índices en: organizationId, status, dueDate, createdAt en todos los modelos que los tengan
- Índices compuestos donde se filtran dos campos juntos
- Relaciones con onDelete apropiado: Cascade para hijos directos, SetNull para referencias opcionales
- @map para snake_case en la base de datos, camelCase en Prisma

Entrega el schema.prisma completo y listo para ejecutar `npx prisma migrate dev`.
```

**✅ Resultado:** Schema completo con todos los módulos, relaciones correctas, enums tipados.

---

## TAREA 1.2 — Row Level Security multi-tenant
**⏱ 60 min | 🟠 CLAUDE CODE — Crítico de seguridad**

```
Eres el arquitecto de seguridad de AuditMind. Implementa Row Level Security (RLS)
completo en Supabase para aislamiento multi-tenant real.

CONTEXTO:
- El JWT de cada usuario contiene organization_id en app_metadata
- El JWT contiene el role del usuario (UserRole enum)
- Cada tabla tiene organization_id
- El service_role key se usa desde el backend NestJS con set_config para inyectar el org

GENERA el SQL completo con:

1. Función helper:
   - get_current_org_id() → extrae org_id del JWT (app_metadata.organization_id)
   - get_current_role() → extrae el role del JWT
   - is_super_admin() → boolean

2. Habilitar RLS en TODAS las tablas del schema

3. Políticas por tabla con lógica específica:
   - Tablas generales: SELECT/INSERT/UPDATE/DELETE por organization_id
   - working_papers: AUDITOR solo ve papeles de audits donde es miembro del equipo
   - pbc_requests: AUDITEE solo ve solicitudes donde su email = requestedToEmail
   - findings: AUDITEE ve solo hallazgos asignados a él (responsibleId)
   - ai_interactions: solo el usuario propietario + AUDIT_MANAGER+ ven las suyas
   - llm_router_log: solo ADMIN y SUPER_ADMIN
   - committee_sessions: solo CAE, ADMIN, SUPER_ADMIN
   - independence_declarations: solo CAE del org + SUPER_ADMIN
   - investigation_mode audits: solo team members explícitos + CAE (is_investigation_mode=true)

4. Política especial SUPER_ADMIN: bypass de todas las políticas por org

5. Función para el backend:
   - set_current_tenant(org_id uuid, user_role text) → set_config para que RLS funcione con service_role

El SQL debe ejecutarse en el SQL Editor de Supabase sin errores.
```

**✅ Resultado:** RLS completo, aislamiento real entre tenants, políticas por rol.

---

## TAREA 1.3 — Sistema de autenticación completo
**⏱ 90 min | 🟠 CLAUDE CODE**

```
Implementa el sistema de autenticación completo para AuditMind.

SISTEMA: Monorepo Turborepo. apps/api (NestJS), apps/web (Next.js 15 App Router),
apps/portal (Next.js 15, portal del auditado sin cuenta completa).

BACKEND (apps/api/src/auth/):
1. JwtStrategy — valida tokens Supabase, extrae org_id y role del JWT
2. JwtAuthGuard — verifica token en cada request
3. RolesGuard — decorador @Roles(...) para control de acceso por rol
4. @CurrentUser() — decorator que retorna el usuario del contexto
5. @CurrentOrg() — decorator que retorna el organization_id
6. AuthService:
   - validateToken(token): valida JWT con Supabase, retorna usuario con rol
   - inviteUser(email, role, orgId): crea invitación Supabase + asigna rol
   - updateUserRole(userId, role): actualiza rol en app_metadata del JWT
7. Middleware TenantContextMiddleware:
   - Extrae org_id del JWT
   - Llama set_current_tenant() en Supabase para que RLS funcione con service_role
   - Inyecta org_id en request context

FRONTEND (apps/web/src/):
8. middleware.ts de Next.js:
   - Protege todas las rutas /dashboard/* con verificación de sesión Supabase
   - Redirige a /login si no hay sesión
   - Redirige según rol: AUDITEE → /portal, resto → /dashboard
9. lib/supabase/client.ts — cliente browser
10. lib/supabase/server.ts — cliente server con cookies
11. hooks/useUser.ts — hook con usuario actual, rol y permisos
12. components/auth/ProtectedRoute.tsx — wrapper con control de roles
13. app/(auth)/login/page.tsx — página de login profesional con:
    - Email + password
    - Magic link como alternativa
    - Logo AuditMind
    - Indicador de carga
14. app/auth/callback/route.ts — handler OAuth/magic link

PORTAL (apps/portal/src/):
15. middleware.ts — valida token de portal (portalToken de PbcRequest)
16. lib/portal-auth.ts — valida portalToken contra la BD (no necesita Supabase Auth)

TypeScript estricto. Sin `any`. Muestra el código completo de cada archivo.
```

**✅ Resultado:** Auth production-grade con SSO, roles, middleware, portal con token único.

---

# FASE 1B — MÓDULOS CORE CRUD Y API
> **Semana 2 — 8-10 horas**

---

## TAREA 1.4 — Estructura base NestJS con 15 módulos
**⏱ 45 min | 🟠 CLAUDE CODE**

```
Crea la estructura de módulos NestJS para AuditMind en apps/api/src/.

Genera la estructura de archivos (module/controller/service/dto) para TODOS los módulos:
  - auth, organizations, users
  - audit-universe, audit-plans, audits, audit-teams
  - working-papers, tick-marks, external-confirmations
  - pbc-requests, findings, finding-actions
  - templates, knowledge-base (RAG), data-analytics
  - reports, dashboards, notifications
  - ai-engine, llm-router
  - qaip, committee, bcp-drp
  - compliance, normative-exceptions
  - esg, competencies

Cada módulo con: module.ts, controller.ts, service.ts,
dto/create-X.dto.ts, dto/update-X.dto.ts.

AppModule.ts importando todos.
Main.ts con:
- ValidationPipe global (whitelist: true, forbidNonWhitelisted: true)
- CORS configurado para web y portal
- Prefijo global /api/v1
- Swagger configurado con autenticación Bearer
- Helmet para seguridad de headers

No implementes lógica — solo estructura, imports/exports vacíos y decoradores base.
```

---

## TAREA 1.5 — Módulo Universo de Auditoría (CRUD)
**⏱ 60 min | 🟠 CLAUDE CODE**

```
Implementa el módulo completo audit-universe en NestJS con Prisma.

AuditUniverseService:
  findAll(orgId, filters: {category?, riskScoreMin?, riskScoreMax?, active?}, pagination):
    - Lista paginada con filtros
    - Incluye días desde última auditoría
    - Incluye si está en el plan del año actual

  findOne(id, orgId): detalle con historial de 5 últimas auditorías

  create(dto, orgId, userId): nueva entidad auditable

  update(id, dto, orgId): actualizar

  calculateRiskScore(id, orgId):
    - Puntaje basado en: cantidad de hallazgos últimos 2 años,
      severidad promedio de hallazgos, días desde última auditoría,
      tipo de entidad (factores predefinidos por categoría)
    - Retorna score 1-100

  getUniverseStats(orgId):
    - Total entidades, por categoría, por nivel de riesgo
    - % auditado en los últimos 12 meses
    - Entidades sin auditar > 24 meses (riesgo)
    - Score de riesgo promedio del universo

  importFromExcel(orgId, fileBuffer): importación masiva

DTOs con class-validator. Manejo de errores descriptivos.
Roles: create/update requieren AUDIT_MANAGER+, lectura todos los roles autenticados.
```

---

## TAREA 1.6 — Módulo de Planificación con lógica de capacidad
**⏱ 75 min | 🟠 CLAUDE CODE**

```
Implementa el módulo audit-plans en NestJS con lógica de negocio compleja.

AuditPlanService:
  createAnnualPlan(orgId, year, dto):
    - Valida que no exista plan para ese year+orgId
    - Calcula horas disponibles totales (usuarios con rol AUDITOR/SENIOR_AUDITOR)
    - Estado inicial: DRAFT

  addAuditToPlan(planId, dto: {auditEntityId, estimatedHours, startDate, endDate, priority}):
    - Valida que horas no excedan capacidad disponible
    - Calcula fecha sugerida según carga del equipo (algoritmo greedy)
    - Alerta si la entidad tiene riesgo CRITICAL y no está en el plan

  calculateCoverage(planId):
    Retorna:
    - % del universo cubierto
    - % de entidades HIGH/CRITICAL risk incluidas
    - Horas comprometidas vs disponibles por auditor
    - Lista de entidades HIGH/CRITICAL NO incluidas (coverage gap)
    - Proyección de cumplimiento al fin del año

  approvePlan(planId, approvedByUserId):
    - Solo CAE puede aprobar
    - DRAFT → APPROVED
    - Emite evento plan.approved

  getCapacityReport(orgId, year):
    - Horas disponibles por auditor (240 días laborables - 20 vacaciones = 220 días)
    - Asume 8h/día pero con 70% efectividad = 6h/día auditables
    - Horas comprometidas en el plan por auditor
    - % utilización con semáforo: <70% (verde), 70-90% (naranja), >90% (rojo)

  suggestOptimalPlan(orgId, year, availableHours):
    - IA: maximiza cobertura de riesgo dado el presupuesto de horas
    - Prioriza entidades HIGH/CRITICAL no auditadas en >18 meses
    - Retorna plan sugerido ordenado por prioridad con justificación
```

---

## TAREA 1.7 — Sistema de Materialidad e Modelo de Riesgo de Auditoría
**⏱ 60 min | 🟠 CLAUDE CODE — Crítico metodológico**

```
Implementa el Módulo de Materialidad (NIA 320) y el Triángulo de Riesgo de Auditoría
(NIA 200) integrados en el módulo de audits.

MATERIALIDAD (NIA 320):

1. MaterialityService.calculate(auditId, params):
   Recibe:
   - materialityBase: 'PROFIT_BEFORE_TAX' | 'TOTAL_REVENUE' | 'TOTAL_ASSETS' |
                      'TOTAL_EXPENSES' | 'BUDGET' (sector público)
   - baseAmount: Decimal (monto del indicador financiero)
   - entityType: 'PROFIT' | 'NON_PROFIT' | 'FINANCIAL' | 'PUBLIC_SECTOR'

   Calcula:
   - Materialidad Global (MG):
     * PROFIT: 5% de utilidad antes de impuestos (o 1-2% si utilidad inestable)
     * NON_PROFIT: 1% de gastos totales
     * FINANCIAL: 1% de activos totales bajo gestión
     * PUBLIC_SECTOR: 0.5-1% del presupuesto ejecutado
   - Materialidad de Ejecución (ME): 75% de MG
   - Umbral de Acumulación de Errores (UAE): 50% de MG

   Guarda en Audit.materiality, Audit.materialityExecution, Audit.materialityAccumulation

2. Endpoint: POST /audits/:id/materiality

MODELO DE RIESGO DE AUDITORÍA (NIA 200):

Interface AuditRiskModel {
  inherentRisk: 'LOW' | 'MODERATE' | 'HIGH' | 'VERY_HIGH'
  inherentRiskScore: number  // 0.05 a 1.0
  controlRisk: 'LOW' | 'MODERATE' | 'HIGH'
  controlRiskScore: number   // 0.05 a 1.0
  detectionRisk: number      // calculado: 0.05 / (IR × CR)
  requiredSampleSize: number // calculado según RD y materialidad
  requiredConfidenceLevel: number // 90%, 95% o 99%
  auditApproach: 'CONTROLS_RELIANCE' | 'SUBSTANTIVE_FOCUS' | 'COMBINED'
}

// Fórmula: RA = RI × RC × RD → RD = RA / (RI × RC)
// RA objetivo = 0.05 (5% — nivel de auditoría estándar)
// RD alto → menos pruebas sustantivas necesarias
// RD bajo → más pruebas sustantivas requeridas

3. AuditRiskService.calculate(auditId, inherentRisk, controlRisk):
   - Calcula RD y requiredSampleSize
   - Si RD < 0.30 → auditApproach = SUBSTANTIVE_FOCUS (más pruebas)
   - Si RD > 0.70 → auditApproach = CONTROLS_RELIANCE
   - Guarda en Audit.auditRiskModel (Json)

4. Endpoint: POST /audits/:id/risk-model

Expón AMBOS cálculos desde el AuditsModule. Muestra código completo.
```

---

## TAREA 1.8 — Frontend — Design System y Layout Principal
**⏱ 90 min | 🟠 CLAUDE CODE**

```
Crea el design system y layout principal de AuditMind en Next.js 15 con
TailwindCSS y shadcn/ui.

PALETA DE COLORES (globals.css con variables CSS):
- Primary: #0F2D4A (azul navy profundo)
- Primary-light: #1A4A7A
- Secondary: #2563EB (azul acción)
- Accent: #06B6D4 (cyan para highlights IA)
- Success: #16A34A
- Warning: #D97706
- Danger: #DC2626
- Background: #F8FAFC
- Surface: #FFFFFF
- Border: #E2E8F0
- Text-primary: #0F172A
- Text-secondary: #64748B

COMPONENTES A CREAR (apps/web/src/components/layout/):

1. Sidebar.tsx — sidebar colapsable con:
   - Logo AuditMind (icono + texto estilizado)
   - Sección usuario: avatar, nombre, rol, organización
   - Navegación jerarquizada por ROL:
     TODOS: Dashboard, Mis Auditorías
     AUDITOR+: Universo, Hallazgos, Papeles, Portal-PBC
     AUDIT_MANAGER+: Planificación, Plantillas, Analytics
     CAE+: Reportes, KPIs, Comité, QAIP, Competencias
     ADMIN: Configuración, Usuarios, IA/Agentes
   - Sección IA: indicador de agente activo (Athena/Hermes/Minerva)
   - Colapso a iconos en mobile con tooltip
   - Indicadores de notificaciones pendientes por sección

2. Header.tsx:
   - Breadcrumb dinámico (basado en pathname)
   - Buscador global con Cmd+K (placeholder, sin lógica aún)
   - Indicador de agente IA activo con nombre y avatar del agente
   - Badge de notificaciones con contador
   - Menú de usuario: perfil, configuración, cerrar sesión

3. DashboardLayout.tsx: Sidebar + Header + área de contenido main

4. PageHeader.tsx: título, descripción, breadcrumb y slot para acciones

5. KpiCard.tsx: tarjeta métrica con valor, etiqueta, tendencia (↑↓), color semáforo

6. StatusBadge.tsx: badge de estado reutilizable con variantes por enum

7. AiAssistantBubble.tsx: burbuja flotante del asistente (ícono + "Pregúntame algo",
   sin lógica de chat aún — solo UI del botón flotante)

TIPOGRAFÍA: Inter para UI, JetBrains Mono para códigos y referencias.
ANIMACIONES: Framer Motion para transiciones de página y sidebar.
Responsive mobile-first. Dark mode preparado con variables CSS.
TypeScript estricto. Accesibilidad aria-labels en todos los elementos interactivos.
Muestra el código completo de todos los archivos.
```

---

# FASE 1C — HALLAZGOS, PORTAL Y PAPELES DE TRABAJO
> **Semana 3 — 10-12 horas**

---

## TAREA 1.9 — Sistema de Papeles de Trabajo con Tick Marks e Índices
**⏱ 90 min | 🟠 CLAUDE CODE**

```
Implementa el módulo working-papers en NestJS con el sistema profesional de
papeles de trabajo según estándares CIA/IIA.

WorkingPapersService:
  create(auditId, dto, userId):
    - Auto-genera el código según el índice estandarizado:
      A-x: Planificación | B-x: Controles | C-x: Sustantivo | D-x: Hallazgos | E-x: Cierre
    - Estado inicial: DRAFT
    - Vincula automáticamente al programa de auditoría

  update(id, dto, userId): actualiza contenido, genera versión nueva en WorkingPaperVersion

  submitForReview(id, userId): DRAFT → IN_REVIEW, notifica al supervisor

  approve(id, reviewerId): IN_REVIEW → APPROVED, registra reviewer

  reject(id, reviewerId, comments): IN_REVIEW → DRAFT con comentario

  addTickMark(paperId, fieldPath, tickMark: TickMark, note?, userId):
    - Registra el tick mark en TickMarkEntry
    - Actualiza el content del papel con referencia al tick mark

  getTickMarksSummary(paperId):
    - Lista todos los tick marks del papel agrupados por tipo
    - Resalta todos los PENDING (⏱) y ATTENTION (⚑) para el revisor

  addCrossReference(paperId, referencedPaperId, description, userId):
    - Registra referencia cruzada bidireccional entre papeles

  calculateQualityScore(paperId):
    Evaluación automática:
    +15 si tiene conclusión (campo conclusion no vacío)
    +15 si tiene > 100 palabras en content
    +15 si tiene al menos un tick mark VERIFIED o RECALCULATED
    +20 si tiene referencias cruzadas
    +20 si tiene objetivo definido en content
    +15 si está vinculado a solicitud PBC aceptada o hallazgo

  getCompletionChecklist(auditId):
    Verifica para el cierre del proyecto:
    - ¿Todos los papeles tienen estado APPROVED?
    - ¿Todos los papeles tienen conclusión?
    - ¿Todos los PENDING tickets están resueltos?
    - ¿El índice A tiene materialidad calculada?
    - ¿El índice E (conclusión) existe y está aprobado?
    - ¿La carta de representación está firmada?
    Retorna: lista de ítems con estado ✅/❌

  archiveAll(auditId): archiva todos los papeles al cerrar la auditoría (inmutable)

ÍNDICE ESTANDARIZADO (generar en create automáticamente):
  A = Planificación/Entendimiento (PT-PL → A-1, A-2...)
  B = Evaluación de Controles (PT-EC → B-1, B-2...)
  C = Pruebas Sustantivas (PT-PS → C-1, C-2...)
  D = Hallazgos (PT-HF → D-1, D-2...)
  E = Conclusión/Cierre (PT-CC → E-1, E-2...)
  AD = Análisis de Datos (PT-AD → AD-1, AD-2...)

TypeScript estricto. Prisma. Muestra código completo.
```

---

## TAREA 1.10 — Módulo de Hallazgos con Score de Calidad
**⏱ 90 min | 🟠 CLAUDE CODE**

```
Implementa el módulo findings en NestJS. Es el módulo más crítico del sistema.

FindingsService:
  create(dto, auditId, userId):
    - Estado inicial: DRAFT
    - Calcula qualityScore automáticamente al crear/editar:
      Completitud (25%): condición >50 palabras (+10), criterio no vacío (+5),
                         causa >30 palabras (+5), efecto >30 palabras (+5)
      Especificidad (25%): condición contiene datos concretos (monto, fecha, %)(+25)
      Soporte normativo (20%): normativeReference no vacío (+20)
      Cuantificación (15%): effectAmount definido y >0 (+15)
      Accionabilidad (15%): recomendación >40 palabras (+15)
    - Máximo 100 puntos

  recalculateQualityScore(findingId): recalcula y guarda

  submitForReview(findingId, userId):
    - Valida qualityScore >= 60, sino: Error 422 con detalle de qué falta para llegar a 60
    - DRAFT → IN_REVIEW
    - Emite evento finding.submitted

  approve(findingId, reviewerId): IN_REVIEW → APPROVED (solo AUDIT_MANAGER+)
    - Vincula automáticamente al RiskRegister de la entidad auditada

  reject(findingId, reviewerId, reason): IN_REVIEW → DRAFT

  checkIfMaterial(findingId):
    - Compara effectAmount con la materialidad del audit
    - Actualiza isMaterial en el hallazgo

  assignResponsible(findingId, responsibleId, dueDate, orgId):
    - Solo en estado APPROVED
    - Crea registro en FindingAction

  markOverdue(orgId):
    - Job: encuentra hallazgos con dueDate < hoy y status IN_PROGRESS
    - Los marca como OVERDUE
    - Escala según días de vencimiento:
      +1 día: notifica al responsable
      +7 días: escala al AUDIT_MANAGER (escalationLevel = MANAGER)
      +15 días: escala al CAE (escalationLevel = CAE)
      +30 días: escala al Comité (escalationLevel = COMMITTEE)

  getByAudit(auditId, orgId, filters): lista con conteo de días restantes

  getOverdueByOrg(orgId): para dashboard CAE, agrupados por severidad

  getRecurringFindings(orgId): hallazgos que aparecen >1 vez en la misma entidad

  checkRecurrence(findingId, auditEntityId):
    - Busca hallazgos similares (mismo título aproximado o mismo proceso + severidad)
    - Si encuentra, marca isRecurring = true, vincula previousFindingId

TypeScript estricto. Prisma. Manejo de errores con mensajes descriptivos.
```

---

## TAREA 1.11 — Portal del Auditado — Backend + Frontend
**⏱ 90 min | 🟠 CLAUDE CODE**

```
Implementa el sistema completo del Portal del Auditado.

BACKEND (apps/api/src/pbc-requests/):
PbcRequestService:
  create(dto, auditId, createdBy):
    - Genera portalToken único (UUID + hash)
    - Estado: PENDING
    - Envía email al auditado con link al portal (usar Resend)

  submitEvidence(requestId, token, fileUrls[]):
    - Valida que el token corresponda a la solicitud (sin auth completa)
    - PENDING → SUBMITTED, registra submittedAt

  acceptEvidence(requestId, reviewerId): SUBMITTED → ACCEPTED
  rejectEvidence(requestId, reviewerId, reason): SUBMITTED → REJECTED → PENDING

  addMessage(requestId, token, content, isAuditor, attachmentUrls[]):
    - Chat por solicitud (funciona con token para el auditado, con JWT para auditor)

  getPortalSummary(token):
    - Retorna: datos del proyecto, TODAS las solicitudes del proyecto,
      hallazgos asignados al auditado, fechas clave
    - Sin autenticación completa — solo valida el token

  getBulkStatus(auditId): resumen % completitud para dashboard del proyecto

  markOverdue(orgId): job que marca solicitudes vencidas

FRONTEND PORTAL (apps/portal/src/app/[token]/):
  layout.tsx: layout del portal sin sidebar del sistema, con branding AuditMind
  page.tsx (dashboard): bienvenida, KPIs de solicitudes, próximos vencimientos
  requests/page.tsx: lista completa con drag&drop de archivos para subir evidencias
  requests/[id]/page.tsx: detalle con chat y carga de archivos
  findings/page.tsx: hallazgos asignados con formulario de plan de acción

  Componentes:
  - RequestCard.tsx: tarjeta con estado coloreado, dueDate, botón subir
  - FileUploadZone.tsx: drag & drop con preview de archivos, límite 50MB
  - PortalChat.tsx: chat por solicitud estilo WhatsApp Business
  - FindingCard.tsx: hallazgo con severidad y formulario de plan de acción

UI profesional, mobile-first, en español. Sin Supabase Auth — solo token validation.
Muestra código completo de todos los archivos.
```

---

## TAREA 1.12 — Sub-módulo de Confirmaciones Externas (NIA 505)
**⏱ 45 min | 🟠 CLAUDE CODE**

```
Implementa el sub-módulo de Confirmaciones Externas (NIA 505) en NestJS.

ExternalConfirmationsService:
  create(auditId, dto):
    - Tipos: BANK (saldos, préstamos, garantías), CLIENT (cuentas por cobrar),
             LAWYER (litigios contingentes), SUPPLIER (cuentas por pagar)
    - Estado: DRAFT
    - Genera carta de confirmación en formato Word usando parámetros del dto

  send(id, userId):
    - DRAFT → SENT
    - Registra sentAt y sentBy
    - Envía email al respondent via Resend con la carta adjunta
    - Programa alerta automática si no hay respuesta en 15 días

  recordResponse(id, token, responseContent, amount?):
    - SENT → RECEIVED
    - Si amount difiere del amount original: calcula difference
    - Si difference > materialidad del audit: flag automático

  reconcileDifference(id, explanation):
    - RECEIVED → RECONCILED si la diferencia tiene explicación válida

  activateAlternativeProcedure(id, procedure):
    - Cuando no hay respuesta en 45 días: SENT → NO_RESPONSE
    - Registra el procedimiento alternativo ejecutado → ALT_PROCEDURE

  getBulkStatus(auditId):
    - Total, enviadas, recibidas, diferencias sin conciliar, sin respuesta
    - Alertas de vencimiento (15, 30, 45 días desde envío)

  getIndexedForExpediente(auditId):
    - Todas las confirmaciones con tick mark © en los saldos verificados
    - Agrupadas por tipo, listas para el índice D del expediente

Cada confirmación queda en el índice D-confirmaciones del expediente.
TypeScript. Prisma. Código completo.
```

---

# FASE 1D — DASHBOARDS Y CIERRE DEL MVP
> **Semana 4 — 8-10 horas**

---

## TAREA 1.13 — Capa de comunicación frontend → API
**⏱ 45 min | 🟠 CLAUDE CODE**

```
Crea la capa de comunicación entre Next.js y NestJS en apps/web/src/lib/api/.

1. client.ts — cliente HTTP base:
   - Usa fetch nativo de Next.js 15 (no axios)
   - Función apiClient(endpoint, options) que:
     * Obtiene el JWT de Supabase Auth automáticamente
     * Agrega Authorization: Bearer {token}
     * Maneja 401 → redirige a /login
     * Maneja errores con tipos tipados
     * Retorna datos tipados con genérico <T>
   - Variante para Server Components (usa createServerClient)
   - Variante para Client Components (usa createBrowserClient)

2. hooks/ — React Query hooks para cada módulo:
   - useAuditUniverse(filters?) + useAuditEntity(id)
   - useAuditPlans(year?) + usePlanCoverage(planId)
   - useAudits(filters?) + useAudit(id)
   - useWorkingPapers(auditId) + useWorkingPaper(id)
   - usePbcRequests(auditId) + usePbcBulkStatus(auditId)
   - useFindings(auditId?, filters?) + useFinding(id)
   - useOverdueFindings(orgId)
   - useDashboardCAE(year) + useDashboardManager()
   - useMateriality(auditId) + useAuditRiskModel(auditId)

3. mutations/ — hooks de mutación con invalidación de caché:
   - useCreateFinding() → invalida findings + dashboard
   - useSubmitFinding() → invalida finding
   - useApproveFinding() → invalida finding + dashboard
   - useSubmitPbcEvidence() → invalida pbc-requests
   - useCalculateMateriality() → invalida audit
   - useAddTickMark() → invalida working-paper

QueryClient configurado con:
  - staleTime: 30s para datos de lista
  - staleTime: 5min para datos de referencia (plantillas, universo)
  - refetchOnWindowFocus: false

TypeScript estricto. Tipos de packages/shared. Código completo.
```

---

## TAREA 1.14 — Dashboard principal con KPIs reales
**⏱ 75 min | 🟠 CLAUDE CODE**

```
Implementa el Dashboard principal de AuditMind con datos reales.

BACKEND — DashboardService.getCAEDashboard(orgId, year):
  Retorna en máximo 4 queries Prisma (sin N+1):
  {
    planCoverage: { total, planned, inProgress, completed, percentage }
    findingsByStatus: { draft, inReview, approved, inProgress, closed, overdue }
    findingsBySeverity: { critical, high, medium, low }
    remediationRate: number (% hallazgos CLOSED vs total APPROVED)
    overdueRequests: number
    overdueFindings: number  
    materiality: { auditCount, withMateriality, avgMaterialityAmount }
    teamUtilization: [{ auditorName, committedHours, availableHours, pct }]
    riskTrend: [{ month, critical, high }] (últimos 6 meses)
    recentActivity: last 10 eventos (tipo, descripción, userId, timestamp)
    topRiskEntities: [{ name, riskScore, daysSinceAudit }] (top 5)
  }

FRONTEND — app/dashboard/page.tsx:
  Row 1: 4 KPI Cards (Recharts para mini-sparklines):
  - Cobertura del Plan (% con barra circular)
  - Hallazgos Críticos Abiertos (número con semáforo)
  - Tasa de Remediación (% con tendencia)
  - Solicitudes Vencidas (número con alerta roja si >0)

  Row 2:
  - BarChart: Hallazgos por severidad (Recharts)
  - LineChart: Tendencia de riesgo 6 meses (Recharts)

  Row 3:
  - Tabla: Top 5 Entidades de Mayor Riesgo
  - Tabla: Utilización del equipo con progress bars

  Row 4: Feed de Actividad Reciente con iconos por tipo

  - Loading skeletons mientras carga
  - Empty states con call-to-action si no hay datos
  - Filtro de año en el header
  - Auto-refresh cada 60 segundos

TypeScript. Recharts. shadcn/ui. Código completo.
```

---

## TAREA 1.15 — Seed de datos para demo
**⏱ 45 min | 🟠 CLAUDE CODE**

```
Crea script de seed completo en apps/api/prisma/seed.ts para AuditMind.

Datos a generar (idempotente — puede correr múltiples veces):

ORGANIZACIÓN: "Corporación Demo Internacional S.A." con plan: enterprise

USUARIOS (uno por rol):
- admin@demo.com (ADMIN)
- cae@demo.com (CAE) — con declaración de independencia
- gerente@demo.com (AUDIT_MANAGER)
- senior1@demo.com, senior2@demo.com (SENIOR_AUDITOR)
  - senior1 tiene: CIA certificación, CISA certificación
- auditor1@demo.com, auditor2@demo.com (AUDITOR)
- auditado@demo.com (AUDITEE)

UNIVERSO: 20 entidades variadas con diferentes categorías y risk scores:
  Tesorería (riesgo 85), Compras (riesgo 78), RRHH-Nómina (riesgo 72),
  TI-Infraestructura (riesgo 90), TI-Desarrollo (riesgo 65), Ventas (riesgo 55),
  Cuentas por Cobrar (riesgo 68), Cuentas por Pagar (riesgo 80),
  Activos Fijos (riesgo 45), Inventarios (riesgo 70), Compliance (riesgo 88),
  ESG-Sostenibilidad (riesgo 60), Contratos (riesgo 75), Seguridad Física (riesgo 50),
  BCP/DRP (riesgo 85), Proyectos TI (riesgo 73), Auditoría Interna QAIP (riesgo 40),
  Relaciones con Partes Relacionadas (riesgo 82), Presupuesto (riesgo 58), Fiscal (riesgo 77)

PLAN ANUAL 2026: aprobado, con 10 auditorías planificadas

AUDITORÍAS ACTIVAS (3):
1. "Auditoría de Procesos de Compras" — IN_PROGRESS
   - Materialidad calculada: MG=$50,000, ME=$37,500
   - Modelo de riesgo: RI=HIGH, RC=MODERATE, RD=0.30
   - 5 papeles de trabajo (A-1, B-1, C-1, C-2, D-1)
   - 3 hallazgos: 1 CRITICAL (score 85), 1 HIGH (score 72), 1 MEDIUM (score 65)
   - 4 solicitudes PBC en diferentes estados
   - 2 confirmaciones externas enviadas

2. "Auditoría de Infraestructura TI" — PLANNING
   - 3 solicitudes PBC pendientes

3. "Auditoría Financiera Q4 2025" — CLOSED
   - Informe final generado
   - 5 hallazgos cerrados con planes de acción

Usa @faker-js/faker para datos variables. Genera contraseñas con Supabase Admin.
```

---

# FASE 2 — ANALYTICS, REPORTERÍA Y DASHBOARDS AVANZADOS
> **Meses 2-4**

| Tarea | Descripción | Prompt Clave |
|---|---|---|
| 2.1 | Motor CAATs — Análisis de Libro Mayor | GL segmentación, asientos manuales, fuera de horario, reversiones |
| 2.2 | Motor CAATs — Cuentas por Pagar | Proveedores duplicados, facturas duplicadas, montos redondos, gaps |
| 2.3 | Motor CAATs — Nómina | Empleados fantasma, cambios sin aprobación, pagos fuera de ciclo |
| 2.4 | Ley de Benford automática | Chi-cuadrado, nivel de confianza, reporte de desviaciones |
| 2.5 | Detección de anomalías ML | Isolation Forest + Z-Score + IQR en FastAPI Python |
| 2.6 | Conector SAP vía RFC/BAPI | Extracción segura GL, CxP, activos, nómina |
| 2.7 | Conector API REST genérico | Para QuickBooks, Netsuite, Oracle ERP Cloud |
| 2.8 | Agente Vulcano — ETL | Ingesta, transformación, normalización, sincronización incremental |
| 2.9 | Motor de Reportería | Generación automática PDF/Word/PowerPoint con datos vinculados |
| 2.10 | Dashboards por rol (Gerente, Auditor) | Componentes React con drill-down hasta transacción |
| 2.11 | Meilisearch — Búsqueda full-text | Índice de hallazgos, papeles, reportes — búsqueda <50ms |
| 2.12 | Sistema de Notificaciones Novu | Multi-canal: email, in-app, Slack webhooks |

---

## PROMPT CLAVE FASE 2 — Motor CAATs Python (FastAPI)

```
Implementa el servicio de analytics CAATs en apps/ai-service/ con FastAPI y Python.

ESTRUCTURA:
  ai_service/
    routers/
      analytics.py      → endpoints de análisis
      rag.py           → endpoints RAG
      agents.py        → endpoints agentes IA
    services/
      caats/
        gl_analysis.py       → análisis libro mayor
        ap_analysis.py       → cuentas por pagar
        payroll_analysis.py  → nómina
        benford.py           → Ley de Benford
        anomaly_detection.py → ML detección anomalías

ENDPOINTS para analytics.py:
  POST /analytics/gl-analysis: {auditId, data: [...], params}
  POST /analytics/ap-duplicates: {auditId, invoices: [...]}
  POST /analytics/benford: {auditId, amounts: [...]}
  POST /analytics/anomaly-detection: {auditId, transactions: [...]}
  GET /analytics/results/{jobId}: obtiene resultados del análisis

IMPLEMENTA en gl_analysis.py:
  def analyze_general_ledger(transactions: list[dict]) -> dict:
    Ejecuta:
    1. Asientos manuales de alto riesgo (top_level_source != 'AUTO')
    2. Asientos fuera de horario laboral (timestamp hora < 8 o > 19)
    3. Asientos sin descripción o con keywords sospechosos
       (keywords: "ajuste", "corrección", "varios", "misc", "test")
    4. Reversiones inusuales en el mismo período
    5. Concentración: >30% del total en un solo cuenta o centro de costo
    6. Segmentación por tipo, período y centro de costo

    Retorna por cada análisis: [
      { transaction_id, amount, date, description, risk_score, reason, anomaly_type }
    ] ordenado por risk_score desc

IMPLEMENTA en benford.py:
  def benford_analysis(amounts: list[float]) -> dict:
    - Calcula distribución de primeros dígitos de los amounts
    - Compara con distribución Benford esperada
    - Calcula chi-cuadrado y p-value
    - Identifica dígitos con desviación significativa (>5% del esperado)
    - Retorna: { expected, actual, chi_square, p_value, significant_deviations, confidence }

IMPLEMENTA en anomaly_detection.py:
  def detect_anomalies_isolation_forest(transactions: list[dict]) -> list:
    - Usa sklearn IsolationForest con contamination=0.05
    - Features: amount, hour_of_day, day_of_week, approver_code (encoded)
    - Retorna las transacciones anómalas con anomaly_score

  def detect_anomalies_zscore(transactions: list[dict], threshold=3.0) -> list:
    - Z-Score por amount y por grupo (cuenta contable)
    - Retorna outliers con su z-score

Usa pandas, numpy, scikit-learn. Async donde sea posible. Código completo.
```

---

# FASE 3 — MOTOR IA, AGENTES Y RAG
> **Meses 4-7**

---

## PROMPT FASE 3 — LLM Router con Fallback

```
Implementa el LLM Router de AuditMind en apps/ai-service/services/llm_router.py.

CONCEPTO: Capa de abstracción que enruta cada tipo de tarea al modelo óptimo,
con fallback automático si el modelo primario falla.

ROUTING MAP (basado en tipo de tarea):
  NARRATIVE_DRAFT: claude-opus-4-7 → claude-sonnet-4-6 (fallback)
  FINDING_IMPROVEMENT: claude-sonnet-4-6 → claude-haiku-4-5 (fallback)
  RAG_QUERY: claude-haiku-4-5 → claude-sonnet-4-6 (fallback)
  RISK_ANALYSIS: claude-opus-4-7 → claude-sonnet-4-6 (fallback)
  AUDIT_PROGRAM: claude-sonnet-4-6 → claude-haiku-4-5 (fallback)
  TRANSLATION: claude-haiku-4-5 (solo)
  CONVERSATION: claude-sonnet-4-6 → claude-haiku-4-5 (fallback)
  DATA_INTERPRETATION: claude-sonnet-4-6 → claude-haiku-4-5 (fallback)
  COMPLIANCE_CHECK: claude-opus-4-7 → claude-sonnet-4-6 (fallback)

IMPLEMENTA LLMRouter:
  class LLMRouter:
    def route(task_type: str, prompt: str, context: dict, org_id: str) -> LLMResponse:
      1. Selecciona modelo primario según ROUTING_MAP
      2. Intenta llamada con manejo de timeout (30s)
      3. Si falla: intenta con modelo de fallback
      4. Registra en llm_router_log: modelo usado, tokens, latencia, ¿fallback?
      5. En response: incluye model_used, fallback_used, explanation_required=True

    def route_with_rag(task_type, prompt, org_id, rag_bases: list[str]) -> LLMResponse:
      1. Recupera chunks relevantes de pgvector (función match_knowledge)
      2. Construye context window con: sistema_prompt + chunks_rag + user_prompt
      3. Enruta al modelo óptimo para la tarea
      4. Retorna respuesta con sources (referencias normativas citadas)

EXPLAINABILITY OBLIGATORIO:
  Cada respuesta del LLM Router incluye:
  - model_used: nombre del modelo
  - fallback_used: boolean
  - rag_sources: lista de fuentes normativas usadas (si aplica)
  - confidence_note: nota del modelo sobre su nivel de certeza
  - human_review_required: True si es decisión crítica

LOGGING en Supabase (tabla llm_router_log):
  Cada llamada registra: org_id, task_type, model_selected, fallback_used,
  tokens_used, cost_usd (estimado), success, error_msg, latency_ms, created_at

Usa anthropic SDK. Async/await. Código completo con tipos.
```

---

## PROMPT FASE 3 — Agente Scriptorium (Papeles de Trabajo)

```
Implementa el Agente Scriptorium en apps/ai-service/agents/scriptorium.py.

MISIÓN: Redactor y documentador inteligente de papeles de trabajo. Genera borradores
profesionales basados en la evidencia cargada y el contexto del proyecto.

CAPACIDADES A IMPLEMENTAR:

1. generate_working_paper_draft(audit_context, paper_type, evidence_files):
   - Recibe: contexto del proyecto (tipo, entidad, riesgos identificados),
     tipo de papel (PT-PL, PT-EC, PT-PS, PT-AD, PT-HF, PT-CC)
   - Usa LLM Router con task_type=NARRATIVE_DRAFT
   - Genera estructura JSON con todos los campos del papel según su tipo
   - Para PT-HF (Hallazgo): genera condición, criterio, causa, efecto, riesgo,
     recomendación en lenguaje profesional de auditoría

2. generate_finding_draft(condition_brief, evidence, project_context, rag_bases):
   - Recibe descripción básica del hallazgo
   - Consulta RAG para encontrar el criterio normativo aplicable
   - Genera el hallazgo completo con estructura: C-C-C-E-R-R
   - Retorna con normativeReference, normativeArticle, suggestedSeverity
   - Incluye justificación de la severidad sugerida

3. improve_finding(finding_data, project_context, rag_bases):
   - "Mejorar con IA": recibe borrador básico, lo reescribe profesionalmente
   - Mantiene los hechos del auditor, mejora: precisión del lenguaje,
     estructura lógica, vinculación normativa, especificidad de la recomendación
   - Retorna versión mejorada + diff con los cambios principales

4. generate_normative_analysis_paper(document_chunks, document_title):
   - Recibe chunks de un documento normativo recién cargado
   - Genera paper PT de Análisis Normativo con:
     * Resumen ejecutivo, obligaciones, prohibiciones, plazos
     * Controles mínimos requeridos
     * Riesgos de incumplimiento
     * Recomendaciones de procedimientos de auditoría

5. check_completeness(working_papers_list, audit_program):
   - Checklist de 40+ puntos de completitud del expediente
   - Retorna: ítems cumplidos, ítems pendientes, bloqueadores antes del cierre

Todos los outputs incluyen: generated_by="scriptorium", model_used, timestamp,
human_review_required=True. Código completo con FastAPI router endpoint.
```

---

## PROMPT FASE 3 — RAG Pipeline (Procesamiento de PDFs)

```
Implementa el pipeline RAG completo en apps/ai-service/services/rag_pipeline.py.

FLUJO COMPLETO:
  1. Recibe archivo PDF/Word/TXT (hasta 100MB)
  2. Extrae texto: pdfplumber para PDFs digitales, pytesseract para escaneados
  3. Divide en chunks semánticos: 600 tokens con solapamiento 150 tokens
  4. Genera embeddings con OpenAI text-embedding-3-small (1536 dims)
  5. Guarda chunks + vectores en pgvector (Supabase tabla knowledge_chunks)
  6. Actualiza knowledge_documents con status=READY y chunk_count
  7. Dispara generate_normative_analysis_paper del Agente Scriptorium

CHUNKING INTELIGENTE:
  - Respeta límites de párrafos y secciones (no corta a mitad de oración)
  - Metadata por chunk: doc_id, org_id, rag_base, chunk_index,
    section_title (si detecta headers), page_number
  - Para documentos IIA/COBIT/ISO: detecta y etiqueta número de estándar/control

BÚSQUEDA VECTORIAL (función match_knowledge):
  def search_knowledge(query: str, org_id: str, rag_bases: list[str],
                       top_k: int = 8, threshold: float = 0.75) -> list[Chunk]:
  1. Genera embedding del query
  2. Llama función SQL match_knowledge en Supabase
  3. Reranking: usa CrossEncoder si está disponible, sino ordena por cosine similarity
  4. Retorna chunks con: content, source_title, section, similarity_score, metadata

BÚSQUEDA HÍBRIDA:
  - 70% vector similarity + 30% BM25 keyword matching
  - Si el query contiene número de artículo (ej: "artículo 15"), prioriza búsqueda keyword

ENDPOINTS en routers/rag.py:
  POST /rag/upload: recibe archivo, procesa, retorna doc_id
  GET /rag/status/{doc_id}: estado del procesamiento
  POST /rag/search: query + rag_bases + org_id → chunks relevantes
  DELETE /rag/document/{doc_id}: elimina documento y sus chunks

Async. Manejo de errores robusto. Código completo.
```

---

# FASE 4 — INTEGRACIONES ENTERPRISE
> **Meses 7-10**

| Tarea | Descripción |
|---|---|
| 4.1 | SSO SAML 2.0 con Azure AD, Okta, Google Workspace |
| 4.2 | API pública REST documentada con Swagger/OpenAPI |
| 4.3 | Conector SAP S/4HANA via RFC/BAPI certificado |
| 4.4 | Microsoft 365/Teams — notificaciones + adjuntos SharePoint |
| 4.5 | Power BI / Tableau — conectores certificados |
| 4.6 | Modo offline PWA + IndexedDB (F-07) |
| 4.7 | Grabador de entrevistas con Whisper + Speaker Diarization (F-08) |
| 4.8 | Skills Marketplace — arquitectura y primeros 4 Skills base |

---

# FASE 5 — IA AVANZADA, QAIP Y COMITÉ
> **Meses 10-14**

| Agente/Módulo | Descripción |
|---|---|
| Agente ATLAS | COBIT 2019 (40 obj.) + NIST CSF 2.0 (6 func.) + ISO 27001 (93 ctrl.) |
| Agente FENIX | ISO 22301 BCP/DRP completo + RTO/RPO assessment |
| Agente LEX | Compliance multi-marco + Registro de Excepciones |
| Agente SHERLOCK | Modo Investigación Especial + Árbol ACFE + Cadena de Custodia |
| Agente SENADO | Comité de Auditoría — agendas, actas, informes trimestrales |
| Módulo 13 QAIP | Autoevaluación IIA 2025, evaluaciones externas, charter |
| Módulo 14 Comité | Portal del Comité, declaración de independencia, escalamiento |
| Módulo 15 BCP/DRP | BIA, estrategias de continuidad, pruebas, sitio alterno |
| Competencias | Perfil CIA/CISA/CFE, CPE, asignación inteligente por certificación |
| Gobernanza IA | EU AI Act, clasificación de riesgo, logs de IA auditables |

---

## PROMPT FASE 5 — Agente ATLAS (Auditoría TI)

```
Implementa el Agente ATLAS en apps/ai-service/agents/atlas.py.

ROL: Especialista en auditoría de TI con conocimiento profundo de COBIT 2019,
NIST CSF 2.0, ISO 27001:2022, los 16 GTAGs del IIA y frameworks de desarrollo seguro.
Equivalente digital de un auditor con certificación CISA.

CAPACIDADES:

1. generate_it_audit_program(audit_context, frameworks: list[str]):
   - Genera programa de auditoría TI personalizado según:
     * Tipo de sistema (ERP, cloud, legacy, aplicación web, base de datos)
     * Industria (banca, salud, manufactura, gobierno)
     * Frameworks seleccionados: COBIT, NIST, ISO27001
   - Para COBIT: mapea cada procedimiento a un objetivo de los 40 de COBIT 2019
   - Para NIST: cubre las 6 funciones (GV, ID, PR, DE, RS, RC)
   - Para ISO 27001: referencia los controles del Anexo A relevantes

2. evaluate_maturity_response(framework, domain, responses: dict) -> MaturityScore:
   - Recibe respuestas del cuestionario de un dominio COBIT/NIST
   - Evalúa nivel de madurez 1-5 con justificación por componente
   - COBIT: aplica la escala de capacidad CMMI adaptada
   - NIST: aplica tiers 1-4 por función

3. generate_it_finding(control_id, observation, framework, evidence):
   - Genera hallazgo técnico con lenguaje adecuado para informe al Comité
   - Traduce términos técnicos a impacto de negocio comprensible

4. check_bcp_dependency(it_audit_findings):
   - Detecta hallazgos TI con implicaciones de continuidad del negocio
   - Alerta para vincular con el Módulo BCP/DRP

Todos los outputs usan RAG-02 como base de conocimiento.
Usa LLM Router task_type=RISK_ANALYSIS para evaluaciones, NARRATIVE_DRAFT para programas.
Código completo con endpoints FastAPI.
```

---

## PROMPT FASE 5 — Árbol ACFE + Modo Investigación Forense

```
Implementa el sistema anti-fraude completo en AuditMind.

PARTE 1: apps/ai-service/agents/sherlock.py — Agente Sherlock
ROL: Experto en investigación de fraude según estándares ACFE y técnicas forenses digitales.
SOLO se activa en audits con isInvestigationMode=true.

Árbol ACFE implementado (3 ramas, 9 categorías, 41 esquemas):
  MISAPPROPRIATION_OF_ASSETS (87% de casos):
    - Cash: robo en caja, esquemas de facturación ficticia, nómina fantasma,
             gastos de representación falsos, hurto de caja chica
    - Non-Cash: robo de inventario, robo de activos fijos, uso indebido

  FINANCIAL_STATEMENT_FRAUD (10%):
    - Overstatement: reconocimiento prematuro de ingresos, valuación inapropiada
    - Understatement: omisión de pasivos, manipulación de provisiones
    - Improper_Disclosure: partes relacionadas no divulgadas

  CORRUPTION (38%):
    - Conflict_of_Interest: proveedores vinculados a empleados
    - Bribery: pagos a funcionarios, comisiones ocultas
    - Economic_Extortion: presión a proveedores para beneficios

def analyze_for_fraud(transactions, entities, employees, payments) -> FraudAnalysis:
  - Aplica el árbol ACFE como framework de análisis
  - Red flags implementados como reglas:
    * Empleado con estilo de vida inconsistente con salario → flag LIFESTYLE
    * Proveedor con misma dirección/teléfono/email que empleado → flag VENDOR_EMPLOYEE
    * Facturas con números secuenciales del mismo proveedor → flag SHELL_COMPANY
    * Pagos justo bajo el umbral de aprobación (80-99% del límite) → flag THRESHOLD_EVASION
    * Empleado que nunca toma vacaciones → flag NO_VACATION
    * Ajustes de inventario por misma persona y fuera de horario → flag INVENTORY_FRAUD
    * Alta concentración en proveedor nuevo sin proceso competitivo → flag SOLE_SOURCE
  - Para cada flag: tipología ACFE probable + técnicas de investigación adicionales

PARTE 2: apps/api/src/audits/ — Modo Investigación Especial

InvestigationModeService:
  activateInvestigationMode(auditId, requestedByCAEId):
    - Requiere aprobación del CAE con MFA
    - Aplica restricciones especiales al audit:
      * acceso solo a team members explícitos + CAE
      * desactiva notificaciones automáticas al auditado (Agente Hermes suspendido)
      * habilita modo append-only en todos los papeles
      * activa logging forense

  receiveForensicEvidence(auditId, fileBuffer, custodianId):
    - Calcula hash SHA-256 del archivo al momento de ingreso
    - Registra: hash, timestamp, IP del subidor, custodian
    - Almacena en Supabase Storage con path aislado /forensic/{auditId}/
    - Genera entrada en custody_chain con todos los datos
    - El archivo NO puede ser modificado o eliminado después

  getCustodyChain(auditId): registro completo de evidencias con hashes

  generateIntegrityCertificate(auditId):
    - Documento PDF con hash de cada pieza de evidencia
    - Firmado digitalmente por el sistema
    - Puede presentarse como prueba de no alteración

  generateForensicReport(auditId): informe con estructura legal
    (hechos, evidencias, timeline, personas, impacto económico, recomendaciones)

TypeScript + NestJS + Python. Código completo.
```

---

# FASE 6 — DIFERENCIACIÓN Y ESG
> **Meses 14-18**

| Tarea | Descripción |
|---|---|
| 6.1 | Módulo ESG completo (GRI, SASB, TCFD, CSRD) |
| 6.2 | Benchmark sectorial con datos públicos |
| 6.3 | Simulador de escenarios de riesgo |
| 6.4 | ROI Calculator de auditoría |
| 6.5 | Mobile app con React Native (offline-first) |
| 6.6 | Modelos propios fine-tuned en datos de auditoría |
| 6.7 | Certificación SOC 2 Type II |
| 6.8 | Integración DORA (Digital Operational Resilience Act) |

---

# CRITERIOS DE ÉXITO POR FASE

| Fase | Métrica | Target |
|---|---|---|
| Fase 1 MVP | Primera organización usando el sistema end-to-end | 1 cliente piloto al mes 4 |
| Fase 2 Analytics | Reducción de tiempo de análisis de datos vs manual | 80% reducción |
| Fase 3 IA Base | % borradores de hallazgos aprobados sin cambios mayores | 60% aceptación directa |
| Fase 4 Integraciones | Conectores activos con ERPs de clientes | 5+ organizaciones conectadas |
| Fase 5 IA Avanzada | Precisión Agente Argus en detección de anomalías | Precisión >85% |
| Fase 6 Diferenciación | Net Promoter Score (NPS) de usuarios | NPS > 50 |

---

# ÍNDICE DE LOS 15 MÓDULOS

| # | Módulo | Fase MVP | Agentes IA | RAG Bases |
|---|---|---|---|---|
| 01 | Administración y Seguridad | Fase 1 | — | — |
| 02 | Universo de Auditoría | Fase 1 | Minerva | RAG-01 |
| 03 | Planificación Inteligente | Fase 1 | Minerva | RAG-01 |
| 04 | Evaluación de Riesgos | Fase 1 | Minerva, Cassandra | RAG-01, RAG-09 |
| 05 | Ejecución de Auditoría | Fase 1 | Scriptorium | RAG-07, RAG-08 |
| 06 | Portal del Auditado | Fase 1 | Hermes | — |
| 07 | Hallazgos y Recomendaciones | Fase 1 | Scriptorium, Cicero | RAG-07, RAG-08 |
| 08 | Analytics de Datos | Fase 2 | Argus, Vulcano | RAG-05 |
| 09 | Reportería Inteligente | Fase 2 | Cicero | RAG-01, RAG-08 |
| 10 | Dashboards y KPIs | Fase 2 | Minerva, Socrates | — |
| 11 | Motor IA y Agentes | Fase 3 | Todos | Todos |
| 12 | ESG y Sostenibilidad | Fase 6 | Lex, Cassandra | RAG-09 |
| 13 | QAIP y Calidad (NUEVO) | Fase 5 | Minerva-QAIP, Senado | RAG-01 |
| 14 | Comité de Auditoría (NUEVO) | Fase 5 | Senado | RAG-01 |
| 15 | BCP/DRP (NUEVO) | Fase 5 | Fenix | RAG-03 |

---

# ÍNDICE DE LOS 14 AGENTES IA

| Agente | Especialidad | Fase | RAG Principal |
|---|---|---|---|
| **Minerva** | Análisis de riesgo + estrategia CAE | Fase 3 | RAG-01 |
| **Scriptorium** | Papeles de trabajo + hallazgos + normativa | Fase 3 | RAG-07, RAG-08 |
| **Argus** | Detección de anomalías + árbol ACFE | Fase 3 | RAG-05 |
| **Hermes** | Coordinación PBC + solicitudes | Fase 3 | — |
| **Cicero** | Reportería ejecutiva + informes | Fase 3 | RAG-01, RAG-08 |
| **Socrates** | Asistente conversacional (Athena/Hermes/Minerva) | Fase 3 | Todos |
| **Cassandra** | Predicción + vigilancia regulatoria | Fase 3 | RAG-04, RAG-06 |
| **Vulcano** | Integraciones + ETL | Fase 2 | — |
| **SENADO** (nuevo) | Comité de Auditoría | Fase 5 | RAG-01 |
| **ATLAS** (nuevo) | Auditoría TI COBIT/NIST/ISO 27001 | Fase 5 | RAG-02 |
| **FENIX** (nuevo) | Continuidad del negocio BCP/DRP | Fase 5 | RAG-03 |
| **LEX** (nuevo) | Compliance multi-marco | Fase 5 | RAG-04 |
| **SHERLOCK** (nuevo) | Fraude forense + investigación especial | Fase 5 | RAG-05 |
| **Minerva-QAIP** (sub) | QAIP + IIA 2025 | Fase 5 | RAG-01 |

---

# ANATOMÍA DEL PROMPT PERFECTO PARA CLAUDE

```
1. ROL + CONTEXTO ESPECÍFICO
"Eres un arquitecto senior de software especializado en sistemas SaaS enterprise
multi-tenant con NestJS, Next.js 15 y PostgreSQL."

2. DESCRIPCIÓN DEL SISTEMA (siempre incluir)
"El sistema es AuditMind — SaaS de auditoría con monorepo Turborepo:
apps/api (NestJS), apps/web (Next.js 15 App Router), apps/ai-service (FastAPI).
Base de datos: Supabase PostgreSQL con Prisma ORM y RLS multi-tenant."

3. TAREA ESPECÍFICA Y COMPLETA
"Implementa el módulo completo de X con estos métodos exactos: [lista detallada]."

4. RESTRICCIONES TÉCNICAS
"TypeScript estricto, sin `any`. Usa Prisma para BD. HttpException con mensajes
descriptivos. No uses librerías que no estén en el package.json del proyecto."

5. FORMATO DE RESPUESTA
"Muestra el código completo de cada archivo con todos los imports. No omitas
partes con comentarios // resto del código."
```

---

# PROMPTS DE RECUPERACIÓN

| Situación | Acción |
|---|---|
| Error TypeScript que no compila | "Tengo este error: [error]. Archivo: [nombre]. Sistema: AuditMind [descripción breve]. Dame el código corregido completo, no solo el fragmento." |
| Bug de lógica no encontrado | "Tengo este bug: [comportamiento]. Código relevante: [pega código]. Analiza paso a paso y dame corrección con causa raíz." |
| Contexto perdido en conversación larga | "Sistema: AuditMind [descripción]. Ya implementamos: [lista]. Necesito completar: [tarea]. Código actual: [pega código]." |
| Error de Prisma en seed | "Error Prisma: [error]. Schema relevante: [modelo]. Código que falla: [código]. Corrige considerando las relaciones." |
| RLS bloqueando requests legítimos | "RLS bloquea este request: [descripción]. JWT contiene: [claims]. Política SQL actual: [SQL]. Corrige sin comprometer el aislamiento." |

---

*AuditMind Intelligence Platform — Plan de Trabajo v4.0*
*Documento vivo — se actualiza con cada fase completada*
*Score objetivo: 91/100 — Competitivo Enterprise*
