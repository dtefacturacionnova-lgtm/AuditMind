-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Planes y suscripciones — Etapa 2: medición de IA, paquetes adicionales y pagos manuales
-- (docs/suscripciones-y-planes-propuesta.md, §4.5 y §11). Requiere 2026-11-suscripciones-1-nucleo.sql.
-- Cambio ADITIVO: 5 tipos y 4 tablas nuevas + paquetes semilla (la columna billing_settings.paymentInstructions vive en la etapa 1).
-- Con el interruptor en OFF (billing_settings.enforcementMode) nada se bloquea: solo se MIDE.
-- NO usar `prisma db push` (intenta borrar rag_chunks/rag_documents): aplicar este SQL.
-- Reversa: 2026-11-suscripciones-2-medicion-pagos.REVERSA.sql
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TYPE "AddonKind"            AS ENUM ('AI', 'STORAGE');
CREATE TYPE "AddonPurchaseStatus"  AS ENUM ('ACTIVE', 'CONSUMED', 'EXPIRED', 'CANCELLED');
CREATE TYPE "BillingPaymentKind"   AS ENUM ('LICENSE', 'PACK');
CREATE TYPE "BillingPaymentMethod" AS ENUM ('TRANSFER', 'QR', 'CASH', 'WOMPI');
CREATE TYPE "BillingPaymentStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'CANCELLED');

