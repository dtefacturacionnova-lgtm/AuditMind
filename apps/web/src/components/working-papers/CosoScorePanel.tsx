'use client';

import {
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList,
} from 'recharts';
import { ShieldCheck } from 'lucide-react';
import type { PaperSection } from '@/hooks/useWorkingPaperGraph';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ACCENT_MAP: Record<string, string> = { á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ñ: 'n', ü: 'u' };
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
function parseRows(value: unknown): Record<string, string>[] {
  return Array.isArray(value) ? (value as Record<string, string>[]) : [];
}
/** Extrae el número inicial 1-4 de la celda "Calificación" (ej. "2 - Confiable" → 2). */
function parseCalificacion(v: unknown): number | null {
  if (v == null) return null;
  const m = String(v).match(/^\s*([1-4])/);
  return m ? Number(m[1]) : null;
}

// ─── Modelo de ponderación — igual al instrumento de referencia del usuario ───
// Escala de riesgo 1 (Efectivo) a 4 (No Confiable) por principio, promediada
// por componente y ponderada 25/25/20/15/15. Rango resultante 100-400, con
// las mismas bandas de interpretación del instrumento original.

const COMPONENTS: { sectionKey: string; label: string; short: string; weight: number }[] = [
  { sectionKey: 'S1', label: 'Entorno de Control',           short: 'Entorno',      weight: 25 },
  { sectionKey: 'S2', label: 'Evaluación de Riesgos',         short: 'Riesgos',      weight: 25 },
  { sectionKey: 'S3', label: 'Actividades de Control',        short: 'Controles',    weight: 20 },
  { sectionKey: 'S4', label: 'Información y Comunicación',    short: 'Info/Com.',    weight: 15 },
  { sectionKey: 'S5', label: 'Actividades de Monitoreo',      short: 'Monitoreo',    weight: 15 },
];

