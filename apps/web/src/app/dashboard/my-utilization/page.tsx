'use client';

import { useMemo, useState } from 'react';
import { Loader2, Gauge, Clock3, Briefcase } from 'lucide-react';
import Link from 'next/link';
import { Header } from '@/components/layout/Header';
import { useMyProfile } from '@/hooks/useUser';
import { useMyAvailabilityProfile } from '@/hooks/useCapacity';
import { useTimesheetReport, useAttendance, CATEGORY_LABELS, TimesheetCategory } from '@/hooks/useTimesheet';
import { AttendanceCalendar } from '@/components/timesheet/AttendanceCalendar';
import { cn } from '@/lib/utils';

const CURRENT_YEAR = new Date().getFullYear();
const CURRENT_MONTH = new Date().getMonth() + 1;
const YEAR_OPTIONS = Array.from({ length: 4 }, (_, i) => CURRENT_YEAR - 1 + i);
const MONTH_LABELS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const CLIENT_CATEGORIES: TimesheetCategory[] = ['CLIENT_BILLABLE', 'CLIENT_NON_BILLABLE'];

// Mismo orden y criterio que la pestaña "Reporte Consolidado" — cliente primero, luego el resto.
const CATEGORY_ORDER: TimesheetCategory[] = [
  'CLIENT_BILLABLE', 'CLIENT_NON_BILLABLE', 'ADMIN', 'TRAINING',
  'BUSINESS_DEVELOPMENT', 'SICK_LEAVE', 'PERSONAL_LEAVE', 'VACATION', 'OTHER_NON_BILLABLE',
];

