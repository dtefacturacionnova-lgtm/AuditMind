'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────
export type FindingSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFORMATIONAL';
export type FindingStatus =
  | 'DRAFT' | 'IN_REVIEW' | 'APPROVED' | 'IN_PROGRESS'
  | 'CLOSED' | 'OVERDUE' | 'ACCEPTED_RISK';
export type EscalationLevel = 'NONE' | 'AUDITOR' | 'MANAGER' | 'CAE' | 'COMMITTEE';

export interface FindingAction {
  id: string;
  description: string;
  dueDate: string;
  status: string;
  progressPct: number;
  responsible?: { id: string; name: string };
}

export interface FindingComment {
  id: string;
  content: string;
  isInternal: boolean;
  createdAt: string;
  author: { id: string; name: string; avatarUrl?: string };
}

export interface Finding {
  id: string;
  title: string;
  severity: FindingSeverity;
  status: FindingStatus;
  qualityScore: number;
  condition: string;
  criteria: string;
  cause: string;
  effect: string;
  risk?: string;
  recommendation?: string;
  managementResponse?: string;
  effectAmount?: number;
  isMaterial?: boolean;
  normativeReference?: string;
  normativeArticle?: string;
  isRecurring: boolean;
  escalationLevel: EscalationLevel;
  dueDate?: string;
  closedAt?: string;
  auditId: string;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
  audit?: { id: string; title: string; type?: string; materiality?: number };
  workingPaper?: { id: string; code: string; title?: string };
  responsible?: { id: string; name: string; avatarUrl?: string; email?: string };
  actions?: FindingAction[];         // Prisma relation name
  findingActions?: FindingAction[];   // alias used in UI
  comments?: FindingComment[];
  _count?: { findingActions: number; comments: number };
}

export interface FindingsSummary {
  bySeverity: { severity: FindingSeverity; _count: { id: number } }[];
  byStatus: { status: FindingStatus; _count: { id: number } }[];
  materialCount: number;
  overdueCount: number;
  avgQualityScore?: number;
}

export interface CreateFindingData {
  title: string;
  severity: FindingSeverity;
  auditId: string;
  workingPaperId?: string;
  condition: string;
  criteria: string;
  cause: string;
  effect: string;
  risk?: string;
  recommendation?: string;
  effectAmount?: number;
  isMaterial?: boolean;
  normativeReference?: string;
  normativeArticle?: string;
  isRecurring?: boolean;
}

// ─── Queries ──────────────────────────────────────────────────────────────────
export function useFindingsByAudit(
  auditId: string,
  filters?: { severity?: string; status?: string },
) {
  return useQuery<Finding[]>({
    queryKey: ['findings', 'audit', auditId, filters],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters?.severity) params.set('severity', filters.severity);
      if (filters?.status) params.set('status', filters.status);
      const qs = params.toString();
      return apiClient.get<Finding[]>(`/findings/by-audit/${auditId}${qs ? `?${qs}` : ''}`);
    },
    enabled: !!auditId,
    staleTime: 30_000,
  });
}

export function useFindingsForOrg(filters?: {
  severity?: string;
  status?: string;
  page?: number;
  limit?: number;
}) {
  return useQuery<{ data: Finding[]; meta: { total: number; page: number; totalPages: number } }>({
    queryKey: ['findings', 'org', filters],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters?.severity) params.set('severity', filters.severity);
      if (filters?.status) params.set('status', filters.status);
      if (filters?.page) params.set('page', String(filters.page));
      if (filters?.limit) params.set('limit', String(filters.limit));
      const qs = params.toString();
      return apiClient.get<{ data: Finding[]; meta: { total: number; page: number; totalPages: number } }>(`/findings/org${qs ? `?${qs}` : ''}`);
    },
    staleTime: 30_000,
  });
}

export function useFinding(id: string) {
  return useQuery<Finding>({
    queryKey: ['finding', id],
    queryFn: () => apiClient.get<Finding>(`/findings/${id}`),
    enabled: !!id,
    staleTime: 15_000,
  });
}

export function useFindingsSummary(auditId: string) {
  return useQuery<FindingsSummary>({
    queryKey: ['findings', 'summary', auditId],
    queryFn: () => apiClient.get<FindingsSummary>(`/findings/summary/${auditId}`),
    enabled: !!auditId,
    staleTime: 30_000,
  });
}

export function useOverdueFindings() {
  return useQuery<Finding[]>({
    queryKey: ['findings', 'overdue'],
    queryFn: () => apiClient.get<Finding[]>('/findings/overdue'),
    staleTime: 60_000,
  });
}

