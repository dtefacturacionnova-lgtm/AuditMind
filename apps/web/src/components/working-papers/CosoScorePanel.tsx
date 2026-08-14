'use client';

import { useState } from 'react';
import {
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList, ReferenceLine,
} from 'recharts';
import { ShieldCheck, ChevronDown, ChevronRight, HelpCircle } from 'lucide-react';
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
/** "Sí" / "No" / "N-A" (or "N/A") answered per pregunta — anything else counts as unanswered. */
function normAnswer(raw: unknown): 'si' | 'no' | 'na' | null {
  const n = normalize(String(raw ?? '')).replace(/[^a-z]/g, '');
  if (n === 'si') return 'si';
  if (n === 'no') return 'no';
  if (n === 'na') return 'na';
  return null;
}

// ─── Modelo de ponderación ──────────────────────────────────────────────────
// Cada Principio se responde pregunta por pregunta (Sí/No/N-A, N-A excluido del
// denominador). confidencePct = %Sí entre las respondidas. Esa confianza se
// traduce a un "riesgo" continuo 1-4 (100%→1, 0%→4) para reutilizar exactamente
// la misma matemática ponderada 25/25/20/15/15 que el instrumento original del
// usuario (Excel real revisado) — total resultante 100-400, mismas bandas.

const COMPONENTS: { sectionKey: string; label: string; short: string; weight: number }[] = [
  { sectionKey: 'S1', label: 'Entorno de Control',           short: 'Entorno',      weight: 25 },
  { sectionKey: 'S2', label: 'Evaluación de Riesgos',         short: 'Riesgos',      weight: 25 },
  { sectionKey: 'S3', label: 'Actividades de Control',        short: 'Controles',    weight: 20 },
  { sectionKey: 'S4', label: 'Información y Comunicación',    short: 'Info/Com.',    weight: 15 },
  { sectionKey: 'S5', label: 'Actividades de Monitoreo',      short: 'Monitoreo',    weight: 15 },
];

