'use client';

import Link from 'next/link';
import { Loader2, Pencil, Plus } from 'lucide-react';
import { BTN_PRIMARY, BTN_SECONDARY, Pill, QueryError } from '@/components/billing/ui';
import { usePlans } from '@/hooks/useBillingAdmin';
import { AUDIENCE_LABEL, MODULE_KEYS } from '@/lib/billing/catalog';
import { planPriceSummary } from '@/lib/billing/plan-form';
import { usd } from '@/lib/billing/pricing';

/** Lista de planes: nombre, audiencia, precio mensual, suscriptores y estado. Editar y crear llevan al editor. */
export default function PlansPage() {
  const { data: plans, isLoading, isError, error, refetch } = usePlans();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Planes</h1>
          <p className="mt-0.5 text-sm text-gray-600">
            Cada plan es un dato editable: cambiar un precio o un módulo no requiere desplegar. Guardar un plan no cambia lo que ya contrataron los clientes.
          </p>
        </div>
        <Link href="/dashboard/admin/billing/planes/nuevo" className={BTN_PRIMARY}>
          <Plus className="h-4 w-4" aria-hidden="true" /> Nuevo plan
        </Link>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        {isError ? (
          <QueryError error={error} what="los planes" onRetry={() => void refetch()} />
        ) : isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-gray-400" aria-label="Cargando" /></div>
        ) : (plans ?? []).length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-600">Todavía no hay planes. Crea el primero con «Nuevo plan».</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <caption className="sr-only">Planes de la plataforma</caption>
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-600">
                  <th scope="col" className="px-4 py-3 font-semibold">Plan</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Audiencia</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">Precio mensual</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">Módulos</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">Suscriptores</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Estado</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold"><span className="sr-only">Acciones</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(plans ?? []).map((p) => {
                  const price = planPriceSummary(p);
                  return (
                    <tr key={p.id} className={p.active ? '' : 'bg-gray-50/70 text-gray-600'}>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-gray-900">{p.name}</p>
                        <p className="text-xs text-gray-600">{p.code}</p>
                      </td>
                      <td className="px-4 py-3">{AUDIENCE_LABEL[p.audience] ?? p.audience}</td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {price.monthly !== null ? (
                          <span className="font-semibold">{usd(price.monthly)}</span>
                        ) : price.lowestPerMonth !== null ? (
                          <span title="Equivalencia por mes de la licencia más larga">≈ {usd(price.lowestPerMonth)}</span>
                        ) : price.hasActivePrice ? (
                          <span className="text-gray-600">Sin vencimiento</span>
                        ) : (
                          <span className="text-amber-800">Sin precio</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {(p.modules ?? []).length} de {MODULE_KEYS.length}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{p.subscribers ?? 0}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          <Pill tone={p.active ? 'green' : 'gray'}>{p.active ? 'Activo' : 'Inactivo'}</Pill>
                          {!p.isPublic && <Pill tone="amber">Privado</Pill>}
                          {p.featured && <Pill tone="blue">Más elegido</Pill>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link href={`/dashboard/admin/billing/planes/${encodeURIComponent(p.id)}`} className={BTN_SECONDARY}>
                          <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Editar<span className="sr-only"> {p.name}</span>
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
