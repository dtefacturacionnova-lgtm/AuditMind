'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Loader2, ShieldAlert } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { useUser } from '@/hooks/useUser';
import { cn } from '@/lib/utils';

const TABS = [
  { href: '/dashboard/admin/billing/suscripciones', label: 'Suscripciones' },
  { href: '/dashboard/admin/billing/planes', label: 'Planes' },
  { href: '/dashboard/admin/billing/parametros', label: 'Parámetros' },
];

/** Marco de la administración de planes y suscripciones: solo SUPER_ADMIN (administración de la plataforma, no de una organización). */
export default function BillingAdminLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useUser();
  const pathname = usePathname() ?? '';

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
            <nav aria-label="Secciones de planes y suscripciones" className="mb-6 flex gap-1 border-b border-gray-200">
              {TABS.map((t) => {
                const active = pathname === t.href || pathname.startsWith(t.href + '/');
                return (
                  <Link
                    key={t.href} href={t.href} aria-current={active ? 'page' : undefined}
                    className={cn(
                      '-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0F2D4A]',
                      active ? 'border-[#0F2D4A] text-[#0F2D4A]' : 'border-transparent text-gray-600 hover:text-gray-900',
                    )}
                  >
                    {t.label}
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
