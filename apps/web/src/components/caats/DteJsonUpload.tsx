'use client';

// ─── Bloque de subida para motores CAATs que reciben JSON crudo (hoy solo
// dte_validation) en vez de CSV/Excel con mapeo de columnas — la estructura
// del documento la define una fuente externa (Hacienda), no el auditor, así
// que no hay nada que mapear. Acepta archivos .json sueltos o una CARPETA
// completa (solo toma los .json, el resto se ignora); cada archivo puede ser un
// DTE individual o un arreglo de DTEs (export por lote). Reconoce las dos
// versiones del documento (V1 y V2.0) y las descargas del portal del MH, y
// repara defectos de formato conocidos (BOM, Latin-1…) informando cada uno.
// Todo el parseo ocurre en el navegador — no hay endpoint de backend
// involucrado, a diferencia del flujo CSV/Excel que sí necesita pandas para
// detectar la fila de encabezado. La lógica vive en `lib/dte-import.ts`.

import { useState } from 'react';
import { Loader2, FileUp, FolderUp, X, CheckCircle2, AlertCircle, Wrench } from 'lucide-react';
import { cn } from '@/lib/utils';
import { parseDteFile, summarizeImport, type DteFileResult, type DteImportSummary } from '@/lib/dte-import';

interface Props {
  onChange: (records: Record<string, unknown>[] | null) => void;
}

const MAX_CHIPS = 12;
const MAX_DETAIL = 20;

const isJsonFile = (f: File) => f.name.toLowerCase().endsWith('.json');

