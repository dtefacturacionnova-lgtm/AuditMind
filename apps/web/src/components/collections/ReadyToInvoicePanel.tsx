'use client';

import { useState } from 'react';
import { useReadyToInvoice } from '@/hooks/useCollections';
import { formatMoney } from '@/lib/utils';
import { ErrorLine, btnSmall } from './ui';
import { BillableHoursPanel } from './BillableHoursPanel';

/** Consultorías por tiempo con horas cerradas listas para facturar (Fase 4). Cada fila abre el mismo panel de selección del encargo. */
export function ReadyToInvoicePanel() {
  const { data, isLoading, error } = useReadyToInvoice();
  const [openId, setOpenId] = useState<string | null>(null);

  if (isLoading) return <p className="text-sm text-gray-400">Cargando…</p>;
  if (error) return <ErrorLine error={error} />;
  if (!data) return null;
  const total = data.items.reduce((s, i) => s + i.amount, 0);

  return (
    <div className="space-y-3">
      {!data.closeEnabled && (
        <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
          El cierre de horas no está activado: sin él ninguna hora queda cerrada ni con tarifa congelada, y no hay horas que facturar. Actívalo en «Cierre de horas».
        </p>
      )}
      {data.items.length === 0 ? (
        <p className="text-sm text-gray-400">No hay consultorías por tiempo con horas cerradas pendientes de facturar.</p>
      ) : (
        <>
          <p className="text-sm text-gray-600">Listo para facturar: <strong className="text-gray-800">{formatMoney(total)}</strong> en {data.items.length} consultoría(s).</p>
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-gray-400"><th className="px-3 py-2">Cliente</th><th>Consultoría</th><th className="text-right">Horas</th><th className="text-right">Monto</th><th /></tr></thead>
              <tbody>
                {data.items.map((i) => (
                  <tr key={i.engagementId} className="border-t border-gray-100 align-top">
                    <td className="px-3 py-2 font-medium text-gray-700">{i.clientName}</td>
                    <td>{i.title ?? 'Consultoría'}</td>
                    <td className="text-right">{i.hours} h</td>
                    <td className="text-right font-medium">{formatMoney(i.amount)}</td>
                    <td className="px-3 text-right"><button type="button" onClick={() => setOpenId(openId === i.engagementId ? null : i.engagementId)} className={btnSmall}>{openId === i.engagementId ? 'Cerrar' : 'Elegir horas'}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {openId && <BillableHoursPanel engagementId={openId} compact />}
        </>
      )}
    </div>
  );
}
