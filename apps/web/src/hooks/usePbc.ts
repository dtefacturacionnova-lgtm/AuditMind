'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────
export type PbcStatus = 'PENDING' | 'SUBMITTED' | 'ACCEPTED' | 'REJECTED' | 'OVERDUE';

export interface PbcMessage {
  id: string;
  requestId: string;
  senderEmail: string;
  senderName: string;
  isAuditor: boolean;
  content: string;
  attachmentUrls: string[];
  createdAt: string;
}

export interface PbcRequest {
  id: string;
  auditId: string;
  organizationId: string;
  title: string;
  description: string;
  requestedToEmail: string;
  requestedToName?: string;
  dueDate: string;
  status: PbcStatus;
  portalToken: string;
  fileUrls: string[];
  rejectionReason?: string;
  submittedAt?: string;
  acceptedAt?: string;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  audit?: { id: string; title: string; startDate?: string; endDate?: string };
  messages?: PbcMessage[];
  _count?: { messages: number };
}

export interface PbcStats {
  byStatus: { status: PbcStatus; _count: { id: number } }[];
  overdue: number;
}

export interface CreatePbcData {
  auditId: string;
  title: string;
  description?: string;
  assignedToEmail: string;
  assignedToName?: string;
  dueDate: string;
}

// ─── Queries ──────────────────────────────────────────────────────────────────
export function usePbcRequestsForOrg(filters?: {
  status?: PbcStatus;
  page?: number;
  limit?: number;
}) {
  return useQuery<{ data: PbcRequest[]; meta: { total: number; page: number; totalPages: number } }>({
    queryKey: ['pbc', 'org', filters],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters?.status) params.set('status', filters.status);
      if (filters?.page)   params.set('page',   String(filters.page));
      if (filters?.limit)  params.set('limit',  String(filters.limit));
      const qs = params.toString();
      return apiClient.get(`/pbc/org${qs ? `?${qs}` : ''}`);
    },
    staleTime: 30_000,
  });
}

export function usePbcRequestsForAudit(auditId: string) {
  return useQuery<PbcRequest[]>({
    queryKey: ['pbc', 'audit', auditId],
    queryFn:  () => apiClient.get(`/pbc/by-audit/${auditId}`),
    enabled:  !!auditId,
    staleTime: 30_000,
  });
}

export function usePbcRequest(id: string) {
  return useQuery<PbcRequest>({
    queryKey: ['pbc', id],
    queryFn:  () => apiClient.get(`/pbc/${id}`),
    enabled:  !!id,
    staleTime: 15_000,
  });
}

export function usePbcStats(auditId: string) {
  return useQuery<PbcStats>({
    queryKey: ['pbc', 'stats', auditId],
    queryFn:  () => apiClient.get(`/pbc/stats/${auditId}`),
    enabled:  !!auditId,
    staleTime: 30_000,
  });
}

/** Portal público — sin autenticación (apiClient envía sin Bearer si no hay sesión) */
export function usePortalRequest(token: string) {
  return useQuery<PbcRequest>({
    queryKey: ['portal', token],
    queryFn:  () => apiClient.get(`/pbc/portal/${token}`),
    enabled:  !!token,
    staleTime: 15_000,
    retry: false,
  });
}

// ─── Mutations autenticadas ───────────────────────────────────────────────────
export function useCreatePbcRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreatePbcData) => apiClient.post<PbcRequest>('/pbc', data),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['pbc', 'org'] });
      qc.invalidateQueries({ queryKey: ['pbc', 'audit', res.auditId] });
    },
  });
}

export function useAddAuditorMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, content, attachmentUrls }: { id: string; content: string; attachmentUrls?: string[] }) =>
      apiClient.post(`/pbc/${id}/message`, { content, attachmentUrls }),
    onSuccess: (_: unknown, vars: { id: string; content: string; attachmentUrls?: string[] }) => {
      qc.invalidateQueries({ queryKey: ['pbc', vars.id] });
    },
  });
}

export function useReviewPbc() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status, notes }: { id: string; status: string; notes?: string }) =>
      apiClient.patch<PbcRequest>(`/pbc/${id}/review`, { status, notes }),
    onSuccess: (res: PbcRequest) => {
      qc.invalidateQueries({ queryKey: ['pbc', res.id] });
      qc.invalidateQueries({ queryKey: ['pbc', 'org'] });
      qc.invalidateQueries({ queryKey: ['pbc', 'audit', res.auditId] });
    },
  });
}

export function useRegenerateToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.post<{ id: string; portalToken: string }>(`/pbc/${id}/regenerate-token`, {}),
    onSuccess: (_: unknown, id: string) => {
      qc.invalidateQueries({ queryKey: ['pbc', id] });
      qc.invalidateQueries({ queryKey: ['pbc', 'org'] });
    },
  });
}

// ─── Mutations públicas del portal ────────────────────────────────────────────
export function useAddPortalMessage(token: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ content, attachmentUrls }: { content: string; attachmentUrls?: string[] }) =>
      apiClient.post(`/pbc/portal/${token}/message`, { content, attachmentUrls }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['portal', token] });
    },
  });
}

export function useSubmitPortal(token: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ auditeeNotes, fileUrls }: { auditeeNotes?: string; fileUrls?: string[] }) =>
      apiClient.post<PbcRequest>(`/pbc/portal/${token}/submit`, { auditeeNotes, fileUrls }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['portal', token] });
    },
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
export const PBC_STATUS_CONFIG: Record<PbcStatus, { label: string; color: string; bg: string; dot: string }> = {
  PENDING:   { label: 'Pendiente',  color: 'text-amber-700',   bg: 'bg-amber-50 border-amber-200',    dot: 'bg-amber-400' },
  SUBMITTED: { label: 'Enviada',    color: 'text-blue-700',    bg: 'bg-blue-50 border-blue-200',      dot: 'bg-blue-500' },
  ACCEPTED:  { label: 'Aceptada',   color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', dot: 'bg-emerald-500' },
  REJECTED:  { label: 'Rechazada',  color: 'text-red-700',     bg: 'bg-red-50 border-red-200',        dot: 'bg-red-500' },
  OVERDUE:   { label: 'Vencida',    color: 'text-red-700',     bg: 'bg-red-50 border-red-200',        dot: 'bg-red-600' },
};
