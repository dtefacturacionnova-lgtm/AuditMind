'use client';

import Link from 'next/link';
import { AlertCircle, Check, Loader2, Lock } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { ClientBillingNav } from '@/components/billing/ClientBillingNav';
import { UsageDetails, UsageMeters } from '@/components/billing/UsagePanel';
import { BTN_PRIMARY, BTN_SECONDARY, Callout, Card, Meter, Pill, StatusPill } from '@/components/billing/ui';
import { useBilling } from '@/contexts/BillingContext';
import { useBillingUsage } from '@/hooks/useBillingClient';
import { useUser } from '@/hooks/useUser';
import { fileSizeText, limitText, type BillingMe } from '@/lib/billing/access';
import {
  ASSISTANT_INFO, ASSISTANT_KEYS, AUDIENCE_LABEL, FILE_TYPE_INFO, FILE_TYPE_KEYS, FUNCTION_INFO, FUNCTION_KEYS, LICENSE_LABEL,
  MODULE_INFO, MODULE_KEYS, isFileTypeKey,
} from '@/lib/billing/catalog';
import { lockedHref } from '@/lib/billing/menu';
import { canManageBilling } from '@/lib/billing/payments';
import { daysUntil, shortDate } from '@/lib/billing/subscription-tools';

/** Vigencia en una frase: «Vigente hasta 14-12-2026 · quedan 23 días». */
function validityText(me: BillingMe): string {
  const end = shortDate(me.endsAt);
  const days = me.daysLeft ?? daysUntil(me.endsAt, new Date());
  const left = days === null ? '' : days >= 0 ? ` · quedan ${days} ${days === 1 ? 'día' : 'días'}` : ` · hace ${Math.abs(days)} ${Math.abs(days) === 1 ? 'día' : 'días'}`;
  switch (me.status) {
    case 'TRIAL': return end ? `Prueba hasta el ${end}${left}` : 'Prueba sin fecha de fin';
    case 'ACTIVE': return end ? `Vigente hasta el ${end}${left}` : 'Licencia sin vencimiento';
    case 'GRACE': return `Venció el ${end}${left}${me.graceEndsAt ? ` · periodo de gracia hasta el ${shortDate(me.graceEndsAt)}` : ''}`;
    case 'READ_ONLY': return `Venció el ${end}${left}`;
    case 'SUSPENDED':
    case 'CANCELLED': return end ? `Corte el ${end}` : 'Cuenta suspendida';
    default: return end ? `Hasta el ${end}` : '';
  }
}

function LimitRow({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
      <span className="text-xs font-medium text-gray-600">{label}</span>
      <span className="text-lg font-bold tabular-nums text-gray-900">{value}</span>
      {note && <span className="text-xs text-gray-600">{note}</span>}
    </div>
  );
}

