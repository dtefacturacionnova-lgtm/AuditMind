'use client';

import { useMemo, useState } from 'react';
import {
  Play, Loader2, AlertCircle, AlertTriangle, CheckCircle2, RotateCcw,
  Upload, FileUp, X, ListChecks, Database, FileSpreadsheet, TrendingUp,
  BarChart3, Cpu, ShieldAlert, Building2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiClient } from '@/lib/api-client';
import { AnalysisResultView } from '@/components/caats/CaatsResultView';
import {
  type AnalysisId, type ParsedFile, FIELD_DEFS,
  autoMatchColumn, autoDetectNumericColumns,
} from '@/lib/caats-fields';

// ─── Persisted shape (lo que vive en PaperSection.value) ─────────────────────
// El archivo subido NUNCA se persiste — solo el mapeo usado y el resultado
// calculado. Para volver a correr el análisis (ej. con datos actualizados)
// hay que resubir el archivo; el resultado guardado queda visible mientras tanto.

export interface CaatsAnalysisValue {
  engine:          AnalysisId | null;
  fileName?:       string;
  fieldMapping?:   Record<string, string>;
  benfordColumn?:  string;
  anomalyColumns?: string[];
  result?:         Record<string, unknown> | null;
  ranAt?:          string;
}

interface Props {
  paperId:    string;
  auditId?:   string;
  sectionKey: string;
  value:      CaatsAnalysisValue | null;
  onChange:   (value: CaatsAnalysisValue) => void;
  readOnly?:  boolean;
}

const ENGINES: { id: AnalysisId; label: string; icon: typeof Database; color: string }[] = [
  { id: 'gl',      label: 'Libro Mayor',        icon: Database,        color: 'bg-blue-500' },
  { id: 'ap',      label: 'Cuentas por Pagar',  icon: FileSpreadsheet, color: 'bg-indigo-500' },
  { id: 'payroll', label: 'Nómina',             icon: TrendingUp,      color: 'bg-green-500' },
  { id: 'benford', label: 'Ley de Benford',     icon: BarChart3,       color: 'bg-purple-500' },
  { id: 'anomaly', label: 'Anomalías (ML)',     icon: Cpu,             color: 'bg-red-500' },
  { id: 'sod',     label: 'Segregación de Funciones', icon: ShieldAlert, color: 'bg-amber-500' },
  { id: 'vendor_master', label: 'Maestro de Proveedores', icon: Building2, color: 'bg-teal-500' },
];

