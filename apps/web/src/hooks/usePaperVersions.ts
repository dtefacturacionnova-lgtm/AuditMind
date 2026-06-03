'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ChangeType = 'unchanged' | 'added' | 'removed' | 'modified';

export interface WordToken {
  text: string;
  type: ChangeType;
}

export interface VersionMeta {
  id:             string;
  version:        number;
  changedAt:      string;
  changedBy:      string;
  consolidatedBy: string | null;
  reason:         string | null;
  isRestore:      boolean;
  sectionsCount:  number;
  wordCount:      number;
}

export interface SectionSnapshot {
  sectionKey:   string;
  label:        string;
  value:        unknown;
  isAutoFilled: boolean;
  sourceRef:    string | null;
}

export interface VersionFull {
  id:           string;
  version:      number;
  changedAt:    string;
  changedBy:    string;
  reason:       string | null;
  isRestore:    boolean;
  narrative:    string | null;
  sections:     SectionSnapshot[];
  sourcePapersHashes: Record<string, string> | null;
}

export interface SectionDiff {
  sectionKey:   string;
  label:        string;
  changeType:   ChangeType;
  wordsAdded:   number;
  wordsRemoved: number;
  oldTokens:    WordToken[];
  newTokens:    WordToken[];
}

export interface CompareResult {
  fromVersion:        number;
  toVersion:          number;
  fromDate:           string;
  toDate:             string;
  sectionsCompared:   number;
  sectionsModified:   number;
  sectionsAdded:      number;
  sectionsRemoved:    number;
  totalWordsAdded:    number;
  totalWordsRemoved:  number;
  narrativeDiff:      { oldTokens: WordToken[]; newTokens: WordToken[] } | null;
  sectionDiffs:       SectionDiff[];
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function usePaperVersions(paperId: string, enabled = true) {
  return useQuery<VersionMeta[]>({
    queryKey: ['wp', paperId, 'versions'],
    queryFn:  () => apiClient.get(`/working-papers/${paperId}/versions`),
    enabled:  !!paperId && enabled,
    staleTime: 15_000,
  });
}

export function usePaperVersion(paperId: string, versionId: string | null) {
  return useQuery<VersionFull>({
    queryKey: ['wp', paperId, 'versions', versionId],
    queryFn:  () => apiClient.get(`/working-papers/${paperId}/versions/${versionId}`),
    enabled:  !!paperId && !!versionId,
    staleTime: 60_000,
  });
}

export function useCompareVersions(
  paperId: string,
  fromVersion: number | null,
  toVersion: number | null,
) {
  return useQuery<CompareResult>({
    queryKey: ['wp', paperId, 'versions', 'compare', fromVersion, toVersion],
    queryFn:  () =>
      apiClient.get(`/working-papers/${paperId}/versions/compare?from=${fromVersion}&to=${toVersion}`),
    enabled:  !!paperId && fromVersion !== null && toVersion !== null,
    staleTime: 60_000,
  });
}

export function useRestoreVersion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      paperId,
      versionId,
      reason,
    }: {
      paperId: string;
      versionId: string;
      reason?: string;
    }) =>
      apiClient.post<{ restored: boolean; fromVersion: number; newVersion: number }>(
        `/working-papers/${paperId}/versions/${versionId}/restore`,
        { reason },
      ),
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: ['wp', vars.paperId] });
      qc.invalidateQueries({ queryKey: ['wp', vars.paperId, 'sections'] });
      qc.invalidateQueries({ queryKey: ['wp', vars.paperId, 'versions'] });
    },
  });
}
