'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { CreateTimesheetEntryData, NonBillableReason, TimesheetCategory, UpdateTimesheetEntryData } from './useTimesheet';

// Cierre de horas por persona y mes (docs/horas-cierre-y-honorarios-propuesta.md). Los tipos reflejan hours-close.service.ts.

export interface HoursCloseSettings {
  enabled:          boolean;
  entryDeadlineDay: number;
  closeDeadlineDay: number;
}

export interface MyPeriods extends HoursCloseSettings {
  closed:             { year: number; month: number; closedAt: string | null; closedById: string | null }[];
  pendingAdjustments: number;
}

export type WarningCode =
  | 'MISSING_DAYS' | 'HOURS_LOW' | 'HOURS_HIGH' | 'LONG_DAYS' | 'NO_DESCRIPTION' | 'NO_COST_PROFILE' | 'NO_AVAILABILITY_PROFILE';

export interface PeriodWarning { code: WarningCode; detail: string }

export interface PeriodPersonRow {
  userId: string; name: string; email: string; role: string;
  businessDays: number; daysWithHours: number; missingDays: string[];
  totalHours: number; billableHours: number; clientNonBillableHours: number; adminHours: number; leaveHours: number;
  availableHours: number | null; billableUtilizationPct: number | null;
  warnings: PeriodWarning[];
  status: 'OPEN' | 'CLOSED'; closedAt: string | null; closedByName: string | null; reopenedAt: string | null;
  pendingAdjustments: number; canClose: boolean; canReopen: boolean;
}

export interface PeriodOverview {
  year: number; month: number; enabled: boolean; finished: boolean;
  entryDeadline: string; closeDeadline: string; today: string;
  summary: { people: number; closed: number; withWarnings: number; pendingAdjustments: number };
  rows: PeriodPersonRow[];
}

export interface PersonEntry {
  id: string; workDate: string; hours: number; category: TimesheetCategory; description: string | null;
  auditId: string | null; planItemId: string | null; auditTitle: string | null;
  nonBillableReason: NonBillableReason | null; afterClose: boolean;
}

export interface PersonEntries { user: { id: string; name: string }; year: number; month: number; entries: PersonEntry[] }

export type AdjustmentAction = 'ADD' | 'EDIT' | 'DELETE';
export type AdjustmentStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface Adjustment {
  id: string; userId: string; year: number; month: number; action: AdjustmentAction;
  timeEntryId: string | null; payload: Record<string, unknown> | null; reason: string;
  status: AdjustmentStatus; decidedById: string | null; decidedAt: string | null; decisionNote: string | null; createdAt: string;
  user: { id: string; name: string; role: string };
  entry: { id: string; workDate: string; hours: number; category: TimesheetCategory; description: string | null } | null;
}

export interface CreateAdjustmentData {
  action:       AdjustmentAction;
  timeEntryId?: string;
  entry?:       CreateTimesheetEntryData;
  changes?:     UpdateTimesheetEntryData;
  reason:       string;
}

const qs = (params: Record<string, string | number | undefined>) => {
  const s = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== '') s.set(k, String(v)); });
  const out = s.toString();
  return out ? `?${out}` : '';
};

// ─── Consultas ────────────────────────────────────────────────────────────────
export function useHoursCloseSettings() {
  return useQuery<HoursCloseSettings>({
    queryKey: ['hours-close', 'settings'],
    queryFn:  () => apiClient.get('/timesheet/periods/settings'),
    staleTime: 60_000,
  });
}

/** Estado de MIS meses en el rango que se está viendo (la captura de horas). */
export function useMyPeriods(dateFrom: string, dateTo: string) {
  return useQuery<MyPeriods>({
    queryKey: ['hours-close', 'mine', dateFrom, dateTo],
    queryFn:  () => apiClient.get(`/timesheet/periods/mine${qs({ dateFrom, dateTo })}`),
    enabled:  !!dateFrom && !!dateTo,
    staleTime: 15_000,
  });
}

export function usePeriodOverview(year: number, month: number, opts?: { enabled?: boolean }) {
  return useQuery<PeriodOverview>({
    queryKey: ['hours-close', 'overview', year, month],
    queryFn:  () => apiClient.get(`/timesheet/periods/overview${qs({ year, month })}`),
    enabled:  opts?.enabled ?? true,
    staleTime: 10_000,
  });
}

export function usePersonEntries(userId: string | null, year: number, month: number) {
  return useQuery<PersonEntries>({
    queryKey: ['hours-close', 'person', userId, year, month],
    queryFn:  () => apiClient.get(`/timesheet/periods/entries${qs({ userId: userId ?? undefined, year, month })}`),
    enabled:  !!userId,
    staleTime: 10_000,
  });
}

export function useAdjustments(status?: AdjustmentStatus, mine?: boolean) {
  return useQuery<Adjustment[]>({
    queryKey: ['hours-close', 'adjustments', status ?? 'all', !!mine],
    queryFn:  () => apiClient.get(`/timesheet/adjustments${qs({ status, mine: mine ? 'true' : undefined })}`),
    staleTime: 10_000,
  });
}

// ─── Acciones ─────────────────────────────────────────────────────────────────
function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['hours-close'] });
    qc.invalidateQueries({ queryKey: ['timesheet-entries'] });
    qc.invalidateQueries({ queryKey: ['timesheet-report'] });
  };
}

export function useUpdateHoursCloseSettings() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (data: HoursCloseSettings) => apiClient.put<HoursCloseSettings>('/timesheet/periods/settings', data),
    onSuccess: invalidate,
  });
}

export function useClosePeriod() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (data: { userId: string; year: number; month: number; note?: string }) =>
      apiClient.post<{ closed: boolean; entryCount: number; totalHours: number; entriesWithoutCostRate: number }>('/timesheet/periods/close', data),
    onSuccess: invalidate,
  });
}

export function useReopenPeriod() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (data: { userId: string; year: number; month: number; reason: string }) =>
      apiClient.post<{ reopened: boolean }>('/timesheet/periods/reopen', data),
    onSuccess: invalidate,
  });
}

export function useRemindPeriod() {
  return useMutation({
    mutationFn: (data: { year: number; month: number; userIds?: string[] }) =>
      apiClient.post<{ candidates: number; sent: number; failed: number }>('/timesheet/periods/remind', data),
  });
}

export function useCreateAdjustment() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (data: CreateAdjustmentData) => apiClient.post<Adjustment>('/timesheet/adjustments', data),
    onSuccess: invalidate,
  });
}

export function useDecideAdjustment() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; approve: boolean; note?: string }) =>
      apiClient.post<Adjustment>(`/timesheet/adjustments/${id}/decide`, data),
    onSuccess: invalidate,
  });
}