export function CaatsAnalysisPanel({ paperId, sectionKey, value, onChange, readOnly = false }: Props) {
  const [engine, setEngine] = useState<AnalysisId | null>(value?.engine ?? null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<Record<string, unknown> | null>(value?.result ?? null);

  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [parsed, setParsed] = useState<ParsedFile | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [showRowPicker, setShowRowPicker] = useState(false);
  const [fieldMapping, setFieldMapping] = useState<Record<string, string>>(value?.fieldMapping ?? {});
  const [benfordColumn, setBenfordColumn] = useState(value?.benfordColumn ?? '');
  const [anomalyColumns, setAnomalyColumns] = useState<string[]>(value?.anomalyColumns ?? []);

  const fieldDefs = engine ? FIELD_DEFS[engine] : undefined;
  const missingRequired = useMemo(() => {
    if (!fieldDefs) return false;
    return fieldDefs.some(d => d.required && !fieldMapping[d.key]);
  }, [fieldDefs, fieldMapping]);

  const canRun = !!engine && !!parsed && (
    engine === 'benford' ? !!benfordColumn
      : engine === 'anomaly' ? anomalyColumns.length > 0
        : !missingRequired
  );

  async function parseFile(file: File, headerRow?: number) {
    setUploading(true);
    setUploadError('');
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      if (headerRow !== undefined) fd.append('headerRow', String(headerRow));
      const data = await apiClient.postForm<ParsedFile>('/ai/parse-file', fd);
      setParsed(data);
      setShowRowPicker(false);
      if (engine === 'benford') {
        setBenfordColumn(autoMatchColumn('amount', data.columns));
      } else if (engine === 'anomaly') {
        setAnomalyColumns(autoDetectNumericColumns(data.columns, data.rows));
      } else if (engine) {
        const defs = FIELD_DEFS[engine] ?? [];
        const mapping: Record<string, string> = {};
        defs.forEach(d => { mapping[d.key] = autoMatchColumn(d.key, data.columns); });
        setFieldMapping(mapping);
      }
    } catch (err) {
      setParsed(null);
      setUploadError(err instanceof Error ? err.message : 'No se pudo leer el archivo');
    } finally {
      setUploading(false);
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadedFile(file);
    await parseFile(file);
  }

  function clearUpload() {
    setParsed(null);
    setUploadedFile(null);
    setShowRowPicker(false);
    setUploadError('');
    setFieldMapping({});
    setBenfordColumn('');
    setAnomalyColumns([]);
  }

  function selectEngine(id: AnalysisId) {
    setEngine(id);
    setResult(null);
    setError('');
    if (!parsed) return;
    if (id === 'benford') {
      setBenfordColumn(autoMatchColumn('amount', parsed.columns));
    } else if (id === 'anomaly') {
      setAnomalyColumns(autoDetectNumericColumns(parsed.columns, parsed.rows));
    } else {
      const defs = FIELD_DEFS[id] ?? [];
      const mapping: Record<string, string> = {};
      defs.forEach(d => { mapping[d.key] = autoMatchColumn(d.key, parsed.columns); });
      setFieldMapping(mapping);
    }
  }

  async function runAnalysis() {
    if (!engine || !parsed) return;
    setRunning(true);
    setResult(null);
    setError('');

    try {
      let payload: unknown;
      let savedMapping: Pick<CaatsAnalysisValue, 'fieldMapping' | 'benfordColumn' | 'anomalyColumns'> = {};

      if (engine === 'benford') {
        const amounts = parsed.rows
          .map(r => Number(String(r[benfordColumn] ?? '').replace(/[^0-9.-]/g, '')))
          .filter(n => Number.isFinite(n) && n !== 0);
        payload = { amounts };
        savedMapping = { benfordColumn };
      } else if (engine === 'anomaly') {
        payload = { records: parsed.rows, numeric_fields: anomalyColumns };
        savedMapping = { anomalyColumns };
      } else {
        const mapping: Record<string, string> = {};
        Object.entries(fieldMapping).forEach(([key, col]) => { if (col) mapping[key] = col; });
        payload = { records: parsed.rows, field_mapping: mapping };
        savedMapping = { fieldMapping: mapping };
      }

      const data = await apiClient.post<Record<string, unknown>>(`/ai/analytics/${engine}`, payload);
      setResult(data);
      onChange({
        engine,
        fileName: parsed.filename,
        result: data,
        ranAt: new Date().toISOString(),
        ...savedMapping,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setRunning(false);
    }
  }

  // ─── Solo lectura: muestra el último resultado guardado, sin controles ──────
  if (readOnly) {
    if (!result || !value?.engine) {
      return <p className="text-sm text-gray-400 italic">Sin análisis CAATs ejecutado en este papel.</p>;
    }
    const eng = ENGINES.find(e => e.id === value.engine);
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-xs text-gray-500">
          {eng && <eng.icon className="w-3.5 h-3.5" />}
          <span className="font-semibold text-gray-700">{eng?.label ?? value.engine}</span>
          {value.fileName && <span>— {value.fileName}</span>}
          {value.ranAt && <span>— {new Date(value.ranAt).toLocaleString('es-SV')}</span>}
        </div>
        <AnalysisResultView result={result} />
      </div>
    );
  }

  return (
    <div className="space-y-4" data-section-key={sectionKey} data-paper-id={paperId}>
      {/* Selector de motor */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
        {ENGINES.map(e => (
          <button
            key={e.id}
            type="button"
            onClick={() => selectEngine(e.id)}
            className={cn(
              'flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 text-center transition-all',
              engine === e.id
                ? 'border-[#0F2D4A] bg-[#0F2D4A]/5 shadow-sm'
                : 'border-gray-200 bg-white hover:border-gray-300',
            )}
          >
            <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', e.color)}>
              <e.icon className="w-4 h-4 text-white" />
            </div>
            <p className={cn('text-[11px] font-semibold leading-tight', engine === e.id ? 'text-[#0F2D4A]' : 'text-gray-600')}>
              {e.label}
            </p>
          </button>
        ))}
      </div>

      {engine && (
        <div className="space-y-3">
          {!parsed ? (
            <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-gray-200 rounded-xl py-6 cursor-pointer hover:border-[#0F2D4A]/40 hover:bg-gray-50 transition-colors">
              <input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleFileChange} disabled={uploading} />
              {uploading ? (
                <>
                  <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
                  <span className="text-xs text-gray-500">Leyendo archivo…</span>
                </>
              ) : (
                <>
                  <FileUp className="w-5 h-5 text-gray-300" />
                  <span className="text-xs font-medium text-gray-600">Haz clic para subir CSV o Excel</span>
                </>
              )}
            </label>
          ) : (
            <div className="flex items-center justify-between gap-3 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
              <div className="flex items-center gap-2 text-xs text-emerald-700">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>
                  <strong>{parsed.filename}</strong> — {parsed.rowCount} filas, {parsed.columns.length} columnas
                  {parsed.truncated && ` (de ${parsed.totalRows} totales)`}
                </span>
              </div>
              <button onClick={clearUpload} className="text-emerald-600 hover:text-emerald-800 shrink-0" title="Quitar archivo">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {parsed && (parsed.headerRowIndex > 0 || parsed.headerConfidence === 'low') && (
            <div className={cn(
              'rounded-lg px-3 py-2 text-xs space-y-2',
              parsed.headerConfidence === 'low'
                ? 'bg-amber-50 border border-amber-200 text-amber-800'
                : 'bg-blue-50 border border-blue-200 text-blue-800',
            )}>
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  {parsed.headerRowIndex > 0
                    ? `El archivo trae ${parsed.headerRowIndex} fila(s) antes de los encabezados — se usó la fila ${parsed.headerRowIndex + 1}.`
                    : 'No estamos completamente seguros de que la fila 1 sea el encabezado correcto.'}
                </span>
              </div>
              <button onClick={() => setShowRowPicker(s => !s)} className="flex items-center gap-1 font-semibold hover:underline">
                <RotateCcw className="w-3 h-3" />
                {showRowPicker ? 'Ocultar filas originales' : '¿No es correcto? Elegir la fila de encabezado'}
              </button>
              {showRowPicker && (
                <div className="overflow-x-auto bg-white border border-gray-200 rounded-lg">
                  <table className="w-full text-[11px]">
                    <tbody className="divide-y divide-gray-100">
                      {parsed.rawPreview.map((row, i) => (
                        <tr key={i} className={i === parsed.headerRowIndex ? 'bg-emerald-50' : undefined}>
                          <td className="px-2 py-1 text-gray-400 whitespace-nowrap">Fila {i + 1}</td>
                          <td className="px-2 py-1 text-gray-700 font-mono whitespace-nowrap">
                            {row.filter(Boolean).join(' | ') || <span className="text-gray-300">(vacía)</span>}
                          </td>
                          <td className="px-2 py-1 text-right">
                            <button
                              onClick={() => uploadedFile && parseFile(uploadedFile, i)}
                              disabled={uploading}
                              className="text-[#0F2D4A] font-semibold hover:underline disabled:opacity-40"
                            >
                              Usar esta fila
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {uploadError && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-600">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              {uploadError}
            </div>
          )}

          {parsed && (
            <div className="border-t border-gray-100 pt-3">
              <p className="text-xs font-semibold text-gray-700 flex items-center gap-1.5 mb-2">
                <ListChecks className="w-3.5 h-3.5" />
                Indica qué columna corresponde a cada campo
              </p>

              {engine === 'benford' ? (
                <div className="flex items-center gap-2">
                  <label className="text-xs text-gray-600 w-40 shrink-0">Columna de montos <span className="text-red-500">*</span></label>
                  <select
                    value={benfordColumn}
                    onChange={e => setBenfordColumn(e.target.value)}
                    className="flex-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">— selecciona —</option>
                    {parsed.columns.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              ) : engine === 'anomaly' ? (
                <div>
                  <p className="text-[11px] text-gray-400 mb-2">Columnas numéricas a evaluar (mínimo 1).</p>
                  <div className="flex flex-wrap gap-2">
                    {parsed.columns.map(c => {
                      const active = anomalyColumns.includes(c);
                      return (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setAnomalyColumns(prev => active ? prev.filter(x => x !== c) : [...prev, c])}
                          className={cn(
                            'px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
                            active ? 'bg-[#0F2D4A] text-white border-[#0F2D4A]' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300',
                          )}
                        >
                          {c}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="grid sm:grid-cols-2 gap-x-4 gap-y-2">
                  {(fieldDefs ?? []).map(field => (
                    <div key={field.key} className="flex items-center gap-2">
                      <label className="text-xs text-gray-600 w-40 shrink-0 truncate" title={field.label}>
                        {field.label} {field.required && <span className="text-red-500">*</span>}
                      </label>
                      <select
                        value={fieldMapping[field.key] ?? ''}
                        onChange={e => setFieldMapping(prev => ({ ...prev, [field.key]: e.target.value }))}
                        className={cn(
                          'flex-1 rounded-lg border px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500',
                          field.required && !fieldMapping[field.key] ? 'border-red-200' : 'border-gray-200',
                        )}
                      >
                        <option value="">— no usar —</option>
                        {parsed.columns.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end">
            <button
              onClick={runAnalysis}
              disabled={running || !canRun}
              title={!canRun ? 'Sube un archivo y completa el mapeo requerido' : undefined}
              className="flex items-center gap-2 px-4 py-2 bg-[#0F2D4A] text-white text-sm font-medium rounded-xl hover:bg-[#1a4a7a] disabled:opacity-60 transition-colors"
            >
              {running ? <><Loader2 className="w-4 h-4 animate-spin" /> Analizando…</> : <><Play className="w-4 h-4" /> Ejecutar análisis</>}
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-600">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {result && !running && (
        <div className="border-t border-gray-100 pt-4">
          <AnalysisResultView result={result} />
        </div>
      )}

      {!engine && (
        <p className="text-xs text-gray-400 italic">Selecciona un motor de análisis para comenzar.</p>
      )}
    </div>
  );
}
