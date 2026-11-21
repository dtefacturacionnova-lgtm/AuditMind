-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Planes y suscripciones — Etapa 1: núcleo (docs/suscripciones-y-planes-propuesta.md, §4, §10 y §11)
-- Cambio ADITIVO: 3 tipos y 5 tablas nuevas + planes semilla + una suscripción para cada organización que ya existe.
-- Con el interruptor en OFF (billing_settings.enforcementMode, por defecto) NADA se bloquea: el sistema se comporta igual que antes.
-- Las organizaciones actuales quedan en el plan PILOTO (Empresa Demo en INTERNO), exentas y sin vencimiento.
-- NO usar `prisma db push` (intenta borrar rag_chunks/rag_documents): aplicar este SQL.
-- Reversa: 2026-11-suscripciones-1-nucleo.REVERSA.sql
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TYPE "BillingAudience"    AS ENUM ('PERSONA', 'EMPRESA');
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIAL', 'ACTIVE', 'GRACE', 'READ_ONLY', 'SUSPENDED', 'CANCELLED');
CREATE TYPE "EnforcementMode"    AS ENUM ('OFF', 'OBSERVE', 'ENFORCE');

-- ── Planes (datos editables por el superadmin) ──
CREATE TABLE "billing_plans" (
  "id"          TEXT NOT NULL,
  "code"        TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "audience"    "BillingAudience" NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "isPublic"    BOOLEAN NOT NULL DEFAULT true,
  "featured"    BOOLEAN NOT NULL DEFAULT false,
  "active"      BOOLEAN NOT NULL DEFAULT true,
  "sortOrder"   INTEGER NOT NULL DEFAULT 0,
  "trialDays"   INTEGER NOT NULL DEFAULT 14,
  "limits"      JSONB NOT NULL DEFAULT '{}',
  "modules"     TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "functions"   TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "assistants"  TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "billing_plans_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "billing_plans_trial_chk" CHECK ("trialDays" BETWEEN 0 AND 365)
);
CREATE UNIQUE INDEX "billing_plans_code_key" ON "billing_plans"("code");

-- ── Precio del plan por duración de licencia (1, 3, 6, 12 meses; 0 = sin vencimiento) ──
CREATE TABLE "billing_plan_prices" (
  "id"        TEXT NOT NULL,
  "planId"    TEXT NOT NULL,
  "months"    INTEGER NOT NULL,
  "priceUsd"  DECIMAL(10,2) NOT NULL,
  "active"    BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "billing_plan_prices_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "billing_plan_prices_months_chk" CHECK ("months" IN (0, 1, 3, 6, 12)),
  CONSTRAINT "billing_plan_prices_price_chk" CHECK ("priceUsd" >= 0)
);
CREATE UNIQUE INDEX "billing_plan_prices_planId_months_key" ON "billing_plan_prices"("planId", "months");
ALTER TABLE "billing_plan_prices" ADD CONSTRAINT "billing_plan_prices_planId_fkey"
  FOREIGN KEY ("planId") REFERENCES "billing_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Suscripción de cada organización (una sola), con la INSTANTÁNEA del plan al contratar ──
CREATE TABLE "billing_subscriptions" (
  "id"                 TEXT NOT NULL,
  "organizationId"     TEXT NOT NULL,
  "planId"             TEXT NOT NULL,
  "planSnapshot"       JSONB NOT NULL,
  "status"             "SubscriptionStatus" NOT NULL DEFAULT 'TRIAL',
  "months"             INTEGER NOT NULL DEFAULT 0,
  "priceUsd"           DECIMAL(10,2),
  "agreedPriceUsd"     DECIMAL(10,2),
  "startedAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "currentPeriodStart" TIMESTAMP(3),
  "currentPeriodEnd"   TIMESTAMP(3),
  "trialEndsAt"        TIMESTAMP(3),
  "cancelRequestedAt"  TIMESTAMP(3),
  "extraUsers"         INTEGER NOT NULL DEFAULT 0,
  "overrides"          JSONB NOT NULL DEFAULT '{}',
  "exempt"             BOOLEAN NOT NULL DEFAULT false,
  "notes"              TEXT,
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3) NOT NULL,
  CONSTRAINT "billing_subscriptions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "billing_subscriptions_months_chk" CHECK ("months" IN (0, 1, 3, 6, 12)),
  CONSTRAINT "billing_subscriptions_extra_chk" CHECK ("extraUsers" >= 0)
);
CREATE UNIQUE INDEX "billing_subscriptions_organizationId_key" ON "billing_subscriptions"("organizationId");
CREATE INDEX "billing_subscriptions_status_idx" ON "billing_subscriptions"("status");
CREATE INDEX "billing_subscriptions_planId_idx" ON "billing_subscriptions"("planId");
ALTER TABLE "billing_subscriptions" ADD CONSTRAINT "billing_subscriptions_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "billing_subscriptions" ADD CONSTRAINT "billing_subscriptions_planId_fkey"
  FOREIGN KEY ("planId") REFERENCES "billing_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── Parámetros de la plataforma (una sola fila) ──
