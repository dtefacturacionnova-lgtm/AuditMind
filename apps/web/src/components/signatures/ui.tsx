'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Copy, Info, X, XCircle } from 'lucide-react';
import { TONE_CHIP, type Tone } from '@/lib/signature/internal';

/** Piezas visuales de la interfaz INTERNA de la firma (equipo del despacho). Solo presentación. */

export const inputCls =
  'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400 aria-[invalid=true]:border-red-400';
export const labelCls = 'text-xs font-medium text-gray-600';
export const primaryBtn =
  'inline-flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-60';
export const ghostBtn =
  'inline-flex items-center justify-center gap-1.5 rounded-xl border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-50';
export const dangerBtn =
  'inline-flex items-center justify-center gap-1.5 rounded-xl border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 disabled:cursor-not-allowed disabled:opacity-50';

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Ventana modal accesible: role="dialog", foco dentro (Tab no se escapa), Escape cierra, el fondo no se desplaza y el
 * foco vuelve a quien la abrió. `busy` impide cerrarla mientras se envía algo.
 */
export function Dialog({ title, subtitle, onClose, busy = false, size = 'md', children }: {
  title: string; subtitle?: ReactNode; onClose: () => void; busy?: boolean; size?: 'md' | 'lg'; children: ReactNode;
}) {
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const busyRef = useRef(busy);
  busyRef.current = busy;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const root = ref.current;
    // Primer campo del formulario si lo hay; si no, el propio diálogo (para que Escape y Tab funcionen).
    (root?.querySelector<HTMLElement>('input:not([type=hidden]),textarea,select') ?? root)?.focus();
    const scroll = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busyRef.current) { e.stopPropagation(); closeRef.current(); return; }
      if (e.key !== 'Tab' || !root) return;
      const items = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (items.length === 0) { e.preventDefault(); return; }
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === root)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = scroll;
      previous?.focus?.();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}
        className={`max-h-[90vh] w-full overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl outline-none ${size === 'lg' ? 'max-w-2xl' : 'max-w-lg'}`}
      >
        <div className="mb-4 flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-base font-semibold text-gray-800">{title}</h2>
            {subtitle && <p className="mt-1 text-xs leading-relaxed text-gray-500">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Cerrar"
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 disabled:opacity-40">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Chip({ tone, children, title }: { tone: Tone; children: ReactNode; title?: string }) {
  return <span title={title} className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${TONE_CHIP[tone]}`}>{children}</span>;
}

const NOTE: Record<'info' | 'warn' | 'error' | 'ok', { box: string; Icon: typeof Info; icon: string }> = {
  info:  { box: 'bg-blue-50 border-blue-200 text-blue-900',         Icon: Info,          icon: 'text-blue-600' },
  warn:  { box: 'bg-amber-50 border-amber-200 text-amber-900',      Icon: AlertTriangle, icon: 'text-amber-600' },
  error: { box: 'bg-red-50 border-red-200 text-red-800',            Icon: XCircle,       icon: 'text-red-600' },
  ok:    { box: 'bg-emerald-50 border-emerald-200 text-emerald-900', Icon: CheckCircle2, icon: 'text-emerald-600' },
};

/** Aviso en línea. Los errores se anuncian a lectores de pantalla (role="alert"). */
export function Note({ tone = 'info', children }: { tone?: 'info' | 'warn' | 'error' | 'ok'; children: ReactNode }) {
  const { box, Icon, icon } = NOTE[tone];
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`flex gap-2.5 rounded-xl border px-3 py-2.5 text-xs leading-relaxed ${box}`}>
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${icon}`} aria-hidden="true" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** Etiqueta + control + error, enlazados con aria-describedby. */
export function FormField({ label, required, hint, error, children }: {
  label: string; required?: boolean; hint?: string; error?: string;
  children: (a11y: { id: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }) => ReactNode;
}) {
  const id = useId();
  const describedBy = [hint ? `${id}-hint` : '', error ? `${id}-err` : ''].filter(Boolean).join(' ') || undefined;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className={labelCls}>{label}{required && <span className="text-red-500"> *</span>}</label>
      {children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })}
      {hint && <p id={`${id}-hint`} className="text-[11px] text-gray-400">{hint}</p>}
      {error && <p id={`${id}-err`} className="text-[11px] font-medium text-red-600">{error}</p>}
    </div>
  );
}

