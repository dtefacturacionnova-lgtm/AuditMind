'use client';

import { useMemo, useState } from 'react';
import { Loader2, Pencil, Plus } from 'lucide-react';
import { PackEditorModal } from '@/components/billing/PackEditorModal';
import { BTN_PRIMARY, BTN_SMALL, Callout, Pill, QueryError } from '@/components/billing/ui';
import { useAdminPacks, useAdminPayments, useBillingSettings } from '@/hooks/useBillingAdmin';
import { FALLBACK_SETTINGS, type AdminPackRow } from '@/lib/billing/admin-types';
import {
  LOW_MARGIN_PCT, PACK_KIND_LABEL, activeCoverage, packEconomics, pendingByPack, sortPacks,
} from '@/lib/billing/pack-catalog';
import { packTitle, packUnitText } from '@/lib/billing/packs';
import { toNumber, usd } from '@/lib/billing/pricing';

/**
 * Catálogo de paquetes: lo que el cliente puede comprar cuando se le acaban las peticiones de IA o el espacio. Cada paquete es un dato
 * editable (no hace falta desplegar). Cambiarlo no toca lo que ya compraron los clientes ni los pagos ya pedidos.
 */
export default function PacksPage() {
  const packsQ = useAdminPacks();
  const paymentsQ = useAdminPayments();
  const settingsQ = useBillingSettings();
  const [editing, setEditing] = useState<AdminPackRow | 'new' | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const packs = useMemo(() => sortPacks(Array.isArray(packsQ.data) ? packsQ.data : []), [packsQ.data]);
  const pending = useMemo(() => pendingByPack(paymentsQ.data), [paymentsQ.data]);
  const coverage = useMemo(() => activeCoverage(packs), [packs]);
  const costPerRequest = settingsQ.data?.costPerRequestUsd ?? FALLBACK_SETTINGS.costPerRequestUsd;
  const loaded = packsQ.isSuccess;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Paquetes</h1>
          <p className="mt-0.5 max-w-3xl text-sm text-gray-600">
            Lo que el cliente puede comprar cuando se le acaban las peticiones de IA o el espacio. Cambiar un paquete no toca lo que ya compraron los
            clientes ni los pagos ya pedidos.
          </p>
        </div>
        <button type="button" onClick={() => { setToast(null); setEditing('new'); }} disabled={!loaded} className={BTN_PRIMARY}>
          <Plus className="h-4 w-4" aria-hidden="true" /> Nuevo paquete
        </button>
      </div>

      {toast && <Callout tone="success">{toast}</Callout>}
      {loaded && coverage.AI === 0 && (
        <Callout tone="warning" title="No hay paquetes de IA activos">Los clientes que agoten sus peticiones no tendrán qué comprar.</Callout>
      )}
      {loaded && coverage.STORAGE === 0 && (
        <Callout tone="warning" title="No hay paquetes de espacio activos">Los clientes con el espacio lleno no tendrán qué comprar.</Callout>
      )}
      {settingsQ.isError && (
        <Callout tone="warning">
          No se pudieron leer los parámetros de la plataforma: el costo de IA usa el valor por defecto ({usd(FALLBACK_SETTINGS.costPerRequestUsd, 4)} por petición).
        </Callout>
      )}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        {packsQ.isError ? (
          <QueryError error={packsQ.error} what="los paquetes" onRetry={() => void packsQ.refetch()} />
        ) : packsQ.isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-gray-400" aria-label="Cargando" /></div>
        ) : packs.length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-600">Todavía no hay paquetes. Crea el primero con «Nuevo paquete».</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <caption className="sr-only">Catálogo de paquetes de peticiones de IA y de espacio</caption>
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-600">
                  <th scope="col" className="px-4 py-3 text-right font-semibold">Orden</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Paquete</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Tipo</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">Precio</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">Costo estimado</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Margen</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">Pagos pendientes</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Estado</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold"><span className="sr-only">Acciones</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {packs.map((p) => {
                  const price = toNumber(p.priceUsd);
                  const econ = packEconomics(p.kind, p.quantity, price, costPerRequest);
                  const waiting = pending[p.code] ?? 0;
                  return (
                    <tr key={p.id} className={p.active ? '' : 'bg-gray-50/70 text-gray-600'}>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-600">{p.sortOrder}</td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-gray-900">{p.name}</p>
                        <p className="text-xs text-gray-600"><span className="font-mono">{p.code}</span> · {packTitle(p)}</p>
                      </td>
                      <td className="px-4 py-3">{PACK_KIND_LABEL[p.kind] ?? p.kind}</td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        <p className="font-semibold text-gray-900">{usd(price)}</p>
                        <p className="text-xs text-gray-600">{price === null ? '' : packUnitText({ kind: p.kind, quantity: p.quantity, priceUsd: price })}</p>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{usd(econ.cost)}<span className="block text-xs text-gray-600">{p.kind === 'STORAGE' ? 'por mes' : 'si se gasta todo'}</span></td>
                      <td className="px-4 py-3">
                        {econ.margin ? (
                          <Pill tone={econ.margin.amount < 0 ? 'red' : econ.margin.pct < LOW_MARGIN_PCT ? 'amber' : 'green'}>
                            {econ.margin.pct} % · {usd(econ.margin.amount)}
                          </Pill>
                        ) : <span className="text-xs text-gray-600">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {paymentsQ.isSuccess ? (waiting > 0 ? <Pill tone="amber">{waiting}</Pill> : <span className="text-gray-600">0</span>) : <span className="text-gray-600" title="No se pudieron leer los pagos">—</span>}
                      </td>
                      <td className="px-4 py-3">{p.active ? <Pill tone="green">Activo</Pill> : <Pill>Inactivo</Pill>}</td>
                      <td className="px-4 py-3 text-right">
                        <button type="button" onClick={() => { setToast(null); setEditing(p); }} className={BTN_SMALL} aria-label={`Editar ${p.name}`}>
                          <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Editar
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-xs leading-relaxed text-gray-600">
        El costo y el margen son estimados y solo los ves tú: en IA, si el cliente gasta todas las peticiones (costo por petición de los parámetros); en espacio, por mes con el
        espacio lleno (tarifa ilustrativa de Supabase Pro). Un paquete no se borra: se desactiva y deja de ofrecerse.
      </p>

      {editing && (
        <PackEditorModal
          pack={editing === 'new' ? null : editing}
          packs={packs}
          pending={editing === 'new' ? 0 : (pending[editing.code] ?? 0)}
          costPerRequestUsd={costPerRequest}
          onClose={() => setEditing(null)}
          onSaved={(message) => setToast(message)}
        />
      )}
    </div>
  );
}
