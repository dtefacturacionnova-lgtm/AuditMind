'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────
export type QaipTrack = 'IIA_INTERNAL' | 'NIGC_EXTERNAL';
export type QaipAssessmentKind = 'AUTOEVALUACION' | 'EQA_EXTERNA' | 'SAIV';
export type AcceptanceRating = 'PENDING' | 'GREEN' | 'YELLOW' | 'RED';

export interface QaipStandard {
  id: string;
  track: QaipTrack;
  code: string;
  component: string;
  title: string;
  guidance?: string | null;
  sortOrder: number;
}

export interface QaipAssessmentItem {
  id: string;
  assessmentId: string;
  standardId: string;
  rating: AcceptanceRating;
  evidence?: string | null;
  notes?: string | null;
  standard: QaipStandard;
}

export interface QaipAssessment {
  id: string;
  organizationId: string;
  track: QaipTrack;
  kind: QaipAssessmentKind;
  period: string;
  assessorName?: string | null;
  overallResult: AcceptanceRating;
  overallJustification?: string | null;
  nextDueAt?: string | null;
  decidedById?: string | null;
  decidedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  decidedBy?: { id: string; name: string } | null;
  items: QaipAssessmentItem[];
}

export interface IndependenceDeclaration {
  id: string;
  organizationId: string;
  caeId: string;
  year: number;
  declarationText: string;
  signedAt: string;
  documentUrl?: string | null;
  createdAt: string;
}

export interface AuditCharter {
  id: string;
  organizationId: string;
  version: number;
  content: unknown;
  approvedBy: string;
  approvedAt: string;
  effectiveDate: string;
  createdAt: string;
}

// ─── V2 — Hallazgos, causa raíz y remediación ──────────────────────────────
export type QaipFindingSource = 'AUTOEVALUACION' | 'EQR' | 'COMITE' | 'AD_HOC';
export type QaipFindingStatus = 'OPEN' | 'REMEDIATED' | 'CLOSED';
export type FindingSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFORMATIONAL';
export type QaipRootCauseCategory = 'COMPETENCIA' | 'PRESION_TIEMPO' | 'BRECHA_METODOLOGICA' | 'SUPERVISION_INSUFICIENTE' | 'TONO_DIRECCION' | 'OTRO';
export type QaipRemediationStatus = 'OPEN' | 'DONE';

export interface QaipRootCause {
  id: string;
  findingId: string;
  category: QaipRootCauseCategory;
  analysis: string;
  createdAt: string;
}

export interface QaipRemediationAction {
  id: string;
  findingId: string;
  description: string;
  ownerId: string;
  dueDate: string;
  status: QaipRemediationStatus;
  closureEvidence?: string | null;
  closedAt?: string | null;
  createdAt: string;
  owner?: { id: string; name: string };
}

export interface QaipFinding {
  id: string;
  organizationId: string;
  track: QaipTrack;
  source: QaipFindingSource;
  assessmentItemId?: string | null;
  engagementId?: string | null;
  severity: FindingSeverity;
  description: string;
  status: QaipFindingStatus;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: { id: string; name: string };
  assessmentItem?: { standard: QaipStandard } | null;
  rootCauses: QaipRootCause[];
  remediationActions: QaipRemediationAction[];
}

export interface QaipPerformanceDashboard {
  year: number;
  engagementPerformance: {
    totalSignedOff: number;
    reviewedPct: number | null;
    avgDaysReviewToSignOff: number | null;
  };
  qualityFindings: {
    open: number;
    remediated: number;
    closed: number;
    overdueRemediationActions: number;
    byRootCauseCategory: Record<string, number>;
  };
  clientAcceptanceCoverage: {
    activeClients: number;
    withDecidedAcceptance: number;
    coveragePct: number | null;
  };
}

// ─── Query keys ───────────────────────────────────────────────────────────────
const STANDARDS_KEY = 'qaip-standards';
const ASSESSMENTS_KEY = 'qaip-assessments';
const ASSESSMENT_KEY = 'qaip-assessment';
const INDEPENDENCE_KEY = 'qaip-independence';
const CHARTERS_KEY = 'qaip-charters';
const FINDINGS_KEY = 'qaip-findings';
const PERFORMANCE_KEY = 'qaip-performance';

