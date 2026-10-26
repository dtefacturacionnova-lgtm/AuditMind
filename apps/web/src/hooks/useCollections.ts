'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { AccrualView, CreditNoteRow, WriteOffRow } from './useCollectionsReports';

// Cobro de honorarios (docs/cobros-honorarios-diseno.md). Los tipos reflejan fees.service.ts, invoices.service.ts y payments.service.ts.
// Todo monto llega como número con 2 decimales; la aritmética con dinero se hace SIEMPRE en el servidor.

export type FeeType = 'FIXED' | 'TIME_BASED';
export type FeeProgressMethod = 'HOURS' | 'MILESTONES' | 'MANUAL';
export type ScheduleItemKind = 'INSTALLMENT' | 'MILESTONE' | 'ADVANCE';
export type ScheduleItemState = 'CANCELLED' | 'PLANNED' | 'PLANNED_LATE' | 'INVOICED' | 'INVOICED_PARTIAL' | 'INVOICED_OVERDUE' | 'PAID';
export type InvoiceStatus = 'OPEN' | 'PARTIAL' | 'SETTLED' | 'VOID';
export type PaymentStatus = 'ACTIVE' | 'VOID';
export type PaymentMethod = 'TRANSFER' | 'CHECK' | 'CASH' | 'CARD' | 'OTHER';
export type TaxType = 'IVA' | 'RENTA' | 'OTHER';
export type DocumentType = '03' | '01';

export const INVOICE_STATUS_CONFIG: Record<InvoiceStatus, { label: string; bg: string; color: string }> = {
  OPEN:    { label: 'Abierta',   bg: 'bg-blue-50',    color: 'text-blue-700' },
  PARTIAL: { label: 'Parcial',   bg: 'bg-amber-50',   color: 'text-amber-700' },
  SETTLED: { label: 'Saldada',   bg: 'bg-emerald-50', color: 'text-emerald-700' },
  VOID:    { label: 'Anulada',   bg: 'bg-gray-100',   color: 'text-gray-500' },
};

export const SCHEDULE_STATE_CONFIG: Record<ScheduleItemState, { label: string; bg: string; color: string }> = {
  CANCELLED:        { label: 'Cancelada',       bg: 'bg-gray-100',   color: 'text-gray-500' },
  PLANNED:          { label: 'Programada',      bg: 'bg-slate-100',  color: 'text-slate-700' },
  PLANNED_LATE:     { label: 'Por facturar',    bg: 'bg-orange-50',  color: 'text-orange-700' },
  INVOICED:         { label: 'Facturada',       bg: 'bg-blue-50',    color: 'text-blue-700' },
  INVOICED_PARTIAL: { label: 'Cobro parcial',   bg: 'bg-amber-50',   color: 'text-amber-700' },
  INVOICED_OVERDUE: { label: 'Vencida',         bg: 'bg-red-50',     color: 'text-red-700' },
  PAID:             { label: 'Pagada',          bg: 'bg-emerald-50', color: 'text-emerald-700' },
};

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  TRANSFER: 'Transferencia', CHECK: 'Cheque', CASH: 'Efectivo', CARD: 'Tarjeta', OTHER: 'Otro',
};
export const TAX_TYPE_LABEL: Record<TaxType, string> = { IVA: 'IVA', RENTA: 'Renta', OTHER: 'Otro' };
export const DOCUMENT_TYPE_LABEL: Record<DocumentType, string> = { '03': 'Crédito fiscal (03)', '01': 'Factura (01)' };

export interface ScheduleItem {
  id: string; sequence: number; label: string; kind: ScheduleItemKind; dueDate: string; amount: number;
  status: 'PLANNED' | 'INVOICED' | 'CANCELLED'; completedAt: string | null; state: ScheduleItemState;
  invoice: { id: string; invoiceNumber: string; status: InvoiceStatus; total: number; balance: number } | null;
}

