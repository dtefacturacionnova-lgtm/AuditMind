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

// ─── Mayores Variaciones — Top N por magnitud (Análisis Horizontal, NIA 520) ──

function findVarianceKey(row: Record<string, unknown>): string | undefined {
  const keys = Object.keys(row).filter(k => k.includes('%'));
  if (keys.length === 0) return undefined;
  return keys.find(k => normalize(k).includes('actual')) ?? keys[0];
}

function severityColor(absPct: number): string {
  if (absPct >= 20) return '#ef4444';
  if (absPct >= 10) return '#f59e0b';
  return '#10b981';
}

export function VariationChart({ rows }: Props) {
  if (rows.length === 0) return null;
  const sample = rows[0];
  const nameKey = findKey(sample, ['cuenta', 'codigo']) ?? Object.keys(sample)[0];
  const varKey  = findVarianceKey(sample);
  if (!varKey) return null;

  const data = rows
    .map(r => ({ name: String(r[nameKey] ?? ''), variacion: parseNumeric(r[varKey]) }))
    .filter(d => d.name && Number.isFinite(d.variacion))
    .sort((a, b) => Math.abs(b.variacion) - Math.abs(a.variacion))
    .slice(0, 12);

  if (data.length === 0) return null;

  return (
    <div className="mb-3 bg-white border border-gray-100 rounded-xl p-3">
      <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">
        Mayores variaciones — Top {data.length}
      </p>
      <ResponsiveContainer width="100%" height={Math.max(220, data.length * 28)}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 28, bottom: 4, left: 4 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 10 }} unit="%" />
          <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 10 }} />
          <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} formatter={(v: number) => `${v.toFixed(1)}%`} />
          <Bar dataKey="variacion" radius={[0, 4, 4, 0]}>
            {data.map((d, i) => <Cell key={i} fill={severityColor(Math.abs(d.variacion))} />)}
            <LabelList dataKey="variacion" position="right" formatter={(v: number) => `${Number(v).toFixed(1)}%`} style={{ fontSize: 9, fontWeight: 600, fill: '#334155' }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div className="flex items-center gap-3 mt-2">
        <span className="flex items-center gap-1 text-[10px] text-gray-500"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> ≥20%</span>
        <span className="flex items-center gap-1 text-[10px] text-gray-500"><span className="w-2 h-2 rounded-full bg-amber-500 inline-block" /> ≥10%</span>
        <span className="flex items-center gap-1 text-[10px] text-gray-500"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> &lt;10%</span>
      </div>
    </div>
  );
}

// ─── Impacto Neto de AJEs por Cuenta (Libro de AJEs, PT-FIN-B09 S1) ───────────

export function AjeImpactChart({ rows }: Props) {
  if (rows.length === 0) return null;
  const sample = rows[0];
  const debeNameKey  = findKey(sample, ['cuenta debe nombre', 'debe nombre']);
  const debeMontoKey = findKey(sample, ['monto debe']);
  const haberNameKey = findKey(sample, ['cuenta haber nombre', 'haber nombre']);
  const haberMontoKey = findKey(sample, ['monto haber']);
  if (!debeNameKey || !debeMontoKey || !haberNameKey || !haberMontoKey) return null;

  const net = new Map<string, number>();
  for (const r of rows) {
    const debeName = String(r[debeNameKey] ?? '').trim();
    const debeMonto = parseNumeric(r[debeMontoKey]);
    if (debeName && Number.isFinite(debeMonto)) net.set(debeName, (net.get(debeName) ?? 0) + debeMonto);

    const haberName = String(r[haberNameKey] ?? '').trim();
    const haberMonto = parseNumeric(r[haberMontoKey]);
    if (haberName && Number.isFinite(haberMonto)) net.set(haberName, (net.get(haberName) ?? 0) - haberMonto);
  }

  const data = Array.from(net.entries())
    .map(([name, amount]) => ({ name, amount }))
    .filter(d => d.amount !== 0)
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
    .slice(0, 15);

  if (data.length === 0) return null;

  return (
    <div className="mb-3 bg-white border border-gray-100 rounded-xl p-3">
      <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">
        Impacto neto de los AJEs por cuenta
      </p>
      <ResponsiveContainer width="100%" height={Math.max(220, data.length * 26)}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 28, bottom: 4, left: 4 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 10 }} />
          <YAxis type="category" dataKey="name" width={160} tick={{ fontSize: 10 }} />
          <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} formatter={(v: number) => fmtLabel(Number(v))} />
          <Bar dataKey="amount" radius={[0, 4, 4, 0]}>
            {data.map((d, i) => <Cell key={i} fill={d.amount >= 0 ? '#4f46e5' : '#ef4444'} />)}
            <LabelList dataKey="amount" position="right" formatter={fmtLabel} style={{ fontSize: 9, fontWeight: 600, fill: '#334155' }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div className="flex items-center gap-3 mt-2">
        <span className="flex items-center gap-1 text-[10px] text-gray-500"><span className="w-2 h-2 rounded-full bg-indigo-600 inline-block" /> Neto Débito</span>
        <span className="flex items-center gap-1 text-[10px] text-gray-500"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> Neto Crédito</span>
      </div>
    </div>
  );
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
