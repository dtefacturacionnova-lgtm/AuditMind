'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type PhaseType = 'PLANNING' | 'FIELDWORK' | 'REPORTING' | 'FOLLOWUP';
export type PhaseStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETE' | 'LOCKED';

export interface AuditFolder {
  id: string;
  ref: string;
  name: string;
  description?: string;
  phaseId?: string;
  parentId?: string;
  sortOrder: number;
  children: AuditFolder[];
  _count: { papers: number };
}

export interface AuditPhase {
  id: string;
  phaseType: PhaseType;
  name: string;
  order: number;
  status: PhaseStatus;
  startDate?: string;
  targetDate?: string;
  signedOffAt?: string;
  signedOffBy?: { id: string; name: string };
  folders: AuditFolder[];
}

// ─── Config de fases ──────────────────────────────────────────────────────────

export const PHASE_CONFIG: Record<PhaseType, { label: string; color: string; bg: string; border: string }> = {
  PLANNING:  { label: 'Planificación',          color: 'text-blue-700',   bg: 'bg-blue-50',   border: 'border-blue-200' },
  FIELDWORK: { label: 'Ejecución',              color: 'text-amber-700',  bg: 'bg-amber-50',  border: 'border-amber-200' },
  REPORTING: { label: 'Informe',                color: 'text-purple-700', bg: 'bg-purple-50', border: 'border-purple-200' },
  FOLLOWUP:  { label: 'Eventos Posteriores',    color: 'text-emerald-700',bg: 'bg-emerald-50',border: 'border-emerald-200' },
};

export const PHASE_STATUS_CONFIG: Record<PhaseStatus, { label: string; color: string }> = {
  PENDING:     { label: 'Pendiente',  color: 'text-gray-500' },
  IN_PROGRESS: { label: 'En curso',   color: 'text-amber-600' },
  COMPLETE:    { label: 'Completada', color: 'text-emerald-600' },
  LOCKED:      { label: 'Bloqueada',  color: 'text-gray-400' },
};

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useExpediente(auditId: string) {
  return useQuery<AuditPhase[]>({
    queryKey: ['expediente', auditId],
    queryFn: () => apiClient.get(`/audits/${auditId}/expediente`),
    enabled: !!auditId,
  });
}

export function useInitializeExpediente(auditId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.post(`/audits/${auditId}/expediente/initialize`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['expediente', auditId] }),
  });
}

export function useCreateFolder(auditId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      ref: string; name: string; phaseId?: string;
      parentId?: string; description?: string; sortOrder?: number;
    }) => apiClient.post(`/audits/${auditId}/expediente/folders`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['expediente', auditId] }),
  });
}

export function useUpdateFolder(auditId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ folderId, data }: {
      folderId: string;
      data: { ref?: string; name?: string; description?: string; sortOrder?: number };
    }) => apiClient.patch(`/audits/${auditId}/expediente/folders/${folderId}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['expediente', auditId] }),
  });
}

export function useDeleteFolder(auditId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (folderId: string) =>
      apiClient.delete(`/audits/${auditId}/expediente/folders/${folderId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['expediente', auditId] }),
  });
}

export function useSignOffPhase(auditId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (phaseId: string) =>
      apiClient.post(`/audits/${auditId}/expediente/phases/${phaseId}/sign-off`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['expediente', auditId] }),
  });
}

export function useAssignPaperToFolder(auditId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ paperId, folderId }: { paperId: string; folderId: string | null }) =>
      apiClient.patch(`/audits/${auditId}/expediente/papers/${paperId}/assign`, { folderId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expediente', auditId] });
      qc.invalidateQueries({ queryKey: ['working-papers'] });
    },
  });
}