export interface FeeSummary {
  feeTotal: number | null; invoicedNet: number; scheduled: number; unscheduled: number | null; invoicedTotal: number;
  collected: number; withheld: number; credited: number; writtenOff: number; receivable: number;
}

export interface FeeView {
  engagement: { id: string; kind: 'AUDIT' | 'CONSULTING'; title: string | null; status: string; fiscalYear: number; clientId: string; clientName: string };
  fee: {
    id: string; feeType: FeeType; totalAmount: number | null; originalAmount: number | null; source: 'PROPOSAL' | 'MANUAL'; proposalId: string | null;
    paymentTermDays: number; progressMethod: FeeProgressMethod; manualProgressPct: number | null; notes: string | null;
  } | null;
  amendments: { id: string; date: string; reason: string; amountDelta: number; createdAt: string }[];
  schedule: ScheduleItem[];
  summary: FeeSummary;
  /** Avance, devengado y por facturar al día de hoy; null si el encargo aún no tiene honorario. */
  accrual: AccrualView | null;
  permissions: { canEdit: boolean };
}

export interface InvoiceRow {
  id: string; clientId: string; engagementId: string; scheduleItemId: string | null; invoiceNumber: string; generationCode: string | null;
  documentType: DocumentType; invoiceDate: string; dueDate: string; description: string | null;
  netAmount: number; taxAmount: number; totalAmount: number; paidAmount: number; withheldAmount: number; creditedAmount: number; writtenOffAmount: number;
  balance: number; status: InvoiceStatus; overdueDays: number; overdue: boolean; voidedAt: string | null; voidReason: string | null; createdAt: string;
  client?: { id: string; legalName: string; tradeName: string | null } | null;
  engagement?: { id: string; kind: 'AUDIT' | 'CONSULTING'; title: string | null; fiscalYear: number } | null;
}

export interface WithholdingRow {
  id: string; invoiceId: string; paymentId: string | null; clientId: string; taxType: TaxType; amount: number; appliedOn: string;
  certificateNumber: string | null; reversedAt: string | null; reverseReason: string | null; invoiceNumber?: string | null;
}

export interface InvoiceHourRow {
  id: string; timeEntryId: string; workDate: string | null; userName: string; description: string | null;
  hours: number; rate: number; amount: number; releasedAt: string | null;
}

export interface InvoiceDetail extends InvoiceRow {
  scheduleItem: { id: string; label: string; sequence: number } | null;
  applications: {
    id: string; paymentId: string; amount: number; appliedOn: string; reversedAt: string | null; reverseReason: string | null;
    payment: { id: string; paymentDate: string; method: PaymentMethod; reference: string | null; status: PaymentStatus } | null;
  }[];
  withholdings: WithholdingRow[];
  creditNotes: CreditNoteRow[];
  writeOffs: WriteOffRow[];
  /** Horas de trabajo facturadas (solo las facturas de una consultoría por tiempo); las liberadas ya no cuentan. */
  hours: InvoiceHourRow[];
  log: { id: string; action: string; actorId: string; note: string | null; createdAt: string }[];
  permissions: {
    canEditAll: boolean; canEditBasics: boolean; canVoid: boolean; canReverseWithholding: boolean;
    canCredit: boolean; canWriteOff: boolean; canVoidCreditNote: boolean; canReverseWriteOff: boolean;
  };
}

export interface PaymentRow {
  id: string; clientId: string; paymentDate: string; amount: number; appliedAmount: number; unappliedAmount: number; method: PaymentMethod;
  reference: string | null; notes: string | null; status: PaymentStatus; voidedAt: string | null; voidReason: string | null; createdAt: string;
  client?: { id: string; legalName: string; tradeName: string | null } | null; replayed?: boolean;
}

