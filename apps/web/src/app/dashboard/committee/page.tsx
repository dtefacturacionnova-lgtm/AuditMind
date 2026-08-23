'use client';

import { useState } from 'react';
import {
  AlertTriangle, CheckCircle2, Clock, TrendingUp,
  ShieldAlert, BarChart3, Users2, Lock, Radio, RotateCcw, ListChecks, Repeat,
} from 'lucide-react';
import { Header } from '@/components/layout/Header';
import {
  useCommitteeDashboard, useCommitteePeriods, usePublishCommitteeSnapshot,
  type PeriodType, type EngagementState,
} from '@/hooks/useCommittee';
import { formatDate } from '@/lib/utils';

// ─── Config ────────────────────────────────────────────────────────────────

const POSTURE_CONFIG = {
  CRITICAL: { label: 'Crítico',            bg: 'bg-red-600',     text: 'text-white',     border: 'border-red-700'    },
  HIGH:     { label: 'Alto',               bg: 'bg-orange-500',  text: 'text-white',     border: 'border-orange-600' },
  MEDIUM:   { label: 'Moderado',           bg: 'bg-amber-400',   text: 'text-amber-900', border: 'border-amber-500'  },
  LOW:      { label: 'Bajo',               bg: 'bg-blue-500',    text: 'text-white',     border: 'border-blue-600'   },
  NONE:     { label: 'Sin riesgo abierto', bg: 'bg-emerald-500', text: 'text-white',     border: 'border-emerald-600'},
} as const;

const SEVERITY_COLOR: Record<string, string> = {
  CRITICAL: 'bg-red-500', HIGH: 'bg-orange-400', MEDIUM: 'bg-amber-400', LOW: 'bg-blue-400', INFORMATIONAL: 'bg-gray-400',
};
const SEVERITY_LABEL: Record<string, string> = {
  CRITICAL: 'Crítico', HIGH: 'Alto', MEDIUM: 'Medio', LOW: 'Bajo', INFORMATIONAL: 'Informativo',
};

const STATE_CONFIG: Record<EngagementState, { label: string; cls: string; icon: string }> = {
  DONE_ON_TIME:         { label: 'Terminado a tiempo',       cls: 'bg-emerald-50 text-emerald-700', icon: '✅' },
  DONE_LATE:            { label: 'Terminado con atraso',     cls: 'bg-emerald-50 text-emerald-700', icon: '✅' },
  IN_PROGRESS_ON_TRACK: { label: 'En progreso — a tiempo',   cls: 'bg-amber-50 text-amber-700',     icon: '🔶' },
  IN_PROGRESS_AT_RISK:  { label: 'En riesgo',                cls: 'bg-red-50 text-red-700',         icon: '⚠️' },
  IN_PROGRESS_OVERDUE:  { label: 'Retrasado',                cls: 'bg-red-50 text-red-700',         icon: '🔴' },
  NOT_STARTED_ON_TRACK: { label: 'No iniciado',              cls: 'bg-gray-100 text-gray-500',      icon: '⚪' },
  NOT_STARTED_OVERDUE:  { label: 'No iniciado — retrasado',  cls: 'bg-red-50 text-red-700',         icon: '🔴' },
};

const PERIOD_TABS: Array<{ key: PeriodType; label: string }> = [
  { key: 'MONTHLY', label: 'Mes' },
  { key: 'QUARTERLY', label: 'Trimestre' },
  { key: 'SEMIANNUAL', label: 'Semestre' },
  { key: 'ANNUAL', label: 'Año' },
];

