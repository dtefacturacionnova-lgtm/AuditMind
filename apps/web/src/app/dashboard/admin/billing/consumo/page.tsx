'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Callout, Card, INPUT_CLS, Pill, QueryError } from '@/components/billing/ui';
import { useAdminConsumption } from '@/hooks/useBillingAdmin';
import { FILE_TYPE_INFO } from '@/lib/billing/catalog';
import {
  ALERT_SHORT, LOW_MARGIN_PCT, ORG_SORT_LABEL, PROVIDER_LABEL, agentTotals, attentionList, barWidth, consumptionTotals, costText, countText, egressKpi, egressTypeTotals, formatBytes,
  gbText, isCurrentPeriod, normalizeConsumption, orgView, pctText, periodKeyOf, periodLabel, providerComparison, recentPeriods, sortOrgs, typeTotals,
  type MeterLevel, type OrgSort, type OrgView, type StorageProvider,
} from '@/lib/billing/consumption';
import { usd } from '@/lib/billing/pricing';
import { cn } from '@/lib/utils';

const BAR: Record<MeterLevel, string> = { none: 'bg-blue-600', ok: 'bg-blue-600', warn: 'bg-amber-600', full: 'bg-red-600' };
const PCT_TEXT: Record<MeterLevel, string> = { none: 'text-gray-700', ok: 'text-gray-700', warn: 'font-bold text-amber-900', full: 'font-bold text-red-900' };

function Kpi({ label, value, sub, note }: { label: string; value: string; sub?: string; note?: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-5 py-4">
      <p className="text-sm text-gray-600">{label}</p>
      <p className="mt-1 break-words text-2xl font-bold tabular-nums text-gray-900 sm:text-3xl">{value}</p>
      {sub && <p className="mt-0.5 text-sm tabular-nums text-gray-800">{sub}</p>}
      {note && <p className="mt-0.5 text-xs text-gray-600">{note}</p>}
    </div>
  );
}

function MiniBar({ pct, level }: { pct: number | null; level: MeterLevel }) {
  return (
    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-gray-200" aria-hidden="true">
      <div className={cn('h-full rounded-full', BAR[level])} style={{ width: `${barWidth(pct)}%` }} />
    </div>
  );
}

