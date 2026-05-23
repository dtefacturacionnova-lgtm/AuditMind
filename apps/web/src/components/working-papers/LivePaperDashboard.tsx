'use client';

import { useLiveStats } from '@/hooks/useWorkingPaperGraph';
import { Loader2, FileText, AlertTriangle, Clock, CheckCircle2, Users, TrendingUp, Zap, RefreshCw } from 'lucide-react';

// ─── KPI card ─────────────────────────────────────────────────────────────────

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  color = 'text-gray-700',
  bg   = 'bg-gray-50',
}: {
  icon:   React.ElementType;
  label:  string;
  value:  string | number;
  sub?:   string;
  color?: string;
  bg?:    string;
}) {
  return (
    <div className={`rounded-2xl border border-gray-200 ${bg} p-4 flex items-start gap-3`}>
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${bg}`}>
        <Icon className={`w-5 h-5 ${color}`} />
      </div>
      <div>
        <p className="text-[10px] text-gray-500 uppercase tracking-wide font-medium">{label}</p>
        <p className={`text-2xl font-bold ${color}`}>{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Progress bar ─────────────────────────────────────────────────────────────

function ProgressBar({ value, color = 'bg-blue-500', label }: { value: number; color?: string; label?: string }) {
  const pct = Math.min(Math.max(value, 0), 100);
  return (
    <div>
      {label && <div className="flex justify-between text-xs text-gray-500 mb-1"><span>{label}</span><span>{pct}%</span></div>}
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full ${color} rounded-full transition-all duration-700`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ─── Severity dot ─────────────────────────────────────────────────────────────

const SEVERITY_COLOR: Record<string, string> = {
  critical:    'bg-red-500',
  high:        'bg-orange-400',
  medium:      'bg-amber-400',
  low:         'bg-yellow-300',
  informational: 'bg-gray-300',
};

// ─── LivePaperDashboard ───────────────────────────────────────────────────────

interface LivePaperDashboardProps { paperId: string }

export function LivePaperDashboard({ paperId }: LivePaperDashboardProps) {
  const { data: stats, isLoading, isError, refetch, isFetching } = useLiveStats(paperId);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center py-16 gap-4 bg-white rounded-2xl border border-emerald-200">
        <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
        <p className="text-sm text-emerald-600">Cargando métricas de la auditoría…</p>
      </div>
    );
  }

  if (isError || !stats) {
    return (
      <div className="flex flex-col items-center py-16 gap-3 bg-white rounded-2xl border border-gray-200">
        <AlertTriangle className="w-8 h-8 text-gray-300" />
        <p className="text-sm text-gray-400">No se pudieron cargar las métricas</p>
        <button onClick={() => refetch()} className="text-xs text-blue-600 hover:underline">Reintentar</button>
      </div>
    );
  }

  const { papers, findings, budget, team, intelligentPapers, recentActivity } = stats;

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-emerald-100 flex items-center justify-center">
            <Zap className="w-4 h-4 text-emerald-600 animate-pulse" />
          </div>
          <div>
            <p className="text-sm font-bold text-gray-900">{stats.auditTitle}</p>
            <p className="text-xs text-gray-400">Panel en tiempo real · Actualiza cada 30 s</p>
          </div>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="p-2 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors"
          title="Actualizar"
        >
          <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          icon={FileText} label="Papeles aprobados"
          value={papers.approved} sub={`de ${papers.total} total`}
          color="text-blue-700" bg="bg-blue-50"
        />
        <KpiCard
          icon={AlertTriangle} label="Hallazgos abiertos"
          value={findings.open} sub={`${findings.closureRate}% cerrados`}
          color={findings.critical > 0 ? 'text-red-700' : 'text-amber-700'}
          bg={findings.critical > 0 ? 'bg-red-50' : 'bg-amber-50'}
        />
        <KpiCard
          icon={Clock} label="Horas utilizadas"
          value={`${budget.actualHours}h`} sub={`de ${budget.estimatedHours}h estimadas`}
          color={budget.onTrack ? 'text-emerald-700' : 'text-red-700'}
          bg={budget.onTrack ? 'bg-emerald-50' : 'bg-red-50'}
        />
        <KpiCard
          icon={Users} label="Equipo"
          value={team.total} sub="miembros asignados"
          color="text-violet-700" bg="bg-violet-50"
        />
      </div>

      {/* Progress section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Paper coverage */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Cobertura de papeles</p>
          <ProgressBar value={papers.coveragePercent} color="bg-blue-500" label="Revisados / Aprobados" />
          <div className="grid grid-cols-2 gap-3 text-xs">
            {[
              { label: 'Borrador',     count: papers.draft,    color: 'text-gray-500' },
              { label: 'En revisión',  count: papers.inReview, color: 'text-amber-600' },
              { label: 'Aprobados',    count: papers.approved, color: 'text-emerald-600' },
              { label: 'Archivados',   count: papers.archived, color: 'text-gray-400' },
            ].map(({ label, count, color }) => (
              <div key={label} className="flex justify-between">
                <span className="text-gray-500">{label}</span>
                <span className={`font-semibold ${color}`}>{count}</span>
              </div>
            ))}
          </div>

          {/* By section */}
          {Object.keys(papers.bySection).length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] text-gray-400 uppercase font-medium">Por sección</p>
              {Object.entries(papers.bySection).sort(([a], [b]) => a.localeCompare(b)).map(([sec, data]) => (
                <div key={sec} className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold text-gray-600 w-8">{sec}</span>
                  <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-400 rounded-full"
                      style={{ width: data.total > 0 ? `${Math.round((data.approved / data.total) * 100)}%` : '0%' }}
                    />
                  </div>
                  <span className="text-[10px] text-gray-400">{data.approved}/{data.total}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Findings + Budget */}
        <div className="space-y-3">
          {/* Findings by severity */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Hallazgos por severidad</p>
            {[
              { key: 'critical', label: 'Crítico',  count: findings.critical },
              { key: 'high',     label: 'Alto',     count: findings.high },
              { key: 'medium',   label: 'Medio',    count: findings.medium },
              { key: 'low',      label: 'Bajo',     count: findings.low },
              { key: 'informational', label: 'Info', count: findings.informational },
            ].filter(s => s.count > 0).map(({ key, label, count }) => (
              <div key={key} className="flex items-center gap-2 text-xs">
                <div className={`w-2.5 h-2.5 rounded-full ${SEVERITY_COLOR[key]}`} />
                <span className="text-gray-600 flex-1">{label}</span>
                <span className="font-semibold text-gray-800">{count}</span>
                <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${SEVERITY_COLOR[key]}`}
                    style={{ width: findings.total > 0 ? `${Math.round((count / findings.total) * 100)}%` : '0%' }}
                  />
                </div>
              </div>
            ))}
            {findings.total === 0 && (
              <p className="text-xs text-gray-400">Sin hallazgos registrados aún.</p>
            )}
          </div>

          {/* Budget */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Presupuesto de horas</p>
            <ProgressBar
              value={budget.usagePercent}
              color={budget.onTrack ? 'bg-emerald-500' : 'bg-red-500'}
            />
            <div className="flex justify-between text-xs text-gray-500">
              <span>{budget.actualHours}h utilizadas</span>
              <span>{budget.estimatedHours}h estimadas</span>
            </div>
            {!budget.onTrack && (
              <p className="text-[10px] text-red-600 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                Presupuesto al {budget.usagePercent}% — revisar con el equipo
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Intelligent Papers KPIs */}
      {(intelligentPapers.smart > 0 || intelligentPapers.master > 0) && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Papeles inteligentes</p>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs text-center">
            {[
              { label: 'SMART',        value: intelligentPapers.smart,      color: 'text-blue-600' },
              { label: 'MASTER',       value: intelligentPapers.master,     color: 'text-purple-600' },
              { label: 'Al día',       value: intelligentPapers.synced,     color: 'text-emerald-600' },
              { label: 'Desact.',      value: intelligentPapers.stale,      color: 'text-amber-600' },
              { label: 'Calidad avg',  value: `${intelligentPapers.avgQuality}%`, color: intelligentPapers.avgQuality >= 75 ? 'text-emerald-600' : 'text-amber-600' },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-gray-50 rounded-xl p-2">
                <p className={`text-base font-bold ${color}`}>{value}</p>
                <p className="text-[10px] text-gray-400">{label}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Team */}
      {team.members.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Equipo de auditoría</p>
          <div className="flex flex-wrap gap-2">
            {team.members.map((m, i) => (
              <div key={i} className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-1.5">
                <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-[10px] font-bold text-blue-700">
                  {m.name.charAt(0).toUpperCase()}
                </div>
                <span className="text-xs text-gray-700 font-medium">{m.name}</span>
                <span className="text-[10px] text-gray-400">{m.role}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent activity */}
      {recentActivity.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Actividad reciente</p>
          <div className="space-y-2">
            {recentActivity.map((a, i) => (
              <div key={i} className="flex items-start gap-2.5 text-xs">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5 shrink-0" />
                <p className="text-gray-600 flex-1">{a.description}</p>
                <span className="text-gray-400 shrink-0">
                  {new Date(a.date).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit' })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Timestamps */}
      <p className="text-[10px] text-gray-300 text-right">
        <CheckCircle2 className="w-3 h-3 inline mr-1 text-emerald-300" />
        Actualizado: {new Date(stats.updatedAt).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
      </p>
    </div>
  );
}
