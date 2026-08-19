'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export type AdminTaskStatus = 'TODO' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED';

export interface AdminTaskPerson {
  id:        string;
  name:      string;
  avatarUrl?: string | null;
}

export interface AdminTask {
  id:             string;
  organizationId: string;
  title:          string;
  description?:   string | null;
  status:         AdminTaskStatus;
  assignedToId?:  string | null;
  dueDate?:       string | null;
  completedAt?:   string | null;
  createdById:    string;
  createdAt:      string;
  updatedAt:      string;
  assignedTo?:    AdminTaskPerson | null;
  createdBy:      AdminTaskPerson;
}

export interface CreateAdminTaskData {
  title:          string;
  description?:   string;
  assignedToId?:  string;
  dueDate?:       string;
}

export type UpdateAdminTaskData = Partial<CreateAdminTaskData>;

const ADMIN_TASKS_KEY = 'admin-tasks';

export function useAdminTasks(filters?: { status?: AdminTaskStatus; assignedToId?: string }) {
  const params = new URLSearchParams();
  if (filters?.status)       params.set('status', filters.status);
  if (filters?.assignedToId) params.set('assignedToId', filters.assignedToId);
  const qs = params.toString();

  return useQuery<AdminTask[]>({
    queryKey: [ADMIN_TASKS_KEY, filters?.status ?? 'all', filters?.assignedToId ?? 'all'],
    queryFn:  () => apiClient.get(`/admin-tasks${qs ? '?' + qs : ''}`),
    staleTime: 15_000,
  });
}

export function useCreateAdminTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateAdminTaskData) => apiClient.post<AdminTask>('/admin-tasks', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: [ADMIN_TASKS_KEY] }),
  });
}

export function useUpdateAdminTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateAdminTaskData }) =>
      apiClient.patch<AdminTask>(`/admin-tasks/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: [ADMIN_TASKS_KEY] }),
  });
}

export function useUpdateAdminTaskStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: AdminTaskStatus }) =>
      apiClient.patch<AdminTask>(`/admin-tasks/${id}/status`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [ADMIN_TASKS_KEY] }),
  });
}

export function useDeleteAdminTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/admin-tasks/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: [ADMIN_TASKS_KEY] }),
  });
}

// ─── Config visual ──────────────────────────────────────────────────────────

/** Columnas visibles del tablero, en orden. CANCELLED se muestra aparte (archivada). */
export const BOARD_STATUSES: AdminTaskStatus[] = ['TODO', 'IN_PROGRESS', 'DONE'];

export const ADMIN_TASK_STATUS_CONFIG: Record<AdminTaskStatus, { label: string; color: string; bg: string; dot: string }> = {
  TODO:        { label: 'Pendiente',  color: 'text-gray-600',    bg: 'bg-gray-100',    dot: 'bg-gray-400' },
  IN_PROGRESS: { label: 'En Curso',   color: 'text-blue-700',    bg: 'bg-blue-100',    dot: 'bg-blue-500' },
  DONE:        { label: 'Hecha',      color: 'text-emerald-700', bg: 'bg-emerald-100', dot: 'bg-emerald-500' },
  CANCELLED:   { label: 'Cancelada',  color: 'text-red-700',     bg: 'bg-red-100',     dot: 'bg-red-500' },
};

/** Próximo estado del flujo lineal Pendiente → En Curso → Hecha, para el botón "Avanzar". */
export const NEXT_STATUS: Partial<Record<AdminTaskStatus, AdminTaskStatus>> = {
  TODO:        'IN_PROGRESS',
  IN_PROGRESS: 'DONE',
};
