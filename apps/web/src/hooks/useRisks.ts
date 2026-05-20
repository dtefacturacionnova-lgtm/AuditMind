import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

export type RiskTrend    = 'INCREASING' | 'STABLE' | 'DECREASING';
export type RiskCategory = 'estratégico' | 'operacional' | 'financiero' | 'TI' | 'compliance' | 'reputacional' | 'ESG';

export interface RiskRegister {
  id:             string;
  organizationId: string;
  auditEntityId?: string;
  title:          string;
  description:    string;
  category:       RiskCategory;
  probability:    number;  // 1-5
  impact:         number;  // 1-5
  inherentScore:  number;  // probability * impact (1-25)
  controlsScore:  number;  // 0-100 effectiveness
  residualScore:  number;  // inherent * (1 - controls/100)
  kris:           string[];
  trend:          RiskTrend;
  lastUpdated:    string;
  createdAt:      string;
  auditEntity?:   { id: string; name: string } | null;
}

export interface RiskStats {
  total:      number;
  critical:   number;  // residual >= 20
  high:       number;  // 15-19
  medium:     number;  // 8-14
  low:        number;  // < 8
  increasing: number;
}

export interface CreateRiskData {
  title:          string;
  description:    string;
  category:       RiskCategory;
  probability:    number;
  impact:         number;
  controlsScore:  number;
  auditEntityId?: string;
  trend?:         RiskTrend;
  kris?:          string[];
}

export interface UpdateRiskData extends Partial<CreateRiskData> {}

// ─── Color helpers ────────────────────────────────────────────────────────────

export function getRiskColor(score: number): {
  bg: string; text: string; border: string; label: string;
} {
  if (score >= 20) return { bg: 'bg-red-100',    text: 'text-red-700',    border: 'border-red-300',    label: 'Crítico' };
  if (score >= 15) return { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-300', label: 'Alto' };
  if (score >= 8)  return { bg: 'bg-amber-100',  text: 'text-amber-700',  border: 'border-amber-300',  label: 'Medio' };
  return                  { bg: 'bg-green-100',  text: 'text-green-700',  border: 'border-green-300',  label: 'Bajo' };
}

export const RISK_CATEGORIES: RiskCategory[] = [
  'estratégico', 'operacional', 'financiero', 'TI', 'compliance', 'reputacional', 'ESG',
];

export const CATEGORY_COLORS: Record<RiskCategory, string> = {
  'estratégico':  'bg-purple-100 text-purple-700',
  'operacional':  'bg-blue-100   text-blue-700',
  'financiero':   'bg-green-100  text-green-700',
  'TI':           'bg-cyan-100   text-cyan-700',
  'compliance':   'bg-amber-100  text-amber-700',
  'reputacional': 'bg-pink-100   text-pink-700',
  'ESG':          'bg-teal-100   text-teal-700',
};

export const TREND_CONFIG: Record<RiskTrend, { icon: string; color: string; label: string }> = {
  INCREASING:  { icon: '↑', color: 'text-red-600',   label: 'Aumentando' },
  STABLE:      { icon: '→', color: 'text-amber-600',  label: 'Estable' },
  DECREASING:  { icon: '↓', color: 'text-green-600',  label: 'Disminuyendo' },
};

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useRisks(auditEntityId?: string) {
  return useQuery<RiskRegister[]>({
    queryKey: ['risks', auditEntityId ?? 'all'],
    queryFn:  () => apiClient.get(`/risks${auditEntityId ? `?auditEntityId=${auditEntityId}` : ''}`),
    staleTime: 30_000,
  });
}

export function useRisk(id: string) {
  return useQuery<RiskRegister>({
    queryKey: ['risks', id],
    queryFn:  () => apiClient.get(`/risks/${id}`),
    enabled:  !!id,
  });
}

export function useRiskStats() {
  return useQuery<RiskStats>({
    queryKey: ['risks', 'stats'],
    queryFn:  () => apiClient.get('/risks/stats'),
    staleTime: 30_000,
  });
}

export function useCreateRisk() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateRiskData) => apiClient.post<RiskRegister>('/risks', data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['risks'] }); },
  });
}

export function useUpdateRisk(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateRiskData) => apiClient.patch<RiskRegister>(`/risks/${id}`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['risks'] }); },
  });
}

export function useDeleteRisk() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/risks/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['risks'] }); },
  });
}
