'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export type GraphEntityType = 'PERSONA' | 'CUENTA' | 'TRANSACCION' | 'DOCUMENTO' | 'AFIRMACION' | 'FECHA_EVENTO';
export type GraphRelationType = 'AUTORIZO' | 'CONTRADICE' | 'MENCIONA' | 'INVOLUCRA';

export interface EntityMention {
  id: string;
  citaTextual: string;
  validadaCita: boolean;
  evidenceId: string;
  evidenceKind: string;
  evidenceSectionKey: string;
  evidencePaperId: string | null; // null solo para notas de contexto del investigador (Fase 2b) — nunca aparecen aquí en la práctica, ver investigation-graph.service.ts
  capturedAt: string;
  confirmadoPorAuditor: boolean;
}

export interface EvidenceGraphNode {
  id: string;
  tipo: GraphEntityType;
  nombre: string;
  mentionCount: number;
  mentions: EntityMention[];
}

export interface EvidenceGraphEdge {
  id: string;
  sourceId: string;
  targetId: string;
  tipo: GraphRelationType;
  citaTextual: string;
  validadaCita: boolean;
  confianza: number;
  evidenceId: string;
  confirmadoPorAuditor: boolean;
}

export interface EvidenceGraph {
  auditId: string;
  auditTitle: string;
  nodes: EvidenceGraphNode[];
  edges: EvidenceGraphEdge[];
  stats: {
    totalEntities: number;
    totalRelations: number;
    unvalidatedMentions: number;
    unvalidatedRelations: number;
    byType: Record<string, number>;
  };
}

export function useAuditEvidenceGraph(auditId: string, enabled = true) {
  return useQuery<EvidenceGraph>({
    queryKey: ['audit', auditId, 'evidence-graph'],
    queryFn: () => apiClient.get(`/investigation-graph/audit-graph/${auditId}`),
    enabled: !!auditId && enabled,
    staleTime: 15_000,
  });
}

/** Fase 2a — fusiona dos entidades duplicadas del mismo tipo. `loserEntityId`
 * desaparece, sus menciones/relaciones quedan reasignadas a `survivorEntityId`. */
export function useMergeEntities(auditId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { loserEntityId: string; survivorEntityId: string }) =>
      apiClient.post(`/investigation-graph/audit-graph/${auditId}/merge`, vars),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['audit', auditId, 'evidence-graph'] }),
  });
}
