'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

export type SectionFieldType =
  | 'TEXT'
  | 'TEXTAREA'
  | 'NUMBER'
  | 'CURRENCY'
  | 'PERCENTAGE'
  | 'BOOLEAN'
  | 'ENUM_SELECT'
  | 'DATE'
  | 'MATRIX'
  | 'REFERENCE'
  | 'RISK_REF'
  | 'ATTACHMENT'
  | 'ACCOUNT_SCHEDULE'
  | 'DECLARATIONS'
  | 'LEGAL_MATRIX'
  | 'AUDIT_REPORTS'
  | 'CHECKLIST'
  | 'COMMUNICATION_LOG'
  | 'PROCEDURE_GRID';

export interface PaperSection {
  id: string;
  sectionKey: string;
  label: string;
  description?: string;
  fieldType: SectionFieldType;
  value: unknown;
  options?: string[];
  isRequired: boolean;
  isAutoFilled: boolean;
  sourceRef?: string;
  sortOrder: number;
  aiHint?: string;
  // PI.2 — Granular cascade invalidation
  isStale?: boolean;
  staleSince?: string;
  staleReason?: string;
  // Documentos de soporte de la sección
  attachments?: SectionAttachment[];
}

export interface SectionAttachment {
  id: string;
  filename: string;
  url: string;
  mimeType?: string;
  size?: number;
  uploadedAt: string;
}

export interface WpRef {
  id:           string;
  code:         string;
  title:        string;
  wpKind:       string;
  syncStatus:   string;
  sourceField?: string;
  targetField?: string;
  mappingType?: string;
  description?: string | null;
}

export interface PaperGraphData {
  sources: WpRef[];
  targets: WpRef[];
}

export interface TbAccount {
  cuenta:         string;
  descripcion:    string;
  saldo_actual:   number;
  saldo_anterior: number;
  sub_sumaria:    string;
  grupo:          string;
}

export interface TbAccountsResult {
  accounts: TbAccount[];
  message:  string;
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export function usePaperSections(paperId: string) {
  return useQuery<PaperSection[]>({
    queryKey: ['wp', paperId, 'sections'],
    queryFn: () => apiClient.get(`/working-papers/${paperId}/sections`),
    enabled: !!paperId,
    staleTime: 15_000,
  });
}

export function useTbAccounts(paperId: string | undefined) {
  return useQuery<TbAccountsResult>({
    queryKey: ['wp', paperId, 'tb-accounts'],
    queryFn:  () => apiClient.get(`/working-papers/${paperId}/tb-accounts`),
    enabled:  !!paperId,
    staleTime: 60_000,
  });
}

export function usePaperGraph(paperId: string) {
  return useQuery<PaperGraphData>({
    queryKey: ['wp', paperId, 'graph'],
    queryFn: () => apiClient.get(`/working-papers/${paperId}/graph`),
    enabled: !!paperId,
    staleTime: 30_000,
  });
}

export interface MaterialidadData {
  mg:      number | null;
  me:      number | null;
  uae:     number | null;
  paperId: string | null;
}

export function useMaterialidad(auditId: string | null | undefined) {
  return useQuery<MaterialidadData>({
    queryKey: ['materialidad', auditId],
    queryFn:  () => apiClient.get(`/working-papers/audit-materialidad/${auditId}`),
    enabled:  !!auditId,
    staleTime: 5 * 60_000,
  });
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export function useUpdateSection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      paperId,
      sectionKey,
      value,
    }: {
      paperId: string;
      sectionKey: string;
      value: unknown;
    }) =>
      apiClient.patch<PaperSection>(
        `/working-papers/${paperId}/sections/${sectionKey}`,
        { value },
      ),
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: ['wp', vars.paperId, 'sections'] });
    },
  });
}

export function useConsolidatePaper() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (paperId: string) =>
      apiClient.post(`/working-papers/${paperId}/consolidate`, {}),
    onSuccess: (_res, paperId) => {
      qc.invalidateQueries({ queryKey: ['wp', paperId] });
      qc.invalidateQueries({ queryKey: ['wp', paperId, 'sections'] });
    },
  });
}

// Auditoría Financiera: propagar B-00 S2 → B-01..B-06 S1 (determinista)
export function usePropagateTrialBalance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (paperId: string) =>
      apiClient.post<{ propagated: number; total: number; message: string }>(
        `/working-papers/${paperId}/propagate-trial-balance`,
        {},
      ),
    onSuccess: () => {
      // Invalidate all paper sections in the cache — lead schedules just changed
      qc.invalidateQueries({ queryKey: ['wp'] });
    },
  });
}

