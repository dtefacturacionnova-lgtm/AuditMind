'use client';

import { useState } from 'react';
import {
  X, Sparkles, Loader2, ChevronDown, ChevronRight,
  TrendingUp, TrendingDown, Minus, AlertTriangle,
  CheckCircle2, Clock, BarChart3, BookOpen,
  Lightbulb, ArrowRight, Shield, Target, FileText,
  RotateCcw, AlertCircle, Star,
} from 'lucide-react';
import {
  useMultiYearAnalysis,
  type AtlasAnalysisResult,
  type AtlasReport,
  type AtlasPlanningRecommendation,
} from '@/hooks/useMultiYearAnalysis';

// ─── Severity color helpers ───────────────────────────────────────────────────

const SEVERITY_COLORS: Record<string, string> = {
  CRITICAL: 'text-red-700 bg-red-100 border-red-200',
  HIGH:     'text-orange-700 bg-orange-100 border-orange-200',
  MEDIUM:   'text-yellow-700 bg-yellow-100 border-yellow-200',
  LOW:      'text-blue-700 bg-blue-100 border-blue-200',
  critical: 'text-red-700 bg-red-100 border-red-200',
  high:     'text-orange-700 bg-orange-100 border-orange-200',
  medium:   'text-yellow-700 bg-yellow-100 border-yellow-200',
  low:      'text-blue-700 bg-blue-100 border-blue-200',
};

const TREND_CONFIG = {
  improving:    { icon: TrendingUp,   color: 'text-emerald-600', bg: 'bg-emerald-50',  border: 'border-emerald-200', label: 'Mejorando' },
  stable:       { icon: Minus,        color: 'text-slate-600',   bg: 'bg-slate-50',    border: 'border-slate-200',   label: 'Estable'   },
  deteriorating:{ icon: TrendingDown, color: 'text-red-600',     bg: 'bg-red-50',      border: 'border-red-200',     label: 'Deteriorándose' },
};

const URGENCY_COLOR: Record<string, string> = {
  critical: 'border-l-red-500',
  high:     'border-l-orange-400',
  medium:   'border-l-yellow-400',
};

// ─── Collapsible section ──────────────────────────────────────────────────────

function Section({
  title, icon: Icon, count, children, defaultOpen = false, accent = 'blue',
}: {
  title: string;
  icon: React.ElementType;
  count?: number;
  children: React.ReactNode;
  defaultOpen?: boolean;
  accent?: 'blue' | 'red' | 'orange' | 'green' | 'violet' | 'amber';
}) {
  const [open, setOpen] = useState(defaultOpen);
  const colors: Record<string, string> = {
    blue:   'text-blue-600 bg-blue-50 border-blue-100',
    red:    'text-red-600 bg-red-50 border-red-100',
    orange: 'text-orange-600 bg-orange-50 border-orange-100',
    green:  'text-emerald-600 bg-emerald-50 border-emerald-100',
    violet: 'text-violet-600 bg-violet-50 border-violet-100',
    amber:  'text-amber-600 bg-amber-50 border-amber-100',
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-slate-50 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <div className={`h-7 w-7 rounded-lg flex items-center justify-center border ${colors[accent]}`}>
            <Icon className="h-3.5 w-3.5" />
          </div>
          <span className="text-sm font-semibold text-slate-800">{title}</span>
          {count !== undefined && (
            <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
              {count}
            </span>
          )}
        </div>
        {open ? (
          <ChevronDown className="h-4 w-4 text-slate-400" />
        ) : (
          <ChevronRight className="h-4 w-4 text-slate-400" />
        )}
      </button>
      {open && <div className="px-5 pb-5 pt-1 border-t border-slate-100">{children}</div>}
    </div>
  );
}

// ─── Report renderer ──────────────────────────────────────────────────────────

