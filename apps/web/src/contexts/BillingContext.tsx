'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { useUser } from '@/hooks/useUser';
import {
  isAssistantIncluded, isEnforcing, isLocked, isPlanActive, isReadOnlyAccount, visibleNotice,
  type BillingMe, type BillingNotice,
} from '@/lib/billing/access';
import type { EntitlementKey } from '@/lib/billing/catalog';

export const BILLING_ME_KEY = ['billing', 'me'] as const;

interface BillingContextValue {
  /** Respuesta de GET /billing/me tal cual (para «Mi plan»). null mientras carga o si la llamada falló. */
  me: BillingMe | null;
  isLoading: boolean;
  isError: boolean;
  /** ¿Aplica el plan a esta sesión (candados y avisos)? Falso con el interruptor apagado, exenta, sin suscripción, sin datos o SUPER_ADMIN. */
  planActive: boolean;
  /** ¿El servidor bloquea de verdad (ENFORCE)? */
  enforcing: boolean;
  /** ¿Cuenta en solo lectura por licencia vencida (y el plan aplica)? */
  readOnly: boolean;
  /** Aviso a mostrar (null si no hay o si el plan no aplica). */
  notice: BillingNotice | null;
  /** ¿Debe este módulo o función mostrarse con candado? */
  isLocked: (key: EntitlementKey | null | undefined) => boolean;
  isAssistantIncluded: (assistant: string) => boolean;
  refresh: () => Promise<unknown>;
}

/** Valor por defecto fuera del proveedor: todo abierto. */
const OPEN: BillingContextValue = {
  me: null, isLoading: false, isError: false, planActive: false, enforcing: false, readOnly: false, notice: null,
  isLocked: () => false, isAssistantIncluded: () => true, refresh: async () => undefined,
};

const BillingContext = createContext<BillingContextValue>(OPEN);

/**
 * Lee el plan de la organización UNA vez (GET /billing/me), lo comparte con el menú y las pantallas y lo refresca al volver a la
 * ventana. Falla abierta: si la llamada falla, tarda o el usuario es SUPER_ADMIN, no se oculta ni se bloquea nada.
 */
export function BillingProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const { user, loading: userLoading } = useUser();
  const query = useQuery<BillingMe | null>({
    queryKey: BILLING_ME_KEY,
    queryFn: () => apiClient.get<BillingMe>('/billing/me'),
    select: (d) => (d && typeof d === 'object' && !Array.isArray(d) ? d : null),
    staleTime: 60_000,
    retry: 1,
    refetchOnWindowFocus: true,
  });

  const value = useMemo<BillingContextValue>(() => {
    const raw = query.isError ? null : (query.data ?? null);
    // El guardián del servidor no toca al SUPER_ADMIN (plataforma); mientras no se sabe el rol, tampoco se aplica nada.
    const bypass = userLoading || user?.role === 'SUPER_ADMIN';
    const effective = bypass ? null : raw;
    return {
      me: raw,
      isLoading: query.isLoading,
      isError: query.isError,
      planActive: isPlanActive(effective),
      enforcing: isEnforcing(effective),
      readOnly: isReadOnlyAccount(effective),
      notice: visibleNotice(effective),
      isLocked: (key) => isLocked(effective, key),
      isAssistantIncluded: (a) => isAssistantIncluded(effective, a),
      refresh: () => qc.invalidateQueries({ queryKey: BILLING_ME_KEY }),
    };
  }, [query.data, query.isError, query.isLoading, user?.role, userLoading, qc]);

  return <BillingContext.Provider value={value}>{children}</BillingContext.Provider>;
}

export function useBilling(): BillingContextValue {
  return useContext(BillingContext);
}
