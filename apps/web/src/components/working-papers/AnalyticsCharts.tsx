'use client';

import {
  BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LabelList,
} from 'recharts';

// ─── Helpers ──────────────────────────────────────────────────────────────────
// Column names in these MATRIX sections are auditor-editable (renamed/added via
// MatrixGridPanel), so we match loosely by normalized substring instead of an
// exact key — same defensive stance as the rest of the MATRIX tooling.

const ACCENT_MAP: Record<string, string> = {
  á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ñ: 'n', ü: 'u',
};

function normalize(s: string): string {
  return s.toLowerCase().split('').map(ch => ACCENT_MAP[ch] ?? ch).join('');
}

function findKey(row: Record<string, unknown>, patterns: string[]): string | undefined {
  const keys = Object.keys(row);
  for (const p of patterns) {
    const found = keys.find(k => normalize(k).includes(p));
    if (found) return found;
  }
  return undefined;
}

function parseNumeric(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v !== 'string') return NaN;
  const cleaned = v.replace(/[^\d.,-]/g, '').replace(/,/g, '');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : NaN;
}

/** Compact label for bar-end value tags: 1.5M, 320K, 12.3, etc. */
function fmtLabel(n: number): string {
  if (!Number.isFinite(n)) return '';
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(1);
}

interface Props {
  rows: Record<string, unknown>[];
}

// ─── Razones Financieras — Actual vs. Año Anterior ────────────────────────────

export function RatioTrendChart({ rows }: Props) {
  if (rows.length === 0) return null;
  const sample = rows[0];
  const nameKey     = findKey(sample, ['razon', 'indicador']) ?? Object.keys(sample)[0];
  const actualKey   = findKey(sample, ['actual']);
  const anteriorKey = findKey(sample, ['anterior']);
  if (!actualKey || !anteriorKey) return null;

  const data = rows
    .map(r => ({
      name:     String(r[nameKey] ?? ''),
      Actual:   parseNumeric(r[actualKey]),
      Anterior: parseNumeric(r[anteriorKey]),
    }))
    .filter(d => d.name && (Number.isFinite(d.Actual) || Number.isFinite(d.Anterior)));

  if (data.length === 0) return null;

  return (
    <div className="mb-3 bg-white border border-gray-100 rounded-xl p-3">
      <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">
        Comparativo visual — Año Actual vs. Año Anterior
      </p>
      <ResponsiveContainer width="100%" height={Math.max(220, data.length * 34)}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 4 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 10 }} />
          <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 10 }} />
          <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="Anterior" fill="#94a3b8" radius={[0, 4, 4, 0]}>
            <LabelList dataKey="Anterior" position="right" formatter={fmtLabel} style={{ fontSize: 9, fill: '#64748b' }} />
          </Bar>
          <Bar dataKey="Actual" fill="#4f46e5" radius={[0, 4, 4, 0]}>
            <LabelList dataKey="Actual" position="right" formatter={fmtLabel} style={{ fontSize: 9, fill: '#4f46e5', fontWeight: 600 }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Concentración de Saldos — Top cuentas por grupo ──────────────────────────

const GROUP_COLORS: Array<[string, string]> = [
  ['activo corriente', '#3b82f6'],
  ['activo no corriente', '#0ea5e9'],
  ['pasivo corriente', '#f59e0b'],
  ['pasivo no corriente', '#f97316'],
  ['patrimonio', '#10b981'],
  ['ingreso', '#8b5cf6'],
  ['costo', '#ef4444'],
  ['gasto', '#ef4444'],
];

function colorForGroup(g: string): string {
  const norm = normalize(g);
  for (const [key, color] of GROUP_COLORS) {
    if (norm.includes(key)) return color;
  }
  return '#64748b';
}

export function ConcentrationChart({ rows }: Props) {
  if (rows.length === 0) return null;
  const sample = rows[0];
  const nameKey   = findKey(sample, ['nombre', 'cuenta']) ?? Object.keys(sample)[0];
  const groupKey  = findKey(sample, ['grupo']);
  const amountKey = findKey(sample, ['saldo', 'monto']);
  if (!amountKey) return null;

  const data = rows
    .map(r => ({
      name:   String(r[nameKey] ?? ''),
      group:  groupKey ? String(r[groupKey] ?? '') : '',
      amount: Math.abs(parseNumeric(r[amountKey])),
    }))
    .filter(d => d.name && Number.isFinite(d.amount) && d.amount > 0)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 20);

  if (data.length === 0) return null;

  const groupsPresent = Array.from(new Set(data.map(d => d.group).filter(Boolean)));

  return (
    <div className="mb-3 bg-white border border-gray-100 rounded-xl p-3">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
          Concentración visual por cuenta
        </p>
        {groupsPresent.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            {groupsPresent.map(g => (
              <span key={g} className="flex items-center gap-1 text-[10px] text-gray-500">
                <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: colorForGroup(g) }} />
                {g}
              </span>
            ))}
          </div>
        )}
      </div>
      <ResponsiveContainer width="100%" height={Math.max(220, data.length * 26)}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 4 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 10 }} />
          <YAxis type="category" dataKey="name" width={160} tick={{ fontSize: 10 }} />
          <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} formatter={(v: number) => v.toLocaleString('es-SV')} />
          <Bar dataKey="amount" radius={[0, 4, 4, 0]}>
            {data.map((d, i) => <Cell key={i} fill={colorForGroup(d.group)} />)}
            <LabelList dataKey="amount" position="right" formatter={fmtLabel} style={{ fontSize: 9, fill: '#475569', fontWeight: 600 }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