const BANDS = [
  { min: 100, max: 175, label: 'Efectivo',        cls: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  { min: 176, max: 250, label: 'Confiable',        cls: 'bg-amber-400',   text: 'text-amber-700',   bg: 'bg-amber-50',   border: 'border-amber-200' },
  { min: 251, max: 325, label: 'Poco Confiable',   cls: 'bg-orange-500',  text: 'text-orange-700',  bg: 'bg-orange-50',  border: 'border-orange-200' },
  { min: 326, max: 400, label: 'No Confiable',     cls: 'bg-red-500',     text: 'text-red-700',     bg: 'bg-red-50',     border: 'border-red-200' },
];

function bandFor(score: number) {
  return BANDS.find(b => score >= b.min && score <= b.max) ?? BANDS[BANDS.length - 1];
}

function riskColor(avg: number): string {
  if (avg <= 1.75) return '#10b981';   // Riesgo Bajo
  if (avg <= 2.5)  return '#f59e0b';   // Riesgo Moderado
  return '#ef4444';                    // En Riesgo
}

// ─── Panel ──────────────────────────────────────────────────────────────────

interface Props {
  sections: PaperSection[];
}

export function CosoScorePanel({ sections }: Props) {
  const byKey = new Map(sections.map(s => [s.sectionKey, s]));

  const componentData = COMPONENTS.map(c => {
    const section = byKey.get(c.sectionKey);
    const rows = parseRows(section?.value);
    const califKey = rows.length > 0 ? findKey(rows[0], ['calificacion']) : undefined;
    const principioKey = rows.length > 0 ? findKey(rows[0], ['principio']) : undefined;

    const principles = rows
      .map(r => ({
        principio: principioKey ? String(r[principioKey] ?? '') : '',
        score: califKey ? parseCalificacion(r[califKey]) : null,
      }))
      .filter(p => p.principio);

    const scored = principles.filter((p): p is { principio: string; score: number } => p.score !== null);
    const avg = scored.length > 0 ? scored.reduce((s, p) => s + p.score, 0) / scored.length : null;
    const puntaje = avg !== null ? avg * c.weight : null;

    return { ...c, principles, avg, puntaje, answered: scored.length, total: principles.length };
  });

  const totalAnswered = componentData.reduce((s, c) => s + c.answered, 0);
  const totalPrinciples = componentData.reduce((s, c) => s + c.total, 0);
  const allComplete = componentData.every(c => c.total > 0 && c.answered === c.total);
  const anyData = componentData.some(c => c.answered > 0);

  if (!anyData) {
    return (
      <div className="mb-3 bg-gray-50 border border-dashed border-gray-200 rounded-xl p-4 text-center">
        <p className="text-xs text-gray-400">
          El Puntaje Ponderado del SCI se calculará automáticamente cuando complete la columna &quot;Calificación&quot; (1-4) en las pestañas de los 5 componentes.
        </p>
      </div>
    );
  }

  const totalScore = componentData.reduce((s, c) => s + (c.puntaje ?? 0), 0);
  const band = bandFor(totalScore);
  const pct = Math.min(100, Math.max(0, ((totalScore - 100) / 300) * 100));

  const radarData = componentData.map(c => ({ component: c.short, riesgo: c.avg ?? 0, fullMark: 4 }));

  const allPrinciplesData = componentData.flatMap(c =>
    c.principles
      .filter(p => p.score !== null)
      .map(p => {
        const m = p.principio.match(/^(P\d+)/);
        return { short: m ? m[1] : p.principio, name: p.principio, score: p.score as number, componentShort: c.short };
      }),
  );

  return (
    <div className="mb-4 space-y-3">
      <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <ShieldCheck className="w-4 h-4 text-violet-500" />
          <p className="text-xs font-bold text-gray-600 uppercase tracking-wide">Puntaje Ponderado del SCI</p>
          {!allComplete && (
            <span className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
              {totalAnswered}/{totalPrinciples} principios calificados — puntaje parcial
            </span>
          )}
        </div>

        {/* Medidor segmentado 100-400 */}
        <div className="flex items-end gap-4 mb-4">
          <div>
            <p className={`text-3xl font-bold tabular-nums ${band.text}`}>{totalScore.toFixed(0)}</p>
            <p className="text-[10px] text-gray-400">de 100 a 400</p>
          </div>
          <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${band.bg} ${band.text} border ${band.border} mb-1`}>
            {band.label}
          </span>
        </div>
        <div className="relative h-3 rounded-full overflow-hidden flex mb-1">
          {BANDS.map(b => (
            <div key={b.label} className={`${b.cls} opacity-25`} style={{ width: `${((b.max - b.min + (b.min === 100 ? 1 : 0)) / 300) * 100}%` }} />
          ))}
          <div
            className="absolute top-0 h-3 w-1.5 bg-gray-800 rounded-full shadow"
            style={{ left: `calc(${pct}% - 3px)` }}
            title={`Puntaje: ${totalScore.toFixed(1)}`}
          />
        </div>
        <div className="flex justify-between text-[9px] text-gray-400 mb-4">
          <span>100 · Efectivo</span><span>175</span><span>250</span><span>325</span><span>400 · No Confiable</span>
        </div>

        {/* Radar por componente + tabla de contribución */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Forma del SCI — riesgo promedio por componente (1-4)</p>
            <ResponsiveContainer width="100%" height={220}>
              <RadarChart data={radarData} outerRadius="75%">
                <PolarGrid stroke="#e5e7eb" />
                <PolarAngleAxis dataKey="component" tick={{ fontSize: 10 }} />
                <PolarRadiusAxis domain={[0, 4]} tick={{ fontSize: 9 }} tickCount={5} />
                <Radar dataKey="riesgo" stroke="#7c3aed" fill="#7c3aed" fillOpacity={0.25} />
                <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} formatter={(v: number) => v.toFixed(2)} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Contribución al puntaje por componente</p>
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-gray-400 border-b border-gray-100">
                  <th className="text-left font-medium py-1">Componente</th>
                  <th className="text-right font-medium py-1">Riesgo prom.</th>
                  <th className="text-right font-medium py-1">Peso</th>
                  <th className="text-right font-medium py-1">Puntaje</th>
                </tr>
              </thead>
              <tbody>
                {componentData.map(c => (
                  <tr key={c.sectionKey} className="border-b border-gray-50 last:border-0">
                    <td className="py-1.5 text-gray-700">{c.label}</td>
                    <td className="py-1.5 text-right tabular-nums text-gray-600">{c.avg !== null ? c.avg.toFixed(2) : '—'}</td>
                    <td className="py-1.5 text-right tabular-nums text-gray-400">{c.weight}%</td>
                    <td className="py-1.5 text-right tabular-nums font-semibold text-gray-800">{c.puntaje !== null ? c.puntaje.toFixed(1) : '—'}</td>
                  </tr>
                ))}
                <tr className="font-bold">
                  <td className="py-1.5 text-gray-700" colSpan={3}>Total</td>
                  <td className={`py-1.5 text-right tabular-nums ${band.text}`}>{totalScore.toFixed(1)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Barra por los 17 principios */}
      {allPrinciplesData.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Riesgo por principio (1-4) — verde ≤1.75 · ámbar ≤2.5 · rojo &gt;2.5</p>
          <ResponsiveContainer width="100%" height={Math.max(180, allPrinciplesData.length * 22)}>
            <BarChart data={allPrinciplesData} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 4 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" domain={[0, 4]} tick={{ fontSize: 9 }} />
              <YAxis type="category" dataKey="short" width={36} tick={{ fontSize: 10 }} />
              <Tooltip
                contentStyle={{ fontSize: 11, borderRadius: 8, maxWidth: 280 }}
                formatter={(v: number) => v.toFixed(2)}
                labelFormatter={(_label, payload) => (payload?.[0]?.payload as { name?: string } | undefined)?.name ?? _label}
              />
              <Bar dataKey="score" radius={[0, 4, 4, 0]}>
                {allPrinciplesData.map((d, i) => <Cell key={i} fill={riskColor(d.score)} />)}
                <LabelList dataKey="score" position="right" formatter={(v: number) => v.toFixed(1)} style={{ fontSize: 9, fill: '#64748b' }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