CREATE TABLE "billing_settings" (
  "id"               TEXT NOT NULL,
  "enforcementMode"  "EnforcementMode" NOT NULL DEFAULT 'OFF',
  "graceDays"        INTEGER NOT NULL DEFAULT 7,
  "readOnlyDays"     INTEGER NOT NULL DEFAULT 60,
  "reminderDays"     INTEGER[] NOT NULL DEFAULT ARRAY[7, 1],
  "costPerRequestUsd" DECIMAL(10,6) NOT NULL DEFAULT 0.0012,
  "safetyMultiplier" DECIMAL(4,2) NOT NULL DEFAULT 3,
  "weights"          JSONB NOT NULL DEFAULT '{"light": 1, "medium": 5, "heavy": 10}',
  "ivaPercent"       DECIMAL(5,2),
  "defaultPlanCode"  TEXT NOT NULL DEFAULT 'EMPRESA_DESPACHO',
  "paymentInstructions" JSONB NOT NULL DEFAULT '{}', -- QR 365, datos bancarios… lo que ve el cliente al pagar (etapa 2)
  "updatedById"      TEXT,
  "updatedAt"        TIMESTAMP(3) NOT NULL,
  CONSTRAINT "billing_settings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "billing_settings_days_chk" CHECK ("graceDays" BETWEEN 0 AND 90 AND "readOnlyDays" BETWEEN 0 AND 365)
);