export interface PaymentDetail extends PaymentRow {
  applications: { id: string; invoiceId: string; invoice: { id: string; invoiceNumber: string; status: InvoiceStatus; totalAmount: number } | null; amount: number; appliedOn: string; reversedAt: string | null; reverseReason: string | null }[];
  withholdings: { id: string; invoiceId: string; invoice: { id: string; invoiceNumber: string } | null; taxType: TaxType; amount: number; certificateNumber: string | null; reversedAt: string | null; reverseReason: string | null }[];
  log: { id: string; action: string; actorId: string; note: string | null; createdAt: string }[];
  permissions: { canVoid: boolean; canUnapply: boolean };
}

export interface Paged<T> { page: number; pageSize: number; total: number; items: T[] }

// ── Entradas ────────────────────────────────────────────────────────────────
export interface SetFeeData {
  feeType: FeeType; totalAmount?: number; importFromProposal?: boolean; paymentTermDays?: number;
  progressMethod?: FeeProgressMethod; manualProgressPct?: number; notes?: string;
}
export interface AmendFeeData { date: string; reason: string; amountDelta: number }
export interface MilestoneData { label: string; date: string; percent?: number; amount?: number }
export interface GenerateScheduleData {
  mode: 'EQUAL' | 'MILESTONES' | 'SINGLE'; count?: number; firstDate?: string; everyMonths?: number; milestones?: MilestoneData[]; label?: string; replacePlanned?: boolean;
}
export interface ScheduleItemData { label: string; kind?: ScheduleItemKind; dueDate: string; amount: number }
export interface WithholdingInput { taxType: TaxType; amount: number; certificateNumber?: string }
export interface RegisterInvoiceData {
  engagementId: string; scheduleItemId?: string; invoiceNumber: string; generationCode?: string; documentType: DocumentType;
  invoiceDate: string; dueDate?: string; description?: string; netAmount: number; taxAmount?: number; withholdings?: WithholdingInput[];
  /** Factura de horas (consultoría por tiempo): las horas cerradas que se facturan; el neto debe ser su suma exacta. */
  timeEntryIds?: string[];
}
export type UpdateInvoiceData = Partial<Omit<RegisterInvoiceData, 'engagementId' | 'scheduleItemId' | 'withholdings' | 'timeEntryIds'>>;
export interface RegisterPaymentData {
  clientId: string; paymentDate: string; amount: number; method: PaymentMethod; reference?: string; notes?: string; clientRequestId?: string;
  applications?: { invoiceId: string; amount: number }[]; autoAllocate?: boolean; withholdings?: (WithholdingInput & { invoiceId: string })[];
}
export interface UpdatePaymentData { paymentDate?: string; method?: PaymentMethod; reference?: string; notes?: string; amount?: number }

// ── Consultas ───────────────────────────────────────────────────────────────
const KEY = 'collections';
const qs = (p: Record<string, string | number | boolean | undefined>) => {
  const u = new URLSearchParams();
  Object.entries(p).forEach(([k, v]) => { if (v !== undefined && v !== '' && v !== false) u.set(k, String(v)); });
  const s = u.toString();
  return s ? `?${s}` : '';
};

export function useEngagementFee(engagementId: string | undefined, enabled = true) {
  return useQuery<FeeView>({
    queryKey: [KEY, 'fee', engagementId],
    queryFn: () => apiClient.get(`/collections/engagements/${engagementId}/fee`),
    enabled: enabled && !!engagementId, staleTime: 10_000,
  });
}

export interface InvoiceFilters { clientId?: string; engagementId?: string; status?: InvoiceStatus; open?: boolean; overdue?: boolean; search?: string; from?: string; to?: string; page?: number; pageSize?: number }
export function useInvoices(f: InvoiceFilters, enabled = true) {
  return useQuery<Paged<InvoiceRow>>({
    queryKey: [KEY, 'invoices', f],
    queryFn: () => apiClient.get(`/collections/invoices${qs({ ...f, open: f.open ? 'true' : undefined, overdue: f.overdue ? 'true' : undefined })}`),
    enabled, staleTime: 10_000,
  });
}

