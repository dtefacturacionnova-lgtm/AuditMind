'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

// Cobranza · fase 3c (antigüedad, estado de cuenta, devengado) y 3d (notas de crédito, castigos, gestión de cobro).
// Los tipos reflejan reports.service.ts, accrual.service.ts, credit-notes.service.ts, write-offs.service.ts y collection-notes.service.ts.
// Se invalida la misma llave 'collections' que usa useCollections.ts: cualquier movimiento de dinero refresca todo.

const KEY = 'collections';
const base = '/collections';
const qs = (p: Record<string, string | number | boolean | undefined>) => {
  const u = new URLSearchParams();
  Object.entries(p).forEach(([k, v]) => { if (v !== undefined && v !== '' && v !== false) u.set(k, String(v)); });
  const s = u.toString();
  return s ? `?${s}` : '';
};

// ── Notas de crédito y castigos ─────────────────────────────────────────────
export interface CreditNoteRow {
  id: string; clientId: string; engagementId: string; invoiceId: string; creditNoteNumber: string; generationCode: string | null; issueDate: string;
  netAmount: number; taxAmount: number; totalAmount: number; reason: string; status: 'ACTIVE' | 'VOID'; voidedAt: string | null; voidReason: string | null; createdAt: string;
}
export interface WriteOffRow {
  id: string; clientId: string; invoiceId: string; amount: number; writtenOffOn: string; reason: string; status: 'ACTIVE' | 'REVERSED';
  reversedAt: string | null; reverseReason: string | null; createdAt: string;
}
export interface RegisterCreditNoteData { creditNoteNumber: string; generationCode?: string; issueDate?: string; netAmount: number; taxAmount?: number; reason: string }
export interface RegisterWriteOffData { amount: number; writtenOffOn?: string; reason: string }

// ── Gestión de cobro ────────────────────────────────────────────────────────
export type ContactMethod = 'CALL' | 'EMAIL' | 'WHATSAPP' | 'VISIT' | 'MEETING' | 'OTHER';
export type PromiseStatus = 'PENDING' | 'KEPT' | 'BROKEN' | 'CANCELLED';
export const CONTACT_METHOD_LABEL: Record<ContactMethod, string> = {
  CALL: 'Llamada', EMAIL: 'Correo', WHATSAPP: 'WhatsApp', VISIT: 'Visita', MEETING: 'Reunión', OTHER: 'Otro',
};
export const PROMISE_STATUS_CONFIG: Record<PromiseStatus, { label: string; bg: string; color: string }> = {
  PENDING: { label: 'Pendiente', bg: 'bg-amber-50', color: 'text-amber-700' },
  KEPT: { label: 'Cumplida', bg: 'bg-emerald-50', color: 'text-emerald-700' },
  BROKEN: { label: 'Incumplida', bg: 'bg-red-50', color: 'text-red-700' },
  CANCELLED: { label: 'Cancelada', bg: 'bg-gray-100', color: 'text-gray-500' },
};

export interface CollectionNoteRow {
  id: string; clientId: string; invoiceId: string | null; engagementId: string | null; contactedOn: string; method: ContactMethod;
  contactName: string | null; note: string; promiseDate: string | null; promiseAmount: number | null; promiseStatus: PromiseStatus | null;
  promiseOverdue: boolean; possiblyKept: boolean; nextFollowUpOn: string | null; createdById: string; createdByName: string | null;
  createdAt: string; updatedAt: string; client: { id: string; legalName: string; tradeName: string | null } | null; invoiceNumber: string | null;
}
export interface CreateCollectionNoteData {
  clientId: string; invoiceId?: string; engagementId?: string; contactedOn?: string; method: ContactMethod; contactName?: string; note: string;
  promiseDate?: string; promiseAmount?: number; nextFollowUpOn?: string;
}
export interface UpdateCollectionNoteData {
  contactedOn?: string; method?: ContactMethod; contactName?: string; note?: string; promiseDate?: string; promiseAmount?: number; nextFollowUpOn?: string;
}
export interface Alerts {
  asOf: string; staleDays: number;
  overduePromises: CollectionNoteRow[]; followUps: CollectionNoteRow[];
  unattendedInvoices: { id: string; invoiceNumber: string; clientId: string; client: { id: string; legalName: string; tradeName: string | null } | null; dueDate: string; overdueDays: number; balance: number }[];
  counts: { overduePromises: number; followUps: number; unattendedInvoices: number };
}

// ── Antigüedad y estado de cuenta ───────────────────────────────────────────
export type AgingBucketKey = 'CURRENT' | 'D1_30' | 'D31_60' | 'D61_90' | 'D90_PLUS';
export const AGING_BUCKETS: { key: AgingBucketKey; label: string }[] = [
  { key: 'CURRENT', label: 'Corriente' }, { key: 'D1_30', label: '1-30 días' }, { key: 'D31_60', label: '31-60' }, { key: 'D61_90', label: '61-90' }, { key: 'D90_PLUS', label: 'Más de 90' },
];
export interface AgingInvoice { invoiceId: string; invoiceNumber: string; invoiceDate: string; dueDate: string; overdueDays: number; bucket: AgingBucketKey; balance: number }
export interface AgingClient {
  clientId: string; client: { id: string; legalName: string; tradeName: string | null } | null; buckets: Record<AgingBucketKey, number>; total: number;
  unappliedCredit: number; invoiceCount: number; invoices?: AgingInvoice[];
}
export interface AgingReport {
  asOf: string; buckets: Record<AgingBucketKey, number>; total: number; unappliedCredit: number; clients: AgingClient[];
  creditOnly: { clientId: string; client: { id: string; legalName: string; tradeName: string | null } | null; unappliedCredit: number }[];
}
export interface Statement {
  asOf: string; from: string | null; client: { id: string; legalName: string; tradeName: string | null; taxId: string | null };
  openingBalance: number; closingBalance: number; unappliedCredit: number; reconciles: boolean;
  lines: { date: string; kind: string; reference: string; description: string; debit: number; credit: number; balance: number }[];
  openInvoices: { invoiceNumber: string; invoiceDate: string; dueDate: string; overdueDays: number; balance: number; bucket: AgingBucketKey }[];
  buckets: Partial<Record<AgingBucketKey, number>>;
}

