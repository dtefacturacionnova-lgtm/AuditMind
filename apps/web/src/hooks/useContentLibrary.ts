'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ContentLibraryKind = 'SUBSTANTIVE_PROCEDURE' | 'COSO_QUESTION';

export interface ContentLibraryItem {
  id:             string;
  kind:           ContentLibraryKind;
  groupKey:       string;
  groupLabel?:    string | null;
  itemLabel:      string;
  itemSubtitle?:  string | null;
  itemDetails?:   string[] | null;
  sortOrder:      number;
  isSystem:       boolean;
  createdAt:      string;
  updatedAt:      string;
}

export interface CreateContentLibraryItemData {
  kind:          ContentLibraryKind;
  groupKey:      string;
  groupLabel?:   string;
  itemLabel:     string;
  itemSubtitle?: string;
  itemDetails?:  string[];
  sortOrder?:    number;
}

export interface UpdateContentLibraryItemData extends Partial<Omit<CreateContentLibraryItemData, 'kind'>> {}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useContentLibrary(kind?: ContentLibraryKind, groupKey?: string) {
  const params = new URLSearchParams();
  if (kind) params.set('kind', kind);
  if (groupKey) params.set('groupKey', groupKey);
  const qs = params.toString();
  return useQuery<ContentLibraryItem[]>({
    queryKey: ['content-library', kind ?? '', groupKey ?? ''],
    queryFn: () => apiClient.get('/content-library' + (qs ? `?${qs}` : '')),
    staleTime: 30_000,
  });
}

export function useCreateContentLibraryItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateContentLibraryItemData) =>
      apiClient.post<ContentLibraryItem>('/content-library', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['content-library'] }),
  });
}

export function useUpdateContentLibraryItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateContentLibraryItemData }) =>
      apiClient.patch<ContentLibraryItem>(`/content-library/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['content-library'] }),
  });
}

export function useDeleteContentLibraryItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/content-library/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['content-library'] }),
  });
}

export function useReseedContentLibrary() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiClient.post<{ updated: number; created: number }>('/content-library/reseed-system', {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['content-library'] }),
  });
}