// ─── Standards ────────────────────────────────────────────────────────────────
export function useQaipStandards(track: QaipTrack) {
  return useQuery<QaipStandard[]>({
    queryKey: [STANDARDS_KEY, track],
    queryFn: () => apiClient.get(`/qaip/standards?track=${track}`),
    staleTime: 5 * 60_000,
  });
}

// ─── Assessments ──────────────────────────────────────────────────────────────
export function useQaipAssessments(track?: QaipTrack) {
  const qs = track ? `?track=${track}` : '';
  return useQuery<QaipAssessment[]>({
    queryKey: [ASSESSMENTS_KEY, track ?? 'all'],
    queryFn: () => apiClient.get(`/qaip/assessments${qs}`),
    staleTime: 15_000,
  });
}

export function useQaipAssessment(id: string) {
  return useQuery<QaipAssessment>({
    queryKey: [ASSESSMENT_KEY, id],
    queryFn: () => apiClient.get(`/qaip/assessments/${id}`),
    enabled: !!id,
    staleTime: 10_000,
  });
}

export function useStartQaipAssessment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { track: QaipTrack; kind?: QaipAssessmentKind; period?: string; assessorName?: string }) =>
      apiClient.post<QaipAssessment>('/qaip/assessments/start', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [ASSESSMENTS_KEY] });
    },
  });
}

export function useUpdateQaipAssessmentItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: { rating?: AcceptanceRating; evidence?: string; notes?: string } }) =>
      apiClient.patch<QaipAssessmentItem>(`/qaip/assessment-items/${id}`, data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: [ASSESSMENT_KEY, vars.id] });
      qc.invalidateQueries({ queryKey: [ASSESSMENTS_KEY] });
    },
  });
}

export function useDecideQaipAssessment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, overallJustification, nextDueAt }: { id: string; overallJustification: string; nextDueAt?: string }) =>
      apiClient.post<QaipAssessment>(`/qaip/assessments/${id}/decide`, { overallJustification, nextDueAt }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [ASSESSMENTS_KEY] });
      qc.invalidateQueries({ queryKey: [ASSESSMENT_KEY] });
    },
  });
}

// ─── Independencia y Estatuto ───────────────────────────────────────────────────
export function useIndependenceDeclarations() {
  return useQuery<IndependenceDeclaration[]>({
    queryKey: [INDEPENDENCE_KEY],
    queryFn: () => apiClient.get('/qaip/independence-declarations'),
    staleTime: 30_000,
  });
}

export function useUpsertIndependenceDeclaration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { year?: number; declarationText: string; documentUrl?: string }) =>
      apiClient.post<IndependenceDeclaration>('/qaip/independence-declarations', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: [INDEPENDENCE_KEY] }),
  });
}

export function useAuditCharters() {
  return useQuery<AuditCharter[]>({
    queryKey: [CHARTERS_KEY],
    queryFn: () => apiClient.get('/qaip/charters'),
    staleTime: 30_000,
  });
}

export function useCreateAuditCharter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { content: string; approvedBy: string; approvedAt: string; effectiveDate: string }) =>
      apiClient.post<AuditCharter>('/qaip/charters', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: [CHARTERS_KEY] }),
  });
}

// ─── Hallazgos, causa raíz y remediación ─────────────────────────────────────
export function useQaipFindings(track?: QaipTrack, status?: QaipFindingStatus) {
  const params = new URLSearchParams();
  if (track) params.set('track', track);
  if (status) params.set('status', status);
  const qs = params.toString();
  return useQuery<QaipFinding[]>({
    queryKey: [FINDINGS_KEY, track ?? 'all', status ?? 'all'],
    queryFn: () => apiClient.get(`/qaip/findings${qs ? '?' + qs : ''}`),
    staleTime: 15_000,
  });
}

export function useCreateQaipFinding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      track: QaipTrack; source: QaipFindingSource; severity: FindingSeverity; description: string;
      assessmentItemId?: string; engagementId?: string;
    }) => apiClient.post<QaipFinding>('/qaip/findings', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [FINDINGS_KEY] });
      qc.invalidateQueries({ queryKey: [PERFORMANCE_KEY] });
    },
  });
}

export function useUpdateQaipFindingStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: QaipFindingStatus }) =>
      apiClient.patch<QaipFinding>(`/qaip/findings/${id}/status`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [FINDINGS_KEY] });
      qc.invalidateQueries({ queryKey: [PERFORMANCE_KEY] });
    },
  });
}