-- ── Libro de consumo de IA (solo agregar): una fila por petición, con su peso y su costo ──
CREATE TABLE "usage_ledger" (
  "id"             TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "userId"         TEXT,
  "kind"           TEXT NOT NULL DEFAULT 'AI',
  "agent"          TEXT,
  "weight"         INTEGER NOT NULL,
  "packWeight"     INTEGER NOT NULL DEFAULT 0,
  "tokensIn"       INTEGER NOT NULL DEFAULT 0,
  "tokensOut"      INTEGER NOT NULL DEFAULT 0,
  "costUsd"        DECIMAL(12,6) NOT NULL DEFAULT 0,
  "model"          TEXT,
  "periodKey"      TEXT NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "usage_ledger_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "usage_ledger_weight_chk" CHECK ("weight" >= 0 AND "packWeight" >= 0 AND "packWeight" <= "weight"),
  CONSTRAINT "usage_ledger_period_chk" CHECK ("periodKey" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
);
CREATE INDEX "usage_ledger_organizationId_periodKey_idx" ON "usage_ledger"("organizationId", "periodKey");
CREATE INDEX "usage_ledger_periodKey_idx" ON "usage_ledger"("periodKey");
ALTER TABLE "usage_ledger" ADD CONSTRAINT "usage_ledger_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Catálogo de paquetes adicionales (datos editables) ──
CREATE TABLE "addon_packs" (
  "id"        TEXT NOT NULL,
  "code"      TEXT NOT NULL,
  "kind"      "AddonKind" NOT NULL,
  "name"      TEXT NOT NULL,
  "quantity"  INTEGER NOT NULL, -- peticiones (AI) o GB (STORAGE)
  "priceUsd"  DECIMAL(10,2) NOT NULL, -- AI: pago único; STORAGE: por mes
  "recurring" BOOLEAN NOT NULL DEFAULT false,
  "active"    BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "addon_packs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "addon_packs_qty_chk" CHECK ("quantity" > 0 AND "priceUsd" >= 0)
);
CREATE UNIQUE INDEX "addon_packs_code_key" ON "addon_packs"("code");

-- ── Pagos de la organización (licencia o paquete), con aprobación manual ──
CREATE TABLE "billing_payments" (
  "id"             TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "kind"           "BillingPaymentKind" NOT NULL,
  "planCode"       TEXT,
  "months"         INTEGER,
  "packCode"       TEXT,
  "concept"        TEXT NOT NULL,
  "amountUsd"      DECIMAL(10,2) NOT NULL,
  "method"         "BillingPaymentMethod" NOT NULL,
  "status"         "BillingPaymentStatus" NOT NULL DEFAULT 'PENDING',
  "reference"      TEXT NOT NULL,
  "proofPath"      TEXT,
  "proofName"      TEXT,
  "requestedById"  TEXT,
  "approvedById"   TEXT,
  "approvedAt"     TIMESTAMP(3),
  "rejectedReason" TEXT,
  "expiresAt"      TIMESTAMP(3) NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "billing_payments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "billing_payments_amount_chk" CHECK ("amountUsd" >= 0),
  CONSTRAINT "billing_payments_kind_chk" CHECK (
    ("kind" = 'LICENSE' AND "planCode" IS NOT NULL AND "months" IS NOT NULL AND "packCode" IS NULL)
    OR ("kind" = 'PACK' AND "packCode" IS NOT NULL AND "planCode" IS NULL)
  )
);
CREATE UNIQUE INDEX "billing_payments_reference_key" ON "billing_payments"("reference");
CREATE INDEX "billing_payments_organizationId_createdAt_idx" ON "billing_payments"("organizationId", "createdAt");
CREATE INDEX "billing_payments_status_idx" ON "billing_payments"("status");
ALTER TABLE "billing_payments" ADD CONSTRAINT "billing_payments_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Paquetes comprados por una organización. paymentId ÚNICO: un pago aprobado acredita su paquete UNA sola vez ──
CREATE TABLE "addon_purchases" (
  "id"             TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "packId"         TEXT NOT NULL,
  "kind"           "AddonKind" NOT NULL,
  "quantity"       INTEGER NOT NULL,
  "remaining"      INTEGER NOT NULL, -- AI: peticiones que quedan; STORAGE: igual a quantity mientras esté vigente
  "priceUsd"       DECIMAL(10,2) NOT NULL,
  "status"         "AddonPurchaseStatus" NOT NULL DEFAULT 'ACTIVE',
  "expiresAt"      TIMESTAMP(3),
  "paymentId"      TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "addon_purchases_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "addon_purchases_remaining_chk" CHECK ("remaining" >= 0 AND "remaining" <= "quantity")
);
CREATE UNIQUE INDEX "addon_purchases_paymentId_key" ON "addon_purchases"("paymentId");
CREATE INDEX "addon_purchases_organizationId_status_idx" ON "addon_purchases"("organizationId", "status");
ALTER TABLE "addon_purchases" ADD CONSTRAINT "addon_purchases_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "addon_purchases" ADD CONSTRAINT "addon_purchases_packId_fkey"
  FOREIGN KEY ("packId") REFERENCES "addon_packs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "addon_purchases" ADD CONSTRAINT "addon_purchases_paymentId_fkey"
  FOREIGN KEY ("paymentId") REFERENCES "billing_payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Paquetes semilla (precios hipótesis; el superadmin los edita) ──
INSERT INTO "addon_packs" ("id", "code", "kind", "name", "quantity", "priceUsd", "recurring", "active", "sortOrder", "createdAt", "updatedAt") VALUES
  ('pack_ai_1000',      'AI_1000',      'AI',      '+1,000 peticiones de IA',  1000,   5.00, false, true, 10, now(), now()),
  ('pack_ai_5000',      'AI_5000',      'AI',      '+5,000 peticiones de IA',  5000,  20.00, false, true, 20, now(), now()),
  ('pack_ai_20000',     'AI_20000',     'AI',      '+20,000 peticiones de IA', 20000, 60.00, false, true, 30, now(), now()),
  ('pack_storage_10',   'STORAGE_10',   'STORAGE', '+10 GB de espacio',        10,     3.00, true,  true, 40, now(), now()),
  ('pack_storage_50',   'STORAGE_50',   'STORAGE', '+50 GB de espacio',        50,    12.00, true,  true, 50, now(), now()),
  ('pack_storage_200',  'STORAGE_200',  'STORAGE', '+200 GB de espacio',       200,   40.00, true,  true, 60, now(), now()),
  ('pack_storage_1000', 'STORAGE_1000', 'STORAGE', '+1 TB de espacio',         1000, 150.00, true,  true, 70, now(), now());

-- ── Seguridad: RLS activo y nada para anon/authenticated (regla de project_security_audit) ──
ALTER TABLE "usage_ledger"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "addon_packs"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "addon_purchases"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "billing_payments" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "usage_ledger", "addon_packs", "addon_purchases", "billing_payments" FROM anon, authenticated;

COMMIT;
