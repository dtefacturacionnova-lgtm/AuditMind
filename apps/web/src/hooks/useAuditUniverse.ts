'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export interface AuditableUnit {
  id: string;
  name: string;
  description?: string;
  category: string;
  location?: string;
  responsible?: string;
  inherentRiskScore: number;
  active: boolean;
  _count?: { audits: number };
}

export interface AuditUniverseResponse {
  data: AuditableUnit[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface RiskSummary {
  CRITICAL: number;
  HIGH: number;
  MEDIUM: number;
  LOW: number;
}

export function useAuditUniverse(params?: {
  page?: number;
  limit?: number;
  search?: string;
}) {
  const query = new URLSearchParams();
  if (params?.page) query.set('page', String(params.page));
  if (params?.limit) query.set('limit', String(params.limit));
  if (params?.search) query.set('search', params.search);

  return useQuery({
    queryKey: ['audit-universe', params],
    queryFn: () => apiClient.get<AuditUniverseResponse>(`/audit-universe?${query}`),
  });
}

export function useAuditUnit(id: string) {
  return useQuery({
    queryKey: ['audit-universe', id],
    queryFn: () => apiClient.get<AuditableUnit>(`/audit-universe/${id}`),
    enabled: !!id,
  });
}

export function useRiskSummary() {
  return useQuery({
    queryKey: ['audit-universe', 'risk-summary'],
    queryFn: () => apiClient.get<RiskSummary>('/audit-universe/risk-summary'),
  });
}

export function useCreateAuditUnit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => apiClient.post('/audit-universe', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['audit-universe'] }),
  });
}

export function useUpdateAuditUnit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: any) => apiClient.patch(`/audit-universe/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['audit-universe'] }),
  });
}

export function useDeleteAuditUnit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/audit-universe/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['audit-universe'] }),
  });
}