// ─── Mutations ────────────────────────────────────────────────────────────────
export function useCreateFinding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateFindingData) => apiClient.post<Finding>('/findings', data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['findings', 'audit', vars.auditId] });
      qc.invalidateQueries({ queryKey: ['findings', 'org'] });
      qc.invalidateQueries({ queryKey: ['findings', 'summary', vars.auditId] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useUpdateFinding(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<CreateFindingData> & { managementResponse?: string }) =>
      apiClient.patch<Finding>(`/findings/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['finding', id] });
      qc.invalidateQueries({ queryKey: ['findings'] });
    },
  });
}

export function useSubmitFinding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.patch<Finding>(`/findings/${id}/submit`, {}),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['finding', data.id] });
      qc.invalidateQueries({ queryKey: ['findings'] });
    },
  });
}

export function useApproveFinding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.patch<Finding>(`/findings/${id}/approve`, {}),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['finding', data.id] });
      qc.invalidateQueries({ queryKey: ['findings'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useRejectFinding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      apiClient.patch<Finding>(`/findings/${id}/reject`, { reason }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['finding', data.id] });
      qc.invalidateQueries({ queryKey: ['findings'] });
    },
  });
}

export function useAssignFindingResponsible() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id, responsibleId, dueDate, actionDescription,
    }: {
      id: string; responsibleId: string; dueDate: string; actionDescription?: string;
    }) =>
      apiClient.patch<Finding>(`/findings/${id}/assign`, { responsibleId, dueDate, actionDescription }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['finding', data.id] });
      qc.invalidateQueries({ queryKey: ['findings'] });
    },
  });
}

export function useCloseFinding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.patch<Finding>(`/findings/${id}/close`, {}),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['finding', data.id] });
      qc.invalidateQueries({ queryKey: ['findings'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useAddFindingComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, content, isInternal }: { id: string; content: string; isInternal?: boolean }) =>
      apiClient.post(`/findings/${id}/comments`, { content, isInternal: isInternal ?? false }),
    onSuccess: (_: unknown, vars: { id: string; content: string; isInternal?: boolean }) => {
      qc.invalidateQueries({ queryKey: ['finding', vars.id] });
    },
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
export const SEVERITY_CONFIG: Record<FindingSeverity, { label: string; color: string; bg: string; dot: string }> = {
  CRITICAL: { label: 'Crítico',      color: 'text-red-700',    bg: 'bg-red-50 border-red-200',      dot: 'bg-red-500' },
  HIGH:     { label: 'Alto',         color: 'text-orange-700', bg: 'bg-orange-50 border-orange-200', dot: 'bg-orange-500' },
  MEDIUM:   { label: 'Medio',        color: 'text-yellow-700', bg: 'bg-yellow-50 border-yellow-200', dot: 'bg-yellow-500' },
  LOW:      { label: 'Bajo',         color: 'text-blue-700',   bg: 'bg-blue-50 border-blue-200',     dot: 'bg-blue-400' },
  INFORMATIONAL: { label: 'Informativo', color: 'text-gray-600', bg: 'bg-gray-50 border-gray-200',  dot: 'bg-gray-400' },
};

export const STATUS_CONFIG: Record<FindingStatus, { label: string; color: string; bg: string }> = {
  DRAFT:        { label: 'Borrador',     color: 'text-gray-600',   bg: 'bg-gray-100' },
  IN_REVIEW:    { label: 'En Revisión',  color: 'text-blue-700',   bg: 'bg-blue-100' },
  APPROVED:     { label: 'Aprobado',     color: 'text-emerald-700',bg: 'bg-emerald-100' },
  IN_PROGRESS:  { label: 'En Progreso',  color: 'text-indigo-700', bg: 'bg-indigo-100' },
  CLOSED:       { label: 'Cerrado',      color: 'text-green-700',  bg: 'bg-green-100' },
  OVERDUE:      { label: 'Vencido',      color: 'text-red-700',    bg: 'bg-red-100' },
  ACCEPTED_RISK:{ label: 'Riesgo Aceptado', color: 'text-purple-700', bg: 'bg-purple-100' },
};

export function qualityScoreColor(score: number): string {
  if (score >= 80) return 'text-emerald-600';
  if (score >= 60) return 'text-amber-600';
  return 'text-red-600';
}

export function qualityScoreBg(score: number): string {
  if (score >= 80) return 'bg-emerald-50 border-emerald-200';
  if (score >= 60) return 'bg-amber-50 border-amber-200';
  return 'bg-red-50 border-red-200';
}