export function useInvoice(id: string | null) {
  return useQuery<InvoiceDetail>({ queryKey: [KEY, 'invoice', id], queryFn: () => apiClient.get(`/collections/invoices/${id}`), enabled: !!id });
}

// ── Horas por facturar (Fase 4) ──
export interface BillableEntry { id: string; workDate: string; hours: number; amount: number; description: string | null; afterClose: boolean }
export interface BillableGroup { userId: string; userName: string; month: string; rate: number; hours: number; amount: number; entries: BillableEntry[] }
export type BillableBlockedReason = 'NO_FEE' | 'NOT_TIME_BASED' | 'NO_AUDIT' | 'CANCELLED' | 'CLOSE_DISABLED';
export interface BillableHoursView {
  engagement: { id: string; kind: 'AUDIT' | 'CONSULTING'; title: string | null; status: string; clientId: string; auditId: string | null };
  feeType: FeeType | null; closeEnabled: boolean; canInvoice: boolean; blockedReason: BillableBlockedReason | null; maxPerInvoice: number;
  invoiceable: { count: number; hours: number; amount: number };
  groups: BillableGroup[];
  provisional: { count: number; hours: number; amount: number; unratedHours: number };
  withoutRate: { count: number; hours: number; groups: { userId: string; userName: string; month: string; hours: number; count: number }[] };
  invoiced: { count: number; hours: number; amount: number };
}
export interface ReadyToInvoice { closeEnabled: boolean; items: { engagementId: string; title: string | null; clientName: string; count: number; hours: number; amount: number }[] }

export function useBillableHours(engagementId: string | null, enabled = true) {
  return useQuery<BillableHoursView>({
    queryKey: [KEY, 'billable-hours', engagementId],
    queryFn: () => apiClient.get(`/collections/engagements/${engagementId}/billable-hours`),
    enabled: enabled && !!engagementId, staleTime: 10_000,
  });
}

export function useReadyToInvoice(enabled = true) {
  return useQuery<ReadyToInvoice>({ queryKey: [KEY, 'billable-hours', 'ready'], queryFn: () => apiClient.get('/collections/billable-hours/ready'), enabled, staleTime: 15_000 });
}

export interface PaymentFilters { clientId?: string; status?: PaymentStatus; unapplied?: boolean; from?: string; to?: string; page?: number; pageSize?: number }
export function usePayments(f: PaymentFilters, enabled = true) {
  return useQuery<Paged<PaymentRow>>({
    queryKey: [KEY, 'payments', f],
    queryFn: () => apiClient.get(`/collections/payments${qs({ ...f, unapplied: f.unapplied ? 'true' : undefined })}`),
    enabled, staleTime: 10_000,
  });
}

export function usePayment(id: string | null) {
  return useQuery<PaymentDetail>({ queryKey: [KEY, 'payment', id], queryFn: () => apiClient.get(`/collections/payments/${id}`), enabled: !!id });
}

export interface WithholdingFilters { clientId?: string; invoiceId?: string; taxType?: TaxType; from?: string; to?: string; includeReversed?: boolean; page?: number; pageSize?: number }
export interface WithholdingPage extends Paged<WithholdingRow> { totalAmount: number }
export function useWithholdings(f: WithholdingFilters, enabled = true) {
  return useQuery<WithholdingPage>({
    queryKey: [KEY, 'withholdings', f],
    queryFn: () => apiClient.get(`/collections/withholdings${qs({ ...f, includeReversed: f.includeReversed ? 'true' : undefined })}`),
    enabled, staleTime: 10_000,
  });
}

// ── Mutaciones (todas invalidan la cobranza completa: es la forma segura de mantener saldos al día) ──
function useCollectionsMutation<TIn, TOut = unknown>(fn: (data: TIn) => Promise<TOut>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => { qc.invalidateQueries({ queryKey: [KEY] }); } });
}

