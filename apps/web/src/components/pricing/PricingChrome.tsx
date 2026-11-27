import Link from 'next/link';
import type { ReactNode } from 'react';

/** Marco de la página pública de precios: encabezado con la marca, el acceso de clientes y (si hay contacto) la demo; y pie. */

const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

export function PricingHeader({ demoHref }: { demoHref: string | null }) {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <Link href="/precios" className={`flex items-baseline gap-2 rounded ${FOCUS}`}>
          <span className="text-lg font-bold tracking-tight text-primary">Nova Criterio</span>
          <span className="hidden text-[11px] font-medium uppercase tracking-widest text-slate-600 sm:inline">Intelligence Platform</span>
        </Link>
        <nav aria-label="Principal" className="flex items-center gap-1.5">
          <Link href="/login" className={`rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 ${FOCUS}`}>
            Iniciar sesión
          </Link>
          {demoHref && (
            <a href={demoHref} className={`rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-light ${FOCUS}`}>
              Solicitar demo
            </a>
          )}
        </nav>
      </div>
    </header>
  );
}

export function PricingFooter() {
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-6 text-sm text-slate-600 sm:px-6 lg:px-8">
        <p>© {new Date().getFullYear()} Nova Criterio · Plataforma de auditoría inteligente</p>
        <p>Precios en dólares (USD).</p>
      </div>
    </footer>
  );
}

export function PricingPage({ header, children }: { header: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900">
      {header}
      <main className="flex-1">{children}</main>
      <PricingFooter />
    </div>
  );
}