export function useInitFromTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      paperId,
      templateKey,
    }: {
      paperId: string;
      templateKey: string;
    }) =>
      apiClient.post(
        `/working-papers/${paperId}/sections/init/${templateKey}`,
        {},
      ),
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: ['wp', vars.paperId, 'sections'] });
    },
  });
}

// ─── PI.3: AI section-by-section assistant ───────────────────────────────────

export interface SectionAssistResponse {
  suggestion: string;
  usedAI:     boolean;
}

export function useAssistSection() {
  return useMutation({
    mutationFn: ({
      paperId,
      sectionKey,
      userPrompt,
    }: {
      paperId: string;
      sectionKey: string;
      userPrompt?: string;
    }) =>
      apiClient.post<SectionAssistResponse>(
        `/working-papers/${paperId}/sections/${sectionKey}/assist`,
        { userPrompt },
      ),
  });
}

// ─── PI.2: Stale section management ──────────────────────────────────────────

export interface StaleSection {
  id:          string;
  sectionKey:  string;
  label:       string;
  value:       unknown;
  staleSince:  string;
  staleReason: string;
  sortOrder:   number;
}

export function useStaleSections(paperId: string, enabled = true) {
  return useQuery<StaleSection[]>({
    queryKey: ['wp', paperId, 'stale-sections'],
    queryFn:  () => apiClient.get(`/working-papers/${paperId}/stale-sections`),
    enabled:  !!paperId && enabled,
    staleTime: 10_000,
  });
}

export function useConfirmSection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      paperId,
      sectionKey,
    }: {
      paperId: string;
      sectionKey: string;
    }) =>
      apiClient.post<{ ok: boolean; remainingStale?: number; alreadyFresh?: boolean }>(
        `/working-papers/${paperId}/sections/${sectionKey}/confirm`,
        {},
      ),
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: ['wp', vars.paperId, 'sections'] });
      qc.invalidateQueries({ queryKey: ['wp', vars.paperId, 'stale-sections'] });
      qc.invalidateQueries({ queryKey: ['wp', vars.paperId] });
    },
  });
}

// ─── Sprint 3: Semantic quality gate ─────────────────────────────────────────

export type IssueType     = 'COMPLETENESS' | 'COHERENCE' | 'CONSISTENCY' | 'DEPTH';
export type IssueSeverity = 'WARNING' | 'ERROR';
export type QualityLevel  = 'INSUFICIENTE' | 'ACEPTABLE' | 'BUENA' | 'EXCELENTE';

export interface QualityIssue {
  sectionKey: string;
  label:      string;
  type:       IssueType;
  message:    string;
  severity:   IssueSeverity;
}

export interface QualityCheckResult {
  paperId:        string;
  score:          number;
  level:          QualityLevel;
  aiGenerated:    boolean;
  issues:         QualityIssue[];
  strengths:      string[];
  recommendation: string;
  checkedAt:      string;
}

export function useQualityCheck() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (paperId: string) =>
      apiClient.post<QualityCheckResult>(`/working-papers/${paperId}/quality-check`, {}),
    onSuccess: (_res, paperId) => {
      qc.invalidateQueries({ queryKey: ['wp', paperId] });
    },
  });
}

// ─── Sprint 3: LIVE paper stats ───────────────────────────────────────────────

export interface LiveStats {
  auditId:    string;
  auditTitle: string;
  papers: {
    total: number; draft: number; inReview: number;
    approved: number; archived: number; coveragePercent: number;
    bySection: Record<string, { total: number; approved: number }>;
  };
  findings: {
    total: number; open: number; closed: number;
    critical: number; high: number; medium: number;
    low: number; informational: number; closureRate: number;
  };
  budget: {
    estimatedHours: number; actualHours: number;
    usagePercent: number; onTrack: boolean;
  };
  team: {
    total: number;
    members: Array<{ name: string; role: string; avatarUrl?: string | null }>;
  };
  intelligentPapers: {
    smart: number; master: number; synced: number; stale: number; avgQuality: number;
  };
  recentActivity: Array<{ type: string; description: string; date: string }>;
  updatedAt: string;
}

export function useLiveStats(paperId: string) {
  return useQuery<LiveStats>({
    queryKey:        ['wp', paperId, 'live-stats'],
    queryFn:         () => apiClient.get(`/working-papers/${paperId}/live-stats`),
    enabled:         !!paperId,
    staleTime:       15_000,
    refetchInterval: 30_000,  // auto-refresh every 30s — "live" feel
  });
}