const base = '/collections';
export const useSetFee = () => useCollectionsMutation(({ engagementId, data }: { engagementId: string; data: SetFeeData }) => apiClient.put<FeeView>(`${base}/engagements/${engagementId}/fee`, data));
export const useDeleteFee = () => useCollectionsMutation((engagementId: string) => apiClient.delete(`${base}/engagements/${engagementId}/fee`));
export const useAmendFee = () => useCollectionsMutation(({ engagementId, data }: { engagementId: string; data: AmendFeeData }) => apiClient.post<FeeView>(`${base}/engagements/${engagementId}/fee/amendments`, data));
export const useGenerateSchedule = () => useCollectionsMutation(({ engagementId, data }: { engagementId: string; data: GenerateScheduleData }) => apiClient.post<FeeView>(`${base}/engagements/${engagementId}/schedule/generate`, data));
export const useCreateScheduleItem = () => useCollectionsMutation(({ engagementId, data }: { engagementId: string; data: ScheduleItemData }) => apiClient.post(`${base}/engagements/${engagementId}/schedule`, data));
export const useUpdateScheduleItem = () => useCollectionsMutation(({ itemId, data }: { itemId: string; data: Partial<ScheduleItemData> }) => apiClient.patch(`${base}/schedule/${itemId}`, data));
export const useCancelScheduleItem = () => useCollectionsMutation((itemId: string) => apiClient.post(`${base}/schedule/${itemId}/cancel`, {}));
export const useDeleteScheduleItem = () => useCollectionsMutation((itemId: string) => apiClient.delete(`${base}/schedule/${itemId}`));

export const useRegisterInvoice = () => useCollectionsMutation((data: RegisterInvoiceData) => apiClient.post<InvoiceRow>(`${base}/invoices`, data));
export const useUpdateInvoice = () => useCollectionsMutation(({ id, data }: { id: string; data: UpdateInvoiceData }) => apiClient.patch<InvoiceRow>(`${base}/invoices/${id}`, data));
export const useVoidInvoice = () => useCollectionsMutation(({ id, reason }: { id: string; reason: string }) => apiClient.post<InvoiceRow>(`${base}/invoices/${id}/void`, { reason }));
export const useAddWithholding = () => useCollectionsMutation(({ invoiceId, data }: { invoiceId: string; data: WithholdingInput & { appliedOn?: string } }) => apiClient.post(`${base}/invoices/${invoiceId}/withholdings`, data));
export const useReverseWithholding = () => useCollectionsMutation(({ id, reason }: { id: string; reason: string }) => apiClient.post(`${base}/withholdings/${id}/reverse`, { reason }));

export const useRegisterPayment = () => useCollectionsMutation((data: RegisterPaymentData) => apiClient.post<PaymentDetail>(`${base}/payments`, data));
export const useUpdatePayment = () => useCollectionsMutation(({ id, data }: { id: string; data: UpdatePaymentData }) => apiClient.patch<PaymentDetail>(`${base}/payments/${id}`, data));
export const useApplyPayment = () => useCollectionsMutation(({ id, applications, withholdings }: { id: string; applications: { invoiceId: string; amount: number }[]; withholdings?: (WithholdingInput & { invoiceId: string })[] }) => apiClient.post<PaymentDetail>(`${base}/payments/${id}/apply`, { applications, withholdings }));
export const useRemoveApplication = () => useCollectionsMutation(({ paymentId, applicationId, reason }: { paymentId: string; applicationId: string; reason: string }) => apiClient.post<PaymentDetail>(`${base}/payments/${paymentId}/applications/${applicationId}/remove`, { reason }));
export const useVoidPayment = () => useCollectionsMutation(({ id, reason }: { id: string; reason: string }) => apiClient.post<PaymentDetail>(`${base}/payments/${id}/void`, { reason }));