/** Abre el enlace de firma en una pestaña nueva del dispositivo del auditor (firma presencial). Sin Referer ni opener. */
export function openSignUrl(url: string): void {
  window.open(url, '_blank', 'noopener,noreferrer');
}

/**
 * Firma presencial en el equipo del auditor: el navegador comparte la sesión de AuditMind entre pestañas, así que quien
 * reciba el equipo podría abrir el panel con el rol del auditor (revisión de seguridad F5b, 2026-10-19). Por eso el
 * enlace ya no se abre solo: se recomienda el teléfono de la persona o una ventana privada.
 */
export function InPersonWarning() {
  return (
    <Note tone="warn">
      <strong>Si la persona va a firmar en tu equipo</strong>, abre el enlace en una <strong>ventana privada</strong> (Ctrl+Shift+N en Chrome o Edge,
      Ctrl+Shift+P en Firefox) y ciérrala al terminar. En una pestaña normal, quien use el equipo podría entrar a tu sesión de AuditMind.
    </Note>
  );
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * El enlace del firmante, en claro, UNA sola vez (docs/firma-externa-por-enlace.md §5): el servidor no vuelve a
 * entregarlo; si hace falta otro, se reenvía (lo que rota el enlace). Vive solo en el estado de este componente.
 */
export function OneTimeLink({ url, emailSent, emailSkipped = false, signerEmail, onCopied, onOpenInPerson }: {
  url: string; emailSent: boolean; /** firma presencial: no se pidió correo */ emailSkipped?: boolean; signerEmail: string;
  onCopied?: () => void; onOpenInPerson?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const inputId = useId();

  const copy = async () => {
    input.current?.select();
    if (await copyText(url)) {
      setCopyFailed(false);
      setCopied(true);
      onCopied?.();
      setTimeout(() => setCopied(false), 2500);
    } else {
      // Sin permiso de portapapeles (p. ej. página sin HTTPS): el texto queda seleccionado para copiarlo a mano.
      setCopyFailed(true);
    }
  };

  return (
    <div className="space-y-3">
      {emailSkipped ? (
        <>
          <Note tone="info">
            <strong>No se envió correo con el enlace</strong> (firma presencial). Lo mejor es que {signerEmail} abra el enlace en <strong>su propio
            teléfono</strong> (envíaselo por el medio que tengan a mano): ahí mismo le llega el código de verificación.
          </Note>
          <InPersonWarning />
          {onOpenInPerson && (
            <button type="button" onClick={onOpenInPerson} className="block text-xs font-semibold text-blue-700 underline">
              Abrir en una pestaña de este navegador de todos modos
            </button>
          )}
        </>
      ) : emailSent ? (
        <Note tone="ok">Enviamos el enlace a <strong>{signerEmail}</strong>. El firmante deberá confirmar un código que le llega a ese mismo correo.</Note>
      ) : (
        <Note tone="error"><strong>No pudimos enviar el correo.</strong> La solicitud sí quedó creada: copia el enlace y envíaselo a {signerEmail} por otro medio. Revisa también que el correo esté bien escrito: el código de verificación le llega a esa misma dirección.</Note>
      )}
      <div>
        <label htmlFor={inputId} className={labelCls}>Enlace de firma</label>
        <div className="mt-1 flex gap-2">
          <input id={inputId} ref={input} readOnly value={url} onFocus={(e) => e.currentTarget.select()} className={`${inputCls} font-mono text-xs`} />
          <button type="button" onClick={() => void copy()} className={`${ghostBtn} shrink-0`}>
            <Copy className="h-3.5 w-3.5" aria-hidden="true" /> {copied ? 'Copiado' : 'Copiar'}
          </button>
        </div>
        {copyFailed && <p role="status" className="mt-1.5 text-[11px] text-gray-600">No pudimos copiarlo automáticamente: el enlace quedó seleccionado, cópialo con Ctrl+C.</p>}
        <p className="mt-1.5 text-[11px] font-medium text-amber-700">No se volverá a mostrar. Si lo pierdes, usa «Reenviar» para generar uno nuevo.</p>
      </div>
    </div>
  );
}
