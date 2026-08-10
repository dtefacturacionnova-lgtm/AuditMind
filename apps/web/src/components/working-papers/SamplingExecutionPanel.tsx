'use client';

import { useState, useRef, useMemo, useCallback } from 'react';
import * as XLSX from 'xlsx';
import {
  Upload, Play, Download, CheckCircle2, Loader2,
  AlertCircle, FileSpreadsheet, BarChart3, Info, X, Paperclip,
  ListFilter,
} from 'lucide-react';
import type { PaperSection } from '@/hooks/useWorkingPaperGraph';
import { useCalculateMUS, useCalculateAttribute } from '@/hooks/useSampling';

// ─── Types ────────────────────────────────────────────────────────────────────

type Mode = 'MUS' | 'ATTRIBUTES';
type AttrMethod = 'RANDOM' | 'SYSTEMATIC';
type ParsedRow = Record<string, string | number>;
type TableFilter = 'all' | 'selected';

interface RowAnnotation {
  observedAmt: string;
  observation: string;
  deviation:   string;
}

interface SamplingResultData {
  mode:               Mode;
  executed_at:        string;
  parameters:         Record<string, number | string>;
  sample_size:        number;        // unique physical items selected
  monetary_units?:    number;        // MUS theoretical count (BV / IMM)
  total_items:        number;
  sampling_interval?: number;
  seed_used:          number | null;
  selected:           ParsedRow[];
  allRecords?:        ParsedRow[];   // full population (new runs only)
  selectedIndices?:   number[];      // indices in allRecords that are in the sample
}

interface Props {
  sections: PaperSection[];
  readonly: boolean;
  onSave:   (key: string, value: unknown) => void | Promise<void>;
}

// ─── Parameter label map ─────────────────────────────────────────────────────

const PARAM_LABELS: Record<string, string> = {
  valor_en_libros:           'Valor en Libros (BV)',
  materialidad_ejecucion:    'Materialidad de Ejecución (TM)',
  error_esperado:            'Error Esperado (EE)',
  nivel_confianza:           'Nivel de Confianza',
  factor_confianza:          'Factor de Confianza (RF)',
  poblacion:                 'Población (N)',
  tasa_desviacion_tolerable: 'Tasa Desv. Tolerable (TDR)',
  tasa_desviacion_esperada:  'Tasa Desv. Esperada (EDR)',
  metodo_seleccion:          'Método',
};

