'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { AlertTriangle, Info, X } from 'lucide-react';
import { useBilling } from '@/contexts/BillingContext';
import { cn } from '@/lib/utils';

/**
 * Aviso de vigencia del plan arriba de cada pantalla (prueba por terminar, licencia por vencer, gracia, solo lectura).
 * Con el interruptor apagado, sin plan, exenta o sin poder leer el plan no dibuja nada (cero cambios en la pantalla).
 */
export function PlanBanner() {
  const { notice, planActive, enforcing } = useBilling();
  const pathname = usePathname();
  const [dismissed, setDismissed] = useState<string | null>(null);

  if (!planActive || !notice) return null;
  const critical = notice.level === 'critical';
  if (!critical && dismissed === notice.code) return null;
  const Icon = notice.level === 'info' ? Info : AlertTriangle;
  const onMyPlan = pathname?.startsWith('/dashboard/billing') ?? false;

  return (
    <div
      role={critical ? 'alert' : 'status'}
      className={cn(
        'sticky top-0 z-30 flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-2.5 text-sm',
        notice.level === 'critical' && 'border-red-300 bg-red-50 text-red-950',
        notice.level === 'warning' && 'border-amber-300 bg-amber-50 text-amber-950',
        notice.level === 'info' && 'border-blue-200 bg-blue-50 text-blue-950',
      )}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      <p className="min-w-0 flex-1">
        {notice.message}
        {!enforcing && <span className="ml-1 text-xs opacity-80">(Modo observación: todavía no se bloquea nada.)</span>}
      </p>
      {!onMyPlan && <Link href="/dashboard/billing" className="font-semibold underline underline-offset-2">Ver mi plan</Link>}
      {!critical && (
        <button type="button" onClick={() => setDismissed(notice.code)} aria-label="Ocultar este aviso" className="rounded p-1 hover:bg-black/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-current">
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
