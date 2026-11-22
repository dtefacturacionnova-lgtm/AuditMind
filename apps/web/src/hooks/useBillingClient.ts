'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { ClientUsage, CreatePaymentBody, PackRow, PaymentRow } from '@/lib/billing/client-types';

/**
 * Lo que ve el CLIENTE de facturación: su consumo, los paquetes que puede comprar y sus pagos.
 * Rutas de apps/api/src/billing/billing.controller.ts. Cuelgan de ['billing'] igual que «Mi plan» (['billing','me']).
 * Ver el consumo y los paquetes lo puede cualquier usuario; los pagos exigen ADMIN (pasa `enabled` según el rol para no provocar 403).
 */

const ROOT = ['billing'] as const;
export const billingClientKeys = {
  usage: [...ROOT, 'usage'] as const,
  packs: [...ROOT, 'packs'] as const,
  payments: [...ROOT, 'payments'] as const,
};

/** Consumo de la organización (peticiones de IA por asistente y espacio por tipo de archivo). Sin dinero. */
export function useBillingUsage(enabled = true) {
  return useQuery<ClientUsage>({
    queryKey: billingClientKeys.usage,
    queryFn: () => apiClient.get<ClientUsage>('/billing/usage'),
    enabled, staleTime: 30_000, retry: 1, refetchOnWindowFocus: true,
  });
}

/** Paquetes que el plan permite comprar. */
export function useBillingPacks(enabled = true) {
  return useQuery<PackRow[]>({
    queryKey: billingClientKeys.packs,
    queryFn: () => apiClient.get<PackRow[]>('/billing/packs'),
    enabled, staleTime: 60_000, retry: 1,
  });
}

/** Mis pagos (los 50 más recientes). Solo ADMIN. */
export function useMyPayments(enabled = true) {
  return useQuery<PaymentRow[]>({
    queryKey: billingClientKeys.payments,
    queryFn: () => apiClient.get<PaymentRow[]>('/billing/payments'),
    enabled, staleTime: 10_000, retry: 1, refetchOnWindowFocus: true,
  });
}

function useRefreshPayments() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: billingClientKeys.payments });
}

/** Pide un pago (licencia o paquete): el API devuelve la referencia única y las instrucciones. */
export function useCreatePayment() {
  const refresh = useRefreshPayments();
  return useMutation({
    mutationFn: (body: CreatePaymentBody) => apiClient.post<PaymentRow>('/billing/payments', body),
    onSuccess: () => refresh(),
  });
}

/** Sube (o reemplaza) el comprobante de un pago pendiente: multipart, campo `file`. */
export function useUploadProof() {
  const refresh = useRefreshPayments();
  return useMutation({
    mutationFn: ({ id, file }: { id: string; file: File }) => {
      const form = new FormData();
      form.append('file', file);
      return apiClient.postForm<PaymentRow>(`/billing/payments/${encodeURIComponent(id)}/proof`, form);
    },
    onSuccess: () => refresh(),
  });
}

/** Cancela un pago pendiente. */
export function useCancelPayment() {
  const refresh = useRefreshPayments();
  return useMutation({
    mutationFn: (id: string) => apiClient.post<{ cancelled: boolean }>(`/billing/payments/${encodeURIComponent(id)}/cancel`, {}),
    onSuccess: () => refresh(),
  });
}
