'use client';

import { Suspense, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AlertTriangle, Check, CheckCircle2, Copy, Loader2 } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { AdminOnly, ClientBillingNav } from '@/components/billing/ClientBillingNav';
import { ProofUploader } from '@/components/billing/ProofUploader';
import { BTN_PRIMARY, BTN_SECONDARY, Callout, Card, Pill } from '@/components/billing/ui';
import { useBilling } from '@/contexts/BillingContext';
import { useBillingPacks, useBillingUsage, useCreatePayment, useMyPayments } from '@/hooks/useBillingClient';
import type { ChosenMethod, PackRow, PaymentRow } from '@/lib/billing/client-types';
import { LICENSE_LABEL } from '@/lib/billing/catalog';
import { usageNotices } from '@/lib/billing/consumption';
import {
  afterPurchaseText, defaultLicenseMonths, estimateStorageMonths, groupPacks, licenseAvailability, licenseMonthsText, packQuote, packTitle,
  packUnitText, packsAvailability, parseBuyTab, type BuyTab,
} from '@/lib/billing/packs';
import {
  CHOOSABLE_METHODS, LICENSE_PURCHASE_MONTHS, buildPaymentBody, deadlineText, errorText, methodLabel, paymentAmount, pendingLimitReached,
} from '@/lib/billing/payments';
import { usd } from '@/lib/billing/pricing';
import { cn } from '@/lib/utils';

const TABS: Array<{ id: BuyTab; label: string }> = [
  { id: 'IA', label: 'Peticiones de IA' },
  { id: 'ESPACIO', label: 'Espacio' },
  { id: 'LICENCIA', label: 'Licencia' },
];

/** Tarjeta de opción (paquete o duración): un botón de opción real, con foco visible y que no depende solo del color. */
function OptionCard({ name, checked, onChange, children, value }: {
  name: string; checked: boolean; onChange: () => void; children: React.ReactNode; value: string;
}) {
  return (
    <label
      className={cn(
        'relative flex min-h-[5.5rem] cursor-pointer flex-col items-start gap-1.5 rounded-xl border p-4 text-left transition-colors focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[#0F2D4A]',
        checked ? 'border-2 border-blue-600 bg-blue-50/70' : 'border-gray-300 bg-white hover:bg-gray-50',
      )}
    >
      <input type="radio" name={name} value={value} checked={checked} onChange={onChange} className="sr-only" />
      {checked && <Check className="absolute right-3 top-3 h-4 w-4 text-blue-700" aria-hidden="true" />}
      {children}
    </label>
  );
}

function SummaryRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <span className="text-gray-600">{label}</span>
      <strong className="break-words text-right text-gray-900">{value}</strong>
    </div>
  );
}

