'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────
export type PlanStatus = 'DRAFT' | 'APPROVED' | 'ACTIVE' | 'CLOSED';

export interface PlanItem {
  id:                 string;
  planId:             string;
  auditEntityId:      string;
  estimatedHours:     number;
  tentativeStartDate?: string;
  tentativeEndDate?:  string;
  priority:           number; // 1=Alta, 2=Media, 3=Baja
  notes?:             string;
  auditEntity: {
    id:                string;
    name:              string;
    category:          string;
    inherentRiskScore: number;
    responsible?:      string;
  };
}

export interface AuditPlan {
  id:             string;
  organizationId: string;
  year:           number;
  name:           string;
  status:         PlanStatus;
  approvedById?:  string;
  approvedAt?:    string;
  totalHours:     number;
  objectives:     string[];
  items:          PlanItem[];
  createdAt:      string;
  updatedAt:      string;
  // Computed (from API)
  allocatedHours: number;
  remainingHours: number;
  utilizationPct: number;
}

export interface CreatePlanData {
  year:        number;
  name:        string;
  totalHours?: number;
  objectives?: string[];
}

export interface CreatePlanItemData {
  auditEntityId:      string;
  estimatedHours:     number;
  tentativeStartDate?: string;
  tentativeEndDate?:  string;
  priority?:          number;
  notes?:             string;
}

// ─── Queries ──────────────────────────────────────────────────────────────────
export function usePlans() {
  return useQuery<AuditPlan[]>({
    queryKey:  ['plans'],
    queryFn:   () => apiClient.get('/plans'),
    staleTime: 30_000,
  });
}

export function usePlan(id: string) {
  return useQuery<AuditPlan>({
    queryKey:  ['plan', id],
    queryFn:   () => apiClient.get(`/plans/${id}`),
    enabled:   !!id,
    staleTime: 15_000,
  });
}

// ─── Mutations ────────────────────────────────────────────────────────────────
export function useCreatePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreatePlanData) => apiClient.post<AuditPlan>('/plans', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['plans'] }),
  });
}

export function useUpdatePlan(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<CreatePlanData>) => apiClient.patch<AuditPlan>(`/plans/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['plan', id] });
      qc.invalidateQueries({ queryKey: ['plans'] });
    },
  });
}

export function useApprovePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.post<AuditPlan>(`/plans/${id}/approve`, {}),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ['plan', id] });
      qc.invalidateQueries({ queryKey: ['plans'] });
    },
  });
}

export function useActivatePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.post<AuditPlan>(`/plans/${id}/activate`, {}),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ['plan', id] });
      qc.invalidateQueries({ queryKey: ['plans'] });
    },
  });
}

export function useClosePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.post<AuditPlan>(`/plans/${id}/close`, {}),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ['plan', id] });
      qc.invalidateQueries({ queryKey: ['plans'] });
    },
  });
}

export function useAddPlanItem(planId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreatePlanItemData) => apiClient.post<AuditPlan>(`/plans/${planId}/items`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['plan', planId] }),
  });
}

export function useUpdatePlanItem(planId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, data }: { itemId: string; data: Partial<CreatePlanItemData> }) =>
      apiClient.patch<AuditPlan>(`/plans/${planId}/items/${itemId}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['plan', planId] }),
  });
}

export function useRemovePlanItem(planId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (itemId: string) => apiClient.delete(`/plans/${planId}/items/${itemId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['plan', planId] }),
  });
}

// ─── Config ───────────────────────────────────────────────────────────────────
export const PLAN_STATUS_CONFIG: Record<PlanStatus, { label: string; color: string; bg: string; dot: string }> = {
  DRAFT:    { label: 'Borrador',  color: 'text-gray-600',    bg: 'bg-gray-100',    dot: 'bg-gray-400' },
  APPROVED: { label: 'Aprobado', color: 'text-blue-700',    bg: 'bg-blue-100',    dot: 'bg-blue-500' },
  ACTIVE:   { label: 'Activo',   color: 'text-emerald-700', bg: 'bg-emerald-100', dot: 'bg-emerald-500' },
  CLOSED:   { label: 'Cerrado',  color: 'text-gray-500',    bg: 'bg-gray-100',    dot: 'bg-gray-400' },
};

export const PRIORITY_CONFIG: Record<number, { label: string; color: string; bg: string }> = {
  1: { label: 'Alta',  color: 'text-red-700',    bg: 'bg-red-50' },
  2: { label: 'Media', color: 'text-amber-700',  bg: 'bg-amber-50' },
  3: { label: 'Baja',  color: 'text-gray-600',   bg: 'bg-gray-100' },
};
