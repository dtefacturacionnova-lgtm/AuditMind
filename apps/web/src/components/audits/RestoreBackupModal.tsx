'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { X, Upload, Loader2, CheckCircle2, AlertTriangle, FileArchive } from 'lucide-react';
import { useRestoreBackup, type RestoreBackupResultado } from '@/hooks/useAudits';

/**
 * BKP-09 — subir un ZIP de backup (BKP-05/06) y restaurarlo SIEMPRE como
 * encargo nuevo (BKP-07/08). Nunca sobrescribe nada existente — no hay modo
 * destructivo aquí (BKP-12/13, sin construir).
 */
export function RestoreBackupModal({ onClose }: { onClose: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [titulo, setTitulo] = useState('');
  const [resultado, setResultado] = useState<RestoreBackupResultado | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const restore = useRestoreBackup();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function handleFileChange(f: File | null) {
    setFile(f);
    restore.reset();
    setResultado(null);
  }

  async function handleRestaurar() {
    if (!file) return;
    try {
      const res = await restore.mutateAsync({ file, titulo });
      setResultado(res);
    } catch {
      // el error queda en restore.error, se muestra abajo
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="restore-backup-title"
        onClick={e => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-xl max-w-md w-full max-h-[85vh] overflow-y-auto"
      >
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl">
          <div className="flex items-center gap-2">
            <FileArchive className="w-4 h-4 text-emerald-600" />
            <h3 id="restore-backup-title" className="text-sm font-semibold text-gray-800">
              Restaurar backup
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors shrink-0"
            title="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {resultado ? (
            <div className="space-y-3">
              <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <div className="text-xs text-emerald-800 space-y-1">
                  <p className="font-semibold">Encargo restaurado como nuevo</p>
                  <p>{resultado.totalFilasCreadas} filas, {resultado.totalArchivosSubidos} archivos.</p>
                </div>
              </div>

              {resultado.advertencias.length > 0 && (
                <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="text-xs text-amber-800 space-y-1">
                    <p className="font-semibold">{resultado.advertencias.length} advertencia(s)</p>
                    <ul className="space-y-0.5 max-h-32 overflow-y-auto">
                      {resultado.advertencias.slice(0, 10).map((a, i) => (
                        <li key={i} className="leading-snug">· {a.mensaje}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              <Link
                href={`/dashboard/audits/${resultado.audit.id}`}
                className="flex items-center justify-center gap-1.5 w-full rounded-xl bg-[#0F2D4A] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#1a4a7a] transition-colors"
              >
                Abrir &quot;{resultado.audit.title}&quot;
              </Link>
            </div>
          ) : (
            <>
              <p className="text-xs text-gray-500 leading-relaxed">
                Sube el archivo <code className="bg-gray-100 px-1 py-0.5 rounded">.zip</code> generado
                por el botón &quot;Backup&quot; de un encargo. Siempre se crea un{' '}
                <strong>encargo nuevo</strong> — nunca sobrescribe uno existente.
              </p>

              <div>
                <label
                  htmlFor="restore-backup-file"
                  className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 text-center cursor-pointer transition-colors ${
                    file ? 'border-emerald-300 bg-emerald-50' : 'border-gray-200 hover:border-gray-300 bg-gray-50'
                  }`}
                >
                  <Upload className={`w-5 h-5 ${file ? 'text-emerald-600' : 'text-gray-400'}`} />
                  <span className="text-xs font-medium text-gray-600">
                    {file ? file.name : 'Seleccionar archivo .zip'}
                  </span>
                  {file && (
                    <span className="text-[11px] text-gray-400">
                      {(file.size / (1024 * 1024)).toFixed(2)} MB
                    </span>
                  )}
                </label>
                <input
                  id="restore-backup-file"
                  ref={inputRef}
                  type="file"
                  accept=".zip"
                  className="sr-only"
                  onChange={e => handleFileChange(e.target.files?.[0] ?? null)}
                />
              </div>

              <div>
                <label htmlFor="restore-backup-titulo" className="block text-xs font-medium text-gray-600 mb-1">
                  Título del encargo nuevo (opcional)
                </label>
                <input
                  id="restore-backup-titulo"
                  type="text"
                  value={titulo}
                  onChange={e => setTitulo(e.target.value)}
                  placeholder="Por defecto: título original + '(restaurado)'"
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
              </div>

              {restore.isError && (
                <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5">
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-red-700">{(restore.error as Error).message || 'Error al restaurar el backup'}</p>
                </div>
              )}

              <button
                onClick={handleRestaurar}
                disabled={!file || restore.isPending}
                className="flex items-center justify-center gap-1.5 w-full rounded-xl bg-[#0F2D4A] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#1a4a7a] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {restore.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {restore.isPending ? 'Restaurando…' : 'Restaurar como encargo nuevo'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
