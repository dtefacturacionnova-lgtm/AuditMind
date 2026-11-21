'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { useBilling } from '@/contexts/BillingContext';
import { lockedHref } from '@/lib/billing/menu';
import {
  BILLING_ERROR_EVENT, describeBillingError, isGlobalBillingNotice,
  type BillingErrorInfo, type BillingErrorNotice,
} from '@/lib/billing/errors';
import { cn } from '@/lib/utils';

type Shown = BillingErrorNotice & { info: BillingErrorInfo };

const AUTO_HIDE_MS = 20_000;
const REFRESH_EVERY_MS = 15_000;

/**
 * Aviso global amable cuando el servidor responde 402 LICENCIA_VENCIDA o 403 MODULO_NO_INCLUIDO: en vez de un error genérico en
 * cada pantalla, un aviso claro en español. El cliente de API (`api-client.ts`) emite el evento; aquí solo se escucha.
 */
export function BillingNoticeHost() {
  const { refresh } = useBilling();
  const [shown, setShown] = useState<Shown | null>(null);
  const lastRefresh = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onError = (e: Event) => {
      const info = (e as CustomEvent<BillingErrorInfo>).detail;
      if (!info || !isGlobalBillingNotice(info)) return;
      setShown({ ...describeBillingError(info), info });
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setShown(null), AUTO_HIDE_MS);
      // El plan pudo haber cambiado desde la última lectura: se vuelve a leer (sin repetirlo en ráfaga).
      if (Date.now() - lastRefresh.current > REFRESH_EVERY_MS) {
        lastRefresh.current = Date.now();
        void refresh();
      }
    };
    window.addEventListener(BILLING_ERROR_EVENT, onError);
    return () => {
      window.removeEventListener(BILLING_ERROR_EVENT, onError);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [refresh]);

  if (!shown) return null;
  const critical = shown.tone === 'critical';
  return (
    <div
      role={critical ? 'alert' : 'status'}
      className={cn(
        'fixed bottom-4 right-4 z-[60] w-[min(26rem,calc(100vw-2rem))] rounded-xl border p-4 shadow-lg',
        critical ? 'border-red-300 bg-red-50 text-red-950' : 'border-amber-300 bg-amber-50 text-amber-950',
      )}
    >
      <div className="flex items-start gap-2.5">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <div className="min-w-0 flex-1 text-sm">
          <p className="font-semibold">{shown.title}</p>
          <p className="mt-1 leading-relaxed">{shown.message}</p>
          <div className="mt-2 flex flex-wrap gap-3 text-sm font-semibold">
            <Link href="/dashboard/billing" onClick={() => setShown(null)} className="underline underline-offset-2">Ver mi plan</Link>
            {shown.info.code === 'MODULO_NO_INCLUIDO' && shown.info.module && (
              <Link href={lockedHref(shown.info.module)} onClick={() => setShown(null)} className="underline underline-offset-2">Qué incluye</Link>
            )}
          </div>
        </div>
        <button type="button" onClick={() => setShown(null)} aria-label="Cerrar aviso" className="rounded p-1 hover:bg-black/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-current">
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
