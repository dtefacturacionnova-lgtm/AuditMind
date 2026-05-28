'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export interface ReportAuditSummary {
  id:       string;
  title:    string;
  status:   string;
  type:     string;
  startDate: string;
  endDate:  string;
  auditEntity: { name: string; category: string };
  _count:   { findings: number; workingPapers: number };
}

export interface ReportFinding {
  id: string;
  title: string;
  severity: string;
  status: string;
  condition: string;
  criteria: string;
  cause: string;
  effect: string;
  risk?: string;
  recommendation?: string;
  managementResponse?: string;
  normativeReference?: string;
  normativeArticle?: string;
  effectAmount?: number;
  isMaterial?: boolean;
  qualityScore?: number;
  dueDate?: string;
  closedAt?: string;
  escalationLevel?: string;
  responsible?: { name: string };
  actions?: Array<{
    id: string;
    description: string;
    status: string;
    progressPct: number;
    dueDate: string;
    completionDate?: string;
    comments?: string;
  }>;
}

export interface ReportWorkingPaper {
  id: string;
  title: string;
  type: string;
  status: string;
  code: string;
  indexSection?: string;
  conclusion?: string;
  createdAt: string;
}

export interface AuditReport {
  generatedAt: string;
  overallOpinion: string;
  audit: {
    id: string;
    title: string;
    type: string;
    status: string;
    auditOpinion?: string;
    methodology?: string;
    materiality?: number;
    materialityExecution?: number;
    startDate?: string;
    endDate?: string;
    auditPeriodStart?: string;
    auditPeriodEnd?: string;
    reportIssuanceDate?: string;
    objectives?: string;
    scope?: string;
    overallConclusion?: string;
    organization: { name: string; logoUrl?: string };
    auditEntity: { name: string; category: string; responsible?: string };
    lead?: { id: string; name: string; role: string; email: string };
    team: Array<{ id: string; name: string; role: string; email: string; teamRole: string }>;
    estimatedHours: number;
    actualHours: number;
    hoursVariancePct: number;
  };
  summary: {
    findings:      { total: number; closed: number; open: number; critical: number; material: number; bySeverity: Record<string, number>; byStatus: Record<string, number> };
    workingPapers: { total: number; approved: number; byStatus: Record<string, number>; bySection?: Record<string, number> };
    pbc:           { total: number; accepted: number; pending: number };
    confirmations: { total: number; reconciled: number; pending: number };
  };
  findings:      ReportFinding[];
  workingPapers: ReportWorkingPaper[];
  pbcRequests:   any[];
  confirmations: any[];
}

export function useReportsList() {
  return useQuery<{ items: ReportAuditSummary[]; total: number }>({
    queryKey:  ['reports', 'list'],
    queryFn:   () => apiClient.get('/reports'),
    staleTime: 60_000,
  });
}

export function useAuditReport(id: string) {
  return useQuery<AuditReport>({
    queryKey:  ['reports', 'audit', id],
    queryFn:   () => apiClient.get(`/reports/audit/${id}`),
    enabled:   !!id,
    staleTime: 300_000, // 5 min — los reportes no cambian tan seguido
  });
}
