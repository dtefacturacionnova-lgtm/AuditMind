import type { ReactNode } from 'react';
import { Lock, ShieldCheck } from 'lucide-react';

/** Marco común de las páginas públicas de firma y verificación: cabecera de marca, contenido y pie. Sin lógica. */
export function PublicShell({ subtitle, children }: { subtitle: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-10 border-b border-gray-200 bg-white">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-3 px-4">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600" aria-hidden="true">
            <ShieldCheck className="h-4 w-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-bold leading-none text-gray-800">AuditMind</p>
            <p className="text-[10px] text-gray-500">{subtitle}</p>
          </div>
          <span className="ml-auto flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
            <Lock className="h-3 w-3" aria-hidden="true" /> Conexión segura
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6 sm:py-8">{children}</main>

      <footer className="px-4 py-6 text-center text-xs text-gray-500">
        <p>Firma electrónica simple · Cada firma queda registrada con fecha, hora y huella del documento.</p>
        <p className="mt-1">© {new Date().getFullYear()} AuditMind</p>
      </footer>
    </div>
  );
}
