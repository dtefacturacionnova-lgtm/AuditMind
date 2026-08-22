'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft, Clock, TrendingUp, BarChart3, Users, Filter, Loader2, PieChart,
} from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { apiClient } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { useUser } from '@/hooks/useUser';
import { usePlans } from '@/hooks/usePlans';
import {
  useTimesheetReport, useTimeDistribution,
  type TimesheetReportGroupBy, type TimesheetReportRow,
} from '@/hooks/useTimesheet';

// ─── Local helpers ────────────────────────────────────────────────────────────
function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const GROUP_BY_OPTIONS: { value: TimesheetReportGroupBy; label: string }[] = [
  { value: 'user',  label: 'Por Persona' },
  { value: 'audit', label: 'Por Encargo' },
  { value: 'date',  label: 'Por Fecha' },
  { value: 'plan',  label: 'Por Plan Anual' },
];

// ─── Atajos de período (para el modo Distribución) ─────────────────────────────
function getMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay(); // 0=Dom … 6=Sáb
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return date;
}

const PERIOD_PRESETS = [
  { key: 'day',   label: 'Hoy' },
  { key: 'week',  label: 'Esta semana' },
  { key: 'month', label: 'Este mes' },
  { key: 'year',  label: 'Este año' },
] as const;

function presetRange(key: (typeof PERIOD_PRESETS)[number]['key'], today: Date): { from: string; to: string } {
  switch (key) {
    case 'week': {
      const monday = getMonday(today);
      const sunday = new Date(monday); sunday.setDate(sunday.getDate() + 6);
      return { from: toDateKey(monday), to: toDateKey(sunday) };
    }
    case 'month':
      return {
        from: toDateKey(new Date(today.getFullYear(), today.getMonth(), 1)),
        to:   toDateKey(new Date(today.getFullYear(), today.getMonth() + 1, 0)),
      };
    case 'year':
      return { from: toDateKey(new Date(today.getFullYear(), 0, 1)), to: toDateKey(new Date(today.getFullYear(), 11, 31)) };
    case 'day':
    default:
      return { from: toDateKey(today), to: toDateKey(today) };
  }
}

// ─── Org users (para el selector de persona — solo AUDIT_MANAGER+) ────────────
interface OrgUserOption { id: string; name: string; email: string }
interface OrgUsersResponse { data: OrgUserOption[]; meta: { total: number } }

function useOrgUsersForSelector(enabled: boolean) {
  return useQuery<OrgUsersResponse>({
    queryKey:  ['timesheet-report-users'],
    queryFn:   () => apiClient.get<OrgUsersResponse>('/users?limit=100'),
    enabled,
    staleTime: 60_000,
  });
}

// ─── Aggregation ──────────────────────────────────────────────────────────────
interface AggregatedRow {
  key:         string;
  label:       string;
  billable:    number;
  nonBillable: number;
  total:       number;
}

