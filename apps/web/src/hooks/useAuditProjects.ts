'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export interface AuditProjectTeamMember {
  role: string;
  count: number;
  costPerHour: number;
  hours: number;
}

export interface AuditProject {
  id: string;
  correlative: string;
  name: string;
  planYear: number;
  strategicObjectiveId?: string;
  strategicLineId?: string;
  responsibleEntityId?: string;
  supportEntityId?: string;
  riskCategory?: string;
  notes?: string;
  // Risk — Grupo A (escala 1-5)
  impactScore?: number;
  likelihoodScore?: number;
  controlMaturityScore?: number;
  // Risk — Grupo B (escala 1-5)
  materialityScore?: number;
  strategicAlignScore?: number;
  operationalAlignScore?: number;
  fraudHistoryScore?: number;
  managementReqScore?: number;
  staffTurnoverScore?: number;
  coverageHistoryScore?: number;
  // Risk — campos adicionales del proyecto
  legalRequirement?: number;
  lastAuditOpinion?: string;
  finalRiskScore?: number;
  finalRiskLevel?: string;
  includeInPlan: boolean;
  targetPlanYear?: number;
  // Planning
  legalBasis?: string;
  frequencyPerYear?: number;
  plannedHours?: number;
  teamJson?: AuditProjectTeamMember[];
  totalBudget?: number;
  status: string;
  // Relations (populated)
  strategicObjective?: { id: string; code: string; name: string; color: string; icon: string };
  strategicLine?: { id: string; code: string; name: string };
  responsibleEntity?: { id: string; name: string; entityType: string };
  supportEntity?: { id: string; name: string; entityType: string };
  // Coverage (virtual, computed by API from real audit history)
  coverageGapDays?: number | null;
  lastAuditDate?: string | null;
  lastAuditAgeDynamic?: number | null;
}

export interface ProjectStats {
  total: number;
  inPlan: number;
  critico: number;
  alto: number;
  medio: number;
  bajo: number;
  withEntity: number;
  years: number[];
  totalBudget: number;
}

export interface SyncCoverageResult {
  updated: number;
  changes: Array<{
    id: string;
    correlative: string;
    name: string;
    oldValue: number | null;
    newValue: number;
  }>;
}

const QK = 'audit-projects';

export function useAuditProjects(year?: number, riskLevel?: string, search?: string) {
  const params = new URLSearchParams();
  if (year)      params.set('year',      String(year));
  if (riskLevel) params.set('riskLevel', riskLevel);
  if (search)    params.set('search',    search);
  const qs = params.toString();
  return useQuery<AuditProject[]>({
    queryKey: [QK, year, riskLevel, search],
    queryFn: () => apiClient.get(`/audit-projects${qs ? '?' + qs : ''}`),
  });
}

export function useProjectStats() {
  return useQuery<ProjectStats>({
    queryKey: [QK, 'stats'],
    queryFn: () => apiClient.get('/audit-projects/stats'),
  });
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<AuditProject>) => apiClient.post('/audit-projects', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: [QK] }),
  });
}

export function useUpdateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<AuditProject> }) =>
      apiClient.patch(`/audit-projects/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: [QK] }),
  });
}

export function useDeleteProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/audit-projects/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: [QK] }),
  });
}

export function useSyncCoverage() {
  const qc = useQueryClient();
  return useMutation<SyncCoverageResult>({
    mutationFn: () => apiClient.post('/audit-projects/sync-coverage', {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: [QK] }),
  });
}

// ─── Coverage helpers ─────────────────────────────────────────────────────────

export function formatCoverageGap(days: number | null | undefined): {
  label: string;
  color: string;
  urgency: 'ok' | 'warn' | 'danger' | 'none';
} {
  if (days == null) return { label: 'Sin auditoría registrada', color: 'text-slate-400', urgency: 'none' };
  if (days < 365) {
    const months = Math.floor(days / 30) || 1;
    return { label: `hace ${months} mes${months !== 1 ? 'es' : ''}`, color: 'text-emerald-600', urgency: 'ok' };
  }
  if (days < 730) {
    const months = Math.floor(days / 30);
    return { label: `hace ${months} meses`, color: 'text-amber-600', urgency: 'warn' };
  }
  const years = (days / 365).toFixed(1);
  return { label: `hace ${years} años`, color: 'text-red-600', urgency: 'danger' };
}

// ─── Risk scoring (misma fórmula que AuditableUnitAssessment en Universe) ─────
// Score final: 0–100. Mismo umbral: ≥75 CRITICO, ≥55 ALTO, ≥35 MEDIO, else BAJO

export function computeRiskScore(p: {
  impactScore?: number;
  likelihoodScore?: number;
  controlMaturityScore?: number;
  materialityScore?: number;
  strategicAlignScore?: number;
  operationalAlignScore?: number;
  fraudHistoryScore?: number;
  managementReqScore?: number;
  staffTurnoverScore?: number;
  coverageHistoryScore?: number;
}): { score: number; level: string } | null {
  const {
    impactScore, likelihoodScore, controlMaturityScore,
    materialityScore, strategicAlignScore, operationalAlignScore,
    fraudHistoryScore, managementReqScore, staffTurnoverScore, coverageHistoryScore,
  } = p;

  // Require all 10 factors to compute
  if (
    !impactScore || !likelihoodScore || !controlMaturityScore ||
    !materialityScore || !strategicAlignScore || !operationalAlignScore ||
    !fraudHistoryScore || !managementReqScore || !staffTurnoverScore || !coverageHistoryScore
  ) return null;

  // Grupo A — Riesgo Residual (30%)
  const inherent = impactScore * likelihoodScore;
  const residual = inherent * (1 - controlMaturityScore / 5);
  const groupA = (residual / 25) * 100;

  // Grupo B — Factores Contextuales (70%)
  const bWeights: Record<string, number> = {
    materialityScore: 0.20, strategicAlignScore: 0.20, operationalAlignScore: 0.15,
    fraudHistoryScore: 0.15, managementReqScore: 0.10, staffTurnoverScore: 0.10, coverageHistoryScore: 0.10,
  };
  const groupB = Object.entries(bWeights).reduce((sum, [key, w]) => {
    const v = (p as Record<string, number>)[key] ?? 1;
    return sum + ((v - 1) / 4) * 100 * w;
  }, 0);

  const totalScore = groupA * 0.30 + groupB * 0.70;
  const level = totalScore >= 75 ? 'CRITICO' : totalScore >= 55 ? 'ALTO' : totalScore >= 35 ? 'MEDIO' : 'BAJO';
  return { score: Math.round(totalScore * 10) / 10, level };
}
