'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

export type WpKindGraph    = 'STANDARD' | 'SMART' | 'MASTER' | 'LIVE' | 'FILE';
export type SyncStatusGraph = 'DRAFT' | 'SYNCED' | 'STALE' | 'REGENERATING';
export type WpStatusGraph  = 'IN_PROGRESS' | 'IN_REVIEW' | 'APPROVED' | 'ARCHIVED' | 'DRAFT';
export type MappingTypeGraph = 'DIRECT' | 'AGGREGATED' | 'AI_GENERATED';

export interface GraphNode {
  id:            string;
  code:          string;
  title:         string;
  indexSection:  string;
  wpKind:        WpKindGraph;
  syncStatus:    SyncStatusGraph;
  status:        WpStatusGraph;
  paperCode:     string | null;
  phase:         string;
  phaseType:     'PLANNING' | 'FIELDWORK' | 'REPORTING' | 'FOLLOWUP' | null;
  folderName:    string | null;
  staleCount:    number;
  totalSections: number;
  outDegree:     number;
  inDegree:      number;
}

export interface GraphEdge {
  id:          string;
  sourceId:    string;
  targetId:    string;
  sourceField: string;
  targetField: string;
  mappingType: MappingTypeGraph;
}

export interface AuditGraph {
  auditId:    string;
  auditTitle: string;
  nodes:      GraphNode[];
  edges:      GraphEdge[];
  stats: {
    totalPapers:  number;
    totalLinks:   number;
    stalePapers:  number;
    syncedPapers: number;
    masterPapers: number;
    smartPapers:  number;
  };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAuditPapersGraph(auditId: string, enabled = true) {
  return useQuery<AuditGraph>({
    queryKey: ['audit', auditId, 'papers-graph'],
    queryFn:  () => apiClient.get(`/working-papers/audit-graph/${auditId}`),
    enabled:  !!auditId && enabled,
    staleTime: 15_000,
  });
}
