'use client';

import { useMemo, useState } from 'react';
import { CheckCircle2, History, Loader2, Plus, Search, AlertTriangle } from 'lucide-react';
import {
  AssignPlanModal, ExtendTrialModal, RenewModal, SubscriptionSettingsModal,
} from '@/components/billing/SubscriptionModals';
import { BTN_PRIMARY, BTN_SMALL, Card, INPUT_CLS, QueryError, StatusPill } from '@/components/billing/ui';
import { useAllOrganizations, useBillingEvents, usePlans, useSubscriptions } from '@/hooks/useBillingAdmin';
import type { SubscriptionRow } from '@/lib/billing/admin-types';
import { AUDIENCE_LABEL, STATUS_LABEL, type SubscriptionStatus } from '@/lib/billing/catalog';
import { limitText } from '@/lib/billing/access';
import { usd } from '@/lib/billing/pricing';
import {
  NO_FILTERS, countOverrides, describeEvent, expiryText, filterSubscriptions, licenseText, seatsText, shortDate, subscriptionKpis,
  type ExpiryFilter, type SeatsFilter, type SubscriptionFilters,
} from '@/lib/billing/subscription-tools';
import { cn } from '@/lib/utils';

type Dialog =
  | { kind: 'assign'; organizationId?: string }
  | { kind: 'renew' | 'trial' | 'settings'; organizationId: string };

const STATUS_CHIPS: Array<'ALL' | SubscriptionStatus> = ['ALL', 'TRIAL', 'ACTIVE', 'GRACE', 'READ_ONLY', 'SUSPENDED', 'CANCELLED'];

function Kpi({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-5 py-4">
      <p className="text-sm text-gray-600">{label}</p>
      <p className="mt-1 text-3xl font-bold tabular-nums text-gray-900">{value}</p>
      <p className="mt-0.5 text-xs text-gray-600">{note}</p>
    </div>
  );
}

