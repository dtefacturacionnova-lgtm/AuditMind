'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────
export interface AppNotification {
  id:          string;
  type:        string;
  title:       string;
  body:        string;
  entityType?: string;
  entityId?:   string;
  read:        boolean;
  readAt?:     string;
  channel:     string;
  createdAt:   string;
}

export interface NotificationsResponse {
  items:       AppNotification[];
  total:       number;
  unreadCount: number;
  page:        number;
  limit:       number;
  pages:       number;
}

// ─── Icono por tipo de notificación ───────────────────────────────────────────
export const NOTIFICATION_ICONS: Record<string, string> = {
  FINDING_ESCALATED:     '🔺',
  FINDING_DUE:           '⏰',
  FINDING_APPROVED:      '✅',
  PBC_DUE:               '📤',
  PBC_SUBMITTED:         '📥',
  CONFIRMATION_RECEIVED: '📬',
  AUDIT_ASSIGNED:        '📋',
  COMMENT_ADDED:         '💬',
  PLAN_APPROVED:         '📅',
  DEFAULT:               '🔔',
};

export function getNotificationIcon(type: string): string {
  return NOTIFICATION_ICONS[type] ?? NOTIFICATION_ICONS.DEFAULT;
}

export function getEntityHref(entityType?: string, entityId?: string): string | undefined {
  if (!entityType || !entityId) return undefined;
  const map: Record<string, string> = {
    finding:      `/dashboard/findings/${entityId}`,
    audit:        `/dashboard/audits/${entityId}`,
    workingPaper: `/dashboard/working-papers/${entityId}`,
    pbcRequest:   `/dashboard/pbc/${entityId}`,
    confirmation: `/dashboard/confirmations/${entityId}`,
    plan:         `/dashboard/plans/${entityId}`,
  };
  return map[entityType];
}

// ─── Queries ──────────────────────────────────────────────────────────────────
export function useNotifications(params?: { page?: number; limit?: number; unreadOnly?: boolean }) {
  const qs = new URLSearchParams();
  if (params?.page)      qs.set('page', String(params.page));
  if (params?.limit)     qs.set('limit', String(params.limit));
  if (params?.unreadOnly) qs.set('unreadOnly', 'true');

  return useQuery<NotificationsResponse>({
    queryKey:  ['notifications', params],
    queryFn:   () => apiClient.get(`/notifications?${qs.toString()}`),
    staleTime: 15_000,
    refetchInterval: 30_000, // refresca cada 30 s para mantener el badge actualizado
  });
}

export function useUnreadCount() {
  return useQuery<{ count: number }>({
    queryKey:  ['notifications', 'unread-count'],
    queryFn:   () => apiClient.get('/notifications/unread-count'),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}

// ─── Mutations ────────────────────────────────────────────────────────────────
export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.patch(`/notifications/${id}/read`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

export function useMarkAllRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.patch('/notifications/read-all', {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}
