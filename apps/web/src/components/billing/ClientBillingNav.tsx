'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { Callout, Card } from '@/components/billing/ui';
import { useUser } from '@/hooks/useUser';
import { canManageBilling } from '@/lib/billing/payments';
import { cn } from '@/lib/utils';

const TABS = [
  { href: '/dashboard/billing', label: 'Mi plan', exact: true },
  { href: '/dashboard/billing/comprar', label: 'Comprar más', exact: false },
  { href: '/dashboard/billing/pagos', label: 'Mis pagos', exact: false },
];

/** Pestañas entre «Mi plan», «Comprar más» y «Mis pagos». No es parte del menú lateral: se llega desde «Mi plan». */
export function ClientBillingNav() {
  const pathname = usePathname() ?? '';
  return (
    <nav aria-label="Secciones de mi plan" className="flex gap-1 overflow-x-auto border-b border-gray-200">
      {TABS.map((t) => {
        const active = t.exact ? pathname === t.href : pathname === t.href || pathname.startsWith(t.href + '/');
        return (
          <Link
            key={t.href} href={t.href} aria-current={active ? 'page' : undefined}
            className={cn(
              '-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0F2D4A]',
              active ? 'border-[#0F2D4A] text-[#0F2D4A]' : 'border-transparent text-gray-600 hover:text-gray-900',
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Cierra el paso a quien no es ADMIN de la organización con un aviso amable (el API respondería 403). Mientras se sabe el rol muestra
 * un indicador de carga; si no se pudo leer el usuario no bloquea nada: el API sigue siendo la barrera real.
 */
export function AdminOnly({ children }: { children: React.ReactNode }) {
  const { user, loading } = useUser();
  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-gray-400" aria-label="Cargando" /></div>;
  }
  if (user && !canManageBilling(user.role)) {
    return (
      <Card>
        <div className="space-y-3">
          <Callout tone="info" title="Esta sección es para los administradores de la organización">
            Solo los administradores de la organización pueden comprar paquetes, pagar la licencia y ver los pagos. Si necesitas más peticiones de IA,
            más espacio o renovar la licencia, pídeselo a un administrador de tu organización.
          </Callout>
          <Link
            href="/dashboard/billing"
            className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0F2D4A]"
          >
            Volver a Mi plan
          </Link>
        </div>
      </Card>
    );
  }
  return <>{children}</>;
}
