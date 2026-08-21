'use client';

import { useState } from 'react';
import { Loader2, ShieldAlert, TrendingUp, Clock, Wallet, ListOrdered } from 'lucide-react';
import Link from 'next/link';
import { Header } from '@/components/layout/Header';
import { useUser } from '@/hooks/useUser';
import { cn, formatMoney } from '@/lib/utils';
import { useFirmDashboard } from '@/hooks/useCapacity';

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 4 }, (_, i) => CURRENT_YEAR - 1 + i);

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

export default function FirmHoursDashboardPage() {
  const { hasRole } = useUser();
  const canView = hasRole(['CAE', 'ADMIN', 'SUPER_ADMIN']);
  const [year, setYear] = useState(CURRENT_YEAR);
  const { data, isLoading, isFetching } = useFirmDashboard(year);

  if (!canView) {
    return (
      <div className="flex flex-col h-full">
        <Header title="Dashboard de la Firma" />
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-6">
          <div className="p-4 bg-amber-50 rounded-full">
            <ShieldAlert className="h-10 w-10 text-amber-500" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-900">No tienes permiso para ver esta información</h2>
            <p className="text-sm text-gray-500 mt-1 max-w-xs">
              Necesitas el rol de CAE / Director o Administrador para acceder a esta sección.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Dashboard de la Firma"
        breadcrumbs={[{ label: 'Horas y Rentabilidad' }, { label: 'Dashboard de la Firma' }]}
      />

      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6 max-w-5xl mx-auto w-full">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Utilización, WIP y presupuesto — firm-wide</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Vista agregada de horas y costos de toda la organización, para Interna y Externa por igual.
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
        ) : !data ? null : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <StatCard
                label="Utilización promedio"
                value={data.utilizacionPromedio !== null ? `${data.utilizacionPromedio.toFixed(0)}%` : '—'}
                sub={`${data.utilizacionPorPersona.length} persona(s) con perfil de disponibilidad`}
                icon={TrendingUp}
              />
              <StatCard
                label="WIP aproximado"
                value={formatMoney(data.wipAproximado)}
                sub={`${data.horasConTarifa.toFixed(1)}h con tarifa pactada, aún sin facturar`}
                icon={Wallet}
              />
              <StatCard
                label="Encargos con presupuesto activo"
                value={data.rankingEncargos.length}
                sub="Con horas presupuestadas definidas"
                icon={ListOrdered}
              />
            </div>

            <p className="text-[11px] text-gray-400 bg-gray-50 rounded-lg px-3 py-2">
              "WIP aproximado" es una aproximación — el sistema todavía no tiene un módulo de Facturación
              real (monto facturado/cobrado). Se calcula como horas reales × tarifa pactada por persona
              en cada encargo, para las personas que ya tienen una tarifa asignada en la pestaña Equipo.
            </p>

            {/* Utilización por persona */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" /> Utilización por persona {isFetching && <Loader2 className="w-3 h-3 animate-spin text-gray-300" />}
              </p>
              {data.utilizacionPorPersona.length === 0 ? (
                <p className="text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2">
                  Nadie tiene un perfil de{' '}
                  <Link href="/dashboard/admin/firm-calendar" className="underline font-medium">Disponibilidad</Link>{' '}
                  configurado para {year}.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100">
                        <th className="text-left px-3 py-2 font-semibold text-gray-500">Persona</th>
                        <th className="text-right px-3 py-2 font-semibold text-gray-500">Horas disponibles</th>
                        <th className="text-right px-3 py-2 font-semibold text-gray-500">Horas reales</th>
                        <th className="text-right px-3 py-2 font-semibold text-gray-500">Utilización</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.utilizacionPorPersona.map(p => (
                        <tr key={p.userId} className="border-b border-gray-50 last:border-0">
                          <td className="px-3 py-2 font-medium text-gray-700">{p.userName}</td>
                          <td className="px-3 py-2 text-right text-gray-500">{p.horasDisponibles.toFixed(0)}h</td>
                          <td className="px-3 py-2 text-right text-gray-700">{p.horasReales.toFixed(1)}h</td>
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

            {/* Ranking de encargos por variación de presupuesto */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <ListOrdered className="w-3.5 h-3.5" /> Encargos por variación de presupuesto
              </p>
              {data.rankingEncargos.length === 0 ? (
                <p className="text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2">
                  Ningún encargo abierto tiene horas presupuestadas todavía — se definen en la pestaña Equipo de cada encargo.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100">
                        <th className="text-left px-3 py-2 font-semibold text-gray-500">Encargo</th>
                        <th className="text-right px-3 py-2 font-semibold text-gray-500">Presupuestadas</th>
                        <th className="text-right px-3 py-2 font-semibold text-gray-500">Reales</th>
                        <th className="text-right px-3 py-2 font-semibold text-gray-500">Variación</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.rankingEncargos.map(e => (
                        <tr key={e.auditId} className="border-b border-gray-50 last:border-0">
                          <td className="px-3 py-2">
                            <Link href={`/dashboard/audits/${e.auditId}`} className="font-medium text-[#0F2D4A] hover:underline">
                              {e.auditTitle}
                            </Link>
                          </td>
                          <td className="px-3 py-2 text-right text-gray-500">{e.horasPresupuestadas.toFixed(1)}h</td>
                          <td className="px-3 py-2 text-right text-gray-700">{e.horasReales.toFixed(1)}h</td>
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
          </>
        )}
      </div>
    </div>
  );
}
