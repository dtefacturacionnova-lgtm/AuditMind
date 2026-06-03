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
  | 'ATTACHMENT';

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
}

export interface WpRef {
  id: string;
  code: string;
  title: string;
  wpKind: string;
  syncStatus: string;
}

export interface PaperGraphData {
  sources: WpRef[];
  targets: WpRef[];
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

export function usePaperGraph(paperId: string) {
  return useQuery<PaperGraphData>({
    queryKey: ['wp', paperId, 'graph'],
    queryFn: () => apiClient.get(`/working-papers/${paperId}/graph`),
    enabled: !!paperId,
    staleTime: 30_000,
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
    mutationFn: (auditId: string) =>
      apiClient.post<CrossAuditSuggestionsResult>(
        `/working-papers/by-audit/${auditId}/ai-suggestions`,
        {},
      ),
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
