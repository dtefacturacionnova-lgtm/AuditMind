'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { AnalysisId } from '@/lib/caats-fields';

// ─── Types (espejo de apps/api/src/investigation-report/caats-*.ts — Fase 2c) ──

export interface CaatsHistoryEntry {
  source: 'manual' | 'auto';
  engine: string | null;
  label: string;
  fileName: string | null;
  ranAt: string | null;
  result: Record<string, unknown> | null;
  confianzaDeteccion: number | null;
  justificacionDeteccion: string | null;
}

export interface SpreadsheetClassification {
  engine: AnalysisId | 'ninguno';
  confianza: number;
  justificacion: string;
}

export interface CaatsAutoRun {
  id: string;
  auditId: string;
  engine: string;
  fileName: string | null;
  descripcion: string;
  fieldMapping: Record<string, unknown> | null;
  result: Record<string, unknown>;
  confianzaDeteccion: number | null;
  justificacionDeteccion: string | null;
  requestedById: string;
  ranAt: string;
}

// ─── Historial CAATs unificado (manual + auto-detectado) ───────────────────

export function useCaatsHistory(auditId: string) {
  return useQuery<CaatsHistoryEntry[]>({
    queryKey: ['audit', auditId, 'caats-history'],
    queryFn: () => apiClient.get<CaatsHistoryEntry[]>(`/audits/${auditId}/investigation-report/caats/history`),
    enabled: Boolean(auditId),
    // Dato informativo — sin polling, se refresca al invalidar tras un nuevo auto-run.
  });
}

// ─── Clasificación de la hoja subida ────────────────────────────────────────

export interface ClassifySpreadsheetInput {
  descripcion: string;
  columns: string[];
  sampleRows: Record<string, unknown>[];
}

export function useClassifySpreadsheet(auditId: string) {
  return useMutation({
    mutationFn: (input: ClassifySpreadsheetInput) =>
      apiClient.post<SpreadsheetClassification>(`/audits/${auditId}/investigation-report/caats/classify`, input),
  });
}

// ─── Persistir un auto-run ya ejecutado (el motor corre en el frontend, esto
// solo guarda el resultado — ver caats-auto-run.service.ts) ────────────────

export interface CreateCaatsAutoRunInput {
  engine: AnalysisId;
  descripcion: string;
  fileName?: string;
  fieldMapping?: Record<string, unknown>;
  result: Record<string, unknown>;
  confianzaDeteccion?: number;
  justificacionDeteccion?: string;
}

export function useCreateCaatsAutoRun(auditId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCaatsAutoRunInput) =>
      apiClient.post<CaatsAutoRun>(`/audits/${auditId}/investigation-report/caats`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['audit', auditId, 'caats-history'] });
    },
  });
}
