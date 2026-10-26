-- ════════════════════════════════════════════════════════════════════════════
-- Cobros de honorarios · Fase 3d — notas de crédito, castigo de incobrables y gestión de cobro
-- (docs/cobros-honorarios-diseno.md §3.1, §4.5 a §4.7). Requiere haber aplicado antes 2026-10-cobros-3a.sql (y su fix1).
-- Cambio ADITIVO: tipos y tablas nuevos, un índice único nuevo y dos valores nuevos del tipo de la bitácora.
-- NO usar `prisma db push`: aplicar este SQL.
-- Reversa: 2026-10-cobros-3d.REVERSA.sql
--
-- Seguridad: igual que 3a — claves foráneas COMPUESTAS (organización + cliente + factura) porque la API entra con un rol que se salta
-- RLS; ON DELETE RESTRICT; CHECK de montos y estados; RLS activo y nada para anon/authenticated.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;
SET LOCAL lock_timeout = '5s';

-- ── Tipos ───────────────────────────────────────────────────────────────────
CREATE TYPE "CreditNoteStatus"        AS ENUM ('ACTIVE', 'VOID');
CREATE TYPE "WriteOffStatus"          AS ENUM ('ACTIVE', 'REVERSED');
CREATE TYPE "CollectionContactMethod" AS ENUM ('CALL', 'EMAIL', 'WHATSAPP', 'VISIT', 'MEETING', 'OTHER');
CREATE TYPE "PromiseStatus"           AS ENUM ('PENDING', 'KEPT', 'BROKEN', 'CANCELLED');
-- editar y borrar una nota de gestión deja rastro en la bitácora (no se puede usar el valor nuevo dentro de esta transacción)
ALTER TYPE "CollectionLogAction" ADD VALUE IF NOT EXISTS 'COLLECTION_NOTE_UPDATED';
ALTER TYPE "CollectionLogAction" ADD VALUE IF NOT EXISTS 'COLLECTION_NOTE_DELETED';

-- La nota de crédito debe ser del MISMO encargo que su factura: destino de una clave compuesta.
CREATE UNIQUE INDEX "client_invoices_id_engagementId_key" ON "client_invoices"("id", "engagementId");

