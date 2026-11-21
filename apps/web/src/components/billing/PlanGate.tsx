'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { useBilling } from '@/contexts/BillingContext';
import { moduleForPath } from '@/lib/billing/menu';
import { ModuleNotIncluded } from './ModuleNotIncluded';

/**
 * Si alguien escribe a mano la dirección de un módulo que su plan no incluye, muestra «no está en tu plan» en vez de una pantalla
 * rota por los errores 403 del servidor. Solo actúa con el cumplimiento en ENFORCE (cuando el servidor bloquea de verdad) y solo en
 * rutas cuyo módulo es inequívoco; con el interruptor apagado, sin plan o sin poder leerlo, deja pasar todo.
 */
export function PlanGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { enforcing, isLocked } = useBilling();
  const key = moduleForPath(pathname);
  if (enforcing && key && isLocked(key)) return <ModuleNotIncluded moduleKey={key} />;
  return <>{children}</>;
}
