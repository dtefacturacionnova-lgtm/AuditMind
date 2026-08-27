'use client';

import { useState } from 'react';
import {
  AlertTriangle, CheckCircle2, Clock, TrendingUp,
  ShieldAlert, BarChart3, Users2, Lock, Radio, RotateCcw, ListChecks, Repeat,
  LayoutGrid, Building2, PieChart, Percent, DollarSign, ShieldCheck,
} from 'lucide-react';
import { Header } from '@/components/layout/Header';
import {
  useCommitteeDashboard, useCommitteePeriods, usePublishCommitteeSnapshot,
  type PeriodType, type EngagementState, type PlanExecutionItem, type ControlInternoGlobal,
  type OrgProfitability, type QaipSummary,
} from '@/hooks/useCommittee';
import { useCommitteeDashboard as useCommitteeDashboardLegacy } from '@/hooks/useDashboard';
import type { FirmDashboard } from '@/hooks/useCapacity';
import { formatDate, cn } from '@/lib/utils';
import Link from 'next/link';

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

// Vigentes solo en la pestaña "Detalles" — vista clásica (sin recorte por
// período), restaurada del dashboard original junto a un análisis nuevo
// (hallazgos por estado de ciclo completo) que usa un dato que el backend
// ya calculaba (`allByStatus`) pero ninguna vista llegó a mostrar.
const AUDIT_STATUS_LABEL: Record<string, string> = {
  PLANNING: 'Planificación', IN_PROGRESS: 'En Progreso',
  REVIEW: 'En Revisión', CLOSED: 'Cerrada', CANCELLED: 'Cancelada',
};
const FINDING_STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Borrador', IN_REVIEW: 'En Revisión', APPROVED: 'Aprobado',
  IN_PROGRESS: 'En Progreso', CLOSED: 'Cerrado', OVERDUE: 'Vencido', ACCEPTED_RISK: 'Riesgo Aceptado',
};

