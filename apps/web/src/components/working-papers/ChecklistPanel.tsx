'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, MinusCircle } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ChecklistItem {
  label:  string;
  value:  'SI' | 'NO' | 'NA' | '';
  notes:  string;
}

export interface ChecklistValue {
  items:      ChecklistItem[];
  conclusion: string;
  fundamento: string;
}

interface Props {
  options:  string[];           // From section.options — item labels; CONCL:xxx = conclusion options
  value:    ChecklistValue | null;
  onChange: (v: ChecklistValue) => void;
  readOnly?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CONCL_PREFIX = 'CONCL:';

function parseOptions(options: string[]): { items: string[]; conclusionOptions: string[] } {
  const items: string[] = [];
  const conclusionOptions: string[] = [];
  for (const opt of options) {
    if (opt.startsWith(CONCL_PREFIX)) conclusionOptions.push(opt.slice(CONCL_PREFIX.length));
    else items.push(opt);
  }
  return { items, conclusionOptions };
}

function initFromOptions(options: string[]): ChecklistValue {
  const { items } = parseOptions(options);
  return {
    items:      items.map(label => ({ label, value: '', notes: '' })),
    conclusion: '',
    fundamento: '',
  };
}

function mergeWithOptions(stored: ChecklistValue, options: string[]): ChecklistValue {
  const { items: optionItems } = parseOptions(options);
  // Keep stored responses; add missing items; drop items not in options
  const merged = optionItems.map(label => {
    const existing = stored.items.find(i => i.label === label);
    return existing ?? { label, value: '' as const, notes: '' };
  });
  return { items: merged, conclusion: stored.conclusion, fundamento: stored.fundamento };
}

// ─── Pill button ──────────────────────────────────────────────────────────────

interface PillProps {
  label:    string;
  kind:     'SI' | 'NO' | 'NA';
  selected: boolean;
  onClick:  () => void;
}

const PILL_STYLES: Record<'SI' | 'NO' | 'NA', { active: string; hover: string }> = {
  SI: {
    active: 'bg-emerald-600 text-white border-emerald-600',
    hover:  'text-gray-500 border-gray-200 hover:border-emerald-300 hover:text-emerald-700',
  },
  NO: {
    active: 'bg-red-500 text-white border-red-500',
    hover:  'text-gray-500 border-gray-200 hover:border-red-300 hover:text-red-600',
  },
  NA: {
    active: 'bg-gray-400 text-white border-gray-400',
    hover:  'text-gray-400 border-gray-200 hover:border-gray-400 hover:text-gray-600',
  },
};

function Pill({ label, kind, selected, onClick }: PillProps) {
  const { active, hover } = PILL_STYLES[kind];
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-1.5 py-0.5 rounded text-[11px] font-medium border transition-colors ${selected ? active : hover}`}
    >
      {label}
    </button>
  );
}

// ─── Read-only badge ──────────────────────────────────────────────────────────

function Badge({ value }: { value: 'SI' | 'NO' | 'NA' | '' }) {
  if (value === 'SI') return <span className="inline-flex items-center gap-1 text-xs text-emerald-700"><CheckCircle2 className="w-3.5 h-3.5" />Sí</span>;
  if (value === 'NO') return <span className="inline-flex items-center gap-1 text-xs text-red-600"><XCircle className="w-3.5 h-3.5" />No</span>;
  if (value === 'NA') return <span className="inline-flex items-center gap-1 text-xs text-gray-500"><MinusCircle className="w-3.5 h-3.5" />N/A</span>;
  return <span className="text-xs text-gray-300 italic">—</span>;
}

// ─── Panel ────────────────────────────────────────────────────────────────────

export function ChecklistPanel({ options, value, onChange, readOnly = false }: Props) {
  const { items: optionItems, conclusionOptions } = parseOptions(options);

  const [state, setState] = useState<ChecklistValue>(() => {
    if (!value) return initFromOptions(options);
    return mergeWithOptions(value, options);
  });

  // Sync if value prop changes externally
  useEffect(() => {
    if (!value) {
      setState(initFromOptions(options));
    } else {
      setState(mergeWithOptions(value, options));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(value), JSON.stringify(options)]);

  function updateItem(index: number, patch: Partial<ChecklistItem>) {
    const next = { ...state, items: state.items.map((it, i) => i === index ? { ...it, ...patch } : it) };
    setState(next);
    onChange(next);
  }

  function updateConclusion(c: string) {
    const next = { ...state, conclusion: state.conclusion === c ? '' : c };
    setState(next);
    onChange(next);
  }

  function updateFundamento(f: string) {
    const next = { ...state, fundamento: f };
    setState(next);
    onChange(next);
  }

  const inputCls =
    'w-full text-xs text-gray-800 bg-transparent border-b border-transparent ' +
    'hover:border-gray-200 focus:border-blue-400 focus:outline-none py-0.5 ' +
    'placeholder:text-gray-300 transition-colors disabled:cursor-default resize-none';

  const sI = state.items.filter(i => i.value === 'SI').length;
  const sNO = state.items.filter(i => i.value === 'NO').length;

  return (
    <div className="mt-1 space-y-3">
      {/* ── Items table ──────────────────────────────────────── */}
      {optionItems.length > 0 && (
        <div className="border border-gray-100 rounded-xl overflow-hidden">
          {/* Summary strip */}
          {(sI > 0 || sNO > 0) && (
            <div className="flex items-center gap-4 px-4 py-1.5 bg-gray-50 border-b border-gray-100">
              {sI > 0 && (
                <span className="flex items-center gap-1 text-[11px] text-emerald-700">
                  <CheckCircle2 className="w-3 h-3" />{sI} Sí
                </span>
              )}
              {sNO > 0 && (
                <span className="flex items-center gap-1 text-[11px] text-red-600">
                  <XCircle className="w-3 h-3" />{sNO} No
                </span>
              )}
              {state.items.filter(i => i.value === 'NA').length > 0 && (
                <span className="flex items-center gap-1 text-[11px] text-gray-500">
                  <MinusCircle className="w-3 h-3" />{state.items.filter(i => i.value === 'NA').length} N/A
                </span>
              )}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-white border-b border-gray-100">
                  <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wide w-7">#</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Criterio</th>
                  <th className="px-3 py-2 text-center text-[10px] font-semibold text-gray-400 uppercase tracking-wide w-24">Evaluación</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wide min-w-[160px]">Evidencia / Notas</th>
                </tr>
              </thead>
              <tbody>
                {state.items.map((item, idx) => (
                  <tr
                    key={idx}
                    className="group border-b border-gray-50 last:border-0 hover:bg-blue-50/20 transition-colors"
                  >
                    <td className="px-3 py-2.5 w-7 align-middle">
                      <span className="text-[11px] text-gray-400 font-mono tabular-nums">{idx + 1}</span>
                    </td>
                    <td className="px-3 py-2.5 align-middle">
                      <span className="text-xs text-gray-700">{item.label}</span>
                    </td>
                    <td className="px-3 py-2.5 align-middle">
                      {readOnly ? (
                        <div className="flex justify-center">
                          <Badge value={item.value} />
                        </div>
                      ) : (
                        <div className="flex justify-center gap-1">
                          <Pill label="Sí"  kind="SI" selected={item.value === 'SI'} onClick={() => updateItem(idx, { value: item.value === 'SI' ? '' : 'SI' })} />
                          <Pill label="No"  kind="NO" selected={item.value === 'NO'} onClick={() => updateItem(idx, { value: item.value === 'NO' ? '' : 'NO' })} />
                          <Pill label="N/A" kind="NA" selected={item.value === 'NA'} onClick={() => updateItem(idx, { value: item.value === 'NA' ? '' : 'NA' })} />
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 align-middle min-w-[160px]">
                      <textarea
                        value={item.notes}
                        onChange={e => updateItem(idx, { notes: e.target.value })}
                        disabled={readOnly}
                        rows={1}
                        placeholder="Referencia o evidencia…"
                        className={`${inputCls}`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Conclusion options ────────────────────────────────── */}
      {conclusionOptions.length > 0 && (
        <div className="border border-gray-100 rounded-xl px-4 py-3 space-y-2">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
            Evaluación global
          </p>
          <div className="flex flex-wrap gap-2">
            {conclusionOptions.map(opt => (
              <button
                key={opt}
                type="button"
                disabled={readOnly}
                onClick={() => updateConclusion(opt)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors disabled:cursor-default ${
                  state.conclusion === opt
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'text-gray-600 border-gray-200 hover:border-blue-300 hover:text-blue-700 disabled:hover:border-gray-200 disabled:hover:text-gray-600'
                }`}
              >
                {state.conclusion === opt && <span className="mr-1">✓</span>}
                {opt}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Fundamento ───────────────────────────────────────── */}
      <div className="space-y-1">
        <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
          Fundamento / Observaciones
        </label>
        <textarea
          value={state.fundamento}
          onChange={e => updateFundamento(e.target.value)}
          disabled={readOnly}
          rows={3}
          placeholder="Describa el fundamento de la evaluación o situaciones identificadas…"
          className="w-full text-xs text-gray-800 border border-gray-100 rounded-lg px-3 py-2
            bg-white focus:outline-none focus:border-blue-300 placeholder:text-gray-300
            transition-colors resize-y disabled:cursor-default disabled:bg-gray-50"
        />
      </div>
    </div>
  );
}
