'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

export type WorkingPaperType =
  | 'PLANNING_UNDERSTANDING'
  | 'CONTROL_EVALUATION'
  | 'SUBSTANTIVE_TEST'
  | 'DATA_ANALYSIS'
  | 'FINDING'
  | 'CLOSURE_CONCLUSION'
  | 'INTERVIEW'
  | 'CONFIRMATION'
  | 'NORMATIVE_ANALYSIS';

export type WpKind = 'STANDARD' | 'SMART' | 'MASTER';

export interface PaperDef {
  code: string;
  indexSection: string;
  title: string;
  type: WorkingPaperType;
  wpKind: WpKind;
  paperCode?: string;
}

export interface AuditTemplate {
  id: string;
  name: string;
  description?: string;
  auditTypes: string[];
  papers: PaperDef[];
  isDefault: boolean;
  isSystem: boolean;
  createdAt: string;
}

export interface CreateAuditTemplateData {
  name: string;
  description?: string;
  auditTypes: string[];
  papers: PaperDef[];
  isDefault?: boolean;
}

export interface UpdateAuditTemplateData extends Partial<CreateAuditTemplateData> {}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useAuditTemplates(auditType?: string) {
  return useQuery<AuditTemplate[]>({
    queryKey: ['audit-templates', auditType ?? ''],
    queryFn: () =>
      apiClient.get('/audit-templates' + (auditType ? `?auditType=${auditType}` : '')),
    staleTime: 60_000,
  });
}

export function useCreateAuditTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateAuditTemplateData) =>
      apiClient.post<AuditTemplate>('/audit-templates', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['audit-templates'] }),
  });
}

export function useUpdateAuditTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateAuditTemplateData }) =>
      apiClient.patch<AuditTemplate>(`/audit-templates/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['audit-templates'] }),
  });
}

export function useDeleteAuditTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/audit-templates/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['audit-templates'] }),
  });
}

export function useDuplicateAuditTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient.post<AuditTemplate>(`/audit-templates/${id}/duplicate`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['audit-templates'] }),
  });
}

export function useSetDefaultAuditTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient.post<AuditTemplate>(`/audit-templates/${id}/set-default`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['audit-templates'] }),
  });
}

export function useReseedSystemTemplates() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiClient.post<{ updated: number; created: number }>('/audit-templates/reseed-system', {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['audit-templates'] }),
  });
}