-- ── Notas de crédito (DTE 05) ───────────────────────────────────────────────
CREATE TABLE "client_credit_notes" (
  "id"               TEXT NOT NULL,
  "organizationId"   TEXT NOT NULL,
  "clientId"         TEXT NOT NULL,
  "engagementId"     TEXT NOT NULL,
  "invoiceId"        TEXT NOT NULL,
  "creditNoteNumber" TEXT NOT NULL,
  "generationCode"   TEXT,
  "issueDate"        DATE NOT NULL,
  "netAmount"        DECIMAL(12,2) NOT NULL,
  "taxAmount"        DECIMAL(12,2) NOT NULL DEFAULT 0,
  "totalAmount"      DECIMAL(12,2) NOT NULL,
  "reason"           TEXT NOT NULL,
  "status"           "CreditNoteStatus" NOT NULL DEFAULT 'ACTIVE',
  "voidedAt"         TIMESTAMP(3),
  "voidedById"       TEXT,
  "voidReason"       TEXT,
  "createdById"      TEXT NOT NULL,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL,
  CONSTRAINT "client_credit_notes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "client_credit_notes_amounts_chk" CHECK ("netAmount" > 0 AND "taxAmount" >= 0 AND "totalAmount" = "netAmount" + "taxAmount"),
  CONSTRAINT "client_credit_notes_number_chk"  CHECK (length(btrim("creditNoteNumber")) > 0),
  CONSTRAINT "client_credit_notes_reason_chk"  CHECK (length(btrim("reason")) >= 10),
  CONSTRAINT "client_credit_notes_void_chk"    CHECK (("status" = 'VOID') = ("voidedAt" IS NOT NULL) AND ("status" <> 'VOID' OR length(btrim(coalesce("voidReason", ''))) >= 10))
);
-- una nota anulada libera su número y su código de generación
CREATE UNIQUE INDEX "client_credit_notes_org_number_active_key"  ON "client_credit_notes"("organizationId", "creditNoteNumber") WHERE "status" <> 'VOID';
CREATE UNIQUE INDEX "client_credit_notes_org_gencode_active_key" ON "client_credit_notes"("organizationId", "generationCode") WHERE "status" <> 'VOID' AND "generationCode" IS NOT NULL;
CREATE INDEX "client_credit_notes_invoiceId_idx"    ON "client_credit_notes"("invoiceId");
CREATE INDEX "client_credit_notes_engagementId_idx" ON "client_credit_notes"("engagementId");
CREATE INDEX "client_credit_notes_org_client_idx"   ON "client_credit_notes"("organizationId", "clientId");
-- la factura es de la misma organización y del mismo cliente; el encargo es el de esa factura y es de ese cliente
ALTER TABLE "client_credit_notes" ADD CONSTRAINT "client_credit_notes_invoice_fkey"
  FOREIGN KEY ("organizationId", "clientId", "invoiceId") REFERENCES "client_invoices"("organizationId", "clientId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "client_credit_notes" ADD CONSTRAINT "client_credit_notes_invoice_engagement_fkey"
  FOREIGN KEY ("invoiceId", "engagementId") REFERENCES "client_invoices"("id", "engagementId") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "client_credit_notes" ADD CONSTRAINT "client_credit_notes_engagement_client_fkey"
  FOREIGN KEY ("engagementId", "clientId") REFERENCES "engagements"("id", "clientId") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "client_credit_notes" ADD CONSTRAINT "client_credit_notes_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- ── Castigos de incobrables (parciales, reversibles) ────────────────────────
CREATE TABLE "client_write_offs" (
  "id"             TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "clientId"       TEXT NOT NULL,
  "invoiceId"      TEXT NOT NULL,
  "amount"         DECIMAL(12,2) NOT NULL,
  "writtenOffOn"   DATE NOT NULL,
  "reason"         TEXT NOT NULL,
  "status"         "WriteOffStatus" NOT NULL DEFAULT 'ACTIVE',
  "reversedAt"     TIMESTAMP(3),
  "reversedById"   TEXT,
  "reverseReason"  TEXT,
  "createdById"    TEXT NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "client_write_offs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "client_write_offs_amount_chk"   CHECK ("amount" > 0),
  CONSTRAINT "client_write_offs_reason_chk"   CHECK (length(btrim("reason")) >= 10),
  CONSTRAINT "client_write_offs_reversed_chk" CHECK (("status" = 'REVERSED') = ("reversedAt" IS NOT NULL) AND ("status" <> 'REVERSED' OR length(btrim(coalesce("reverseReason", ''))) >= 10))
);
CREATE INDEX "client_write_offs_invoiceId_idx"  ON "client_write_offs"("invoiceId");
CREATE INDEX "client_write_offs_org_client_idx" ON "client_write_offs"("organizationId", "clientId");
ALTER TABLE "client_write_offs" ADD CONSTRAINT "client_write_offs_invoice_fkey"
  FOREIGN KEY ("organizationId", "clientId", "invoiceId") REFERENCES "client_invoices"("organizationId", "clientId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "client_write_offs" ADD CONSTRAINT "client_write_offs_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- ── Gestión de cobro: contactos, promesas de pago y seguimientos ────────────
CREATE TABLE "collection_notes" (
  "id"             TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "clientId"       TEXT NOT NULL,
  "invoiceId"      TEXT,
  "engagementId"   TEXT,
  "contactedOn"    DATE NOT NULL,
  "method"         "CollectionContactMethod" NOT NULL,
  "contactName"    TEXT,
  "note"           TEXT NOT NULL,
  "promiseDate"    DATE,
  "promiseAmount"  DECIMAL(12,2),
  "promiseStatus"  "PromiseStatus",
  "nextFollowUpOn" DATE,
  "createdById"    TEXT NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "collection_notes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "collection_notes_note_chk"    CHECK (length(btrim("note")) >= 3),
  -- una promesa tiene fecha y estado juntos; el monto prometido, si existe, es positivo y va con una promesa
  CONSTRAINT "collection_notes_promise_chk" CHECK (("promiseDate" IS NULL) = ("promiseStatus" IS NULL)
    AND ("promiseAmount" IS NULL OR ("promiseAmount" > 0 AND "promiseDate" IS NOT NULL))),
  CONSTRAINT "collection_notes_followup_chk" CHECK ("nextFollowUpOn" IS NULL OR "nextFollowUpOn" >= "contactedOn")
);
CREATE INDEX "collection_notes_org_client_idx"  ON "collection_notes"("organizationId", "clientId", "contactedOn");
CREATE INDEX "collection_notes_invoiceId_idx"   ON "collection_notes"("invoiceId") WHERE "invoiceId" IS NOT NULL;
CREATE INDEX "collection_notes_followup_idx"    ON "collection_notes"("organizationId", "nextFollowUpOn") WHERE "nextFollowUpOn" IS NOT NULL;
CREATE INDEX "collection_notes_promise_idx"     ON "collection_notes"("organizationId", "promiseDate") WHERE "promiseStatus" = 'PENDING';
ALTER TABLE "collection_notes" ADD CONSTRAINT "collection_notes_client_fkey"
  FOREIGN KEY ("organizationId", "clientId") REFERENCES "clients"("organizationId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
-- con factura nula la clave compuesta no se evalúa (MATCH SIMPLE): solo se exige cuando hay factura
ALTER TABLE "collection_notes" ADD CONSTRAINT "collection_notes_invoice_fkey"
  FOREIGN KEY ("organizationId", "clientId", "invoiceId") REFERENCES "client_invoices"("organizationId", "clientId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "collection_notes" ADD CONSTRAINT "collection_notes_engagement_fkey"
  FOREIGN KEY ("engagementId", "clientId") REFERENCES "engagements"("id", "clientId") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "collection_notes" ADD CONSTRAINT "collection_notes_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- ── Seguridad: RLS activo y nada para anon/authenticated ────────────────────
ALTER TABLE "client_credit_notes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "client_write_offs"   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "collection_notes"    ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "client_credit_notes", "client_write_offs", "collection_notes" FROM anon, authenticated;

COMMIT;
