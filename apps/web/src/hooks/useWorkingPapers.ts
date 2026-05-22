'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────
export type WpStatus     = 'DRAFT' | 'IN_REVIEW' | 'APPROVED' | 'ARCHIVED';
export type WpKind       = 'STANDARD' | 'SMART' | 'MASTER' | 'LIVE';
export type WpSyncStatus = 'DRAFT' | 'SYNCED' | 'STALE' | 'REGENERATING';
export type WpType    =
  | 'PLANNING_UNDERSTANDING' | 'CONTROL_EVALUATION' | 'SUBSTANTIVE_TEST'
  | 'DATA_ANALYSIS' | 'FINDING' | 'CLOSURE_CONCLUSION'
  | 'INTERVIEW' | 'CONFIRMATION' | 'NORMATIVE_ANALYSIS';

export type TickMarkKey =
  | 'VERIFIED' | 'EXCEPTION' | 'ESTIMATED' | 'CONFIRMED_THIRD'
  | 'RECALCULATED' | 'FOOTED' | 'CROSS_FOOTED' | 'NOT_APPLICABLE'
  | 'PENDING' | 'ATTENTION';

export interface TickMarkEntry {
  id: string;
  paperId: string;
  fieldPath: string;
  tickMark: TickMarkKey;
  note?: string;
  createdBy: string;
  createdAt: string;
}

export interface WpComment {
  id: string;
  paperId: string;
  authorId: string;
  content: string;
  resolved: boolean;
  resolvedBy?: string;
  createdAt: string;
}

export interface WpVersion {
  id: string;
  version: number;
  changedBy: string;
  changedAt: string;
}

export interface WorkingPaperContent {
  objective?:    string;
  scope?:        string;
  procedures?:   string;
  evidence?:     string;
  observations?: string;
  [key: string]: unknown;
}

export interface WorkingPaper {
  id:             string;
  code:           string;
  title:          string;
  type:           WpType;
  wpKind:         WpKind;
  syncStatus:     WpSyncStatus;
  lastSyncedAt?:  string;
  narrative?:     string;
  paperCode?:     string;
  indexSection:   string;
  status:         WpStatus;
  content:        WorkingPaperContent;
  conclusion?:    string;
  version:        number;
  tickMarks:      string[];
  crossReferences: string[];
  aiAssisted:     boolean;
  qualityScore?:  number;
  auditId:        string;
  preparedById?:  string;
  reviewedById?:  string;
  createdAt:      string;
  updatedAt:      string;
  audit?:         { id: string; title: string; type?: string; scope?: string };
  preparedBy?:    { id: string; name: string; avatarUrl?: string };
  reviewedBy?:    { id: string; name: string; avatarUrl?: string };
  findings?:      { id: string; title: string; severity: string; status: string }[];
  tickEntries?:   TickMarkEntry[];
  comments?:      WpComment[];
  _count?:        { findings: number; tickEntries: number; comments: number };
}

export interface CreateWpData {
  title:          string;
  type:           WpType;
  indexSection:   string;
  auditId:        string;
  reviewerId?:    string;
  content?:       WorkingPaperContent;
  conclusion?:    string;
  crossReferences?: string[];
}

// ─── Queries ──────────────────────────────────────────────────────────────────
export function useWorkingPapersForAudit(auditId: string) {
  return useQuery<WorkingPaper[]>({
    queryKey:  ['wps', 'audit', auditId],
    queryFn:   () => apiClient.get(`/working-papers/by-audit/${auditId}`),
    enabled:   !!auditId,
    staleTime: 30_000,
  });
}

export function useWorkingPaperIndex(auditId: string) {
  return useQuery<Record<string, WorkingPaper[]>>({
    queryKey:  ['wps', 'index', auditId],
    queryFn:   () => apiClient.get(`/working-papers/index/${auditId}`),
    enabled:   !!auditId,
    staleTime: 30_000,
  });
}

export function useWorkingPapersForOrg(filters?: {
  auditId?: string;
  status?:  WpStatus;
  page?:    number;
  limit?:   number;
}) {
  return useQuery<{ data: WorkingPaper[]; meta: { total: number; page: number; totalPages: number } }>({
    queryKey: ['wps', 'org', filters],
    queryFn:  () => {
      const params = new URLSearchParams();
      if (filters?.auditId) params.set('auditId', filters.auditId);
      if (filters?.status)  params.set('status',  filters.status);
      if (filters?.page)    params.set('page',     String(filters.page));
      if (filters?.limit)   params.set('limit',    String(filters.limit));
      const qs = params.toString();
      return apiClient.get(`/working-papers/org${qs ? `?${qs}` : ''}`);
    },
    staleTime: 30_000,
  });
}

