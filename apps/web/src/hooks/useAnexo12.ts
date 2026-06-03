'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export interface Anexo12Row {
  numero:        number;
  tipo:          'FORMAL' | 'SUSTANTIVO';
  concepto:      string;
  norma:         string;
  articulo:      string;
  descripcion:   string;
  monto:         number;
  impactoFiscal: number;
  severidad:     string;
}

export interface Anexo12Result {
  auditId:       string;
  auditTitle:    string;
  contribuyente: string;
  periodo:       string;
  generatedAt:   string;
  formales:      Anexo12Row[];
  sustantivos:   Anexo12Row[];
  totales: {
    countFormales:    number;
    countSustantivos: number;
    montoTotal:       number;
    impactoTotal:     number;
  };
}

export function useAnexo12(auditId: string, enabled = true) {
  return useQuery<Anexo12Result>({
    queryKey: ['anexo12', auditId],
    queryFn:  () => apiClient.get(`/fiscal/anexo12/${auditId}`),
    enabled:  !!auditId && enabled,
    staleTime: 30_000,
  });
}
