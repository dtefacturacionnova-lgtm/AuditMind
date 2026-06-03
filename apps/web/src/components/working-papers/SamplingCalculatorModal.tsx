'use client';

import { useState } from 'react';
import { X, Calculator, TrendingUp, Hash, CheckCircle2, Loader2, Copy, FileDigit } from 'lucide-react';
import { useCalculateMUS, useCalculateAttribute, type MUSResponse, type AttributeResponse } from '@/hooks/useSampling';

// ─── Types ────────────────────────────────────────────────────────────────────

type Method = 'MUS' | 'ATTRIBUTE';

interface SamplingCalculatorModalProps {
  open:        boolean;
  onClose:     () => void;
  /** Si está presente, agrega botón "Insertar en sección" que llama esta función */
  onInsert?:   (text: string) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SamplingCalculatorModal({ open, onClose, onInsert }: SamplingCalculatorModalProps) {
  const [method, setMethod] = useState<Method>('MUS');

  // MUS form state
  const [bookValue,              setBookValue]              = useState('');
  const [tolerableMisstatement,  setTolerableMisstatement]  = useState('');
  const [expectedMisstatement,   setExpectedMisstatement]   = useState('0');
  const [musConfidence,          setMusConfidence]          = useState<70|75|80|90|95|99>(95);

  // Attribute form state
  const [populationSize,         setPopulationSize]         = useState('');
  const [tolerableDeviation,     setTolerableDeviation]     = useState('5');
  const [expectedDeviation,      setExpectedDeviation]      = useState('0');
  const [attrConfidence,         setAttrConfidence]         = useState<90|95|99>(95);

  // Results
  const [musResult,  setMusResult]  = useState<MUSResponse | null>(null);
  const [attrResult, setAttrResult] = useState<AttributeResponse | null>(null);
  const [error,      setError]      = useState('');

  const calcMUS  = useCalculateMUS();
  const calcAttr = useCalculateAttribute();
  const loading  = calcMUS.isPending || calcAttr.isPending;

  if (!open) return null;

  async function runMUS() {
    setError('');
    setMusResult(null);
    try {
      const res = await calcMUS.mutateAsync({
        book_value:             parseFloat(bookValue),
        tolerable_misstatement: parseFloat(tolerableMisstatement),
        expected_misstatement:  parseFloat(expectedMisstatement || '0'),
        confidence_level:       musConfidence,
      });
      setMusResult(res);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function runAttribute() {
    setError('');
    setAttrResult(null);
    try {
      const res = await calcAttr.mutateAsync({
        population_size:          populationSize ? parseInt(populationSize) : undefined,
        tolerable_deviation_rate: parseFloat(tolerableDeviation),
        expected_deviation_rate:  parseFloat(expectedDeviation || '0'),
        confidence_level:         attrConfidence,
      });
      setAttrResult(res);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function buildInsertText(): string {
    if (musResult) {
      return [
        `═══════ Muestreo MUS (NIA 530) ═══════`,
        `Tamaño de muestra: ${musResult.sample_size}`,
        `Intervalo de muestreo: ${musResult.sampling_interval.toLocaleString('es-CL')}`,
        ``,
        `Parámetros:`,
        `  • Valor en libros: ${(musResult.parameters.book_value as number).toLocaleString('es-CL')}`,
        `  • Materialidad de ejecución: ${(musResult.parameters.tolerable_misstatement as number).toLocaleString('es-CL')}`,
        `  • Error esperado: ${(musResult.parameters.expected_misstatement as number).toLocaleString('es-CL')}`,
        `  • Nivel de confianza: ${musResult.parameters.confidence_level}%`,
        `  • Factor de confianza: ${musResult.confidence_factor}`,
        ``,
        musResult.methodology_note,
      ].join('\n');
    }
    if (attrResult) {
      return [
        `═══════ Muestreo por Atributos (NIA 530) ═══════`,
        `Tamaño de muestra: ${attrResult.sample_size}`,
        ``,
        `Parámetros:`,
        attrResult.parameters.population_size ? `  • Población: ${attrResult.parameters.population_size}` : '',
        `  • Tasa de desviación tolerable: ${attrResult.parameters.tolerable_deviation_rate}%`,
        `  • Tasa de desviación esperada: ${attrResult.parameters.expected_deviation_rate}%`,
        `  • Nivel de confianza: ${attrResult.parameters.confidence_level}%`,
        ``,
        attrResult.methodology_note,
      ].filter(Boolean).join('\n');
    }
    return '';
  }

  async function handleCopy() {
    const text = buildInsertText();
    if (text) await navigator.clipboard.writeText(text);
  }

  function handleInsert() {
    if (onInsert) {
      onInsert(buildInsertText());
      onClose();
    }
  }

  function reset() {
    setMusResult(null);
    setAttrResult(null);
    setError('');
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center">
              <Calculator className="w-5 h-5 text-violet-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Calculadora de Muestreo</h2>
              <p className="text-xs text-gray-500">NIA 530 — AICPA Audit Sampling</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Method tabs */}
        <div className="flex gap-1 p-1 mx-6 mt-4 bg-gray-100 rounded-xl">
          <button
            onClick={() => { setMethod('MUS'); reset(); }}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              method === 'MUS' ? 'bg-white text-violet-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <TrendingUp className="w-4 h-4" />
            MUS (Monetary Unit)
          </button>
          <button
            onClick={() => { setMethod('ATTRIBUTE'); reset(); }}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              method === 'ATTRIBUTE' ? 'bg-white text-violet-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Hash className="w-4 h-4" />
            Atributos (Controles)
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-4 space-y-4">

          {/* ── MUS form ── */}
          {method === 'MUS' && (
            <div className="space-y-3">
              <p className="text-xs text-gray-500">
                MUS aplica para pruebas sustantivas de detalle sobre saldos monetarios.
                Cada unidad monetaria tiene igual probabilidad de selección.
              </p>

              <div className="grid grid-cols-2 gap-3">
                <NumField
                  label="Valor en libros (BV)"
                  hint="Saldo total de la población auditada"
                  value={bookValue} onChange={setBookValue}
                  placeholder="100,000,000"
                />
                <NumField
                  label="Materialidad de ejecución (TM)"
                  hint="ME calculada en PT-A4"
                  value={tolerableMisstatement} onChange={setTolerableMisstatement}
                  placeholder="3,000,000"
                />
                <NumField
                  label="Error esperado (EE)"
                  hint="Default 0 — sin error anticipado"
                  value={expectedMisstatement} onChange={setExpectedMisstatement}
                  placeholder="0"
                />
                <SelectField
                  label="Nivel de confianza"
                  value={String(musConfidence)}
                  onChange={(v) => setMusConfidence(parseInt(v) as 70|75|80|90|95|99)}
                  options={[
                    { value: '70', label: '70%' },
                    { value: '75', label: '75%' },
                    { value: '80', label: '80%' },
                    { value: '90', label: '90%' },
                    { value: '95', label: '95% (recomendado)' },
                    { value: '99', label: '99% (alto riesgo)' },
                  ]}
                />
              </div>

              <button
                onClick={runMUS}
                disabled={loading || !bookValue || !tolerableMisstatement}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-violet-600 text-white font-semibold rounded-xl hover:bg-violet-700 disabled:opacity-50 transition-colors"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calculator className="w-4 h-4" />}
                Calcular tamaño de muestra MUS
              </button>
            </div>
          )}

          {/* ── Attribute form ── */}
          {method === 'ATTRIBUTE' && (
            <div className="space-y-3">
              <p className="text-xs text-gray-500">
                Muestreo por atributos aplica para pruebas de controles
                (tasa de desviación de un control respecto al diseño).
              </p>

              <div className="grid grid-cols-2 gap-3">
                <NumField
                  label="Tamaño población (opcional)"
                  hint="Si < 1,000, se aplica corrección de pob. finita"
                  value={populationSize} onChange={setPopulationSize}
                  placeholder="500"
                />
                <SelectField
                  label="Nivel de confianza"
                  value={String(attrConfidence)}
                  onChange={(v) => setAttrConfidence(parseInt(v) as 90|95|99)}
                  options={[
                    { value: '90', label: '90%' },
                    { value: '95', label: '95% (recomendado)' },
                    { value: '99', label: '99% (alto riesgo)' },
                  ]}
                />
                <NumField
                  label="Tasa desviación tolerable (%)"
                  hint="1-10% — mayor riesgo = menor"
                  value={tolerableDeviation} onChange={setTolerableDeviation}
                  placeholder="5"
                />
                <NumField
                  label="Tasa desviación esperada (%)"
                  hint="Default 0"
                  value={expectedDeviation} onChange={setExpectedDeviation}
                  placeholder="0"
                />
              </div>

              <button
                onClick={runAttribute}
                disabled={loading || !tolerableDeviation}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-violet-600 text-white font-semibold rounded-xl hover:bg-violet-700 disabled:opacity-50 transition-colors"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calculator className="w-4 h-4" />}
                Calcular tamaño de muestra por Atributos
              </button>
            </div>
          )}

          {/* ── Error ── */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <p className="text-sm text-red-700 font-medium">Error</p>
              <p className="text-xs text-red-600 mt-1">{error}</p>
            </div>
          )}

          {/* ── MUS Result ── */}
          {musResult && (
            <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-violet-600" />
                <h3 className="font-bold text-violet-900">Resultado MUS</h3>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Metric label="Tamaño de muestra" value={musResult.sample_size.toLocaleString('es-CL')} highlight />
                <Metric label="Intervalo de muestreo" value={musResult.sampling_interval.toLocaleString('es-CL', { maximumFractionDigits: 2 })} />
                <Metric label="Factor de confianza" value={String(musResult.confidence_factor)} />
                <Metric label="Factor de expansión" value={String(musResult.expansion_factor)} />
              </div>
              <p className="text-xs text-violet-800 italic leading-relaxed">{musResult.methodology_note}</p>
              <ActionRow onCopy={handleCopy} onInsert={onInsert ? handleInsert : undefined} />
            </div>
          )}

          {/* ── Attribute Result ── */}
          {attrResult && (
            <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-violet-600" />
                <h3 className="font-bold text-violet-900">Resultado Atributos</h3>
              </div>
              <Metric label="Tamaño de muestra" value={attrResult.sample_size.toLocaleString('es-CL')} highlight />
              <p className="text-xs text-violet-800 italic leading-relaxed">{attrResult.methodology_note}</p>
              <ActionRow onCopy={handleCopy} onInsert={onInsert ? handleInsert : undefined} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Tiny components ─────────────────────────────────────────────────────────

function NumField({
  label, hint, value, onChange, placeholder,
}: { label: string; hint?: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-700 mb-1">{label}</label>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent"
      />
      {hint && <p className="text-[10px] text-gray-400 mt-0.5">{hint}</p>}
    </div>
  );
}

function SelectField({
  label, value, onChange, options,
}: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-700 mb-1">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-400 bg-white"
      >
        {options.map(o => (<option key={o.value} value={o.value}>{o.label}</option>))}
      </select>
    </div>
  );
}

function Metric({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="bg-white rounded-lg p-2.5 border border-violet-100">
      <p className="text-[10px] uppercase tracking-wide text-gray-500 font-medium">{label}</p>
      <p className={`mt-0.5 font-bold ${highlight ? 'text-2xl text-violet-700' : 'text-base text-gray-800'}`}>
        {value}
      </p>
    </div>
  );
}

function ActionRow({ onCopy, onInsert }: { onCopy: () => void; onInsert?: () => void }) {
  return (
    <div className="flex items-center gap-2 pt-2 border-t border-violet-200">
      <button
        onClick={onCopy}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-violet-200 text-violet-700 text-xs font-medium rounded-lg hover:bg-violet-50 transition-colors"
      >
        <Copy className="w-3 h-3" />
        Copiar al portapapeles
      </button>
      {onInsert && (
        <button
          onClick={onInsert}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 text-white text-xs font-semibold rounded-lg hover:bg-violet-700 transition-colors"
        >
          <FileDigit className="w-3 h-3" />
          Insertar en sección
        </button>
      )}
    </div>
  );
}
