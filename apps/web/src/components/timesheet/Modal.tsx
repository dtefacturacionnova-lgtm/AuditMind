'use client';

import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';

/** Ventana de diálogo de la captura y el cierre de horas (mismo estilo que el resto de los modales). */
export function Modal({
  title, icon, onClose, children, footer, wide = false,
}: { title: string; icon?: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={onClose}>
      <div
        role="dialog" aria-modal="true" aria-label={title}
        onClick={e => e.stopPropagation()}
        className={`bg-white rounded-2xl shadow-xl w-full max-h-[88vh] flex flex-col border border-gray-200 ${wide ? 'max-w-3xl' : 'max-w-lg'}`}
      >
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            {icon}
            <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 shrink-0" title="Cerrar">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-5 py-4 space-y-4 overflow-y-auto">{children}</div>
        {footer && <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

export const inputCls =
  'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400';
export const btnPrimary =
  'flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50';
export const btnGhost =
  'px-4 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50';
