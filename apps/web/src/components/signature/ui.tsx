'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';

/** Piezas visuales compartidas por /firmar y /verificar. Solo presentación: ninguna lógica de negocio. */

export type Tone = 'blue' | 'green' | 'amber' | 'red' | 'gray';

const TONE: Record<Tone, { box: string; icon: string }> = {
  blue:  { box: 'bg-blue-50 border-blue-200 text-blue-900',      icon: 'text-blue-600' },
  green: { box: 'bg-emerald-50 border-emerald-200 text-emerald-900', icon: 'text-emerald-600' },
  amber: { box: 'bg-amber-50 border-amber-200 text-amber-900',   icon: 'text-amber-600' },
  red:   { box: 'bg-red-50 border-red-200 text-red-900',         icon: 'text-red-600' },
  gray:  { box: 'bg-gray-50 border-gray-200 text-gray-800',      icon: 'text-gray-500' },
};

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`bg-white rounded-2xl border border-gray-200 shadow-sm p-5 sm:p-7 ${className}`}>{children}</section>;
}

/** Mensaje en pantalla. Los errores se anuncian a lector de pantalla (role="alert"); los avisos, de forma educada. */
export function Alert({ tone = 'blue', children, id, live = true }: { tone?: Tone; children: ReactNode; id?: string; live?: boolean }) {
  const Icon = tone === 'red' ? XCircle : tone === 'green' ? CheckCircle2 : tone === 'amber' ? AlertTriangle : Info;
  return (
    <div id={id} role={live ? (tone === 'red' ? 'alert' : 'status') : undefined} className={`flex gap-3 rounded-xl border px-4 py-3 text-sm ${TONE[tone].box}`}>
      <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${TONE[tone].icon}`} aria-hidden="true" />
      <div className="min-w-0 leading-relaxed">{children}</div>
    </div>
  );
}

export function Spinner({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-4" role="status" aria-live="polite">
      <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" aria-hidden="true" />
      <p className="text-gray-500 text-sm">{label}</p>
    </div>
  );
}

/** Pone el foco en el título al cambiar de pantalla (lectores de pantalla y teclado). */
export function useFocusOnMount<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  return ref;
}

export function Heading({ children, subtitle }: { children: ReactNode; subtitle?: ReactNode }) {
  const ref = useFocusOnMount<HTMLHeadingElement>();
  return (
    <div className="mb-5">
      <h1 ref={ref} tabIndex={-1} className="text-xl sm:text-2xl font-bold text-gray-900 leading-tight outline-none">{children}</h1>
      {subtitle && <p className="mt-1.5 text-sm text-gray-500 leading-relaxed">{subtitle}</p>}
    </div>
  );
}

/** Pantalla de estado final (enlace inválido, vencido, rechazado…). */
export function StatusScreen({ tone, icon, title, children, action }: {
  tone: Tone; icon: ReactNode; title: string; children?: ReactNode; action?: ReactNode;
}) {
  const ref = useFocusOnMount<HTMLHeadingElement>();
  return (
    <Card className="text-center">
      <div className={`mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full border ${TONE[tone].box}`} aria-hidden="true">
        <span className={TONE[tone].icon}>{icon}</span>
      </div>
      <h1 ref={ref} tabIndex={-1} className="text-xl font-bold text-gray-900 outline-none">{title}</h1>
      {children && <div className="mt-2 text-sm text-gray-600 leading-relaxed max-w-md mx-auto">{children}</div>}
      {action && <div className="mt-6 flex justify-center">{action}</div>}
    </Card>
  );
}

export const primaryButton =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm ' +
  'hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ' +
  'disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500 transition-colors';

export const secondaryButton =
  'inline-flex items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 ' +
  'hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ' +
  'disabled:cursor-not-allowed disabled:opacity-50 transition-colors';

export const inputClass =
  'block w-full rounded-xl border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 ' +
  'focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:bg-gray-100 aria-[invalid=true]:border-red-400';

/** Etiqueta + control + ayuda + error, enlazados con aria-describedby. */
export function Field({ id, label, required, help, error, children }: {
  id: string; label: string; required?: boolean; help?: string; error?: string; children: (a11y: { id: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }) => ReactNode;
}) {
  const describedBy = [help ? `${id}-help` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined;
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-gray-800">
        {label}{required && <span className="text-red-600" aria-hidden="true"> *</span>}
        {required && <span className="sr-only"> (obligatorio)</span>}
      </label>
      {children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })}
      {help && <p id={`${id}-help`} className="mt-1 text-xs text-gray-500">{help}</p>}
      {error && <p id={`${id}-error`} className="mt-1 text-xs font-medium text-red-600">{error}</p>}
    </div>
  );
}

/** Los 3 pasos del flujo. Es una secuencia real (verificar → revisar y firmar → listo), por eso va numerada. */
export function Stepper({ current }: { current: 1 | 2 | 3 }) {
  const steps = ['Verificar correo', 'Revisar y firmar', 'Listo'];
  return (
    <ol className="mb-6 flex items-center gap-2 text-xs sm:text-sm" aria-label="Progreso">
      {steps.map((label, i) => {
        const n = (i + 1) as 1 | 2 | 3;
        const state = n < current ? 'done' : n === current ? 'current' : 'todo';
        return (
          <li key={label} className="flex items-center gap-2 min-w-0" aria-current={state === 'current' ? 'step' : undefined}>
            <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
              state === 'done' ? 'bg-emerald-600 text-white' : state === 'current' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'}`}>
              {state === 'done' ? '✓' : n}
            </span>
            {/* En pantallas angostas solo se escribe el nombre del paso actual; los demás quedan como número (sr-only para lectores). */}
            <span className={`${state === 'current' ? 'font-semibold text-gray-900' : 'sr-only text-gray-500 sm:not-sr-only'} truncate`}>{label}</span>
            {i < steps.length - 1 && <span className="h-px w-4 sm:w-8 bg-gray-300" aria-hidden="true" />}
          </li>
        );
      })}
    </ol>
  );
}
