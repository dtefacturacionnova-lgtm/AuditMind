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
  // Risk
  areaScore?: number;
  strategicImpact?: number;
  operationalImpact?: number;
  legalRequirement?: number;
  lastAuditAge?: number;
  riskPerception?: number;
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
}

export interface ProjectStats {
  total: number;
  inPlan: number;
  critico: number;
  alto: number;
  medio: number;
  bajo: number;
  years: number[];
  totalBudget: number;
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

// Pure function: compute final risk score from 6 variables
export function computeRiskScore(p: {
  areaScore?: number;
  strategicImpact?: number;
  operationalImpact?: number;
  legalRequirement?: number;
  lastAuditAge?: number;
  riskPerception?: number;
}): { score: number; level: string } | null {
  const areaVal = p.areaScore != null
    ? p.areaScore >= 75 ? 4 : p.areaScore >= 55 ? 3 : p.areaScore >= 35 ? 2 : 1
    : null;
  const vals = [areaVal, p.strategicImpact, p.operationalImpact, p.legalRequirement, p.lastAuditAge, p.riskPerception];
  if (vals.some(v => v == null)) return null;
  const weights = [0.25, 0.20, 0.15, 0.20, 0.10, 0.10];
  const score = vals.reduce((s, v, i) => s + (v! * weights[i]), 0);
  const level = score >= 3.25 ? 'CRITICO' : score >= 2.5 ? 'ALTO' : score >= 1.75 ? 'MEDIO' : 'BAJO';
  return { score: Math.round(score * 100) / 100, level };
}