const MONETARY_PARAMS = new Set(['valor_en_libros', 'materialidad_ejecucion', 'error_esperado']);
const PCT_PARAMS      = new Set(['nivel_confianza', 'tasa_desviacion_tolerable', 'tasa_desviacion_esperada']);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtCurrency(n: number) {
  return 'US$ ' + n.toLocaleString('es-SV', {
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

function sanitizeAmount(raw: string): string {
  let s = raw.replace(/[^0-9.]/g, '');
  const parts = s.split('.');
  if (parts.length > 2) s = parts[0] + '.' + parts.slice(1).join('');
  return s;
}

function amtError(raw: string, maxAmt: number | undefined): string | null {
  if (!raw) return null;
  const n = parseFloat(raw);
  if (isNaN(n)) return 'Valor inválido';
  if (n < 0) return 'No puede ser negativo';
  if (maxAmt !== undefined && n > maxAmt) return `Excede monto de transacción (${fmtCurrency(maxAmt)})`;
  return null;
}

// ─── Client-side MUS walk (NIA 530) ─────────────────────────────────────────
// Returns selectedIndices = population indices of selected items (deduplicated).
// Each physical item appears at most once even if its value spans multiple intervals.

function musSelect(
  records:    ParsedRow[],
  sampleSize: number,
  bv:         number,
): { selected: ParsedRow[]; monetaryUnits: number; selectedIndices: number[] } {
  if (bv <= 0 || sampleSize <= 0) return { selected: [], monetaryUnits: 0, selectedIndices: [] };
  const interval  = bv / sampleSize;
  const start     = Math.random() * interval;
  const selected: ParsedRow[] = [];
  const seenIdx   = new Set<number>();
  let cumulative  = 0;
  let nextTarget  = start;

  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    const amt = typeof record.monto === 'number' ? record.monto : parseAmount(String(record.monto));
    if (amt <= 0) continue;
    cumulative += amt;
    while (nextTarget <= cumulative) {
      if (!seenIdx.has(i)) {
        seenIdx.add(i);
        selected.push({ ...record });
      }
      nextTarget += interval;
    }
  }
  const selectedIndices = Array.from(seenIdx).sort((a, b) => a - b);
  return { selected, monetaryUnits: sampleSize, selectedIndices };
}

// ─── Client-side attribute selection ─────────────────────────────────────────

function randomSelect(records: ParsedRow[], n: number): { selected: ParsedRow[]; indices: number[] } {
  const indexed = records.map((r, i) => ({ r, i }));
  for (let j = indexed.length - 1; j > 0; j--) {
    const k = Math.floor(Math.random() * (j + 1));
    [indexed[j], indexed[k]] = [indexed[k], indexed[j]];
  }
  const taken = indexed.slice(0, Math.min(n, indexed.length)).sort((a, b) => a.i - b.i);
  return { selected: taken.map(x => x.r), indices: taken.map(x => x.i) };
}

function systematicSelect(records: ParsedRow[], n: number): { selected: ParsedRow[]; indices: number[] } {
  if (records.length <= n) return { selected: [...records], indices: records.map((_, i) => i) };
  const interval = records.length / n;
  const start    = Math.random() * interval;
  const indices: number[] = [];
  for (let i = 0; i < n; i++) {
    const idx = Math.floor(start + i * interval);
    if (idx < records.length) indices.push(idx);
  }
  return { selected: indices.map(i => records[i]), indices };
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SamplingExecutionPanel({ sections, readonly, onSave }: Props) {
  const me = sections.find(s => s.sectionKey === 'S4')?.value != null
    ? Number(sections.find(s => s.sectionKey === 'S4')!.value)
    : null;

  const saved = sections.find(s => s.sectionKey === 'S_EJE')?.value as SamplingResultData | null | undefined;

  const [mode,       setMode]      = useState<Mode>('MUS');
  const [records,    setRecords]   = useState<ParsedRow[]>([]);
  const [fileName,   setFileName]  = useState('');

  const [refCol,  setRefCol]  = useState('');
  const [descCol, setDescCol] = useState('');
  const [amtCol,  setAmtCol]  = useState('');
  const [dateCol, setDateCol] = useState('');

  const [musEE, setMusEE] = useState('0');
  const [musCL, setMusCL] = useState('95');

  const [attrTDR, setAttrTDR] = useState('5');
  const [attrEDR, setAttrEDR] = useState('0');
  const [attrCL,  setAttrCL]  = useState('95');
  const [attrSel, setAttrSel] = useState<AttrMethod>('RANDOM');

  const [results,  setResults]  = useState<SamplingResultData | null>(null);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const [showSaved, setShowSaved] = useState(false);

  // Row annotations keyed by POPULATION INDEX (index in allRecords / selected)
  const [rowAnnotations, setRowAnnotations] = useState<Record<number, RowAnnotation>>({});
  const [evidenceFiles,  setEvidenceFiles]  = useState<Record<number, File[]>>({});

  const calcMUS  = useCalculateMUS();
  const calcAttr = useCalculateAttribute();
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
        const wb   = XLSX.read(evt.target?.result, { type: 'binary' });
        const ws   = wb.Sheets[wb.SheetNames[0]];
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
        setRowAnnotations({});
        setEvidenceFiles({});
      } catch {
        setError('Error al leer el archivo. Verifique que sea CSV o Excel válido.');
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  }

  // ── Execute MUS (client-side NIA 530 walk) ──────────────────────────────────

  async function executeMUS() {
    if (!amtCol) { setError('Selecciona la columna de Monto.'); return; }
    if (!me)     { setError('Calcula y guarda la Materialidad de Ejecución (ME) primero.'); return; }
    if (bv <= 0) { setError('El valor en libros calculado es $0. Verifica la columna de monto.'); return; }

    setLoading(true); setError('');
    try {
      const normalized = records.map(r => ({
        ...(refCol  ? { referencia:  String(r[refCol])  } : {}),
        ...(descCol ? { descripcion: String(r[descCol]) } : {}),
        monto:         parseAmount(r[amtCol]),
        ...(dateCol ? { fecha: String(r[dateCol]) } : {}),
      }));

      const calc = await calcMUS.mutateAsync({
        book_value:             bv,
        tolerable_misstatement: me,
        expected_misstatement:  parseFloat(musEE || '0'),
        confidence_level:       parseInt(musCL) as 95,
      });

      const { selected, monetaryUnits, selectedIndices } = musSelect(normalized, calc.sample_size, bv);

      const result: SamplingResultData = {
        mode:     'MUS',
        executed_at: new Date().toISOString(),
        parameters: {
          valor_en_libros:        bv,
          materialidad_ejecucion: me,
          error_esperado:         parseFloat(musEE || '0'),
          nivel_confianza:        parseInt(musCL),
          factor_confianza:       calc.confidence_factor,
        },
        sample_size:       selected.length,
        monetary_units:    monetaryUnits,
        total_items:       records.length,
        sampling_interval: calc.sampling_interval,
        seed_used:         null,
        selected,
        allRecords:       normalized,
        selectedIndices,
      };

      setResults(result);
      setRowAnnotations({});
      setEvidenceFiles({});
      await onSave('S_EJE', result);
    } catch (e) {
      setError((e as Error).message || 'Error al ejecutar la selección.');
    } finally {
      setLoading(false);
    }
  }

  // ── Execute Attributes (client-side selection) ───────────────────────────────

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

      const { selected, indices } = attrSel === 'RANDOM'
        ? randomSelect(normalized, calc.sample_size)
        : systematicSelect(normalized, calc.sample_size);

      const result: SamplingResultData = {
        mode:        'ATTRIBUTES',
        executed_at: new Date().toISOString(),
        parameters: {
          poblacion:                 records.length,
          tasa_desviacion_tolerable: parseFloat(attrTDR),
          tasa_desviacion_esperada:  parseFloat(attrEDR || '0'),
          nivel_confianza:           parseInt(attrCL),
          metodo_seleccion:          attrSel,
        },
        sample_size:     selected.length,
        total_items:     records.length,
        seed_used:       null,
        selected,
        allRecords:      normalized,
        selectedIndices: indices,
      };

      setResults(result);
      setRowAnnotations({});
      setEvidenceFiles({});
      await onSave('S_EJE', result);
    } catch (e) {
      setError((e as Error).message || 'Error al ejecutar la selección.');
    } finally {
      setLoading(false);
    }
  }

  // ── Row annotation helpers ────────────────────────────────────────────────────

  const handleRowAnnotationChange = useCallback((populationIdx: number, ann: RowAnnotation) => {
    setRowAnnotations(prev => ({ ...prev, [populationIdx]: ann }));
  }, []);

  const handleEvidenceChange = useCallback((populationIdx: number, files: File[]) => {
    setEvidenceFiles(prev => ({ ...prev, [populationIdx]: files }));
  }, []);

  // ── Export ───────────────────────────────────────────────────────────────────

  function exportResults(data: SamplingResultData) {
    const selectedSet   = new Set(data.selectedIndices ?? data.selected.map((_, i) => i));
    const sourceRecords = data.allRecords ?? data.selected;

    const rows = sourceRecords.map((r, i) => {
      const isSelected = selectedSet.has(i);
      const ann        = isSelected ? (rowAnnotations[i] ?? { observedAmt: '', observation: '', deviation: '' }) : null;
      const evFiles    = isSelected ? evidenceFiles[i] : null;
      return {
        '#':           i + 1,
        'En Muestra':  isSelected ? 'SÍ' : 'NO',
        ...r,
        ...(data.mode === 'ATTRIBUTES' && isSelected ? { 'Desviación encontrada': ann?.deviation ?? '' } : {}),
        'Monto Observado (US$)': ann?.observedAmt ?? '',
        Observaciones:           ann?.observation ?? '',
        ...(evFiles?.length ? { 'Archivos adjuntos': evFiles.map(f => f.name).join('; ') } : {}),
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Población y Muestra');

    const paramsRows = Object.entries(data.parameters).map(([k, v]) => ({ Parámetro: k, Valor: v }));
    const wsP = XLSX.utils.json_to_sheet(paramsRows);
    XLSX.utils.book_append_sheet(wb, wsP, 'Parámetros');

    XLSX.writeFile(wb, `Muestra_${data.mode}_${data.executed_at.slice(0, 10)}.xlsx`);
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  const displayResults = results ?? (showSaved && saved ? saved as SamplingResultData : null);

  const previewCols = useMemo(() => {
    if (!displayResults) return [];
    const source = displayResults.allRecords ?? displayResults.selected;
    if (source.length === 0) return [];
    return Object.keys(source[0]).filter(k => k !== 'item').slice(0, 6);
  }, [displayResults]);

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
                onClick={() => { setRecords([]); setFileName(''); setResults(null); setError(''); setRowAnnotations({}); setEvidenceFiles({}); }}
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
            ? 'Columnas recomendadas: Referencia, Descripción, Monto (US$). Una fila por transacción o cuenta.'
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
                    {columns.slice(0, 8).map(c => {
                      const isAmt = c === amtCol && mode === 'MUS';
                      const raw   = r[c];
                      return (
                        <td key={c} className={`px-3 py-1.5 whitespace-nowrap ${isAmt ? 'font-mono text-blue-700' : 'text-gray-700'}`}>
                          {isAmt && typeof raw === 'number' ? fmtCurrency(raw) : isAmt && typeof raw === 'string' ? `US$ ${parseAmount(raw).toFixed(2)}` : String(raw)}
                        </td>
                      );
                    })}
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
            <ColSelect label="Referencia"    value={refCol}  onChange={setRefCol}  columns={columns} />
            <ColSelect label="Descripción"   value={descCol} onChange={setDescCol} columns={columns} />
            {mode === 'MUS' && (
              <ColSelect label="Monto US$ *" value={amtCol}  onChange={setAmtCol}  columns={columns} required />
            )}
            <ColSelect label="Fecha (opc.)"  value={dateCol} onChange={setDateCol} columns={columns} />
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
                label="Error Esperado (EE — US$)"
                hint="Monto monetario esperado de errores. Default $0"
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
            {(saved as SamplingResultData).mode} — {(saved as SamplingResultData).sample_size} partidas
            seleccionadas de {(saved as SamplingResultData).total_items}
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
          rowAnnotations={rowAnnotations}
          onRowAnnotationChange={handleRowAnnotationChange}
          evidenceFiles={evidenceFiles}
          onEvidenceChange={handleEvidenceChange}
        />
      )}
    </div>
  );
}

// ─── ResultsBlock ─────────────────────────────────────────────────────────────

function ResultsBlock({
  data,
  onExport,
  previewCols,
  rowAnnotations,
  onRowAnnotationChange,
  evidenceFiles,
  onEvidenceChange,
}: {
  data:                   SamplingResultData;
  onExport:               () => void;
  previewCols:            string[];
  rowAnnotations:         Record<number, RowAnnotation>;
  onRowAnnotationChange:  (populationIdx: number, ann: RowAnnotation) => void;
  evidenceFiles:          Record<number, File[]>;
  onEvidenceChange:       (populationIdx: number, files: File[]) => void;
}) {
  const isMUS  = data.mode === 'MUS';
  const isAttr = data.mode === 'ATTRIBUTES';
  const fmtDate = new Date(data.executed_at).toLocaleString('es-SV', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  const [tableFilter, setTableFilter] = useState<TableFilter>('selected');

  const evidenceInputRef  = useRef<HTMLInputElement>(null);
  const [targetRow, setTargetRow] = useState<number | null>(null);

  // Build selected set and source records (population-indexed)
  const selectedSet = useMemo(() => {
    if (data.selectedIndices) return new Set(data.selectedIndices);
    return new Set(data.selected.map((_, i) => i));
  }, [data]);

  const sourceRecords = data.allRecords ?? data.selected;

  // Rows to display after filter
  const displayedRows = useMemo(() => {
    return sourceRecords
      .map((row, i) => ({ row, populationIdx: i, isSelected: selectedSet.has(i) }))
      .filter(({ isSelected }) => tableFilter === 'all' || isSelected);
  }, [sourceRecords, selectedSet, tableFilter]);

  function handleEvidenceClick(populationIdx: number) {
    setTargetRow(populationIdx);
    setTimeout(() => evidenceInputRef.current?.click(), 0);
  }

  function handleEvidenceFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (targetRow === null || !e.target.files) return;
    const newFiles = Array.from(e.target.files);
    const existing = evidenceFiles[targetRow] ?? [];
    onEvidenceChange(targetRow, [...existing, ...newFiles]);
    e.target.value = '';
  }

  const all100pct = isMUS && data.sample_size === data.total_items &&
    data.monetary_units != null && data.monetary_units > data.total_items;

  return (
    <div className="space-y-4">
      <input
        ref={evidenceInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleEvidenceFileChange}
      />

      {/* Header */}
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

      {/* 100% selection warning */}
      {all100pct && (
        <div className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
          <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-600" />
          <div>
            <p className="font-semibold">Selección 100% — todos los ítems son individualmente significativos</p>
            <p className="mt-0.5 text-amber-700">
              El intervalo de muestreo ({fmtCurrency(data.sampling_interval ?? 0)}) es menor al valor
              promedio de las transacciones ({fmtCurrency(data.total_items > 0 ? (data.parameters.valor_en_libros as number) / data.total_items : 0)}).
              Considera aumentar la Materialidad de Ejecución o aplicar MUS solo al estrato de ítems por debajo del intervalo.
            </p>
          </div>
        </div>
      )}

      {/* Metric cards — MUS: 4 cards; Attributes: 3 cards */}
      {isMUS ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <MetricCard
            label="n — Tamaño de Muestra MUS"
            value={String(data.monetary_units ?? '—')}
            color="violet"
            sub="unidades monetarias (BV ÷ IMM)"
          />
          <MetricCard
            label="Partidas en Muestra"
            value={String(data.sample_size)}
            color="blue"
            sub={all100pct ? 'Selección 100% ⚠' : undefined}
          />
          <MetricCard
            label="Partidas en Población (N)"
            value={String(data.total_items)}
            color="gray"
          />
          <MetricCard
            label="Intervalo de Muestreo (IMM)"
            value={data.sampling_interval != null ? fmtCurrency(data.sampling_interval) : '—'}
            color="violet"
          />
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          <MetricCard label="Muestra (n)" value={String(data.sample_size)} color="blue" />
          <MetricCard label="Partidas en Población (N)" value={String(data.total_items)} color="gray" />
          <MetricCard
            label="Método de Selección"
            value={String(data.parameters.metodo_seleccion ?? '—')}
            color="violet"
          />
        </div>
      )}

      {/* Parameters summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {Object.entries(data.parameters)
          .filter(([k]) => k !== 'metodo_seleccion')
          .map(([k, v]) => {
            const label      = PARAM_LABELS[k] ?? k.replace(/_/g, ' ');
            const isMonetary = MONETARY_PARAMS.has(k);
            const isPct      = PCT_PARAMS.has(k);
            const numV       = Number(v);
            return (
              <div key={k} className="text-xs bg-white border border-gray-200 rounded-lg px-2.5 py-1.5">
                <span className="text-gray-400">{label}: </span>
                <span className="font-medium text-gray-700 font-mono">
                  {isMonetary ? fmtCurrency(numV)
                    : isPct   ? `${v}%`
                    : String(v)}
                </span>
              </div>
            );
          })}
      </div>

      {/* Filter toggle */}
      <div className="flex items-center gap-3">
        <ListFilter className="w-3.5 h-3.5 text-gray-400 shrink-0" />
        <div className="flex gap-1 p-1 bg-gray-100 rounded-lg">
          <button
            onClick={() => setTableFilter('selected')}
            className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
              tableFilter === 'selected' ? 'bg-white shadow-sm text-blue-700' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Solo muestra <span className="font-bold ml-1">{data.sample_size}</span>
          </button>
          <button
            onClick={() => setTableFilter('all')}
            className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
              tableFilter === 'all' ? 'bg-white shadow-sm text-blue-700' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Toda la población <span className="text-gray-400 ml-1">{sourceRecords.length}</span>
          </button>
        </div>
        {tableFilter === 'all' && (
          <span className="text-[10px] text-gray-400">
            Los ítems no seleccionados aparecen atenuados sin columnas de trabajo
          </span>
        )}
      </div>

      {/* Results table */}
      <div className="overflow-x-auto border border-gray-200 rounded-xl bg-white">
        <table className="text-xs w-full min-w-max">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-3 py-2 text-left font-semibold text-gray-500 w-10">#</th>
              <th className="px-3 py-2 text-left font-semibold text-gray-500 whitespace-nowrap">Muestra</th>
              {previewCols.map(c => (
                <th key={c} className="px-3 py-2 text-left font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{c}</th>
              ))}
              {isAttr && (
                <th className="px-3 py-2 text-left font-semibold text-gray-500 whitespace-nowrap">¿Desviación?</th>
              )}
              <th className="px-3 py-2 text-left font-semibold text-gray-500 whitespace-nowrap">Monto Observado</th>
              <th className="px-3 py-2 text-left font-semibold text-gray-500">Observaciones</th>
              <th className="px-3 py-2 text-left font-semibold text-gray-500">Evidencia</th>
            </tr>
          </thead>
          <tbody>
            {displayedRows.map(({ row, populationIdx, isSelected }, displayIdx) => {
              const ann      = rowAnnotations[populationIdx] ?? { observedAmt: '', observation: '', deviation: '' };
              const rowMonto = typeof row.monto === 'number'
                ? row.monto
                : (typeof row.monto === 'string' ? parseAmount(row.monto) : undefined);
              const amtErr   = isSelected ? amtError(ann.observedAmt, rowMonto) : null;
              const evCount  = isSelected ? (evidenceFiles[populationIdx]?.length ?? 0) : 0;
              const evNames  = isSelected ? (evidenceFiles[populationIdx]?.map(f => f.name).join(', ') ?? '') : '';

              return (
                <tr
                  key={populationIdx}
                  className={`border-t border-gray-100 ${
                    !isSelected
                      ? 'opacity-40 bg-gray-50/50'
                      : displayIdx % 2 === 1 ? 'bg-blue-50/20' : ''
                  }`}
                >
                  <td className="px-3 py-2 text-gray-400 font-mono">{populationIdx + 1}</td>

                  {/* Selection badge */}
                  <td className="px-3 py-2">
                    {isSelected ? (
                      <span className="inline-flex items-center gap-1 bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap">
                        ✓ Muestra
                      </span>
                    ) : (
                      <span className="text-gray-300 text-[10px]">—</span>
                    )}
                  </td>

                  {previewCols.map(c => {
                    const val   = row[c];
                    const isMnt = c === 'monto' && isMUS;
                    return (
                      <td key={c} className={`px-3 py-2 whitespace-nowrap ${isMnt && isSelected ? 'font-mono text-blue-700 font-medium' : isMnt ? 'font-mono text-gray-500' : 'text-gray-700'}`}>
                        {isMnt && typeof val === 'number'
                          ? fmtCurrency(val)
                          : isMnt && typeof val === 'string'
                            ? `US$ ${parseAmount(val).toFixed(2)}`
                            : String(val ?? '—')}
                      </td>
                    );
                  })}

                  {/* Annotation columns — only interactive for selected items */}
                  {isAttr && (
                    <td className="px-3 py-2">
                      {isSelected ? (
                        <select
                          value={ann.deviation}
                          onChange={e => onRowAnnotationChange(populationIdx, { ...ann, deviation: e.target.value })}
                          className="text-xs border border-gray-200 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-blue-300"
                        >
                          <option value="">— Pendiente —</option>
                          <option value="NO">No (conforme)</option>
                          <option value="SI">Sí (desviación)</option>
                          <option value="NA">N/A</option>
                        </select>
                      ) : <span className="text-gray-300">—</span>}
                    </td>
                  )}

                  {/* Observed amount */}
                  <td className="px-3 py-2">
                    {isSelected ? (
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1">
                          <span className="text-gray-400 text-[10px] font-mono">US$</span>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={ann.observedAmt}
                            onChange={e => {
                              const sanitized = sanitizeAmount(e.target.value);
                              onRowAnnotationChange(populationIdx, { ...ann, observedAmt: sanitized });
                            }}
                            placeholder="0.00"
                            className={`text-xs border rounded px-2 py-1 w-24 bg-white focus:outline-none focus:ring-1 focus:ring-blue-300 font-mono ${
                              amtErr ? 'border-red-300 bg-red-50 text-red-700' : 'border-gray-200'
                            }`}
                          />
                        </div>
                        {amtErr && <p className="text-[10px] text-red-500 leading-tight">{amtErr}</p>}
                      </div>
                    ) : <span className="text-gray-300 text-[10px]">—</span>}
                  </td>

                  {/* Observation */}
                  <td className="px-3 py-2">
                    {isSelected ? (
                      <input
                        type="text"
                        value={ann.observation}
                        onChange={e => onRowAnnotationChange(populationIdx, { ...ann, observation: e.target.value })}
                        placeholder="Observación..."
                        className="text-xs border border-gray-200 rounded px-2 py-1 w-36 bg-white focus:outline-none focus:ring-1 focus:ring-blue-300"
                      />
                    ) : <span className="text-gray-300 text-[10px]">—</span>}
                  </td>

                  {/* Evidence */}
                  <td className="px-3 py-2">
                    {isSelected ? (
                      <button
                        onClick={() => handleEvidenceClick(populationIdx)}
                        title={evNames || 'Adjuntar evidencias a este ítem'}
                        className={`flex items-center gap-1 text-xs px-2 py-1 rounded border transition-colors whitespace-nowrap ${
                          evCount > 0
                            ? 'border-green-300 bg-green-50 text-green-700 hover:bg-green-100'
                            : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'
                        }`}
                      >
                        <Paperclip className="w-3 h-3 shrink-0" />
                        {evCount > 0 ? `${evCount} arch.` : 'Adjuntar'}
                      </button>
                    ) : <span className="text-gray-300 text-[10px]">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-gray-400">
        {isMUS
          ? 'Monto Observado: saldo auditado de cada ítem. Exportar Excel incluye toda la población con indicador de muestra.'
          : 'Completa Desviación y Observaciones por ítem seleccionado. Exportar Excel incluye toda la población.'}
      </p>
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
  label:        string;
  hint?:        string;
  value:        string;
  onChange:     (v: string) => void;
  disabled?:    boolean;
  type?:        string;
  min?:         number;
  max?:         number;
  step?:        number;
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

function MetricCard({ label, value, color, sub }: { label: string; value: string; color: 'blue' | 'gray' | 'violet'; sub?: string }) {
  const styles: Record<string, string> = {
    blue:   'bg-blue-50   border-blue-200   text-blue-800',
    gray:   'bg-gray-50   border-gray-200   text-gray-800',
    violet: 'bg-violet-50 border-violet-200 text-violet-800',
  };
  return (
    <div className={`border rounded-xl p-3 ${styles[color]}`}>
      <p className="text-[10px] uppercase tracking-wide opacity-70 font-medium leading-tight">{label}</p>
      <p className="text-lg font-bold font-mono mt-0.5 break-all">{value}</p>
      {sub && <p className="text-[10px] opacity-60 mt-0.5 font-mono">{sub}</p>}
    </div>
  );
}