export function DteJsonUpload({ onChange }: Props) {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [summary, setSummary] = useState<DteImportSummary | null>(null);
  const [ignoredNonJson, setIgnoredNonJson] = useState(0);

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (picked.length === 0) return;
    const jsonFiles = picked.filter(isJsonFile);
    setLoading(true);
    setError('');
    setSummary(null);
    setIgnoredNonJson(picked.length - jsonFiles.length);
    try {
      if (jsonFiles.length === 0) throw new Error('No hay ningún archivo .json en la selección');
      const results: DteFileResult[] = [];
      for (let i = 0; i < jsonFiles.length; i++) {
        const file = jsonFiles[i];
        results.push(parseDteFile(file.name, new Uint8Array(await file.arrayBuffer())));
        if (jsonFiles.length > 20 && i % 25 === 0) setProgress(`${i + 1} de ${jsonFiles.length}`);
      }
      const result = summarizeImport(results);
      if (result.totals.documents === 0) {
        const why = result.skipped.slice(0, 3).map((s) => `"${s.name}" ${s.skipped}`).join('; ');
        throw new Error(`No se encontró ningún documento DTE${why ? ` — ${why}` : ''}`);
      }
      setSummary(result);
      onChange(result.records);
    } catch (err) {
      setSummary(null);
      onChange(null);
      setError(err instanceof Error ? err.message : 'No se pudieron leer los archivos');
    } finally {
      setLoading(false);
      setProgress('');
    }
  }

  function clear() {
    setSummary(null);
    setIgnoredNonJson(0);
    setError('');
    onChange(null);
  }

  const picker = 'flex-1 flex flex-col items-center justify-center gap-1.5 border-2 border-dashed border-gray-200 rounded-xl py-5 cursor-pointer hover:border-[#0F2D4A]/40 hover:bg-gray-50 transition-colors';

  return (
    <div className="space-y-2">
      {!summary ? (
        loading ? (
          <div className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-gray-200 rounded-xl py-6">
            <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
            <span className="text-xs text-gray-500">Leyendo documentos…{progress && ` (${progress})`}</span>
          </div>
        ) : (
          <div className="space-y-1.5">
            <div className="flex flex-col sm:flex-row gap-2">
              <label className={picker}>
                <input type="file" accept=".json,application/json" multiple className="hidden" onChange={handleFiles} />
                <FileUp className="w-5 h-5 text-gray-300" />
                <span className="text-xs font-medium text-gray-600">Subir archivos (.json)</span>
                <span className="text-[11px] text-gray-400">Uno o varios, de la versión 1 o 2.0</span>
              </label>
              <label className={picker}>
                <input
                  type="file"
                  multiple
                  className="hidden"
                  onChange={handleFiles}
                  {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
                />
                <FolderUp className="w-5 h-5 text-gray-300" />
                <span className="text-xs font-medium text-gray-600">Subir carpeta</span>
                <span className="text-[11px] text-gray-400">Lee todos los .json y deja el resto</span>
              </label>
            </div>
            <p className="text-[11px] text-gray-400">
              Un documento por archivo, o un archivo con un arreglo de varios. También sirven las descargas del portal de Hacienda.
            </p>
          </div>
        )
      ) : (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-3 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-emerald-700">
              <span className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span><strong>{summary.totals.documents}</strong> documento(s) DTE en {summary.files.length} archivo(s)</span>
              </span>
              <span className="flex items-center gap-1.5">
                <VersionPill label="V2.0" count={summary.totals.v2} tone="blue" />
                <VersionPill label="V1" count={summary.totals.v1} tone="slate" />
              </span>
            </div>
            <button onClick={clear} className="text-emerald-600 hover:text-emerald-800 shrink-0" title="Quitar archivos">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {summary.files.slice(0, MAX_CHIPS).map((f, i) => (
              <span key={i} className={cn('text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600')} title={`${f.name} — V2.0: ${f.v2}, V1: ${f.v1}`}>
                {f.name} ({f.records.length}){f.v1 > 0 && f.v2 === 0 ? ' · V1' : f.v1 > 0 ? ' · V1+V2.0' : ''}
              </span>
            ))}
            {summary.files.length > MAX_CHIPS && (
              <span className="text-[10px] px-2 py-0.5 text-gray-400">+{summary.files.length - MAX_CHIPS} archivo(s) más</span>
            )}
          </div>

          {summary.repaired.length > 0 && (
            <details className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
              <summary className="cursor-pointer flex items-center gap-2">
                <Wrench className="w-3.5 h-3.5 shrink-0" />
                {summary.repaired.length} archivo(s) tenían defectos de formato y se corrigieron al leerlos
              </summary>
              <ul className="mt-1.5 space-y-0.5 list-disc pl-5">
                {summary.repaired.slice(0, MAX_DETAIL).map((f, i) => (
                  <li key={i}><span className="font-medium">{f.name}</span>: {f.repairs.join('; ')}</li>
                ))}
                {summary.repaired.length > MAX_DETAIL && <li>y {summary.repaired.length - MAX_DETAIL} más</li>}
              </ul>
            </details>
          )}

          {(summary.skipped.length > 0 || summary.totals.omittedItems > 0 || ignoredNonJson > 0) && (
            <details className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-600">
              <summary className="cursor-pointer">
                No se enviaron al análisis:
                {summary.skipped.length > 0 && ` ${summary.skipped.length} archivo(s) omitido(s)`}
                {summary.totals.omittedItems > 0 && ` · ${summary.totals.omittedItems} elemento(s) que no son un DTE`}
                {ignoredNonJson > 0 && ` · ${ignoredNonJson} archivo(s) que no son .json`}
              </summary>
              <ul className="mt-1.5 space-y-0.5 list-disc pl-5">
                {summary.skipped.slice(0, MAX_DETAIL).map((f, i) => (
                  <li key={i}><span className="font-medium">{f.name}</span>: {f.skipped}</li>
                ))}
                {summary.skipped.length > MAX_DETAIL && <li>y {summary.skipped.length - MAX_DETAIL} más</li>}
              </ul>
            </details>
          )}
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

function VersionPill({ label, count, tone }: { label: string; count: number; tone: 'blue' | 'slate' }) {
  return (
    <span className={cn(
      'text-[10px] font-medium px-2 py-0.5 rounded-full',
      count === 0 ? 'bg-gray-100 text-gray-400' : tone === 'blue' ? 'bg-blue-100 text-blue-700' : 'bg-slate-200 text-slate-700',
    )}>
      {label}: {count}
    </span>
  );
}