-- ── Registro de actividad: quién, cuándo y qué cambió ──
CREATE TABLE "billing_events" (
  "id"             TEXT NOT NULL,
  "organizationId" TEXT,
  "actorId"        TEXT,
  "type"           TEXT NOT NULL,
  "data"           JSONB NOT NULL DEFAULT '{}',
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "billing_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "billing_events_organizationId_createdAt_idx" ON "billing_events"("organizationId", "createdAt");
CREATE INDEX "billing_events_createdAt_idx" ON "billing_events"("createdAt");

-- ── Datos semilla: planes y precios (los precios son hipótesis a validar; el superadmin los edita sin desplegar) ──
INSERT INTO "billing_plans" ("id", "code", "name", "audience", "description", "isPublic", "featured", "active", "sortOrder", "trialDays",
  "limits", "modules", "functions", "assistants", "createdAt", "updatedAt") VALUES
  ('plan_persona_inicial', 'PERSONA_INICIAL', 'Persona Inicial', 'PERSONA', 'CPA o auditor independiente que está empezando.', true, false, true, 10, 14,
   '{"users": 1, "maxUsers": 1, "extraUserPriceUsd": 0, "storageGb": 10, "maxFileMb": 100, "aiRequests": 500, "fileTypes": ["AUDIO", "PDF", "FOTO", "PPT", "XLS", "OTROS"], "packsAi": true, "packsStorage": true}'::jsonb,
   ARRAY['CARTERA', 'RIESGOS', 'REPORTES_IA']::TEXT[], ARRAY[]::TEXT[], ARRAY['MINERVA', 'SCRIPTORIUM', 'ARGUS', 'SOCRATES', 'VULCANO', 'CICERO']::TEXT[], now(), now()),
  ('plan_persona_profesional', 'PERSONA_PROFESIONAL', 'Persona Profesional', 'PERSONA', 'Independiente o consultor con cartera propia.', true, true, true, 20, 14,
   '{"users": 2, "maxUsers": 2, "extraUserPriceUsd": 0, "storageGb": 30, "maxFileMb": 250, "aiRequests": 2000, "fileTypes": ["VIDEO", "AUDIO", "PDF", "FOTO", "PPT", "XLS", "OTROS"], "packsAi": true, "packsStorage": true}'::jsonb,
   ARRAY['PLAN_ANUAL', 'CARTERA', 'HORAS', 'RIESGOS', 'SEGUIMIENTO_EXT', 'REPORTES_IA']::TEXT[], ARRAY['MARCA']::TEXT[], ARRAY['MINERVA', 'CASSANDRA', 'ARGUS', 'SCRIPTORIUM', 'SOCRATES', 'VULCANO', 'CICERO', 'SENADO', 'FISCUS', 'THEMIS']::TEXT[], now(), now()),
  ('plan_empresa_despacho', 'EMPRESA_DESPACHO', 'Empresa Despacho', 'EMPRESA', 'Despacho de auditoría pequeño o mediano.', true, false, true, 30, 14,
   '{"users": 5, "maxUsers": 15, "extraUserPriceUsd": 19, "storageGb": 100, "maxFileMb": 500, "aiRequests": 5000, "fileTypes": ["VIDEO", "AUDIO", "PDF", "FOTO", "PPT", "XLS", "OTROS"], "packsAi": true, "packsStorage": true}'::jsonb,
   ARRAY['CARTERA', 'HORAS', 'RIESGOS', 'SEGUIMIENTO_EXT', 'REPORTES_IA']::TEXT[], ARRAY['FIRMA', 'MARCA']::TEXT[], ARRAY['MINERVA', 'CASSANDRA', 'ARGUS', 'SCRIPTORIUM', 'SOCRATES', 'VULCANO', 'CICERO', 'SENADO', 'FISCUS', 'THEMIS']::TEXT[], now(), now()),
  ('plan_empresa_auditoria_interna', 'EMPRESA_AUDITORIA_INTERNA', 'Empresa Auditoría Interna', 'EMPRESA', 'Departamento de auditoría interna de una empresa.', true, false, true, 40, 14,
   '{"users": 5, "maxUsers": 15, "extraUserPriceUsd": 19, "storageGb": 100, "maxFileMb": 500, "aiRequests": 5000, "fileTypes": ["VIDEO", "AUDIO", "PDF", "FOTO", "PPT", "XLS", "OTROS"], "packsAi": true, "packsStorage": true}'::jsonb,
   ARRAY['PLAN_ANUAL', 'HORAS', 'RIESGOS', 'GOBIERNO', 'SEGUIMIENTO_EXT', 'REPORTES_IA']::TEXT[], ARRAY['FIRMA', 'MARCA']::TEXT[], ARRAY['MINERVA', 'CASSANDRA', 'ARGUS', 'SCRIPTORIUM', 'SOCRATES', 'VULCANO', 'CICERO', 'SENADO', 'FISCUS', 'THEMIS', 'ATLAS', 'FENIX', 'MINERVA_QAIP']::TEXT[], now(), now()),
  ('plan_empresa_plus', 'EMPRESA_PLUS', 'Empresa Plus', 'EMPRESA', 'Firma con varios equipos o grupo de empresas.', true, true, true, 50, 14,
   '{"users": 15, "maxUsers": 50, "extraUserPriceUsd": 15, "storageGb": 500, "maxFileMb": 2048, "aiRequests": 20000, "fileTypes": ["VIDEO", "AUDIO", "PDF", "FOTO", "PPT", "XLS", "OTROS"], "packsAi": true, "packsStorage": true}'::jsonb,
   ARRAY['PLAN_ANUAL', 'CARTERA', 'HORAS', 'RIESGOS', 'GOBIERNO', 'SEGUIMIENTO_EXT', 'REPORTES_IA']::TEXT[], ARRAY['FIRMA', 'MARCA', 'FORENSE', 'CAATS_AVANZADOS']::TEXT[], ARRAY['MINERVA', 'CASSANDRA', 'ARGUS', 'SCRIPTORIUM', 'SOCRATES', 'VULCANO', 'CICERO', 'SENADO', 'FISCUS', 'THEMIS', 'HERMES', 'SHERLOCK', 'ATLAS', 'FENIX', 'MINERVA_QAIP']::TEXT[], now(), now()),
  ('plan_institucional', 'INSTITUCIONAL', 'Institucional', 'EMPRESA', 'Auditoría interna corporativa o gobierno: a convenir.', false, false, true, 60, 30,
   '{"users": 50, "maxUsers": 500, "extraUserPriceUsd": 0, "storageGb": 2000, "maxFileMb": 4096, "aiRequests": 100000, "fileTypes": ["VIDEO", "AUDIO", "PDF", "FOTO", "PPT", "XLS", "OTROS"], "packsAi": true, "packsStorage": true}'::jsonb,
   ARRAY['PLAN_ANUAL', 'CARTERA', 'HORAS', 'RIESGOS', 'GOBIERNO', 'SEGUIMIENTO_EXT', 'REPORTES_IA']::TEXT[], ARRAY['FIRMA', 'MARCA', 'FORENSE', 'CAATS_AVANZADOS']::TEXT[], ARRAY['MINERVA', 'CASSANDRA', 'ARGUS', 'SCRIPTORIUM', 'SOCRATES', 'VULCANO', 'CICERO', 'SENADO', 'FISCUS', 'THEMIS', 'HERMES', 'SHERLOCK', 'ATLAS', 'FENIX', 'MINERVA_QAIP']::TEXT[], now(), now()),
  ('plan_piloto', 'PILOTO', 'Piloto / Fundador', 'EMPRESA', 'Clientes actuales: precio pactado y vigencia explícita.', false, false, true, 70, 0,
   '{"users": 15, "maxUsers": 50, "extraUserPriceUsd": 0, "storageGb": 200, "maxFileMb": 2048, "aiRequests": 20000, "fileTypes": ["VIDEO", "AUDIO", "PDF", "FOTO", "PPT", "XLS", "OTROS"], "packsAi": true, "packsStorage": true}'::jsonb,
   ARRAY['PLAN_ANUAL', 'CARTERA', 'HORAS', 'RIESGOS', 'GOBIERNO', 'SEGUIMIENTO_EXT', 'REPORTES_IA']::TEXT[], ARRAY['FIRMA', 'MARCA', 'FORENSE', 'CAATS_AVANZADOS']::TEXT[], ARRAY['MINERVA', 'CASSANDRA', 'ARGUS', 'SCRIPTORIUM', 'SOCRATES', 'VULCANO', 'CICERO', 'SENADO', 'FISCUS', 'THEMIS', 'HERMES', 'SHERLOCK', 'ATLAS', 'FENIX', 'MINERVA_QAIP']::TEXT[], now(), now()),
  ('plan_interno', 'INTERNO', 'Interno', 'EMPRESA', 'Empresa Demo y cuentas de la plataforma: sin límites ni vencimiento.', false, false, true, 80, 0,
   '{"users": -1, "maxUsers": -1, "extraUserPriceUsd": 0, "storageGb": -1, "maxFileMb": -1, "aiRequests": -1, "fileTypes": ["VIDEO", "AUDIO", "PDF", "FOTO", "PPT", "XLS", "OTROS"], "packsAi": true, "packsStorage": true}'::jsonb,
   ARRAY['PLAN_ANUAL', 'CARTERA', 'HORAS', 'RIESGOS', 'GOBIERNO', 'SEGUIMIENTO_EXT', 'REPORTES_IA']::TEXT[], ARRAY['FIRMA', 'MARCA', 'FORENSE', 'CAATS_AVANZADOS']::TEXT[], ARRAY['MINERVA', 'CASSANDRA', 'ARGUS', 'SCRIPTORIUM', 'SOCRATES', 'VULCANO', 'CICERO', 'SENADO', 'FISCUS', 'THEMIS', 'HERMES', 'SHERLOCK', 'ATLAS', 'FENIX', 'MINERVA_QAIP']::TEXT[], now(), now());

INSERT INTO "billing_plan_prices" ("id", "planId", "months", "priceUsd", "active", "createdAt", "updatedAt") VALUES
  ('price_persona_inicial_1', 'plan_persona_inicial', 1, 29.00, true, now(), now()),
  ('price_persona_inicial_3', 'plan_persona_inicial', 3, 83.00, true, now(), now()),
  ('price_persona_inicial_6', 'plan_persona_inicial', 6, 157.00, true, now(), now()),
  ('price_persona_inicial_12', 'plan_persona_inicial', 12, 290.00, true, now(), now()),
  ('price_persona_profesional_1', 'plan_persona_profesional', 1, 59.00, true, now(), now()),
  ('price_persona_profesional_3', 'plan_persona_profesional', 3, 168.00, true, now(), now()),
  ('price_persona_profesional_6', 'plan_persona_profesional', 6, 319.00, true, now(), now()),
  ('price_persona_profesional_12', 'plan_persona_profesional', 12, 590.00, true, now(), now()),
  ('price_empresa_despacho_1', 'plan_empresa_despacho', 1, 149.00, true, now(), now()),
  ('price_empresa_despacho_3', 'plan_empresa_despacho', 3, 425.00, true, now(), now()),
  ('price_empresa_despacho_6', 'plan_empresa_despacho', 6, 805.00, true, now(), now()),
  ('price_empresa_despacho_12', 'plan_empresa_despacho', 12, 1490.00, true, now(), now()),
  ('price_empresa_auditoria_interna_1', 'plan_empresa_auditoria_interna', 1, 149.00, true, now(), now()),
  ('price_empresa_auditoria_interna_3', 'plan_empresa_auditoria_interna', 3, 425.00, true, now(), now()),
  ('price_empresa_auditoria_interna_6', 'plan_empresa_auditoria_interna', 6, 805.00, true, now(), now()),
  ('price_empresa_auditoria_interna_12', 'plan_empresa_auditoria_interna', 12, 1490.00, true, now(), now()),
  ('price_empresa_plus_1', 'plan_empresa_plus', 1, 299.00, true, now(), now()),
  ('price_empresa_plus_3', 'plan_empresa_plus', 3, 852.00, true, now(), now()),
  ('price_empresa_plus_6', 'plan_empresa_plus', 6, 1615.00, true, now(), now()),
  ('price_empresa_plus_12', 'plan_empresa_plus', 12, 2990.00, true, now(), now()),
  ('price_piloto_0', 'plan_piloto', 0, 0.00, true, now(), now()),
  ('price_interno_0', 'plan_interno', 0, 0.00, true, now(), now());

INSERT INTO "billing_settings" ("id", "enforcementMode", "updatedAt") VALUES ('default', 'OFF', now());

-- ── Las organizaciones que ya existen: PILOTO (Empresa Demo: INTERNO), exentas y sin vencimiento ──
INSERT INTO "billing_subscriptions" ("id", "organizationId", "planId", "planSnapshot", "status", "months", "startedAt", "exempt", "extraUsers", "overrides", "createdAt", "updatedAt")
SELECT 'sub_' || o."id", o."id", p."id",
       jsonb_build_object('code', p."code", 'name', p."name", 'audience', p."audience", 'trialDays', p."trialDays", 'limits', p."limits",
                          'modules', to_jsonb(p."modules"), 'functions', to_jsonb(p."functions"), 'assistants', to_jsonb(p."assistants")),
       'ACTIVE', 0, now(), true, 0, '{}'::jsonb, now(), now()
FROM "organizations" o
JOIN "billing_plans" p ON p."code" = CASE WHEN o."name" ILIKE '%demo%' THEN 'INTERNO' ELSE 'PILOTO' END
ON CONFLICT ("organizationId") DO NOTHING;

-- ── Seguridad: RLS activo y nada para anon/authenticated (regla de project_security_audit) ──
ALTER TABLE "billing_plans"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "billing_plan_prices"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "billing_subscriptions"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "billing_settings"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "billing_events"         ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "billing_plans", "billing_plan_prices", "billing_subscriptions", "billing_settings", "billing_events"
  FROM anon, authenticated;

COMMIT;