export default function SubscriptionsPage() {
  const subsQ = useSubscriptions();
  const plansQ = usePlans();
  const orgsQ = useAllOrganizations();
  const [filters, setFilters] = useState<SubscriptionFilters>(NO_FILTERS);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [historyOrg, setHistoryOrg] = useState<string | undefined>(undefined);
  const [toast, setToast] = useState<{ kind: 'ok' | 'warn'; msg: string } | null>(null);
  const eventsQ = useBillingEvents(historyOrg);

  const subs = useMemo(() => subsQ.data ?? [], [subsQ.data]);
  const now = useMemo(() => new Date(), [subsQ.dataUpdatedAt]); // eslint-disable-line react-hooks/exhaustive-deps
  const kpis = useMemo(() => subscriptionKpis(subs, now), [subs, now]);
  const shown = useMemo(() => filterSubscriptions(subs, filters, now), [subs, filters, now]);
  const nameOf = useMemo(() => new Map(subs.map((s) => [s.organizationId, s.organizationName])), [subs]);
  const orgNameOf = (id: string | null) => (id ? nameOf.get(id) ?? orgsQ.data?.find((o) => o.id === id)?.name ?? null : null);
  const planOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of subs) m.set(s.planCode, s.planName || s.planCode);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], 'es'));
  }, [subs]);
  const countBy = (st: 'ALL' | SubscriptionStatus) => (st === 'ALL' ? subs.length : subs.filter((s) => s.status === st).length);

  const notify = (kind: 'ok' | 'warn', msg: string) => {
    setToast({ kind, msg });
    setTimeout(() => setToast(null), 8000);
  };

  const dialogRow: SubscriptionRow | undefined = dialog && dialog.organizationId ? subs.find((s) => s.organizationId === dialog.organizationId) : undefined;
  const set = (p: Partial<SubscriptionFilters>) => setFilters((f) => ({ ...f, ...p }));
  const filtered = JSON.stringify(filters) !== JSON.stringify(NO_FILTERS);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Suscripciones</h1>
          <p className="mt-0.5 text-sm text-gray-600">Plan, vigencia y plazas de cada organización. Todo cambio queda en el registro de actividad.</p>
        </div>
        <button type="button" onClick={() => setDialog({ kind: 'assign' })} className={BTN_PRIMARY} disabled={!plansQ.data || !orgsQ.data}>
          <Plus className="h-4 w-4" aria-hidden="true" /> Asignar plan a una organización
        </button>
      </div>

      {toast && (
        <div role="status" className={cn('flex items-start gap-2 rounded-lg border px-3 py-2 text-sm', toast.kind === 'ok' ? 'border-green-300 bg-green-50 text-green-950' : 'border-amber-300 bg-amber-50 text-amber-950')}>
          {toast.kind === 'ok' ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />}
          <span>{toast.msg}</span>
        </div>
      )}

      {subsQ.isError ? (
        <div className="rounded-xl border border-gray-200 bg-white"><QueryError error={subsQ.error} what="las suscripciones" onRetry={() => void subsQ.refetch()} /></div>
      ) : subsQ.isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-gray-400" aria-label="Cargando" /></div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi label="Ingreso mensual estimado" value={usd(kpis.monthlyRevenue, 0)} note="Licencias activas y en gracia, llevadas a mes" />
            <Kpi label="Suscripciones activas" value={String(kpis.active)} note={kpis.exemptActive > 0 ? `Incluye ${kpis.exemptActive} exenta${kpis.exemptActive === 1 ? '' : 's'}` : 'Con licencia vigente'} />
            <Kpi label="En prueba" value={String(kpis.trial)} note={kpis.nextTrialDays !== null ? `La más próxima termina en ${kpis.nextTrialDays} ${kpis.nextTrialDays === 1 ? 'día' : 'días'}` : 'Ninguna vigente'} />
            <Kpi label="En gracia o solo lectura" value={String(kpis.graceOrReadOnly)} note={kpis.suspended > 0 ? `Más ${kpis.suspended} suspendida${kpis.suspended === 1 ? '' : 's'} o cancelada${kpis.suspended === 1 ? '' : 's'}` : 'Requieren seguimiento de cobro'} />
          </div>

          <Card title="Organizaciones">
            <div className="mb-4 space-y-3">
              <div role="group" aria-label="Filtrar por estado" className="flex flex-wrap gap-1.5">
                {STATUS_CHIPS.map((st) => {
                  const on = filters.status === st;
                  return (
                    <button
                      key={st} type="button" aria-pressed={on} onClick={() => set({ status: st })}
                      className={cn(
                        'rounded-full border px-3.5 py-1.5 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0F2D4A]',
                        on ? 'border-[#0F2D4A] bg-[#0F2D4A] font-semibold text-white' : 'border-gray-300 bg-white text-gray-800 hover:bg-gray-50',
                      )}
                    >
                      {st === 'ALL' ? 'Todas' : STATUS_LABEL[st]} <span className="tabular-nums">{countBy(st)}</span>
                    </button>
                  );
                })}
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <label htmlFor="f-q" className="mb-1 block text-xs font-semibold text-gray-700">Buscar</label>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" aria-hidden="true" />
                    <input id="f-q" type="search" value={filters.q} onChange={(e) => set({ q: e.target.value })} placeholder="Organización o plan" className={cn(INPUT_CLS, 'pl-8')} />
                  </div>
                </div>
                <div>
                  <label htmlFor="f-plan" className="mb-1 block text-xs font-semibold text-gray-700">Plan</label>
                  <select id="f-plan" value={filters.planCode} onChange={(e) => set({ planCode: e.target.value })} className={INPUT_CLS}>
                    <option value="ALL">Todos los planes</option>
                    {planOptions.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="f-exp" className="mb-1 block text-xs font-semibold text-gray-700">Vigencia</label>
                  <select id="f-exp" value={filters.expiry} onChange={(e) => set({ expiry: e.target.value as ExpiryFilter })} className={INPUT_CLS}>
                    <option value="ALL">Cualquiera</option>
                    <option value="SOON7">Vence en 7 días</option>
                    <option value="SOON30">Vence en 30 días</option>
                    <option value="PAST">Ya venció</option>
                    <option value="NONE">Sin vencimiento</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="f-seats" className="mb-1 block text-xs font-semibold text-gray-700">Plazas de usuario</label>
                  <select id="f-seats" value={filters.seats} onChange={(e) => set({ seats: e.target.value as SeatsFilter })} className={INPUT_CLS}>
                    <option value="ALL">Cualquiera</option>
                    <option value="FULL">Plazas llenas</option>
                    <option value="FREE">Con plazas libres</option>
                  </select>
                </div>
              </div>
              {filtered && (
                <p className="text-sm text-gray-700">
                  Mostrando {shown.length} de {subs.length}.{' '}
                  <button type="button" onClick={() => setFilters(NO_FILTERS)} className="font-semibold underline underline-offset-2">Quitar filtros</button>
                </p>
              )}
            </div>

            {shown.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-600">{subs.length === 0 ? 'Todavía no hay organizaciones con suscripción. Usa «Asignar plan a una organización».' : 'Ninguna organización coincide con los filtros.'}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1000px] text-sm">
                  <caption className="sr-only">Suscripciones por organización</caption>
                  <thead>
                    <tr className="border-b border-gray-300 text-left text-xs text-gray-600">
                      <th scope="col" className="px-2.5 py-2 font-semibold">Organización</th>
                      <th scope="col" className="px-2.5 py-2 font-semibold">Plan y licencia</th>
                      <th scope="col" className="px-2.5 py-2 font-semibold">Estado</th>
                      <th scope="col" className="px-2.5 py-2 font-semibold">Vence</th>
                      <th scope="col" className="px-2.5 py-2 font-semibold">Usuarios</th>
                      <th scope="col" className="px-2.5 py-2 font-semibold">Espacio incluido</th>
                      <th scope="col" className="px-2.5 py-2 font-semibold">IA al mes</th>
                      <th scope="col" className="px-2.5 py-2 font-semibold">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {shown.map((r) => {
                      const lic = licenseText(r);
                      const full = r.seatsAllowed !== null && r.seatsUsed >= r.seatsAllowed;
                      const ov = countOverrides(r.overrides);
                      return (
                        <tr key={r.organizationId} className={r.organizationActive ? '' : 'bg-gray-50/70 text-gray-600'}>
                          <td className="px-2.5 py-3">
                            <p className="font-semibold text-gray-900">{r.organizationName}</p>
                            <p className="text-xs text-gray-600">
                              {AUDIENCE_LABEL[r.audience] ?? r.audience}
                              {r.exempt && <> · <span className="font-semibold text-blue-900">Exenta</span></>}
                              {!r.organizationActive && ' · organización inactiva'}
                            </p>
                          </td>
                          <td className="px-2.5 py-3">
                            <p>{r.planName || r.planCode}</p>
                            <p className="text-xs text-gray-600">{lic.main}{lic.note && ` · ${lic.note}`}{ov > 0 && ` · ${ov} ajuste${ov === 1 ? '' : 's'}`}</p>
                          </td>
                          <td className="px-2.5 py-3"><StatusPill status={r.status} /></td>
                          <td className="px-2.5 py-3 text-xs tabular-nums text-gray-800">{expiryText(r, now)}</td>
                          <td className={cn('px-2.5 py-3 tabular-nums', full && 'font-bold text-amber-900')}>{seatsText(r)}{r.extraUsers > 0 && <span className="block text-xs font-normal text-gray-600">+{r.extraUsers} extra</span>}</td>
                          <td className="px-2.5 py-3 tabular-nums">{limitText(r.limits?.storageGb, 'GB')}</td>
                          <td className="px-2.5 py-3 tabular-nums">{limitText(r.limits?.aiRequests)}</td>
                          <td className="px-2.5 py-3">
                            <div className="flex flex-wrap gap-1.5">
                              {r.storedStatus === 'TRIAL' ? (
                                <button type="button" className={BTN_SMALL} onClick={() => setDialog({ kind: 'trial', organizationId: r.organizationId })}>Extender prueba<span className="sr-only"> de {r.organizationName}</span></button>
                              ) : r.months > 0 ? (
                                <button type="button" className={BTN_SMALL} onClick={() => setDialog({ kind: 'renew', organizationId: r.organizationId })}>Renovar<span className="sr-only"> {r.organizationName}</span></button>
                              ) : null}
                              <button type="button" className={BTN_SMALL} onClick={() => setDialog({ kind: 'assign', organizationId: r.organizationId })}>Cambiar plan<span className="sr-only"> de {r.organizationName}</span></button>
                              <button type="button" className={BTN_SMALL} onClick={() => setDialog({ kind: 'settings', organizationId: r.organizationId })}>Ajustes<span className="sr-only"> de {r.organizationName}</span></button>
                              <button type="button" className={BTN_SMALL} onClick={() => setHistoryOrg(r.organizationId)} aria-pressed={historyOrg === r.organizationId}><History className="h-3 w-3" aria-hidden="true" />Historial<span className="sr-only"> de {r.organizationName}</span></button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <p className="mt-3 text-xs text-gray-600">
              Espacio y peticiones de IA se muestran como lo que incluye el plan; el consumo real está en la pestaña «Consumo».
              {' '}«Ingreso mensual estimado» suma el precio pactado (o el del catálogo) de cada licencia dividido entre sus meses; no incluye IVA.
            </p>
          </Card>

          <Card
            title={historyOrg ? `Registro de actividad — ${orgNameOf(historyOrg) ?? 'organización'}` : 'Registro de actividad'}
            subtitle="Cada alta, renovación, cambio de plan, prueba extendida o precio pactado deja un registro: quién, cuándo y qué cambió."
            action={historyOrg ? <button type="button" onClick={() => setHistoryOrg(undefined)} className={BTN_SMALL}>Ver todas las organizaciones</button> : undefined}
          >
            {eventsQ.isError ? (
              <p className="text-sm text-red-700">No se pudo cargar el registro: {(eventsQ.error as Error)?.message}</p>
            ) : eventsQ.isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin text-gray-400" aria-label="Cargando" />
            ) : (eventsQ.data ?? []).length === 0 ? (
              <p className="text-sm text-gray-600">Todavía no hay actividad registrada.</p>
            ) : (
              <ol className="space-y-3">
                {(eventsQ.data ?? []).map((ev) => (
                  <li key={ev.id} className="flex gap-3 text-sm leading-snug">
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-600" aria-hidden="true" />
                    <div>
                      <p className="text-gray-900">{describeEvent(ev, orgNameOf(ev.organizationId))}</p>
                      <p className="text-xs text-gray-600">
                        <time dateTime={ev.createdAt}>{shortDate(ev.createdAt)} {new Date(ev.createdAt).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}</time>
                        {' · '}{ev.actorId ? 'por la plataforma' : 'automático'}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </>
      )}

      {dialog?.kind === 'assign' && plansQ.data && orgsQ.data && (
        <AssignPlanModal key={dialog.organizationId ?? 'nuevo'} orgs={orgsQ.data} plans={plansQ.data} subs={subs} presetOrganizationId={dialog.organizationId} onClose={() => setDialog(null)} notify={notify} />
      )}
      {dialog?.kind === 'renew' && dialogRow && <RenewModal row={dialogRow} onClose={() => setDialog(null)} notify={notify} />}
      {dialog?.kind === 'trial' && dialogRow && <ExtendTrialModal row={dialogRow} onClose={() => setDialog(null)} notify={notify} />}
      {dialog?.kind === 'settings' && dialogRow && <SubscriptionSettingsModal key={dialogRow.organizationId} row={dialogRow} onClose={() => setDialog(null)} notify={notify} />}
    </div>
  );
}
