'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export interface EntityTypeConfig {
  id: string;
  value: string;
  label: string;
  icon: string;
  color: string;
  sortOrder: number;
  active: boolean;
}

export interface ProcessCategoryConfig {
  id: string;
  code: string;
  name: string;
  type: string;
  sortOrder: number;
  active: boolean;
}

// ─── Entity Types ─────────────────────────────────────────────────────────────

export function useEntityTypeConfigs() {
  return useQuery<EntityTypeConfig[]>({
    queryKey: ['catalog-entity-types'],
    queryFn: () => apiClient.get('/catalogs/entity-types'),
  });
}

export function useCreateEntityType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { value: string; label: string; icon?: string; color?: string; sortOrder?: number }) =>
      apiClient.post('/catalogs/entity-types', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['catalog-entity-types'] }),
  });
}

export function useUpdateEntityType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<EntityTypeConfig> }) =>
      apiClient.patch(`/catalogs/entity-types/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['catalog-entity-types'] }),
  });
}

export function useDeleteEntityType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/catalogs/entity-types/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['catalog-entity-types'] }),
  });
}

// ─── Process Categories ───────────────────────────────────────────────────────

export function useProcessCategoryConfigs() {
  return useQuery<ProcessCategoryConfig[]>({
    queryKey: ['catalog-process-categories'],
    queryFn: () => apiClient.get('/catalogs/process-categories'),
  });
}

export function useCreateProcessCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { code: string; name: string; type?: string; sortOrder?: number }) =>
      apiClient.post('/catalogs/process-categories', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['catalog-process-categories'] }),
  });
}

export function useUpdateProcessCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<ProcessCategoryConfig> }) =>
      apiClient.patch(`/catalogs/process-categories/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['catalog-process-categories'] }),
  });
}

export function useDeleteProcessCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/catalogs/process-categories/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['catalog-process-categories'] }),
  });
}
