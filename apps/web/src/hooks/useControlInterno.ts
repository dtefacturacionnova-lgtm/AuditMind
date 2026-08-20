'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

// ─── Tipos — reflejan risk-trace.service.ts (Fase 6a/6b) ─────────────────────

export type ControlInternoStageKey =
  | 'IDENTIFICACION' | 'RMM' | 'CONTROL' | 'PRUEBA' | 'RESIDUAL' | 'DEFICIENCIA' | 'CONCLUSION';

export interface ControlInternoStage {
  key:        ControlInternoStageKey;
  label:      string;
  paperCode:  string | null;
  wpCode:     string | null;
  paperId:    string | null;
  available:  boolean;
  count:      number;
  countLabel: string;
}

export interface ControlInternoRiskRow {
  paperId:    string;
  sectionKey: string;
  rowIndex:   number;
  label:      string;
  area:       string | null;
  badge:      string | null;
}

export type ControlInternoProfile = 'EXTERNA' | 'INTERNA' | 'GENERICO';

export interface ControlInternoSummary {
  profile:     ControlInternoProfile;
  stages:      ControlInternoStage[];
  risks:       ControlInternoRiskRow[];
  areaCatalog: string[];
}

export type RiskTraceMatchBasis = 'AREA' | 'DESCRIPCION' | 'PAPEL_COMPLETO' | 'NODO';

export interface RiskTraceSectionHit {
  sectionKey:   string;
  sectionLabel: string;
  matchBasis:   RiskTraceMatchBasis;
  rows:         Record<string, unknown>[];
}

export interface RiskTraceBlock {
  kind:       ControlInternoStageKey;
  title:      string;
  paperId:    string | null;
  paperCode:  string | null;
  wpCode:     string | null;
  paperTitle: string | null;
  available:  boolean;
  sections:   RiskTraceSectionHit[];
}

export interface RiskTraceFlowNode {
  paperId:    string;
  sectionKey: string;
  nodeId:     string;
  kind:       string;
  label:      string;
  linkedPaperCode: string | null;
}

export interface RiskTraceResponse {
  anchor: {
    paperId:    string | null;
    paperCode:  string | null;
    sectionKey: string | null;
    rowIndex:   number | null;
    riskLabel:  string;
    area:       string | null;
  };
  areaCatalog: string[];
  blocks:      RiskTraceBlock[];
  flowNodes:   RiskTraceFlowNode[];
}

/** El ancla de una Ficha de Riesgo: una fila concreta, o un área completa. */
export type RiskTraceAnchor =
  | { paperId: string; sectionKey: string; rowIndex: number }
  | { area: string };

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useControlInternoSummary(auditId: string) {
  return useQuery<ControlInternoSummary>({
    queryKey: ['audit', auditId, 'control-interno-summary'],
    queryFn:  () => apiClient.get(`/working-papers/control-interno-summary/${auditId}`),
    enabled:  !!auditId,
    staleTime: 15_000,
  });
}

export function useRiskTrace(auditId: string, anchor: RiskTraceAnchor | null) {
  const params = new URLSearchParams();
  if (anchor && 'area' in anchor) {
    params.set('area', anchor.area);
  } else if (anchor) {
    params.set('paperId', anchor.paperId);
    params.set('sectionKey', anchor.sectionKey);
    params.set('rowIndex', String(anchor.rowIndex));
  }
  return useQuery<RiskTraceResponse>({
    queryKey: ['audit', auditId, 'risk-trace', anchor],
    queryFn:  () => apiClient.get(`/working-papers/risk-trace/${auditId}?${params.toString()}`),
    enabled:  !!auditId && !!anchor,
    staleTime: 15_000,
  });
}
