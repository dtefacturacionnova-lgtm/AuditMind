'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Info } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { useEngagementProgram, type ProgramEngagementLine, type ProgramHoursSource } from '@/hooks/usePortfolio';

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 6 }, (_, i) => CURRENT_YEAR - 1 + i);
const nf = (n: number) => n.toLocaleString('es-SV', { maximumFractionDigits: 1 });

const SOURCE_LABEL: Record<ProgramHoursSource, string> = {
  TEAM_BUDGET: 'Presupuesto del equipo', ESTIMATE: 'Horas estimadas', PROPOSAL: 'Propuesta (por rol)', NONE: 'Sin horas',
};

function tone(pct: number | null, overbooked: boolean) {
  if (overbooked || (pct !== null && pct >= 100)) return { bar: 'bg-red-500', text: 'text-red-700', label: 'Sobreasignado' };
  if (pct !== null && pct >= 85) return { bar: 'bg-amber-500', text: 'text-amber-700', label: 'Al límite' };
  if (pct !== null && pct > 0) return { bar: 'bg-emerald-500', text: 'text-emerald-700', label: 'Con holgura' };
  return { bar: 'bg-gray-200', text: 'text-gray-400', label: pct === null ? 'Sin perfil' : 'Sin horas' };
}

function Summary({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl bg-white border border-gray-200 px-4 py-3">
      <p className="text-[11px] text-gray-400">{label}</p>
      <p className="text-lg font-semibold text-gray-800">{value}</p>
      {hint && <p className="text-[11px] text-gray-400">{hint}</p>}
    </div>
  );
}

function EngagementRow({ e }: { e: ProgramEngagementLine }) {
  const name = e.kind === 'CONSULTING' ? (e.title ?? 'Consultoría') : `Auditoría ${e.fiscalYear}`;
  return (
    <tr className="border-t border-gray-100 align-top">
      <td className="py-2 pr-3">
        <p className="font-medium text-gray-800">{e.clientName}</p>
        <p className="text-xs text-gray-500">{name}{e.status === 'DRAFT' && <span className="ml-1 text-amber-600">· borrador</span>}</p>
      </td>
      <td className="text-xs text-gray-600">{e.partnerName ?? '—'}</td>
      <td className="text-xs text-gray-600">
        {e.plannedStartDate || e.plannedEndDate ? `${e.plannedStartDate ?? '…'} → ${e.plannedEndDate ?? '…'}` : <span className="text-gray-400">sin fechas (se supone el año {e.kind === 'AUDIT' ? e.fiscalYear + 1 : e.fiscalYear})</span>}
        {e.yearShare < 1 && <span className="block text-[11px] text-gray-400">{Math.round(e.yearShare * 100)} % cae en este año</span>}
      </td>
      <td className="text-xs text-gray-500">{SOURCE_LABEL[e.source]}</td>
      <td className="text-right font-semibold text-gray-800">{nf(e.hours)}</td>
      <td className="text-right text-xs text-gray-600">
        {e.unassignedHours > 0 ? <span title="Horas que aún no están repartidas entre personas" className="text-amber-700">{nf(e.unassignedHours)} sin asignar</span> : '—'}
      </td>
    </tr>
  );
}

/**
 * Programa anual de encargos (modalidad externa): cuántas horas tienen comprometidas los encargos del año contra la capacidad neta
 * de cada persona. Es informativo: no bloquea aprobar ni asignar.
 */
