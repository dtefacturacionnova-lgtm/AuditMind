'use client';

import { useMutation } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export type DteAnomalyType =
  | 'CORRELATIVO_SALTO' | 'FIN_DE_SEMANA' | 'FERIADO' | 'FUERA_HORARIO'
  | 'DUPLICADO_NUMERO' | 'DUPLICADO_CODIGO' | 'ANULACION_ALTA'
  | 'CONCENTRACION_FIN_MES';

export type DteSeverity = 'LOW' | 'MEDIUM' | 'HIGH';
export type DteConformity = 'CLEAN' | 'MINOR_ISSUES' | 'SUSPECT' | 'NON_CONFORMING';

export interface DteRecord {
  fecha:             string;
  hora?:             string;
  numeroCorrelativo: string;
  tipo?:             string;
  codigoGeneracion?: string;
  estado?:           string;
  monto?:            number | string;
  receptorNit?:      string;
  receptorNombre?:   string;
}

export interface DteAnomaly {
  type:        DteAnomalyType;
  severity:    DteSeverity;
  description: string;
  affected:    Array<{ correlativo: string; fecha: string; hora?: string; extra?: string }>;
}

export interface DteValidationResult {
  totalRecords:        number;
  validRecords:        number;
  anomalies:           DteAnomaly[];
  summary: {
    correlativosFaltantes:    number;
    emisionesFinDeSemana:     number;
    emisionesEnFeriado:       number;
    emisionesFueraHorario:    number;
    duplicados:               number;
    anuladosPct:              number;
    concentracionUltimoDiaPct: number;
  };
  conformity:          DteConformity;
  riskScore:           number;
  recommendation:      string;
}

export function useValidateDte() {
  return useMutation({
    mutationFn: (params: { records: DteRecord[]; holidays?: string[] }) =>
      apiClient.post<DteValidationResult>('/fiscal/validate-dte', params),
  });
}