// Control Interno Global (COSO 2013) — mismas 4 bandas y mismo criterio de
// color que el panel del papel PT-COSO (`CosoScorePanel.tsx`), para que un
// auditor que ya conoce esa pantalla reconozca el mismo semáforo acá.
const COSO_BAND_COLORS: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  'Efectivo':      { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500' },
  'Confiable':     { bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200',   dot: 'bg-amber-400' },
  'Poco Confiable':{ bg: 'bg-orange-50',  text: 'text-orange-700',  border: 'border-orange-200',  dot: 'bg-orange-500' },
  'No Confiable':  { bg: 'bg-red-50',     text: 'text-red-700',     border: 'border-red-200',     dot: 'bg-red-500' },
};
const COSO_CONCLUSION_LABEL: Record<string, string> = {
  EFECTIVO: 'Efectivo', CON_DEBILIDADES_SIGNIFICATIVAS: 'Con Debilidades Significativas', INEFECTIVO: 'Inefectivo',
};
const COSO_CONCLUSION_COLOR: Record<string, string> = {
  EFECTIVO: 'bg-emerald-500', CON_DEBILIDADES_SIGNIFICATIVAS: 'bg-amber-400', INEFECTIVO: 'bg-red-500',
};

// Mismo criterio de color que apps/web/src/app/dashboard/firm-hours/page.tsx
// (única fuente de este semáforo) — se repite acá porque ese archivo no
// exporta el helper.
function utilizacionTone(pct: number | null): string {
  if (pct === null) return 'text-gray-400';
  if (pct >= 90) return 'text-red-600';
  if (pct >= 70) return 'text-emerald-600';
  if (pct >= 40) return 'text-amber-600';
  return 'text-gray-500';
}

function daysOverdue(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  return Math.max(0, Math.floor(diff / 86_400_000));
}

function money(n: number | null): string {
  if (n === null) return '—';
  return `$${n.toLocaleString('es', { maximumFractionDigits: 0 })}`;
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

// Banner del Resumen — el usuario notó que una versión anterior del dashboard
// mostraba el resultado de Control Interno Global al corte; se restaura acá
// como su propio bloque (mismo peso visual que la Postura de Riesgo) porque es
// gobierno corporativo de primer nivel, no un detalle operativo.
function ControlInternoGlobalBanner({ cig }: { cig: ControlInternoGlobal }) {
  const colors = cig.globalBand ? COSO_BAND_COLORS[cig.globalBand] : null;
  if (cig.auditsEvaluated === 0) {
    return (
      <div className="rounded-2xl p-5 flex items-center gap-4 bg-gray-50 border border-gray-200 text-gray-400">
        <ShieldCheck className="w-8 h-8 shrink-0 opacity-40" />
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest">Control Interno Global (COSO 2013)</p>
          <p className="text-sm mt-0.5">
            Ninguna auditoría de la organización tiene todavía una evaluación PT-COSO completada — se calculará automáticamente en cuanto haya datos.
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className={`rounded-2xl p-5 flex flex-wrap items-center gap-5 ${colors?.bg ?? 'bg-gray-50'} border ${colors?.border ?? 'border-gray-200'}`}>
      <ShieldCheck className={`w-10 h-10 shrink-0 ${colors?.text ?? 'text-gray-500'}`} />
      <div className="flex-1 min-w-[220px]">
        <p className={`text-xs font-semibold uppercase tracking-widest ${colors?.text ?? 'text-gray-500'} opacity-80`}>
          Control Interno Global (COSO 2013) — al corte
        </p>
        <p className={`text-3xl font-extrabold leading-tight ${colors?.text ?? 'text-gray-700'}`}>{cig.globalBand ?? '—'}</p>
        <p className={`text-sm mt-0.5 ${colors?.text ?? 'text-gray-500'} opacity-80`}>
          Puntaje promedio {cig.avgScore?.toFixed(0)} (100–400) sobre {cig.auditsEvaluated} de {cig.auditsTotal} auditorías con PT-COSO evaluado.
        </p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {Object.entries(cig.distribution).map(([key, count]) => (
          <span key={key} className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1.5 rounded-full bg-white/70 text-gray-700">
            <span className={`w-2 h-2 rounded-full ${COSO_CONCLUSION_COLOR[key] ?? 'bg-gray-400'}`} />
            {count} {COSO_CONCLUSION_LABEL[key] ?? key}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── QAIP y Calidad — resultado del año del corte (IIA Std. 8.3) ─────────────
const QAIP_RESULT_COLORS: Record<string, { bg: string; border: string; text: string; dot: string }> = {
  GREEN:   { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  YELLOW:  { bg: 'bg-amber-50',   border: 'border-amber-200',   text: 'text-amber-700',   dot: 'bg-amber-500' },
  RED:     { bg: 'bg-red-50',     border: 'border-red-200',     text: 'text-red-700',     dot: 'bg-red-500' },
  PENDING: { bg: 'bg-gray-50',    border: 'border-gray-200',    text: 'text-gray-500',    dot: 'bg-gray-300' },
};
const QAIP_RESULT_LABEL: Record<string, string> = { GREEN: 'Verde', YELLOW: 'Amarillo', RED: 'Rojo', PENDING: 'Pendiente' };
const QAIP_TRACK_LABEL: Record<string, string> = { IIA_INTERNAL: 'Auditoría Interna (IIA)', NIGC_EXTERNAL: 'Auditoría Externa (NIGC 1/2)' };

function QaipBanner({ qaip }: { qaip: QaipSummary }) {
  if (qaip.tracks.length === 0) {
    return (
      <div className="rounded-2xl p-5 flex items-center gap-4 bg-gray-50 border border-gray-200 text-gray-400">
        <Users2 className="w-8 h-8 shrink-0 opacity-40" />
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest">QAIP y Calidad — {qaip.year}</p>
          <p className="text-sm mt-0.5">
            Sin autoevaluación decidida para {qaip.year} todavía — ver <Link href="/dashboard/qaip" className="underline">QAIP y Calidad</Link>.
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5">
      <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">QAIP y Calidad — {qaip.year} (IIA Std. 8.3)</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {qaip.tracks.map(t => {
          const c = QAIP_RESULT_COLORS[t.overallResult] ?? QAIP_RESULT_COLORS.PENDING;
          return (
            <div key={t.track} className={`rounded-xl p-4 ${c.bg} border ${c.border}`}>
              <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${c.dot}`} />
                <p className={`text-sm font-bold ${c.text}`}>{QAIP_TRACK_LABEL[t.track] ?? t.track}: {QAIP_RESULT_LABEL[t.overallResult]}</p>
              </div>
              {t.overallJustification && <p className={`text-xs mt-1.5 ${c.text} opacity-80`}>{t.overallJustification}</p>}
              <p className="text-[11px] text-gray-400 mt-1.5">Decidido por {t.decidedByName ?? '—'} el {formatDate(t.decidedAt)}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CommitteePage() {
  const [activeTab, setActiveTab] = useState<'resumen' | 'detalles'>('resumen');
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

        {/* ── Pestañas: resumen ejecutivo vs. detalle histórico completo ────── */}
        <div className="inline-flex rounded-xl border border-gray-200 bg-gray-50 p-1">
          <button
            onClick={() => setActiveTab('resumen')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              activeTab === 'resumen' ? 'bg-white text-[#0F2D4A] shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            Resumen para Comité
          </button>
          <button
            onClick={() => setActiveTab('detalles')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              activeTab === 'detalles' ? 'bg-white text-[#0F2D4A] shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <PieChart className="w-3.5 h-3.5" />
            Detalles
          </button>
        </div>

        {activeTab === 'detalles' && (
          <DetallesTab
            planExecution={data.planExecution}
            controlInternoGlobal={data.controlInternoGlobal}
            orgProfitability={data.orgProfitability}
            firmUtilization={data.firmUtilization}
          />
        )}

        {activeTab === 'resumen' && <>
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

        {/* ── Control Interno Global (COSO 2013) — al corte ────────────────── */}
        <ControlInternoGlobalBanner cig={data.controlInternoGlobal} />

        {/* ── QAIP y Calidad — resultado del año del corte (IIA Std. 8.3) ──── */}
        <QaipBanner qaip={data.qaip} />

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
        </>}

      </div>
    </div>
  );
}

// ─── Pestaña "Detalles" ─────────────────────────────────────────────────────
// Vista clásica sin recorte por período (siempre "ahora mismo") — restaura
// dos análisis que el rediseño por período dejó fuera (Portfolio de
// Auditorías por Estado, Tasa de Resolución YTD) usando el endpoint legado
// `GET /dashboard/committee` (`useDashboard.ts`), que sigue vivo sin tocar
// desde antes del rediseño. Suma un tercer análisis nuevo — Hallazgos por
// Estado de ciclo completo — con un dato que ese mismo endpoint ya
// calculaba (`allByStatus`) pero ninguna vista mostraba todavía.
interface StatusGroup {
  status: string;
  count: number;
  hoursPlanned: number;
  hoursReal: number;
  cost: number;
  revenue: number;
  revenueKnown: number;
  margin: number;
  marginKnown: number;
}

function groupByAuditStatus(items: PlanExecutionItem[]): StatusGroup[] {
  const groups = new Map<string, StatusGroup>();
  for (const item of items) {
    const key = item.auditStatus ?? 'SIN_AUDITORIA';
    if (!groups.has(key)) {
      groups.set(key, { status: key, count: 0, hoursPlanned: 0, hoursReal: 0, cost: 0, revenue: 0, revenueKnown: 0, margin: 0, marginKnown: 0 });
    }
    const g = groups.get(key)!;
    g.count++;
    g.hoursPlanned += item.hoursPlanned;
    g.hoursReal += item.hoursReal;
    if (item.financials) {
      g.cost += item.financials.cost;
      if (item.financials.revenue !== null) { g.revenue += item.financials.revenue; g.revenueKnown++; }
      if (item.financials.margin !== null) { g.margin += item.financials.margin; g.marginKnown++; }
    }
  }
  return [...groups.values()].sort((a, b) => b.count - a.count);
}

function DetallesTab({ planExecution, controlInternoGlobal: cig, orgProfitability, firmUtilization }: {
  planExecution: PlanExecutionItem[];
  controlInternoGlobal: ControlInternoGlobal;
  orgProfitability: OrgProfitability;
  firmUtilization: FirmDashboard;
}) {
  const statusGroups = groupByAuditStatus(planExecution);

  return (
    <>
      {/* ── Rentabilidad Agregada de la Organización ─────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-emerald-600" />
            Rentabilidad Agregada de la Organización
          </h3>
          <p className="text-[11px] text-gray-400 mt-0.5">
            Suma de {orgProfitability.engagementsTotal} encargo(s) — costo cortado a la fecha de cierre del período seleccionado en Resumen
          </p>
        </div>
        <div className="p-5 grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-xl border border-gray-100 p-3">
            <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">Ingreso Total</p>
            <p className="text-lg font-bold text-gray-800 mt-0.5">{money(orgProfitability.totalIncome)}</p>
            <p className="text-[10px] text-gray-400 mt-0.5">{orgProfitability.engagementsWithRevenue} de {orgProfitability.engagementsTotal} con honorario conocido</p>
          </div>
          <div className="rounded-xl border border-gray-100 p-3">
            <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">Costo Total</p>
            <p className="text-lg font-bold text-gray-800 mt-0.5">{money(orgProfitability.totalCost)}</p>
          </div>
          <div className="rounded-xl border border-gray-100 p-3">
            <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">Utilidad Total</p>
            <p className={cn('text-lg font-bold mt-0.5', orgProfitability.totalMargin < 0 ? 'text-red-600' : 'text-gray-800')}>{money(orgProfitability.totalMargin)}</p>
            <p className="text-[10px] text-gray-400 mt-0.5">{orgProfitability.engagementsWithMargin} de {orgProfitability.engagementsTotal} con margen calculable</p>
          </div>
          <div className="rounded-xl border border-gray-100 p-3">
            <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">Margen %</p>
            <p className="text-lg font-bold text-gray-800 mt-0.5">{orgProfitability.totalMarginPct !== null ? `${orgProfitability.totalMarginPct.toFixed(0)}%` : '—'}</p>
          </div>
        </div>
      </div>

      {/* ── Utilización de la Firma y Ranking de Presupuesto ─────────────── */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Users2 className="w-4 h-4 text-blue-500" />
              Utilización de Personal y Presupuesto — Año {firmUtilization.year}
            </h3>
            <p className="text-[11px] text-gray-400 mt-0.5">
              Mismo dato de <Link href="/dashboard/firm-hours" className="underline">Capacidad → Firma</Link>, embebido aquí para el Comité
            </p>
          </div>
          {firmUtilization.utilizacionPromedio !== null && (
            <span className={cn('text-sm font-bold shrink-0', utilizacionTone(firmUtilization.utilizacionPromedio))}>
              {firmUtilization.utilizacionPromedio.toFixed(0)}% promedio
            </span>
          )}
        </div>
        <div className="p-5 grid md:grid-cols-2 gap-5">
          <div>
            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">Utilización por Persona</p>
            {firmUtilization.utilizacionPorPersona.length === 0 ? (
              <p className="text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2">Nadie tiene un perfil de disponibilidad configurado para {firmUtilization.year}.</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-gray-100">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100 text-left">
                      <th className="px-3 py-2 font-semibold text-gray-500">Persona</th>
                      <th className="px-3 py-2 font-semibold text-gray-500 text-right">Reales</th>
                      <th className="px-3 py-2 font-semibold text-gray-500 text-right">Utilización</th>
                    </tr>
                  </thead>
                  <tbody>
                    {firmUtilization.utilizacionPorPersona.map(p => (
                      <tr key={p.userId} className="border-b border-gray-50 last:border-0">
                        <td className="px-3 py-2 font-medium text-gray-700">{p.userName}</td>
                        <td className="px-3 py-2 text-right text-gray-500">{p.horasReales.toFixed(1)}h</td>
                        <td className={cn('px-3 py-2 text-right font-bold', utilizacionTone(p.utilizacionPct))}>
                          {p.utilizacionPct !== null ? `${p.utilizacionPct.toFixed(0)}%` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div>
            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">Encargos por Variación de Presupuesto</p>
            {firmUtilization.rankingEncargos.length === 0 ? (
              <p className="text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2">Ningún encargo abierto tiene horas presupuestadas todavía.</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-gray-100">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100 text-left">
                      <th className="px-3 py-2 font-semibold text-gray-500">Encargo</th>
                      <th className="px-3 py-2 font-semibold text-gray-500 text-right">Reales</th>
                      <th className="px-3 py-2 font-semibold text-gray-500 text-right">Variación</th>
                    </tr>
                  </thead>
                  <tbody>
                    {firmUtilization.rankingEncargos
                      .slice()
                      .sort((a, b) => (b.variacionPct ?? -Infinity) - (a.variacionPct ?? -Infinity))
                      .map(e => (
                        <tr key={e.auditId} className="border-b border-gray-50 last:border-0">
                          <td className="px-3 py-2 max-w-[180px]">
                            <Link href={`/dashboard/audits/${e.auditId}`} className="font-medium text-[#0F2D4A] hover:underline truncate block">
                              {e.auditTitle}
                            </Link>
                          </td>
                          <td className="px-3 py-2 text-right text-gray-500">{e.horasReales.toFixed(1)}h</td>
                          <td className={cn(
                            'px-3 py-2 text-right font-bold',
                            e.variacionPct === null ? 'text-gray-400' : e.variacionPct > 15 ? 'text-red-600' : e.variacionPct > 0 ? 'text-amber-600' : 'text-emerald-600',
                          )}>
                            {e.variacionPct !== null ? `${e.variacionPct > 0 ? '+' : ''}${e.variacionPct.toFixed(0)}%` : '—'}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Detalle Financiero por Auditoría ─────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-emerald-600" />
            Detalle Financiero por Auditoría — {planExecution.length > 0 ? 'período seleccionado en Resumen' : ''}
          </h3>
          <p className="text-[11px] text-gray-400 mt-0.5">
            Horas y costo cortados a la fecha de cierre del período · ingreso/utilidad según honorario de la Propuesta (cuando existe)
          </p>
        </div>
        {planExecution.length === 0 ? (
          <p className="text-sm text-gray-400 py-8 text-center">No hay encargos planificados en el período seleccionado (pestaña Resumen).</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 text-gray-500 text-left">
                  <th className="px-4 py-2.5 font-semibold">Auditoría</th>
                  <th className="px-4 py-2.5 font-semibold">Estado</th>
                  <th className="px-4 py-2.5 font-semibold text-right">Horas Prog.</th>
                  <th className="px-4 py-2.5 font-semibold text-right">Horas Real</th>
                  <th className="px-4 py-2.5 font-semibold text-right">% Cumpl.</th>
                  <th className="px-4 py-2.5 font-semibold text-right">Costo</th>
                  <th className="px-4 py-2.5 font-semibold text-right">Ingreso</th>
                  <th className="px-4 py-2.5 font-semibold text-right">Utilidad</th>
                  <th className="px-4 py-2.5 font-semibold text-right">Margen %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {planExecution.map(item => {
                  const hoursPct = item.hoursPlanned > 0 ? Math.round((item.hoursReal / item.hoursPlanned) * 100) : 0;
                  const f = item.financials;
                  return (
                    <tr key={item.planItemId} className="hover:bg-gray-50">
                      <td className="px-4 py-3 max-w-[220px]"><p className="truncate font-medium text-gray-800">{item.name}</p></td>
                      <td className="px-4 py-3 text-gray-500">{item.auditStatus ? (AUDIT_STATUS_LABEL[item.auditStatus] ?? item.auditStatus) : 'Sin auditoría'}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{Math.round(item.hoursPlanned)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{Math.round(item.hoursReal)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        <span className={hoursPct > 110 ? 'text-red-600 font-semibold' : 'text-gray-600'}>{hoursPct}%</span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-700">
                        {money(f?.cost ?? null)}{f && f.uncostedHours > 0 && <span title={`${f.uncostedHours} h sin tarifa de costo cargada`} className="text-amber-500">*</span>}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-700">{money(f?.revenue ?? null)}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold">
                        <span className={f?.margin !== null && f?.margin !== undefined && f.margin < 0 ? 'text-red-600' : 'text-gray-800'}>
                          {money(f?.margin ?? null)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-500">{f?.marginPct !== null && f?.marginPct !== undefined ? `${f.marginPct.toFixed(0)}%` : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Detalle por Estado de Auditoría ──────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-blue-500" />
            Detalle por Estado de Auditoría
          </h3>
          <p className="text-[11px] text-gray-400 mt-0.5">Mismas auditorías del período, subtotalizadas por estado del ciclo de vida</p>
        </div>
        {statusGroups.length === 0 ? (
          <p className="text-sm text-gray-400 py-8 text-center">Sin datos para el período seleccionado.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 text-gray-500 text-left">
                  <th className="px-4 py-2.5 font-semibold">Estado</th>
                  <th className="px-4 py-2.5 font-semibold text-right"># Auditorías</th>
                  <th className="px-4 py-2.5 font-semibold text-right">Horas Prog.</th>
                  <th className="px-4 py-2.5 font-semibold text-right">Horas Real</th>
                  <th className="px-4 py-2.5 font-semibold text-right">Costo Total</th>
                  <th className="px-4 py-2.5 font-semibold text-right">Ingreso Total</th>
                  <th className="px-4 py-2.5 font-semibold text-right">Utilidad Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {statusGroups.map(g => (
                  <tr key={g.status} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-800">{g.status === 'SIN_AUDITORIA' ? 'Sin auditoría creada' : (AUDIT_STATUS_LABEL[g.status] ?? g.status)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{g.count}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{Math.round(g.hoursPlanned)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{Math.round(g.hoursReal)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-700">{money(g.cost)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-700">
                      {money(g.revenue)}{g.revenueKnown < g.count && <span className="text-[10px] text-amber-500 ml-1" title="Algunas auditorías de este grupo no tienen honorario definido">({g.revenueKnown}/{g.count})</span>}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold text-gray-800">
                      {money(g.margin)}{g.marginKnown < g.count && <span className="text-[10px] text-amber-500 ml-1">({g.marginKnown}/{g.count})</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Control Interno Global — Componentes y Sub-componentes ──────────── */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-violet-500" />
            Control Interno Global — Componentes y Sub-componentes
          </h3>
          <p className="text-[11px] text-gray-400 mt-0.5">
            Confianza promedio (%) entre las {cig.auditsEvaluated} auditorías con PT-COSO evaluado — mismo modelo 25/25/20/15/15 del papel PT-COSO
          </p>
        </div>
        {cig.auditsEvaluated === 0 ? (
          <p className="text-sm text-gray-400 py-8 text-center">Ninguna auditoría tiene todavía una evaluación PT-COSO completada.</p>
        ) : (
          <div className="p-5 space-y-5">
            <div>
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-3">Por Componente (5)</p>
              <div className="space-y-2.5">
                {cig.perComponent.map(c => (
                  <div key={c.sectionKey} className="flex items-center gap-3">
                    <span className="w-40 shrink-0 text-xs text-gray-600 truncate" title={c.label}>{c.label} <span className="text-gray-400">({c.weight}%)</span></span>
                    <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${c.avgConfidencePct === null ? 'bg-gray-200' : c.avgConfidencePct >= 75 ? 'bg-emerald-500' : c.avgConfidencePct >= 50 ? 'bg-amber-400' : c.avgConfidencePct >= 25 ? 'bg-orange-500' : 'bg-red-500'}`}
                        style={{ width: `${c.avgConfidencePct ?? 0}%` }}
                      />
                    </div>
                    <span className="w-24 text-right text-xs font-semibold text-gray-700">
                      {c.avgConfidencePct !== null ? `${c.avgConfidencePct}%` : '—'} <span className="text-gray-400 font-normal">({c.auditsWithData})</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-3">Por Sub-componente (Principio) — más débil primero</p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-400 border-b border-gray-100 text-left">
                      <th className="font-medium py-1.5 pr-2">Principio</th>
                      <th className="font-medium py-1.5 pr-2">Componente</th>
                      <th className="font-medium py-1.5 text-right">Confianza</th>
                      <th className="font-medium py-1.5 text-right pl-2"># Auditorías</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cig.perPrinciple.map(p => (
                      <tr key={p.short} className="border-b border-gray-50 last:border-0">
                        <td className="py-1.5 pr-2 text-gray-700 max-w-[280px] truncate" title={p.label}>{p.label}</td>
                        <td className="py-1.5 pr-2 text-gray-400">{p.componentShort}</td>
                        <td className={`py-1.5 text-right tabular-nums font-semibold ${p.avgConfidencePct >= 75 ? 'text-emerald-600' : p.avgConfidencePct >= 50 ? 'text-amber-600' : p.avgConfidencePct >= 25 ? 'text-orange-600' : 'text-red-600'}`}>
                          {p.avgConfidencePct}%
                        </td>
                        <td className="py-1.5 text-right tabular-nums text-gray-400 pl-2">{p.auditsWithData}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-3">Por Auditoría</p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-400 border-b border-gray-100 text-left">
                      <th className="font-medium py-1.5 pr-2">Auditoría</th>
                      <th className="font-medium py-1.5 pr-2 text-right">Puntaje</th>
                      <th className="font-medium py-1.5 pr-2">Resultado</th>
                      <th className="font-medium py-1.5">Conclusión del Auditor (S6)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cig.byAudit.map(a => {
                      const bandColors = a.band ? COSO_BAND_COLORS[a.band] : null;
                      return (
                        <tr key={a.auditId} className="border-b border-gray-50 last:border-0">
                          <td className="py-1.5 pr-2 text-gray-700 max-w-[220px] truncate">{a.auditTitle}</td>
                          <td className="py-1.5 pr-2 text-right tabular-nums text-gray-600">{a.totalScore?.toFixed(0) ?? '—'}</td>
                          <td className="py-1.5 pr-2">
                            {a.band ? (
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${bandColors?.bg} ${bandColors?.text}`}>{a.band}</span>
                            ) : <span className="text-gray-300">Sin datos</span>}
                          </td>
                          <td className="py-1.5 text-gray-500">{a.conclusionGlobal ? (COSO_CONCLUSION_LABEL[a.conclusionGlobal] ?? a.conclusionGlobal) : '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Restaurado del dashboard anterior (endpoint legado) ─────────────── */}
      <LegacyDetalles />
    </>
  );
}

// Vigente solo dentro de "Detalles" — vista clásica (sin recorte por período),
// restaurada del dashboard original junto a un análisis nuevo (hallazgos por
// estado de ciclo completo) que usa un dato que el backend ya calculaba
// (`allByStatus`) pero ninguna vista llegó a mostrar.
function LegacyDetalles() {
  const { data, isLoading } = useCommitteeDashboardLegacy();

  if (isLoading || !data) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const maxAuditStatus = Math.max(...Object.values(data.auditsByStatus), 1);
  const maxFindingStatus = Math.max(...Object.values(data.allByStatus), 1);

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard
          label="Tasa de Resolución YTD"
          value={`${data.kpis.resolutionRateYtd}%`}
          sub="hallazgos cerrados / total del año en curso"
          icon={Percent}
          colorClass="bg-emerald-500"
        />
        <KpiCard label="Críticos Abiertos" value={data.kpis.criticalOpen} icon={ShieldAlert} colorClass="bg-red-500" />
        <KpiCard label="Materiales Abiertos" value={data.kpis.materialOpen} icon={BarChart3} colorClass="bg-purple-500" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-blue-500" />
            Portfolio de Auditorías por Estado
          </h3>
          {Object.keys(data.auditsByStatus).length === 0 ? (
            <p className="text-xs text-gray-400 py-4 text-center">Sin auditorías registradas</p>
          ) : (
            <div className="space-y-3">
              {Object.entries(data.auditsByStatus).map(([status, count]) => (
                <HorizBar key={status} label={AUDIT_STATUS_LABEL[status] ?? status} value={count} max={maxAuditStatus} color="bg-blue-500" />
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
            <PieChart className="w-4 h-4 text-indigo-500" />
            Hallazgos por Estado (ciclo completo)
          </h3>
          <p className="text-[11px] text-gray-400 -mt-2.5 mb-4">Todos los hallazgos, no solo los abiertos por severidad</p>
          {Object.keys(data.allByStatus).length === 0 ? (
            <p className="text-xs text-gray-400 py-4 text-center">Sin hallazgos registrados</p>
          ) : (
            <div className="space-y-3">
              {Object.entries(data.allByStatus).map(([status, count]) => (
                <HorizBar key={status} label={FINDING_STATUS_LABEL[status] ?? status} value={count} max={maxFindingStatus} color="bg-indigo-500" />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
