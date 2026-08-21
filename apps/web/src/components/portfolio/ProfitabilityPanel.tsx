'use client';

import { Loader2, AlertCircle, ShieldAlert, Users2 } from 'lucide-react';
import { useUser } from '@/hooks/useUser';
import { useEngagementProfitability, marginTone } from '@/hooks/usePortfolio';
import { formatMoney } from '@/lib/utils';

/** Mismo umbral de rol que el resto de pantallas financieras sensibles de Cartera
 *  (cost-profiles/page.tsx): CAE cubre ADMIN/SUPER_ADMIN vía la jerarquía de `hasRole`,
 *  se listan explícitos por consistencia con `EngagementsTab`. */
const PROFITABILITY_ROLES = ['CAE', 'ADMIN', 'SUPER_ADMIN'];

const RATE_TYPE_LABELS: Record<string, string> = {
  COST: 'Costo', TIER1: 'Venta 1', TIER2: 'Venta 2', TIER3: 'Venta 3',
};

function StatCard({ label, value, sub, muted }: { label: string; value: React.ReactNode; sub?: string; muted?: boolean }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
      <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">{label}</p>
      <p className={muted ? 'mt-1 text-sm font-medium text-gray-400 italic' : 'mt-1 text-lg font-bold text-gray-900'}>
        {value}
      </p>
      {sub && <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

/** Panel de rentabilidad de UN encargo — pensado para expandirse dentro de la fila
 *  del encargo en `EngagementsTab`. Verifica el rol ANTES de invocar el hook (vía el
 *  parámetro `enabled`), así que un usuario sin permiso nunca dispara la llamada de red
 *  ni ve un parpadeo del dato sensible. */
export function ProfitabilityPanel({ engagementId }: { engagementId: string }) {
  const { hasRole } = useUser();
  const canView = hasRole(PROFITABILITY_ROLES);

  const { data, isLoading, isError, error } = useEngagementProfitability(engagementId, canView);

  if (!canView) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700">
        <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
        Necesitas el rol de CAE / Director o superior para ver la rentabilidad de este encargo.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-8 text-gray-400 text-sm">
        <Loader2 className="w-4 h-4 animate-spin" /> Calculando rentabilidad…
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
        {(error as Error)?.message ?? 'No se pudo calcular la rentabilidad de este encargo'}
      </div>
    );
  }

  // Estado válido, no error: el encargo aún no está aprobado.
  if (!data.auditId) {
    return (
      <p className="text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2">
        Este encargo aún no está aprobado — no hay horas ni costos que mostrar todavía.
      </p>
    );
  }

  const { totales, porPersona, ingreso } = data;
  const tone = marginTone(totales.margenPct);
  // margenAbsoluto/margenPct null puede deberse a dos causas distintas — se distingue
  // el mensaje para no decir "sin costear" cuando en realidad falta el honorario.
  const unavailableReason = ingreso ? 'Sin costear' : 'Honorario no definido';

  return (
    <div className="space-y-4">
      <div className={`flex items-center gap-2 rounded-xl border px-4 py-2 ${tone.bg} ${tone.border}`}>
        <span className={`w-2 h-2 rounded-full ${tone.dot}`} />
        <span className={`text-xs font-semibold ${tone.text}`}>{tone.label}</span>
        {totales.horasSinCostear > 0 && (
          <span className="ml-auto text-[11px] text-amber-600 font-medium">
            {totales.horasSinCostear.toFixed(1)}h sin costear
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Ingreso"
          value={ingreso ? `${formatMoney(ingreso.feeAmount)} ${ingreso.feeCurrency}` : 'Honorario no definido'}
          muted={!ingreso}
        />
        <StatCard
          label="Costo total"
          value={formatMoney(totales.costoTotal)}
          sub={`${totales.horasTotales.toFixed(1)}h registradas`}
        />
        <StatCard
          label="Margen"
          value={totales.margenAbsoluto !== null ? formatMoney(totales.margenAbsoluto) : unavailableReason}
          muted={totales.margenAbsoluto === null}
        />
        <StatCard
          label="Margen %"
          value={totales.margenPct !== null ? `${totales.margenPct.toFixed(1)}%` : unavailableReason}
          muted={totales.margenPct === null}
        />
      </div>

      {/* Vista alternativa: horas reales × tarifa pactada por persona (Equipo del Encargo) */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
          Rentabilidad por tarifa asignada
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard
            label="Ingreso por tarifa"
            value={formatMoney(totales.ingresoPorTarifa)}
            sub={totales.horasSinTarifa > 0 ? `${totales.horasSinTarifa.toFixed(1)}h sin tarifa asignada` : undefined}
          />
          <StatCard label="Costo total" value={formatMoney(totales.costoTotal)} />
          <StatCard
            label="Margen"
            value={totales.margenPorTarifaAbsoluto !== null ? formatMoney(totales.margenPorTarifaAbsoluto) : 'Sin tarifas asignadas'}
            muted={totales.margenPorTarifaAbsoluto === null}
          />
          <StatCard
            label="Margen %"
            value={totales.margenPorTarifaPct !== null ? `${totales.margenPorTarifaPct.toFixed(1)}%` : 'Sin tarifas asignadas'}
            muted={totales.margenPorTarifaPct === null}
          />
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
          <Users2 className="w-3.5 h-3.5" /> Desglose por persona
        </p>
        {porPersona.length === 0 ? (
          <p className="text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2">Sin horas registradas todavía.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="w-full text-xs">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left font-medium text-gray-500 px-3 py-2">Persona</th>
                  <th className="text-right font-medium text-gray-500 px-3 py-2">Horas totales</th>
                  <th className="text-right font-medium text-gray-500 px-3 py-2">Costo calculado</th>
                  <th className="text-right font-medium text-gray-500 px-3 py-2">Horas sin costear</th>
                  <th className="text-left font-medium text-gray-500 px-3 py-2">Tarifa asignada</th>
                  <th className="text-right font-medium text-gray-500 px-3 py-2">Ingreso por tarifa</th>
                </tr>
              </thead>
              <tbody>
                {porPersona.map(p => (
                  <tr key={p.userId} className="border-t border-gray-100">
                    <td className="px-3 py-2 font-medium text-gray-700">{p.userName}</td>
                    <td className="px-3 py-2 text-right text-gray-600">{p.horasTotales.toFixed(1)}</td>
                    <td className="px-3 py-2 text-right">
                      {p.costoCalculado !== null
                        ? <span className="text-gray-700">{formatMoney(p.costoCalculado)}</span>
                        : <span className="text-gray-400 italic">Sin costear</span>}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {p.horasSinCostear > 0
                        ? <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-semibold">{p.horasSinCostear.toFixed(1)}h</span>
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-3 py-2 text-gray-600">
                      {p.tarifaTipo
                        ? <span>{RATE_TYPE_LABELS[p.tarifaTipo] ?? p.tarifaTipo} {p.tarifaPorHora !== null && <span className="text-gray-400">({formatMoney(p.tarifaPorHora)}/hr)</span>}</span>
                        : <span className="text-gray-300 italic">Sin asignar</span>}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {p.ingresoPorTarifa !== null
                        ? <span className="text-gray-700">{formatMoney(p.ingresoPorTarifa)}</span>
                        : <span className="text-gray-400 italic">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
