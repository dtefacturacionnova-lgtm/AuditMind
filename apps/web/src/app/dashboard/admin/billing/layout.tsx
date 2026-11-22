'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Loader2, ShieldAlert } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { useAdminPayments } from '@/hooks/useBillingAdmin';
import { useUser } from '@/hooks/useUser';
import { paymentCounts } from '@/lib/billing/payments';
import { cn } from '@/lib/utils';

const TABS = [
  { href: '/dashboard/admin/billing/suscripciones', label: 'Suscripciones' },
  { href: '/dashboard/admin/billing/pagos', label: 'Pagos' },
  { href: '/dashboard/admin/billing/consumo', label: 'Consumo' },
  { href: '/dashboard/admin/billing/planes', label: 'Planes' },
  { href: '/dashboard/admin/billing/parametros', label: 'Parámetros' },
];

/** Marco de la administración de planes y suscripciones: solo SUPER_ADMIN (administración de la plataforma, no de una organización). */
export default function BillingAdminLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useUser();
  const pathname = usePathname() ?? '';
  // Pagos por revisar, para el número junto a la pestaña «Pagos». Es la misma consulta de la pantalla de pagos (no pide nada extra);
  // si falla, simplemente no se muestra el número.
  const isSuper = user?.role === 'SUPER_ADMIN';
  const paymentsQ = useAdminPayments(isSuper);
  const pendingPayments = Array.isArray(paymentsQ.data) ? paymentCounts(paymentsQ.data).PENDING : 0;

  return (
    <div className="flex h-full flex-col">
      <Header title="Planes y suscripciones" />
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-gray-400" aria-label="Cargando" /></div>
        ) : user?.role !== 'SUPER_ADMIN' ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
            <ShieldAlert className="h-10 w-10 text-amber-500" aria-hidden="true" />
            <p className="text-sm font-semibold text-gray-800">Acceso restringido</p>
            <p className="max-w-sm text-xs text-gray-600">Solo el Super Admin de la plataforma puede administrar planes, suscripciones y el cumplimiento.</p>
          </div>
        ) : (
          <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
            <div className="mb-5 flex flex-wrap items-center gap-3">
              <p className="text-sm text-gray-600">Administración › Planes y suscripciones</p>
              <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-900">Solo SUPER_ADMIN</span>
            </div>
            <nav aria-label="Secciones de planes y suscripciones" className="mb-6 flex gap-1 overflow-x-auto border-b border-gray-200">
              {TABS.map((t) => {
                const active = pathname === t.href || pathname.startsWith(t.href + '/');
                return (
                  <Link
                    key={t.href} href={t.href} aria-current={active ? 'page' : undefined}
                    className={cn(
                      '-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0F2D4A]',
                      active ? 'border-[#0F2D4A] text-[#0F2D4A]' : 'border-transparent text-gray-600 hover:text-gray-900',
                    )}
                  >
                    {t.label}
                    {t.href.endsWith('/pagos') && pendingPayments > 0 && (
                      <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-amber-900">
                        {pendingPayments}<span className="sr-only"> pendientes de revisar</span>
                      </span>
                    )}
                  </Link>
                );
              })}
            </nav>
            {children}
          </div>
        )}
      </div>
    </div>
  );
}
