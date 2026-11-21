'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { STATUS_LABEL, STATUS_PILL, isStatus } from '@/lib/billing/catalog';

/** Piezas de interfaz compartidas por las pantallas de planes y suscripciones. Mismo estilo que Organizaciones. */

export const INPUT_CLS =
  'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#0F2D4A] focus:outline-none focus:ring-2 focus:ring-[#0F2D4A]/30 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500 aria-[invalid=true]:border-red-500';

export const BTN_PRIMARY =
  'inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#0F2D4A] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#1a3f5f] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0F2D4A] disabled:cursor-not-allowed disabled:opacity-50';

export const BTN_SECONDARY =
  'inline-flex items-center justify-center gap-1.5 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 transition-colors hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0F2D4A] disabled:cursor-not-allowed disabled:opacity-50';

export const BTN_DANGER =
  'inline-flex items-center justify-center gap-1.5 rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 disabled:cursor-not-allowed disabled:opacity-50';

export const BTN_SMALL =
  'inline-flex items-center gap-1 rounded-full border border-gray-300 bg-white px-3 py-1 text-xs font-semibold text-gray-800 transition-colors hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0F2D4A] disabled:cursor-not-allowed disabled:opacity-50';

export function Card({ title, subtitle, children, className, action }: {
  title?: ReactNode; subtitle?: ReactNode; children: ReactNode; className?: string; action?: ReactNode;
}) {
  return (
    <section className={cn('rounded-xl border border-gray-200 bg-white p-5 sm:p-6', className)}>
      {(title || action) && (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {title && <h2 className="text-base font-semibold text-gray-900">{title}</h2>}
            {subtitle && <p className="mt-1 text-sm leading-relaxed text-gray-600">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function StatusPill({ status }: { status: string | null | undefined }) {
  if (!isStatus(status)) return null;
  return <span className={cn('inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold', STATUS_PILL[status])}>{STATUS_LABEL[status]}</span>;
}

export function Pill({ children, tone = 'gray' }: { children: ReactNode; tone?: 'gray' | 'blue' | 'green' | 'amber' | 'red' }) {
  const tones = {
    gray: 'bg-gray-100 text-gray-800', blue: 'bg-blue-100 text-blue-900', green: 'bg-green-100 text-green-900',
    amber: 'bg-amber-100 text-amber-900', red: 'bg-red-100 text-red-900',
  };
  return <span className={cn('inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold', tones[tone])}>{children}</span>;
}

/** Aviso en línea: info (azul), warning (ámbar), critical (rojo), success (verde). */
export function Callout({ tone = 'info', title, children, className }: {
  tone?: 'info' | 'warning' | 'critical' | 'success'; title?: ReactNode; children: ReactNode; className?: string;
}) {
  const styles = {
    info: 'border-blue-200 bg-blue-50 text-blue-950',
    warning: 'border-amber-300 bg-amber-50 text-amber-950',
    critical: 'border-red-300 bg-red-50 text-red-950',
    success: 'border-green-300 bg-green-50 text-green-950',
  } as const;
  const Icon = tone === 'success' ? CheckCircle2 : tone === 'info' ? Info : AlertTriangle;
  return (
    <div role={tone === 'critical' ? 'alert' : 'status'} className={cn('flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-sm leading-relaxed', styles[tone], className)}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0">
        {title && <p className="font-semibold">{title}</p>}
        <div>{children}</div>
      </div>
    </div>
  );
}

/** Campo con etiqueta real, ayuda y error asociados. */
export function Field({ label, htmlFor, help, error, children, className }: {
  label: ReactNode; htmlFor: string; help?: ReactNode; error?: string; children: ReactNode; className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={htmlFor} className="text-sm font-semibold text-gray-800">{label}</label>
      {children}
      {help && !error && <p id={`${htmlFor}-help`} className="text-xs text-gray-600">{help}</p>}
      {error && <p id={`${htmlFor}-error`} role="alert" className="text-xs font-medium text-red-700">{error}</p>}
    </div>
  );
}

/** Ventana modal accesible: rol de diálogo, Escape para cerrar, foco al abrir y al cerrar. */
export function Modal({ title, subtitle, onClose, children, size = 'md' }: {
  title: ReactNode; subtitle?: ReactNode; onClose: () => void; children: ReactNode; size?: 'md' | 'lg';
}) {
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeRef.current(); };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:items-center" onClick={onClose}>
      <div
        ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}
        className={cn('my-4 w-full rounded-2xl bg-white p-5 shadow-xl focus:outline-none sm:p-6', size === 'lg' ? 'max-w-2xl' : 'max-w-md')}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-start justify-between gap-3">
          <h2 id={titleId} className="text-base font-bold text-gray-900">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0F2D4A]">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        {subtitle && <p className="mb-4 text-sm leading-relaxed text-gray-600">{subtitle}</p>}
        {children}
      </div>
    </div>
  );
}

/** Casilla con su texto y descripción: toda la fila es clicable (etiqueta real). */
export function CheckRow({ checked, onChange, label, description, disabled, id }: {
  checked: boolean; onChange: (v: boolean) => void; label: ReactNode; description?: ReactNode; disabled?: boolean; id: string;
}) {
  return (
    <label
      htmlFor={id}
      className={cn(
        'flex cursor-pointer items-start gap-3 rounded-lg border px-3.5 py-2.5 transition-colors',
        checked ? 'border-blue-300 bg-blue-50/60' : 'border-gray-200 bg-white hover:bg-gray-50',
        disabled && 'cursor-not-allowed opacity-70',
      )}
    >
      <input
        id={id} type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-400 text-[#0F2D4A] focus:ring-2 focus:ring-[#0F2D4A]/40"
      />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-gray-900">{label}</span>
        {description && <span className="block text-xs leading-relaxed text-gray-600">{description}</span>}
      </span>
    </label>
  );
}

/** Mensaje de error de una consulta, con pista para el caso de las tablas de planes aún sin crear. */
export function QueryError({ error, onRetry, what }: { error: unknown; onRetry?: () => void; what: string }) {
  const message = error instanceof Error ? error.message : '';
  return (
    <div className="flex flex-col items-center gap-2 py-12 text-center">
      <AlertTriangle className="h-8 w-8 text-red-500" aria-hidden="true" />
      <p className="text-sm font-semibold text-gray-800">No se pudo cargar {what}</p>
      {message && <p className="max-w-md text-xs text-gray-600">{message}</p>}
      <p className="max-w-md text-xs text-gray-600">
        Si es la primera vez que entras aquí, verifica que el SQL de «Planes y suscripciones» ya esté aplicado en la base de datos.
      </p>
      {onRetry && <button type="button" onClick={onRetry} className={BTN_SECONDARY}>Reintentar</button>}
    </div>
  );
}