export function useWorkingPaper(id: string) {
  return useQuery<WorkingPaper>({
    queryKey:  ['wp', id],
    queryFn:   () => apiClient.get(`/working-papers/${id}`),
    enabled:   !!id,
    staleTime: 15_000,
  });
}

export function useWpVersions(id: string) {
  return useQuery<WpVersion[]>({
    queryKey:  ['wp', id, 'versions'],
    queryFn:   () => apiClient.get(`/working-papers/${id}/versions`),
    enabled:   !!id,
    staleTime: 60_000,
  });
}

// ─── Mutations ────────────────────────────────────────────────────────────────
export function useCreateWorkingPaper() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateWpData) => apiClient.post<WorkingPaper>('/working-papers', data),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['wps', 'audit', res.auditId] });
      qc.invalidateQueries({ queryKey: ['wps', 'index', res.auditId] });
      qc.invalidateQueries({ queryKey: ['wps', 'org'] });
    },
  });
}

export function useUpdateWorkingPaper(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<CreateWpData> & { conclusion?: string }) =>
      apiClient.patch<WorkingPaper>(`/working-papers/${id}`, data),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['wp', id] });
      qc.invalidateQueries({ queryKey: ['wps', 'audit', res.auditId] });
      qc.invalidateQueries({ queryKey: ['wp', id, 'versions'] });
    },
  });
}

export function useUpdateWpStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status, reviewNotes }: { id: string; status: string; reviewNotes?: string }) =>
      apiClient.patch<WorkingPaper>(`/working-papers/${id}/status`, { status, reviewNotes }),
    onSuccess: (res: WorkingPaper) => {
      qc.invalidateQueries({ queryKey: ['wp', res.id] });
      qc.invalidateQueries({ queryKey: ['wps', 'org'] });
    },
  });
}

export function useAddTickMark(paperId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ fieldPath, tickMark, note }: { fieldPath: string; tickMark: TickMarkKey; note?: string }) =>
      apiClient.post<TickMarkEntry>(`/working-papers/${paperId}/tick-marks`, { fieldPath, tickMark, note }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wp', paperId] }),
  });
}

