'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { FieldEvidenceStatus, FieldEvidenceTranscript } from './useFieldEvidence';

// ─── Types (espejo de apps/api/src/investigation-report — Fase 2b SHERLOCK) ───
// Los campos anidados (hallazgos, claims) conservan snake_case porque son la
// forma cruda de la respuesta del LLM (mismo criterio que FieldEvidenceExtraccion
// en useFieldEvidence.ts) — solo el objeto contenedor usa camelCase.

export type InvestigationReportStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
export type NivelRiesgoInvestigador = 'bajo' | 'medio' | 'alto';
export type VeredictoClaim = 'confirmada' | 'contradicha' | 'sin_evidencia_suficiente';

export interface HallazgoInvestigador {
  titulo: string;
  descripcion: string;
  cita_textual: string;
  entidad_ids: string[];
  nivel_riesgo: NivelRiesgoInvestigador;
  justificacion: string;
  citaVerificada: boolean; // defensa en profundidad de NestJS — ver investigation-report.service.ts
}

export interface ClusterHallazgos {
  tema: string;
  resumen: string;
  hallazgos: HallazgoInvestigador[];
}

export interface ClaimVerificacion {
  claim_texto: string;
  veredicto: VeredictoClaim;
  justificacion: string;
  citas_relevantes: string[];
  entidad_ids: string[];
  citasVerificadas: boolean[];
}

export interface FuenteNoValidada {
  evidenceId: string;
  filename: string | null;
  motivo: string | null;
}

export interface FuenteContextoExcluida {
  evidenceId: string;
  motivo: string;
}

export interface InvestigationReportResult {
  conclusionGeneral: string;
  hallazgosObjetivo: ClusterHallazgos[];
  otrasBanderas: ClusterHallazgos[];
  verificacionContexto: ClaimVerificacion[];
  fuentesNoValidadas: FuenteNoValidada[];
  contextoEvidenceIds: string[];
  fuentesContextoExcluidas: FuenteContextoExcluida[];
  claimsExtraidos: string[];
  grafoTruncado: boolean;
  notaTruncamiento: string | null;
  totalEntidadesIncluidas: number;
  totalEntidadesTotales: number;
  modelo: string;
  inputTokens: number;
  outputTokens: number;
}

export interface InvestigationReport {
  id: string;
  auditId: string;
  objetivo: string;
  status: InvestigationReportStatus;
  result: InvestigationReportResult | null;
  errorMsg: string | null;
  requestedById: string;
  startedAt: string;
  completedAt: string | null;
}

export type InvestigationContextKind = 'TEXT_NOTE' | 'AUDIO_NOTE';

export interface InvestigationContextNote {
  id: string;
  auditId: string;
  kind: InvestigationContextKind;
  status: FieldEvidenceStatus;
  textoOriginal: string | null;
  transcript: FieldEvidenceTranscript | null;
  calidadBaja: boolean;
  calidadMotivo: string | null;
  errorMsg: string | null;
  capturedAt: string;
  capturedByName: string;
}

const PROCESANDO_REPORT: InvestigationReportStatus[] = ['PENDING', 'RUNNING'];
const PROCESANDO_CONTEXTO: FieldEvidenceStatus[] = ['UPLOADED', 'TRANSCRIBING'];

// ─── Informes ─────────────────────────────────────────────────────────────────

export function useInvestigationReports(auditId: string, enabled = true) {
  return useQuery<InvestigationReport[]>({
    queryKey: ['audit', auditId, 'investigation-reports'],
    queryFn: () => apiClient.get<InvestigationReport[]>(`/audits/${auditId}/investigation-report`),
    enabled: enabled && Boolean(auditId),
    // Sin esto, tras crear un informe la lista queda congelada en el snapshot
    // RUNNING inicial — el botón "Generar informe" quedaría deshabilitado para
    // siempre una vez el informe termina, porque nada vuelve a pedir la lista
    // (solo useInvestigationReport hace polling, y ese es el detalle de UNO).
    refetchInterval: (query) => {
      const data = query.state.data;
      const enProceso = data?.some((r) => r.status === 'PENDING' || r.status === 'RUNNING');
      return enProceso ? 3000 : false;
    },
  });
}

export function useInvestigationReport(auditId: string, reportId: string | undefined) {
  return useQuery<InvestigationReport>({
    queryKey: ['audit', auditId, 'investigation-report', reportId],
    queryFn: () => apiClient.get<InvestigationReport>(`/audits/${auditId}/investigation-report/${reportId}`),
    enabled: Boolean(auditId) && Boolean(reportId),
    // Poll mientras el informe siga PENDING/RUNNING — mismo idioma que useFieldEvidenceList.
    refetchInterval: (query) => {
      const data = query.state.data;
      return data && PROCESANDO_REPORT.includes(data.status) ? 3000 : false;
    },
  });
}

export function useCreateInvestigationReport(auditId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (objetivo: string) =>
      apiClient.post<InvestigationReport>(`/audits/${auditId}/investigation-report`, { objetivo }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['audit', auditId, 'investigation-reports'] });
    },
  });
}

// ─── Contexto previo del auditor ────────────────────────────────────────────

export function useInvestigationContext(auditId: string) {
  return useQuery<InvestigationContextNote[]>({
    queryKey: ['audit', auditId, 'investigation-context'],
    queryFn: () => apiClient.get<InvestigationContextNote[]>(`/audits/${auditId}/investigation-report/context`),
    enabled: Boolean(auditId),
    refetchInterval: (query) => {
      const data = query.state.data;
      const enProceso = data?.some((n) => PROCESANDO_CONTEXTO.includes(n.status));
      return enProceso ? 3000 : false;
    },
  });
}

export interface CrearContextoInput {
  kind: InvestigationContextKind;
  capturedAt: string; // ISO
  texto?: string;      // obligatorio para TEXT_NOTE
  file?: Blob;          // obligatorio para AUDIO_NOTE
  fileName?: string;
}

export function useCreateInvestigationContext(auditId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CrearContextoInput) => {
      const formData = new FormData();
      formData.append('kind', input.kind);
      formData.append('capturedAt', input.capturedAt);
      if (input.texto) formData.append('texto', input.texto);
      if (input.file) formData.append('file', input.file, input.fileName ?? 'nota_voz.webm');
      return apiClient.postForm<InvestigationContextNote>(`/audits/${auditId}/investigation-report/context`, formData);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['audit', auditId, 'investigation-context'] });
    },
  });
}

export function useDeleteInvestigationContext(auditId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (evidenceId: string) =>
      apiClient.delete(`/audits/${auditId}/investigation-report/context/${evidenceId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['audit', auditId, 'investigation-context'] });
    },
  });
}