export function useAddQaipRootCause() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ findingId, category, analysis }: { findingId: string; category: QaipRootCauseCategory; analysis: string }) =>
      apiClient.post<QaipFinding>(`/qaip/findings/${findingId}/root-causes`, { category, analysis }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [FINDINGS_KEY] });
      qc.invalidateQueries({ queryKey: [PERFORMANCE_KEY] });
    },
  });
}

export function useAddQaipRemediationAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ findingId, description, ownerId, dueDate }: { findingId: string; description: string; ownerId: string; dueDate: string }) =>
      apiClient.post<QaipFinding>(`/qaip/findings/${findingId}/remediation-actions`, { description, ownerId, dueDate }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [FINDINGS_KEY] });
      qc.invalidateQueries({ queryKey: [PERFORMANCE_KEY] });
    },
  });
}

export function useUpdateQaipRemediationAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status, closureEvidence }: { id: string; status?: QaipRemediationStatus; closureEvidence?: string }) =>
      apiClient.patch<QaipRemediationAction>(`/qaip/remediation-actions/${id}`, { status, closureEvidence }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [FINDINGS_KEY] });
      qc.invalidateQueries({ queryKey: [PERFORMANCE_KEY] });
    },
  });
}

export function useQaipPerformance(year: number) {
  return useQuery<QaipPerformanceDashboard>({
    queryKey: [PERFORMANCE_KEY, year],
    queryFn: () => apiClient.get(`/qaip/performance?year=${year}`),
    staleTime: 30_000,
  });
}

export const QAIP_FINDING_STATUS_CONFIG: Record<QaipFindingStatus, { label: string; color: string; bg: string }> = {
  OPEN:       { label: 'Abierto',    color: 'text-red-700',     bg: 'bg-red-100' },
  REMEDIATED: { label: 'Remediado',  color: 'text-amber-700',   bg: 'bg-amber-100' },
  CLOSED:     { label: 'Cerrado',    color: 'text-emerald-700', bg: 'bg-emerald-100' },
};

export const QAIP_SEVERITY_CONFIG: Record<FindingSeverity, { label: string; color: string; bg: string }> = {
  CRITICAL:      { label: 'Crítico',    color: 'text-red-700',    bg: 'bg-red-100' },
  HIGH:          { label: 'Alto',       color: 'text-orange-700', bg: 'bg-orange-100' },
  MEDIUM:        { label: 'Medio',      color: 'text-amber-700',  bg: 'bg-amber-100' },
  LOW:           { label: 'Bajo',       color: 'text-blue-700',   bg: 'bg-blue-100' },
  INFORMATIONAL: { label: 'Informativo', color: 'text-gray-600',  bg: 'bg-gray-100' },
};

export const QAIP_ROOT_CAUSE_LABEL: Record<QaipRootCauseCategory, string> = {
  COMPETENCIA: 'Brecha de competencia',
  PRESION_TIEMPO: 'Presión de tiempo',
  BRECHA_METODOLOGICA: 'Brecha metodológica',
  SUPERVISION_INSUFICIENTE: 'Supervisión insuficiente',
  TONO_DIRECCION: 'Tono desde la dirección',
  OTRO: 'Otro',
};

// ─── Config visual ──────────────────────────────────────────────────────────────
export const QAIP_RATING_CONFIG: Record<AcceptanceRating, { label: string; color: string; bg: string; border: string }> = {
  PENDING: { label: 'Pendiente', color: 'text-gray-500',    bg: 'bg-gray-100',    border: 'border-gray-200' },
  GREEN:   { label: 'Verde',     color: 'text-emerald-700', bg: 'bg-emerald-100', border: 'border-emerald-300' },
  YELLOW:  { label: 'Amarillo',  color: 'text-amber-700',   bg: 'bg-amber-100',   border: 'border-amber-300' },
  RED:     { label: 'Rojo',      color: 'text-red-700',     bg: 'bg-red-100',     border: 'border-red-300' },
};

export const QAIP_TRACK_LABEL: Record<QaipTrack, { label: string; sub: string }> = {
  IIA_INTERNAL:  { label: 'Auditoría Interna', sub: 'Normas Globales del IIA (2024) — Dominio V' },
  NIGC_EXTERNAL: { label: 'Auditoría Externa / Fiscal / AML', sub: 'NIGC 1 y 2 (ISQM 1/2) — CVPCPA' },
};
