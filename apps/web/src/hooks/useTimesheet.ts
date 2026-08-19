'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────
// Debe reflejar el enum `TimeEntryCategory` de apps/api/prisma/schema.prisma.
export type TimesheetCategory =
  | 'CLIENT_BILLABLE'
  | 'CLIENT_NON_BILLABLE'
  | 'ADMIN'
  | 'TRAINING'
  | 'BUSINESS_DEVELOPMENT'
  | 'SICK_LEAVE'
  | 'PERSONAL_LEAVE'
  | 'VACATION'
  | 'OTHER_NON_BILLABLE';

export type TimesheetReportGroupBy = 'user' | 'audit' | 'plan' | 'date';

export interface TimesheetEntry {
  id:             string;
  organizationId: string;
  auditId?:       string | null;
  planItemId?:    string | null;
  userId:         string;
  workDate:       string;
  hours:          number;
  description?:   string | null;
  category:       TimesheetCategory;
  createdAt:      string;
  updatedAt:      string;
}

export interface CreateTimesheetEntryData {
  workDate:     string;
  hours:        number;
  description?: string;
  category:     TimesheetCategory;
  auditId?:     string;
  planItemId?:  string;
}

export interface MyAssignment {
  id:         string;
  auditId:    string;
  userId:     string;
  role:       string;
  assignedAt: string;
  audit: {
    id:    string;
    title: string;
  };
}

export interface TimesheetReportQuery {
  groupBy:   TimesheetReportGroupBy;
  dateFrom?: string;
  dateTo?:   string;
  userId?:   string;
  auditId?:  string;
  planId?:   string;
  category?: TimesheetCategory;
}

export interface TimesheetReportRow {
  // groupBy=user
  userId?:        string;
  userName?:      string;
  // groupBy=audit
  auditId?:       string;
  auditTitle?:    string;
  // groupBy=plan
  planItemId?:    string;
  planItemLabel?: string;
  // groupBy=date
  date?:          string;
  // común
  category:       TimesheetCategory;
  hours:          number;
}

export interface TimesheetReportTotals {
  billableHours:    number;
  nonBillableHours: number;
  totalHours:       number;
}

export interface TimesheetReport {
  groupBy:   TimesheetReportGroupBy;
  breakdown: TimesheetReportRow[];
  totals:    TimesheetReportTotals;
}

export interface QueryTimesheetEntriesParams {
  dateFrom?: string;
  dateTo?:   string;
  category?: TimesheetCategory;
  auditId?:  string;
}

// ─── Config ───────────────────────────────────────────────────────────────────
// Categorías no facturables (fijas), con etiqueta legible para las filas del
// timesheet semanal. CLIENT_BILLABLE / CLIENT_NON_BILLABLE se muestran por
// encargo (fila dinámica), no aquí.
export const NON_BILLABLE_CATEGORIES: { category: TimesheetCategory; label: string }[] = [
  { category: 'ADMIN',                 label: 'Administrativo' },
  { category: 'TRAINING',              label: 'Capacitación' },
  { category: 'BUSINESS_DEVELOPMENT',  label: 'Desarrollo de Negocio' },
  { category: 'SICK_LEAVE',            label: 'Incapacidad' },
  { category: 'PERSONAL_LEAVE',        label: 'Permiso Personal' },
  { category: 'VACATION',              label: 'Vacaciones' },
  { category: 'OTHER_NON_BILLABLE',    label: 'Otro' },
];

export const CATEGORY_LABELS: Record<TimesheetCategory, string> = {
  CLIENT_BILLABLE:      'Facturable a Cliente',
  CLIENT_NON_BILLABLE:  'No Facturable a Cliente',
  ADMIN:                'Administrativo',
  TRAINING:             'Capacitación',
  BUSINESS_DEVELOPMENT: 'Desarrollo de Negocio',
  SICK_LEAVE:           'Incapacidad',
  PERSONAL_LEAVE:       'Permiso Personal',
  VACATION:             'Vacaciones',
  OTHER_NON_BILLABLE:   'Otro',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function buildQuery(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) search.set(key, value);
  });
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

// ─── Queries ──────────────────────────────────────────────────────────────────
export function useTimesheetEntries(params: QueryTimesheetEntriesParams = {}) {
  const qs = buildQuery({
    dateFrom: params.dateFrom,
    dateTo:   params.dateTo,
    category: params.category,
    auditId:  params.auditId,
  });
  return useQuery<TimesheetEntry[]>({
    queryKey:  ['timesheet-entries', params],
    queryFn:   () => apiClient.get(`/timesheet/entries${qs}`),
    staleTime: 15_000,
  });
}

export function useMyAssignments() {
  return useQuery<MyAssignment[]>({
    queryKey:  ['timesheet-my-assignments'],
    queryFn:   () => apiClient.get('/timesheet/my-assignments'),
    staleTime: 60_000,
  });
}

export function useTimesheetReport(query: TimesheetReportQuery) {
  const qs = buildQuery({
    groupBy:  query.groupBy,
    dateFrom: query.dateFrom,
    dateTo:   query.dateTo,
    userId:   query.userId,
    auditId:  query.auditId,
    planId:   query.planId,
    category: query.category,
  });
  return useQuery<TimesheetReport>({
    queryKey:  ['timesheet-report', query],
    queryFn:   () => apiClient.get(`/timesheet/report${qs}`),
    staleTime: 15_000,
    // groupBy=plan requiere planId en el backend — no dispares la consulta hasta tenerlo.
    enabled:   query.groupBy !== 'plan' || !!query.planId,
  });
}

// ─── Mutations ────────────────────────────────────────────────────────────────
export function useCreateTimesheetEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateTimesheetEntryData) => apiClient.post<TimesheetEntry>('/timesheet/entries', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['timesheet-entries'] });
      qc.invalidateQueries({ queryKey: ['timesheet-report'] });
    },
  });
}

export function useCreateTimesheetEntriesBulk() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (entries: CreateTimesheetEntryData[]) =>
      apiClient.post<{ created: number }>('/timesheet/entries/bulk', { entries }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['timesheet-entries'] });
      qc.invalidateQueries({ queryKey: ['timesheet-report'] });
    },
  });
}

export function useDeleteTimesheetEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/timesheet/entries/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['timesheet-entries'] });
      qc.invalidateQueries({ queryKey: ['timesheet-report'] });
    },
  });
}