function daysOverdue(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  return Math.max(0, Math.floor(diff / 86_400_000));
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function KpiCard({
  label, value, sub, icon: Icon, colorClass,
}: { label: string; value: string | number; sub?: string; icon: React.ElementType; colorClass: string }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 flex items-start gap-4">
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${colorClass}`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-bold text-gray-800 leading-tight">{value}</p>
        <p className="text-xs font-medium text-gray-500 mt-0.5 truncate">{label}</p>
        {sub && <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function HorizBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="w-20 shrink-0 text-xs text-gray-500 text-right">{label}</span>
      <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-6 text-right text-xs font-semibold text-gray-700">{value}</span>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CommitteePage() {
  const [periodType, setPeriodType] = useState<PeriodType>('QUARTERLY');
  const [periodKey, setPeriodKey] = useState<string | undefined>(undefined);

  const { data: periods } = useCommitteePeriods(periodType);
  const { data, isLoading } = useCommitteeDashboard(periodType, periodKey);
  const publishSnapshot = usePublishCommitteeSnapshot();

  function changePeriodType(pt: PeriodType) {
    setPeriodType(pt);
    setPeriodKey(undefined);
  }

  async function handleCloseCut() {
    if (!data) return;
    const ok = window.confirm(
      `¿Cerrar el corte de ${data.period.label}? Los indicadores quedarán congelados tal como están ahora — ` +
      'consultarlo más adelante ya no recalculará en vivo.',
    );
    if (!ok) return;
    await publishSnapshot.mutateAsync({ periodType, period: data.period.key });
  }

  if (isLoading || !data) {
    return (
      <div className="flex flex-col h-full">
        <Header title="Comité de Auditoría" />
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  const posture = POSTURE_CONFIG[data.riskPosture] ?? POSTURE_CONFIG.NONE;
  const maxSev = Math.max(...Object.values(data.openBySeverity), 1);
  const maxTrend = Math.max(...data.trend.map(t => t.completionPct), 1);

  return (
    <div className="flex flex-col h-full">
      <Header title="Comité de Auditoría" />

      <div className="flex-1 overflow-auto p-6 space-y-6">

        {/* ── Barra de período ─────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-xl border border-gray-200 bg-gray-50 p-1">
            {PERIOD_TABS.map(t => (
              <button
                key={t.key}
                onClick={() => changePeriodType(t.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  periodType === t.key ? 'bg-white text-[#0F2D4A] shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {periods && periods.length > 0 && (
            <select
              value={data.period.key}
              onChange={e => setPeriodKey(e.target.value)}
              className="text-xs font-semibold bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-gray-700"
            >
              {periods.map(p => (
                <option key={p.key} value={p.key}>
                  {p.label}{p.frozen ? ' · cerrado' : p.isCurrent ? ' · en curso' : ''}
                </option>
              ))}
            </select>
          )}

          {data.meta.frozen ? (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1.5 rounded-full bg-gray-100 text-gray-600">
              <Lock className="w-3 h-3" />
              Corte cerrado{data.meta.preparedByName ? ` por ${data.meta.preparedByName}` : ''}
              {data.meta.publishedAt ? ` · ${formatDate(data.meta.publishedAt)}` : ''}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1.5 rounded-full bg-red-50 text-red-600">
              <Radio className="w-3 h-3 animate-pulse" />
              En vivo — aún no presentado
            </span>
          )}

          {!data.meta.frozen && (
            <button
              onClick={handleCloseCut}
              disabled={publishSnapshot.isPending || data.planExecution.length === 0}
              className="ml-auto text-xs font-bold bg-[#0F2D4A] text-white rounded-xl px-3.5 py-2 disabled:opacity-40"
            >
              {publishSnapshot.isPending ? 'Cerrando…' : 'Cerrar corte del comité'}
            </button>
          )}
        </div>

        {/* ── Risk Posture banner ─────────────────────────────────────────── */}
        <div className={`rounded-2xl p-5 flex items-center gap-5 ${posture.bg} ${posture.text} border ${posture.border}`}>
          <ShieldAlert className="w-10 h-10 shrink-0 opacity-90" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest opacity-75">Postura de Riesgo Global</p>
            <p className="text-3xl font-extrabold leading-tight">{posture.label}</p>
            <p className="text-sm opacity-80 mt-0.5">
              Basado en {data.kpis.openFindings} hallazgos abiertos
              {data.kpis.criticalOpen > 0 && ` · ${data.kpis.criticalOpen} crítico${data.kpis.criticalOpen > 1 ? 's' : ''}`}
            </p>
          </div>
        </div>

        {/* ── KPI cards ───────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
          <div className="col-span-2 bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
            <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-2">
              Cumplimiento del Plan · {data.period.label}
            </p>
            <div className="flex items-end gap-3">
              <p className="text-4xl font-extrabold text-gray-800 leading-none">{data.summary.completionPct}%</p>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-[11px] text-gray-500">
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500" />{data.summary.doneOnTime} terminados</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500" />{data.summary.delayed} retrasados</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-400" />{data.summary.atRisk + data.summary.onTrack} en progreso</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-gray-300" />{data.summary.notStarted} no iniciados</span>
            </div>
          </div>
          <KpiCard label="Hallazgos Abiertos" value={data.kpis.openFindings} icon={AlertTriangle} colorClass="bg-orange-500" />
          <KpiCard label="Críticos / Materiales" value={`${data.kpis.criticalOpen} / ${data.kpis.materialOpen}`} icon={ShieldAlert} colorClass="bg-red-500" />
          <KpiCard label="Acciones Vencidas" value={data.kpis.overdueActionsCount} icon={Clock} colorClass="bg-amber-500" />
          <KpiCard
            label="Horas Real / Plan."
            value={`${Math.round(data.summary.hoursReal)} / ${Math.round(data.summary.hoursPlanned)}`}
            sub={`del período seleccionado`}
            icon={BarChart3}
            colorClass="bg-blue-500"
          />
          <KpiCard
            label="Cobertura Universo Anual"
            value={`${data.summary.universeCoveragePct}%`}
            sub={`${data.summary.universeDone} de ${data.summary.universeTotal} auditorías`}
            icon={TrendingUp}
            colorClass="bg-indigo-500"
          />
        </div>

        {/* ── Ejecución del Plan Anual ─────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <ListChecks className="w-4 h-4 text-[#0F2D4A]" />
              Ejecución del Plan Anual — {data.period.label}
            </h3>
            <p className="text-[11px] text-gray-400 mt-0.5">
              Agrupado por la ventana de ejecución planificada de cada encargo · horas reales tomadas al corte
            </p>
          </div>

          {!data.plan ? (
            <p className="text-sm text-gray-400 py-8 text-center">Sin plan anual para este período.</p>
          ) : data.planExecution.length === 0 ? (
            <p className="text-sm text-gray-400 py-8 text-center">No hay encargos planificados en este período.</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {data.planExecution.map(item => {
                const cfg = STATE_CONFIG[item.state];
                const hoursPct = item.hoursPlanned > 0 ? Math.min(100, Math.round((item.hoursReal / item.hoursPlanned) * 100)) : 0;
                const isBad = item.state === 'IN_PROGRESS_OVERDUE' || item.state === 'NOT_STARTED_OVERDUE' || item.state === 'IN_PROGRESS_AT_RISK';
                return (
                  <div key={item.planItemId} className={`px-5 py-4 grid grid-cols-1 lg:grid-cols-[2fr_1fr_1.4fr_0.9fr_1.1fr] gap-4 items-center ${isBad ? 'bg-red-50/30' : ''}`}>
                    <div>
                      <p className="font-semibold text-sm text-gray-800">{item.name}</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">
                        {item.tentativeStartDate ? formatDate(item.tentativeStartDate) : '—'} – {item.tentativeEndDate ? formatDate(item.tentativeEndDate) : '—'}
                      </p>
                    </div>

                    <div>
                      <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full ${cfg.cls}`}>
                        {cfg.icon} {cfg.label}
                      </span>
                    </div>

                    <div>
                      <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${item.pct >= 100 ? 'bg-emerald-500' : isBad ? 'bg-red-400' : 'bg-amber-400'}`}
                          style={{ width: `${item.pct}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-[10px] text-gray-400 mt-1">
                        <span>{item.pct}% avanzado</span>
                        {item.currentPhaseLabel && <span className="truncate max-w-[140px]">{item.currentPhaseLabel}</span>}
                      </div>
                    </div>

                    <div className="text-[11px] font-variant-numeric-tabular">
                      <p><span className="font-bold text-gray-800">{Math.round(item.hoursReal)}</span> <span className="text-gray-400">/ {Math.round(item.hoursPlanned)} h</span></p>
                      <div className="w-full bg-gray-100 rounded-full h-1 mt-1">
                        <div className={`h-full rounded-full ${hoursPct > 100 ? 'bg-red-500' : 'bg-blue-500'}`} style={{ width: `${Math.min(hoursPct, 100)}%` }} />
                      </div>
                    </div>

                    <div>
                      <p className={`text-[11px] font-semibold ${isBad ? 'text-red-600' : 'text-gray-500'}`}>{item.dateNote}</p>
                      {item.findings.total > 0 ? (
                        <p className="text-[11px] mt-1 flex items-center gap-1.5">
                          <span className={`inline-block w-1.5 h-1.5 rounded-full ${SEVERITY_COLOR[item.findings.highest ?? ''] ?? 'bg-gray-400'}`} />
                          {item.findings.total} hallazgo{item.findings.total > 1 ? 's' : ''}
                          {item.findings.highest && ` · ${SEVERITY_LABEL[item.findings.highest]}`}
                        </p>
                      ) : (
                        <p className="text-[11px] text-gray-300 mt-1">Sin hallazgos</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Tendencia + severidad ────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-1 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-[#0F2D4A]" />
              Cumplimiento del Plan por Período
            </h3>
            <p className="text-[11px] text-gray-400 mb-4">Comparado entre cortes ya presentados al comité</p>
            <div className="flex items-end gap-4 h-28">
              {data.trend.map(t => (
                <div key={t.period} className="flex-1 flex flex-col items-center justify-end h-full gap-1.5">
                  <span className="text-[11px] font-bold text-gray-700">{t.hasData ? `${t.completionPct}%` : '—'}</span>
                  <div className="w-full max-w-[38px] bg-gray-100 rounded-t-md overflow-hidden" style={{ height: '100%' }}>
                    <div
                      className={`w-full rounded-t-md ${t.isCurrent ? 'bg-amber-400' : t.hasData ? 'bg-emerald-500' : 'bg-gray-200'}`}
                      style={{ height: `${Math.max(t.completionPct, t.hasData ? 4 : 100)}%`, marginTop: 'auto' }}
                    />
                  </div>
                  <span className={`text-[10px] ${t.isCurrent ? 'text-[#0F2D4A] font-bold' : 'text-gray-400'}`}>{t.label.split(' ')[0]}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-orange-500" />
              Hallazgos Abiertos por Severidad
            </h3>
            {Object.keys(data.openBySeverity).length === 0 ? (
              <p className="text-xs text-gray-400 py-4 text-center">Sin hallazgos abiertos</p>
            ) : (
              <div className="space-y-3">
                {['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFORMATIONAL'].map(sev => {
                  const count = data.openBySeverity[sev];
                  if (!count) return null;
                  return (
                    <HorizBar key={sev} label={SEVERITY_LABEL[sev] ?? sev} value={count} max={maxSev} color={SEVERITY_COLOR[sev] ?? 'bg-gray-400'} />
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Hallazgos recurrentes ─────────────────────────────────────────── */}
        {data.recurringFindings.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex items-start gap-4">
            <Repeat className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-800">Hallazgos recurrentes detectados</p>
              <ul className="text-xs text-amber-700 mt-1.5 space-y-1">
                {data.recurringFindings.map(f => (
                  <li key={f.id}>· <span className="font-medium">{f.title}</span> — {f.audit.title}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* ── Acciones vencidas ────────────────────────────────────────────── */}
        {data.overdueActions.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-500" />
                Acciones de Mejora Vencidas
              </h3>
              <span className="text-xs font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
                {data.overdueActions.length} acción{data.overdueActions.length > 1 ? 'es' : ''}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 text-gray-500 text-left">
                    <th className="px-4 py-2.5 font-semibold">Hallazgo</th>
                    <th className="px-4 py-2.5 font-semibold">Acción</th>
                    <th className="px-4 py-2.5 font-semibold">Severidad</th>
                    <th className="px-4 py-2.5 font-semibold text-right">Días vencido</th>
                    <th className="px-4 py-2.5 font-semibold text-right">Avance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {data.overdueActions.map(action => {
                    const days = daysOverdue(action.dueDate);
                    const sevColor = SEVERITY_COLOR[action.finding.severity] ?? 'bg-gray-400';
                    return (
                      <tr key={action.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 max-w-[200px]">
                          <p className="truncate font-medium text-gray-800">{action.finding.title}</p>
                          <p className="text-gray-400 text-[10px]">{formatDate(action.dueDate)}</p>
                        </td>
                        <td className="px-4 py-3 max-w-[220px]">
                          <p className="truncate text-gray-600">{action.description}</p>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-block w-2 h-2 rounded-full mr-1.5 ${sevColor}`} />
                          {SEVERITY_LABEL[action.finding.severity] ?? action.finding.severity}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="font-semibold text-red-600">{days}d</span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-16 bg-gray-100 rounded-full h-1.5">
                              <div className="h-full rounded-full bg-amber-400" style={{ width: `${action.progressPct}%` }} />
                            </div>
                            <span className="text-gray-500 text-[11px] w-8 text-right">{action.progressPct}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Hallazgos escalados ──────────────────────────────────────────── */}
        {data.escalatedFindings.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <Users2 className="w-4 h-4 text-red-500" />
                Hallazgos Escalados
              </h3>
              <span className="text-xs font-semibold text-red-700 bg-red-50 px-2 py-0.5 rounded-full">
                {data.escalatedFindings.length} escalado{data.escalatedFindings.length > 1 ? 's' : ''}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 text-gray-500 text-left">
                    <th className="px-4 py-2.5 font-semibold">Hallazgo</th>
                    <th className="px-4 py-2.5 font-semibold">Auditoría</th>
                    <th className="px-4 py-2.5 font-semibold">Severidad</th>
                    <th className="px-4 py-2.5 font-semibold">Nivel Escalación</th>
                    <th className="px-4 py-2.5 font-semibold">Responsable</th>
                    <th className="px-4 py-2.5 font-semibold">Vencimiento</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {data.escalatedFindings.map(f => (
                    <tr key={f.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 max-w-[180px]"><p className="truncate font-medium text-gray-800">{f.title}</p></td>
                      <td className="px-4 py-3 max-w-[160px]"><p className="truncate text-gray-600">{f.audit.title}</p></td>
                      <td className="px-4 py-3">
                        <span className={`inline-block w-2 h-2 rounded-full mr-1.5 ${SEVERITY_COLOR[f.severity] ?? 'bg-gray-400'}`} />
                        {SEVERITY_LABEL[f.severity] ?? f.severity}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-50 text-red-700">
                          {f.escalationLevel?.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500">{f.responsible?.name ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-500">{f.dueDate ? formatDate(f.dueDate) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {data.overdueActions.length === 0 && data.escalatedFindings.length === 0 && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 flex items-center gap-4">
            <CheckCircle2 className="w-8 h-8 text-emerald-500 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-emerald-800">Sin alertas activas</p>
              <p className="text-xs text-emerald-600 mt-0.5">No hay acciones vencidas ni hallazgos escalados al Comité en este momento.</p>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 text-[11px] text-gray-400 px-1">
          <RotateCcw className="w-3 h-3" />
          {data.meta.frozen
            ? 'Corte congelado — estos números no cambian aunque los encargos avancen.'
            : 'Período en curso — estos números se recalculan en vivo hasta que se cierre el corte.'}
        </div>

      </div>
    </div>
  );
}
