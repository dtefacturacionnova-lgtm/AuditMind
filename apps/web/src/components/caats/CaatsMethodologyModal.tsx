'use client';

import { useEffect } from 'react';
import { X, Target, FlaskConical, ScrollText, Table2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AREA_LABELS, AREA_COLORS } from '@/lib/caats-labels';
import { METHODOLOGY } from '@/lib/caats-methodology';
import type { AnalysisId } from '@/lib/caats-fields';

/**
 * Modal explicativo de un motor CAATs: objetivo, metodología, normativa, estructura
 * mínima del archivo, cada prueba interna que ejecuta y sus limitaciones. El contenido
 * vive en lib/caats-methodology.ts (una sola fuente para Analytics y para el papel).
 */
export function CaatsMethodologyModal({ analysisId, label, onClose }: { analysisId: AnalysisId; label: string; onClose: () => void }) {
  const info = METHODOLOGY[analysisId];
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  if (!info) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Metodología: ${label}`}
        className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="bg-gradient-to-r from-[#0F2D4A] to-[#1a4a7a] px-6 py-5 flex items-start justify-between gap-4 shrink-0">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-white/60">Metodología del análisis</p>
            <h3 className="text-xl font-bold text-white mt-0.5">{label}</h3>
            <div className="flex items-center gap-1.5 mt-2">
              <span className={cn('w-2 h-2 rounded-full', AREA_COLORS[info.area]?.dot ?? 'bg-white/60')} />
              <span className="text-[11px] font-semibold text-white/90">{AREA_LABELS[info.area] ?? info.area}</span>
            </div>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto px-6 py-5 space-y-5">
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide flex items-center gap-1.5 mb-1.5">
              <Target className="w-3.5 h-3.5" /> Objetivo
            </p>
            <p className="text-sm text-gray-700 leading-relaxed">{info.objetivo}</p>
          </div>

          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide flex items-center gap-1.5 mb-1.5">
              <FlaskConical className="w-3.5 h-3.5" /> Metodología
            </p>
            <p className="text-sm text-gray-700 leading-relaxed">{info.metodologia}</p>
          </div>

          {info.normativa && (
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wide flex items-center gap-1.5 mb-1.5">
                <ScrollText className="w-3.5 h-3.5" /> Marco normativo de referencia
              </p>
              <p className="text-sm text-gray-700 leading-relaxed">{info.normativa}</p>
            </div>
          )}

          <div className="bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-3">
            <p className="text-xs font-bold text-slate-600 uppercase tracking-wide flex items-center gap-1.5 mb-2">
              <Table2 className="w-3.5 h-3.5" /> Estructura mínima del archivo
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th className="font-semibold pb-1 pr-3">Campo</th>
                    <th className="font-semibold pb-1 pr-3">Obligatorio</th>
                    <th className="font-semibold pb-1">Tipo</th>
                  </tr>
                </thead>
                <tbody>
                  {info.estructuraMinima.campos.map((c, i) => (
                    <tr key={i} className="border-t border-slate-200/70">
                      <td className="py-1 pr-3 text-slate-700">{c.nombre}</td>
                      <td className="py-1 pr-3">
                        {c.requerido ? (
                          <span className="text-red-600 font-semibold">Sí</span>
                        ) : (
                          <span className="text-slate-400">No</span>
                        )}
                      </td>
                      <td className="py-1 text-slate-500">{c.tipo ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {info.estructuraMinima.minRegistros && (
              <p className="text-[11px] text-slate-500 mt-2">Mínimo {info.estructuraMinima.minRegistros} registros válidos.</p>
            )}
            {info.estructuraMinima.nota && (
              <p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed">{info.estructuraMinima.nota}</p>
            )}
            {info.estructuraMinima.datasetSecundario && (
              <div className="mt-3 pt-3 border-t border-slate-200">
                <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wide mb-1.5">
                  Segundo archivo: {info.estructuraMinima.datasetSecundario.label}
                </p>
                <table className="w-full text-xs">
                  <tbody>
                    {info.estructuraMinima.datasetSecundario.campos.map((c, i) => (
                      <tr key={i} className="border-t border-slate-200/70">
                        <td className="py-1 pr-3 text-slate-700">{c.nombre}</td>
                        <td className="py-1 pr-3">
                          {c.requerido ? (
                            <span className="text-red-600 font-semibold">Sí</span>
                          ) : (
                            <span className="text-slate-400">No</span>
                          )}
                        </td>
                        <td className="py-1 text-slate-500">{c.tipo ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Pruebas que aplica</p>
            <div className="space-y-2">
              {info.pruebas.map((p, i) => (
                <div key={i} className="bg-gray-50 rounded-lg px-3 py-2.5">
                  <p className="text-xs font-semibold text-gray-800">{p.nombre}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{p.descripcion}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg px-3.5 py-3">
            <p className="text-xs font-bold text-amber-700 uppercase tracking-wide mb-1">Limitaciones y buen uso</p>
            <p className="text-xs text-amber-700 leading-relaxed">{info.limitaciones}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
