'use client';

import { useMemo, useState } from 'react';
import { Clock, FilePlus2 } from 'lucide-react';
import { BillableGroup, useBillableHours } from '@/hooks/useCollections';
import { formatMoney } from '@/lib/utils';
import { ErrorLine, btnPrimary, btnSmall } from './ui';
import { InvoiceFormModal } from './InvoiceModals';

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const monthLabel = (m: string) => { const [y, mm] = m.split('-'); return `${MONTHS[Number(mm) - 1] ?? mm} ${y}`; };
const groupKey = (g: BillableGroup) => `${g.userId}|${g.month}|${g.rate}`;
const hoursLabel = (h: number) => `${Math.round(h * 100) / 100} h`;

const BLOCKED: Record<string, string> = {
  NO_FEE: 'Primero define el honorario del encargo.',
  NOT_TIME_BASED: 'Este encargo tiene un honorario fijo: se factura con su calendario de cobros, no con horas.',
  NO_AUDIT: 'El encargo todavía no está aprobado, así que no tiene horas registradas.',
  CANCELLED: 'El encargo está cancelado: no admite facturas.',
  CLOSE_DISABLED: 'Para facturar horas se necesita el cierre de horas: una hora se factura cuando el gerente cierra el mes de esa persona y queda congelada su tarifa. Actívalo en «Cierre de horas» (ajustes).',
};

/**
 * Horas por facturar de una consultoría por tiempo (Fase 4, docs/cobros-honorarios-diseno.md §15): el gerente elige horas cerradas
 * (por persona y mes) y registra la factura con el neto exacto de esas horas. Las horas de meses abiertos y las que no tienen tarifa
 * pactada se muestran aparte porque todavía no se pueden facturar.
 */
export function BillableHoursPanel({ engagementId, termDays, compact = false }: { engagementId: string; termDays?: number; compact?: boolean }) {
  const { data, isLoading, error } = useBillableHours(engagementId);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [invoicing, setInvoicing] = useState(false);

  const sel = useMemo(() => {
    const groups = (data?.groups ?? []).filter((g) => picked.has(groupKey(g)));
    const entries = groups.flatMap((g) => g.entries);
    return {
      ids: entries.map((e) => e.id),
      count: entries.length,
      hours: entries.reduce((s, e) => s + e.hours, 0),
      net: entries.reduce((s, e) => s + Math.round(e.amount * 100), 0) / 100,
    };
  }, [data, picked]);

  if (isLoading) return <p className="text-sm text-gray-400">Cargando horas…</p>;
  if (error) return <ErrorLine error={error} />;
  if (!data) return null;
  if (data.blockedReason && data.blockedReason !== 'CLOSE_DISABLED') {
    return compact ? null : <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">{BLOCKED[data.blockedReason]}</p>;
  }

  const toggle = (g: BillableGroup) => setPicked((p) => { const n = new Set(p); const k = groupKey(g); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const allKeys = data.groups.map(groupKey);
  const allPicked = allKeys.length > 0 && allKeys.every((k) => picked.has(k));
  const tooMany = sel.count > data.maxPerInvoice;

  return (
    <section className="rounded-xl bg-white border border-gray-200 p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-2"><Clock className="w-4 h-4" /> Horas por facturar</h4>
        <p className="text-xs text-gray-500">
          Listas: <strong className="text-gray-800">{hoursLabel(data.invoiceable.hours)}</strong> · <strong className="text-gray-800">{formatMoney(data.invoiceable.amount)}</strong>
          {data.invoiced.count > 0 && <> · ya facturadas {hoursLabel(data.invoiced.hours)} ({formatMoney(data.invoiced.amount)})</>}
        </p>
      </div>

      {data.blockedReason === 'CLOSE_DISABLED' && <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">{BLOCKED.CLOSE_DISABLED}</p>}

      {data.groups.length === 0 ? (
        data.blockedReason === null && <p className="text-xs text-gray-400">No hay horas cerradas pendientes de facturar.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-gray-400">
                <th className="py-1 w-8"><input type="checkbox" aria-label="Elegir todas" checked={allPicked} onChange={() => setPicked(allPicked ? new Set() : new Set(allKeys))} /></th>
                <th>Persona</th><th>Mes</th><th className="text-right">Horas</th><th className="text-right">Tarifa</th><th className="text-right">Monto</th>
              </tr>
            </thead>
            <tbody>
              {data.groups.map((g) => (
                <tr key={groupKey(g)} className="border-t border-gray-100">
                  <td className="py-1.5"><input type="checkbox" aria-label={`Elegir ${g.userName} ${monthLabel(g.month)}`} checked={picked.has(groupKey(g))} onChange={() => toggle(g)} /></td>
                  <td className="font-medium text-gray-700">{g.userName}{g.entries.some((e) => e.afterClose) && <span className="ml-1 text-[10px] text-amber-600" title="Incluye horas agregadas por un ajuste después del cierre">· con ajuste</span>}</td>
                  <td>{monthLabel(g.month)}</td>
                  <td className="text-right">{hoursLabel(g.hours)}</td>
                  <td className="text-right">{formatMoney(g.rate)}</td>
                  <td className="text-right font-medium">{formatMoney(g.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data.groups.length > 0 && data.canInvoice && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-3">
          <p className="text-xs text-gray-600">
            {sel.count === 0 ? 'Elige las horas que vas a facturar.' : <>Elegidas: <strong>{sel.count}</strong> registro(s) · <strong>{hoursLabel(sel.hours)}</strong> · neto <strong>{formatMoney(sel.net)}</strong></>}
            {tooMany && <span className="ml-2 text-red-600">Máximo {data.maxPerInvoice} horas por factura: elige menos.</span>}
          </p>
          <button type="button" disabled={sel.count === 0 || tooMany} onClick={() => setInvoicing(true)} className={`${btnPrimary} inline-flex items-center gap-1`}>
            <FilePlus2 className="w-4 h-4" /> Facturar horas seleccionadas
          </button>
        </div>
      )}

      {data.provisional.count > 0 && (
        <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
          {hoursLabel(data.provisional.hours)} de meses sin cerrar ({formatMoney(data.provisional.amount)} a la tarifa vigente) se devengan pero aún no se facturan: el gerente debe cerrar el mes de cada persona.
          {data.provisional.unratedHours > 0 && <> {hoursLabel(data.provisional.unratedHours)} no tienen tarifa pactada.</>}
        </p>
      )}
      {data.withoutRate.count > 0 && (
        <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
          {hoursLabel(data.withoutRate.hours)} de meses cerrados no tienen tarifa pactada y no se pueden facturar:{' '}
          {data.withoutRate.groups.map((g) => `${g.userName} (${monthLabel(g.month)}, ${hoursLabel(g.hours)})`).join(', ')}.
          Fija la tarifa de esa persona en el equipo del encargo y reabre y vuelve a cerrar ese mes.
        </p>
      )}
      <p className="text-[11px] text-gray-400">
        Una nota de crédito no devuelve las horas a esta lista (es una rebaja de precio). Para volver a facturarlas, anula la factura.
        {termDays ? ` Crédito de ${termDays} días.` : ''}
      </p>

      {invoicing && (
        <InvoiceFormModal
          engagementId={engagementId} termDays={termDays} hours={{ ids: sel.ids, net: sel.net, hoursTotal: sel.hours }}
          onClose={() => { setInvoicing(false); setPicked(new Set()); }}
        />
      )}
    </section>
  );
}
