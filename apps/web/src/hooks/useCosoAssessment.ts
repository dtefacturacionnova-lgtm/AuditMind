'use client';

import { useMutation } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

export type CosoMaturity = 'EFFECTIVE' | 'WITH_DEFICIENCIES' | 'INEFFECTIVE' | 'INSUFFICIENT_EVIDENCE';

export interface CosoComponent {
  key:            string;       // CE | RA | CA | IC | MA
  name:           string;
  maturity:       CosoMaturity;
  score:          number;
  narrative:      string;
  evidence:       string[];
  deficiencies:   string[];
  recommendations: string[];
}

export interface CosoPrinciple {
  id:           number;          // 1..17
  componentKey: string;
  status:       CosoMaturity;
  justification: string;
  evidenceRef:  string;
}

export interface CosoAssessment {
  overallScore:     number;
  overallMaturity:  Exclude<CosoMaturity, 'INSUFFICIENT_EVIDENCE'>;
  executiveSummary: string;
  components:       CosoComponent[];
  principles:       CosoPrinciple[];
  nextSteps:        string[];
}

export interface CosoAssessResponse {
  paperId:     string;
  assessment:  CosoAssessment;
  model:       string;
  tokensUsed:  number;
  generatedAt: string;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useRunCosoAssess() {
  return useMutation({
    mutationFn: (paperId: string) =>
      apiClient.post<CosoAssessResponse>(`/working-papers/${paperId}/coso-assess`, {}),
  });
}
