'use client';

import { useState, useRef, useMemo } from 'react';
import * as XLSX from 'xlsx';
import {
  Upload, Play, Download, CheckCircle2, Loader2,
  AlertCircle, FileSpreadsheet, BarChart3, Info, X,
} from 'lucide-react';
import type { PaperSection } from '@/hooks/useWorkingPaperGraph';
import { useCalculateMUS, useCalculateAttribute, useSelectSample } from '@/hooks/useSampling';

// ─── Types ────────────────────────────────────────────────────────────────────

type Mode = 'MUS' | 'ATTRIBUTES';
type AttrMethod = 'RANDOM' | 'SYSTEMATIC';

type ParsedRow = Record<string, string | number>;

interface SamplingResultData {
  mode:               Mode;
  executed_at:        string;
  parameters:         Record<string, number | string>;
  sample_size:        number;
  total_items:        number;
  sampling_interval?: number;
  seed_used:          number | null;
  selected:           ParsedRow[];
}

interface Props {
  sections: PaperSection[];
  readonly: boolean;
  onSave:   (key: string, value: unknown) => void | Promise<void>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtCurrency(n: number) {
  return n.toLocaleString('es-SV', {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
}

function parseAmount(raw: string | number): number {
  if (typeof raw === 'number') return Math.abs(raw);
  return Math.abs(parseFloat(String(raw).replace(/[^0-9.-]/g, '')) || 0);
}

function detectCol(keys: string[], ...hints: string[]): string {
  const lower = keys.map(k => k.toLowerCase());
  for (const hint of hints) {
    const idx = lower.findIndex(l => l.includes(hint));
    if (idx >= 0) return keys[idx];
  }
  return '';
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SamplingExecutionPanel({ sections, readonly, onSave }: Props) {
  const me  = sections.find(s => s.sectionKey === 'S4')?.value != null
    ? Number(sections.find(s => s.sectionKey === 'S4')!.value)
    : null;

  const saved = sections.find(s => s.sectionKey === 'S_EJE')?.value as SamplingResultData | null | undefined;

  const [mode,    setMode]    = useState<Mode>('MUS');
  const [records, setRecords] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState('');

  const [refCol,  setRefCol]  = useState('');
  const [descCol, setDescCol] = useState('');
  const [amtCol,  setAmtCol]  = useState('');
  const [dateCol, setDateCol] = useState('');

  const [musEE, setMusEE] = useState('0');
  const [musCL, setMusCL] = useState('95');

  const [attrTDR, setAttrTDR]   = useState('5');
  const [attrEDR, setAttrEDR]   = useState('0');
  const [attrCL,  setAttrCL]    = useState('95');
  const [attrSel, setAttrSel]   = useState<AttrMethod>('RANDOM');

  const [results, setResults] = useState<SamplingResultData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const [showSaved, setShowSaved] = useState(false);

  const calcMUS  = useCalculateMUS();
  const calcAttr = useCalculateAttribute();
  const selApi   = useSelectSample();
  const fileRef  = useRef<HTMLInputElement>(null);

  const columns = useMemo(() => (records.length > 0 ? Object.keys(records[0]) : []), [records]);

  const bv = useMemo(() => {
    if (!amtCol || records.length === 0) return 0;
    return records.reduce((sum, r) => sum + parseAmount(r[amtCol]), 0);
  }, [records, amtCol]);

  // ── File handling ───────────────────────────────────────────────────────────

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb  = XLSX.read(evt.target?.result, { type: 'binary' });
        const ws  = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<ParsedRow>(ws, { raw: false, defval: '' });
        if (rows.length === 0) { setError('El archivo está vacío.'); return; }
        const keys = Object.keys(rows[0]);
        setRecords(rows);
        setFileName(file.name);
        setRefCol(detectCol(keys,  'ref', 'código', 'id', 'voucher', 'doc', 'comprobante', 'número', 'num'));
        setDescCol(detectCol(keys, 'desc', 'concepto', 'detalle', 'nombre', 'proveedor', 'beneficiario'));
        setAmtCol(detectCol(keys,  'monto', 'valor', 'amount', 'importe', 'total', 'saldo', 'balance'));
        setDateCol(detectCol(keys, 'fecha', 'date', 'periodo'));
        setResults(null);
      } catch {
        setError('Error al leer el archivo. Verifique que sea CSV o Excel válido.');
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  }

  // ── Execute MUS ─────────────────────────────────────────────────────────────

  async function executeMUS() {
    if (!amtCol) { setError('Selecciona la columna de Monto.'); return; }
    if (!me)     { setError('Calcula y guarda la Materialidad de Ejecución (ME) primero.'); return; }
    if (bv <= 0) { setError('El valor en libros calculado es $0. Verifica la columna de monto.'); return; }

    setLoading(true); setError('');
    try {
      const normalized = records.map(r => ({
        ...(refCol  ? { referencia: String(r[refCol])  } : {}),
        ...(descCol ? { descripcion: String(r[descCol]) } : {}),
        monto:        parseAmount(r[amtCol]),
        ...(dateCol ? { fecha: String(r[dateCol]) } : {}),
      }));

      const calc = await calcMUS.mutateAsync({
        book_value:             bv,
        tolerable_misstatement: me,
        expected_misstatement:  parseFloat(musEE || '0'),
        confidence_level:       parseInt(musCL) as 95,
      });

      const sel = await selApi.mutateAsync({
        records:          normalized,
        sample_size:      calc.sample_size,
        selection_method: 'MUS',
        value_field:      'monto',
      });

      const result: SamplingResultData = {
        mode:              'MUS',
        executed_at:       new Date().toISOString(),
        parameters: {
          valor_en_libros:          bv,
          materialidad_ejecucion:   me,
          error_esperado:           parseFloat(musEE || '0'),
          nivel_confianza:          parseInt(musCL),
          factor_confianza:         calc.confidence_factor,
        },
        sample_size:       calc.sample_size,
        total_items:       records.length,
        sampling_interval: calc.sampling_interval,
        seed_used:         sel.seed_used,
        selected:          sel.selected as ParsedRow[],
      };

      setResults(result);
      await onSave('S_EJE', result);
    } catch (e) {
      setError((e as Error).message || 'Error al ejecutar la selección.');
    } finally {
      setLoading(false);
    }
  }

  // ── Execute Attributes ───────────────────────────────────────────────────────

  async function executeAttributes() {
    if (records.length === 0) { setError('Carga un archivo de población primero.'); return; }
    setLoading(true); setError('');
    try {
      const normalized = records.map((r, i) => ({
        item:             i + 1,
        ...(refCol  ? { referencia:  String(r[refCol])  } : {}),
        ...(descCol ? { descripcion: String(r[descCol]) } : {}),
        ...(dateCol ? { fecha:       String(r[dateCol]) } : {}),
      }));

      const calc = await calcAttr.mutateAsync({
        population_size:          records.length,
        tolerable_deviation_rate: parseFloat(attrTDR),
        expected_deviation_rate:  parseFloat(attrEDR || '0'),
        confidence_level:         parseInt(attrCL) as 95,
      });

      const sel = await selApi.mutateAsync({
        records:          normalized,
        sample_size:      calc.sample_size,
        selection_method: attrSel,
      });

      const result: SamplingResultData = {
        mode:        'ATTRIBUTES',
        executed_at: new Date().toISOString(),
        parameters: {
          poblacion:                   records.length,
          tasa_desviacion_tolerable:   parseFloat(attrTDR),
          tasa_desviacion_esperada:    parseFloat(attrEDR || '0'),
          nivel_confianza:             parseInt(attrCL),
          metodo_seleccion:            attrSel,
        },
        sample_size: calc.sample_size,
        total_items: records.length,
        seed_used:   sel.seed_used,
        selected:    sel.selected as ParsedRow[],
      };

      setResults(result);
      await onSave('S_EJE', result);
    } catch (e) {
      setError((e as Error).message || 'Error al ejecutar la selección.');
    } finally {
      setLoading(false);
    }
  }

  // ── Export ───────────────────────────────────────────────────────────────────

  function exportResults(data: SamplingResultData) {
    const rows = data.selected.map((r, i) => ({
      '#':               i + 1,
      ...r,
      ...(data.mode === 'ATTRIBUTES' ? { 'Desviación encontrada': '', Observaciones: '' } : {}),
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Muestra');

    const paramsRows = Object.entries(data.parameters).map(([k, v]) => ({ Parámetro: k, Valor: v }));
    const wsP = XLSX.utils.json_to_sheet(paramsRows);
    XLSX.utils.book_append_sheet(wb, wsP, 'Parámetros');

    XLSX.writeFile(wb, `Muestra_${data.mode}_${data.executed_at.slice(0, 10)}.xlsx`);
  }

  // ── Render helpers ────────────────────────────────────────────────────────────

  const displayResults = results ?? (showSaved && saved ? saved as SamplingResultData : null);

  const previewCols = displayResults
    ? Object.keys(displayResults.selected[0] ?? {}).filter(k => k !== 'item').slice(0, 7)
    : [];

  return (
    <div className="border border-blue-200 bg-blue-50/20 rounded-2xl p-5 space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-blue-600" />
          <div>
            <span className="font-semibold text-blue-900 text-sm">
              Ejecución de Muestreo NIA 530
            </span>
            <span className="ml-2 text-xs text-blue-500">Selección sistemática de muestra desde población</span>
          </div>
        </div>
        {me != null && (
          <span className="text-xs font-mono bg-blue-100 text-blue-700 rounded-lg px-2.5 py-1">
            ME = {fmtCurrency(me)}
          </span>
        )}
      </div>

      {/* ME warning */}
      {me == null && (
        <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
          <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          Calcula y guarda la Materialidad de Ejecución (ME) en el panel de arriba antes de ejecutar MUS.
        </div>
      )}

      {/* Mode tabs */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-xl">
        {(['MUS', 'ATTRIBUTES'] as Mode[]).map(m => (
          <button
            key={m}
            onClick={() => { setMode(m); setError(''); }}
            className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              mode === m
                ? 'bg-white text-blue-700 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {m === 'MUS' ? 'MUS — Saldos Monetarios' : 'Atributos — Pruebas de Control'}
          </button>
        ))}
      </div>

      {/* Step 1: Upload */}
      <div className="space-y-3">
        <StepLabel n={1} text="Cargar archivo de población" />

        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => fileRef.current?.click()}
            disabled={readonly}
            className="flex items-center gap-2 px-4 py-2 border border-blue-300 bg-white text-blue-700 text-sm font-medium rounded-xl hover:bg-blue-50 disabled:opacity-50 transition-colors"
          >
            <Upload className="w-4 h-4" />
            {fileName ? 'Cambiar archivo' : 'Cargar CSV o Excel'}
          </button>
          {fileName && (
            <div className="flex items-center gap-2 text-xs text-gray-600 bg-white border border-gray-200 rounded-lg px-3 py-1.5">
              <FileSpreadsheet className="w-3.5 h-3.5 text-green-600" />
              <span className="font-medium">{fileName}</span>
              <span className="text-gray-400">· {records.length} registros</span>
              <button
                onClick={() => { setRecords([]); setFileName(''); setResults(null); setError(''); }}
                className="ml-1 text-gray-400 hover:text-gray-600"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}
          <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" onChange={handleFile} className="hidden" />
        </div>

        <p className="text-[11px] text-gray-400">
          {mode === 'MUS'
            ? 'Columnas recomendadas: Referencia, Descripción, Monto. Una fila por transacción o cuenta.'
            : 'Columnas recomendadas: Referencia/Número, Descripción, Fecha. Una fila por ocurrencia del control.'}
        </p>

        {/* File preview */}
        {records.length > 0 && (
          <div className="overflow-x-auto border border-gray-200 rounded-xl bg-white">
            <table className="text-xs w-full min-w-max">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {columns.slice(0, 8).map(c => (
                    <th key={c} className="px-3 py-2 text-left font-semibold text-gray-500 uppercase tracking-wide">{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {records.slice(0, 3).map((r, i) => (
                  <tr key={i} className="border-t border-gray-100">
                    {columns.slice(0, 8).map(c => (
                      <td key={c} className="px-3 py-1.5 text-gray-700 whitespace-nowrap">{String(r[c])}</td>
                    ))}
                  </tr>
                ))}
                {records.length > 3 && (
                  <tr className="border-t border-gray-100">
                    <td colSpan={Math.min(columns.length, 8)} className="px-3 py-1.5 text-gray-400 italic">
                      … y {records.length - 3} registros más
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Step 2: Column mapping */}
      {records.length > 0 && (
        <div className="space-y-3">
          <StepLabel n={2} text="Mapeo de columnas" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <ColSelect label="Referencia" value={refCol}  onChange={setRefCol}  columns={columns} />
            <ColSelect label="Descripción" value={descCol} onChange={setDescCol} columns={columns} />
            {mode === 'MUS' && (
              <ColSelect label="Monto *"    value={amtCol}  onChange={setAmtCol}  columns={columns} required />
            )}
            <ColSelect label="Fecha (opc.)" value={dateCol} onChange={setDateCol} columns={columns} />
          </div>

          {mode === 'MUS' && amtCol && (
            <div className="flex items-center gap-2 text-xs bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-blue-700">
              <Info className="w-3.5 h-3.5 shrink-0" />
              Valor en libros (BV) calculado: <span className="font-bold font-mono ml-1">{fmtCurrency(bv)}</span>
              <span className="text-blue-400">· {records.length} ítems</span>
            </div>
          )}
        </div>
      )}

      {/* Step 3: Parameters */}
      {records.length > 0 && (
        <div className="space-y-3">
          <StepLabel n={3} text="Parámetros de muestreo" />

          {mode === 'MUS' && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <ReadonlyField
                label="Materialidad de Ejecución (TM)"
                value={me != null ? fmtCurrency(me) : '— (pendiente)'}
                hint="Auto-tomada del panel de materialidad"
              />
              <LabeledInput
                label="Error Esperado (EE)"
                hint="Default 0 — sin error anticipado"
                value={musEE}
                onChange={setMusEE}
                type="number" min={0} placeholder="0"
                disabled={readonly}
              />
              <LabeledSelect
                label="Nivel de Confianza"
                value={musCL}
                onChange={setMusCL}
                disabled={readonly}
                options={[
                  { value: '90', label: '90%' },
                  { value: '95', label: '95% (recomendado)' },
                  { value: '99', label: '99% (alto riesgo)' },
                ]}
              />
            </div>
          )}

          {mode === 'ATTRIBUTES' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              <LabeledInput
                label="Tasa Desviación Tolerable (TDR %)"
                hint="Ej: 5% — máximo aceptable de controles fallidos"
                value={attrTDR}
                onChange={setAttrTDR}
                type="number" min={1} max={20} step={0.5} placeholder="5"
                disabled={readonly}
              />
              <LabeledInput
                label="Tasa Desviación Esperada (EDR %)"
                hint="Default 0"
                value={attrEDR}
                onChange={setAttrEDR}
                type="number" min={0} max={15} step={0.5} placeholder="0"
                disabled={readonly}
              />
              <LabeledSelect
                label="Nivel de Confianza"
                value={attrCL}
                onChange={setAttrCL}
                disabled={readonly}
                options={[
                  { value: '90', label: '90%' },
                  { value: '95', label: '95% (recomendado)' },
                  { value: '99', label: '99% (alto riesgo)' },
                ]}
              />
              <LabeledSelect
                label="Método de Selección"
                value={attrSel}
                onChange={(v) => setAttrSel(v as AttrMethod)}
                disabled={readonly}
                options={[
                  { value: 'RANDOM',     label: 'Aleatorio (AICPA estándar)' },
                  { value: 'SYSTEMATIC', label: 'Sistemático (NIA 530)' },
                ]}
              />
            </div>
          )}

          <button
            onClick={mode === 'MUS' ? executeMUS : executeAttributes}
            disabled={readonly || loading || records.length === 0 || (mode === 'MUS' && (!amtCol || !me))}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white font-semibold text-sm rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {loading
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <Play className="w-4 h-4" />}
            {mode === 'MUS' ? 'Ejecutar selección MUS' : 'Ejecutar selección por Atributos'}
          </button>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-red-500" />
          <div>
            <p className="font-semibold">Error</p>
            <p className="mt-0.5 text-red-600">{error}</p>
          </div>
        </div>
      )}

      {/* Saved results notice */}
      {!results && saved && !showSaved && (
        <div className="flex items-center justify-between text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
          <div>
            <span className="font-medium text-gray-700">Última ejecución guardada: </span>
            {(saved as SamplingResultData).mode} — {(saved as SamplingResultData).sample_size} ítems
            seleccionados de {(saved as SamplingResultData).total_items}
            <span className="ml-2 text-gray-400">
              · {new Date((saved as SamplingResultData).executed_at).toLocaleString('es-SV')}
            </span>
          </div>
          <button
            onClick={() => setShowSaved(true)}
            className="ml-4 shrink-0 text-blue-600 hover:text-blue-700 font-medium"
          >
            Ver resultado
          </button>
        </div>
      )}

      {/* Results */}
      {displayResults && (
        <ResultsBlock
          data={displayResults}
          onExport={() => exportResults(displayResults)}
          previewCols={previewCols}
        />
      )}
    </div>
  );
}

// ─── ResultsBlock ─────────────────────────────────────────────────────────────

function ResultsBlock({
  data, onExport, previewCols,
}: {
  data:        SamplingResultData;
  onExport:    () => void;
  previewCols: string[];
}) {
  const isMUS   = data.mode === 'MUS';
  const isAttr  = data.mode === 'ATTRIBUTES';
  const fmtDate = new Date(data.executed_at).toLocaleString('es-SV', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-green-600" />
          <span className="font-semibold text-gray-800 text-sm">
            Muestra seleccionada — {isMUS ? 'MUS (Monetary Unit Sampling)' : 'Muestreo por Atributos'}
          </span>
          <span className="text-xs text-gray-400">· {fmtDate}</span>
        </div>
        <button
          onClick={onExport}
          className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 bg-white text-gray-600 text-xs font-medium rounded-lg hover:bg-gray-50 transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          Exportar Excel
        </button>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-3 gap-3">
        <MetricCard label="Ítems seleccionados" value={String(data.sample_size)} color="blue" />
        <MetricCard label="Población total"     value={String(data.total_items)} color="gray" />
        {isMUS && data.sampling_interval != null && (
          <MetricCard
            label="Intervalo de muestreo"
            value={data.sampling_interval.toLocaleString('es-SV', { maximumFractionDigits: 2 })}
            color="violet"
          />
        )}
        {isAttr && (
          <MetricCard
            label="Método selección"
            value={String(data.parameters.metodo_seleccion ?? '—')}
            color="violet"
          />
        )}
      </div>

      {/* Parameters summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {Object.entries(data.parameters).map(([k, v]) => (
          <div key={k} className="text-xs bg-white border border-gray-200 rounded-lg px-2.5 py-1.5">
            <span className="text-gray-400 capitalize">{k.replace(/_/g, ' ')}: </span>
            <span className="font-medium text-gray-700">
              {typeof v === 'number' && v > 1000
                ? v.toLocaleString('es-SV', { style: 'currency', currency: 'USD' })
                : String(v)}
            </span>
          </div>
        ))}
      </div>

      {/* Results table */}
      <div className="overflow-x-auto border border-gray-200 rounded-xl bg-white">
        <table className="text-xs w-full min-w-max">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-3 py-2 text-left font-semibold text-gray-500 w-10">#</th>
              {previewCols.map(c => (
                <th key={c} className="px-3 py-2 text-left font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{c}</th>
              ))}
              {isAttr && (
                <>
                  <th className="px-3 py-2 text-left font-semibold text-gray-500">¿Desviación?</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-500">Observaciones</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {data.selected.map((row, i) => (
              <tr key={i} className={`border-t border-gray-100 ${i % 2 === 1 ? 'bg-gray-50/50' : ''}`}>
                <td className="px-3 py-1.5 text-gray-400 font-mono">{i + 1}</td>
                {previewCols.map(c => (
                  <td key={c} className="px-3 py-1.5 text-gray-700 whitespace-nowrap">{String(row[c] ?? '—')}</td>
                ))}
                {isAttr && (
                  <>
                    <td className="px-3 py-1.5">
                      <select className="text-xs border border-gray-200 rounded px-2 py-1 bg-white focus:outline-none">
                        <option value="">— Pendiente —</option>
                        <option value="NO">No (conforme)</option>
                        <option value="SI">Sí (desviación)</option>
                        <option value="NA">N/A</option>
                      </select>
                    </td>
                    <td className="px-3 py-1.5">
                      <input
                        type="text"
                        placeholder="Observación..."
                        className="text-xs border border-gray-200 rounded px-2 py-1 w-40 bg-white focus:outline-none"
                      />
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isAttr && (
        <p className="text-[11px] text-gray-400">
          Las columnas Desviación y Observaciones son para referencia visual. Exporta a Excel para registrar y guardar los resultados de la revisión de cada ítem.
        </p>
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StepLabel({ n, text }: { n: number; text: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center">
        {n}
      </span>
      <span className="text-xs font-bold text-gray-600 uppercase tracking-wide">{text}</span>
    </div>
  );
}

function ColSelect({
  label, value, onChange, columns, required,
}: {
  label:    string;
  value:    string;
  onChange: (v: string) => void;
  columns:  string[];
  required?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-700 mb-1">{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className={`w-full px-2.5 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white ${
          required && !value ? 'border-red-300' : 'border-gray-200'
        }`}
      >
        <option value="">— Seleccionar —</option>
        {columns.map(c => (<option key={c} value={c}>{c}</option>))}
      </select>
    </div>
  );
}

function ReadonlyField({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-700 mb-1">{label}</label>
      <div className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl bg-gray-50 text-gray-700 font-mono">
        {value}
      </div>
      {hint && <p className="text-[10px] text-gray-400 mt-0.5">{hint}</p>}
    </div>
  );
}

function LabeledInput({
  label, hint, value, onChange, disabled, type, min, max, step, placeholder,
}: {
  label:       string;
  hint?:       string;
  value:       string;
  onChange:    (v: string) => void;
  disabled?:   boolean;
  type?:       string;
  min?:        number;
  max?:        number;
  step?:       number;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-700 mb-1">{label}</label>
      <input
        type={type ?? 'text'}
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        min={min} max={max} step={step} placeholder={placeholder}
        className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white disabled:bg-gray-50 font-mono"
      />
      {hint && <p className="text-[10px] text-gray-400 mt-0.5">{hint}</p>}
    </div>
  );
}

function LabeledSelect({
  label, value, onChange, disabled, options,
}: {
  label:    string;
  value:    string;
  onChange: (v: string) => void;
  disabled?: boolean;
  options:  { value: string; label: string }[];
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-700 mb-1">{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white disabled:bg-gray-50"
      >
        {options.map(o => (<option key={o.value} value={o.value}>{o.label}</option>))}
      </select>
    </div>
  );
}

function MetricCard({ label, value, color }: { label: string; value: string; color: 'blue' | 'gray' | 'violet' }) {
  const styles: Record<string, string> = {
    blue:   'bg-blue-50   border-blue-200   text-blue-800',
    gray:   'bg-gray-50   border-gray-200   text-gray-800',
    violet: 'bg-violet-50 border-violet-200 text-violet-800',
  };
  return (
    <div className={`border rounded-xl p-3 ${styles[color]}`}>
      <p className="text-[10px] uppercase tracking-wide opacity-70 font-medium leading-tight">{label}</p>
      <p className="text-lg font-bold font-mono mt-0.5">{value}</p>
    </div>
  );
}
