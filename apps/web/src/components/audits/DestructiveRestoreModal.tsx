'use client';

import { useEffect, useState } from 'react';
import { X, Upload, Loader2, AlertTriangle, ShieldAlert, CheckCircle2 } from 'lucide-react';
import {
  usePreviewRestoreDestructivo, useRestoreDestructivo,
  type RestoreDestructivePreview, type RestoreDestructivoResultado,
} from '@/hooks/useAudits';

/**
 * BKP-12 — restaurar un backup SOBRE este encargo, sobrescribiendo su
 * contenido actual. Flujo en dos pasos, a propósito más lento que
 * `RestoreBackupModal` (restaurar como nuevo): (1) subir el .zip y
 * previsualizar qué cambiaría antes de tocar nada, (2) escribir el título
 * exacto del encargo para confirmar. Nunca se ejecuta con un solo clic.
 */
export function DestructiveRestoreModal({
  auditId, auditTitle, onClose,
}: { auditId: string; auditTitle: string; onClose: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<RestoreDestructivePreview | null>(null);
  const [confirmarTitulo, setConfirmarTitulo] = useState('');
  const [resultado, setResultado] = useState<RestoreDestructivoResultado | null>(null);
  const previewMut = usePreviewRestoreDestructivo(auditId);
  const restoreMut = useRestoreDestructivo(auditId);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function handleFileChange(f: File | null) {
    setFile(f);
    setPreview(null);
    setConfirmarTitulo('');
    previewMut.reset();
    restoreMut.reset();
  }

  async function handlePrevisualizar() {
    if (!file) return;
    try {
      const res = await previewMut.mutateAsync(file);
      setPreview(res);
    } catch {
      // el error queda en previewMut.error
    }
  }

  async function handleConfirmar() {
    if (!file) return;
    try {
      const res = await restoreMut.mutateAsync({ file, confirmarTitulo });
      setResultado(res);
    } catch {
      // el error queda en restoreMut.error
    }
  }

  // Solo los modelos donde el conteo CAMBIA — eso es exactamente "qué se pierde/gana".
  const diferencias = preview
    ? Object.keys({ ...preview.conteoActual, ...preview.backup.conteoPorModelo })
        .filter(m => (preview.conteoActual[m] ?? 0) !== (preview.backup.conteoPorModelo[m] ?? 0))
        .sort()
    : [];

  const tituloCoincide = confirmarTitulo.trim() === auditTitle;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={onClose}>
      <div
        role="dialog" aria-modal="true" aria-labelledby="destructive-restore-title"
        onClick={e => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[85vh] overflow-y-auto border-2 border-red-200"
      >
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-red-100 sticky top-0 bg-white rounded-t-2xl">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-red-600" />
            <h3 id="destructive-restore-title" className="text-sm font-semibold text-gray-800">
              Restaurar backup sobre este encargo
            </h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors shrink-0" title="Cerrar">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {resultado ? (
            <div className="space-y-3">
              <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <div className="text-xs text-emerald-800 space-y-1">
                  <p className="font-semibold">Encargo restaurado</p>
                  <p>{resultado.totalFilasCreadas} filas, {resultado.totalArchivosSubidos} archivos.</p>
                </div>
              </div>
              {resultado.advertencias.length > 0 && (
                <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="text-xs text-amber-800 space-y-1">
                    <p className="font-semibold">{resultado.advertencias.length} advertencia(s)</p>
                    <ul className="space-y-0.5 max-h-32 overflow-y-auto">
                      {resultado.advertencias.slice(0, 10).map((a, i) => <li key={i} className="leading-snug">· {a.mensaje}</li>)}
                    </ul>
                  </div>
                </div>
              )}
              <button
                onClick={onClose}
                className="w-full rounded-xl bg-[#0F2D4A] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#1a4a7a] transition-colors"
              >
                Cerrar y ver el encargo actualizado
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5">
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <p className="text-xs text-red-700 leading-relaxed">
                  Esto <strong>borra el contenido actual</strong> de &quot;{auditTitle}&quot; y lo
                  reemplaza por el del backup. Todo lo hecho después de generar ese backup se pierde.
                  No se puede deshacer.
                </p>
              </div>

              {!preview ? (
                <>
                  <div>
                    <label
                      htmlFor="destructive-restore-file"
                      className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 text-center cursor-pointer transition-colors ${
                        file ? 'border-red-300 bg-red-50/50' : 'border-gray-200 hover:border-gray-300 bg-gray-50'
                      }`}
                    >
                      <Upload className={`w-5 h-5 ${file ? 'text-red-600' : 'text-gray-400'}`} />
                      <span className="text-xs font-medium text-gray-600">{file ? file.name : 'Seleccionar archivo .zip'}</span>
                      {file && <span className="text-[11px] text-gray-400">{(file.size / (1024 * 1024)).toFixed(2)} MB</span>}
                    </label>
                    <input
                      id="destructive-restore-file" type="file" accept=".zip" className="sr-only"
                      onChange={e => handleFileChange(e.target.files?.[0] ?? null)}
                    />
                  </div>

                  {previewMut.isError && (
                    <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5">
                      <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                      <p className="text-xs text-red-700">{(previewMut.error as Error).message || 'Error al previsualizar'}</p>
                    </div>
                  )}

                  <button
                    onClick={handlePrevisualizar}
                    disabled={!file || previewMut.isPending}
                    className="flex items-center justify-center gap-1.5 w-full rounded-xl bg-gray-100 border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    {previewMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    {previewMut.isPending ? 'Comparando…' : 'Previsualizar qué cambiaría'}
                  </button>
                </>
              ) : (
                <>
                  <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 text-xs text-gray-600 space-y-1">
                    <p><span className="font-medium text-gray-700">Backup generado:</span> {new Date(preview.backup.generadoEn).toLocaleString('es-SV')}</p>
                    <p><span className="font-medium text-gray-700">Título en el backup:</span> {preview.backup.auditTitulo}</p>
                  </div>

                  {diferencias.length === 0 ? (
                    <p className="text-xs text-gray-500 italic">Sin diferencias en el conteo de filas — el backup coincide con el estado actual.</p>
                  ) : (
                    <div className="rounded-xl border border-gray-200 overflow-hidden">
                      <table className="w-full text-xs">
                        <thead className="bg-gray-50 text-gray-500">
                          <tr>
                            <th className="text-left px-3 py-1.5 font-medium">Modelo</th>
                            <th className="text-right px-3 py-1.5 font-medium">Actual</th>
                            <th className="text-right px-3 py-1.5 font-medium">Backup</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {diferencias.map(m => (
                            <tr key={m}>
                              <td className="px-3 py-1.5 text-gray-700">{m}</td>
                              <td className="px-3 py-1.5 text-right font-mono text-gray-600">{preview.conteoActual[m] ?? 0}</td>
                              <td className="px-3 py-1.5 text-right font-mono text-gray-600">{preview.backup.conteoPorModelo[m] ?? 0}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  <div>
                    <label htmlFor="confirmar-titulo" className="block text-xs font-medium text-gray-600 mb-1">
                      Escribe el título exacto para confirmar: <span className="font-mono text-gray-800">{auditTitle}</span>
                    </label>
                    <input
                      id="confirmar-titulo" type="text" value={confirmarTitulo}
                      onChange={e => setConfirmarTitulo(e.target.value)}
                      placeholder={auditTitle}
                      className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm placeholder:text-gray-300 focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-100"
                    />
                  </div>

                  {restoreMut.isError && (
                    <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5">
                      <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                      <p className="text-xs text-red-700">{(restoreMut.error as Error).message || 'Error al restaurar'}</p>
                    </div>
                  )}

                  <button
                    onClick={handleConfirmar}
                    disabled={!tituloCoincide || restoreMut.isPending}
                    className="flex items-center justify-center gap-1.5 w-full rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    {restoreMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldAlert className="h-4 w-4" />}
                    {restoreMut.isPending ? 'Restaurando…' : 'Sobrescribir este encargo'}
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
