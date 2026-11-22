'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type {
  AdminConsumption, AdminPackRow, AdminPaymentRow, BillingEventRow, BillingSettingsRow, OrganizationLite, PlanRow, SubscriptionOverrides, SubscriptionRow,
} from '@/lib/billing/admin-types';
import { isPeriodKey } from '@/lib/billing/consumption';
import type { CreatePackBody, UpdatePackBody } from '@/lib/billing/pack-catalog';

/**
 * Planes y suscripciones — administración de la plataforma (solo SUPER_ADMIN). Rutas de apps/api/src/billing/billing-admin.controller.ts.
 * Todo cambio refresca las listas y también «Mi plan» (`['billing','me']`), porque cambiar un plan puede cambiar lo que ve el propio superadmin.
 */

const ROOT = ['billing-admin'] as const;
const keys = {
  plans: [...ROOT, 'plans'] as const,
  plan: (id: string) => [...ROOT, 'plan', id] as const,
  subscriptions: [...ROOT, 'subscriptions'] as const,
  events: (organizationId?: string) => [...ROOT, 'events', organizationId ?? 'all'] as const,
  settings: [...ROOT, 'settings'] as const,
  payments: [...ROOT, 'payments'] as const,
  packs: [...ROOT, 'packs'] as const,
  consumption: (period: string) => [...ROOT, 'consumption', period] as const,
};

function useRefreshAll() {
  const qc = useQueryClient();
  return () => Promise.all([
    qc.invalidateQueries({ queryKey: ROOT }),
    qc.invalidateQueries({ queryKey: ['billing', 'me'] }),
  ]);
}

// ── Planes ──

export function usePlans(enabled = true) {
  return useQuery<PlanRow[]>({
    queryKey: keys.plans, queryFn: () => apiClient.get<PlanRow[]>('/billing-admin/plans'), enabled, staleTime: 15_000,
  });
}

export function usePlan(id: string | null) {
  return useQuery<PlanRow>({
    queryKey: keys.plan(id ?? 'none'), queryFn: () => apiClient.get<PlanRow>(`/billing-admin/plans/${encodeURIComponent(id!)}`),
    enabled: !!id, staleTime: 0,
  });
}

export function useCreatePlan() {
  const refresh = useRefreshAll();
  return useMutation({
    mutationFn: (dto: Record<string, unknown>) => apiClient.post<PlanRow>('/billing-admin/plans', dto),
    onSuccess: () => refresh(),
  });
}

export function useUpdatePlan() {
  const refresh = useRefreshAll();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: Record<string, unknown> }) =>
      apiClient.patch<PlanRow>(`/billing-admin/plans/${encodeURIComponent(id)}`, dto),
    onSuccess: () => refresh(),
  });
}

export function useApplyPlan() {
  const refresh = useRefreshAll();
  return useMutation({
    mutationFn: (id: string) => apiClient.post<{ updated: number }>(`/billing-admin/plans/${encodeURIComponent(id)}/apply`, {}),
    onSuccess: () => refresh(),
  });
}

// ── Suscripciones ──

export function useSubscriptions(enabled = true) {
  return useQuery<SubscriptionRow[]>({
    queryKey: keys.subscriptions, queryFn: () => apiClient.get<SubscriptionRow[]>('/billing-admin/subscriptions'), enabled, staleTime: 15_000,
  });
}

export function useBillingEvents(organizationId?: string, enabled = true) {
  const qs = new URLSearchParams({ limit: '50' });
  if (organizationId) qs.set('organizationId', organizationId);
  return useQuery<BillingEventRow[]>({
    queryKey: keys.events(organizationId), queryFn: () => apiClient.get<BillingEventRow[]>(`/billing-admin/events?${qs.toString()}`),
    enabled, staleTime: 10_000,
  });
}

export function useAssignPlan() {
  const refresh = useRefreshAll();
  return useMutation({
    mutationFn: ({ organizationId, planCode, months, agreedPriceUsd }: { organizationId: string; planCode: string; months: number; agreedPriceUsd?: number }) =>
      apiClient.post(`/billing-admin/subscriptions/${encodeURIComponent(organizationId)}/assign`, {
        planCode, months, ...(agreedPriceUsd !== undefined && { agreedPriceUsd }),
      }),
    onSuccess: () => refresh(),
  });
}

export function useRenewSubscription() {
  const refresh = useRefreshAll();
  return useMutation({
    mutationFn: ({ organizationId, months }: { organizationId: string; months?: number }) =>
      apiClient.post(`/billing-admin/subscriptions/${encodeURIComponent(organizationId)}/renew`, months ? { months } : {}),
    onSuccess: () => refresh(),
  });
}

export function useExtendTrial() {
  const refresh = useRefreshAll();
  return useMutation({
    mutationFn: ({ organizationId, days }: { organizationId: string; days: number }) =>
      apiClient.post(`/billing-admin/subscriptions/${encodeURIComponent(organizationId)}/extend-trial`, { days }),
    onSuccess: () => refresh(),
  });
}

export interface SubscriptionPatchBody {
  /** null borra el precio pactado. */
  agreedPriceUsd?: number | null;
  extraUsers?: number;
  exempt?: boolean;
  notes?: string;
  overrides?: SubscriptionOverrides;
  status?: 'ACTIVE' | 'SUSPENDED' | 'CANCELLED';
}

export function useUpdateSubscription() {
  const refresh = useRefreshAll();
  return useMutation({
    mutationFn: ({ organizationId, patch }: { organizationId: string; patch: SubscriptionPatchBody }) =>
      apiClient.patch(`/billing-admin/subscriptions/${encodeURIComponent(organizationId)}`, patch),
    onSuccess: () => refresh(),
  });
}