function AtlasReport({ result }: { result: AtlasAnalysisResult }) {
  const r: AtlasReport = result.report;

  if (r.parseError) {
    return (
      <div className="rounded-xl bg-amber-50 border border-amber-200 p-5">
        <p className="text-sm font-semibold text-amber-800 mb-2">Respuesta del análisis (texto)</p>
        <pre className="text-xs text-amber-700 whitespace-pre-wrap font-mono leading-relaxed">
          {r.rawContent}
        </pre>
      </div>
    );
  }

  const trendCfg = TREND_CONFIG[r.riskEvolution?.trend ?? 'stable'];
  const TrendIcon = trendCfg.icon;
  const recidivismRate = r.findingRecurrence?.recidivismRate ?? 0;
  const implRate = r.implementationEffectiveness?.overallRate ?? 0;

  return (
    <div className="space-y-4">

      {/* Header meta */}
      <div className={`rounded-xl border px-5 py-4 ${trendCfg.bg} ${trendCfg.border}`}>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 mb-1">
              Análisis de Inteligencia Multi-Año — ATLAS
            </p>
            <h3 className="text-base font-bold text-slate-800">
              {r.periodCoverage?.entityName ?? 'Entidad auditada'}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {r.periodCoverage?.auditsAnalyzed} ciclos · {r.periodCoverage?.from} – {r.periodCoverage?.to}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold ${trendCfg.bg} ${trendCfg.border} ${trendCfg.color}`}>
              <TrendIcon className="h-3.5 w-3.5" />
              Tendencia: {trendCfg.label}
            </div>
          </div>
        </div>

        {/* KPIs */}
        <div className="mt-4 grid grid-cols-3 gap-3">
          <div className="bg-white/70 rounded-lg px-3 py-2.5 text-center border border-white/80">
            <p className="text-xl font-bold text-slate-800">
              {r.findingRecurrence?.recurrentThemes?.length ?? 0}
            </p>
            <p className="text-[10px] text-slate-500 mt-0.5">Hallazgos recurrentes</p>
          </div>
          <div className="bg-white/70 rounded-lg px-3 py-2.5 text-center border border-white/80">
            <p className={`text-xl font-bold ${recidivismRate > 50 ? 'text-red-600' : recidivismRate > 25 ? 'text-orange-600' : 'text-emerald-600'}`}>
              {recidivismRate.toFixed(0)}%
            </p>
            <p className="text-[10px] text-slate-500 mt-0.5">Tasa de recidivismo</p>
          </div>
          <div className="bg-white/70 rounded-lg px-3 py-2.5 text-center border border-white/80">
            <p className={`text-xl font-bold ${implRate >= 70 ? 'text-emerald-600' : implRate >= 40 ? 'text-amber-600' : 'text-red-600'}`}>
              {implRate.toFixed(0)}%
            </p>
            <p className="text-[10px] text-slate-500 mt-0.5">Implementación recomend.</p>
          </div>
        </div>
      </div>

      {/* Executive Summary */}
      <Section title="Resumen Ejecutivo" icon={FileText} defaultOpen accent="blue">
        <p className="text-sm text-slate-700 leading-relaxed mt-2">{r.executiveSummary}</p>
      </Section>

      {/* Escalation Alerts */}
      {r.escalationAlerts?.length > 0 && (
        <Section title="Alertas de Escalación" icon={AlertTriangle} count={r.escalationAlerts.length} defaultOpen accent="red">
          <div className="space-y-3 mt-2">
            {r.escalationAlerts.map((a, i) => (
              <div key={i} className="bg-red-50 border border-red-200 rounded-xl p-4">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <p className="text-sm font-semibold text-red-800">{a.finding}</p>
                  <div className="flex items-center gap-1.5 shrink-0 text-xs">
                    <span className={`px-1.5 py-0.5 rounded border font-medium ${SEVERITY_COLORS[a.initialSeverity] ?? 'bg-slate-100'}`}>
                      {a.initialSeverity}
                    </span>
                    <ArrowRight className="h-3 w-3 text-red-400" />
                    <span className={`px-1.5 py-0.5 rounded border font-medium ${SEVERITY_COLORS[a.currentSeverity] ?? 'bg-slate-100'}`}>
                      {a.currentSeverity}
                    </span>
                  </div>
                </div>
                <p className="text-xs text-red-700 mb-2">{a.interpretation}</p>
                <div className="flex items-start gap-2 bg-white/60 rounded-lg px-3 py-2">
                  <AlertCircle className="h-3.5 w-3.5 text-red-500 shrink-0 mt-0.5" />
                  <p className="text-xs font-medium text-red-800">{a.immediateAction}</p>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Finding Recurrence */}
      <Section title="Análisis de Recurrencia de Hallazgos" icon={RotateCcw} count={r.findingRecurrence?.recurrentThemes?.length} accent="orange">
        <div className="mt-2 space-y-3">
          <p className="text-sm text-slate-600">{r.findingRecurrence?.summary}</p>

          {r.findingRecurrence?.recurrentThemes?.map((t, i) => (
            <div key={i} className={`border-l-4 rounded-r-xl bg-slate-50 px-4 py-3 ${URGENCY_COLOR[t.urgency] ?? 'border-l-slate-300'}`}>
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <p className="text-sm font-semibold text-slate-800">{t.theme}</p>
                <div className="flex items-center gap-2 shrink-0 text-[10px]">
                  <span className="bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full font-medium">
                    {t.appearances}× ({t.years.join(', ')})
                  </span>
                  {t.wasResolvedAndReturned && (
                    <span className="bg-amber-100 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full font-medium">
                      Resuelto y reapareció
                    </span>
                  )}
                </div>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">{t.analysis}</p>
              <div className="mt-2 flex items-center gap-1.5">
                {t.severityTrend === 'escalating' && <TrendingDown className="h-3 w-3 text-red-500" />}
                {t.severityTrend === 'stable'     && <Minus         className="h-3 w-3 text-slate-400" />}
                {t.severityTrend === 'improving'  && <TrendingUp    className="h-3 w-3 text-emerald-500" />}
                <span className="text-[10px] text-slate-500">{t.severityTrendLabel ?? t.severityTrend}</span>
              </div>
            </div>
          ))}

          {r.findingRecurrence?.resolvedDefinitively?.length > 0 && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
              <p className="text-xs font-semibold text-emerald-700 mb-1.5 flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5" /> Resueltos definitivamente
              </p>
              <ul className="space-y-1">
                {r.findingRecurrence.resolvedDefinitively.map((s, i) => (
                  <li key={i} className="text-xs text-emerald-700 flex items-start gap-1.5">
                    <span className="mt-0.5 shrink-0">·</span>{s}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {r.findingRecurrence?.newInLatestPeriod?.length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
              <p className="text-xs font-semibold text-blue-700 mb-1.5 flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" /> Nuevos en el último período
              </p>
              <ul className="space-y-1">
                {r.findingRecurrence.newInLatestPeriod.map((s, i) => (
                  <li key={i} className="text-xs text-blue-700 flex items-start gap-1.5">
                    <span className="mt-0.5 shrink-0">·</span>{s}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </Section>

      {/* Risk Evolution year by year */}
      <Section title="Evolución del Perfil de Riesgo" icon={BarChart3} accent="blue">
        <div className="mt-2 space-y-3">
          <p className="text-sm text-slate-600">{r.riskEvolution?.narrative}</p>
          {r.riskEvolution?.byYear?.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="py-2 px-3 text-left font-medium text-slate-500">Año</th>
                    <th className="py-2 px-3 text-left font-medium text-slate-500">Riesgo</th>
                    <th className="py-2 px-3 text-center font-medium text-slate-500">Hallazgos</th>
                    <th className="py-2 px-3 text-center font-medium text-slate-500">Críticos</th>
                    <th className="py-2 px-3 text-center font-medium text-slate-500">Altos</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {r.riskEvolution.byYear.map((y, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="py-2 px-3 font-semibold text-slate-700">{y.year}</td>
                      <td className="py-2 px-3">
                        <span className={`px-2 py-0.5 rounded-full border text-[10px] font-medium ${SEVERITY_COLORS[y.riskLevel] ?? 'bg-slate-100 text-slate-600'}`}>
                          {y.riskLevel}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-center text-slate-700 font-medium">{y.findingsCount}</td>
                      <td className="py-2 px-3 text-center">
                        {y.criticalCount > 0 ? <span className="font-bold text-red-600">{y.criticalCount}</span> : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="py-2 px-3 text-center">
                        {y.highCount > 0 ? <span className="font-semibold text-orange-600">{y.highCount}</span> : <span className="text-slate-300">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Section>

      {/* Systemic Patterns */}
      {r.systemicPatterns?.length > 0 && (
        <Section title="Patrones Sistémicos Identificados" icon={Shield} count={r.systemicPatterns.length} accent="violet">
          <div className="mt-2 space-y-3">
            {r.systemicPatterns.map((p, i) => (
              <div key={i} className="rounded-xl bg-violet-50 border border-violet-200 p-4">
                <p className="text-sm font-semibold text-violet-800 mb-1">{p.pattern}</p>
                <p className="text-xs text-violet-700 mb-2">{p.evidence}</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-white/60 rounded-lg p-2">
                    <span className="font-medium text-violet-600">Causa raíz: </span>
                    <span className="text-violet-700">{p.rootCause}</span>
                  </div>
                  <div className="bg-white/60 rounded-lg p-2">
                    <span className="font-medium text-violet-600">Impacto: </span>
                    <span className="text-violet-700">{p.impact}</span>
                  </div>
                </div>
                {p.affectedAreas?.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {p.affectedAreas.map(a => (
                      <span key={a} className="text-[10px] bg-violet-100 text-violet-700 border border-violet-200 px-2 py-0.5 rounded-full">{a}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Implementation Effectiveness */}
      <Section title="Efectividad en Implementación de Recomendaciones" icon={Target} accent="amber">
        <div className="mt-2 space-y-3">
          <div className="flex items-center gap-4">
            <div className="flex-1 bg-slate-100 rounded-full h-3 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${implRate >= 70 ? 'bg-emerald-500' : implRate >= 40 ? 'bg-amber-400' : 'bg-red-400'}`}
                style={{ width: `${Math.min(100, Math.max(0, implRate))}%` }}
              />
            </div>
            <span className={`text-sm font-bold ${implRate >= 70 ? 'text-emerald-600' : implRate >= 40 ? 'text-amber-600' : 'text-red-600'}`}>
              {implRate.toFixed(0)}%
            </span>
          </div>
          <p className="text-sm text-slate-600">{r.implementationEffectiveness?.narrative}</p>
          <div className="grid grid-cols-2 gap-3">
            {r.implementationEffectiveness?.wellImplemented?.length > 0 && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                <p className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wide mb-2">✓ Bien implementado</p>
                <ul className="space-y-1">
                  {r.implementationEffectiveness.wellImplemented.map((s, i) => (
                    <li key={i} className="text-xs text-emerald-700">· {s}</li>
                  ))}
                </ul>
              </div>
            )}
            {r.implementationEffectiveness?.poorlyImplemented?.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                <p className="text-[10px] font-semibold text-red-600 uppercase tracking-wide mb-2">✗ Baja implementación</p>
                <ul className="space-y-1">
                  {r.implementationEffectiveness.poorlyImplemented.map((s, i) => (
                    <li key={i} className="text-xs text-red-700">· {s}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </Section>

      {/* Organizational Context */}
      <Section title="Contexto Organizacional" icon={BookOpen} accent="blue">
        <div className="mt-2 space-y-3 text-sm text-slate-700">
          <div>
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Cambios inferidos</p>
            <p className="leading-relaxed">{r.organizationalContext?.inferredChanges}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Ambiente de control</p>
            <p className="leading-relaxed">{r.organizationalContext?.controlEnvironment}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Madurez del control interno</p>
            <p className="leading-relaxed">{r.organizationalContext?.maturityAssessment}</p>
          </div>
        </div>
      </Section>

      {/* Positive Trends */}
      {r.positiveTrends?.length > 0 && (
        <Section title="Tendencias Positivas" icon={Star} count={r.positiveTrends.length} accent="green">
          <ul className="mt-2 space-y-2">
            {r.positiveTrends.map((p, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-emerald-700">
                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                {p}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Planning Recommendations */}
      <Section title="Insumos para la Auditoría en Curso" icon={Lightbulb} count={r.planningRecommendations?.length} defaultOpen accent="blue">
        <div className="mt-2 space-y-3">
          {r.planningRecommendations?.map((rec: AtlasPlanningRecommendation, i: number) => (
            <div key={i} className={`rounded-xl border p-4 ${
              rec.priority === 'high'   ? 'border-red-200 bg-red-50' :
              rec.priority === 'medium' ? 'border-amber-200 bg-amber-50' :
                                         'border-blue-200 bg-blue-50'
            }`}>
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <p className="text-sm font-semibold text-slate-800">{rec.area}</p>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold shrink-0 ${
                  rec.priority === 'high'   ? 'bg-red-100 text-red-700 border border-red-200' :
                  rec.priority === 'medium' ? 'bg-amber-100 text-amber-700 border border-amber-200' :
                                              'bg-blue-100 text-blue-700 border border-blue-200'
                }`}>
                  {rec.priority === 'high' ? 'Alta' : rec.priority === 'medium' ? 'Media' : 'Baja'}
                </span>
              </div>
              <p className="text-xs text-slate-700 mb-2">{rec.recommendation}</p>
              <p className="text-[11px] text-slate-500 mb-2 italic">{rec.rationale}</p>
              {rec.suggestedProcedure && (
                <div className="flex items-start gap-2 bg-white/60 rounded-lg px-3 py-1.5">
                  <ArrowRight className="h-3 w-3 text-slate-400 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-slate-600">{rec.suggestedProcedure}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </Section>

      {/* Management Letter Points */}
      {r.managementLetterPoints?.length > 0 && (
        <Section title="Management Letter — Puntos Clave" icon={FileText} count={r.managementLetterPoints.length} accent="violet">
          <div className="mt-2 space-y-3">
            {r.managementLetterPoints.map((p, i) => (
              <div key={i} className="border border-slate-200 rounded-xl p-4">
                <p className="text-sm font-semibold text-slate-800 mb-2">{p.title}</p>
                <p className="text-sm text-slate-700 leading-relaxed italic border-l-2 border-violet-300 pl-3">{p.narrative}</p>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Conclusion */}
      <Section title="Conclusión Profesional" icon={CheckCircle2} defaultOpen accent="green">
        <p className="mt-2 text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{r.conclusion}</p>
      </Section>

      {/* Footer */}
      <div className="flex items-center justify-between text-[10px] text-slate-400 px-1">
        <span>Generado por ATLAS · {result.model}</span>
        <span>{new Date(result.generatedAt).toLocaleString()}</span>
      </div>
    </div>
  );
}

// ─── Main modal ───────────────────────────────────────────────────────────────

interface AuditOption {
  id: string;
  title: string;
  status: string;
  startDate?: string;
  endDate?: string;
  type?: string;
  riskLevel?: string;
  findingsCount?: number;
}

export function AtlasAnalysisModal({
  audits,
  onClose,
}: {
  audits: AuditOption[];
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<AtlasAnalysisResult | null>(null);
  const analysis = useMultiYearAnalysis();

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handleRun() {
    if (selected.size < 2) return;
    setResult(null);
    const res = await analysis.mutateAsync([...selected]);
    setResult(res);
  }

  const canRun = selected.size >= 2 && selected.size <= 6;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-start justify-end z-50">
      <div className="h-full w-full max-w-3xl bg-white shadow-2xl flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 flex-shrink-0 bg-[#0F2D4A]">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-violet-600/80 flex items-center justify-center text-white font-bold text-sm">
              A
            </div>
            <div>
              <p className="text-sm font-bold text-white">ATLAS — Inteligencia Multi-Año</p>
              <p className="text-[11px] text-blue-300">Análisis de carry-forward · Big 4 methodology</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-white/60 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-6 space-y-5">

          {/* Audit selector */}
          {!result && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-sm font-semibold text-slate-800">Selecciona las auditorías a comparar</p>
                  <p className="text-xs text-slate-500 mt-0.5">Elige 2–6 ciclos del mismo tipo/entidad en diferentes años</p>
                </div>
                <span className={`text-xs px-2.5 py-1 rounded-full font-semibold border ${
                  selected.size >= 2 ? 'bg-violet-100 text-violet-700 border-violet-200' : 'bg-slate-100 text-slate-500 border-slate-200'
                }`}>
                  {selected.size} / 6
                </span>
              </div>

              <div className="space-y-2">
                {audits.map(a => {
                  const isSelected = selected.has(a.id);
                  const isDisabled = !isSelected && selected.size >= 6;
                  return (
                    <button
                      key={a.id}
                      onClick={() => !isDisabled && toggle(a.id)}
                      disabled={isDisabled}
                      className={`w-full text-left rounded-xl border px-4 py-3 transition-all ${
                        isSelected
                          ? 'border-violet-400 bg-violet-50 ring-1 ring-violet-300'
                          : isDisabled
                          ? 'border-slate-100 bg-slate-50 opacity-40 cursor-not-allowed'
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`mt-0.5 h-4 w-4 rounded border flex items-center justify-center flex-shrink-0 ${
                          isSelected ? 'bg-violet-600 border-violet-600' : 'border-slate-300'
                        }`}>
                          {isSelected && <CheckCircle2 className="h-3 w-3 text-white" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-800 truncate">{a.title}</p>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            {a.startDate && (
                              <span className="text-[11px] text-slate-500">
                                {new Date(a.startDate).getFullYear()}
                                {a.endDate && ` – ${new Date(a.endDate).getFullYear()}`}
                              </span>
                            )}
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                              a.status === 'CLOSED' ? 'bg-emerald-100 text-emerald-700' :
                              a.status === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-700' :
                              'bg-slate-100 text-slate-600'
                            }`}>
                              {a.status === 'CLOSED' ? 'Cerrada' : a.status === 'IN_PROGRESS' ? 'En progreso' : a.status}
                            </span>
                            {a.riskLevel && (
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium border ${SEVERITY_COLORS[a.riskLevel] ?? 'bg-slate-100'}`}>
                                {a.riskLevel}
                              </span>
                            )}
                            {a.findingsCount !== undefined && (
                              <span className="text-[11px] text-slate-400">{a.findingsCount} hallazgos</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {selected.size >= 2 && (
                <div className="mt-4 flex justify-end">
                  <button
                    onClick={handleRun}
                    disabled={!canRun || analysis.isPending}
                    className="flex items-center gap-2 px-5 py-2.5 bg-violet-600 text-white rounded-xl text-sm font-semibold hover:bg-violet-700 disabled:opacity-50 transition-colors"
                  >
                    {analysis.isPending ? (
                      <><Loader2 className="h-4 w-4 animate-spin" /> Analizando {selected.size} ciclos…</>
                    ) : (
                      <><Sparkles className="h-4 w-4" /> Generar Análisis ATLAS</>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Loading state */}
          {analysis.isPending && (
            <div className="flex flex-col items-center py-16 gap-4">
              <div className="flex gap-1.5">
                {[0, 1, 2, 3, 4].map(i => (
                  <div key={i} className="w-2.5 h-2.5 rounded-full bg-violet-400 animate-bounce"
                    style={{ animationDelay: `${i * 100}ms` }} />
                ))}
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-violet-700">ATLAS está analizando {selected.size} ciclos de auditoría</p>
                <p className="text-xs text-slate-400 mt-1">Detectando recurrencias, patrones sistémicos y tendencias…</p>
              </div>
            </div>
          )}

          {/* Error */}
          {analysis.isError && (
            <div className="rounded-xl bg-red-50 border border-red-200 p-4">
              <p className="text-sm font-semibold text-red-700 mb-1">Error al generar el análisis</p>
              <p className="text-xs text-red-600">{(analysis.error as Error)?.message}</p>
              <button onClick={() => analysis.reset()} className="mt-3 text-xs text-red-600 hover:underline">
                Intentar de nuevo
              </button>
            </div>
          )}

          {/* Report */}
          {result && !analysis.isPending && (
            <>
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-500">Análisis completado</p>
                <button
                  onClick={() => { setResult(null); analysis.reset(); }}
                  className="text-xs text-slate-500 hover:text-violet-600 flex items-center gap-1"
                >
                  <RotateCcw className="h-3 w-3" /> Nuevo análisis
                </button>
              </div>
              <AtlasReport result={result} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
