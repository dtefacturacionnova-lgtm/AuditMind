'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Loader2, Save, ShieldAlert } from 'lucide-react';
import { BTN_DANGER, BTN_PRIMARY, BTN_SECONDARY, Callout, Card, Field, INPUT_CLS, Modal, Pill, QueryError } from '@/components/billing/ui';
import { useAllOrganizations, useBillingSettings, usePlans, useSubscriptions, useUpdateBillingSettings } from '@/hooks/useBillingAdmin';
import type { EnforcementMode } from '@/lib/billing/access';
import {
  MODE_INFO, MODE_ORDER, needsStrongConfirmation, settingsPatch, settingsToForm, validateSettings,
  type SettingsFormState,
} from '@/lib/billing/settings-form';
import { enforcementImpact } from '@/lib/billing/subscription-tools';
import { cn } from '@/lib/utils';

const MODE_TONE: Record<EnforcementMode, 'gray' | 'amber' | 'red'> = { OFF: 'gray', OBSERVE: 'amber', ENFORCE: 'red' };

export default function BillingSettingsPage() {
  const settingsQ = useBillingSettings();
  const plansQ = usePlans();
  const subsQ = useSubscriptions();
  const orgsQ = useAllOrganizations();
  const update = useUpdateBillingSettings();

  const current = settingsQ.data;
  const [form, setForm] = useState<SettingsFormState | null>(null);
  const [target, setTarget] = useState<EnforcementMode | null>(null);
  const [confirmMode, setConfirmMode] = useState<EnforcementMode | null>(null);
  const [understood, setUnderstood] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [toast, setToast] = useState<{ kind: 'ok' | 'warn'; msg: string } | null>(null);

  useEffect(() => {
    if (current && !form) setForm(settingsToForm(current));
  }, [current, form]);

  const errors = useMemo(() => (form ? validateSettings(form) : {}), [form]);
  const patch = useMemo(() => (form && current ? settingsPatch(form, current) : {}), [form, current]);
  const changed = Object.keys(patch).length > 0;
  const impact = useMemo(() => enforcementImpact(subsQ.data ?? []), [subsQ.data]);
  const orgsWithoutPlan = Math.max(0, (orgsQ.data?.length ?? 0) - (subsQ.data?.length ?? 0));

  if (settingsQ.isError) {
    return <div className="rounded-xl border border-gray-200 bg-white"><QueryError error={settingsQ.error} what="los parámetros" onRetry={() => void settingsQ.refetch()} /></div>;
  }
  if (!current || !form) {
    return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-gray-400" aria-label="Cargando" /></div>;
  }

  const mode = current.enforcementMode;
  const selected = target ?? mode;
  const set = (p: Partial<SettingsFormState>) => setForm((f) => (f ? { ...f, ...p } : f));
  const err = (k: keyof SettingsFormState) => (showErrors ? errors[k] : undefined);
  const planOptions = (plansQ.data ?? []).filter((p) => p.active || p.code === current.defaultPlanCode);

  async function saveParams(e: React.FormEvent) {
    e.preventDefault();
    setShowErrors(true);
    if (Object.keys(errors).length > 0 || !changed) return;
    try {
      const saved = await update.mutateAsync(patch);
      setForm(settingsToForm(saved));
      setShowErrors(false);
      setToast({ kind: 'ok', msg: 'Parámetros guardados.' });
    } catch (ex) {
      setToast({ kind: 'warn', msg: (ex as Error).message || 'No se pudieron guardar los parámetros.' });
    }
  }

  async function applyMode() {
    if (!confirmMode) return;
    try {
      await update.mutateAsync({ enforcementMode: confirmMode });
      setToast({ kind: 'ok', msg: `Cumplimiento en modo «${MODE_INFO[confirmMode].label}».` });
      setTarget(null);
    } catch (ex) {
      setToast({ kind: 'warn', msg: (ex as Error).message || 'No se pudo cambiar el modo.' });
    } finally {
      setConfirmMode(null);
      setUnderstood(false);
    }
  }

  const strong = confirmMode ? needsStrongConfirmation(mode, confirmMode) : false;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Parámetros</h1>
        <p className="mt-0.5 text-sm text-gray-600">Interruptor de cumplimiento y parámetros de la plataforma. Aplican a todas las organizaciones.</p>
      </div>

      {toast && (
        <Callout tone={toast.kind === 'ok' ? 'success' : 'critical'}>{toast.msg}</Callout>
      )}

      {/* Interruptor */}
      <Card
        title="Interruptor de cumplimiento"
        subtitle="Decide si el plan de cada organización se hace cumplir. Empieza apagado: encenderlo es un paso deliberado, de a poco (apagado → observar → aplicar)."
        action={<span className="flex items-center gap-2 text-sm text-gray-700">Ahora: <Pill tone={MODE_TONE[mode]}>{MODE_INFO[mode].label}</Pill></span>}
      >
        <fieldset>
          <legend className="sr-only">Modo de cumplimiento</legend>
          <div className="grid gap-3 lg:grid-cols-3">
            {MODE_ORDER.map((m) => {
              const on = selected === m;
              return (
                <label
                  key={m}
                  className={cn(
                    'flex cursor-pointer flex-col gap-1.5 rounded-xl border p-4 transition-colors focus-within:outline focus-within:outline-2 focus-within:outline-[#0F2D4A]',
                    on ? (m === 'ENFORCE' ? 'border-red-400 bg-red-50' : 'border-[#0F2D4A] bg-blue-50/60') : 'border-gray-200 bg-white hover:bg-gray-50',
                  )}
                >
                  <span className="flex items-center gap-2">
                    <input type="radio" name="enforcement-mode" value={m} checked={on} onChange={() => setTarget(m)} className="h-4 w-4 border-gray-400 text-[#0F2D4A] focus:ring-2 focus:ring-[#0F2D4A]/40" />
                    <span className="text-sm font-bold text-gray-900">{MODE_INFO[m].label}</span>
                    <span className="text-xs text-gray-600">· {MODE_INFO[m].short}</span>
                    {m === mode && <Pill tone="blue">Actual</Pill>}
                  </span>
                  <span className="text-xs leading-relaxed text-gray-800"><strong>Servidor:</strong> {MODE_INFO[m].server}</span>
                  <span className="text-xs leading-relaxed text-gray-800"><strong>Clientes:</strong> {MODE_INFO[m].clients}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-2xl text-xs leading-relaxed text-gray-600">
            Siempre quedan exentos de bloqueo: el SUPER_ADMIN, las organizaciones marcadas como exentas (Piloto, Interno) y las que todavía no tienen suscripción.
            Si la plataforma no puede leer el plan, deja trabajar (falla abierta) y lo registra.
          </p>
          <button type="button" disabled={selected === mode || update.isPending} onClick={() => { setUnderstood(false); setConfirmMode(selected); }} className={selected === 'ENFORCE' ? BTN_DANGER : BTN_PRIMARY}>
            Cambiar a «{MODE_INFO[selected].label}»
          </button>
        </div>
      </Card>

      {/* Parámetros */}
      <form onSubmit={saveParams} noValidate>
        <Card title="Parámetros de la plataforma" subtitle="Vigencia después de vencer, costo de la IA y plan por defecto.">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Días de gracia" htmlFor="p-grace" help="Después de vencer la licencia, la cuenta sigue trabajando con avisos. De 0 a 90." error={err('graceDays')}>
              <input id="p-grace" type="text" inputMode="numeric" value={form.graceDays} onChange={(e) => set({ graceDays: e.target.value })} aria-invalid={!!err('graceDays')} className={cn(INPUT_CLS, 'max-w-[10rem] tabular-nums')} />
            </Field>
            <Field label="Días de solo lectura" htmlFor="p-ro" help="Después de la gracia, solo se puede consultar y exportar; pasado este plazo la cuenta se suspende. Nunca se borra nada. De 0 a 365." error={err('readOnlyDays')}>
              <input id="p-ro" type="text" inputMode="numeric" value={form.readOnlyDays} onChange={(e) => set({ readOnlyDays: e.target.value })} aria-invalid={!!err('readOnlyDays')} className={cn(INPUT_CLS, 'max-w-[10rem] tabular-nums')} />
            </Field>
            <Field label="Costo por petición de IA (USD)" htmlFor="p-cost" help="Costo medido de una petición de peso 1. Con él el editor de planes convierte peticiones en dinero. Hasta 6 decimales." error={err('costPerRequestUsd')}>
              <input id="p-cost" type="text" inputMode="decimal" value={form.costPerRequestUsd} onChange={(e) => set({ costPerRequestUsd: e.target.value })} aria-invalid={!!err('costPerRequestUsd')} className={cn(INPUT_CLS, 'max-w-[10rem] tabular-nums')} />
            </Field>
            <Field label="Multiplicador del tope de seguridad" htmlFor="p-mult" help="Si el gasto real de IA del mes supera el costo esperado multiplicado por este número, la IA se pausa. De 1 a 20." error={err('safetyMultiplier')}>
              <input id="p-mult" type="text" inputMode="decimal" value={form.safetyMultiplier} onChange={(e) => set({ safetyMultiplier: e.target.value })} aria-invalid={!!err('safetyMultiplier')} className={cn(INPUT_CLS, 'max-w-[10rem] tabular-nums')} />
            </Field>
            <Field label="Plan por defecto" htmlFor="p-plan" help="El plan que recibe una organización nueva cuando no se indica otro." error={err('defaultPlanCode')}>
              <select id="p-plan" value={form.defaultPlanCode} onChange={(e) => set({ defaultPlanCode: e.target.value })} className={INPUT_CLS}>
                {!planOptions.some((p) => p.code === form.defaultPlanCode) && <option value={form.defaultPlanCode}>{form.defaultPlanCode}</option>}
                {planOptions.map((p) => <option key={p.id} value={p.code}>{p.name}{p.active ? '' : ' (inactivo)'}</option>)}
              </select>
            </Field>
          </div>
          <div className="mt-5 flex justify-end">
            <button type="submit" disabled={!changed || update.isPending} className={BTN_PRIMARY}>
              {update.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
              Guardar parámetros
            </button>
          </div>
        </Card>
      </form>

      {confirmMode && (
        <Modal
          size="lg"
          title={strong ? 'Aplicar el cumplimiento de los planes' : `Cambiar el cumplimiento a «${MODE_INFO[confirmMode].label}»`}
          subtitle={MODE_INFO[confirmMode].server}
          onClose={() => { setConfirmMode(null); setUnderstood(false); }}
        >
          <div className="space-y-3 text-sm text-gray-800">
            <p><strong>Para los clientes:</strong> {MODE_INFO[confirmMode].clients}</p>
            {confirmMode !== 'OFF' && (
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                <p className="mb-1 font-semibold text-gray-900">Qué pasaría hoy con las {impact.total} organizaciones con suscripción</p>
                {subsQ.isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin text-gray-400" aria-label="Calculando" />
                ) : (
                  <ul className="list-disc space-y-1 pl-5">
                    <li>{impact.exempt} exenta{impact.exempt === 1 ? '' : 's'}: no se verían afectadas.</li>
                    <li>{impact.inForce} con licencia o prueba vigente: seguirían trabajando; verían candados en los módulos que su plan no incluye.</li>
                    <li>{impact.inGrace} en periodo de gracia: seguirían escribiendo, con avisos.</li>
                    <li className={impact.readOnlyOrBlocked.length > 0 ? 'font-semibold text-red-800' : ''}>
                      {impact.readOnlyOrBlocked.length} en solo lectura, suspendidas o canceladas
                      {confirmMode === 'ENFORCE' ? ': quedarían en solo lectura desde este momento' : ''}
                      {impact.readOnlyOrBlocked.length > 0 && ` (${impact.readOnlyOrBlocked.slice(0, 6).map((r) => r.organizationName).join(', ')}${impact.readOnlyOrBlocked.length > 6 ? '…' : ''})`}.
                    </li>
                    {orgsWithoutPlan > 0 && <li>{orgsWithoutPlan} organización{orgsWithoutPlan === 1 ? '' : 'es'} sin suscripción: se les deja pasar sin restricciones.</li>}
                  </ul>
                )}
              </div>
            )}
            {strong && (
              <Callout tone="critical" title="Esto bloquea de verdad">
                En cuanto lo confirmes, el servidor rechaza las acciones que el plan no permite a todo cliente no exento. Puedes volver a «Observar» o «Apagado» en cualquier momento; no se borra nada.
              </Callout>
            )}
            {strong && (
              <label className="flex cursor-pointer items-start gap-2.5">
                <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-gray-400 text-red-700 focus:ring-2 focus:ring-red-600/40" />
                <span className="font-semibold">Entiendo que esto bloquea de verdad a los clientes que no estén exentos.</span>
              </label>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <button type="button" onClick={() => { setConfirmMode(null); setUnderstood(false); }} className={BTN_SECONDARY}>Cancelar</button>
            <button type="button" onClick={() => void applyMode()} disabled={update.isPending || (strong && !understood)} className={strong ? BTN_DANGER : BTN_PRIMARY}>
              {update.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : strong ? <ShieldAlert className="h-4 w-4" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
              {strong ? 'Aplicar cumplimiento' : `Cambiar a «${MODE_INFO[confirmMode].label}»`}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
