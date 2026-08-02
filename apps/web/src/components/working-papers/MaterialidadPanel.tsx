'use client';

import { useState, useMemo } from 'react';
import { Calculator, Save, Loader2, Info } from 'lucide-react';
import type { PaperSection } from '@/hooks/useWorkingPaperGraph';

// ─── Constants ────────────────────────────────────────────────────────────────

const BASE_LABELS: Record<string, string> = {
  UTILIDAD_ANTES_IMPUESTOS: 'Utilidad antes de impuestos',
  ACTIVOS_TOTALES:          'Activos totales',
  INGRESOS_TOTALES:         'Ingresos totales',
  PATRIMONIO_NETO:          'Patrimonio neto',
  GASTOS_TOTALES:           'Gastos totales',
  CAPITAL_TRABAJO:          'Capital de trabajo',
};

const BASE_HINTS: Record<string, string> = {
  UTILIDAD_ANTES_IMPUESTOS: 'Rango NIA 320: 5% – 10%',
  ACTIVOS_TOTALES:          'Rango NIA 320: 0.5% – 1%',
  INGRESOS_TOTALES:         'Rango NIA 320: 1% – 3%',
  PATRIMONIO_NETO:          'Rango NIA 320: 1% – 5%',
  GASTOS_TOTALES:           'Rango NIA 320: 1% – 2%',
  CAPITAL_TRABAJO:          'Rango NIA 320: 5% – 10%',
};

function fmtCurrency(n: number) {
  return n.toLocaleString('es-SV', {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface MaterialidadPanelProps {
  sections: PaperSection[];
  readonly: boolean;
  onSave: (key: string, value: unknown) => void | Promise<void>;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function MaterialidadPanel({ sections, readonly, onSave }: MaterialidadPanelProps) {
  const s1  = sections.find(s => s.sectionKey === 'S1');
  const s1b = sections.find(s => s.sectionKey === 'S1b');
  const s2  = sections.find(s => s.sectionKey === 'S2');
  const s3  = sections.find(s => s.sectionKey === 'S3');
  const s4  = sections.find(s => s.sectionKey === 'S4');
  const s5  = sections.find(s => s.sectionKey === 'S5');

  const [baseType,   setBaseType]   = useState<string>((s1?.value as string) ?? '');
  const [baseAmount, setBaseAmount] = useState<string>(s1b?.value != null ? String(s1b.value) : '');
  const [percentage, setPercentage] = useState<string>(s2?.value  != null ? String(s2.value)  : '');
  const [saving, setSaving] = useState(false);

  const computed = useMemo(() => {
    const base = parseFloat(baseAmount) || 0;
    const pct  = parseFloat(percentage) || 0;
    if (base <= 0 || pct <= 0) return null;
    const mg = base * (pct / 100);
    return { mg, me: mg * 0.60, uae: mg * 0.05 };
  }, [baseAmount, percentage]);

  const canSave = !readonly && !!baseType && parseFloat(baseAmount) > 0 && parseFloat(percentage) > 0;

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    try {
      await Promise.resolve(onSave('S1',  baseType));
      await Promise.resolve(onSave('S1b', parseFloat(baseAmount)));
      await Promise.resolve(onSave('S2',  parseFloat(percentage)));
      if (computed) {
        await Promise.resolve(onSave('S3', computed.mg));
        await Promise.resolve(onSave('S4', computed.me));
        await Promise.resolve(onSave('S5', computed.uae));
      }
    } finally {
      setSaving(false);
    }
  }

  const savedMG  = s3?.value != null ? Number(s3.value) : null;
  const savedME  = s4?.value != null ? Number(s4.value) : null;
  const savedUAE = s5?.value != null ? Number(s5.value) : null;

  return (
    <div className="border border-violet-200 bg-violet-50/40 rounded-2xl p-5 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Calculator className="w-5 h-5 text-violet-600" />
        <span className="font-semibold text-violet-900 text-sm">
          Cálculo Automático de Materialidad — NIA 320
        </span>
      </div>

      {/* Row 1: base type + base amount */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
            Base de Cálculo *
          </label>
          <select
            value={baseType}
            onChange={e => setBaseType(e.target.value)}
            disabled={readonly}
            className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-violet-500 bg-white disabled:bg-gray-50"
          >
            <option value="">— Seleccionar —</option>
            {Object.entries(BASE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          {baseType && (
            <p className="text-xs text-violet-600 flex items-center gap-1">
              <Info className="w-3 h-3 shrink-0" />
              {BASE_HINTS[baseType]}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
            Monto de la Base (USD) *
          </label>
          <input
            type="number"
            min={0}
            step={1000}
            value={baseAmount}
            onChange={e => setBaseAmount(e.target.value)}
            disabled={readonly}
            placeholder="Ej: 1000000"
            className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-violet-500 bg-white disabled:bg-gray-50 font-mono"
          />
          <p className="text-xs text-gray-400">Tomar de B-00 S4 o de los EEFF del cliente</p>
        </div>
      </div>

      {/* Row 2: percentage */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
            Porcentaje Aplicado (%) *
          </label>
          <input
            type="number"
            min={0}
            max={100}
            step={0.1}
            value={percentage}
            onChange={e => setPercentage(e.target.value)}
            disabled={readonly}
            placeholder="5.0"
            className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-violet-500 bg-white disabled:bg-gray-50 font-mono"
          />
        </div>
      </div>

      {/* Result boxes */}
      <div className="grid grid-cols-3 gap-3">
        <ResultBox
          label="MG — Materialidad Global"
          preview={computed?.mg ?? null}
          saved={savedMG}
          color="red"
        />
        <ResultBox
          label="ME — Ejecución (60% MG)"
          preview={computed?.me ?? null}
          saved={savedME}
          color="amber"
        />
        <ResultBox
          label="UAE — Trivial (5% MG)"
          preview={computed?.uae ?? null}
          saved={savedUAE}
          color="green"
        />
      </div>

      {/* Save button */}
      {!readonly && (
        <button
          onClick={handleSave}
          disabled={!canSave || saving}
          className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white text-sm font-semibold rounded-xl hover:bg-violet-700 disabled:opacity-40 transition-colors"
        >
          {saving
            ? <Loader2 className="w-4 h-4 animate-spin" />
            : <Save className="w-4 h-4" />}
          Calcular y guardar MG / ME / UAE
        </button>
      )}
    </div>
  );
}

// ─── Result Box ───────────────────────────────────────────────────────────────

function ResultBox({
  label, preview, saved, color,
}: {
  label:   string;
  preview: number | null;
  saved:   number | null;
  color:   'red' | 'amber' | 'green';
}) {
  const styles: Record<string, string> = {
    red:   'bg-red-50   border-red-200   text-red-800',
    amber: 'bg-amber-50 border-amber-200 text-amber-800',
    green: 'bg-green-50 border-green-200 text-green-800',
  };
  const display   = preview ?? saved;
  const isPreview = preview != null && preview !== saved;
  return (
    <div className={`border rounded-xl p-3 space-y-0.5 ${styles[color]}`}>
      <p className="text-xs font-medium opacity-70 leading-tight">{label}</p>
      <p className="text-base font-bold font-mono">
        {display != null ? fmtCurrency(display) : '—'}
      </p>
      {isPreview && saved != null && (
        <p className="text-xs opacity-50">Guardado: {fmtCurrency(saved)}</p>
      )}
    </div>
  );
}