export default function MyPlanPage() {
  const { me, isLoading, isError, planActive, enforcing, refresh } = useBilling();
  const { user, loading: userLoading } = useUser();
  // Comprar, pagar y ver los pagos exige ser ADMIN de la organización (el API responde 403 a los demás).
  const canBuy = canManageBilling(user?.role);
  const usageQ = useBillingUsage();

  return (
    <div className="flex h-full flex-col">
      <Header title="Mi plan" />
      <div className="mx-auto w-full max-w-6xl flex-1 space-y-5 overflow-y-auto px-4 py-6 sm:px-6">
        <div>
          <p className="text-sm text-gray-600">Administración › Mi plan</p>
          <h1 className="text-2xl font-bold text-gray-900">Mi plan</h1>
        </div>
        {canBuy && <ClientBillingNav />}

        {isLoading ? (
          <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-gray-400" aria-label="Cargando" /></div>
        ) : isError || !me ? (
          <Card>
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <AlertCircle className="h-8 w-8 text-amber-500" aria-hidden="true" />
              <p className="text-sm font-semibold text-gray-800">No se pudo leer tu plan en este momento</p>
              <p className="max-w-md text-xs text-gray-600">No pasa nada con tu trabajo: mientras tanto todos los módulos siguen disponibles.</p>
              <button type="button" onClick={() => void refresh()} className={BTN_SECONDARY}>Reintentar</button>
            </div>
          </Card>
        ) : !me.hasSubscription ? (
          <Callout tone="info" title="Tu organización todavía no tiene un plan asignado">
            Mientras tanto, todos los módulos están disponibles. Cuando la plataforma te asigne un plan, aquí verás su vigencia, tus límites y
            los módulos incluidos.
          </Callout>
        ) : (
          <>
            {me.exempt ? (
              <Callout tone="info">Tu organización tiene un plan sin restricciones: no se bloquea ningún módulo ni vence.</Callout>
            ) : me.enforcementMode === 'OFF' ? (
              <Callout tone="info">
                Por ahora los límites de tu plan se muestran como referencia: todavía no se aplican y todos los módulos están disponibles.
              </Callout>
            ) : !enforcing ? (
              <Callout tone="info">
                La plataforma está en modo observación: se registra qué se bloquearía con tu plan, pero todavía no se bloquea nada.
              </Callout>
            ) : null}

            {/* Plan y vigencia */}
            <Card>
              <div className="flex flex-wrap items-center justify-between gap-5">
                <div className="flex min-w-[16rem] flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-2xl font-bold text-gray-900">{me.plan?.name ?? 'Sin plan'}</span>
                    <StatusPill status={me.status} />
                    {me.plan && <Pill tone="gray">{AUDIENCE_LABEL[me.plan.audience] ?? 'Plan'}</Pill>}
                    {me.exempt && <Pill tone="blue">Sin restricciones</Pill>}
                  </div>
                  <p className="text-sm text-gray-800">
                    {me.status === 'TRIAL' ? 'Periodo de prueba' : `Licencia ${(LICENSE_LABEL[me.months] ?? '').toLowerCase()}`.trim()}
                    {me.limits && (
                      <> · incluye {limitText(me.limits.users)} {me.limits.users === 1 ? 'usuario' : 'usuarios'}, {limitText(me.limits.storageGb, 'GB')} de espacio y {limitText(me.limits.aiRequests)} peticiones de IA al mes</>
                    )}
                  </p>
                  <p className="text-sm tabular-nums text-gray-800">{validityText(me)}</p>
                </div>
                {canBuy ? (
                  <div className="flex max-w-sm flex-col items-start gap-2">
                    <div className="flex flex-wrap gap-2">
                      <Link href="/dashboard/billing/comprar" className={BTN_PRIMARY}>Comprar más</Link>
                      <Link href="/dashboard/billing/pagos" className={BTN_SECONDARY}>Mis pagos</Link>
                    </div>
                    <p className="text-xs leading-relaxed text-gray-600">
                      Compra peticiones de IA o espacio, o paga o renueva tu licencia con una referencia de pago. Para cambiar de plan, contacta a la plataforma.
                    </p>
                  </div>
                ) : userLoading ? null : (
                  <p className="max-w-xs text-xs leading-relaxed text-gray-600">
                    Para renovar, comprar más peticiones de IA o espacio, o cambiar de plan, pídeselo a un administrador de tu organización.
                  </p>
                )}
              </div>
              {planActive && me.notice && (
                <div className="mt-4">
                  <Callout tone={me.notice.level === 'critical' ? 'critical' : me.notice.level === 'info' ? 'info' : 'warning'}>{me.notice.message}</Callout>
                </div>
              )}
            </Card>

            {/* Uso y límites */}
            <Card
              title="Uso de tu plan"
              subtitle="Tus usuarios, las peticiones de IA de este mes y el espacio que ocupan tus archivos."
            >
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                <Meter
                  label="Usuarios activos"
                  value={`${me.seats.used} de ${me.seats.allowed === null ? 'sin tope' : me.seats.allowed}`}
                  pct={me.seats.allowed === null || me.seats.allowed <= 0 ? null : (me.seats.used / me.seats.allowed) * 100}
                  note={me.limits && me.limits.maxUsers > (me.limits.users ?? 0)
                    ? `Incluye ${limitText(me.limits.users)} y admite hasta ${limitText(me.limits.maxUsers)} con usuarios extra. Los invitados del portal y los usuarios de solo lectura no cuentan.`
                    : 'Los invitados del portal y los usuarios de solo lectura no cuentan.'}
                />
                <UsageMeters q={usageQ} canBuy={canBuy} limits={me.limits} />
              </div>
              {me.limits && (
                <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <LimitRow label="Espacio incluido" value={limitText(me.limits.storageGb, 'GB')} note="Compartido por evidencia, papeles, portal y firmas" />
                  <LimitRow label="Archivo máximo" value={fileSizeText(me.limits.maxFileMb)} />
                  <LimitRow label="Peticiones de IA al mes" value={limitText(me.limits.aiRequests)} note="Un mensaje a un asistente es 1; un documento largo, 5; audio o video, 10 por cada 10 minutos" />
                  <LimitRow label="Usuarios incluidos" value={limitText(me.limits.users)} />
                </div>
              )}
              {me.limits && Array.isArray(me.limits.fileTypes) && (
                <div className="mt-5">
                  <p className="mb-2 text-sm font-semibold text-gray-900">Tipos de archivo que puedes subir</p>
                  <ul className="flex flex-wrap gap-2">
                    {FILE_TYPE_KEYS.map((k) => {
                      const ok = me.limits!.fileTypes.filter(isFileTypeKey).includes(k);
                      return (
                        <li key={k} title={FILE_TYPE_INFO[k].note}>
                          <span className={ok
                            ? 'inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-900'
                            : 'inline-flex items-center gap-1 rounded-full border border-dashed border-gray-400 bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-700'}>
                            {ok ? <Check className="h-3 w-3" aria-hidden="true" /> : <Lock className="h-3 w-3" aria-hidden="true" />}
                            {FILE_TYPE_INFO[k].label}
                            <span className="sr-only">{ok ? ' (permitido)' : ' (no permitido)'}</span>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </Card>

            <UsageDetails q={usageQ} canBuy={canBuy} enforcing={enforcing} limits={me.limits} />

            {/* Módulos */}
            <div className="grid gap-5 lg:grid-cols-2">
              <Card title="Incluido en tu plan">
                <ul className="space-y-2.5">
                  <li className="flex items-start gap-2.5 text-sm text-gray-900">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" aria-hidden="true" />
                    <span>Núcleo: dashboard, proyectos, papeles y hallazgos</span>
                  </li>
                  {MODULE_KEYS.filter((k) => me.modules.includes(k)).map((k) => (
                    <li key={k} className="flex items-start gap-2.5 text-sm text-gray-900">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" aria-hidden="true" />
                      <span>{MODULE_INFO[k].label}</span>
                    </li>
                  ))}
                  {FUNCTION_KEYS.filter((k) => me.functions.includes(k)).map((k) => (
                    <li key={k} className="flex items-start gap-2.5 text-sm text-gray-900">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" aria-hidden="true" />
                      <span>{FUNCTION_INFO[k].label}</span>
                    </li>
                  ))}
                  <li className="flex items-start gap-2.5 text-sm text-gray-900">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" aria-hidden="true" />
                    <span>Asistentes de IA: {ASSISTANT_KEYS.filter((a) => me.assistants.includes(a)).length} de {ASSISTANT_KEYS.length}</span>
                  </li>
                </ul>
              </Card>

              <Card title="No incluido" subtitle="Puedes pedir ampliarlo al administrador de la plataforma.">
                {(() => {
                  const lockedModules = MODULE_KEYS.filter((k) => !me.modules.includes(k));
                  const lockedFunctions = FUNCTION_KEYS.filter((k) => !me.functions.includes(k));
                  if (lockedModules.length === 0 && lockedFunctions.length === 0) {
                    return <p className="text-sm text-gray-700">Tu plan incluye todos los módulos y funciones.</p>;
                  }
                  return (
                    <ul className="space-y-2.5">
                      {lockedModules.map((k) => (
                        <li key={k} className="flex items-start gap-2.5 text-sm text-gray-800">
                          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-gray-600" aria-hidden="true" />
                          <Link href={lockedHref(k)} className="underline-offset-2 hover:underline">{MODULE_INFO[k].label}</Link>
                        </li>
                      ))}
                      {lockedFunctions.map((k) => (
                        <li key={k} className="flex items-start gap-2.5 text-sm text-gray-800">
                          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-gray-600" aria-hidden="true" />
                          <Link href={lockedHref(k)} className="underline-offset-2 hover:underline">{FUNCTION_INFO[k].label}</Link>
                        </li>
                      ))}
                    </ul>
                  );
                })()}
              </Card>
            </div>

            <Card title="Asistentes de IA" subtitle="Los que tu plan no incluye aparecen con candado.">
              <ul className="flex flex-wrap gap-2">
                {ASSISTANT_KEYS.map((a) => {
                  const ok = me.assistants.includes(a);
                  return (
                    <li key={a} title={ASSISTANT_INFO[a]}>
                      <span className={ok
                        ? 'inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-900'
                        : 'inline-flex items-center gap-1 rounded-full border border-dashed border-gray-400 bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-700'}>
                        {!ok && <Lock className="h-3 w-3" aria-hidden="true" />}
                        {a}
                        <span className="sr-only">{ok ? ' (incluido)' : ' (no incluido)'}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </Card>

            <p className="text-xs text-gray-600">
              Los pagos se hacen por transferencia, QR o efectivo con una referencia única y los aprueba un administrador de la plataforma. Si la licencia vence, la cuenta pasa a solo lectura (puedes consultar y exportar todo) y no se borra nada.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
