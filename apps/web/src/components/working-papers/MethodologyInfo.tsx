'use client';

import { useEffect, useState } from 'react';
import { Info, X } from 'lucide-react';
import { getMethodology } from './paperMethodology';

/** Small "how was this calculated" info button + modal. Renders nothing if there's no
 *  methodology entry for this paperCode/sectionKey — safe no-op everywhere else. */
export function MethodologyInfo({ paperCode, sectionKey }: { paperCode?: string | null; sectionKey: string }) {
  const [open, setOpen] = useState(false);
  const entry = getMethodology(paperCode, sectionKey);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!entry) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:text-blue-800 transition-colors"
        title="Cómo se calcula este análisis"
      >
        <Info className="w-3.5 h-3.5" />
        Cómo se calcula
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="methodology-modal-title"
            onClick={e => e.stopPropagation()}
            className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[80vh] overflow-y-auto"
          >
            <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl">
              <h3 id="methodology-modal-title" className="text-sm font-semibold text-gray-800">
                {entry.title}
              </h3>
              <button
                onClick={() => setOpen(false)}
                className="p-1 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors shrink-0"
                title="Cerrar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <p className="text-xs text-gray-600 leading-relaxed">{entry.intro}</p>
              <ul className="space-y-2">
                {entry.points.map((p, i) => (
                  <li key={i} className="flex gap-2 text-xs text-gray-700 leading-relaxed">
                    <span className="text-blue-400 shrink-0">•</span>
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
