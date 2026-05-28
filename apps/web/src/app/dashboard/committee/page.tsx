'use client';

import {
  AlertTriangle, CheckCircle2, Clock, TrendingUp,
  ShieldAlert, BarChart3, CalendarDays, Users2,
} from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { useCommitteeDashboard } from '@/hooks/useDashboard';
import { formatDate } from '@/lib/utils';

// ─── Risk Posture config ──────────────────────────────────────────────────────
const POSTURE_CONFIG = {
  CRITICAL: { label: 'Crítico',         bg: 'bg-red-600',    text: 'text-white',       border: 'border-red-700'    },
  HIGH:     { label: 'Alto',            bg: 'bg-orange-500', text: 'text-white',       border: 'border-orange-600' },
  MEDIUM:   { label: 'Moderado',        bg: 'bg-amber-400',  text: 'text-amber-900',   border: 'border-amber-500'  },
  LOW:      { label: 'Bajo',            bg: 'bg-blue-500',   text: 'text-white',       border: 'border-blue-600'   },
  NONE:     { label: 'Sin riesgo abierto', bg: 'bg-emerald-500', text: 'text-white',   border: 'border-emerald-600'},
} as const;

const SEVERITY_COLOR: Record<string, string> = {
  CRITICAL: 'bg-red-500',
  HIGH:     'bg-orange-400',
  MEDIUM:   'bg-amber-400',
  LOW:      'bg-blue-400',
  INFO:     'bg-gray-400',
};

const SEVERITY_LABEL: Record<string, string> = {
  CRITICAL: 'Crítico', HIGH: 'Alto', MEDIUM: 'Medio', LOW: 'Bajo', INFO: 'Informativo',
};

