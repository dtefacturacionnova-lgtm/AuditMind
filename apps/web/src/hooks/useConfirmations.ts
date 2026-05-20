'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────
export type ConfirmationStatus =
  | 'DRAFT' | 'SENT' | 'RECEIVED' | 'RECONCILED' | 'NO_RESPONSE' | 'ALT_PROCEDURE';

export type ConfirmationType = 'BANK' | 'CLIENT' | 'LAWYER' | 'SUPPLIER' | 'OTHER';

export interface ExternalConfirmation {
  id:                   string;
  auditId:              string;
  type:                 ConfirmationType;
  respondentName:       string;
  respondentEmail:      string;
  amount?:              number;
  accountRef?:          string;
  sentAt?:              string;
  sentBy?:              string;
  responseReceivedAt?:  string;
  responseContent?:     string;
  responseAmount?:      number;
  difference?:          number;
  differenceExplanation?: string;
  alternativeProcedure?:  string;
  status:               ConfirmationStatus;
  createdAt:            string;
  updatedAt:            string;
  audit?: { id: string; title: string };
}

export interface ConfirmationStats {
  total:        number;
  draft:        number;
  sent:         number;
  received:     number;
  reconciled:   number;
  noResponse:   number;
  altProcedure: number;
}

export interface CreateConfirmationData {
  auditId:        string;
  type:           ConfirmationType;
  respondentName: string;
  respondentEmail:string;
  amount?:        number;
  accountRef?:    string;
}

// ─── Queries ──────────────────────────────────────────────────────────────────
export function useConfirmationsForAudit(auditId: string) {
  return useQuery<ExternalConfirmation[]>({
    queryKey:  ['confirmations', 'audit', auditId],
    queryFn:   () => apiClient.get(`/confirmations/by-audit/${auditId}`),
    enabled:   !!auditId,
    staleTime: 30_000,
  });
}

export function useConfirmationsForOrg(filters?: {
  status?: ConfirmationStatus;
  page?:   number;
  limit?:  number;
}) {
  return useQuery<{ data: ExternalConfirmation[]; meta: { total: number; page: number; totalPages: number } }>({
    queryKey: ['confirmations', 'org', filters],
    queryFn:  () => {
      const params = new URLSearchParams();
      if (filters?.status) params.set('status', filters.status);
      if (filters?.page)   params.set('page',   String(filters.page));
      if (filters?.limit)  params.set('limit',  String(filters.limit));
      const qs = params.toString();
      return apiClient.get(`/confirmations/org${qs ? `?${qs}` : ''}`);
    },
    staleTime: 30_000,
  });
}

export function useConfirmation(id: string) {
  return useQuery<ExternalConfirmation>({
    queryKey:  ['confirmation', id],
    queryFn:   () => apiClient.get(`/confirmations/${id}`),
    enabled:   !!id,
    staleTime: 15_000,
  });
}

export function useConfirmationStats() {
  return useQuery<ConfirmationStats>({
    queryKey:  ['confirmations', 'stats'],
    queryFn:   () => apiClient.get('/confirmations/org/stats'),
    staleTime: 30_000,
  });
}

// ─── Mutations ────────────────────────────────────────────────────────────────
export function useCreateConfirmation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateConfirmationData) =>
      apiClient.post<ExternalConfirmation>('/confirmations', data),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['confirmations', 'audit', res.auditId] });
      qc.invalidateQueries({ queryKey: ['confirmations', 'org'] });
      qc.invalidateQueries({ queryKey: ['confirmations', 'stats'] });
    },
  });
}

export function useUpdateConfirmation(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<CreateConfirmationData>) =>
      apiClient.patch<ExternalConfirmation>(`/confirmations/${id}`, data),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['confirmation', id] });
      qc.invalidateQueries({ queryKey: ['confirmations', 'audit', res.auditId] });
    },
  });
}

