'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ShieldAlert, DollarSign, Clock, ChevronRight,
  BarChart3, AlertTriangle, CheckCircle2, Circle, Info,
} from 'lucide-react';
import { useAuditProjects, AuditProject } from '@/hooks/useAuditProjects';

// ─── Constants ────────────────────────────────────────────────────────────────

const RISK_CATEGORIES = [
  {
    value: 'INTEGRAL_GOBIERNO',
    label: 'Integral y Gobierno',
    short: 'Gov.',
    desc: 'Riesgos de gobierno corporativo, cumplimiento regulatorio y controles internos.',
    color: 'from-slate-700 to-slate-800',
    border: 'border-slate-400',
    bg: 'bg-slate-50',
    ring: 'ring-slate-300',
    num: 1,
  },
  {
    value: 'CREDITO_FIDEICOMISO',
    label: 'Crédito / Fideicomiso',
    short: 'Cred.',
    desc: 'Riesgos asociados a la cartera crediticia, garantías y fideicomisos.',
    color: 'from-blue-700 to-blue-800',
    border: 'border-blue-400',
    bg: 'bg-blue-50',
    ring: 'ring-blue-300',
    num: 2,
  },
  {
    value: 'LIQUIDEZ_MERCADO',
    label: 'Liquidez y Mercado',
    short: 'Liq.',
    desc: 'Riesgos de liquidez, tasas de interés, tipo de cambio y exposición de mercado.',
    color: 'from-cyan-700 to-cyan-800',
    border: 'border-cyan-400',
    bg: 'bg-cyan-50',
    ring: 'ring-cyan-300',
    num: 3,
  },
  {
    value: 'LAVADO_DINERO',
    label: 'Lavado de Dinero',
    short: 'AML',
    desc: 'Prevención de lavado de activos, financiamiento del terrorismo y cumplimiento SIPLAFT.',
    color: 'from-red-700 to-red-800',
    border: 'border-red-400',
    bg: 'bg-red-50',
    ring: 'ring-red-300',
    num: 4,
  },
  {
    value: 'OPERACIONAL',
    label: 'Operacional',
    short: 'Op.',
    desc: 'Riesgos operacionales, TI, fraude, seguridad de la información y procesos.',
    color: 'from-orange-600 to-orange-700',
    border: 'border-orange-400',
    bg: 'bg-orange-50',
    ring: 'ring-orange-300',
    num: 5,
  },
  {
    value: 'AMBIENTAL_SOCIAL',
    label: 'Ambiental y Social',
    short: 'ESG',
    desc: 'Riesgos ambientales, sociales y de gobernanza (ESG) y responsabilidad corporativa.',
    color: 'from-green-700 to-green-800',
    border: 'border-green-400',
    bg: 'bg-green-50',
    ring: 'ring-green-300',
    num: 6,
  },
  {
    value: 'SEGUIMIENTO',
    label: 'Seguimiento',
    short: 'Seg.',
    desc: 'Riesgos de seguimiento de recomendaciones, acciones correctivas pendientes.',
    color: 'from-purple-700 to-purple-800',
    border: 'border-purple-400',
    bg: 'bg-purple-50',
    ring: 'ring-purple-300',
    num: 7,
  },
  {
    value: 'OTROS',
    label: 'Otros Riesgos',
    short: 'Otros',
    desc: 'Categorías de riesgo emergentes o no clasificadas en los grupos anteriores.',
    color: 'from-gray-600 to-gray-700',
    border: 'border-gray-400',
    bg: 'bg-gray-50',
    ring: 'ring-gray-300',
    num: 8,
  },
];

const RISK_LEVELS = ['CRITICO', 'ALTO', 'MEDIO', 'BAJO'] as const;
const LEVEL_BADGE: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  CRITICO: { label: 'Crítico', bg: 'bg-red-100',    text: 'text-red-700',    dot: 'bg-red-500' },
  ALTO:    { label: 'Alto',    bg: 'bg-orange-100', text: 'text-orange-700', dot: 'bg-orange-500' },
  MEDIO:   { label: 'Medio',  bg: 'bg-amber-100',  text: 'text-amber-700',  dot: 'bg-amber-500' },
  BAJO:    { label: 'Bajo',   bg: 'bg-green-100',  text: 'text-green-700',  dot: 'bg-green-500' },
};

function fmtCurrency(v?: number | null) {
  if (!v) return '—';
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v);
}

// ─── Category card ────────────────────────────────────────────────────────────

