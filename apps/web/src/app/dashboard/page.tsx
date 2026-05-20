'use client';
import {
  ClipboardList, AlertTriangle, Upload,
  CheckCircle2, TrendingUp, Bot, Calendar, ArrowRight,
  Users, ShieldAlert, Clock, BarChart3, FileCheck,
  Hourglass, Target,
} from 'lucide-react';
import Link from 'next/link';
import { Header } from '@/components/layout/Header';
import {
  useDashboardKpis, useDashboardTimeline,
  useRecentFindings, useUpcomingDeadlines,
  useManagerDashboard, useMyWorkload,
} from '@/hooks/useDashboard';
import { useUser } from '@/hooks/useUser';
import { formatDate, formatRelativeTime } from '@/lib/utils';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const SEVERITY_COLORS: Record<string, string> = {
  CRITICAL: 'text-red-600 bg-red-50',
  HIGH:     'text-orange-600 bg-orange-50',
  MEDIUM:   'text-yellow-600 bg-yellow-50',
  LOW:      'text-blue-600 bg-blue-50',
  INFORMATIONAL: 'text-gray-600 bg-gray-50',
};

const STATUS_COLORS: Record<string, string> = {
  PLANNING:    'bg-blue-100 text-blue-700',
  IN_PROGRESS: 'bg-indigo-100 text-indigo-700',
  REVIEW:      'bg-amber-100 text-amber-700',
  CLOSED:      'bg-emerald-100 text-emerald-700',
};

const STATUS_LABELS: Record<string, string> = {
  PLANNING: 'Planificada', IN_PROGRESS: 'En Progreso',
  REVIEW: 'En Revisión', CLOSED: 'Cerrada',
};

