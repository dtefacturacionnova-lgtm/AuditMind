'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { createClient } from '@/lib/supabase/client';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type PhaseType = 'PLANNING' | 'FIELDWORK' | 'REPORTING' | 'FOLLOWUP';
export type PhaseStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETE' | 'LOCKED';

/** Resumen mínimo de un papel en el árbol del expediente */
export interface WpStub {
  id: string;
  ref?: string;
  code: string;
  title: string;
  status: string;
  wpKind: 'STANDARD' | 'SMART' | 'MASTER' | 'LIVE' | 'FILE';
  type: string;
  mimeType?: string;
  originalFilename?: string;
  fileUrl?: string;
  createdAt: string;
  preparedBy?: { id: string; name: string; avatarUrl?: string | null };
  reviewedBy?:  { id: string; name: string; avatarUrl?: string | null };
  _count?: { comments: number; findings: number; tickEntries: number };
}

export interface AuditFolder {
  id: string;
  ref: string;
  name: string;
  description?: string;
  phaseId?: string;
  parentId?: string;
  sortOrder: number;
  children: AuditFolder[];
  papers: WpStub[];            // archivos + papeles en esta carpeta
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
    mutationFn: (templateId?: string) =>
      apiClient.post(`/audits/${auditId}/expediente/initialize`, { templateId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['expediente', auditId] }),
  });
}

export function useInitializeFromAuditTemplate(auditId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiClient.post(`/audits/${auditId}/expediente/initialize-from-template`, {}),
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

export function useDeleteWorkingPaper(auditId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (paperId: string) => apiClient.delete(`/working-papers/${paperId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expediente', auditId] });
      qc.invalidateQueries({ queryKey: ['wps', 'audit', auditId] });
    },
  });
}

export function useRenamePaper(auditId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ paperId, title, ref }: { paperId: string; title: string; ref?: string }) =>
      apiClient.patch(`/working-papers/${paperId}`, { title, ...(ref !== undefined && { ref }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['expediente', auditId] }),
  });
}

// ─── Subir archivo a una carpeta del expediente ───────────────────────────────
// 1. Upload directo a Supabase Storage (bucket "audit-files")
// 2. Registro del WP en la API como wpKind = FILE

export interface UploadFileArgs {
  folderId: string;
  file: File;
  title: string;
  ref?: string;
}

export function useUploadFileToFolder(auditId: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ folderId, file, title, ref }: UploadFileArgs) => {
      // Upload via backend — service-role key bypasses Supabase Storage RLS
      const formData = new FormData();
      formData.append('file', file);

      const params = new URLSearchParams({ title });
      if (ref) params.set('ref', ref);

      return apiClient.postForm(
        `/audits/${auditId}/expediente/folders/${folderId}/upload?${params}`,
        formData,
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expediente', auditId] });
      qc.invalidateQueries({ queryKey: ['wps', 'audit', auditId] });
    },
  });
}