function CategoryCard({
  cat,
  projects,
  selected,
  onSelect,
}: {
  cat: typeof RISK_CATEGORIES[0];
  projects: AuditProject[];
  selected: boolean;
  onSelect: () => void;
}) {
  const total  = projects.length;
  const inPlan = projects.filter(p => p.includeInPlan).length;
  const budget = projects.reduce((s, p) => s + (p.totalBudget ?? 0), 0);
  const hours  = projects.reduce((s, p) => s + (p.plannedHours ?? 0), 0);
  const levelCounts = RISK_LEVELS.reduce((acc, l) => ({
    ...acc,
    [l]: projects.filter(p => p.finalRiskLevel === l).length,
  }), {} as Record<string, number>);
  const topLevel = RISK_LEVELS.find(l => levelCounts[l] > 0) ?? null;

  return (
    <button
      onClick={onSelect}
      className={`w-full text-left rounded-2xl border-2 transition-all ${
        selected
          ? `border-current ${cat.ring} ring-2 shadow-lg`
          : `${cat.border} hover:shadow-md`
      } ${cat.bg} overflow-hidden`}>
      {/* header gradient */}
      <div className={`bg-gradient-to-r ${cat.color} px-4 py-3 flex items-center justify-between`}>
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center text-xs font-black text-white">
            {cat.num}
          </span>
          <p className="text-sm font-bold text-white leading-tight">{cat.label}</p>
        </div>
        {topLevel && (
          <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${LEVEL_BADGE[topLevel].bg} ${LEVEL_BADGE[topLevel].text}`}>
            {LEVEL_BADGE[topLevel].label}
          </span>
        )}
      </div>

      {/* metrics */}
      <div className="px-4 py-3">
        {total === 0 ? (
          <p className="text-xs text-gray-400 italic py-1">Sin proyectos clasificados</p>
        ) : (
          <div className="space-y-2">
            {/* counts */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="text-2xl font-black text-gray-800">{total}</span>
                <span className="text-xs text-gray-500">proyecto{total !== 1 ? 's' : ''}</span>
              </div>
              <div className="text-right">
                <p className="text-xs font-semibold text-gray-700">{inPlan} en plan</p>
                {budget > 0 && (
                  <p className="text-xs text-gray-400">{fmtCurrency(budget)}</p>
                )}
              </div>
            </div>

            {/* risk distribution mini-bar */}
            {Object.values(levelCounts).some(v => v > 0) && (
              <div className="flex h-1.5 rounded-full overflow-hidden gap-0.5">
                {RISK_LEVELS.map(l => {
                  const w = total > 0 ? (levelCounts[l] / total) * 100 : 0;
                  if (w === 0) return null;
                  const colors = {
                    CRITICO: 'bg-red-500',
                    ALTO:    'bg-orange-500',
                    MEDIO:   'bg-amber-400',
                    BAJO:    'bg-green-500',
                  };
                  return (
                    <div
                      key={l}
                      title={`${levelCounts[l]} ${LEVEL_BADGE[l].label}`}
                      className={`${colors[l]} rounded-full`}
                      style={{ width: `${w}%` }} />
                  );
                })}
              </div>
            )}

            {/* hours */}
            {hours > 0 && (
              <p className="text-xs text-gray-500 flex items-center gap-1">
                <Clock className="w-3 h-3" />{hours.toLocaleString('es-CL')} h planificadas
              </p>
            )}
          </div>
        )}
      </div>
    </button>
  );
}

// ─── Project row ──────────────────────────────────────────────────────────────

function ProjectRow({ p }: { p: AuditProject }) {
  const rl = p.finalRiskLevel ? LEVEL_BADGE[p.finalRiskLevel] : null;
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-gray-100 last:border-0">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-gray-400">{p.correlative}</span>
          {p.includeInPlan && (
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" aria-label="Incluido en plan" />
          )}
        </div>
        <p className="text-sm font-medium text-gray-800 truncate">{p.name}</p>
        <p className="text-xs text-gray-400">{p.planYear}</p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {rl && (
          <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${rl.bg} ${rl.text}`}>
            {rl.label}
          </span>
        )}
        {p.finalRiskScore && (
          <span className="text-xs font-mono text-gray-500 w-10 text-right">
            {p.finalRiskScore.toFixed(2)}
          </span>
        )}
        <Link href="/dashboard/projects"
          className="text-gray-300 hover:text-blue-500 transition-colors">
          <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
}

// ─── Main View ────────────────────────────────────────────────────────────────