const BANDS = [
  { min: 100, max: 175, confMin: 75, confMax: 100, label: 'Efectivo',      cls: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200', dot: 'bg-emerald-500' },
  { min: 176, max: 250, confMin: 50, confMax: 74,  label: 'Confiable',        cls: 'bg-amber-400',   text: 'text-amber-700',   bg: 'bg-amber-50',   border: 'border-amber-200',   dot: 'bg-amber-400' },
  { min: 251, max: 325, confMin: 25, confMax: 49,  label: 'Poco Confiable',   cls: 'bg-orange-500',  text: 'text-orange-700',  bg: 'bg-orange-50',  border: 'border-orange-200',  dot: 'bg-orange-500' },
  { min: 326, max: 400, confMin: 0,  confMax: 24,  label: 'No Confiable',     cls: 'bg-red-500',     text: 'text-red-700',     bg: 'bg-red-50',     border: 'border-red-200',     dot: 'bg-red-500' },
];

function bandFor(score: number) {
  return BANDS.find(b => score >= b.min && score <= b.max) ?? BANDS[BANDS.length - 1];
}
function riskColor(confidencePct: number): string {
  if (confidencePct >= 75) return '#10b981';
  if (confidencePct >= 50) return '#f59e0b';
  if (confidencePct >= 25) return '#f97316';
  return '#ef4444';
}

interface PrincipleResult {
  principio: string;
  short: string;
  confidencePct: number | null;
  risk: number | null;
  answered: number;
  total: number;
}
interface ComponentResult {
  sectionKey: string; label: string; short: string; weight: number;
  principles: PrincipleResult[];
  avg: number | null;
  puntaje: number | null;
  confidencePct: number | null;
  answeredPrinciples: number;
  totalPrinciples: number;
}

/** Computa el resultado de UN componente a partir de las filas (una por pregunta) de su sección MATRIX. */
function computeComponent(section: PaperSection | undefined, meta: { sectionKey: string; label: string; short: string; weight: number }): ComponentResult {
  const rows = parseRows(section?.value);
  const principioKey = rows.length > 0 ? findKey(rows[0], ['principio']) : undefined;
  const respuestaKey = rows.length > 0 ? findKey(rows[0], ['respuesta']) : undefined;

  const order: string[] = [];
  const byPrincipio = new Map<string, { si: number; no: number; total: number }>();
  for (const r of rows) {
    const principio = principioKey ? String(r[principioKey] ?? '').trim() : '';
    if (!principio) continue;
    if (!byPrincipio.has(principio)) { byPrincipio.set(principio, { si: 0, no: 0, total: 0 }); order.push(principio); }
    const stat = byPrincipio.get(principio)!;
    stat.total += 1;
    const ans = respuestaKey ? normAnswer(r[respuestaKey]) : null;
    if (ans === 'si') stat.si += 1;
    if (ans === 'no') stat.no += 1;
  }

  const principles: PrincipleResult[] = order.map(principio => {
    const stat = byPrincipio.get(principio)!;
    const answered = stat.si + stat.no;
    const confidencePct = answered > 0 ? (stat.si / answered) * 100 : null;
    const risk = confidencePct !== null ? 4 - (confidencePct / 100) * 3 : null;
    const m = principio.match(/^(P\d+)/);
    return { principio, short: m ? m[1] : principio, confidencePct, risk, answered, total: stat.total };
  });

  const scored = principles.filter((p): p is PrincipleResult & { risk: number } => p.risk !== null);
  const avg = scored.length > 0 ? scored.reduce((s, p) => s + p.risk, 0) / scored.length : null;
  const puntaje = avg !== null ? avg * meta.weight : null;
  const confidencePct = avg !== null ? ((4 - avg) / 3) * 100 : null;

  return {
    ...meta, principles, avg, puntaje, confidencePct,
    answeredPrinciples: scored.length, totalPrinciples: principles.length,
  };
}

// ─── Matriz de bandas — siempre visible, para transparencia del método ───────

function BandMatrix() {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="text-gray-400 border-b border-gray-100">
            <th className="text-left font-medium py-1.5 pr-2">Semáforo</th>
            <th className="text-left font-medium py-1.5 pr-2">Puntos (100-400)</th>
            <th className="text-left font-medium py-1.5 pr-2">Confianza</th>
            <th className="text-left font-medium py-1.5 pr-2">Resultado</th>
            <th className="text-left font-medium py-1.5">Implica para el enfoque de auditoría</th>
          </tr>
        </thead>
        <tbody>
          {BANDS.map(b => (
            <tr key={b.label} className="border-b border-gray-50 last:border-0">
              <td className="py-1.5 pr-2"><span className={`inline-block w-2.5 h-2.5 rounded-full ${b.dot}`} /></td>
              <td className="py-1.5 pr-2 tabular-nums text-gray-600">{b.min}–{b.max}</td>
              <td className="py-1.5 pr-2 tabular-nums text-gray-600">{b.confMin}%–{b.confMax}%</td>
              <td className={`py-1.5 pr-2 font-semibold ${b.text}`}>{b.label}</td>
              <td className="py-1.5 text-gray-500">
                {b.label === 'Efectivo' && 'Enfoque de controles — pruebas sustantivas reducidas'}
                {b.label === 'Confiable' && 'Enfoque mixto — validar las áreas débiles'}
                {b.label === 'Poco Confiable' && 'Enfoque sustantivo ampliado'}
                {b.label === 'No Confiable' && 'Enfoque sustantivo máximo — reportar como debilidad material'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Guía de evaluación — plegable, siempre disponible ───────────────────────

function CosoGuidePanel() {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm mb-3">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-4 py-3 text-left"
      >
        <HelpCircle className="w-4 h-4 text-violet-500 shrink-0" />
        <span className="text-xs font-bold text-gray-600 flex-1">¿Cómo se evalúa este Sistema de Control Interno?</span>
        {open ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3 text-[11px] text-gray-600 border-t border-gray-100 pt-3">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
            {[
              { n: '1', t: 'Pregunta', d: 'Cada Principio se descompone en preguntas objetivas (Points of Focus). Responda Sí / No / N-A con evidencia.' },
              { n: '2', t: 'Principio', d: 'El % de "Sí" entre las preguntas respondidas de un Principio determina su nivel de confianza.' },
              { n: '3', t: 'Componente', d: 'El componente promedia sus Principios y se pondera 25/25/20/15/15 — total 100-400 puntos.' },
              { n: '4', t: 'Juicio del auditor', d: 'El campo "Evaluación" de cada componente (EFECTIVO/DEBILIDAD…) sigue siendo su conclusión final — el sistema solo aporta el insumo objetivo.' },
            ].map(s => (
              <div key={s.n} className="bg-gray-50 rounded-xl p-2.5">
                <p className="text-[10px] font-bold text-violet-600 mb-0.5">{s.n}. {s.t}</p>
                <p className="text-gray-500 leading-snug">{s.d}</p>
              </div>
            ))}
          </div>
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Matriz de bandas</p>
            <BandMatrix />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Panel principal — pestaña Resultados y Conclusión ───────────────────────

interface Props {
  sections: PaperSection[];
}

export function CosoScorePanel({ sections }: Props) {
  const byKey = new Map(sections.map(s => [s.sectionKey, s]));
  const componentData = COMPONENTS.map(c => computeComponent(byKey.get(c.sectionKey), c));

  const totalAnswered = componentData.reduce((s, c) => s + c.answeredPrinciples, 0);
  const totalPrinciples = componentData.reduce((s, c) => s + c.totalPrinciples, 0);
  const allComplete = componentData.every(c => c.totalPrinciples > 0 && c.answeredPrinciples === c.totalPrinciples);
  const anyData = componentData.some(c => c.answeredPrinciples > 0);

  if (!anyData) {
    return (
      <div className="mb-3 space-y-3">
        <CosoGuidePanel />
        <div className="bg-gray-50 border border-dashed border-gray-200 rounded-xl p-4 text-center">
          <p className="text-xs text-gray-400">
            El Puntaje Ponderado del SCI se calculará automáticamente cuando responda las preguntas (Sí/No/N-A) en las pestañas de los 5 componentes.
          </p>
        </div>
      </div>
    );
  }

  const totalScore = componentData.reduce((s, c) => s + (c.puntaje ?? 0), 0);
  const band = bandFor(totalScore);
  const pct = Math.min(100, Math.max(0, ((totalScore - 100) / 300) * 100));
  const totalConfidencePct = Math.min(100, Math.max(0, ((400 - totalScore) / 300) * 100));

  const componentBarData = componentData.map(c => ({
    label: `${c.short} (${c.weight}%)`, confidencePct: c.confidencePct ?? 0, hasData: c.confidencePct !== null,
  }));
  const radarData = componentData.map(c => ({ component: c.short, riesgo: c.avg ?? 0, fullMark: 4 }));

  const allPrinciplesData = componentData.flatMap(c =>
    c.principles
      .filter(p => p.confidencePct !== null)
      .map(p => ({ short: p.short, name: p.principio, confidencePct: p.confidencePct as number, componentShort: c.short })),
  );

  return (
    <div className="mb-4 space-y-3">
      <CosoGuidePanel />

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

        <div className="flex items-end gap-4 mb-4">
          <div>
            <p className={`text-3xl font-bold tabular-nums ${band.text}`}>{totalScore.toFixed(0)}</p>
            <p className="text-[10px] text-gray-400">de 100 a 400</p>
          </div>
          <div>
            <p className={`text-3xl font-bold tabular-nums ${band.text}`}>{totalConfidencePct.toFixed(0)}%</p>
            <p className="text-[10px] text-gray-400">confianza global</p>
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
                  <th className="text-right font-medium py-1">Confianza</th>
                  <th className="text-right font-medium py-1">Peso</th>
                  <th className="text-right font-medium py-1">Puntaje</th>
                </tr>
              </thead>
              <tbody>
                {componentData.map(c => (
                  <tr key={c.sectionKey} className="border-b border-gray-50 last:border-0">
                    <td className="py-1.5 text-gray-700">{c.label}</td>
                    <td className="py-1.5 text-right tabular-nums text-gray-600">{c.confidencePct !== null ? `${c.confidencePct.toFixed(0)}%` : '—'}</td>
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

      <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Nivel componente — confianza (%), línea punteada = resultado global</p>
        <ResponsiveContainer width="100%" height={Math.max(140, componentBarData.length * 40)}>
          <BarChart data={componentBarData} layout="vertical" margin={{ top: 4, right: 32, bottom: 4, left: 4 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 9 }} unit="%" />
            <YAxis type="category" dataKey="label" width={140} tick={{ fontSize: 10 }} />
            <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} formatter={(v: number) => `${v.toFixed(0)}%`} />
            <ReferenceLine x={totalConfidencePct} stroke="#6b7280" strokeDasharray="4 4" label={{ value: `${totalConfidencePct.toFixed(0)}% global`, fontSize: 9, fill: '#6b7280', position: 'top' }} />
            <Bar dataKey="confidencePct" radius={[0, 4, 4, 0]}>
              {componentBarData.map((d, i) => <Cell key={i} fill={d.hasData ? riskColor(d.confidencePct) : '#e5e7eb'} />)}
              <LabelList dataKey="confidencePct" position="right" formatter={(v: number) => `${v.toFixed(0)}%`} style={{ fontSize: 9, fill: '#64748b' }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {allPrinciplesData.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Confianza por principio (%) — verde ≥75% · ámbar ≥50% · naranja ≥25% · rojo &lt;25%</p>
          <ResponsiveContainer width="100%" height={Math.max(180, allPrinciplesData.length * 22)}>
            <BarChart data={allPrinciplesData} layout="vertical" margin={{ top: 4, right: 28, bottom: 4, left: 4 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 9 }} unit="%" />
              <YAxis type="category" dataKey="short" width={36} tick={{ fontSize: 10 }} />
              <Tooltip
                contentStyle={{ fontSize: 11, borderRadius: 8, maxWidth: 280 }}
                formatter={(v: number) => `${v.toFixed(0)}%`}
                labelFormatter={(_label, payload) => (payload?.[0]?.payload as { name?: string } | undefined)?.name ?? _label}
              />
              <Bar dataKey="confidencePct" radius={[0, 4, 4, 0]}>
                {allPrinciplesData.map((d, i) => <Cell key={i} fill={riskColor(d.confidencePct)} />)}
                <LabelList dataKey="confidencePct" position="right" formatter={(v: number) => `${v.toFixed(0)}%`} style={{ fontSize: 9, fill: '#64748b' }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// ─── Mini gráfico por pestaña de componente (S1-S5) ──────────────────────────
// Desglose de los Principios de ESE componente, embebido en su propia pestaña —
// para que el auditor vea de inmediato qué principio arrastra el resultado
// mientras llena la grilla, sin saltar a Resultados y Conclusión.

export function CosoPrincipleMiniChart({ section, componentMeta }: {
  section: PaperSection | undefined;
  componentMeta: { sectionKey: string; label: string; short: string; weight: number };
}) {
  const result = computeComponent(section, componentMeta);
  const data = result.principles.filter(p => p.confidencePct !== null);
  if (data.length === 0) return null;

  return (
    <div className="mb-3 bg-white border border-gray-200 rounded-2xl p-3 shadow-sm">
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Confianza por principio en este componente</p>
        {result.confidencePct !== null && (
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ color: riskColor(result.confidencePct), backgroundColor: `${riskColor(result.confidencePct)}1a` }}>
            {result.confidencePct.toFixed(0)}% confianza del componente
          </span>
        )}
      </div>
      <ResponsiveContainer width="100%" height={Math.max(90, data.length * 26)}>
        <BarChart data={data} layout="vertical" margin={{ top: 2, right: 28, bottom: 2, left: 4 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 9 }} unit="%" />
          <YAxis type="category" dataKey="short" width={32} tick={{ fontSize: 10 }} />
          <Tooltip
            contentStyle={{ fontSize: 11, borderRadius: 8, maxWidth: 260 }}
            formatter={(v: number) => `${v.toFixed(0)}%`}
            labelFormatter={(_label, payload) => (payload?.[0]?.payload as { principio?: string } | undefined)?.principio ?? _label}
          />
          <Bar dataKey="confidencePct" radius={[0, 4, 4, 0]}>
            {data.map((d, i) => <Cell key={i} fill={riskColor(d.confidencePct as number)} />)}
            <LabelList dataKey="confidencePct" position="right" formatter={(v: number) => `${v.toFixed(0)}%`} style={{ fontSize: 9, fill: '#64748b' }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export { COMPONENTS as COSO_COMPONENTS };
