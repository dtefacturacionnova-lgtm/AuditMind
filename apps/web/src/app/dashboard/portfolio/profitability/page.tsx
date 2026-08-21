'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ChevronDown, ShieldAlert, LineChart, Loader2,
} from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { useUser } from '@/hooks/useUser';
import { formatMoney } from '@/lib/utils';
import {
  usePortfolioProfitability, marginTone, PortfolioProfitabilitySummary,
} from '@/hooks/usePortfolio';

const PROFITABILITY_ROLES = ['CAE', 'ADMIN', 'SUPER_ADMIN'];

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 6 }, (_, i) => CURRENT_YEAR - 1 + i);

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

function EngagementRow({ item }: { item: PortfolioProfitabilitySummary }) {
  const tone = marginTone(item.totales.margenPct);
  const unavailableReason = item.ingreso ? 'Sin costear' : 'Honorario no definido';

  const content = (
    <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between gap-4 hover:border-blue-200 hover:shadow-sm transition-all">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-gray-800 truncate">{item.clientName}</p>
        <p className="text-xs text-gray-400">Ejercicio fiscal {item.fiscalYear}</p>
      </div>
      <div className="flex items-center gap-6 flex-shrink-0">
        <div className="text-right hidden sm:block">
          <p className="text-[10px] text-gray-400 uppercase tracking-wide">Ingreso</p>
          <p className="text-xs font-medium text-gray-700">
            {item.ingreso ? formatMoney(item.ingreso.feeAmount) : <span className="text-gray-400 italic">No definido</span>}
          </p>
        </div>
        <div className="text-right hidden md:block">
          <p className="text-[10px] text-gray-400 uppercase tracking-wide">Costo</p>
          <p className="text-xs font-medium text-gray-700">{formatMoney(item.totales.costoTotal)}</p>
        </div>
        <div className="text-right hidden lg:block">
          <p className="text-[10px] text-gray-400 uppercase tracking-wide">Margen</p>
          <p className="text-xs font-semibold text-gray-700">
            {item.totales.margenAbsoluto !== null
              ? formatMoney(item.totales.margenAbsoluto)
              : <span className="text-gray-400 italic">{unavailableReason}</span>}
          </p>
        </div>
        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold min-w-[64px] text-center ${tone.bg} ${tone.text}`}>
          {item.totales.margenPct !== null ? `${item.totales.margenPct.toFixed(1)}%` : '—'}
        </span>
      </div>
    </div>
  );

  return item.clientId
    ? <Link href={`/dashboard/portfolio/clients/${item.clientId}?tab=engagements`}>{content}</Link>
    : content;
}

export default function PortfolioProfitabilityPage() {
  const { hasRole } = useUser();
  const canView = hasRole(PROFITABILITY_ROLES);
  const [year, setYear] = useState(CURRENT_YEAR);

  const { data: items = [], isLoading } = usePortfolioProfitability(year, canView);

  if (!canView) {
    return (
      <div className="flex flex-col h-full">
        <Header title="Rentabilidad" />
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-6">
          <div className="p-4 bg-amber-50 rounded-full">
            <ShieldAlert className="h-10 w-10 text-amber-500" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-900">No tienes permiso para ver esta información</h2>
            <p className="text-sm text-gray-500 mt-1 max-w-xs">
              Necesitas el rol de CAE / Director o Administrador para acceder a la rentabilidad de la cartera.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <Header title="Rentabilidad" breadcrumbs={[{ label: 'Horas y Rentabilidad' }, { label: 'Rentabilidad' }]} />

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Rentabilidad de la Cartera</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Encargos aprobados de {year}, ordenados por margen % — los que no se pueden calcular quedan al final.
            </p>
          </div>
          <YearSelect year={year} onChange={setYear} />
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin" /> Cargando…
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <LineChart className="w-10 h-10 mb-2 opacity-30" />
            <p className="text-sm">Sin encargos aprobados en {year}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item, i) => (
              <EngagementRow key={item.engagementId ?? `${item.clientName}-${item.fiscalYear}-${i}`} item={item} />
            ))}
          </div>
        )}

        {/* Leyenda */}
        <div className="flex items-center gap-4 pt-2 text-[11px] text-gray-500 flex-wrap">
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Margen sano (&gt;30%)</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Margen ajustado (10–30%)</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-500" /> Margen negativo (&lt;10%)</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-gray-300" /> No calculable</span>
        </div>
      </div>
    </div>
  );
}
