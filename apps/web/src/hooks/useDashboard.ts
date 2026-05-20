'use client';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export interface DashboardKpis {
  auditsInProgress: number;
  auditsCompleted: number;
  openFindings: number;
  criticalFindings: number;
  overduePbcRequests: number;
  planComplianceRate: number;
  aiInteractionsThisMonth: number;
}

export interface TimelineAudit {
  id: string;
  code: string;
  title: string;
  type: string;
  status: string;
  startDate: string;
  endDate: string;
  riskLevel: string;
  plannedHours: number;
  actualHours: number;
  leadAuditor: { id: string; name: string; avatarUrl?: string };
  auditableUnit: { name: string };
}

export function useDashboardKpis() {
  return useQuery({
    queryKey: ['dashboard', 'kpis'],
    queryFn: () => apiClient.get<DashboardKpis>('/dashboard/kpis'),
  });
}

export function useDashboardTimeline() {
  return useQuery({
    queryKey: ['dashboard', 'timeline'],
    queryFn: () => apiClient.get<TimelineAudit[]>('/dashboard/timeline'),
  });
}

export function useRecentFindings() {
  return useQuery({
    queryKey: ['dashboard', 'recent-findings'],
    queryFn: () => apiClient.get<any[]>('/dashboard/recent-findings'),
  });
}

export function useUpcomingDeadlines() {
  return useQuery({
    queryKey: ['dashboard', 'upcoming-deadlines'],
    queryFn: () => apiClient.get<any>('/dashboard/upcoming-deadlines'),
  });
}

export function useManagerDashboard() {
  return useQuery<any>({
    queryKey:  ['dashboard', 'manager'],
    queryFn:   () => apiClient.get('/dashboard/manager'),
    staleTime: 60_000,
  });
}

export function useMyWorkload() {
  return useQuery<any>({
    queryKey:  ['dashboard', 'my-work'],
    queryFn:   () => apiClient.get('/dashboard/my-work'),
    staleTime: 30_000,
  });
}
