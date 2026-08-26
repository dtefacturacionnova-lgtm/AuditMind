'use client';

import { useState } from 'react';
import {
  Loader2, UploadCloud, Sparkles, CheckCircle2, AlertTriangle, X, History,
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { AnalysisResultView } from '@/components/caats/CaatsResultView';
import {
  type AnalysisId, type ParsedFile, FIELD_DEFS, AUTO_RUN_ELIGIBLE_ENGINES, AUTO_RUN_ENGINE_LABELS,
  autoMatchColumn, autoDetectNumericColumns, buildCaatsRunPayload,
} from '@/lib/caats-fields';
import {
  useCaatsHistory, useClassifySpreadsheet, useCreateCaatsAutoRun, type SpreadsheetClassification,
} from '@/hooks/useCaatsAutoRun';

interface CaatsAutoRunPanelProps {
  auditId: string;
}

// Fase 2c — auto-detección + auto-ejecución de un motor CAATs a partir de una
// hoja de cálculo subida en el Investigador. El motor se ejecuta aquí mismo
// (POST /ai/analytics/:engine, sin cambios respecto al panel manual) — el
// backend solo clasifica y persiste, ver caats-auto-run.service.ts.
export function CaatsAutoRunPanel({ auditId }: CaatsAutoRunPanelProps) {
  const history = useCaatsHistory(auditId);
  const classify = useClassifySpreadsheet(auditId);
  const persist = useCreateCaatsAutoRun(auditId);

  const [descripcion, setDescripcion] = useState('');
  const [parsed, setParsed] = useState<ParsedFile | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');

  const [classification, setClassification] = useState<SpreadsheetClassification | null>(null);
  const [engine, setEngine] = useState<AnalysisId | ''>('');
  const [fieldMapping, setFieldMapping] = useState<Record<string, string>>({});
  const [benfordColumn, setBenfordColumn] = useState('');
  const [anomalyColumns, setAnomalyColumns] = useState<string[]>([]);

  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState('');
  const [result, setResult] = useState<Record<string, unknown> | null>(null);

  function aplicarAutoMapeo(id: AnalysisId, cols: string[], rows: Record<string, unknown>[]) {
    if (id === 'benford') {
      setBenfordColumn(autoMatchColumn('amount', cols));
    } else if (id === 'anomaly') {
      setAnomalyColumns(autoDetectNumericColumns(cols, rows));
    } else {
      const defs = FIELD_DEFS[id] ?? [];
      const mapping: Record<string, string> = {};
      defs.forEach(d => { mapping[d.key] = autoMatchColumn(d.key, cols); });
      setFieldMapping(mapping);
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    setUploadError('');
    setClassification(null);
    setEngine('');
    setResult(null);
    setRunError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const data = await apiClient.postForm<ParsedFile>('/ai/parse-file', fd);
      setParsed(data);
    } catch (err) {
      setParsed(null);
      setUploadError(err instanceof Error ? err.message : 'No se pudo leer el archivo');
    } finally {
      setUploading(false);
    }
  }

  async function handleClasificar() {
    if (!parsed) return;
    setResult(null);
    setRunError('');
    try {
      const clasificacion = await classify.mutateAsync({
        descripcion: descripcion.trim(),
        columns: parsed.columns,
        sampleRows: parsed.rows.slice(0, 5),
      });
      setClassification(clasificacion);
      if (clasificacion.engine !== 'ninguno' && (AUTO_RUN_ELIGIBLE_ENGINES as string[]).includes(clasificacion.engine)) {
        const id = clasificacion.engine as AnalysisId;
        setEngine(id);
        aplicarAutoMapeo(id, parsed.columns, parsed.rows);
      } else {
        setEngine('');
      }
    } catch {
      // classify.error ya queda disponible para renderizar el mensaje
    }
  }

  function handleCambiarEngine(id: AnalysisId | '') {
    setEngine(id);
    setResult(null);
    setRunError('');
    if (id && parsed) aplicarAutoMapeo(id, parsed.columns, parsed.rows);
  }

  async function handleEjecutar() {
    if (!engine || !parsed) return;
    setRunning(true);
    setRunError('');
    setResult(null);
    try {
      const { payload, savedMapping } = buildCaatsRunPayload({
        engine, rows: parsed.rows, fieldMapping, benfordColumn, anomalyColumns,
      });
      const data = await apiClient.post<Record<string, unknown>>(`/ai/analytics/${engine}`, payload);
      setResult(data);
      await persist.mutateAsync({
        engine,
        descripcion: descripcion.trim(),
        fileName: parsed.filename,
        fieldMapping: savedMapping,
        result: data,
        confianzaDeteccion: classification?.confianza,
        justificacionDeteccion: classification?.justificacion,
      });
    } catch (err) {
      setRunError(err instanceof Error ? err.message : 'No se pudo ejecutar el análisis.');
    } finally {
      setRunning(false);
    }
  }

  const fieldDefs = engine && engine !== 'benford' && engine !== 'anomaly' ? (FIELD_DEFS[engine] ?? []) : [];

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
      <div>
        <h3 className="text-sm font-bold text-gray-800 flex items-center gap-1.5">
          <Sparkles className="w-4 h-4 text-violet-500" /> Análisis CAATs desde una hoja de cálculo
        </h3>
        <p className="text-xs text-gray-500 mt-0.5">
          Suba un Excel/CSV y describa de qué se trata — SHERLOCK detecta qué motor CAATs aplica, usted lo confirma
          (o lo corrige) y lo ejecuta con un clic.
        </p>
      </div>

      {(history.data?.length ?? 0) > 0 && (
        <div className="flex items-center gap-1.5 text-[11px] text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
          <History className="w-3.5 h-3.5 shrink-0" />
          Ya se han ejecutado {history.data!.length} análisis CAATs en este encargo
          ({history.data!.filter(h => h.source === 'manual').length} desde papeles de trabajo,
          {' '}{history.data!.filter(h => h.source === 'auto').length} desde el Investigador).
        </div>
      )}

      <textarea
        value={descripcion}
        onChange={(e) => setDescripcion(e.target.value)}
        rows={2}
        placeholder="Ej.: Detalle de asientos del libro mayor de agosto 2026, con usuario que registró cada asiento…"
        className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 outline-none focus:border-gray-400 resize-none"
      />

      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg px-3 py-1.5 cursor-pointer">
          {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UploadCloud className="w-3.5 h-3.5" />}
          {parsed ? parsed.filename : 'Subir archivo'}
          <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFileChange} disabled={uploading} />
        </label>
        {parsed && (
          <button onClick={() => { setParsed(null); setClassification(null); setEngine(''); setResult(null); }} className="text-gray-300 hover:text-red-600">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
        {parsed && (
          <button
            onClick={handleClasificar}
            disabled={classify.isPending}
            className="flex items-center gap-1.5 text-xs font-semibold text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-40 rounded-lg px-3 py-1.5"
          >
            {classify.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            Detectar tipo de análisis
          </button>
        )}
      </div>
      {uploadError && <p className="text-xs text-red-600">{uploadError}</p>}
      {classify.error && (
        <p className="text-xs text-red-600">{classify.error instanceof Error ? classify.error.message : 'No se pudo clasificar el archivo.'}</p>
      )}

      {classification && (
        <div className="rounded-xl border border-violet-200 bg-violet-50 p-3 space-y-2">
          {classification.engine !== 'ninguno' ? (
            <p className="text-xs text-violet-800">
              <span className="font-semibold">Detectado: {AUTO_RUN_ENGINE_LABELS[classification.engine] ?? classification.engine}</span>
              {' '}(confianza {Math.round(classification.confianza * 100)}%) — {classification.justificacion}
            </p>
          ) : (
            <p className="text-xs text-violet-800">
              <span className="font-semibold">Ningún motor auto-ejecutable aplica.</span> {classification.justificacion}
              {' '}Puede usar el panel CAATs manual de un papel de trabajo para este caso.
            </p>
          )}
          <div className="flex items-center gap-2">
            <label className="text-[11px] text-gray-600">Motor a usar:</label>
            <select
              value={engine}
              onChange={(e) => handleCambiarEngine(e.target.value as AnalysisId | '')}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1 outline-none"
            >
              <option value="">— Ninguno —</option>
              {AUTO_RUN_ELIGIBLE_ENGINES.map((id) => (
                <option key={id} value={id}>{AUTO_RUN_ENGINE_LABELS[id]}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {engine && parsed && (
        <div className="space-y-2">
          {engine === 'benford' && (
            <div className="flex items-center gap-2">
              <label className="text-[11px] text-gray-600">Columna de montos:</label>
              <select value={benfordColumn} onChange={(e) => setBenfordColumn(e.target.value)} className="text-xs border border-gray-200 rounded-lg px-2 py-1 outline-none">
                <option value="">— Seleccione —</option>
                {parsed.columns.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          )}
          {engine === 'anomaly' && (
            <div className="flex flex-wrap gap-1.5">
              {parsed.columns.map((c) => {
                const active = anomalyColumns.includes(c);
                return (
                  <button
                    key={c}
                    onClick={() => setAnomalyColumns(active ? anomalyColumns.filter(x => x !== c) : [...anomalyColumns, c])}
                    className={`text-[11px] px-2 py-1 rounded-lg border ${active ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-gray-600 border-gray-200'}`}
                  >
                    {c}
                  </button>
                );
              })}
            </div>
          )}
          {fieldDefs.length > 0 && (
            <div className="grid grid-cols-2 gap-2">
              {fieldDefs.map((d) => (
                <div key={d.key} className="flex items-center gap-1.5">
                  <label className="text-[11px] text-gray-600 shrink-0 w-32 truncate" title={d.label}>
                    {d.label}{d.required && <span className="text-red-500">*</span>}:
                  </label>
                  <select
                    value={fieldMapping[d.key] ?? ''}
                    onChange={(e) => setFieldMapping({ ...fieldMapping, [d.key]: e.target.value })}
                    className="text-[11px] border border-gray-200 rounded-lg px-2 py-1 outline-none flex-1 min-w-0"
                  >
                    <option value="">—</option>
                    {parsed.columns.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              ))}
            </div>
          )}

          <button
            onClick={handleEjecutar}
            disabled={running}
            className="flex items-center gap-1.5 text-xs font-semibold text-white bg-gray-900 hover:bg-gray-800 disabled:opacity-40 rounded-lg px-3 py-1.5"
          >
            {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
            Ejecutar análisis
          </button>
        </div>
      )}

      {runError && (
        <p className="flex items-center gap-1.5 text-xs text-red-600"><AlertTriangle className="w-3.5 h-3.5" /> {runError}</p>
      )}

      {result && (
        <div className="pt-2 border-t border-gray-100">
          <AnalysisResultView result={result} />
        </div>
      )}
    </div>
  );
}