/** Todas las organizaciones (para asignarles plan, también a las que aún no tienen suscripción). */
export function useAllOrganizations(enabled = true) {
  return useQuery<OrganizationLite[]>({
    queryKey: ['organizations', 'all'], queryFn: () => apiClient.get<OrganizationLite[]>('/organizations'), enabled, staleTime: 15_000,
  });
}

// ── Parámetros ──

export function useBillingSettings(enabled = true) {
  return useQuery<BillingSettingsRow>({
    queryKey: keys.settings, queryFn: () => apiClient.get<BillingSettingsRow>('/billing-admin/settings'), enabled, staleTime: 15_000,
  });
}

export interface SettingsPatchBody {
  enforcementMode?: 'OFF' | 'OBSERVE' | 'ENFORCE';
  graceDays?: number;
  readOnlyDays?: number;
  costPerRequestUsd?: number;
  safetyMultiplier?: number;
  defaultPlanCode?: string;
  /** Reemplaza TODO el objeto de instrucciones de pago. */
  paymentInstructions?: Record<string, string>;
}

export function useUpdateBillingSettings() {
  const refresh = useRefreshAll();
  return useMutation({
    mutationFn: (patch: SettingsPatchBody) => apiClient.patch<BillingSettingsRow>('/billing-admin/settings', patch),
    onSuccess: () => refresh(),
  });
}

// ── Pagos (cola de aprobación) ──

/**
 * Tras aprobar o rechazar un pago cambia casi todo: la cola, las suscripciones (vigencia y plan), el consumo (ingreso) y, del lado del cliente,
 * «Mi plan», sus paquetes y sus pagos (`['billing', …]`, que incluye `['billing','me']`).
 */
function useRefreshAfterPayment() {
  const qc = useQueryClient();
  return () => Promise.all([
    qc.invalidateQueries({ queryKey: ROOT }),
    qc.invalidateQueries({ queryKey: ['billing'] }),
  ]);
}

/** Pagos de todas las organizaciones (los 200 más recientes), sin filtrar: los filtros y contadores se calculan en pantalla. */
export function useAdminPayments(enabled = true) {
  return useQuery<AdminPaymentRow[]>({
    queryKey: keys.payments, queryFn: () => apiClient.get<AdminPaymentRow[]>('/billing-admin/payments'),
    enabled, staleTime: 10_000, refetchOnWindowFocus: true,
  });
}

/** Catálogo de paquetes (para explicar qué acredita aprobar un paquete). */
export function useAdminPacks(enabled = true) {
  return useQuery<AdminPackRow[]>({
    queryKey: keys.packs, queryFn: () => apiClient.get<AdminPackRow[]>('/billing-admin/packs'), enabled, staleTime: 60_000,
  });
}

/**
 * Cambiar el catálogo refresca la lista del superadmin, el catálogo que ve el cliente («Comprar más») y el registro de actividad; y también los
 * pagos, porque la cantidad de un paquete se bloquea mientras tiene pagos pendientes (y un 409 significa que esa lista estaba desactualizada).
 */
function useRefreshAfterPackChange() {
  const qc = useQueryClient();
  return () => Promise.all([
    qc.invalidateQueries({ queryKey: keys.packs }),
    qc.invalidateQueries({ queryKey: keys.payments }),
    qc.invalidateQueries({ queryKey: [...ROOT, 'events'] }),
    qc.invalidateQueries({ queryKey: ['billing', 'packs'] }),
  ]);
}

/** Crea un paquete del catálogo (POST /billing-admin/packs). */
export function useCreatePack() {
  const refresh = useRefreshAfterPackChange();
  return useMutation({
    mutationFn: (body: CreatePackBody) => apiClient.post<AdminPackRow>('/billing-admin/packs', body),
    onSettled: () => refresh(),
  });
}

/** Edita un paquete (PATCH /billing-admin/packs/:id): solo los campos que cambiaron. */
export function useUpdatePack() {
  const refresh = useRefreshAfterPackChange();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdatePackBody }) => apiClient.patch<AdminPackRow>(`/billing-admin/packs/${encodeURIComponent(id)}`, body),
    onSettled: () => refresh(),
  });
}

/** Aprueba el pago: el servidor acredita la licencia o el paquete UNA sola vez (si ya estaba procesado responde 409). */
export function useApprovePayment() {
  const refresh = useRefreshAfterPayment();
  return useMutation({
    mutationFn: (id: string) => apiClient.post<AdminPaymentRow>(`/billing-admin/payments/${encodeURIComponent(id)}/approve`, {}),
    // Con éxito o con 409 (ya procesado) la lista debe volver a leerse.
    onSettled: () => refresh(),
  });
}

export function useRejectPayment() {
  const refresh = useRefreshAfterPayment();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      apiClient.post<AdminPaymentRow>(`/billing-admin/payments/${encodeURIComponent(id)}/reject`, { reason }),
    onSettled: () => refresh(),
  });
}

/** Enlace temporal (5 minutos) al comprobante de un pago. */
export function fetchProofUrl(id: string): Promise<{ url: string }> {
  return apiClient.get<{ url: string }>(`/billing-admin/payments/${encodeURIComponent(id)}/proof-url`);
}

// ── Consumo y costos ──

/** Consumo del mes `period` («AAAA-MM»): peticiones y dinero por organización, asistente y tipo de archivo. */
export function useAdminConsumption(period: string, enabled = true) {
  const valid = isPeriodKey(period);
  return useQuery<AdminConsumption>({
    queryKey: keys.consumption(period),
    queryFn: () => apiClient.get<AdminConsumption>(`/billing-admin/consumption?period=${encodeURIComponent(period)}`),
    enabled: enabled && valid, staleTime: 30_000,
  });
}
