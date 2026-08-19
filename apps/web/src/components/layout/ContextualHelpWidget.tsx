'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { HelpCircle, X } from 'lucide-react';
import { useActivePaperCode } from '@/contexts/ContextualHelpContext';
import { resolveHelp } from '@/lib/contextualHelpContent';

/** Botón flotante de ayuda contextual, visible en todo el dashboard. Resuelve
 *  qué mostrar a partir de la ruta actual (y del paperCode activo, cuando el
 *  usuario está dentro de un papel de trabajo específico — ver
 *  ContextualHelpContext) para no requerir que cada pantalla escriba su
 *  propio contenido de ayuda. */
export function ContextualHelpWidget() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const activePaperCode = useActivePaperCode();
  const topic = resolveHelp(pathname ?? '', activePaperCode);

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {open && (
        <div className="mb-3 w-80 max-h-[70vh] overflow-y-auto rounded-2xl border border-gray-200 bg-white shadow-2xl">
          <div className="flex items-start justify-between gap-2 border-b border-gray-100 px-4 py-3">
            <h3 className="text-sm font-semibold text-gray-800">{topic.title}</h3>
            <button
              onClick={() => setOpen(false)}
              className="shrink-0 text-gray-400 hover:text-gray-600"
              aria-label="Cerrar ayuda"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <ul className="space-y-2.5 px-4 py-3">
            {topic.body.map((line, i) => (
              <li key={i} className="flex gap-2 text-xs leading-relaxed text-gray-600">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-blue-400" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <button
        onClick={() => setOpen(o => !o)}
        className="flex h-11 w-11 items-center justify-center rounded-full bg-[#0F2D4A] text-white shadow-lg hover:bg-[#1a4a7a] transition-colors"
        title="Ayuda de esta pantalla"
        aria-label="Ayuda de esta pantalla"
      >
        <HelpCircle className="w-5 h-5" />
      </button>
    </div>
  );
}
