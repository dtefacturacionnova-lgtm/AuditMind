'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export interface DgiiContribuyente {
  nit:              string;
  nrc?:             string;
  nombre:           string;
  estado:           string;
  giro?:            string;
  categoria?:       string;
  fechaInscripcion?: string;
  direccion?:       string;
}

export interface DgiiStats {
  total:        number;
  lastImportAt: string | null;
  byEstado:     Record<string, number>;
}

export interface ImportResult {
  imported:    number;
  created:     number;
  updated:     number;
  replacedAll: boolean;
}

export interface VerifyResult {
  found: Array<{
    nit: string; nrc: string | null; nombre: string;
    estado: string; giro: string | null;
    isActive: boolean;
  }>;
  notFound:  string[];
  suspended: string[];
  active:    string[];
  summary: {
    total: number; activeCount: number; suspendedCount: number; notFoundCount: number;
  };
}

export function useDgiiStats() {
  return useQuery<DgiiStats>({
    queryKey: ['dgii', 'stats'],
    queryFn:  () => apiClient.get('/fiscal/dgii/stats'),
    staleTime: 60_000,
  });
}

export function useImportDgii() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { contribuyentes: DgiiContribuyente[]; replaceAll?: boolean }) =>
      apiClient.post<ImportResult>('/fiscal/dgii/import', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dgii'] }),
  });
}

export function useVerifyDgii() {
  return useMutation({
    mutationFn: (nits: string[]) =>
      apiClient.post<VerifyResult>('/fiscal/dgii/verify', { nits }),
  });
}
