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

// ─── Query keys ───────────────────────────────────────────────────────────────
const STANDARDS_KEY = 'qaip-standards';
const ASSESSMENTS_KEY = 'qaip-assessments';
const ASSESSMENT_KEY = 'qaip-assessment';
const INDEPENDENCE_KEY = 'qaip-independence';
const CHARTERS_KEY = 'qaip-charters';

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
