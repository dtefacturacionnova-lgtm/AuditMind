'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { VisitAccount, VisitAccountInput, VisitKind, VisitStatus } from '@/lib/visits/visit-base';

// Visitas del encargo (planificación, interina, final): API en apps/api/src/audits/visits.

export interface VisitBalanceSummary {
  id: string;
  filename: string;
  periodLabel: string | null;
  importedAt: string;
  asOfDate: string | null;
  /** Prisma devuelve los decimales como texto. */
  totalDebit: number | string;
  totalCredit: number | string;
  isBalanced: boolean;
  accountCount: number;
}

export interface AuditVisit {
  id: string;
  kind: VisitKind;
  cutoffDate: string;
  status: VisitStatus;
  isAnalysisBase: boolean;
  notes: string | null;
  closedAt: string | null;
  closedById: string | null;
  balance: VisitBalanceSummary | null;
  /** Cuántas cargas tiene la visita (la más reciente es la vigente). */
  balanceVersions: number;
}

export interface AuditVisitsInfo {
  auditId: string;
  enabled: boolean;
  /** El tipo de encargo admite visitas. */
  supported: boolean;
  visits: AuditVisit[];
  analysisBase: VisitKind | null;
  suggestedAnalysisBase: VisitKind | null;
}

export interface VisitBalanceAccounts {
  visitId: string;
  kind: VisitKind;
  cutoffDate: string;
  balance: Omit<VisitBalanceSummary, 'accountCount'> & { versions: number };
  accounts: VisitAccount[];
}

export type CompareStatus = 'NUEVA' | 'DESAPARECIDA' | 'EN_CERO' | 'CAMBIO' | 'SIN_CAMBIO';

export interface CompareRow {
  code: string;
  name: string;
  status: CompareStatus;
  fromBalance: number | null;
  toBalance: number | null;
  delta: number;
  /** Porcentaje sobre el saldo de origen (12.5 = 12,5 %); `null` si no había saldo de origen. */
  deltaPct: number | null;
}

export interface VisitsCompare {
  auditId: string;
  from: { kind: VisitKind; cutoffDate: string; periodLabel: string | null; importedAt: string; isBalanced: boolean };
  to: { kind: VisitKind; cutoffDate: string; periodLabel: string | null; importedAt: string; isBalanced: boolean };
  summary: Record<CompareStatus, number>;
  rows: CompareRow[];
  warnings: string[];
}

export interface ImportedVisitBalance {
  id: string;
  visitId: string;
  accountCount: number;
  isBalanced: boolean;
  periodLabel: string | null;
  supersedes: string | null;
  warnings: string[];
}

const key = (auditId: string) => ['audit-visits', auditId] as const;

export function useAuditVisits(auditId: string, enabled = true) {
  return useQuery<AuditVisitsInfo>({
    queryKey: key(auditId),
    queryFn: () => apiClient.get(`/audits/${auditId}/visits`),
    enabled: enabled && !!auditId,
    staleTime: 15_000,
  });
}

/** Cuentas del balance vigente de una visita (para copiarlas a S1 o saber si S1 ya está sobre esa base). */
export function useVisitBalance(visitId: string | null | undefined) {
  return useQuery<VisitBalanceAccounts>({
    queryKey: ['visit-balance', visitId],
    queryFn: () => apiClient.get(`/audits/visits/${visitId}/trial-balance`),
    enabled: !!visitId,
    staleTime: 15_000,
  });
}

export function useVisitsCompare(auditId: string, from: VisitKind | '', to: VisitKind | '') {
  const ready = !!from && !!to && from !== to;
  return useQuery<VisitsCompare>({
    queryKey: ['visit-compare', auditId, from, to],
    queryFn: () => apiClient.get(`/audits/${auditId}/visits/compare?from=${from}&to=${to}`),
    enabled: !!auditId && ready,
    staleTime: 15_000,
    retry: false,
  });
}

/** Cualquier cambio en las visitas o sus balances deja viejo lo leído: se vuelve a pedir todo lo de este encargo. */
function useRefreshVisits(auditId: string) {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: key(auditId) });
    qc.invalidateQueries({ queryKey: ['visit-balance'] });
    qc.invalidateQueries({ queryKey: ['visit-compare', auditId] });
  };
}

export function useEnableVisits(auditId: string) {
  const refresh = useRefreshVisits(auditId);
  return useMutation({
    mutationFn: (dates: { planning: string; interim: string; final: string }) => apiClient.post<AuditVisitsInfo>(`/audits/${auditId}/visits`, dates),
    onSuccess: refresh,
  });
}

export function useUpdateVisit(auditId: string) {
  const refresh = useRefreshVisits(auditId);
  return useMutation({
    mutationFn: ({ visitId, ...body }: { visitId: string; cutoffDate?: string; status?: VisitStatus; notes?: string; isAnalysisBase?: boolean }) =>
      apiClient.patch<AuditVisitsInfo>(`/audits/visits/${visitId}`, body),
    onSuccess: refresh,
  });
}

export function useImportVisitBalance(auditId: string) {
  const refresh = useRefreshVisits(auditId);
  return useMutation({
    mutationFn: ({ visitId, ...body }: { visitId: string; filename: string; periodLabel?: string; accounts: VisitAccountInput[] }) =>
      apiClient.post<ImportedVisitBalance>(`/audits/visits/${visitId}/trial-balance`, body),
    onSuccess: refresh,
  });
}