function CopyReference({ reference }: { reference: string }) {
  const [state, setState] = useState<'idle' | 'ok' | 'fail'>('idle');
  async function copy() {
    try {
      await navigator.clipboard.writeText(reference);
      setState('ok');
    } catch {
      setState('fail');
    }
    setTimeout(() => setState('idle'), 3000);
  }
  return (
    <>
      <button type="button" onClick={() => void copy()} className={BTN_SECONDARY}>
        {state === 'ok' ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
        Copiar referencia
      </button>
      <span role="status" className="text-xs font-medium text-gray-700">
        {state === 'ok' ? 'Referencia copiada.' : state === 'fail' ? 'No se pudo copiar: selecciónala y cópiala a mano.' : ''}
      </span>
    </>
  );
}

/** Lo que se ve cuando el pago ya se creó: referencia, monto, plazo, instrucciones y el siguiente paso (subir el comprobante). */
function CreatedPayment({ payment, onAnother }: { payment: PaymentRow; onAnother: () => void }) {
  const now = useMemo(() => new Date(), []);
  const [proofSent, setProofSent] = useState(false);
  const instructions = (payment.instructions ?? '').trim();
  const deadline = deadlineText(payment.expiresAt, now);

  return (
    <div className="space-y-5">
      <Card title="Realiza el pago">
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-gray-800">
            Paga <strong className="tabular-nums">{paymentAmount(payment)}</strong> por <strong>{methodLabel(payment.method)}</strong> e incluye tu referencia única para que podamos acreditarlo.
          </p>
          <div className="rounded-xl border border-blue-300 bg-blue-50 px-4 py-3">
            <p className="text-xs font-semibold text-blue-950">Tu referencia</p>
            <p className="select-all break-all text-2xl font-bold tracking-wide tabular-nums text-gray-900" data-testid="payment-reference">{payment.reference}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3"><CopyReference reference={payment.reference} /></div>
          <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
            <dt className="text-gray-600">Concepto</dt><dd className="break-words text-gray-900">{payment.concept}</dd>
            <dt className="text-gray-600">Monto</dt><dd className="font-bold tabular-nums text-gray-900">{paymentAmount(payment)}</dd>
            {deadline && (<><dt className="text-gray-600">Plazo</dt><dd className="tabular-nums text-gray-900">{deadline}</dd></>)}
          </dl>
          <div>
            <p className="mb-1.5 text-sm font-semibold text-gray-900">Cómo pagar</p>
            {instructions ? (
              <p className="whitespace-pre-line break-words rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm leading-relaxed text-gray-900">{instructions}</p>
            ) : (
              <Callout tone="warning">
                La plataforma todavía no cargó los datos de pago para este método. Escríbele indicando tu referencia <strong className="tabular-nums">{payment.reference}</strong> y te los envía.
              </Callout>
            )}
          </div>
        </div>
      </Card>

      <Card title="Siguiente paso: sube tu comprobante" subtitle="Un administrador de la plataforma lo revisa y el pago se acredita al aprobarlo. También puedes subirlo después desde «Mis pagos».">
        <ProofUploader payment={payment} onUploaded={() => setProofSent(true)} />
        {proofSent && (
          <p role="status" className="mt-3 flex items-start gap-1.5 text-sm text-gray-800">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-700" aria-hidden="true" />
            Te avisamos por correo cuando se acredite. Mientras tanto puedes seguir trabajando con normalidad.
          </p>
        )}
      </Card>

      <div className="flex flex-wrap gap-3">
        <Link href="/dashboard/billing/pagos" className={BTN_PRIMARY}>Ir a Mis pagos</Link>
        <button type="button" onClick={onAnother} className={BTN_SECONDARY}>Comprar otra cosa</button>
        <Link href="/dashboard/billing" className={BTN_SECONDARY}>Volver a Mi plan</Link>
      </div>
    </div>
  );
}

function BuyInner() {
  const params = useSearchParams();
  const { me, enforcing } = useBilling();
  const packsQ = useBillingPacks();
  const usageQ = useBillingUsage();
  const paymentsQ = useMyPayments();
  const create = useCreatePayment();
  const now = useMemo(() => new Date(), []);

  const [tab, setTab] = useState<BuyTab>(() => parseBuyTab(params?.get('tipo')));
  const [pick, setPick] = useState<{ AI: string | null; STORAGE: string | null }>({ AI: null, STORAGE: null });
  const [monthsPick, setMonthsPick] = useState<number | null>(null);
  const months = monthsPick ?? defaultLicenseMonths(me?.months);
  const [method, setMethod] = useState<ChosenMethod>('QR');
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<PaymentRow | null>(null);

  const grouped = useMemo(() => groupPacks(packsQ.data), [packsQ.data]);
  const license = licenseAvailability(me);
  const kind = tab === 'IA' ? 'AI' : tab === 'ESPACIO' ? 'STORAGE' : null;
  const packs: PackRow[] = kind === 'AI' ? grouped.ai : kind === 'STORAGE' ? grouped.storage : [];
  const availability = kind ? packsAvailability(kind, packs, me?.limits) : null;
  const chosenPack = kind ? packs.find((p) => p.code === pick[kind]) ?? null : null;
  const storageMonths = estimateStorageMonths(me?.endsAt, me?.status, now);
  const quote = chosenPack ? packQuote(chosenPack, storageMonths) : null;
  const limitReached = pendingLimitReached(paymentsQ.data);
  const notice = kind ? usageNotices(usageQ.data, enforcing).find((n) => n.buy === kind) : undefined;

  const body = tab === 'LICENCIA'
    ? (license.canPay && license.planCode ? buildPaymentBody({ kind: 'LICENSE', planCode: license.planCode, months, method }) : null)
    : (chosenPack ? buildPaymentBody({ kind: 'PACK', packCode: chosenPack.code, method }) : null);
  const canSubmit = body !== null && !limitReached && !create.isPending;

  async function submit() {
    if (!body) return;
    setError(null);
    try {
      setCreated(await create.mutateAsync(body));
    } catch (err) {
      setError(errorText(err, 'No se pudo generar la referencia de pago.'));
    }
  }

  function reset() {
    setCreated(null);
    setError(null);
    setPick({ AI: null, STORAGE: null });
  }

  const summaryName = tab === 'LICENCIA'
    ? (license.canPay ? `Licencia ${license.planName ?? ''} · ${licenseMonthsText(months)}` : '—')
    : chosenPack ? `${packTitle(chosenPack)}${chosenPack.kind === 'AI' ? ' de IA' : ' de espacio'}` : 'Elige un paquete';
  const billing = tab === 'LICENCIA'
    ? 'Pago único por la duración elegida'
    : quote ? quote.billing : '—';
  const totalText = tab === 'LICENCIA'
    ? 'Se muestra al generar la referencia'
    : quote?.total != null ? `${chosenPack?.kind === 'STORAGE' ? '≈ ' : ''}${usd(quote.total)}` : chosenPack ? 'Se confirma al generar la referencia' : '—';

  if (created) return <CreatedPayment payment={created} onAnother={reset} />;

  return (
    <div className="space-y-5">
      {notice && (
        <Callout tone={notice.level === 'critical' ? 'critical' : 'warning'} title={notice.title}>
          {notice.text}
        </Callout>
      )}

      {limitReached && (
        <Callout tone="warning" title="Ya tienes 5 pagos pendientes">
          Espera a que aprueben alguno o cancela los que no vas a pagar en <Link href="/dashboard/billing/pagos" className="font-semibold underline underline-offset-2">Mis pagos</Link> antes de pedir otro.
        </Callout>
      )}

      <div role="group" aria-label="Qué quieres comprar" className="flex flex-wrap gap-1.5">
        {TABS.map((t) => {
          const on = tab === t.id;
          return (
            <button
              key={t.id} type="button" aria-pressed={on} onClick={() => { setTab(t.id); setError(null); }}
              className={cn(
                'rounded-full border px-4 py-2 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0F2D4A]',
                on ? 'border-[#0F2D4A] bg-[#0F2D4A] font-semibold text-white' : 'border-gray-300 bg-white text-gray-800 hover:bg-gray-50',
              )}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-start gap-6">
        <div className="min-w-0 flex-[999_1_32rem] space-y-5">
          {/* 1 · Qué */}
          <Card title={tab === 'LICENCIA' ? '1 · Duración de la licencia' : '1 · Elige un paquete'}>
            {tab === 'LICENCIA' ? (
              license.canPay ? (
                <fieldset className="space-y-3">
                  <legend className="mb-1 text-sm leading-relaxed text-gray-700">
                    Pagar o renovar tu plan <strong>{license.planName}</strong>. Si tu licencia sigue vigente, la renovación se suma al tiempo que te queda.
                  </legend>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {LICENSE_PURCHASE_MONTHS.map((m) => (
                      <OptionCard key={m} name="duracion" value={String(m)} checked={months === m} onChange={() => setMonthsPick(m)}>
                        <span className="text-lg font-bold text-gray-900">{LICENSE_LABEL[m]}</span>
                        <span className="text-xs text-gray-600">{m} {m === 1 ? 'mes' : 'meses'}</span>
                      </OptionCard>
                    ))}
                  </div>
                  <p className="text-xs leading-relaxed text-gray-600">
                    El monto lo fija el precio de tu plan para esa duración (o el precio pactado con la plataforma) y se muestra al generar la referencia.
                  </p>
                </fieldset>
              ) : (
                <Callout tone="info">{license.reason}</Callout>
              )
            ) : packsQ.isLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-gray-400" aria-label="Cargando paquetes" /></div>
            ) : packsQ.isError ? (
              <div className="flex flex-col items-start gap-2">
                <p className="flex items-start gap-2 text-sm text-gray-800"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />No se pudieron leer los paquetes en este momento.</p>
                <button type="button" onClick={() => void packsQ.refetch()} className={BTN_SECONDARY}>Reintentar</button>
              </div>
            ) : availability && availability.state !== 'OK' ? (
              <Callout tone="info" title={availability.state === 'PLAN_NO_ADMITE' ? 'Tu plan no admite este tipo de paquete' : 'Sin paquetes por ahora'}>{availability.message}</Callout>
            ) : (
              <fieldset className="space-y-3">
                <legend className="mb-1 text-sm leading-relaxed text-gray-700">
                  {kind === 'AI'
                    ? 'Las peticiones compradas se consumen después de las incluidas en tu plan y no vencen por mes. Una petición es un mensaje a un asistente; analizar un documento largo cuenta 5, y audio o video, 10 por cada 10 minutos.'
                    : 'El espacio extra se suma mientras tu licencia esté vigente y se cobra por mes hasta el vencimiento. Si dejas de pagarlo, tus archivos no se borran: solo se bloquea subir más.'}
                </legend>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {packs.map((p) => (
                    <OptionCard key={p.code} name={`paquete-${kind}`} value={p.code} checked={pick[kind!] === p.code} onChange={() => setPick((s) => ({ ...s, [kind!]: p.code }))}>
                      <span className="text-xl font-bold text-gray-900">{packTitle(p)}</span>
                      <span className="text-2xl font-bold tabular-nums text-gray-900">
                        {usd(p.priceUsd)}<span className="ml-1 text-xs font-medium text-gray-600">{p.kind === 'STORAGE' ? 'al mes' : 'pago único'}</span>
                      </span>
                      <span className="text-xs tabular-nums text-gray-600">{packUnitText(p)}</span>
                    </OptionCard>
                  ))}
                </div>
              </fieldset>
            )}
          </Card>

          {/* 2 · Forma de pago */}
          <Card title="2 · Forma de pago">
            <fieldset className="space-y-2.5">
              <legend className="sr-only">Forma de pago</legend>
              {CHOOSABLE_METHODS.map((m) => (
                <label
                  key={m.value}
                  className={cn(
                    'flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 transition-colors focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[#0F2D4A]',
                    method === m.value ? 'border-2 border-blue-600 bg-blue-50/70' : 'border-gray-300 bg-white hover:bg-gray-50',
                  )}
                >
                  <input type="radio" name="metodo" value={m.value} checked={method === m.value} onChange={() => setMethod(m.value)} className="mt-1 h-4 w-4 shrink-0 accent-blue-700" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-gray-900">{m.label}</span>
                    <span className="block text-sm text-gray-700">{m.description}</span>
                  </span>
                </label>
              ))}
              <div className="flex items-start gap-3 rounded-xl border border-dashed border-gray-400 bg-gray-100 px-4 py-3" aria-disabled="true">
                <span className="mt-1 h-4 w-4 shrink-0 rounded-full border border-gray-400 bg-white" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-gray-800">Tarjeta o pago en línea</span>
                  <span className="block text-sm text-gray-700">Se acreditará al instante cuando esté disponible.</span>
                </span>
                <Pill tone="gray">Próximamente</Pill>
              </div>
            </fieldset>
          </Card>
        </div>

        {/* Resumen */}
        <aside aria-label="Resumen de la compra" className="min-w-[18rem] max-w-full flex-[1_1_20rem] space-y-3 rounded-xl border border-gray-200 bg-white p-5 sm:p-6 lg:max-w-sm">
          <h2 className="text-base font-semibold text-gray-900">Resumen</h2>
          <SummaryRow label={tab === 'LICENCIA' ? 'Licencia' : 'Paquete'} value={summaryName} />
          <SummaryRow label="Cobro" value={billing} />
          <SummaryRow label="Forma de pago" value={methodLabel(method)} />
          <div className="space-y-1 border-t border-gray-200 pt-3">
            <div className="flex items-start justify-between gap-3">
              <span className="text-base font-semibold text-gray-900">Total</span>
              <span className="break-words text-right text-lg font-bold tabular-nums text-gray-900">{totalText}</span>
            </div>
            {tab === 'ESPACIO' && quote && storageMonths !== null && (
              <p className="text-xs leading-relaxed text-gray-600">Estimado con tu vencimiento actual. El monto exacto se confirma al generar la referencia.</p>
            )}
            <p className="text-xs text-gray-600">Montos en USD.</p>
          </div>
          {chosenPack && (
            <div className="rounded-lg border border-green-300 bg-green-50 px-3 py-2.5 text-sm leading-relaxed text-green-950">
              <strong>Después de comprar:</strong> {afterPurchaseText(chosenPack, usageQ.data)}
            </div>
          )}
          {error && <Callout tone="critical">{error}</Callout>}
          <button type="button" onClick={() => void submit()} disabled={!canSubmit} className={cn(BTN_PRIMARY, 'w-full')}>
            {create.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {create.isPending ? 'Generando…' : 'Generar referencia de pago'}
          </button>
          {!body && !create.isPending && (
            <p className="text-xs text-gray-600">
              {tab === 'LICENCIA' ? (license.canPay ? '' : 'No se puede pagar la licencia desde aquí.') : 'Elige un paquete para continuar.'}
            </p>
          )}
          <p className="text-xs leading-relaxed text-gray-600">Generar la referencia no te cobra nada: es la solicitud de pago. Puedes cancelarla desde «Mis pagos».</p>
        </aside>
      </div>
    </div>
  );
}

export default function BuyMorePage() {
  return (
    <div className="flex h-full flex-col">
      <Header title="Comprar más" />
      <div className="mx-auto w-full max-w-6xl flex-1 space-y-5 overflow-y-auto px-4 py-6 sm:px-6">
        <div>
          <p className="text-sm text-gray-600">Administración › Mi plan › Comprar más</p>
          <h1 className="text-2xl font-bold text-gray-900">Comprar más</h1>
        </div>
        <ClientBillingNav />
        <AdminOnly>
          <Suspense fallback={<div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-gray-400" aria-label="Cargando" /></div>}>
            <BuyInner />
          </Suspense>
        </AdminOnly>
      </div>
    </div>
  );
}
