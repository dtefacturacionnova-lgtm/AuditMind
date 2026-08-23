'use client';

// ─── Bloque de subida para el SEGUNDO dataset que algunos motores CAATs ──────
// necesitan (hoy solo related_parties: transacciones + registro de partes
// relacionadas). Mismo mecanismo de parseo/mapeo que el dataset principal,
// pero autocontenido — el padre solo recibe {rows, fieldMapping} vía onChange
// cuando el archivo está listo, o null si se limpia/falla.

import { useState } from 'react';
import { Loader2, FileUp, X, CheckCircle2, AlertCircle, ListChecks } from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiClient } from '@/lib/api-client';
import { type FieldDef, type ParsedFile, autoMatchColumn } from '@/lib/caats-fields';

export interface SecondaryDatasetValue {
  rows:         Record<string, unknown>[];
  fieldMapping: Record<string, string>;
}

interface Props {
  label:     string;
  fieldDefs: FieldDef[];
  onChange:  (value: SecondaryDatasetValue | null) => void;
}

export function SecondaryDatasetUpload({ label, fieldDefs, onChange }: Props) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [parsed, setParsed] = useState<ParsedFile | null>(null);
  const [fieldMapping, setFieldMapping] = useState<Record<string, string>>({});

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const data = await apiClient.postForm<ParsedFile>('/ai/parse-file', fd);
      const mapping: Record<string, string> = {};
      fieldDefs.forEach(d => { mapping[d.key] = autoMatchColumn(d.key, data.columns); });
      setParsed(data);
      setFieldMapping(mapping);
      onChange({ rows: data.rows, fieldMapping: mapping });
    } catch (err) {
      setParsed(null);
      setError(err instanceof Error ? err.message : 'No se pudo leer el archivo');
      onChange(null);
    } finally {
      setUploading(false);
    }
  }

  function updateMapping(key: string, col: string) {
    const next = { ...fieldMapping, [key]: col };
    setFieldMapping(next);
    if (parsed) onChange({ rows: parsed.rows, fieldMapping: next });
  }

  function clear() {
    setParsed(null);
    setFieldMapping({});
    setError('');
    onChange(null);
  }

  const missingRequired = fieldDefs.some(d => d.required && !fieldMapping[d.key]);

  return (
    <div className="border border-dashed border-gray-200 rounded-xl p-3 space-y-2.5 bg-gray-50/50">
      <p className="text-xs font-semibold text-gray-700">{label}</p>

      {!parsed ? (
        <label className="flex flex-col items-center justify-center gap-1.5 border border-dashed border-gray-300 rounded-lg py-4 cursor-pointer hover:border-[#0F2D4A]/40 hover:bg-white transition-colors">
          <input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleFileChange} disabled={uploading} />
          {uploading ? (
            <>
              <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />
              <span className="text-[11px] text-gray-500">Leyendo archivo…</span>
            </>
          ) : (
            <>
              <FileUp className="w-4 h-4 text-gray-300" />
              <span className="text-xs font-medium text-gray-600">Haz clic para subir CSV o Excel</span>
            </>
          )}
        </label>
      ) : (
        <div className="flex items-center justify-between gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1.5">
          <div className="flex items-center gap-1.5 text-[11px] text-emerald-700 min-w-0">
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate"><strong>{parsed.filename}</strong> — {parsed.rowCount} filas</span>
          </div>
          <button onClick={clear} className="text-emerald-600 hover:text-emerald-800 shrink-0" title="Quitar archivo">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-1.5 bg-red-50 border border-red-200 rounded-lg px-2.5 py-1.5 text-[11px] text-red-600">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {parsed && (
        <div className="pt-1 space-y-1.5">
          <p className="text-[11px] font-semibold text-gray-500 flex items-center gap-1">
            <ListChecks className="w-3 h-3" /> Mapeo de columnas
          </p>
          {fieldDefs.map(field => (
            <div key={field.key} className="flex items-center gap-2">
              <label className="text-[11px] text-gray-600 w-36 shrink-0 truncate" title={field.label}>
                {field.label} {field.required && <span className="text-red-500">*</span>}
              </label>
              <select
                value={fieldMapping[field.key] ?? ''}
                onChange={e => updateMapping(field.key, e.target.value)}
                className={cn(
                  'flex-1 rounded-lg border px-2 py-1 text-[11px] focus:outline-none focus:ring-2 focus:ring-blue-500',
                  field.required && !fieldMapping[field.key] ? 'border-red-200' : 'border-gray-200',
                )}
              >
                <option value="">— no usar —</option>
                {parsed.columns.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          ))}
          {missingRequired && (
            <p className="text-[10px] text-red-500">Completa los campos requeridos (*) de este dataset.</p>
          )}
        </div>
      )}
    </div>
  );
}
