'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

export type AiTestKind   = 'BENFORD' | 'COSO';
export type AiTestStatus = 'SUCCESS' | 'FAILED' | 'SKIPPED';

export interface AiTestResult {
  kind:       AiTestKind;
  target:     string;
  label:      string;
  status:     AiTestStatus;
  message:    string;
  findingId?: string | null;
  meta?:      Record<string, unknown>;
}

export interface AiTestsSummary {
  ranAt:        string;
  durationMs:   number;
  ranById:      string;
  tests:        AiTestResult[];
  findingIds:   string[];
  counts: {
    total:           number;
    success:         number;
    failed:          number;
    skipped:         number;
    findingsCreated: number;
  };
}

export interface AiTestsReport {
  ranAt:   string | null;
  summary: AiTestsSummary | null;
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useAiTestsReport(auditId: string, enabled = true) {
  return useQuery<AiTestsReport>({
    queryKey: ['audit', auditId, 'ai-tests-report'],
    queryFn:  () => apiClient.get(`/audits/${auditId}/ai-tests-report`),
    enabled:  !!auditId && enabled,
    staleTime: 30_000,
  });
}

export function useRunAiTests() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (auditId: string) =>
      apiClient.post<AiTestsSummary>(`/audits/${auditId}/run-ai-tests`, {}),
    onSuccess: (_res, auditId) => {
      qc.invalidateQueries({ queryKey: ['audit', auditId, 'ai-tests-report'] });
      qc.invalidateQueries({ queryKey: ['findings'] });
      qc.invalidateQueries({ queryKey: ['tb'] });
    },
  });
}