// ─── Sprint 3: Cross-audit AI suggestions ────────────────────────────────────

export type SuggestionPriority = 'HIGH' | 'MEDIUM' | 'LOW';

export interface AiProcedureSuggestion {
  id:        string;
  area:      string;
  procedure: string;
  rationale: string;
  priority:  SuggestionPriority;
  basedOn:   string;
  niaRef?:   string;
}

export interface CrossAuditSuggestionsResult {
  auditId:       string;
  suggestions:   AiProcedureSuggestion[];
  basedOnAudits: number;
  totalFindings: number;
  recurringAreas: string[];
  generatedAt:   string;
  aiGenerated:   boolean;
}

export function useAiSuggestions() {
  return useMutation({
    mutationFn: ({ auditId, paperId }: { auditId: string; paperId?: string }) =>
      apiClient.post<CrossAuditSuggestionsResult>(
        `/working-papers/by-audit/${auditId}/ai-suggestions`,
        { paperId },
      ),
  });
}

// ─── Auditoría Financiera: materialidad cross-paper ───────────────────────────

export interface MaterialidadValues {
  mg:      number | null;
  me:      number | null;
  uae:     number | null;
  paperId: string | null;
}

export function useMaterialidadByAudit(auditId: string) {
  return useQuery<MaterialidadValues>({
    queryKey: ['materialidad', auditId],
    queryFn:  () => apiClient.get(`/working-papers/audit-materialidad/${auditId}`),
    enabled:  !!auditId,
    staleTime: 60_000,
  });
}

// Aplicar un procedimiento sugerido al papel actual
export function useAppendProcedure() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ paperId, ...fields }: {
      paperId: string;
      procedure?: string; title?: string; statement?: string; development?: string;
      area?: string; niaRef?: string;
    }) =>
      apiClient.post<{ added: boolean; total: number }>(
        `/working-papers/${paperId}/append-procedure`,
        fields,
      ),
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: ['wp', vars.paperId] });
    },
  });
}

// Quitar un procedimiento del papel
export function useRemoveProcedure() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ paperId, procedureId }: { paperId: string; procedureId: string }) =>
      apiClient.delete<{ removed: boolean; total: number }>(
        `/working-papers/${paperId}/procedures/${procedureId}`,
      ),
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: ['wp', vars.paperId] });
    },
  });
}

// Actualizar campos de un procedimiento
export function useUpdateProcedure() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ paperId, procedureId, ...fields }: {
      paperId: string; procedureId: string;
      title?: string; statement?: string; development?: string; area?: string; niaRef?: string;
    }) =>
      apiClient.patch(`/working-papers/${paperId}/procedures/${procedureId}`, fields),
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: ['wp', vars.paperId] });
    },
  });
}

// IA: mejorar redacción de un texto
export function useImproveText() {
  return useMutation({
    mutationFn: (body: { text: string; fieldType?: string; paperTitle?: string; paperType?: string }) =>
      apiClient.post<{ improved: string; original: string }>(
        `/working-papers/ai/improve-text`, body,
      ),
  });
}

// IA: generar desarrollo de un procedimiento
export function useDraftProcedure() {
  return useMutation({
    mutationFn: (body: {
      title?: string; statement?: string;
      paperTitle?: string; paperType?: string; paperCode?: string; auditType?: string;
    }) =>
      apiClient.post<{ development: string }>(
        `/working-papers/ai/draft-procedure`, body,
      ),
  });
}

// F3: Adjuntar archivo a un procedimiento
export function useAttachToProcedure() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ paperId, procedureId, file }: { paperId: string; procedureId: string; file: File }) => {
      const fd = new FormData();
      fd.append('file', file);
      return apiClient.postForm(`/working-papers/${paperId}/procedures/${procedureId}/attachments`, fd);
    },
    onSuccess: (_res, vars) => qc.invalidateQueries({ queryKey: ['wp', vars.paperId] }),
  });
}

export function useRemoveAttachment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ paperId, procedureId, attachmentId }: { paperId: string; procedureId: string; attachmentId: string }) =>
      apiClient.delete(`/working-papers/${paperId}/procedures/${procedureId}/attachments/${attachmentId}`),
    onSuccess: (_res, vars) => qc.invalidateQueries({ queryKey: ['wp', vars.paperId] }),
  });
}