function aggregateBreakdown(breakdown: TimesheetReportRow[], groupBy: TimesheetReportGroupBy): AggregatedRow[] {
  const map = new Map<string, AggregatedRow>();
  for (const row of breakdown) {
    let key: string;
    let label: string;
    switch (groupBy) {
      case 'user':  key = row.userId ?? '—';        label = row.userName ?? '—'; break;
      case 'audit': key = row.auditId ?? 'none';     label = row.auditTitle ?? 'Sin encargo'; break;
      case 'plan':  key = row.planItemId ?? 'none';  label = row.planItemLabel ?? 'Sin ítem de plan'; break;
      case 'date':
      default:      key = row.date ?? '—';           label = row.date ? new Date(row.date).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
    }
    const existing = map.get(key) ?? { key, label, billable: 0, nonBillable: 0, total: 0 };
    if (row.category === 'CLIENT_BILLABLE') existing.billable += row.hours;
    else existing.nonBillable += row.hours;
    existing.total += row.hours;
    map.set(key, existing);
  }
  const rows = [...map.values()];
  if (groupBy === 'date') rows.sort((a, b) => a.key.localeCompare(b.key));
  else rows.sort((a, b) => b.total - a.total);
  return rows;
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function TimesheetReportPage() {
  const { hasRole } = useUser();
  const isManagerPlus = hasRole(['AUDIT_MANAGER']);

  const today = useMemo(() => new Date(), []);
  const [viewMode, setViewMode] = useState<'detalle' | 'distribucion'>('detalle');
  const [groupBy, setGroupBy] = useState<TimesheetReportGroupBy>('user');
  const [dateFrom, setDateFrom] = useState(() => toDateKey(new Date(today.getFullYear(), today.getMonth(), 1)));
  const [dateTo, setDateTo]     = useState(() => toDateKey(today));
  const [userId, setUserId]     = useState<string>(''); // '' = todo el equipo (Detalle) / yo mismo (Distribución)
  const [planId, setPlanId]     = useState<string>('');

  const { data: usersResp, isLoading: loadingUsers } = useOrgUsersForSelector(isManagerPlus);
  const { data: plans = [], isLoading: loadingPlans } = usePlans();

  const { data: report, isLoading, isFetching } = useTimesheetReport({
    groupBy,
    dateFrom,
    dateTo,
    userId: isManagerPlus && userId ? userId : undefined,
    planId: groupBy === 'plan' ? (planId || undefined) : undefined,
  }, { enabled: viewMode === 'detalle' });

  const { data: distribution, isLoading: loadingDistribution } = useTimeDistribution(
    dateFrom, dateTo, isManagerPlus && userId ? userId : undefined,
    { enabled: viewMode === 'distribucion' },
  );

  const aggregated = useMemo(
    () => (report ? aggregateBreakdown(report.breakdown, groupBy) : []),
    [report, groupBy],
  );

  const groupColumnLabel = {
    user: 'Persona', audit: 'Encargo', plan: 'Ítem de Plan', date: 'Fecha',
  }[groupBy];

  const totals = report?.totals ?? { billableHours: 0, nonBillableHours: 0, totalHours: 0 };

  return (
    <div className="flex flex-col h-full">
      <Header title="Reporte Consolidado de Horas" />

      <div className="flex-1 overflow-auto p-6 space-y-6">

        <Link
          href="/dashboard/timesheet"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-800"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Volver a captura de horas
        </Link>

        {/* Mode toggle */}
        <div className="inline-flex rounded-xl border border-gray-200 bg-white p-1 w-fit">
          {([
            { key: 'detalle' as const,      label: 'Detalle',      icon: BarChart3 },
            { key: 'distribucion' as const, label: 'Distribución', icon: PieChart },
          ]).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setViewMode(key)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors',
                viewMode === key ? 'bg-[#0F2D4A] text-white' : 'text-gray-500 hover:bg-gray-50',
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>

        {/* Summary cards — solo Detalle (Distribución tiene su propio resumen abajo) */}
        {viewMode === 'detalle' && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { label: 'Horas facturables',    value: totals.billableHours,    color: 'text-emerald-600', bg: 'bg-emerald-50', icon: TrendingUp },
              { label: 'Horas no facturables', value: totals.nonBillableHours, color: 'text-amber-600',   bg: 'bg-amber-50',   icon: Clock },
              { label: 'Total de horas',       value: totals.totalHours,       color: 'text-blue-600',    bg: 'bg-blue-50',    icon: BarChart3 },
            ].map(({ label, value, color, bg, icon: Icon }) => (
              <div key={label} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
                <div className={`w-8 h-8 rounded-xl ${bg} flex items-center justify-center mb-2`}>
                  <Icon className={`w-4 h-4 ${color}`} />
                </div>
                <p className="text-2xl font-bold text-gray-900">{value.toFixed(1)}h</p>
                <p className="text-xs text-gray-500">{label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Filters */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="w-3.5 h-3.5 text-gray-400" />
            <p className="text-xs font-semibold text-gray-700">Filtros</p>
            {isFetching && !isLoading && <Loader2 className="w-3 h-3 animate-spin text-blue-500" />}
          </div>

          {viewMode === 'distribucion' && (
            <div className="flex items-center gap-1.5 mb-3">
              {PERIOD_PRESETS.map(p => (
                <button
                  key={p.key}
                  onClick={() => {
                    const { from, to } = presetRange(p.key, today);
                    setDateFrom(from); setDateTo(to);
                  }}
                  className="px-2.5 py-1 rounded-lg border border-gray-200 text-[11px] font-medium text-gray-600 hover:bg-gray-50"
                >
                  {p.label}
                </button>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-3 items-end">
            {viewMode === 'detalle' && (
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-gray-500">Agrupar por</label>
              <select
                value={groupBy}
                onChange={e => setGroupBy(e.target.value as TimesheetReportGroupBy)}
                className="rounded-lg border border-gray-200 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {GROUP_BY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            )}

            {viewMode === 'detalle' && groupBy === 'plan' && (
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-medium text-gray-500">Plan anual</label>
                <select
                  value={planId}
                  onChange={e => setPlanId(e.target.value)}
                  disabled={loadingPlans}
                  className="rounded-lg border border-gray-200 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[200px]"
                >
                  <option value="">Selecciona un plan…</option>
                  {plans.map(p => (
                    <option key={p.id} value={p.id}>{p.year} — {p.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-gray-500">Desde</label>
              <input
                type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                className="rounded-lg border border-gray-200 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-gray-500">Hasta</label>
              <input
                type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                className="rounded-lg border border-gray-200 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {isManagerPlus && (
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-medium text-gray-500 flex items-center gap-1">
                  <Users className="w-3 h-3" /> Persona
                </label>
                <select
                  value={userId}
                  onChange={e => setUserId(e.target.value)}
                  disabled={loadingUsers}
                  className="rounded-lg border border-gray-200 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[180px]"
                >
                  <option value="">{viewMode === 'distribucion' ? 'Yo mismo' : 'Todo el equipo'}</option>
                  {usersResp?.data.map(u => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        {viewMode === 'detalle' ? (
          /* Grouped table */
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            {isLoading ? (
              <div className="flex justify-center py-14">
                <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : groupBy === 'plan' && !planId ? (
              <div className="text-center py-12 text-gray-400">
                <BarChart3 className="w-10 h-10 mx-auto mb-2 opacity-25" />
                <p className="text-sm font-medium">Selecciona un plan anual</p>
                <p className="text-xs mt-1">El reporte por plan requiere elegir un plan específico.</p>
              </div>
            ) : aggregated.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <Clock className="w-10 h-10 mx-auto mb-2 opacity-25" />
                <p className="text-sm font-medium">Sin horas registradas</p>
                <p className="text-xs mt-1">No hay entradas para los filtros seleccionados.</p>
              </div>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-4 py-2.5 font-semibold text-gray-600">{groupColumnLabel}</th>
                    <th className="text-right px-4 py-2.5 font-semibold text-gray-600">Facturable</th>
                    <th className="text-right px-4 py-2.5 font-semibold text-gray-600">No Facturable</th>
                    <th className="text-right px-4 py-2.5 font-semibold text-gray-600">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {aggregated.map(row => (
                    <tr key={row.key} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                      <td className="px-4 py-2.5 text-gray-700 font-medium max-w-xs truncate" title={row.label}>{row.label}</td>
                      <td className="px-4 py-2.5 text-right text-emerald-700 font-semibold">{row.billable.toFixed(1)}h</td>
                      <td className="px-4 py-2.5 text-right text-amber-700 font-semibold">{row.nonBillable.toFixed(1)}h</td>
                      <td className="px-4 py-2.5 text-right font-bold text-gray-900">{row.total.toFixed(1)}h</td>
                    </tr>
                  ))}
                  <tr className="bg-gray-50 border-t border-gray-200">
                    <td className="px-4 py-2.5 font-semibold text-gray-700">Total</td>
                    <td className="px-4 py-2.5 text-right font-black text-emerald-700">{totals.billableHours.toFixed(1)}h</td>
                    <td className="px-4 py-2.5 text-right font-black text-amber-700">{totals.nonBillableHours.toFixed(1)}h</td>
                    <td className="px-4 py-2.5 text-right font-black text-gray-900">{totals.totalHours.toFixed(1)}h</td>
                  </tr>
                </tbody>
              </table>
            )}
          </div>
        ) : (
          /* Distribución — 3 secciones + % */
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
            {loadingDistribution || !distribution ? (
              <div className="flex justify-center py-14">
                <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : distribution.totalHours === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <PieChart className="w-10 h-10 mx-auto mb-2 opacity-25" />
                <p className="text-sm font-medium">Sin horas registradas</p>
                <p className="text-xs mt-1">No hay entradas para {distribution.userName} en este período.</p>
              </div>
            ) : (
              <div className="space-y-5">
                <p className="text-sm font-semibold text-gray-700">
                  {distribution.userName} — {new Date(`${distribution.dateFrom}T00:00:00`).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })}
                  {' '}al{' '}
                  {new Date(`${distribution.dateTo}T00:00:00`).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })}
                </p>

                {/* Barra apilada */}
                <div className="h-4 rounded-full overflow-hidden flex bg-gray-100">
                  {distribution.pctCliente ? <div className="bg-emerald-500" style={{ width: `${distribution.pctCliente}%` }} /> : null}
                  {distribution.pctAdministrativas ? <div className="bg-amber-500" style={{ width: `${distribution.pctAdministrativas}%` }} /> : null}
                  {distribution.pctOtras ? <div className="bg-blue-500" style={{ width: `${distribution.pctOtras}%` }} /> : null}
                </div>

                {[
                  {
                    label: '1. Horas a Clientes (Encargos)', hours: distribution.clienteHours, pct: distribution.pctCliente,
                    color: 'text-emerald-700', bar: 'bg-emerald-500', bg: 'bg-emerald-50',
                    sub: null as string | null,
                  },
                  {
                    label: '2. No Cargadas a Clientes — Administrativas', hours: distribution.administrativasHours, pct: distribution.pctAdministrativas,
                    color: 'text-amber-700', bar: 'bg-amber-500', bg: 'bg-amber-50',
                    sub: 'Administrativo, capacitación, desarrollo de negocio, otro',
                  },
                  {
                    label: '3. Otras No Cargadas a Clientes', hours: distribution.otrasHours, pct: distribution.pctOtras,
                    color: 'text-blue-700', bar: 'bg-blue-500', bg: 'bg-blue-50',
                    sub: `Ausencias: ${distribution.otrasBreakdown.leaveHours.toFixed(1)}h · Festivos: ${distribution.otrasBreakdown.holidayHours.toFixed(1)}h (${distribution.otrasBreakdown.holidayDays} día${distribution.otrasBreakdown.holidayDays !== 1 ? 's' : ''})`
                      + (distribution.otrasBreakdown.holidayDaysWithoutProfile > 0
                        ? ` — ${distribution.otrasBreakdown.holidayDaysWithoutProfile} festivo(s) sin perfil de disponibilidad ese año, no incluido(s)`
                        : ''),
                  },
                ].map(section => (
                  <div key={section.label} className={cn('rounded-xl p-4', section.bg)}>
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <p className="text-sm font-semibold text-gray-800">{section.label}</p>
                      <div className="flex items-baseline gap-2 shrink-0">
                        <span className={cn('text-xl font-bold', section.color)}>
                          {section.pct !== null ? `${section.pct.toFixed(0)}%` : '—'}
                        </span>
                        <span className="text-xs text-gray-500">{section.hours.toFixed(1)}h</span>
                      </div>
                    </div>
                    <div className="h-1.5 bg-white rounded-full overflow-hidden">
                      <div className={cn('h-full rounded-full', section.bar)} style={{ width: `${section.pct ?? 0}%` }} />
                    </div>
                    {section.sub && <p className="text-[11px] text-gray-500 mt-1.5">{section.sub}</p>}
                  </div>
                ))}

                <div className="flex justify-between items-center pt-3 border-t border-gray-100 text-xs">
                  <span className="text-gray-500 font-medium">Total del período</span>
                  <span className="font-bold text-gray-900">{distribution.totalHours.toFixed(1)}h</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