export default function EngagementProgramPage() {
  const [year, setYear] = useState(CURRENT_YEAR);
  const { data, isLoading, error } = useEngagementProgram(year);

  return (
    <div className="flex flex-col h-full">
      <Header title="Programa anual de encargos" breadcrumbs={[{ label: 'Horas y Rentabilidad' }, { label: 'Programa anual de encargos' }]} />
      <div className="flex-1 overflow-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <Link href="/dashboard/portfolio" className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-800">
            <ArrowLeft className="w-3.5 h-3.5" /> Volver a Cartera de Clientes
          </Link>
          <label className="text-xs text-gray-500">Año de trabajo
            <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="ml-2 rounded-lg border border-gray-200 px-2 py-1.5 text-sm text-gray-700">
              {YEAR_OPTIONS.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
        </div>

        <div className="flex items-start gap-2.5 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-xs text-blue-800">
          <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <p>
            Cruza las horas de los encargos vivos (borrador y aprobados) con la <strong>capacidad neta</strong> de cada persona en el año. Un encargo sin fechas
            previstas se supone trabajado el año siguiente a su ejercicio (una consultoría, el mismo año); con fechas, sus horas se reparten por días entre
            los años que toca. Las horas salen del presupuesto del equipo del encargo; si no hay, de las horas estimadas o de la propuesta (esas no están
            repartidas entre personas). Es informativo: no bloquea ninguna acción.
          </p>
        </div>

        {isLoading && <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>}
        {error && <p className="text-sm text-red-600">{error instanceof Error ? error.message : 'No se pudo cargar el programa.'}</p>}

        {data && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <Summary label="Capacidad neta del equipo" value={`${nf(data.totals.capacity)} h`} />
              <Summary label="Horas comprometidas" value={`${nf(data.totals.committed + data.totals.unassigned)} h`} hint={data.totals.unassigned > 0 ? `${nf(data.totals.unassigned)} h sin asignar a personas` : undefined} />
              <Summary label="Uso de la capacidad" value={data.totals.utilizationPct === null ? '—' : `${nf(data.totals.utilizationPct)} %`} />
              <Summary label="Holgura" value={`${nf(data.totals.free)} h`} hint={data.totals.free < 0 ? 'Hay más horas que capacidad' : undefined} />
              <Summary label="Personas sobreasignadas" value={String(data.totals.overbookedPeople)} />
            </div>

            {(data.totals.peopleWithoutProfile > 0 || data.totals.engagementsWithoutHours > 0) && (
              <div className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 space-y-1">
                {data.totals.peopleWithoutProfile > 0 && <p>{data.totals.peopleWithoutProfile} persona(s) tienen horas comprometidas pero ningún perfil de disponibilidad para {data.year}: su capacidad no se cuenta. Se registra en «Calendario y Capacidad».</p>}
                {data.totals.engagementsWithoutHours > 0 && <p>{data.totals.engagementsWithoutHours} encargo(s) de este año no tienen horas (sin presupuesto del equipo, sin horas estimadas y sin horas en la propuesta): ponles horas para que cuenten.</p>}
              </div>
            )}

            <section className="rounded-xl bg-white border border-gray-200 p-4 space-y-3">
              <h3 className="text-sm font-semibold text-gray-700">Capacidad por persona</h3>
              {data.people.length === 0 ? <p className="text-xs text-gray-400">Todavía no hay perfiles de disponibilidad para {data.year}.</p> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="text-left text-xs text-gray-400"><th className="py-1">Persona</th><th className="text-right">Capacidad</th><th className="text-right">Comprometidas</th><th className="text-right">Trabajadas</th><th className="w-48 pl-4">Uso</th><th className="text-right">Holgura</th></tr></thead>
                    <tbody>
                      {data.people.map((p) => {
                        const t = tone(p.utilizationPct, p.overbooked);
                        return (
                          <tr key={p.userId} className="border-t border-gray-100">
                            <td className="py-2 font-medium text-gray-800">{p.name}</td>
                            <td className="text-right">{p.capacity === null ? <span className="text-xs text-amber-600">sin perfil</span> : `${nf(p.capacity)} h`}</td>
                            <td className="text-right">{nf(p.committed)} h</td>
                            <td className="text-right text-gray-500">{nf(p.actual)} h</td>
                            <td className="pl-4">
                              <div className="flex items-center gap-2">
                                <div className="h-2 flex-1 rounded-full bg-gray-100 overflow-hidden"><div className={`h-full ${t.bar}`} style={{ width: `${Math.min(100, p.utilizationPct ?? 0)}%` }} /></div>
                                <span className={`text-xs w-24 ${t.text}`}>{p.utilizationPct === null ? '—' : `${nf(p.utilizationPct)} %`} · {t.label}</span>
                              </div>
                            </td>
                            <td className={`text-right ${p.free !== null && p.free < 0 ? 'text-red-600 font-medium' : ''}`}>{p.free === null ? '—' : `${nf(p.free)} h`}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="rounded-xl bg-white border border-gray-200 p-4 space-y-3">
              <h3 className="text-sm font-semibold text-gray-700">Encargos del año</h3>
              {data.engagements.length === 0 ? <p className="text-xs text-gray-400">No hay encargos con horas para {data.year}.</p> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="text-left text-xs text-gray-400"><th className="py-1">Cliente y encargo</th><th>Socio</th><th>Fechas</th><th>Horas según</th><th className="text-right">Horas</th><th className="text-right">Por asignar</th></tr></thead>
                    <tbody>{data.engagements.map((e) => <EngagementRow key={e.id} e={e} />)}</tbody>
                  </table>
                </div>
              )}
              {data.withoutHours.length > 0 && (
                <div className="border-t border-gray-100 pt-3">
                  <h4 className="text-xs font-semibold text-amber-700 mb-1">Sin horas todavía</h4>
                  <table className="w-full text-sm"><tbody>{data.withoutHours.map((e) => <EngagementRow key={e.id} e={e} />)}</tbody></table>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
