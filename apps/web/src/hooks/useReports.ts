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

export interface AuditReport {
  generatedAt: string;
  audit: {
    id: string; code: string; title: string; type: string; status: string;
    riskLevel: string; materiality: number; startDate: string; endDate: string;
    closedAt?: string; objectives: string; scope?: string; methodology?: string;
    overallConclusion?: string;
    organization: { name: string; logoUrl?: string };
    auditEntity: { name: string; category: string; responsible?: string };
    lead?: { id: string; name: string; role: string; email: string };
    team: Array<{ id: string; name: string; role: string; email: string; teamRole: string }>;
    estimatedHours: number; actualHours: number; hoursVariancePct: number;
  };
  summary: {
    findings:      { total: number; closed: number; open: number; critical: number; material: number; bySeverity: Record<string, number>; byStatus: Record<string, number> };
    workingPapers: { total: number; approved: number; byStatus: Record<string, number>; byType: Record<string, number> };
    pbc:           { total: number; accepted: number; pending: number };
    confirmations: { total: number; reconciled: number; pending: number };
  };
  findings:      any[];
  workingPapers: any[];
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