export function RiskCatalogView() {
  const { data: allProjects = [], isLoading } = useAuditProjects();
  const [selected, setSelected] = useState<string | null>(null);

  // Aggregate data by category
  const byCategory = useMemo(() => {
    const map: Record<string, AuditProject[]> = {};
    for (const cat of RISK_CATEGORIES) map[cat.value] = [];
    for (const p of allProjects) {
      if (p.riskCategory && map[p.riskCategory]) {
        map[p.riskCategory].push(p);
      }
    }
    return map;
  }, [allProjects]);

  // Global KPIs
  const totalProjects  = allProjects.length;
  const totalInPlan    = allProjects.filter(p => p.includeInPlan).length;
  const totalBudget    = allProjects.reduce((s, p) => s + (p.totalBudget ?? 0), 0);
  const critAlto       = allProjects.filter(p => p.finalRiskLevel === 'CRITICO' || p.finalRiskLevel === 'ALTO').length;
  const uncategorized  = allProjects.filter(p => !p.riskCategory).length;

  // Heat matrix — category × risk level
  const heatData = useMemo(() =>
    RISK_CATEGORIES.map(cat => ({
      cat,
      levels: RISK_LEVELS.map(l => ({
        level: l,
        count: (byCategory[cat.value] ?? []).filter(p => p.finalRiskLevel === l).length,
      })),
    })),
    [byCategory]);

  const maxCell = Math.max(1, ...heatData.flatMap(r => r.levels.map(c => c.count)));

  const selectedCat   = RISK_CATEGORIES.find(c => c.value === selected);
  const selectedProjs = selected ? (byCategory[selected] ?? []) : [];
  const sortedProjs   = [...selectedProjs].sort((a, b) => (b.finalRiskScore ?? 0) - (a.finalRiskScore ?? 0));

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* ── Hero banner ── */}
        <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl p-6 text-white">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-xl font-black">Catálogo de Riesgos del Plan</h2>
                <p className="text-slate-400 text-sm">Paisaje de riesgo por categoría regulatoria · 8 tipos</p>
              </div>
            </div>
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-4 gap-4 mt-4">
            {[
              { label: 'Total proyectos',    value: totalProjects,   icon: BarChart3,      color: 'text-blue-300' },
              { label: 'En plan anual',       value: totalInPlan,     icon: CheckCircle2,   color: 'text-emerald-300' },
              { label: 'Crítico / Alto',      value: critAlto,        icon: AlertTriangle,  color: 'text-red-300' },
              { label: 'Sin categoría',       value: uncategorized,   icon: Circle,         color: 'text-gray-400' },
            ].map(({ label, value, icon: Icon, color }) => (
              <div key={label} className="bg-white/10 rounded-xl p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Icon className={`w-3.5 h-3.5 ${color}`} />
                  <p className="text-xs text-slate-400">{label}</p>
                </div>
                <p className="text-2xl font-black">{value}</p>
              </div>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-5 gap-6">

            {/* ── Left: 8 category cards (2×4) ── */}
            <div className="col-span-3 space-y-4">

              {/* Category cards grid */}
              <div className="grid grid-cols-2 gap-3">
                {RISK_CATEGORIES.map(cat => (
                  <CategoryCard
                    key={cat.value}
                    cat={cat}
                    projects={byCategory[cat.value] ?? []}
                    selected={selected === cat.value}
                    onSelect={() => setSelected(prev => prev === cat.value ? null : cat.value)}
                  />
                ))}
              </div>

              {/* Heat matrix */}
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-2">
                  <BarChart3 className="w-3.5 h-3.5" /> Matriz Categoría × Nivel de Riesgo
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr>
                        <th className="text-left text-gray-400 font-medium pb-2 pr-3 w-32">Categoría</th>
                        {RISK_LEVELS.map(l => (
                          <th key={l} className="text-center font-medium pb-2 px-2">
                            <span className={`inline-block px-2 py-0.5 rounded-full ${LEVEL_BADGE[l].bg} ${LEVEL_BADGE[l].text}`}>
                              {LEVEL_BADGE[l].label}
                            </span>
                          </th>
                        ))}
                        <th className="text-center text-gray-400 font-medium pb-2 px-2">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {heatData.map(({ cat, levels }) => {
                        const rowTotal = levels.reduce((s, l) => s + l.count, 0);
                        return (
                          <tr key={cat.value}
                            onClick={() => setSelected(prev => prev === cat.value ? null : cat.value)}
                            className="cursor-pointer hover:bg-gray-50 rounded">
                            <td className="py-1.5 pr-3">
                              <span className="font-medium text-gray-700">{cat.num}. {cat.short}</span>
                            </td>
                            {levels.map(({ level, count }) => (
                              <td key={level} className="py-1.5 px-2 text-center">
                                {count > 0 ? (
                                  <span className={`inline-flex items-center justify-center w-7 h-7 rounded-lg font-bold text-white text-xs ${
                                    level === 'CRITICO' ? 'bg-red-500' :
                                    level === 'ALTO'    ? 'bg-orange-500' :
                                    level === 'MEDIO'   ? 'bg-amber-500' :
                                    'bg-green-500'
                                  }`} style={{ opacity: Math.max(0.3, count / maxCell) }}>
                                    {count}
                                  </span>
                                ) : (
                                  <span className="text-gray-200">—</span>
                                )}
                              </td>
                            ))}
                            <td className="py-1.5 px-2 text-center">
                              <span className="font-bold text-gray-700">{rowTotal || '—'}</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Budget by category bar */}
              {totalBudget > 0 && (
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-2">
                    <DollarSign className="w-3.5 h-3.5" /> Presupuesto por categoría
                  </p>
                  <div className="space-y-2">
                    {RISK_CATEGORIES.map(cat => {
                      const catProjs = byCategory[cat.value] ?? [];
                      const catBudget = catProjs.reduce((s, p) => s + (p.totalBudget ?? 0), 0);
                      const pct = totalBudget > 0 ? (catBudget / totalBudget) * 100 : 0;
                      if (catBudget === 0) return null;
                      return (
                        <div key={cat.value} className="flex items-center gap-3">
                          <span className="text-xs text-gray-500 w-20 flex-shrink-0 truncate">{cat.num}. {cat.short}</span>
                          <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full bg-gradient-to-r ${cat.color}`}
                              style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-xs text-gray-600 w-20 text-right flex-shrink-0">{fmtCurrency(catBudget)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* ── Right: detail panel ── */}
            <div className="col-span-2">
              {selected && selectedCat ? (
                <div className="bg-white rounded-2xl border-2 shadow-sm overflow-hidden sticky top-0"
                  style={{ borderColor: `var(--tw-ring-color)` }}>
                  {/* header */}
                  <div className={`bg-gradient-to-r ${selectedCat.color} px-5 py-4 text-white`}>
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-xs text-white/60 mb-0.5">Categoría {selectedCat.num}</p>
                        <p className="font-bold text-base">{selectedCat.label}</p>
                      </div>
                      <button onClick={() => setSelected(null)}
                        className="text-white/60 hover:text-white text-xs">✕</button>
                    </div>
                    <p className="text-xs text-white/70 mt-2 leading-relaxed">{selectedCat.desc}</p>
                  </div>

                  {/* stats */}
                  <div className="px-5 py-3 border-b border-gray-100 grid grid-cols-2 gap-3">
                    {[
                      { label: 'Proyectos', value: selectedProjs.length },
                      { label: 'En plan',   value: selectedProjs.filter(p => p.includeInPlan).length },
                      { label: 'Presupuesto', value: fmtCurrency(selectedProjs.reduce((s, p) => s + (p.totalBudget ?? 0), 0)) },
                      { label: 'Horas',     value: `${selectedProjs.reduce((s, p) => s + (p.plannedHours ?? 0), 0).toLocaleString('es-CL')} h` },
                    ].map(({ label, value }) => (
                      <div key={label}>
                        <p className="text-xs text-gray-400">{label}</p>
                        <p className="text-sm font-bold text-gray-800">{value || '—'}</p>
                      </div>
                    ))}
                  </div>

                  {/* level distribution */}
                  <div className="px-5 py-3 border-b border-gray-100">
                    <p className="text-xs font-semibold text-gray-500 mb-2">Distribución por nivel</p>
                    <div className="flex gap-2 flex-wrap">
                      {RISK_LEVELS.map(l => {
                        const count = selectedProjs.filter(p => p.finalRiskLevel === l).length;
                        const cfg = LEVEL_BADGE[l];
                        return (
                          <span key={l}
                            className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full ${cfg.bg} ${cfg.text}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                            {cfg.label}: {count}
                          </span>
                        );
                      })}
                    </div>
                  </div>

                  {/* project list */}
                  <div className="px-5 py-3 max-h-80 overflow-y-auto">
                    {sortedProjs.length === 0 ? (
                      <div className="py-6 text-center text-gray-400">
                        <Info className="w-8 h-8 mx-auto mb-2 opacity-30" />
                        <p className="text-sm">Sin proyectos clasificados</p>
                        <p className="text-xs mt-1">Clasifica proyectos en la pestaña Proyectos</p>
                      </div>
                    ) : (
                      sortedProjs.map(p => <ProjectRow key={p.id} p={p} />)
                    )}
                  </div>
                </div>
              ) : (
                <div className="bg-gray-50 border-2 border-dashed border-gray-200 rounded-2xl p-8 text-center text-gray-400 sticky top-0">
                  <ShieldAlert className="w-10 h-10 mx-auto mb-3 opacity-20" />
                  <p className="text-sm font-medium">Selecciona una categoría</p>
                  <p className="text-xs mt-1">Haz clic en cualquier tarjeta para ver el detalle de sus proyectos</p>
                </div>
              )}
            </div>

          </div>
        )}

        {/* Note about classification */}
        {!isLoading && uncategorized > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-3 text-sm text-amber-800">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 text-amber-600" />
            <span>
              <strong>{uncategorized}</strong> proyecto{uncategorized > 1 ? 's' : ''} sin categoría de riesgo asignada.
              {' '}Clasifícalos en la pestaña <strong>Proyectos de Auditoría</strong>.
            </span>
          </div>
        )}

      </div>
    </div>
  );
}
