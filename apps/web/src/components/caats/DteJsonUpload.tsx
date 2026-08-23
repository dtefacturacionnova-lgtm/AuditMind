'use client';

// ─── Bloque de subida para motores CAATs que reciben JSON crudo (hoy solo
// dte_validation) en vez de CSV/Excel con mapeo de columnas — la estructura
// del documento la define una fuente externa (Hacienda), no el auditor, así
// que no hay nada que mapear. Acepta uno o varios archivos .json; cada uno
// puede ser un DTE individual o un arreglo de DTEs (export por lote) — se
// aplanan a una sola lista de registros. Todo el parseo ocurre en el
// navegador (JSON.parse) — no hay endpoint de backend involucrado, a
// diferencia del flujo CSV/Excel que sí necesita pandas para detectar la
// fila de encabezado.

import { useState } from 'react';
import { Loader2, FileUp, X, CheckCircle2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FileSummary { name: string; count: number }

interface Props {
  onChange: (records: Record<string, unknown>[] | null) => void;
}

export function DteJsonUpload({ onChange }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [files, setFiles] = useState<FileSummary[]>([]);

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const fileList = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (fileList.length === 0) return;
    setLoading(true);
    setError('');
    try {
      const allRecords: Record<string, unknown>[] = [];
      const summaries: FileSummary[] = [];
      for (const file of fileList) {
        const text = await file.text();
        let raw: unknown;
        try {
          raw = JSON.parse(text);
        } catch {
          throw new Error(`"${file.name}" no es un JSON válido`);
        }
        const items = Array.isArray(raw) ? raw : [raw];
        const valid = items.filter((it): it is Record<string, unknown> => !!it && typeof it === 'object');
        if (valid.length === 0) throw new Error(`"${file.name}" no contiene ningún documento DTE reconocible`);
        allRecords.push(...valid);
        summaries.push({ name: file.name, count: valid.length });
      }
      setFiles(summaries);
      onChange(allRecords);
    } catch (err) {
      setFiles([]);
      onChange(null);
      setError(err instanceof Error ? err.message : 'No se pudieron leer los archivos');
    } finally {
      setLoading(false);
    }
  }

  function clear() {
    setFiles([]);
    setError('');
    onChange(null);
  }

  const totalDocs = files.reduce((sum, f) => sum + f.count, 0);

  return (
    <div className="space-y-2">
      {files.length === 0 ? (
        <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-gray-200 rounded-xl py-6 cursor-pointer hover:border-[#0F2D4A]/40 hover:bg-gray-50 transition-colors">
          <input type="file" accept=".json" multiple className="hidden" onChange={handleFiles} disabled={loading} />
          {loading ? (
            <>
              <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
              <span className="text-xs text-gray-500">Leyendo documentos…</span>
            </>
          ) : (
            <>
              <FileUp className="w-5 h-5 text-gray-300" />
              <span className="text-xs font-medium text-gray-600">Haz clic para subir uno o más DTE (.json)</span>
              <span className="text-[11px] text-gray-400">Un documento por archivo, o un archivo con un arreglo de varios</span>
            </>
          )}
        </label>
      ) : (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-3 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
            <div className="flex items-center gap-2 text-xs text-emerald-700">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span><strong>{totalDocs}</strong> documento(s) DTE en {files.length} archivo(s)</span>
            </div>
            <button onClick={clear} className="text-emerald-600 hover:text-emerald-800 shrink-0" title="Quitar archivos">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {files.map((f, i) => (
              <span key={i} className={cn('text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600')} title={f.name}>
                {f.name} ({f.count})
              </span>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-600">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          {error}
        </div>
      )}
    </div>
  );
}
