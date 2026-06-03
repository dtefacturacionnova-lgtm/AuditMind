'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

export type BenfordConformity = 'CLOSE' | 'ACCEPTABLE' | 'SUSPECT' | 'NON_CONFORMING';

export interface BenfordDigit {
  digit:         number;
  observed_pct:  number;
  expected_pct:  number;
  deviation_pct: number;
  is_anomalous:  boolean;
}

export interface BenfordResultData {
  total_records:  number;
  valid_records:  number;
  chi2_statistic: number;
  chi2_pvalue:    number;
  mad:            number;
  conformity:     BenfordConformity;
  risk_score:     number;
  digits:         BenfordDigit[];
  top_anomalous_amounts: Array<{
    code:   string;
    name:   string;
    amount: number;
  }>;
  interpretation: string;
}

export interface BenfordRunResponse {
  result:    BenfordResultData;
  findingId: string | null;
  runAt:     string;
}

export interface BenfordGetResponse {
  result:    BenfordResultData | null;
  runAt:     string | null;
  findingId: string | null;
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useBenfordResult(tbId: string, enabled = true) {
  return useQuery<BenfordGetResponse>({
    queryKey: ['tb', tbId, 'benford'],
    queryFn:  () => apiClient.get(`/audits/trial-balance/${tbId}/benford`),
    enabled:  !!tbId && enabled,
    staleTime: 30_000,
  });
}

export function useRunBenford() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (tbId: string) =>
      apiClient.post<BenfordRunResponse>(`/audits/trial-balance/${tbId}/benford`, {}),
    onSuccess: (_res, tbId) => {
      qc.invalidateQueries({ queryKey: ['tb', tbId, 'benford'] });
      qc.invalidateQueries({ queryKey: ['findings'] });
    },
  });
}