export function useSendConfirmation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient.post<ExternalConfirmation>(`/confirmations/${id}/send`, {}),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['confirmation', res.id] });
      qc.invalidateQueries({ queryKey: ['confirmations', 'audit', res.auditId] });
      qc.invalidateQueries({ queryKey: ['confirmations', 'org'] });
      qc.invalidateQueries({ queryKey: ['confirmations', 'stats'] });
    },
  });
}

export function useReceiveResponse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, responseContent, responseAmount }: {
      id: string; responseContent: string; responseAmount?: number;
    }) => apiClient.post<ExternalConfirmation>(`/confirmations/${id}/receive`, { responseContent, responseAmount }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['confirmation', res.id] });
      qc.invalidateQueries({ queryKey: ['confirmations', 'audit', res.auditId] });
      qc.invalidateQueries({ queryKey: ['confirmations', 'org'] });
      qc.invalidateQueries({ queryKey: ['confirmations', 'stats'] });
    },
  });
}

export function useReconcileConfirmation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, differenceExplanation }: { id: string; differenceExplanation?: string }) =>
      apiClient.post<ExternalConfirmation>(`/confirmations/${id}/reconcile`, { differenceExplanation }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['confirmation', res.id] });
      qc.invalidateQueries({ queryKey: ['confirmations', 'org'] });
      qc.invalidateQueries({ queryKey: ['confirmations', 'stats'] });
    },
  });
}

export function useMarkNoResponse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient.post<ExternalConfirmation>(`/confirmations/${id}/no-response`, {}),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['confirmation', res.id] });
      qc.invalidateQueries({ queryKey: ['confirmations', 'org'] });
      qc.invalidateQueries({ queryKey: ['confirmations', 'stats'] });
    },
  });
}

export function useAltProcedure() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, alternativeProcedure }: { id: string; alternativeProcedure: string }) =>
      apiClient.post<ExternalConfirmation>(`/confirmations/${id}/alt-procedure`, { alternativeProcedure }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['confirmation', res.id] });
      qc.invalidateQueries({ queryKey: ['confirmations', 'org'] });
      qc.invalidateQueries({ queryKey: ['confirmations', 'stats'] });
    },
  });
}

export function useDeleteConfirmation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/confirmations/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['confirmations', 'org'] });
      qc.invalidateQueries({ queryKey: ['confirmations', 'stats'] });
    },
  });
}

// ─── Config ───────────────────────────────────────────────────────────────────
export const CONFIRMATION_STATUS_CONFIG: Record<ConfirmationStatus, {
  label: string; color: string; bg: string; dot: string;
}> = {
  DRAFT:         { label: 'Borrador',             color: 'text-gray-600',   bg: 'bg-gray-100',   dot: 'bg-gray-400' },
  SENT:          { label: 'Enviada',              color: 'text-blue-700',   bg: 'bg-blue-100',   dot: 'bg-blue-500' },
  RECEIVED:      { label: 'Recibida',             color: 'text-amber-700',  bg: 'bg-amber-100',  dot: 'bg-amber-500' },
  RECONCILED:    { label: 'Conciliada',           color: 'text-emerald-700',bg: 'bg-emerald-100',dot: 'bg-emerald-500' },
  NO_RESPONSE:   { label: 'Sin Respuesta',        color: 'text-red-700',    bg: 'bg-red-100',    dot: 'bg-red-500' },
  ALT_PROCEDURE: { label: 'Proc. Alternativo',    color: 'text-purple-700', bg: 'bg-purple-100', dot: 'bg-purple-500' },
};

export const CONFIRMATION_TYPE_CONFIG: Record<ConfirmationType, { label: string; icon: string }> = {
  BANK:     { label: 'Bancaria',     icon: '🏦' },
  CLIENT:   { label: 'Cliente',      icon: '🏢' },
  LAWYER:   { label: 'Abogado',      icon: '⚖️' },
  SUPPLIER: { label: 'Proveedor',    icon: '📦' },
  OTHER:    { label: 'Otra',         icon: '📋' },
};

export function formatAmount(amount?: number | null): string {
  if (amount == null) return '—';
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(amount);
}
