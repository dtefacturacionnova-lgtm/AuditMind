'use client';

import { useEffect, useState } from 'react';
import { X, Trash2, Loader2, AlertTriangle, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  useDeleteAuditPreview, useDeleteAudit,
  type DeleteAuditPreview, type DeleteAuditResultado,
} from '@/hooks/useAudits';

/**
 * Borrado COMPLETO de un encargo (2026-08-20) — a diferencia de
 * `DestructiveRestoreModal` (que sobrescribe pero conserva el encargo),
 * esto lo borra por completo: filas y archivos. Mismo flujo en dos pasos
 * que el resto de "zona de riesgo": (1) previsualizar cuánto se perdería,
 * (2) escribir el título exacto para confirmar. Nunca un solo clic.
 */
export function DeleteAuditModal({
  auditId, auditTitle, onClose,
}: { auditId: string; auditTitle: string; onClose: () => void }) {
  const [preview, setPreview] = useState<DeleteAuditPreview | null>(null);
  const [confirmarTitulo, setConfirmarTitulo] = useState('');
  const [resultado, setResultado] = useState<DeleteAuditResultado | null>(null);
  const previewMut = useDeleteAuditPreview(auditId);
  const deleteMut = useDeleteAudit(auditId);
  const router = useRouter();

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    previewMut.mutate(undefined, { onSuccess: setPreview });
    // Solo al abrir el modal — no repetir en cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleConfirmar() {
    try {
      const res = await deleteMut.mutateAsync(confirmarTitulo);
      setResultado(res);
    } catch {
      // el error queda en deleteMut.error
    }
  }

  const tituloCoincide = confirmarTitulo.trim() === auditTitle;
  const conteoOrdenado = preview
    ? Object.entries(preview.conteoPorModelo).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1])
    : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={resultado ? undefined : onClose}>
      <div
        role="dialog" aria-modal="true" aria-labelledby="delete-audit-title"
        onClick={e => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[85vh] overflow-y-auto border-2 border-red-200"
      >
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-red-100 sticky top-0 bg-white rounded-t-2xl">
          <div className="flex items-center gap-2">
            <Trash2 className="w-4 h-4 text-red-600" />
            <h3 id="delete-audit-title" className="text-sm font-semibold text-gray-800">
              Borrar encargo por completo
            </h3>
          </div>
          {!resultado && (
            <button onClick={onClose} className="p-1 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors shrink-0" title="Cerrar">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="px-5 py-4 space-y-4">
          {resultado ? (
            <div className="space-y-3">
              <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <div className="text-xs text-emerald-800 space-y-1">
                  <p className="font-semibold">Encargo &quot;{resultado.auditTitulo}&quot; borrado</p>
                  <p>{resultado.totalFilasBorradas} filas, {resultado.archivosBorrados} archivo(s).</p>
                  {resultado.engagementesDesvinculados > 0 && (
                    <p>{resultado.engagementesDesvinculados} registro(s) de Cartera desvinculado(s) (se conservan, sin encargo).</p>
                  )}
                </div>
              </div>
              {(resultado.archivosConError > 0 || resultado.advertencias.length > 0) && (
                <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="text-xs text-amber-800 space-y-1">
                    {resultado.archivosConError > 0 && <p className="font-semibold">{resultado.archivosConError} archivo(s) no se pudieron borrar de Storage.</p>}
                    {resultado.advertencias.length > 0 && (
                      <ul className="space-y-0.5 max-h-32 overflow-y-auto">
                        {resultado.advertencias.slice(0, 10).map((a, i) => <li key={i} className="leading-snug">· {a.mensaje}</li>)}
                      </ul>
                    )}
                  </div>
                </div>
              )}
              <button
                onClick={() => router.push('/dashboard/audits')}
                className="w-full rounded-xl bg-[#0F2D4A] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#1a4a7a] transition-colors"
              >
                Volver a la lista de encargos
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5">
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <p className="text-xs text-red-700 leading-relaxed">
                  Esto <strong>borra por completo</strong> &quot;{auditTitle}&quot; — papeles, hallazgos, horas,
                  adjuntos, todo. No queda nada que restaurar. No se puede deshacer.
                </p>
              </div>

              {previewMut.isPending && (
                <div className="flex items-center justify-center gap-2 py-6 text-sm text-gray-400">
                  <Loader2 className="h-4 w-4 animate-spin" /> Calculando qué se perdería…
                </div>
              )}

              {previewMut.isError && (
                <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5">
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-red-700">{(previewMut.error as Error).message || 'Error al previsualizar'}</p>
                </div>
              )}

              {preview && (
                <>
                  <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 text-xs text-gray-600 space-y-1">
                    <p><span className="font-medium text-gray-700">Total de filas afectadas:</span> {preview.totalFilas}</p>
                    {preview.engagementVinculado > 0 && (
                      <p className="text-amber-700">Este encargo está vinculado a {preview.engagementVinculado} registro(s) de Cartera — se desvincularán (el cliente y su historial comercial se conservan).</p>
                    )}
                  </div>

                  {conteoOrdenado.length > 0 && (
                    <div className="rounded-xl border border-gray-200 overflow-hidden max-h-48 overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-gray-50 text-gray-500 sticky top-0">
                          <tr>
                            <th className="text-left px-3 py-1.5 font-medium">Modelo</th>
                            <th className="text-right px-3 py-1.5 font-medium">Filas</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {conteoOrdenado.map(([modelo, n]) => (
                            <tr key={modelo}>
                              <td className="px-3 py-1.5 text-gray-700">{modelo}</td>
                              <td className="px-3 py-1.5 text-right font-mono text-gray-600">{n}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  <div>
                    <label htmlFor="confirmar-titulo-borrar" className="block text-xs font-medium text-gray-600 mb-1">
                      Escribe el título exacto para confirmar: <span className="font-mono text-gray-800">{auditTitle}</span>
                    </label>
                    <input
                      id="confirmar-titulo-borrar" type="text" value={confirmarTitulo}
                      onChange={e => setConfirmarTitulo(e.target.value)}
                      placeholder={auditTitle}
                      className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm placeholder:text-gray-300 focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-100"
                    />
                  </div>

                  {deleteMut.isError && (
                    <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5">
                      <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                      <p className="text-xs text-red-700">{(deleteMut.error as Error).message || 'Error al borrar'}</p>
                    </div>
                  )}

                  <button
                    onClick={handleConfirmar}
                    disabled={!tituloCoincide || deleteMut.isPending}
                    className="flex items-center justify-center gap-1.5 w-full rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    {deleteMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldAlert className="h-4 w-4" />}
                    {deleteMut.isPending ? 'Borrando…' : 'Borrar este encargo por completo'}
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
