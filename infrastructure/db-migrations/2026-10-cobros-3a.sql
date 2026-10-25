-- ════════════════════════════════════════════════════════════════════════════
-- Cobros de honorarios · Fase 3a — honorario, calendario, facturas DTE registradas, cobros y retenciones
-- (docs/cobros-honorarios-diseno.md §3). Requiere haber aplicado antes 2026-10-cobros-0-consultorias.sql.
-- Cambio ADITIVO: tipos y tablas nuevos. NO usar `prisma db push`: aplicar este SQL.
-- Reversa: 2026-10-cobros-3a.REVERSA.sql
--
-- Seguridad: la API entra a la base con un rol que se salta RLS, así que la separación entre organizaciones y clientes se
-- impone aquí con CLAVES FORÁNEAS COMPUESTAS; las tablas de dinero usan ON DELETE RESTRICT; los saldos y estados llevan CHECK.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── Tipos ───────────────────────────────────────────────────────────────────
CREATE TYPE "FeeType"             AS ENUM ('FIXED', 'TIME_BASED');
CREATE TYPE "FeeSource"           AS ENUM ('PROPOSAL', 'MANUAL');
CREATE TYPE "FeeProgressMethod"   AS ENUM ('HOURS', 'MILESTONES', 'MANUAL');
CREATE TYPE "ScheduleItemKind"    AS ENUM ('INSTALLMENT', 'MILESTONE', 'ADVANCE');
CREATE TYPE "ScheduleItemStatus"  AS ENUM ('PLANNED', 'INVOICED', 'CANCELLED');
CREATE TYPE "ClientInvoiceStatus" AS ENUM ('OPEN', 'PARTIAL', 'SETTLED', 'VOID');
CREATE TYPE "ClientPaymentStatus" AS ENUM ('ACTIVE', 'VOID');
CREATE TYPE "ClientPaymentMethod" AS ENUM ('TRANSFER', 'CHECK', 'CASH', 'CARD', 'OTHER');
CREATE TYPE "WithholdingTaxType"  AS ENUM ('IVA', 'RENTA', 'OTHER');
CREATE TYPE "CollectionLogAction" AS ENUM (
  'FEE_SET', 'FEE_DELETED', 'FEE_AMENDED', 'SCHEDULE_GENERATED', 'SCHEDULE_ITEM_CREATED', 'SCHEDULE_ITEM_UPDATED', 'SCHEDULE_ITEM_CANCELLED', 'SCHEDULE_ITEM_DELETED',
  'INVOICE_REGISTERED', 'INVOICE_UPDATED', 'INVOICE_VOIDED',
  'PAYMENT_REGISTERED', 'PAYMENT_UPDATED', 'PAYMENT_APPLIED', 'APPLICATION_REVERSED', 'PAYMENT_VOIDED',
  'WITHHOLDING_ADDED', 'WITHHOLDING_REVERSED',
  'CREDIT_NOTE_REGISTERED', 'CREDIT_NOTE_VOIDED', 'WRITE_OFF_REGISTERED', 'WRITE_OFF_REVERSED',
  'COLLECTION_NOTE_ADDED', 'PROMISE_STATUS_CHANGED'
);

