'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQueries } from '@tanstack/react-query';
import {
  ArrowLeft, CalendarDays, Users, Info, ChevronDown, Building2, Loader2,
} from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { apiClient } from '@/lib/api-client';
import { useEngagements, type Engagement } from '@/hooks/usePortfolio';
import { useTeamAvailabilityProfiles, type UserAvailabilityProfile } from '@/hooks/useCapacity';
import type { TimesheetReport } from '@/hooks/useTimesheet';

// ─── Constantes ───────────────────────────────────────────────────────────────
const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const MONTHS_FULL = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 6 }, (_, i) => CURRENT_YEAR - 1 + i);

// ─── Umbrales de utilización ────────────────────────────────────────────────
// Mismo esquema semántico y mismos cortes (70% / 90%) que `CapacityBar` en
// apps/web/src/app/dashboard/plans/page.tsx y plans/[id]/page.tsx — se reutiliza
// para que "sobreasignado" signifique lo mismo en toda la app.
function utilizationTone(pct: number): { solid: string; text: string; bg: string; border: string; label: string } {
  if (pct >= 90) return { solid: 'bg-red-500',     text: 'text-red-700',     bg: 'bg-red-50',     border: 'border-red-200',     label: 'Sobreasignado' };
  if (pct >= 70) return { solid: 'bg-amber-500',   text: 'text-amber-700',   bg: 'bg-amber-50',   border: 'border-amber-200',   label: 'Al límite' };
  if (pct > 0)   return { solid: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200', label: 'Saludable' };
  return { solid: 'bg-gray-200', text: 'text-gray-400', bg: 'bg-gray-50', border: 'border-gray-100', label: 'Sin horas' };
}

function clientLabel(client: Engagement['client']): string {
  return client?.tradeName || client?.legalName || 'Cliente';
}

// ─── Year selector (mismo patrón que admin/firm-calendar) ─────────────────────
function YearSelect({ year, onChange }: { year: number; onChange: (y: number) => void }) {
  return (
    <div className="relative">
      <select
        value={year}
        onChange={e => onChange(Number(e.target.value))}
        className="appearance-none pl-3 pr-8 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#0F2D4A]/20 focus:border-[#0F2D4A] font-medium text-gray-700"
      >
        {YEAR_OPTIONS.map(y => <option key={y} value={y}>{y}</option>)}
      </select>
      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
    </div>
  );
}

// ─── Calendario de cierres fiscales ────────────────────────────────────────────
function FiscalClosingsCalendar({ engagements, year }: { engagements: Engagement[]; year: number }) {
  const [selected, setSelected] = useState<number | null>(null);

  const byMonth = useMemo(() => {
    const buckets: Engagement[][] = MONTHS.map(() => []);
    for (const e of engagements) {
      if (!e.fiscalYearEndDate) continue;
      const m = Number(e.fiscalYearEndDate.slice(5, 7)) - 1;
      if (m >= 0 && m < 12) buckets[m].push(e);
    }
    return buckets;
  }, [engagements]);

  const maxCount = Math.max(1, ...byMonth.map(b => b.length));
  const selectedList = selected != null ? byMonth[selected] : [];

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
      <div className="flex items-center gap-2 mb-1">
        <CalendarDays className="w-3.5 h-3.5 text-gray-400" />
        <p className="text-xs font-semibold text-gray-700">Calendario de Cierres Fiscales — {year}</p>
      </div>
      <p className="text-[11px] text-gray-400 mb-3">
        Clientes activos por mes de cierre de año fiscal. Haz clic en un mes para ver los clientes que cierran ahí.
      </p>

      <div className="grid grid-cols-12 gap-1.5">
        {byMonth.map((list, i) => {
          const isSelected = selected === i;
          return (
            <button
              key={MONTHS[i]}
              onClick={() => setSelected(prev => prev === i ? null : i)}
              className={`flex flex-col items-center gap-1.5 rounded-xl border py-2.5 transition-all ${
                isSelected ? 'border-blue-400 bg-blue-50/60 ring-2 ring-blue-100' : 'border-gray-100 hover:border-blue-200 hover:bg-blue-50/30'
              }`}
              title={`${list.length} cliente${list.length !== 1 ? 's' : ''} cerrando en ${MONTHS_FULL[i]}`}
            >
              <span className="text-[10px] font-medium text-gray-500">{MONTHS[i]}</span>
              <span
                className="inline-flex items-center justify-center w-7 h-7 rounded-lg font-bold text-white text-xs bg-blue-500"
                style={{ opacity: list.length > 0 ? Math.max(0.3, list.length / maxCount) : 0.12 }}
              >
                {list.length || ''}
              </span>
            </button>
          );
        })}
      </div>

      {selected != null && (
        <div className="mt-4 pt-4 border-t border-gray-100">
          <p className="text-xs font-semibold text-gray-700 mb-2">
            Cierres en {MONTHS_FULL[selected]} de {year} ({selectedList.length})
          </p>
          {selectedList.length === 0 ? (
            <p className="text-xs text-gray-400">Sin clientes con cierre fiscal este mes.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {selectedList.map(e => (
                <Link
                  key={e.id}
                  href={`/dashboard/portfolio/clients/${e.clientId}`}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gray-50 border border-gray-200 text-xs text-gray-700 hover:border-blue-300 hover:bg-blue-50 transition-colors"
                >
                  <Building2 className="w-3 h-3 text-gray-400" />
                  {clientLabel(e.client)}
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Mapa de capacidad por persona ─────────────────────────────────────────────
function TeamCapacityHeatmap({ profiles, year }: { profiles: UserAvailabilityProfile[]; year: number }) {
  const dateFrom = `${year}-01-01`;
  const dateTo   = `${year}-12-31`;

  // Una consulta por persona (groupBy=date, filtrada a ese userId) — el backend
  // no ofrece un desglose combinado usuario × mes, así que la agregación mensual
  // se resuelve aquí en el cliente a partir de las filas diarias.
  const reportQueries = useQueries({
    queries: profiles.map(p => ({
      queryKey: ['timesheet-report', { groupBy: 'date', dateFrom, dateTo, userId: p.userId }],
      queryFn: () => apiClient.get<TimesheetReport>(
        `/timesheet/report?groupBy=date&dateFrom=${dateFrom}&dateTo=${dateTo}&userId=${p.userId}`,
      ),
      staleTime: 15_000,
      enabled: !!p.userId,
    })),
  });

  const loadingHours = reportQueries.some(q => q.isLoading);

  const monthlyHoursByUser = useMemo(() => {
    const map = new Map<string, number[]>();
    profiles.forEach((p, idx) => {
      const monthly = new Array(12).fill(0);
      const report = reportQueries[idx]?.data;
      if (report) {
        for (const row of report.breakdown) {
          if (!row.date) continue;
          const m = Number(row.date.slice(5, 7)) - 1;
          if (m >= 0 && m < 12) monthly[m] += row.hours;
        }
      }
      map.set(p.userId, monthly);
    });
    return map;
  }, [profiles, reportQueries]);

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
      <div className="flex items-center gap-2 mb-1">
        <Users className="w-3.5 h-3.5 text-gray-400" />
        <p className="text-xs font-semibold text-gray-700">Mapa de Capacidad por Persona — {year}</p>
        {loadingHours && <Loader2 className="w-3 h-3 animate-spin text-blue-500" />}
      </div>
      <p className="text-[11px] text-gray-400 mb-3">
        % de utilización mensual = horas reales registradas en el mes / (horas netas disponibles anuales ÷ 12).
        Verde = saludable (&lt;70%), ámbar = al límite (70–89%), rojo = sobreasignado (≥90%).
      </p>

      {profiles.length === 0 ? (
        <div className="text-center py-10 text-gray-400">
          <Users className="w-8 h-8 mx-auto mb-2 opacity-25" />
          <p className="text-sm font-medium">Sin perfiles de disponibilidad para {year}</p>
          <p className="text-xs mt-1">
            Configúralos en <Link href="/dashboard/admin/firm-calendar" className="text-blue-600 hover:underline">Calendario y Capacidad</Link>.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr>
                <th className="text-left text-gray-400 font-medium pb-2 pr-3 sticky left-0 bg-white">Persona</th>
                {MONTHS.map(m => (
                  <th key={m} className="text-center text-gray-400 font-medium pb-2 px-1 w-12">{m}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {profiles.map(p => {
                const monthlyAvailable = p.netAvailableHours / 12;
                const monthly = monthlyHoursByUser.get(p.userId) ?? new Array(12).fill(0);
                return (
                  <tr key={p.userId} className="border-t border-gray-50">
                    <td className="py-1.5 pr-3 font-medium text-gray-700 whitespace-nowrap sticky left-0 bg-white">
                      {p.user?.name ?? p.userId}
                    </td>
                    {monthly.map((hours, i) => {
                      const pct = monthlyAvailable > 0 ? Math.round((hours / monthlyAvailable) * 100) : 0;
                      const tone = utilizationTone(pct);
                      return (
                        <td key={i} className="py-1.5 px-1 text-center">
                          <div
                            className={`mx-auto flex items-center justify-center w-10 h-7 rounded-lg font-semibold text-[10px] ${tone.solid} ${
                              pct > 0 ? 'text-white' : 'text-gray-400'
                            }`}
                            title={`${MONTHS_FULL[i]}: ${hours.toFixed(1)}h reales / ${monthlyAvailable.toFixed(1)}h disponibles (${tone.label})`}
                          >
                            {pct > 0 ? `${pct}%` : '—'}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Leyenda */}
      <div className="flex items-center gap-4 mt-4 pt-3 border-t border-gray-100 text-[11px] text-gray-500">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Saludable (&lt;70%)</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Al límite (70–89%)</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-500" /> Sobreasignado (≥90%)</span>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function PortfolioCapacityPage() {
  const [year, setYear] = useState(CURRENT_YEAR);

  const { data: engagements = [], isLoading: loadingEngagements } = useEngagements();
  const { data: profiles = [], isLoading: loadingProfiles } = useTeamAvailabilityProfiles(year);

  const activeEngagements = useMemo(
    () => engagements.filter(e => e.status !== 'CANCELLED' && e.fiscalYear === year),
    [engagements, year],
  );

  const isLoading = loadingEngagements || loadingProfiles;

  return (
    <div className="flex flex-col h-full">
      <Header title="Capacidad del Equipo" breadcrumbs={[{ label: 'Horas y Rentabilidad' }, { label: 'Capacidad del Equipo' }]} />

      <div className="flex-1 overflow-auto p-6 space-y-6">

        <div className="flex items-center justify-between">
          <Link
            href="/dashboard/portfolio"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-800"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Volver a Cartera de Clientes
          </Link>
          <YearSelect year={year} onChange={setYear} />
        </div>

        {/* Nota informativa */}
        <div className="flex items-start gap-2.5 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-xs text-blue-800">
          <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <p>
            Esta vista es <strong>informativa</strong>: cruza los cierres fiscales de los clientes con la disponibilidad
            y horas reales del equipo para ayudar a decidir capacidad antes de aceptar un cliente nuevo. No bloquea
            la creación de encargos ni ninguna otra acción.
          </p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            <FiscalClosingsCalendar engagements={activeEngagements} year={year} />
            <TeamCapacityHeatmap profiles={profiles} year={year} />
          </>
        )}
      </div>
    </div>
  );
}