function StatCard({ label, value, sub, icon: Icon }: { label: string; value: React.ReactNode; sub?: string; icon: React.ElementType }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-center gap-2 text-gray-400 mb-1">
        <Icon className="w-3.5 h-3.5" />
        <p className="text-[11px] font-medium uppercase tracking-wide">{label}</p>
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      {sub && <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function utilizacionTone(pct: number | null): string {
  if (pct === null) return 'text-gray-400';
  if (pct >= 90) return 'text-red-600';
  if (pct >= 70) return 'text-emerald-600';
  if (pct >= 40) return 'text-amber-600';
  return 'text-gray-500';
}

export default function MyUtilizationPage() {
  const { data: profile } = useMyProfile();
  const [year, setYear] = useState(CURRENT_YEAR);
  const [calMonth, setCalMonth] = useState(CURRENT_MONTH);
  const [calYear, setCalYear] = useState(CURRENT_YEAR);
  const { data: availability, isLoading: loadingAvail } = useMyAvailabilityProfile(year);
  const { data: report, isLoading: loadingReport } = useTimesheetReport(
    { groupBy: 'audit', userId: profile?.id, dateFrom: `${year}-01-01`, dateTo: `${year}-12-31` },
    { enabled: !!profile?.id },
  );
  const { data: attendance, isLoading: loadingAttendance } = useAttendance(calYear, calMonth);

  const { categoryTotals, clienteHours, engagements } = useMemo(() => {
    const catMap = new Map<TimesheetCategory, number>();
    const auditMap = new Map<string, { title: string; hours: number }>();
    for (const row of report?.breakdown ?? []) {
      catMap.set(row.category, (catMap.get(row.category) ?? 0) + row.hours);
      if (row.auditId) {
        const existing = auditMap.get(row.auditId);
        auditMap.set(row.auditId, {
          title: row.auditTitle ?? row.auditId,
          hours: (existing?.hours ?? 0) + row.hours,
        });
      }
    }
    const cliente = CLIENT_CATEGORIES.reduce((s, c) => s + (catMap.get(c) ?? 0), 0);
    return {
      categoryTotals: catMap,
      clienteHours: cliente,
      engagements: [...auditMap.entries()]
        .map(([auditId, v]) => ({ auditId, title: v.title, hours: v.hours }))
        .sort((a, b) => b.hours - a.hours),
    };
  }, [report]);

  const netHours = availability?.netAvailableHours ?? null;
  const utilizacionPct = netHours && netHours > 0 ? Math.round((clienteHours / netHours) * 100) : null;
  const totalHours = report?.totals.totalHours ?? 0;
  const isLoading = loadingAvail || loadingReport || !profile;
  const maxCategoryHours = Math.max(1, ...CATEGORY_ORDER.map(c => categoryTotals.get(c) ?? 0));

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Mi Utilización"
        breadcrumbs={[{ label: 'Horas y Rentabilidad' }, { label: 'Mi Utilización' }]}
      />

      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6 max-w-4xl mx-auto w-full">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Mis horas — {year}</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Tu utilización personal, comparada contra tu disponibilidad anual configurada.
            </p>
          </div>
          <div className="relative">
            <select
              value={year}
              onChange={e => setYear(Number(e.target.value))}
              className="appearance-none pl-3 pr-8 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#0F2D4A]/20 focus:border-[#0F2D4A] font-medium text-gray-700"
            >
              {YEAR_OPTIONS.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16 gap-2 text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin" /> Cargando…
          </div>
        ) : !netHours ? (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
            Todavía no tienes un perfil de disponibilidad configurado para {year} — sin eso no se
            puede calcular tu % de utilización. Pídele a tu Gerente de Auditoría o CAE que lo
            configure en{' '}
            <Link href="/dashboard/admin/firm-calendar" className="underline font-medium">Calendario y Capacidad</Link>.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <StatCard
                label="Utilización"
                value={utilizacionPct !== null ? <span className={utilizacionTone(utilizacionPct)}>{utilizacionPct}%</span> : '—'}
                sub="Horas de cliente / horas disponibles"
                icon={Gauge}
              />
              <StatCard
                label="Horas de cliente"
                value={`${clienteHours.toFixed(1)}h`}
                sub={`de ${netHours.toFixed(0)}h disponibles en ${year}`}
                icon={Briefcase}
              />
              <StatCard
                label="Horas totales registradas"
                value={`${totalHours.toFixed(1)}h`}
                sub="Incluye administrativas, capacitación, ausencias, etc."
                icon={Clock3}
              />
            </div>

            {/* Desglose por categoría */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Desglose por categoría
              </p>
              {totalHours === 0 ? (
                <p className="text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2">
                  No tienes horas registradas en {year} todavía —{' '}
                  <Link href="/dashboard/timesheet" className="underline font-medium">captúralas aquí</Link>.
                </p>
              ) : (
                <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-2.5">
                  {CATEGORY_ORDER.filter(c => (categoryTotals.get(c) ?? 0) > 0).map(cat => {
                    const hours = categoryTotals.get(cat) ?? 0;
                    const isClient = CLIENT_CATEGORIES.includes(cat);
                    return (
                      <div key={cat} className="flex items-center gap-3">
                        <span className="w-40 shrink-0 text-xs text-gray-600">{CATEGORY_LABELS[cat]}</span>
                        <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={cn('h-full rounded-full', isClient ? 'bg-blue-500' : 'bg-gray-300')}
                            style={{ width: `${Math.max(2, (hours / maxCategoryHours) * 100)}%` }}
                          />
                        </div>
                        <span className="w-14 shrink-0 text-right text-xs font-medium text-gray-700">{hours.toFixed(1)}h</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Por encargo */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Horas por encargo
              </p>
              {engagements.length === 0 ? (
                <p className="text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2">
                  No has registrado horas ligadas a un encargo en {year}.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100">
                        <th className="text-left px-3 py-2 font-semibold text-gray-500">Encargo</th>
                        <th className="text-right px-3 py-2 font-semibold text-gray-500">Horas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {engagements.map(e => (
                        <tr key={e.auditId} className="border-b border-gray-50 last:border-0">
                          <td className="px-3 py-2">
                            <Link href={`/dashboard/audits/${e.auditId}`} className="font-medium text-[#0F2D4A] hover:underline">
                              {e.title}
                            </Link>
                          </td>
                          <td className="px-3 py-2 text-right text-gray-700">{e.hours.toFixed(1)}h</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {/* Calendario mensual — encargos, administrativas, ausencias y festivos */}
        <div>
          <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Calendario del mes
            </p>
            <div className="flex items-center gap-2">
              <select
                value={calMonth}
                onChange={e => setCalMonth(Number(e.target.value))}
                className="pl-3 pr-8 py-1.5 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#0F2D4A]/20 focus:border-[#0F2D4A] font-medium text-gray-700"
              >
                {MONTH_LABELS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
              <select
                value={calYear}
                onChange={e => setCalYear(Number(e.target.value))}
                className="pl-3 pr-8 py-1.5 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#0F2D4A]/20 focus:border-[#0F2D4A] font-medium text-gray-700"
              >
                {YEAR_OPTIONS.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>
          {loadingAttendance || !attendance ? (
            <div className="flex items-center justify-center py-10 gap-2 text-gray-400">
              <Loader2 className="w-4 h-4 animate-spin" /> Cargando…
            </div>
          ) : (
            <AttendanceCalendar data={attendance} />
          )}
        </div>
      </div>
    </div>
  );
}