-- ── Honorario del encargo (1 a 1) ───────────────────────────────────────────
CREATE TABLE "engagement_fees" (
  "id"                TEXT NOT NULL,
  "organizationId"    TEXT NOT NULL,
  "engagementId"      TEXT NOT NULL,
  "feeType"           "FeeType" NOT NULL,
  "totalAmount"       DECIMAL(12,2),
  "source"            "FeeSource" NOT NULL,
  "proposalId"        TEXT,
  "paymentTermDays"   INTEGER NOT NULL DEFAULT 30,
  "progressMethod"    "FeeProgressMethod" NOT NULL DEFAULT 'HOURS',
  "manualProgressPct" DOUBLE PRECISION,
  "notes"             TEXT,
  "createdById"       TEXT NOT NULL,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL,
  CONSTRAINT "engagement_fees_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "engagement_fees_total_chk" CHECK (("feeType" = 'FIXED') = ("totalAmount" IS NOT NULL) AND ("totalAmount" IS NULL OR "totalAmount" > 0)),
  CONSTRAINT "engagement_fees_term_chk"  CHECK ("paymentTermDays" BETWEEN 0 AND 365),
  CONSTRAINT "engagement_fees_progress_chk" CHECK ("manualProgressPct" IS NULL OR ("progressMethod" = 'MANUAL' AND "manualProgressPct" BETWEEN 0 AND 100))
);
CREATE UNIQUE INDEX "engagement_fees_engagementId_key" ON "engagement_fees"("engagementId");
-- una propuesta no se copia a dos encargos (una carta puede servir a varios ejercicios)
CREATE UNIQUE INDEX "engagement_fees_proposalId_key" ON "engagement_fees"("proposalId") WHERE "proposalId" IS NOT NULL;
CREATE INDEX "engagement_fees_organizationId_idx" ON "engagement_fees"("organizationId");
ALTER TABLE "engagement_fees" ADD CONSTRAINT "engagement_fees_engagement_fkey"
  FOREIGN KEY ("organizationId", "engagementId") REFERENCES "engagements"("organizationId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "engagement_fees" ADD CONSTRAINT "engagement_fees_proposalId_fkey"
  FOREIGN KEY ("proposalId") REFERENCES "proposals"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "engagement_fees" ADD CONSTRAINT "engagement_fees_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
-- destino de la clave compuesta de las adendas
CREATE UNIQUE INDEX "engagement_fees_organizationId_id_key" ON "engagement_fees"("organizationId", "id");

-- ── Adendas ─────────────────────────────────────────────────────────────────
CREATE TABLE "engagement_fee_amendments" (
  "id"             TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "feeId"          TEXT NOT NULL,
  "date"           DATE NOT NULL,
  "reason"         TEXT NOT NULL,
  "amountDelta"    DECIMAL(12,2) NOT NULL,
  "createdById"    TEXT NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "engagement_fee_amendments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "engagement_fee_amendments_delta_chk"  CHECK ("amountDelta" <> 0),
  CONSTRAINT "engagement_fee_amendments_reason_chk" CHECK (length(btrim("reason")) >= 5)
);
CREATE INDEX "engagement_fee_amendments_feeId_idx" ON "engagement_fee_amendments"("feeId");
ALTER TABLE "engagement_fee_amendments" ADD CONSTRAINT "engagement_fee_amendments_fee_fkey"
  FOREIGN KEY ("organizationId", "feeId") REFERENCES "engagement_fees"("organizationId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "engagement_fee_amendments" ADD CONSTRAINT "engagement_fee_amendments_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- ── Calendario de cobros ────────────────────────────────────────────────────
CREATE TABLE "billing_schedule_items" (
  "id"             TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "engagementId"   TEXT NOT NULL,
  "sequence"       INTEGER NOT NULL,
  "label"          TEXT NOT NULL,
  "kind"           "ScheduleItemKind" NOT NULL DEFAULT 'INSTALLMENT',
  "dueDate"        DATE NOT NULL,
  "amount"         DECIMAL(12,2) NOT NULL,
  "status"         "ScheduleItemStatus" NOT NULL DEFAULT 'PLANNED',
  "completedAt"    TIMESTAMP(3),
  "createdById"    TEXT NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "billing_schedule_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "billing_schedule_items_amount_chk" CHECK ("amount" > 0),
  CONSTRAINT "billing_schedule_items_seq_chk"    CHECK ("sequence" > 0),
  CONSTRAINT "billing_schedule_items_label_chk"  CHECK (length(btrim("label")) > 0)
);
CREATE UNIQUE INDEX "billing_schedule_items_engagement_sequence_key" ON "billing_schedule_items"("engagementId", "sequence");
CREATE UNIQUE INDEX "billing_schedule_items_id_engagementId_key" ON "billing_schedule_items"("id", "engagementId");
CREATE INDEX "billing_schedule_items_engagementId_status_idx" ON "billing_schedule_items"("engagementId", "status");
ALTER TABLE "billing_schedule_items" ADD CONSTRAINT "billing_schedule_items_engagement_fkey"
  FOREIGN KEY ("organizationId", "engagementId") REFERENCES "engagements"("organizationId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "billing_schedule_items" ADD CONSTRAINT "billing_schedule_items_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- ── Facturas registradas (DTE) ──────────────────────────────────────────────
CREATE TABLE "client_invoices" (
  "id"               TEXT NOT NULL,
  "organizationId"   TEXT NOT NULL,
  "clientId"         TEXT NOT NULL,
  "engagementId"     TEXT NOT NULL,
  "scheduleItemId"   TEXT,
  "invoiceNumber"    TEXT NOT NULL,
  "generationCode"   TEXT,
  "documentType"     TEXT NOT NULL,
  "invoiceDate"      DATE NOT NULL,
  "dueDate"          DATE NOT NULL,
  "description"      TEXT,
  "netAmount"        DECIMAL(12,2) NOT NULL,
  "taxAmount"        DECIMAL(12,2) NOT NULL DEFAULT 0,
  "totalAmount"      DECIMAL(12,2) NOT NULL,
  "paidAmount"       DECIMAL(12,2) NOT NULL DEFAULT 0,
  "withheldAmount"   DECIMAL(12,2) NOT NULL DEFAULT 0,
  "creditedAmount"   DECIMAL(12,2) NOT NULL DEFAULT 0,
  "writtenOffAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "status"           "ClientInvoiceStatus" NOT NULL DEFAULT 'OPEN',
  "voidedAt"         TIMESTAMP(3),
  "voidedById"       TEXT,
  "voidReason"       TEXT,
  "createdById"      TEXT NOT NULL,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL,
  CONSTRAINT "client_invoices_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "client_invoices_amounts_chk" CHECK ("netAmount" > 0 AND "taxAmount" >= 0 AND "totalAmount" = "netAmount" + "taxAmount"),
  CONSTRAINT "client_invoices_accum_chk" CHECK ("paidAmount" >= 0 AND "withheldAmount" >= 0 AND "creditedAmount" >= 0 AND "writtenOffAmount" >= 0),
  -- el saldo nunca es negativo
  CONSTRAINT "client_invoices_balance_chk" CHECK ("totalAmount" - ("paidAmount" + "withheldAmount" + "creditedAmount" + "writtenOffAmount") >= 0),
  -- el estado es coherente con los acumulados
  CONSTRAINT "client_invoices_status_chk" CHECK (
    ("status" IN ('VOID', 'OPEN') AND "paidAmount" = 0 AND "withheldAmount" = 0 AND "creditedAmount" = 0 AND "writtenOffAmount" = 0)
    OR ("status" = 'PARTIAL'
        AND "totalAmount" - ("paidAmount" + "withheldAmount" + "creditedAmount" + "writtenOffAmount") > 0
        AND "paidAmount" + "withheldAmount" + "creditedAmount" + "writtenOffAmount" > 0)
    OR ("status" = 'SETTLED'
        AND "totalAmount" - ("paidAmount" + "withheldAmount" + "creditedAmount" + "writtenOffAmount") = 0)
  ),
  CONSTRAINT "client_invoices_dates_chk"  CHECK ("dueDate" >= "invoiceDate"),
  CONSTRAINT "client_invoices_number_chk" CHECK (length(btrim("invoiceNumber")) > 0 AND length(btrim("documentType")) > 0),
  CONSTRAINT "client_invoices_void_chk"   CHECK (("status" = 'VOID') = ("voidedAt" IS NOT NULL) AND ("status" <> 'VOID' OR length(btrim(coalesce("voidReason", ''))) >= 10))
);
-- una factura anulada libera su número, su código de generación y su cuota
CREATE UNIQUE INDEX "client_invoices_org_number_active_key"  ON "client_invoices"("organizationId", "invoiceNumber") WHERE "status" <> 'VOID';
CREATE UNIQUE INDEX "client_invoices_org_gencode_active_key" ON "client_invoices"("organizationId", "generationCode") WHERE "status" <> 'VOID' AND "generationCode" IS NOT NULL;
CREATE UNIQUE INDEX "client_invoices_scheduleItem_active_key" ON "client_invoices"("scheduleItemId") WHERE "status" <> 'VOID' AND "scheduleItemId" IS NOT NULL;
-- destino de las claves compuestas de aplicaciones, retenciones y (fase 3d) notas de crédito y castigos
CREATE UNIQUE INDEX "client_invoices_org_client_id_key" ON "client_invoices"("organizationId", "clientId", "id");
CREATE INDEX "client_invoices_org_client_status_idx" ON "client_invoices"("organizationId", "clientId", "status");
CREATE INDEX "client_invoices_engagementId_idx" ON "client_invoices"("engagementId");
CREATE INDEX "client_invoices_open_due_idx" ON "client_invoices"("organizationId", "dueDate") WHERE "status" IN ('OPEN', 'PARTIAL');
ALTER TABLE "client_invoices" ADD CONSTRAINT "client_invoices_client_fkey"
  FOREIGN KEY ("organizationId", "clientId") REFERENCES "clients"("organizationId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
-- el encargo pertenece a la organización y a ESE cliente
ALTER TABLE "client_invoices" ADD CONSTRAINT "client_invoices_engagement_org_fkey"
  FOREIGN KEY ("organizationId", "engagementId") REFERENCES "engagements"("organizationId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "client_invoices" ADD CONSTRAINT "client_invoices_engagement_client_fkey"
  FOREIGN KEY ("engagementId", "clientId") REFERENCES "engagements"("id", "clientId") ON DELETE RESTRICT ON UPDATE RESTRICT;
-- la cuota pertenece a ESE encargo
ALTER TABLE "client_invoices" ADD CONSTRAINT "client_invoices_scheduleItem_fkey"
  FOREIGN KEY ("scheduleItemId", "engagementId") REFERENCES "billing_schedule_items"("id", "engagementId") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "client_invoices" ADD CONSTRAINT "client_invoices_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- ── Cobros ──────────────────────────────────────────────────────────────────
CREATE TABLE "client_payments" (
  "id"              TEXT NOT NULL,
  "organizationId"  TEXT NOT NULL,
  "clientId"        TEXT NOT NULL,
  "paymentDate"     DATE NOT NULL,
  "amount"          DECIMAL(12,2) NOT NULL,
  "appliedAmount"   DECIMAL(12,2) NOT NULL DEFAULT 0,
  "method"          "ClientPaymentMethod" NOT NULL,
  "reference"       TEXT,
  "notes"           TEXT,
  "status"          "ClientPaymentStatus" NOT NULL DEFAULT 'ACTIVE',
  "clientRequestId" TEXT,
  "voidedAt"        TIMESTAMP(3),
  "voidedById"      TEXT,
  "voidReason"      TEXT,
  "createdById"     TEXT NOT NULL,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "client_payments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "client_payments_amount_chk"  CHECK ("amount" > 0),
  CONSTRAINT "client_payments_applied_chk" CHECK ("appliedAmount" >= 0 AND "appliedAmount" <= "amount"),
  CONSTRAINT "client_payments_void_chk"    CHECK (("status" = 'VOID') = ("voidedAt" IS NOT NULL) AND ("status" <> 'VOID' OR ("appliedAmount" = 0 AND length(btrim(coalesce("voidReason", ''))) >= 10)))
);
CREATE UNIQUE INDEX "client_payments_org_request_key" ON "client_payments"("organizationId", "clientRequestId") WHERE "clientRequestId" IS NOT NULL;
CREATE UNIQUE INDEX "client_payments_org_client_id_key" ON "client_payments"("organizationId", "clientId", "id");
CREATE INDEX "client_payments_org_client_idx" ON "client_payments"("organizationId", "clientId");
ALTER TABLE "client_payments" ADD CONSTRAINT "client_payments_client_fkey"
  FOREIGN KEY ("organizationId", "clientId") REFERENCES "clients"("organizationId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "client_payments" ADD CONSTRAINT "client_payments_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- ── Aplicaciones de dinero (movimientos que solo se agregan) ────────────────
CREATE TABLE "payment_applications" (
  "id"             TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "clientId"       TEXT NOT NULL,
  "paymentId"      TEXT NOT NULL,
  "invoiceId"      TEXT NOT NULL,
  "amount"         DECIMAL(12,2) NOT NULL,
  "appliedOn"      DATE NOT NULL,
  "reversedAt"     TIMESTAMP(3),
  "reversedById"   TEXT,
  "reverseReason"  TEXT,
  "createdById"    TEXT NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payment_applications_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payment_applications_amount_chk"   CHECK ("amount" > 0),
  CONSTRAINT "payment_applications_reversed_chk" CHECK (("reversedAt" IS NULL) = ("reversedById" IS NULL))
);
CREATE INDEX "payment_applications_invoice_active_idx" ON "payment_applications"("invoiceId") WHERE "reversedAt" IS NULL;
CREATE INDEX "payment_applications_invoiceId_idx" ON "payment_applications"("invoiceId");
CREATE INDEX "payment_applications_paymentId_idx" ON "payment_applications"("paymentId");
-- un cobro solo se aplica a facturas de la MISMA organización y del MISMO cliente
ALTER TABLE "payment_applications" ADD CONSTRAINT "payment_applications_payment_fkey"
  FOREIGN KEY ("organizationId", "clientId", "paymentId") REFERENCES "client_payments"("organizationId", "clientId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "payment_applications" ADD CONSTRAINT "payment_applications_invoice_fkey"
  FOREIGN KEY ("organizationId", "clientId", "invoiceId") REFERENCES "client_invoices"("organizationId", "clientId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "payment_applications" ADD CONSTRAINT "payment_applications_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- ── Retenciones que practica el cliente (al emitir o al pagar; no son dinero recibido) ──
CREATE TABLE "invoice_withholdings" (
  "id"                TEXT NOT NULL,
  "organizationId"    TEXT NOT NULL,
  "clientId"          TEXT NOT NULL,
  "invoiceId"         TEXT NOT NULL,
  "paymentId"         TEXT,
  "taxType"           "WithholdingTaxType" NOT NULL,
  "amount"            DECIMAL(12,2) NOT NULL,
  "appliedOn"         DATE NOT NULL,
  "certificateNumber" TEXT,
  "reversedAt"        TIMESTAMP(3),
  "reversedById"      TEXT,
  "reverseReason"     TEXT,
  "createdById"       TEXT NOT NULL,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "invoice_withholdings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "invoice_withholdings_amount_chk"   CHECK ("amount" > 0),
  CONSTRAINT "invoice_withholdings_reversed_chk" CHECK (("reversedAt" IS NULL) = ("reversedById" IS NULL))
);
CREATE INDEX "invoice_withholdings_invoiceId_idx" ON "invoice_withholdings"("invoiceId");
CREATE INDEX "invoice_withholdings_paymentId_idx" ON "invoice_withholdings"("paymentId");
ALTER TABLE "invoice_withholdings" ADD CONSTRAINT "invoice_withholdings_invoice_fkey"
  FOREIGN KEY ("organizationId", "clientId", "invoiceId") REFERENCES "client_invoices"("organizationId", "clientId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "invoice_withholdings" ADD CONSTRAINT "invoice_withholdings_payment_fkey"
  FOREIGN KEY ("organizationId", "clientId", "paymentId") REFERENCES "client_payments"("organizationId", "clientId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "invoice_withholdings" ADD CONSTRAINT "invoice_withholdings_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- ── Bitácora (solo se agrega) ───────────────────────────────────────────────
CREATE TABLE "collection_logs" (
  "id"             TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "entityType"     TEXT NOT NULL,
  "entityId"       TEXT NOT NULL,
  "action"         "CollectionLogAction" NOT NULL,
  "actorId"        TEXT NOT NULL,
  "before"         JSONB,
  "after"          JSONB,
  "note"           TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "collection_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "collection_logs_entity_idx"  ON "collection_logs"("organizationId", "entityType", "entityId");
CREATE INDEX "collection_logs_created_idx" ON "collection_logs"("organizationId", "createdAt");
ALTER TABLE "collection_logs" ADD CONSTRAINT "collection_logs_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE FUNCTION "collection_logs_append_only"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'collection_logs solo admite INSERT (bitácora de solo agregar)';
END;
$$;
CREATE TRIGGER "collection_logs_no_update_delete" BEFORE UPDATE OR DELETE ON "collection_logs"
  FOR EACH ROW EXECUTE FUNCTION "collection_logs_append_only"();

-- ── Seguridad: RLS activo y nada para anon/authenticated (regla de project_security_audit) ──
ALTER TABLE "engagement_fees"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "engagement_fee_amendments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "billing_schedule_items"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "client_invoices"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "client_payments"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payment_applications"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "invoice_withholdings"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "collection_logs"           ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "engagement_fees", "engagement_fee_amendments", "billing_schedule_items", "client_invoices",
  "client_payments", "payment_applications", "invoice_withholdings", "collection_logs" FROM anon, authenticated;

COMMIT;
