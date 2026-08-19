'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

// ─── Types (espejo de apps/api/.../field-evidence, ver EVD-04..09) ───────────

export type FieldEvidenceKind = 'TEXT_NOTE' | 'AUDIO_NOTE' | 'INTERVIEW_AUDIO' | 'ANNOTATED_PHOTO' | 'SHORT_VIDEO';
export type FieldEvidenceStatus = 'UPLOADED' | 'TRANSCRIBING' | 'EXTRACTING' | 'READY' | 'FAILED';
export type EvidenceFindingDisposition = 'PENDING' | 'ACCEPTED' | 'DISCARDED' | 'PROMOTED';

export interface ReferenciaExpediente {
  code: string;
  section_key?: string;
  motivo: string;
}

export interface FieldEvidenceFinding {
  id: string;
  evidenceId: string;
  tipo: string;
  descripcion: string;
  citaTextual: string;
  fuenteRef: string | null;
  nivelRiesgo: string;
  justificacion: string | null;
  validadaCita: boolean;
  referenciasExpediente: ReferenciaExpediente[] | null;
  disposition: EvidenceFindingDisposition;
  reviewedById: string | null;
  reviewedAt: string | null;
  targetSectionKey: string | null;
  promotedToPaperId: string | null;
  createdAt: string;
}

export interface FieldEvidenceTranscript {
  texto: string;
  segmentos: { inicio: number; fin: number; texto: string; hablante?: string | null }[];
  idioma: string;
  duracion_seg: number;
  modelo: string;
  processing_ms: number;
}

export interface FieldEvidenceExtraccion {
  resumen_ejecutivo: string;
  temas: string[];
  entidades_mencionadas: { nombre: string; tipo: string }[];
}

export interface FieldEvidence {
  id: string;
  auditId: string;
  paperId: string;
  sectionKey: string;
  kind: FieldEvidenceKind;
  status: FieldEvidenceStatus;
  filename: string | null;
  mimeType: string | null;
  size: number;
  sha256: string;
  textoOriginal: string | null;
  capturedById: string;
  capturedByName: string;
  capturedAt: string;
  uploadedAt: string;
  consentimiento: boolean;
  lugar: string | null;
  descripcion: string | null;
  anotaciones: AnotacionFoto[] | null;
  transcript: FieldEvidenceTranscript | null;
  extraccionRaw: FieldEvidenceExtraccion | null;
  errorMsg: string | null;
  processingMs: number | null;
  modeloTranscripcion: string | null;
  modeloLlm: string | null;
  createdAt: string;
  updatedAt: string;
  findings: FieldEvidenceFinding[];
}

export interface AnotacionFoto {
  tipo: 'circulo' | 'flecha' | 'texto';
  x: number; y: number;
  x2?: number; y2?: number;
  radio?: number;
  nota?: string;
}

export interface CrearEvidenciaInput {
  kind: 'TEXT_NOTE' | 'AUDIO_NOTE' | 'INTERVIEW_AUDIO' | 'ANNOTATED_PHOTO' | 'SHORT_VIDEO';
  sectionKey: string;
  capturedAt: string; // ISO
  consentimiento?: boolean; // obligatorio true para INTERVIEW_AUDIO — validado también en backend
  lugar?: string;
  descripcion?: string;
  texto?: string;         // obligatorio para TEXT_NOTE
  file?: File | Blob;     // obligatorio para AUDIO_NOTE / INTERVIEW_AUDIO / ANNOTATED_PHOTO / SHORT_VIDEO
  fileName?: string;      // nombre de archivo para el Blob grabado (MediaRecorder no trae uno)
  anotaciones?: AnotacionFoto[]; // ANNOTATED_PHOTO
}

const PROCESANDO: FieldEvidenceStatus[] = ['UPLOADED', 'TRANSCRIBING', 'EXTRACTING'];

// ─── Queries ──────────────────────────────────────────────────────────────────

export function useFieldEvidenceList(paperId: string, enabled = true) {
  return useQuery<FieldEvidence[]>({
    queryKey: ['field-evidence', paperId],
    queryFn: () => apiClient.get<FieldEvidence[]>(`/working-papers/${paperId}/evidence`),
    enabled: enabled && Boolean(paperId),
    // Poll mientras haya al menos una evidencia en proceso — se detiene sola
    // cuando todo llega a READY/FAILED, sin necesidad de un socket/SSE.
    refetchInterval: (query) => {
      const data = query.state.data;
      const enProceso = data?.some(e => PROCESANDO.includes(e.status));
      return enProceso ? 3000 : false;
    },
  });
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export function useCreateFieldEvidence(paperId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CrearEvidenciaInput) => {
      const formData = new FormData();
      formData.append('kind', input.kind);
      formData.append('sectionKey', input.sectionKey);
      formData.append('capturedAt', input.capturedAt);
      if (input.consentimiento !== undefined) formData.append('consentimiento', String(input.consentimiento));
      if (input.anotaciones) formData.append('anotaciones', JSON.stringify(input.anotaciones));
      if (input.lugar) formData.append('lugar', input.lugar);
      if (input.descripcion) formData.append('descripcion', input.descripcion);
      if (input.texto) formData.append('texto', input.texto);
      if (input.file) formData.append('file', input.file, input.fileName ?? 'nota_voz.webm');
      return apiClient.postForm<FieldEvidence>(`/working-papers/${paperId}/evidence`, formData);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['field-evidence', paperId] });
    },
  });
}

/** URL firmada de corta duración (5 min) para escuchar/ver o descargar el
 * archivo original — se pide bajo demanda (al hacer clic), nunca se cachea. */
export async function fetchFieldEvidenceMediaUrl(
  paperId: string,
  evidenceId: string,
  mode: 'view' | 'download',
): Promise<{ url: string; expiresIn: number }> {
  return apiClient.get(`/working-papers/${paperId}/evidence/${evidenceId}/media?mode=${mode}`);
}

export function useDeleteFieldEvidence(paperId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (evidenceId: string) =>
      apiClient.delete(`/working-papers/${paperId}/evidence/${evidenceId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['field-evidence', paperId] });
    },
  });
}

export function useRetryFieldEvidence(paperId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (evidenceId: string) =>
      apiClient.post<FieldEvidence>(`/working-papers/${paperId}/evidence/${evidenceId}/retry`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['field-evidence', paperId] });
    },
  });
}

export function useAcceptFinding(paperId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ findingId, targetSectionKey }: { findingId: string; targetSectionKey?: string }) =>
      apiClient.post(`/working-papers/${paperId}/evidence/findings/${findingId}/accept`, { targetSectionKey }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['field-evidence', paperId] });
      qc.invalidateQueries({ queryKey: ['wp', paperId, 'sections'] });
    },
  });
}

export function useDiscardFinding(paperId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (findingId: string) =>
      apiClient.post(`/working-papers/${paperId}/evidence/findings/${findingId}/discard`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['field-evidence', paperId] });
    },
  });
}

export function usePromoteFinding(paperId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (findingId: string) =>
      apiClient.post(`/working-papers/${paperId}/evidence/findings/${findingId}/promote`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['field-evidence', paperId] });
    },
  });
}
