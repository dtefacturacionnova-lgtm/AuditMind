'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

export type SectionFieldType =
  | 'TEXT'
  | 'TEXTAREA'
  | 'NUMBER'
  | 'CURRENCY'
  | 'PERCENTAGE'
  | 'BOOLEAN'
  | 'ENUM_SELECT'
  | 'DATE'
  | 'MATRIX'
  | 'REFERENCE'
  | 'RISK_REF'
  | 'ATTACHMENT';

export interface PaperSection {
  id: string;
  sectionKey: string;
  label: string;
  description?: string;
  fieldType: SectionFieldType;
  value: unknown;
  options?: string[];
  isRequired: boolean;
  isAutoFilled: boolean;
  sourceRef?: string;
  sortOrder: number;
  aiHint?: string;
}

export interface WpRef {
  id: string;
  code: string;
  title: string;
  wpKind: string;
  syncStatus: string;
}

export interface PaperGraphData {
  sources: WpRef[];
  targets: WpRef[];
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export function usePaperSections(paperId: string) {
  return useQuery<PaperSection[]>({
    queryKey: ['wp', paperId, 'sections'],
    queryFn: () => apiClient.get(`/working-papers/${paperId}/sections`),
    enabled: !!paperId,
    staleTime: 15_000,
  });
}

export function usePaperGraph(paperId: string) {
  return useQuery<PaperGraphData>({
    queryKey: ['wp', paperId, 'graph'],
    queryFn: () => apiClient.get(`/working-papers/${paperId}/graph`),
    enabled: !!paperId,
    staleTime: 30_000,
  });
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export function useUpdateSection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      paperId,
      sectionKey,
      value,
    }: {
      paperId: string;
      sectionKey: string;
      value: unknown;
    }) =>
      apiClient.patch<PaperSection>(
        `/working-papers/${paperId}/sections/${sectionKey}`,
        { value },
      ),
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: ['wp', vars.paperId, 'sections'] });
    },
  });
}

export function useConsolidatePaper() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (paperId: string) =>
      apiClient.post(`/working-papers/${paperId}/consolidate`, {}),
    onSuccess: (_res, paperId) => {
      qc.invalidateQueries({ queryKey: ['wp', paperId] });
      qc.invalidateQueries({ queryKey: ['wp', paperId, 'sections'] });
    },
  });
}

export function useInitFromTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      paperId,
      templateKey,
    }: {
      paperId: string;
      templateKey: string;
    }) =>
      apiClient.post(
        `/working-papers/${paperId}/sections/init/${templateKey}`,
        {},
      ),
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: ['wp', vars.paperId, 'sections'] });
    },
  });
}
