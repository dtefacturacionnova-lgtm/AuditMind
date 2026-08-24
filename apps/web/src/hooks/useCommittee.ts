'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export type PeriodType = 'MONTHLY' | 'QUARTERLY' | 'SEMIANNUAL' | 'ANNUAL';

export interface CommitteePeriodOption {
  key: string;
  label: string;
  isCurrent: boolean;
  frozen: boolean;
  publishedAt: string | null;
}

export interface FindingsBySeverity {
  total: number;
  bySeverity: Record<string, number>;
  highest: string | null;
}

export type EngagementState =
  | 'DONE_ON_TIME' | 'DONE_LATE'
  | 'IN_PROGRESS_ON_TRACK' | 'IN_PROGRESS_AT_RISK' | 'IN_PROGRESS_OVERDUE'
  | 'NOT_STARTED_ON_TRACK' | 'NOT_STARTED_OVERDUE';

export interface AuditFinancialSummary {
  hoursTotal: number;
  cost: number;
  uncostedHours: number;
  revenue: number | null;
  feeCurrency: string | null;
  margin: number | null;
  marginPct: number | null;
}

export interface PlanExecutionItem {
  planItemId: string;
  name: string;
  tentativeStartDate: string | null;
  tentativeEndDate: string | null;
  auditId: string | null;
  state: EngagementState;
  pct: number;
  currentPhaseLabel: string | null;
  hoursReal: number;
  hoursPlanned: number;
  auditStatus: string | null;
  financials: AuditFinancialSummary | null;
  dateNote: string;
  findings: FindingsBySeverity;
}

export interface CosoComponentAvg {
  sectionKey: string;
  label: string;
  weight: number;
  avgConfidencePct: number | null;
  auditsWithData: number;
}

export interface CosoPrincipleAvg {
  short: string;
  label: string;
  componentShort: string;
  avgConfidencePct: number;
  auditsWithData: number;
}

export interface CosoAuditRow {
  auditId: string;
  auditTitle: string;
  totalScore: number | null;
  band: string | null;
  conclusionGlobal: string | null;
  conclusionEnfoque: string | null;
}

export interface ControlInternoGlobal {
  auditsEvaluated: number;
  auditsTotal: number;
  avgScore: number | null;
  globalBand: string | null;
  distribution: Record<string, number>;
  perComponent: CosoComponentAvg[];
  perPrinciple: CosoPrincipleAvg[];
  byAudit: CosoAuditRow[];
}

export interface CommitteeTrendPoint {
  period: string;
  label: string;
  completionPct: number;
  isCurrent: boolean;
  hasData: boolean;
}

export interface OverdueAction {
  id: string;
  description: string;
  dueDate: string;
  progressPct: number;
  finding: { id: string; title: string; severity: string; status: string };
}

export interface EscalatedFinding {
  id: string;
  title: string;
  severity: string;
  escalationLevel: string;
  dueDate: string | null;
  audit: { id: string; title: string };
  responsible: { name: string } | null;
}

export interface RecurringFinding {
  id: string;
  title: string;
  audit: { title: string };
}

export interface CommitteeDashboard {
  riskPosture: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
  period: { key: string; type: PeriodType; label: string };
  plan: { id: string; name: string; year: number; status: string } | null;
  summary: {
    completionPct: number;
    doneOnTime: number; delayed: number; atRisk: number; onTrack: number; notStarted: number;
    totalItemsInPeriod: number;
    hoursReal: number; hoursPlanned: number;
    universeCoveragePct: number; universeDone: number; universeTotal: number;
  };
  kpis: {
    openFindings: number; criticalOpen: number; materialOpen: number;
    overdueActionsCount: number; resolutionRateYtd: number;
  };
  openBySeverity: Record<string, number>;
  controlInternoGlobal: ControlInternoGlobal;
  planExecution: PlanExecutionItem[];
  trend: CommitteeTrendPoint[];
  overdueActions: OverdueAction[];
  escalatedFindings: EscalatedFinding[];
  recurringFindings: RecurringFinding[];
  meta: {
    frozen: boolean; isCurrent: boolean; periodKey: string; periodType: PeriodType;
    publishedAt: string | null; preparedByName: string | null;
  };
}

export function useCommitteePeriods(periodType: PeriodType) {
  return useQuery({
    queryKey: ['committee', 'periods', periodType],
    queryFn: () => apiClient.get<CommitteePeriodOption[]>(
      `/committee/periods?periodType=${periodType}`,
    ),
  });
}

export function useCommitteeDashboard(periodType: PeriodType, periodKey?: string) {
  return useQuery({
    queryKey: ['committee', 'dashboard', periodType, periodKey],
    queryFn: () => apiClient.get<CommitteeDashboard>(
      `/committee/dashboard?periodType=${periodType}${periodKey ? `&period=${periodKey}` : ''}`,
    ),
  });
}

export function usePublishCommitteeSnapshot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { periodType: PeriodType; period: string }) =>
      apiClient.post<{ id: string; period: string; publishedAt: string }>('/committee/snapshot', vars),
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: ['committee', 'dashboard', vars.periodType, vars.period] });
      qc.invalidateQueries({ queryKey: ['committee', 'periods', vars.periodType] });
    },
  });
}