function Seg<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: Array<[T, string]>; onChange: (v: T) => void }) {
  return (
    <div role="group" aria-label={label} className="flex gap-1 rounded-lg bg-gray-200 p-1">
      {options.map(([id, text]) => (
        <button
          key={id} type="button" aria-pressed={value === id} onClick={() => onChange(id)}
          className={cn(
            'rounded-md px-3 py-1.5 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#0F2D4A]',
            value === id ? 'bg-white font-semibold text-gray-900 shadow-sm' : 'text-gray-700 hover:text-gray-900',
          )}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

function OrgRow({ v }: { v: OrgView }) {
  return (
    <tr className="align-top">
      <td className="px-2.5 py-3">
        <p className="break-words font-semibold text-gray-900">{v.name}</p>
        <p className="text-xs text-gray-600">{v.planLabel}{v.statusLabel ? ` · ${v.statusLabel}` : ''}{v.exempt ? ' · exenta' : ''}</p>
        {v.alerts.length > 0 && (
          <ul className="mt-1.5 flex flex-wrap gap-1">
            {v.alerts.map((a) => (
              <li key={a.code} title={a.text}>
                <Pill tone={ALERT_SHORT[a.code].tone}>{ALERT_SHORT[a.code].label}<span className="sr-only">: {a.text}</span></Pill>
              </li>
            ))}
          </ul>
        )}
      </td>
      <td className="min-w-[11rem] px-2.5 py-3">
        <div className="flex items-baseline justify-between gap-2 tabular-nums">
          <span>{v.included === null ? `${countText(v.requests)} / sin tope` : `${countText(v.planRequests)} / ${countText(v.included)}`}</span>
          {v.requestsPct !== null && <span className={PCT_TEXT[v.requestsLevel]}>{pctText(v.requestsPct)}</span>}
        </div>
        {v.requestsPct !== null && <MiniBar pct={v.requestsPct} level={v.requestsLevel} />}
        {v.packRequests > 0 && <p className="mt-0.5 text-xs tabular-nums text-gray-600">+{countText(v.packRequests)} de paquetes</p>}
        {v.included !== null && v.requests !== v.planRequests && <p className="sr-only">Total del mes: {countText(v.requests)} peticiones</p>}
      </td>
      <td className="px-2.5 py-3 text-right tabular-nums">{costText(v.aiCost)}</td>
      <td className="min-w-[10rem] px-2.5 py-3">
        <div className="flex items-baseline justify-between gap-2 tabular-nums">
          <span>{formatBytes(v.storageBytes)}{v.storageLimitGb === null ? '' : ` / ${gbText(v.storageLimitGb)}`}</span>
          {v.storagePct !== null && <span className={PCT_TEXT[v.storageLevel]}>{pctText(v.storagePct)}</span>}
        </div>
        {v.storagePct !== null && <MiniBar pct={v.storagePct} level={v.storageLevel} />}
      </td>
      <td className="px-2.5 py-3 text-right tabular-nums">{costText(v.storageCost)}</td>
      <td className="px-2.5 py-3 text-right tabular-nums">
        {v.egressFiles > 0 ? (
          <>
            {formatBytes(v.egressBytes)}
            <span className="block text-xs text-gray-600">{countText(v.egressFiles)} {v.egressFiles === 1 ? 'archivo' : 'archivos'}{v.egressCost > 0 ? ` · ${costText(v.egressCost)}` : ''}</span>
          </>
        ) : <span className="text-gray-600">—</span>}
      </td>
      <td className="px-2.5 py-3 text-right font-semibold tabular-nums">{costText(v.totalCost)}</td>
      <td className="px-2.5 py-3 text-right tabular-nums">{v.income > 0 ? costText(v.income) : <span className="text-gray-600">{v.exempt ? 'Exenta' : 'Sin ingreso'}</span>}</td>
      <td className="px-2.5 py-3 text-right tabular-nums">
        {v.marginPct === null ? (
          <span className="text-gray-600">—</span>
        ) : (
          <span className={cn('font-semibold', v.marginPct < LOW_MARGIN_PCT ? 'text-red-900' : 'text-green-900')}>
            {pctText(v.marginPct)}<span className="block text-xs font-normal text-gray-600">{costText(v.margin)}</span>
          </span>
        )}
      </td>
    </tr>
  );
}

export default function ConsumptionPage() {
  const now = useMemo(() => new Date(), []);
  const periods = useMemo(() => recentPeriods(now, 12), [now]);
  const [period, setPeriod] = useState(() => periodKeyOf(now));
  const [provider, setProvider] = useState<StorageProvider>('SUPABASE');
  const [sort, setSort] = useState<OrgSort>('COST');
  const q = useAdminConsumption(period);

  const data = useMemo(() => normalizeConsumption(q.data), [q.data]);
  const views = useMemo(() => data.organizations.map((o) => orgView(o, provider)), [data.organizations, provider]);
  const sorted = useMemo(() => sortOrgs(views, sort), [views, sort]);
  const totals = useMemo(() => consumptionTotals(views), [views]);
  const types = useMemo(() => typeTotals(data.organizations, provider, data.rates), [data.organizations, data.rates, provider]);
  const agents = useMemo(() => agentTotals(data.agents), [data.agents]);
  const egressTypes = useMemo(() => egressTypeTotals(data.organizations), [data.organizations]);
  const egressInfo = useMemo(() => egressKpi(totals, data.egress, provider), [totals, data.egress, provider]);
  const watch = useMemo(() => attentionList(views), [views]);
  const compare = useMemo(() => providerComparison(data.organizations), [data.organizations]);
  const current = isCurrentPeriod(period, now);
  const label = periodLabel(period);
  const providerName = PROVIDER_LABEL[provider];
  const perThousand = data.costPerRequestUsd * 1000;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Consumo y costos · {label}</h1>
          <p className="mt-0.5 text-sm text-gray-600">Peticiones y dinero por organización, asistente y tipo de archivo. El cliente solo ve peticiones; el dinero es solo para ti.</p>
        </div>
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label htmlFor="cm-period" className="mb-1 block text-xs font-semibold text-gray-700">Mes</label>
            <select id="cm-period" value={period} onChange={(e) => setPeriod(e.target.value)} className={cn(INPUT_CLS, 'w-auto min-w-[10rem]')}>
              {periods.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold text-gray-700">Almacenamiento en</p>
            <Seg label="Proveedor de almacenamiento" value={provider} onChange={setProvider} options={[['SUPABASE', 'Supabase'], ['R2', 'Cloudflare R2']]} />
          </div>
        </div>
      </div>

      {!current && (
        <Callout tone="info" title={`Estás viendo ${label}`}>
          Las peticiones de IA, las <strong>descargas</strong> y sus costos son de ese mes. El <strong>espacio</strong> y el <strong>ingreso</strong> son los de hoy: el sistema no guarda su historia mes a mes.
        </Callout>
      )}

      {q.isError ? (
        <div className="rounded-xl border border-gray-200 bg-white"><QueryError error={q.error} what="el consumo" onRetry={() => void q.refetch()} /></div>
      ) : q.isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-gray-400" aria-label="Cargando" /></div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
            <Kpi label="Peticiones de IA del mes" value={countText(totals.requests)} sub={`en ${totals.orgs} ${totals.orgs === 1 ? 'organización' : 'organizaciones'}`} note="Lo que ve el cliente" />
            <Kpi label="Costo de IA del mes" value={costText(totals.aiCost)} sub={`≈ ${costText(perThousand)} por cada 1,000 peticiones`} note="Peticiones × costo por petición de Parámetros" />
            <Kpi label="Espacio usado" value={formatBytes(totals.storageBytes)} sub={`costo ${costText(totals.storageCost)} con ${providerName}`} note="Espacio de hoy; las descargas van en su propia tarjeta" />
            <Kpi label="Descargas del mes" value={egressInfo.value} sub={egressInfo.sub} note={egressInfo.note} />
            <Kpi label="Ingreso mensual de licencias" value={costText(totals.income)} sub="sin contar paquetes comprados" note="Licencias llevadas a mes" />
            <Kpi
              label="Margen sobre costo variable" value={totals.marginPct === null ? '—' : pctText(totals.marginPct)}
              sub={totals.income > 0 ? `${costText(totals.margin)} después de IA, espacio y descargas` : 'Sin ingreso este mes'} note="Antes de costos fijos"
            />
          </div>

          {watch.length > 0 && (
            <Card title="Para vigilar este mes" subtitle="Oportunidades de venta y riesgos, de lo más grave a lo menos.">
              <ul className="space-y-1.5">
                {watch.map((w) => (
                  <li key={w.id} className="flex items-start gap-2 text-sm text-gray-900">
                    <AlertTriangle className={cn('mt-0.5 h-4 w-4 shrink-0', w.alert.level === 'critical' ? 'text-red-700' : 'text-amber-600')} aria-hidden="true" />
                    <span className="break-words"><strong>{w.name}:</strong> {w.alert.text}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card
            title="Por organización: peticiones y dinero"
            subtitle={`Costo de IA = peticiones × costo por petición (${usd(data.costPerRequestUsd, 4)}). Costo de espacio y de descargas según ${providerName}.`}
            action={
              <div>
                <label htmlFor="cm-sort" className="mb-1 block text-xs font-semibold text-gray-700">Ordenar por</label>
                <select id="cm-sort" value={sort} onChange={(e) => setSort(e.target.value as OrgSort)} className={cn(INPUT_CLS, 'w-auto')}>
                  {(Object.keys(ORG_SORT_LABEL) as OrgSort[]).map((k) => <option key={k} value={k}>{ORG_SORT_LABEL[k]}</option>)}
                </select>
              </div>
            }
          >
            {sorted.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-600">Todavía no hay organizaciones con suscripción, así que no hay consumo que mostrar.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1160px] text-sm">
                  <caption className="sr-only">Consumo y costos de {label} por organización</caption>
                  <thead>
                    <tr className="border-b border-gray-300 text-left text-xs text-gray-600">
                      <th scope="col" className="px-2.5 py-2 font-semibold">Organización</th>
                      <th scope="col" className="px-2.5 py-2 font-semibold">Peticiones de IA (de lo incluido)</th>
                      <th scope="col" className="px-2.5 py-2 text-right font-semibold">Costo IA</th>
                      <th scope="col" className="px-2.5 py-2 font-semibold">Espacio</th>
                      <th scope="col" className="px-2.5 py-2 text-right font-semibold">Costo espacio</th>
                      <th scope="col" className="px-2.5 py-2 text-right font-semibold">Descargas del mes</th>
                      <th scope="col" className="px-2.5 py-2 text-right font-semibold">Costo total</th>
                      <th scope="col" className="px-2.5 py-2 text-right font-semibold">Ingreso al mes</th>
                      <th scope="col" className="px-2.5 py-2 text-right font-semibold">Margen</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {sorted.map((v) => <OrgRow key={v.id} v={v} />)}
                  </tbody>
                </table>
              </div>
            )}
            <p className="mt-3 text-xs leading-relaxed text-gray-600">
              No incluye costos fijos (servidor, base de datos, correo y dominio). Las descargas son enlaces emitidos (cada archivo cuenta una vez por día): una guía para comparar organizaciones, no la factura de Supabase. «Sin ingreso» son pruebas, cuentas en solo lectura o sin precio cargado;
              «Exenta» es el plan interno o de cortesía. El porcentaje de peticiones compara lo gastado del plan con lo incluido: lo que salió de paquetes comprados se muestra aparte.
            </p>
          </Card>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card title="Por asistente (todos los clientes)" subtitle={`Peticiones y su costo en ${label}.`}>
              {agents.length === 0 ? (
                <p className="text-sm text-gray-700">Nadie usó asistentes de IA en este mes.</p>
              ) : (
                <ul className="space-y-3">
                  {agents.map((a) => (
                    <li key={a.agent} className="flex flex-col gap-1">
                      <div className="flex items-baseline justify-between gap-3 text-sm tabular-nums">
                        <span className="min-w-0 break-words font-semibold text-gray-900">
                          {a.agent}{a.info && <span className="ml-1.5 text-xs font-normal text-gray-600">{a.info}</span>}
                        </span>
                        <span className="shrink-0 text-gray-800">{countText(a.requests)} · {costText(a.costUsd)} · {pctText(a.share)}</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-gray-200" aria-hidden="true">
                        <div className="h-full rounded-full bg-blue-600" style={{ width: `${barWidth(a.barPct)}%` }} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card title="Espacio por tipo de archivo" subtitle={`Suma de todas las organizaciones, hoy. Costo estimado con la tarifa de ${providerName}.`}>
              {types.totalBytes === 0 ? (
                <p className="text-sm text-gray-700">Todavía no hay archivos guardados.</p>
              ) : (
                <ul className="space-y-3">
                  {types.types.map((t) => (
                    <li key={t.key} className="flex flex-col gap-1">
                      <div className="flex items-baseline justify-between gap-3 text-sm tabular-nums">
                        <span className="font-semibold text-gray-900">{FILE_TYPE_INFO[t.key].label}</span>
                        <span className="text-gray-800">{formatBytes(t.bytes)} · {t.bytes > 0 ? pctText(t.share) : '—'} · {costText(t.estCost)}</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-gray-200" aria-hidden="true">
                        <div className="h-full rounded-full bg-teal-600" style={{ width: `${barWidth(t.barPct)}%` }} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-3 text-xs leading-relaxed text-gray-600">
                Comparación del espacio de hoy: {costText(compare.supabase)} en Supabase contra {costText(compare.r2)} en Cloudflare R2 (tarifas por GB-mes
                de {usd(data.rates.supabase, 4)} y {usd(data.rates.cloudflareR2, 4)}). Las descargas del mes se ven aparte: con Cloudflare R2 no tienen costo, y con Supabase solo cuestan lo que pase de {gbText(data.egress.includedGb)} al mes en toda la plataforma.
              </p>
            </Card>

            <Card title="Descargas por tipo de archivo" subtitle={`Suma de todas las organizaciones en ${label}: archivos con enlace de descarga emitido.`}>
              {!data.egress.measured ? (
                <p className="text-sm text-gray-700">Las descargas todavía no se pueden medir: falta aplicar el SQL de descargas en la base de datos.</p>
              ) : egressTypes.totalBytes === 0 ? (
                <p className="text-sm text-gray-700">Nadie descargó archivos en este mes.</p>
              ) : (
                <ul className="space-y-3">
                  {egressTypes.types.map((t) => (
                    <li key={t.key} className="flex flex-col gap-1">
                      <div className="flex items-baseline justify-between gap-3 text-sm tabular-nums">
                        <span className="font-semibold text-gray-900">{FILE_TYPE_INFO[t.key].label}</span>
                        <span className="text-gray-800">{formatBytes(t.bytes)} · {t.bytes > 0 ? pctText(t.share) : '—'}</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-gray-200" aria-hidden="true">
                        <div className="h-full rounded-full bg-amber-600" style={{ width: `${barWidth(t.barPct)}%` }} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-3 text-xs leading-relaxed text-gray-600">
                El video y el audio pesan más por archivo: son los que más egress pueden generar. Si un cliente baja mucho video, conviene hablar de un paquete de espacio o mover ese tipo de archivo a Cloudflare R2.
              </p>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