function KpiCard({
  title, value, subtitle, icon: Icon, variant = 'default', loading = false,
}: {
  title: string; value: string | number; subtitle?: string;
  icon: React.ElementType; variant?: 'default' | 'danger' | 'warning' | 'success' | 'info';
  loading?: boolean;
}) {
  const variantStyles = {
    default: 'border-slate-200 bg-white',
    danger:  'border-red-200 bg-red-50',
    warning: 'border-amber-200 bg-amber-50',
    success: 'border-emerald-200 bg-emerald-50',
    info:    'border-blue-200 bg-blue-50',
  };
  const iconStyles = {
    default: 'bg-slate-100 text-slate-500',
    danger:  'bg-red-100 text-red-600',
    warning: 'bg-amber-100 text-amber-600',
    success: 'bg-emerald-100 text-emerald-600',
    info:    'bg-blue-100 text-blue-600',
  };
  return (
    <div className={`rounded-xl border p-5 shadow-sm ${variantStyles[variant]}`}>
      <div className="flex items-start justify-between">
        <p className="text-sm font-medium text-gray-500">{title}</p>
        <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${iconStyles[variant]}`}>
          <Icon className="h-4.5 w-4.5" />
        </span>
      </div>
      {loading ? (
        <div className="mt-3 h-8 w-20 animate-pulse rounded bg-gray-200" />
      ) : (
        <p className="mt-2 text-3xl font-bold tracking-tight text-gray-900">{value}</p>
      )}
      {subtitle && <p className="mt-1 text-xs text-gray-500">{subtitle}</p>}
    </div>
  );
}

// ─── Panel CAE / Manager ──────────────────────────────────────────────────────
function ManagerPanel() {
  const { data, isLoading } = useManagerDashboard();
  const k = data?.kpis;

  if (isLoading) return (
    <div className="space-y-4">
      {[1, 2, 3].map(i => <div key={i} className="h-32 animate-pulse rounded-xl bg-gray-100" />)}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* KPIs gerenciales */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <KpiCard title="Cerradas este año"  value={k?.auditsClosedThisYear ?? 0} icon={FileCheck} variant="success" />
        <KpiCard title="Resolución hallazgos" value={`${k?.findingResolutionRate ?? 0}%`} icon={Target} variant="info"
          subtitle={`${k?.findingsClosedThisYear ?? 0} / ${k?.findingsThisYear ?? 0}`} />
        <KpiCard title="Pendientes aprobación" value={k?.pendingApprovalCount ?? 0} icon={CheckCircle2}
          variant={k?.pendingApprovalCount ? 'warning' : 'default'} />
        <KpiCard title="Hallazgos escalados" value={k?.escalatedCount ?? 0} icon={ShieldAlert}
          variant={k?.escalatedCount ? 'danger' : 'default'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Carga del equipo */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <Users className="h-4 w-4 text-gray-400" />
            <h3 className="text-sm font-semibold text-gray-700">Carga del equipo</h3>
          </div>
          {!data?.teamWorkload?.length ? (
            <p className="text-sm text-gray-400 text-center py-6">Sin asignaciones activas</p>
          ) : (
            <div className="space-y-2">
              {data.teamWorkload.slice(0, 6).map((m: any) => (
                <div key={m.id} className="flex items-center gap-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#0F2D4A] text-[10px] font-bold text-white">
                    {m.name?.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-800 truncate">{m.name}</p>
                    <p className="text-[10px] text-gray-400">{m.role?.replace('_', ' ')}</p>
                  </div>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                    m.activeAudits >= 3 ? 'bg-red-50 text-red-600' :
                    m.activeAudits >= 2 ? 'bg-amber-50 text-amber-600' :
                    'bg-emerald-50 text-emerald-600'
                  }`}>
                    {m.activeAudits} aud.
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Hallazgos pendientes de aprobación */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-gray-400" />
              <h3 className="text-sm font-semibold text-gray-700">Por aprobar</h3>
            </div>
            <Link href="/dashboard/findings?status=IN_REVIEW" className="text-xs text-blue-600 hover:text-blue-800">
              Ver todos
            </Link>
          </div>
          {!data?.pendingApproval?.length ? (
            <p className="text-sm text-gray-400 text-center py-6">Sin pendientes</p>
          ) : (
            <div className="space-y-2">
              {data.pendingApproval.slice(0, 5).map((f: any) => (
                <Link key={f.id} href={`/dashboard/findings/${f.id}`}
                  className="flex items-center gap-2 rounded-lg border border-gray-100 px-3 py-2 hover:bg-blue-50 transition-colors">
                  <span className={`shrink-0 inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${SEVERITY_COLORS[f.severity] ?? 'text-gray-600 bg-gray-50'}`}>
                    {f.severity}
                  </span>
                  <p className="flex-1 min-w-0 truncate text-xs font-medium text-gray-800">{f.title}</p>
                  <span className="shrink-0 text-[10px] text-gray-400">{f.qualityScore}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Escalados */}
      {(data?.escalated?.length ?? 0) > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-red-500" />
            <h3 className="text-sm font-semibold text-red-700">Hallazgos escalados</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {data.escalated.map((f: any) => (
              <Link key={f.id} href={`/dashboard/findings/${f.id}`}
                className="flex items-start gap-2 rounded-lg bg-white border border-red-100 px-3 py-2 hover:border-red-300 transition-colors">
                <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-red-500 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-gray-800">{f.title}</p>
                  <p className="text-[10px] text-gray-500">{f.audit?.title} · escalado a {f.escalatedTo}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Panel Auditor ─────────────────────────────────────────────────────────────
function AuditorPanel() {
  const { data, isLoading } = useMyWorkload();
  const k = data?.kpis;

  if (isLoading) return (
    <div className="space-y-4">
      {[1, 2].map(i => <div key={i} className="h-32 animate-pulse rounded-xl bg-gray-100" />)}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* KPIs personales */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <KpiCard title="Mis auditorías"      value={k?.activeAudits ?? 0}    icon={ClipboardList} variant="info" />
        <KpiCard title="Hallazgos asignados" value={k?.openFindings ?? 0}    icon={AlertTriangle}
          variant={k?.overdueFindings ? 'danger' : 'warning'}
          subtitle={k?.overdueFindings ? `${k.overdueFindings} vencidos` : undefined} />
        <KpiCard title="Papeles pendientes"  value={k?.pendingPapers ?? 0}  icon={FileCheck} variant="default" />
        <KpiCard title="PBC pendientes"      value={k?.pendingPbc ?? 0}     icon={Upload}
          variant={k?.pendingPbc ? 'warning' : 'default'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Mis auditorías */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-gray-400" />
              <h3 className="text-sm font-semibold text-gray-700">Mis auditorías</h3>
            </div>
            <Link href="/dashboard/audits" className="text-xs text-blue-600 hover:text-blue-800">Ver todas</Link>
          </div>
          {!data?.myAudits?.length ? (
            <p className="text-sm text-gray-400 text-center py-6">Sin auditorías asignadas</p>
          ) : (
            <div className="space-y-2">
              {data.myAudits.slice(0, 5).map((a: any) => (
                <Link key={a.id} href={`/dashboard/audits/${a.id}`}
                  className="flex items-start gap-2 rounded-lg border border-gray-100 px-3 py-2 hover:bg-blue-50 transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-xs font-medium text-gray-800">{a.title}</p>
                    <p className="text-[10px] text-gray-400">{a.auditEntity?.name} · {a.myRole}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${STATUS_COLORS[a.status] ?? 'bg-gray-100 text-gray-600'}`}>
                      {STATUS_LABELS[a.status] ?? a.status}
                    </span>
                    {a.endDate && (
                      <p className="text-[10px] text-gray-400 mt-0.5">{formatDate(a.endDate)}</p>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Mis hallazgos asignados */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-gray-400" />
              <h3 className="text-sm font-semibold text-gray-700">Mis hallazgos</h3>
            </div>
            <Link href="/dashboard/findings" className="text-xs text-blue-600 hover:text-blue-800">Ver todos</Link>
          </div>
          {!data?.myFindings?.length ? (
            <p className="text-sm text-gray-400 text-center py-6">Sin hallazgos asignados</p>
          ) : (
            <div className="space-y-2">
              {data.myFindings.slice(0, 6).map((f: any) => {
                const isOverdue = f.dueDate && new Date(f.dueDate) < new Date();
                return (
                  <Link key={f.id} href={`/dashboard/findings/${f.id}`}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2 hover:bg-blue-50 transition-colors ${isOverdue ? 'border-red-200 bg-red-50/50' : 'border-gray-100'}`}>
                    <span className={`shrink-0 inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${SEVERITY_COLORS[f.severity] ?? 'text-gray-600 bg-gray-50'}`}>
                      {f.severity}
                    </span>
                    <p className="flex-1 min-w-0 truncate text-xs font-medium text-gray-800">{f.title}</p>
                    {f.dueDate && (
                      <span className={`shrink-0 text-[10px] ${isOverdue ? 'text-red-600 font-semibold' : 'text-gray-400'}`}>
                        {formatDate(f.dueDate)}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Horas */}
      {(k?.hoursPlanned ?? 0) > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <Hourglass className="h-4 w-4 text-gray-400" />
            <h3 className="text-sm font-semibold text-gray-700">Horas acumuladas</h3>
          </div>
          <div className="flex items-center gap-4">
            <div>
              <p className="text-2xl font-bold text-gray-900">{k.hoursActual.toLocaleString('es-CL')}</p>
              <p className="text-xs text-gray-500">horas consumidas</p>
            </div>
            <div className="text-gray-300 text-xl">/</div>
            <div>
              <p className="text-2xl font-bold text-gray-400">{k.hoursPlanned.toLocaleString('es-CL')}</p>
              <p className="text-xs text-gray-400">planificadas</p>
            </div>
            <div className={`ml-auto text-lg font-bold ${Math.abs(k.hoursVariancePct) > 20 ? 'text-red-600' : 'text-emerald-600'}`}>
              {k.hoursVariancePct > 0 ? '+' : ''}{k.hoursVariancePct}%
            </div>
          </div>
          <div className="mt-3 h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${k.hoursVariancePct > 20 ? 'bg-red-500' : 'bg-emerald-500'}`}
              style={{ width: `${Math.min((k.hoursActual / k.hoursPlanned) * 100, 100)}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { user } = useUser();
  const { data: kpis, isLoading: kpisLoading } = useDashboardKpis();
  const { data: timeline, isLoading: timelineLoading } = useDashboardTimeline();
  const { data: findings, isLoading: findingsLoading } = useRecentFindings();
  const { data: deadlines } = useUpcomingDeadlines();

  const greetingHour = new Date().getHours();
  const greeting = greetingHour < 12 ? 'Buenos días' : greetingHour < 18 ? 'Buenas tardes' : 'Buenas noches';

  const isManager = user?.role === 'CAE' || user?.role === 'AUDIT_MANAGER';
  const isAuditor = user?.role === 'AUDITOR' || user?.role === 'SENIOR_AUDITOR';

  return (
    <div className="min-h-full">
      <Header title="Dashboard" />

      <div className="p-6 space-y-6">
        {/* Welcome */}
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-800">
              {greeting}, {user?.name?.split(' ')[0] ?? 'Auditor'} 👋
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {new Intl.DateTimeFormat('es-CL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }).format(new Date())}
            </p>
          </div>
          <Link
            href="/dashboard/ai"
            className="flex items-center gap-2 rounded-xl bg-[#0F2D4A] px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-[#1a4a7a] transition-colors"
          >
            <Bot className="h-4 w-4" />
            Consultar a Minerva IA
          </Link>
        </div>

        {/* KPI Grid — universal */}
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          <KpiCard
            title="Auditorías en Progreso"
            value={kpis?.auditsInProgress ?? 0}
            icon={ClipboardList}
            variant="info"
            loading={kpisLoading}
          />
          <KpiCard
            title="Hallazgos Abiertos"
            value={kpis?.openFindings ?? 0}
            subtitle={kpis?.criticalFindings ? `${kpis.criticalFindings} críticos` : undefined}
            icon={AlertTriangle}
            variant={kpis?.criticalFindings ? 'danger' : 'warning'}
            loading={kpisLoading}
          />
          <KpiCard
            title="PBC Vencidas"
            value={kpis?.overduePbcRequests ?? 0}
            icon={Upload}
            variant={kpis?.overduePbcRequests ? 'danger' : 'default'}
            loading={kpisLoading}
          />
          <KpiCard
            title="Cumplimiento del Plan"
            value={kpis ? `${kpis.planComplianceRate}%` : '—'}
            subtitle={`${kpis?.auditsCompleted ?? 0} completadas`}
            icon={TrendingUp}
            variant="success"
            loading={kpisLoading}
          />
        </div>

        {/* Panel por rol */}
        {isManager && (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 className="h-4 w-4 text-[#0F2D4A]" />
              <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Vista gerencial</h2>
            </div>
            <ManagerPanel />
          </div>
        )}

        {isAuditor && (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Target className="h-4 w-4 text-[#0F2D4A]" />
              <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Mi trabajo</h2>
            </div>
            <AuditorPanel />
          </div>
        )}

        {/* Sección universal: timeline + deadlines + findings */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* AI Stats */}
          <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-[#0F2D4A] to-[#1a4a7a] p-5 text-white shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <Bot className="h-5 w-5 text-blue-300" />
              <span className="text-sm font-medium text-blue-100">Motor IA — Este mes</span>
            </div>
            <p className="text-4xl font-bold">{kpis?.aiInteractionsThisMonth ?? 0}</p>
            <p className="text-sm text-blue-200 mt-1">interacciones con agentes</p>
            <div className="mt-4 flex gap-2 text-xs text-blue-300">
              <span className="rounded-full bg-blue-800/50 px-2 py-0.5">Minerva</span>
              <span className="rounded-full bg-blue-800/50 px-2 py-0.5">Scriptorium</span>
              <span className="rounded-full bg-blue-800/50 px-2 py-0.5">+12 agentes</span>
            </div>
          </div>

          {/* Upcoming deadlines */}
          <div className="lg:col-span-2 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-700">Vencimientos Próximos (14 días)</h3>
              <Calendar className="h-4 w-4 text-gray-400" />
            </div>
            <div className="space-y-2">
              {deadlines?.pbcDue?.slice(0, 3).map((item: any) => (
                <div key={item.id} className="flex items-center gap-3 rounded-lg bg-amber-50 px-3 py-2">
                  <Upload className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-xs font-medium text-gray-800">{item.title}</p>
                  </div>
                  <span className="shrink-0 text-[11px] font-medium text-amber-600">
                    {formatDate(item.dueDate)}
                  </span>
                </div>
              ))}
              {deadlines?.auditsEnding?.slice(0, 2).map((item: any) => (
                <div key={item.id} className="flex items-center gap-3 rounded-lg bg-orange-50 px-3 py-2">
                  <ClipboardList className="h-3.5 w-3.5 shrink-0 text-orange-500" />
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-xs font-medium text-gray-800">{item.title}</p>
                  </div>
                  <span className="shrink-0 text-[11px] font-medium text-orange-600">
                    {formatDate(item.endDate)}
                  </span>
                </div>
              ))}
              {(!deadlines?.pbcDue?.length && !deadlines?.auditsEnding?.length) && (
                <p className="text-sm text-gray-400 text-center py-4">Sin vencimientos próximos</p>
              )}
            </div>
          </div>
        </div>

        {/* Bottom: Timeline + Recent Findings */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Active Audits Timeline */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-700">Auditorías Activas</h3>
              <Link href="/dashboard/audits" className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800">
                Ver todas <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            {timelineLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => <div key={i} className="h-16 animate-pulse rounded-lg bg-gray-100" />)}
              </div>
            ) : !timeline?.length ? (
              <p className="py-8 text-center text-sm text-gray-400">No hay auditorías activas</p>
            ) : (
              <div className="space-y-3">
                {timeline.slice(0, 5).map((audit: any) => (
                  <Link key={audit.id} href={`/dashboard/audits/${audit.id}`}
                    className="flex items-start gap-3 rounded-lg border border-gray-100 px-3 py-2.5 hover:border-blue-200 hover:bg-blue-50/50 transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="mt-0.5 text-xs font-medium text-gray-800 truncate">{audit.title}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">{audit.auditEntity?.name}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_COLORS[audit.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {STATUS_LABELS[audit.status] ?? audit.status}
                      </span>
                      <p className="mt-1 text-[10px] text-gray-400">hasta {formatDate(audit.endDate)}</p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Recent Findings */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-700">Hallazgos Recientes</h3>
              <Link href="/dashboard/findings" className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800">
                Ver todos <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            {findingsLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => <div key={i} className="h-14 animate-pulse rounded-lg bg-gray-100" />)}
              </div>
            ) : !findings?.length ? (
              <p className="py-8 text-center text-sm text-gray-400">Sin hallazgos abiertos</p>
            ) : (
              <div className="space-y-2">
                {findings.slice(0, 6).map((finding: any) => (
                  <Link key={finding.id} href={`/dashboard/findings/${finding.id}`}
                    className="flex items-center gap-3 rounded-lg border border-gray-100 px-3 py-2 hover:border-blue-200 hover:bg-blue-50/50 transition-colors">
                    <span className={`inline-flex shrink-0 items-center rounded px-2 py-0.5 text-[10px] font-bold uppercase ${SEVERITY_COLORS[finding.severity] ?? 'text-gray-600 bg-gray-50'}`}>
                      {finding.severity}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-xs font-medium text-gray-800">{finding.title}</p>
                      <p className="text-[10px] text-gray-400">{finding.audit?.title}</p>
                    </div>
                    {finding.isMaterial && (
                      <span className="shrink-0 text-[9px] font-bold text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded">
                        MATERIAL
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