// ── Devengado ───────────────────────────────────────────────────────────────
export interface AccrualView {
  asOf: string; feeType: 'FIXED' | 'TIME_BASED'; feeTotal: number | null; method: 'HOURS' | 'MILESTONES' | 'MANUAL'; invoicedNet: number;
  billableHours: number; budgetHours: number | null; completionDone: boolean; progressPct: number | null; accrued: number | null; toInvoice: number | null;
  basis: 'HOURS' | 'COMPLETION' | 'MILESTONES' | 'MANUAL' | 'INVOICED' | 'NONE'; missing: 'NO_BUDGET' | 'NO_MANUAL_PROGRESS' | null;
}

// ── Consultas ───────────────────────────────────────────────────────────────
export function useAging(f: { asOf?: string; clientId?: string; detail?: boolean }, enabled = true) {
  return useQuery<AgingReport>({
    queryKey: [KEY, 'aging', f],
    queryFn: () => apiClient.get(`${base}/reports/aging${qs({ ...f, detail: f.detail ? 'true' : undefined })}`),
    enabled, staleTime: 10_000,
  });
}

export function useStatement(clientId: string | null, f: { asOf?: string; from?: string }) {
  return useQuery<Statement>({
    queryKey: [KEY, 'statement', clientId, f],
    queryFn: () => apiClient.get(`${base}/clients/${clientId}/statement${qs(f)}`),
    enabled: !!clientId,
  });
}

export function useCollectionNotes(f: { clientId?: string; invoiceId?: string; engagementId?: string; promiseStatus?: PromiseStatus; page?: number; pageSize?: number }, enabled = true) {
  return useQuery<{ page: number; pageSize: number; total: number; items: CollectionNoteRow[] }>({
    queryKey: [KEY, 'notes', f],
    queryFn: () => apiClient.get(`${base}/collection-notes${qs(f)}`),
    enabled, staleTime: 10_000,
  });
}

export function useAlerts(enabled = true) {
  return useQuery<Alerts>({ queryKey: [KEY, 'alerts'], queryFn: () => apiClient.get(`${base}/alerts`), enabled, staleTime: 30_000 });
}

// ── Mutaciones ──────────────────────────────────────────────────────────────
function useCollectionsMutation<TIn, TOut = unknown>(fn: (data: TIn) => Promise<TOut>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => { qc.invalidateQueries({ queryKey: [KEY] }); } });
}

export const useRegisterCreditNote = () => useCollectionsMutation(({ invoiceId, data }: { invoiceId: string; data: RegisterCreditNoteData }) => apiClient.post<CreditNoteRow>(`${base}/invoices/${invoiceId}/credit-notes`, data));
export const useVoidCreditNote = () => useCollectionsMutation(({ id, reason }: { id: string; reason: string }) => apiClient.post<CreditNoteRow>(`${base}/credit-notes/${id}/void`, { reason }));
export const useRegisterWriteOff = () => useCollectionsMutation(({ invoiceId, data }: { invoiceId: string; data: RegisterWriteOffData }) => apiClient.post<WriteOffRow>(`${base}/invoices/${invoiceId}/write-offs`, data));
export const useReverseWriteOff = () => useCollectionsMutation(({ id, reason }: { id: string; reason: string }) => apiClient.post<WriteOffRow>(`${base}/write-offs/${id}/reverse`, { reason }));

export const useCreateCollectionNote = () => useCollectionsMutation((data: CreateCollectionNoteData) => apiClient.post<CollectionNoteRow>(`${base}/collection-notes`, data));
export const useUpdateCollectionNote = () => useCollectionsMutation(({ id, data }: { id: string; data: UpdateCollectionNoteData }) => apiClient.patch<CollectionNoteRow>(`${base}/collection-notes/${id}`, data));
export const useSetPromiseStatus = () => useCollectionsMutation(({ id, status }: { id: string; status: PromiseStatus }) => apiClient.patch<CollectionNoteRow>(`${base}/collection-notes/${id}/promise`, { status }));
export const useDeleteCollectionNote = () => useCollectionsMutation((id: string) => apiClient.delete(`${base}/collection-notes/${id}`));

/** Marcar (o desmarcar con null) una cuota como cumplida: alimenta el devengado por hitos. */
export const useSetItemCompletion = () => useCollectionsMutation(({ itemId, completedOn }: { itemId: string; completedOn: string | null }) => apiClient.post(`${base}/schedule/${itemId}/completion`, { completedOn }));