// Adjuntar archivo a una SECCIÓN
export function useAttachToSection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ paperId, sectionKey, file }: { paperId: string; sectionKey: string; file: File }) => {
      const fd = new FormData();
      fd.append('file', file);
      return apiClient.postForm(`/working-papers/${paperId}/sections/${sectionKey}/attachments`, fd);
    },
    onSuccess: (_res, vars) => qc.invalidateQueries({ queryKey: ['wp', vars.paperId] }),
  });
}

export function useRemoveSectionAttachment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ paperId, sectionKey, attachmentId }: { paperId: string; sectionKey: string; attachmentId: string }) =>
      apiClient.delete(`/working-papers/${paperId}/sections/${sectionKey}/attachments/${attachmentId}`),
    onSuccess: (_res, vars) => qc.invalidateQueries({ queryKey: ['wp', vars.paperId] }),
  });
}

// F4: Evidencia documental (STANDARD papers)
export function useAttachToDocumentEvidence() {
  return useMutation({
    mutationFn: ({ paperId, rowId, file }: { paperId: string; rowId: string; file: File }) => {
      const fd = new FormData();
      fd.append('file', file);
      return apiClient.postForm<{
        id: string; filename: string; url: string; mimeType: string; size: number; uploadedAt: string;
      }>(`/working-papers/${paperId}/document-evidence/${rowId}/attachments`, fd);
    },
  });
}

export function useRemoveDocumentEvidenceAttachment() {
  return useMutation({
    mutationFn: ({ paperId, rowId, attachmentId }: { paperId: string; rowId: string; attachmentId: string }) =>
      apiClient.delete(`/working-papers/${paperId}/document-evidence/${rowId}/attachments/${attachmentId}`),
  });
}

export function useAttachToAccountSchedule() {
  return useMutation({
    mutationFn: ({ paperId, rowId, file }: { paperId: string; rowId: string; file: File }) => {
      const fd = new FormData();
      fd.append('file', file);
      return apiClient.postForm<{
        id: string; filename: string; url: string; mimeType: string; size: number; uploadedAt: string;
      }>(`/working-papers/${paperId}/account-schedule/${rowId}/attachments`, fd);
    },
  });
}

export function useRemoveAccountScheduleAttachment() {
  return useMutation({
    mutationFn: ({ paperId, rowId, attachmentId }: { paperId: string; rowId: string; attachmentId: string }) =>
      apiClient.delete(`/working-papers/${paperId}/account-schedule/${rowId}/attachments/${attachmentId}`),
  });
}

// F3: Referencias cruzadas en procedimientos
export function useAddCrossRef() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ paperId, procedureId, targetPaperId }: { paperId: string; procedureId: string; targetPaperId: string }) =>
      apiClient.post(`/working-papers/${paperId}/procedures/${procedureId}/cross-refs`, { targetPaperId }),
    onSuccess: (_res, vars) => qc.invalidateQueries({ queryKey: ['wp', vars.paperId] }),
  });
}

export function useRemoveCrossRef() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ paperId, procedureId, targetPaperId }: { paperId: string; procedureId: string; targetPaperId: string }) =>
      apiClient.delete(`/working-papers/${paperId}/procedures/${procedureId}/cross-refs/${targetPaperId}`),
    onSuccess: (_res, vars) => qc.invalidateQueries({ queryKey: ['wp', vars.paperId] }),
  });
}

// ─── Gap 3: @mention references ──────────────────────────────────────────────

export interface MentionSection {
  sectionKey: string;
  label:      string;
}

export interface MentionItem {
  paperId:  string;
  code:     string;
  title:    string;
  wpKind:   string;
  sections: MentionSection[];
}

export function useMentionIndex(auditId: string) {
  return useQuery<MentionItem[]>({
    queryKey: ['mention-index', auditId],
    queryFn:  () => apiClient.get(`/working-papers/mention-index/${auditId}`),
    enabled:  !!auditId,
    staleTime: 60_000,   // stable — changes only when new papers added
  });
}

export function useCreateReference() {
  return useMutation({
    mutationFn: ({
      paperId,
      sourceSectionKey,
      targetPaperId,
      targetSectionKey,
    }: {
      paperId:          string;
      sourceSectionKey: string;
      targetPaperId:    string;
      targetSectionKey?: string;
    }) =>
      apiClient.post(`/working-papers/${paperId}/references`, {
        sourceSectionKey,
        targetPaperId,
        targetSectionKey,
      }),
  });
}