export function useRemoveTickMark(paperId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (entryId: string) =>
      apiClient.delete(`/working-papers/tick-marks/${entryId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wp', paperId] }),
  });
}

export function useAddWpComment(paperId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (content: string) =>
      apiClient.post<WpComment>(`/working-papers/${paperId}/comments`, { content }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wp', paperId] }),
  });
}

export function useResolveWpComment(paperId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (commentId: string) =>
      apiClient.patch(`/working-papers/comments/${commentId}/resolve`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wp', paperId] }),
  });
}

// ─── Config helpers ───────────────────────────────────────────────────────────
export const WP_TYPE_CONFIG: Record<WpType, { label: string; section: string; color: string }> = {
  PLANNING_UNDERSTANDING: { label: 'Planificación',         section: 'A',  color: 'text-purple-700' },
  CONTROL_EVALUATION:     { label: 'Evaluación de Control', section: 'B',  color: 'text-blue-700' },
  SUBSTANTIVE_TEST:       { label: 'Prueba Sustantiva',     section: 'C',  color: 'text-indigo-700' },
  DATA_ANALYSIS:          { label: 'Análisis de Datos',     section: 'AD', color: 'text-cyan-700' },
  FINDING:                { label: 'Hallazgo',              section: 'D',  color: 'text-orange-700' },
  CLOSURE_CONCLUSION:     { label: 'Cierre y Conclusión',   section: 'E',  color: 'text-teal-700' },
  INTERVIEW:              { label: 'Entrevista',            section: 'I',  color: 'text-amber-700' },
  CONFIRMATION:           { label: 'Confirmación',          section: 'CF', color: 'text-green-700' },
  NORMATIVE_ANALYSIS:     { label: 'Análisis Normativo',    section: 'N',  color: 'text-rose-700' },
};

export const WP_STATUS_CONFIG: Record<WpStatus, { label: string; color: string; bg: string }> = {
  DRAFT:     { label: 'Borrador',    color: 'text-gray-600',    bg: 'bg-gray-100' },
  IN_REVIEW: { label: 'En Revisión', color: 'text-amber-700',   bg: 'bg-amber-100' },
  APPROVED:  { label: 'Aprobado',    color: 'text-emerald-700', bg: 'bg-emerald-100' },
  ARCHIVED:  { label: 'Archivado',   color: 'text-gray-500',    bg: 'bg-gray-100' },
};

export const TICK_MARK_CONFIG: Record<TickMarkKey, { symbol: string; label: string; color: string }> = {
  VERIFIED:        { symbol: '√',  label: 'Verificado',               color: 'text-emerald-600' },
  EXCEPTION:       { symbol: 'X',  label: 'Excepción',                color: 'text-red-600' },
  ESTIMATED:       { symbol: '*',  label: 'Estimado',                 color: 'text-amber-600' },
  CONFIRMED_THIRD: { symbol: '©',  label: 'Confirmado c/ tercero',    color: 'text-blue-600' },
  RECALCULATED:    { symbol: 'R',  label: 'Recalculado',              color: 'text-indigo-600' },
  FOOTED:          { symbol: 'F',  label: 'Sumatoria verificada',     color: 'text-teal-600' },
  CROSS_FOOTED:    { symbol: 'CF', label: 'Totales cruzados',         color: 'text-cyan-600' },
  NOT_APPLICABLE:  { symbol: 'NA', label: 'No aplica',                color: 'text-gray-500' },
  PENDING:         { symbol: '⏱', label: 'Pendiente',                 color: 'text-orange-600' },
  ATTENTION:       { symbol: '⚑',  label: 'Requiere atención',        color: 'text-red-500' },
};

export const WP_KIND_CONFIG: Record<WpKind, { label: string; color: string; bg: string; border: string }> = {
  STANDARD:  { label: 'Estándar',       color: 'text-gray-600',   bg: 'bg-gray-100',    border: 'border-gray-200' },
  SMART:     { label: 'Inteligente',    color: 'text-blue-700',   bg: 'bg-blue-50',     border: 'border-blue-200' },
  MASTER:    { label: 'Maestro',        color: 'text-purple-700', bg: 'bg-purple-50',   border: 'border-purple-200' },
  LIVE:      { label: 'Vivo',           color: 'text-emerald-700',bg: 'bg-emerald-50',  border: 'border-emerald-200' },
};

export const SYNC_STATUS_CONFIG: Record<WpSyncStatus, { label: string; color: string; bg: string; border: string }> = {
  DRAFT:        { label: 'Sin consolidar',  color: 'text-gray-600',   bg: 'bg-gray-100',   border: 'border-gray-200' },
  SYNCED:       { label: 'Al día',          color: 'text-emerald-700',bg: 'bg-emerald-50', border: 'border-emerald-200' },
  STALE:        { label: 'Desactualizado',  color: 'text-amber-700',  bg: 'bg-amber-50',   border: 'border-amber-200' },
  REGENERATING: { label: 'Consolidando…',  color: 'text-blue-700',   bg: 'bg-blue-50',    border: 'border-blue-200' },
};

export const INDEX_SECTIONS: { key: string; label: string; description: string }[] = [
  { key: 'A',  label: 'A — Planificación',          description: 'Comprensión del negocio y planificación' },
  { key: 'B',  label: 'B — Controles',              description: 'Evaluación del ambiente de control' },
  { key: 'C',  label: 'C — Pruebas Sustantivas',    description: 'Pruebas de detalle y analíticas' },
  { key: 'D',  label: 'D — Hallazgos',              description: 'Hallazgos documentados en papel de trabajo' },
  { key: 'E',  label: 'E — Cierre',                 description: 'Procedimientos de cierre y conclusión' },
  { key: 'AD', label: 'AD — Análisis de Datos',     description: 'Análisis de datos y procedimientos analíticos' },
  { key: 'I',  label: 'I — Entrevistas',            description: 'Registro de entrevistas y consultas' },
  { key: 'CF', label: 'CF — Confirmaciones',        description: 'Confirmaciones externas (NIA 505)' },
  { key: 'N',  label: 'N — Normativo',              description: 'Análisis normativo auto-generado por IA' },
];
