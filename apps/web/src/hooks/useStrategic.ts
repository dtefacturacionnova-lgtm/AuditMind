'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export interface StrategicLine {
  id: string;
  objectiveId: string;
  code: string;
  name: string;
  description?: string;
  sortOrder: number;
  active: boolean;
}

export interface StrategicObjective {
  id: string;
  code: string;
  name: string;
  description?: string;
  color: string;
  icon: string;
  sortOrder: number;
  active: boolean;
  lines: StrategicLine[];
}

const QK = 'strategic-objectives';

export function useStrategicObjectives() {
  return useQuery<StrategicObjective[]>({
    queryKey: [QK],
    queryFn: () => apiClient.get('/strategic/objectives'),
  });
}

export function useCreateObjective() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<StrategicObjective>) =>
      apiClient.post('/strategic/objectives', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: [QK] }),
  });
}

export function useUpdateObjective() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<StrategicObjective> }) =>
      apiClient.patch(`/strategic/objectives/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: [QK] }),
  });
}

export function useDeleteObjective() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/strategic/objectives/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: [QK] }),
  });
}

export function useCreateLine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<StrategicLine> & { objectiveId: string }) =>
      apiClient.post('/strategic/lines', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: [QK] }),
  });
}

export function useUpdateLine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<StrategicLine> }) =>
      apiClient.patch(`/strategic/lines/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: [QK] }),
  });
}

export function useDeleteLine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/strategic/lines/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: [QK] }),
  });
}