const AUDIT_STATUS_LABEL: Record<string, string> = {
  PLANNING: 'Planificación', IN_PROGRESS: 'En Progreso',
  REVIEW: 'En Revisión', CLOSED: 'Cerrada', CANCELLED: 'Cancelada',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
function daysOverdue(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  return Math.max(0, Math.floor(diff / 86_400_000));
}

// ─── Sub-components ───────────────────────────────────────────────────────────
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
  const { data, isLoading } = useCommitteeDashboard();

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <Header title="Comité de Auditoría" />
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (!data) return null;

  const posture = POSTURE_CONFIG[data.riskPosture] ?? POSTURE_CONFIG.NONE;
  const maxSev  = Math.max(...Object.values(data.openBySeverity), 1);
  const maxAud  = Math.max(...Object.values(data.auditsByStatus), 1);

  return (
    <div className="flex flex-col h-full">
      <Header title="Comité de Auditoría" />

      <div className="flex-1 overflow-auto p-6 space-y-6">

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
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
          <KpiCard
            label="Hallazgos Abiertos"
            value={data.kpis.openFindings}
            icon={AlertTriangle}
            colorClass="bg-orange-500"
          />
          <KpiCard
            label="Críticos Abiertos"
            value={data.kpis.criticalOpen}
            icon={ShieldAlert}
            colorClass="bg-red-500"
          />
          <KpiCard
            label="Materiales Abiertos"
            value={data.kpis.materialOpen}
            icon={BarChart3}
            colorClass="bg-purple-500"
          />
          <KpiCard
            label="Acciones Vencidas"
            value={data.kpis.overdueActionsCount}
            icon={Clock}
            colorClass="bg-amber-500"
          />
          <KpiCard
            label="Tasa Resolución YTD"
            value={`${data.kpis.resolutionRateYtd}%`}
            sub="hallazgos cerrados / total año"
            icon={TrendingUp}
            colorClass="bg-emerald-500"
          />
        </div>

        {/* ── Row: severity chart + audit portfolio ───────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* Hallazgos por severidad */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-orange-500" />
              Hallazgos Abiertos por Severidad
            </h3>
            {Object.keys(data.openBySeverity).length === 0 ? (
              <p className="text-xs text-gray-400 py-4 text-center">Sin hallazgos abiertos</p>
            ) : (
              <div className="space-y-3">
                {['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'].map(sev => {
                  const count = data.openBySeverity[sev];
                  if (!count) return null;
                  return (
                    <HorizBar
                      key={sev}
                      label={SEVERITY_LABEL[sev] ?? sev}
                      value={count}
                      max={maxSev}
                      color={SEVERITY_COLOR[sev] ?? 'bg-gray-400'}
                    />
                  );
                })}
              </div>
            )}
          </div>

          {/* Portfolio de auditorías */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-blue-500" />
              Portfolio de Auditorías
            </h3>
            {Object.keys(data.auditsByStatus).length === 0 ? (
              <p className="text-xs text-gray-400 py-4 text-center">Sin auditorías registradas</p>
            ) : (
              <div className="space-y-3">
                {Object.entries(data.auditsByStatus).map(([status, count]) => (
                  <HorizBar
                    key={status}
                    label={AUDIT_STATUS_LABEL[status] ?? status}
                    value={count}
                    max={maxAud}
                    color="bg-blue-500"
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Plan anual activo ────────────────────────────────────────────── */}
        {data.planSummary ? (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              Plan Anual Activo — {data.planSummary.name} ({data.planSummary.year})
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              {/* Completion */}
              <div>
                <div className="flex items-end justify-between mb-1.5">
                  <p className="text-xs text-gray-500">Avance del plan</p>
                  <p className="text-sm font-bold text-gray-800">{data.planSummary.completionPct}%</p>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2.5">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all"
                    style={{ width: `${data.planSummary.completionPct}%` }}
                  />
                </div>
                <p className="text-[11px] text-gray-400 mt-1">
                  {data.planSummary.completedItems} / {data.planSummary.totalItems} auditorías cerradas
                </p>
              </div>

              {/* Hours utilization */}
              <div>
                <div className="flex items-end justify-between mb-1.5">
                  <p className="text-xs text-gray-500">Utilización de horas</p>
                  <p className="text-sm font-bold text-gray-800">{data.planSummary.utilizationPct}%</p>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2.5">
                  <div
                    className={`h-full rounded-full transition-all ${
                      data.planSummary.utilizationPct > 100 ? 'bg-red-500' : 'bg-blue-500'
                    }`}
                    style={{ width: `${Math.min(data.planSummary.utilizationPct, 100)}%` }}
                  />
                </div>
                <p className="text-[11px] text-gray-400 mt-1">
                  {data.planSummary.allocatedHours} / {data.planSummary.totalHours} h asignadas
                </p>
              </div>

              {/* Status badge */}
              <div className="flex flex-col justify-center">
                <p className="text-xs text-gray-500 mb-1">Estado</p>
                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 self-start">
                  {data.planSummary.status}
                </span>
              </div>

              {/* Total items */}
              <div className="flex flex-col justify-center">
                <p className="text-xs text-gray-500 mb-1">Total proyectos</p>
                <p className="text-2xl font-extrabold text-gray-800">{data.planSummary.totalItems}</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 flex items-center gap-3 text-gray-400">
            <CalendarDays className="w-5 h-5 opacity-40" />
            <p className="text-sm">Sin plan anual activo o aprobado</p>
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
                              <div
                                className="h-full rounded-full bg-amber-400"
                                style={{ width: `${action.progressPct}%` }}
                              />
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
                      <td className="px-4 py-3 max-w-[180px]">
                        <p className="truncate font-medium text-gray-800">{f.title}</p>
                      </td>
                      <td className="px-4 py-3 max-w-[160px]">
                        <p className="truncate text-gray-600">{f.audit.title}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block w-2 h-2 rounded-full mr-1.5 ${SEVERITY_COLOR[f.severity] ?? 'bg-gray-400'}`} />
                        {SEVERITY_LABEL[f.severity] ?? f.severity}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-50 text-red-700">
                          {f.escalationLevel?.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500">
                        {f.responsible?.name ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-500">
                        {f.dueDate ? formatDate(f.dueDate) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Empty state when no overdue or escalated items */}
        {data.overdueActions.length === 0 && data.escalatedFindings.length === 0 && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 flex items-center gap-4">
            <CheckCircle2 className="w-8 h-8 text-emerald-500 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-emerald-800">Sin alertas activas</p>
              <p className="text-xs text-emerald-600 mt-0.5">
                No hay acciones vencidas ni hallazgos escalados al Comité en este momento.
              </p>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
