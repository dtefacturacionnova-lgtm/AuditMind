'use client';

import { useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  BTN_DANGER, BTN_PRIMARY, BTN_SECONDARY, Callout, CheckRow, Field, INPUT_CLS, Modal, StatusPill,
} from '@/components/billing/ui';
import {
  useAssignPlan, useExtendTrial, useRenewSubscription, useUpdateSubscription, type SubscriptionPatchBody,
} from '@/hooks/useBillingAdmin';
import type { OrganizationLite, PlanRow, SubscriptionOverrides, SubscriptionRow } from '@/lib/billing/admin-types';
import {
  ASSISTANT_INFO, ASSISTANT_KEYS, FUNCTION_INFO, FUNCTION_KEYS, LICENSE_LABEL, LICENSE_MONTHS, MODULE_INFO, MODULE_KEYS,
} from '@/lib/billing/catalog';
import { parseMoney, parseWhole, EXEMPT_PLAN_CODES } from '@/lib/billing/plan-form';
import { toNumber, usd } from '@/lib/billing/pricing';
import {
  countOverrides, hasLimitOverrides, overrideChoice, reactivationRisk, renewalEnd, setOverrideChoice, shortDate, trialExtensionEnd,
  type OverrideChoice, type OverrideKind,
} from '@/lib/billing/subscription-tools';

type Notify = (kind: 'ok' | 'warn', msg: string) => void;

const errMsg = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

function Actions({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap justify-end gap-2 pt-4">{children}</div>;
}

// ── Asignar o cambiar plan ──

/** Duraciones que se pueden elegir para un plan: las que tienen precio activo, y «sin vencimiento» para Piloto/Interno. */
function durationOptions(plan: PlanRow | undefined): Array<{ months: number; price: number | null }> {
  if (!plan) return [];
  const out = LICENSE_MONTHS.flatMap((m) => {
    const p = (plan.prices ?? []).find((x) => x.months === m && x.active !== false);
    return p ? [{ months: m, price: toNumber(p.priceUsd) }] : [];
  });
  if (EXEMPT_PLAN_CODES.includes(plan.code) && !out.some((o) => o.months === 0)) out.push({ months: 0, price: null });
  return out;
}

export function AssignPlanModal({ orgs, plans, subs, presetOrganizationId, onClose, notify }: {
  orgs: OrganizationLite[]; plans: PlanRow[]; subs: SubscriptionRow[]; presetOrganizationId?: string; onClose: () => void; notify: Notify;
}) {
  const assign = useAssignPlan();
  const activePlans = useMemo(() => plans.filter((p) => p.active), [plans]);
  const current = presetOrganizationId ? subs.find((s) => s.organizationId === presetOrganizationId) : undefined;
  const [orgId, setOrgId] = useState(presetOrganizationId ?? '');
  const [planCode, setPlanCode] = useState(() => (current && activePlans.some((p) => p.code === current.planCode) ? current.planCode : ''));
  const [months, setMonths] = useState<string>(() => (current ? String(current.months) : ''));
  const [price, setPrice] = useState(() => (current && toNumber(current.agreedPriceUsd) !== null ? String(toNumber(current.agreedPriceUsd)) : ''));
  const [error, setError] = useState<string | null>(null);

  const plan = activePlans.find((p) => p.code === planCode);
  const options = durationOptions(plan);
  const hasOption = options.some((o) => String(o.months) === months);
  const existing = subs.find((s) => s.organizationId === orgId);
  const priceNum = price.trim() === '' ? undefined : parseMoney(price);
  const priceInvalid = price.trim() !== '' && priceNum === null;
  const ready = !!orgId && !!plan && hasOption && !priceInvalid;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready || !plan) return;
    setError(null);
    try {
      await assign.mutateAsync({
        organizationId: orgId, planCode: plan.code, months: Number(months),
        ...(priceNum !== undefined && priceNum !== null && { agreedPriceUsd: priceNum }),
      });
      const orgName = orgs.find((o) => o.id === orgId)?.name ?? 'la organización';
      notify('ok', `Se asignó el plan ${plan.name} a ${orgName}.`);
      onClose();
    } catch (err) {
      setError(errMsg(err, 'No se pudo asignar el plan.'));
    }
  }

  return (
    <Modal
      title={current ? `Cambiar plan — ${current.organizationName}` : 'Asignar plan a una organización'}
      subtitle="La suscripción queda ACTIVA desde hoy con la duración elegida. Cada organización guarda una copia del plan al contratarlo."
      onClose={onClose}
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="Organización" htmlFor="as-org">
          <select id="as-org" value={orgId} onChange={(e) => setOrgId(e.target.value)} disabled={!!presetOrganizationId} className={INPUT_CLS} required>
            <option value="">Elige una organización…</option>
            {[...orgs].sort((a, b) => a.name.localeCompare(b.name, 'es')).map((o) => {
              const s = subs.find((x) => x.organizationId === o.id);
              return <option key={o.id} value={o.id}>{o.name}{s ? ` — ${s.planName || s.planCode}` : ' — sin plan'}</option>;
            })}
          </select>
        </Field>
        <Field label="Plan" htmlFor="as-plan">
          <select
            id="as-plan" value={planCode} required className={INPUT_CLS}
            onChange={(e) => {
              setPlanCode(e.target.value);
              const next = activePlans.find((p) => p.code === e.target.value);
              const opts = durationOptions(next);
              if (!opts.some((o) => String(o.months) === months)) setMonths(opts[0] ? String(opts[0].months) : '');
            }}
          >
            <option value="">Elige un plan…</option>
            {activePlans.map((p) => <option key={p.id} value={p.code}>{p.name}</option>)}
          </select>
        </Field>
        <Field label="Duración de la licencia" htmlFor="as-months" help={plan && options.length === 0 ? undefined : 'Solo se ofrecen las duraciones con precio activo en el plan.'}>
          <select id="as-months" value={months} onChange={(e) => setMonths(e.target.value)} disabled={!plan || options.length === 0} className={INPUT_CLS} required>
            <option value="">{!plan ? 'Elige primero un plan' : options.length === 0 ? 'Este plan no tiene precios activos' : 'Elige la duración…'}</option>
            {options.map((o) => (
              <option key={o.months} value={o.months}>{LICENSE_LABEL[o.months]}{o.price !== null ? ` — ${usd(o.price)}` : ''}</option>
            ))}
          </select>
        </Field>
        <Field
          label="Precio pactado (USD, opcional)" htmlFor="as-price"
          help="Para negociar con este cliente sin tocar el catálogo; es el precio de la licencia completa. Déjalo vacío para usar el precio del plan."
          error={priceInvalid ? 'Escribe un monto en USD (por ejemplo 990 o 990.50).' : undefined}
        >
          <input id="as-price" type="text" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} aria-invalid={priceInvalid} className={INPUT_CLS} />
        </Field>
        {existing && (
          <Callout tone="warning">
            {existing.organizationName} ya tiene el plan {existing.planName || existing.planCode}. Cambiarlo reinicia la licencia desde hoy;
            sus ajustes por cliente (módulos sueltos) se conservan, los usuarios extra se reinician si cambia de plan y el precio pactado se reemplaza por el de este formulario.
          </Callout>
        )}
        {error && <Callout tone="critical">{error}</Callout>}
        <Actions>
          <button type="button" onClick={onClose} className={BTN_SECONDARY}>Cancelar</button>
          <button type="submit" disabled={!ready || assign.isPending} className={BTN_PRIMARY}>
            {assign.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {assign.isPending ? 'Asignando…' : 'Asignar plan'}
          </button>
        </Actions>
      </form>
    </Modal>
  );
}

// ── Renovar ──

export function RenewModal({ row, onClose, notify }: { row: SubscriptionRow; onClose: () => void; notify: Notify }) {
  const renew = useRenewSubscription();
  const [error, setError] = useState<string | null>(null);
  const months = row.months;
  const next = months > 0 ? renewalEnd(row.endsAt, months, new Date(), row.storedStatus === 'TRIAL') : null;

  async function submit() {
    setError(null);
    try {
      await renew.mutateAsync({ organizationId: row.organizationId, months });
      notify('ok', `Se renovó la licencia de ${row.organizationName}.`);
      onClose();
    } catch (err) {
      setError(errMsg(err, 'No se pudo renovar.'));
    }
  }

  return (
    <Modal
      title={`Renovar — ${row.organizationName}`}
      subtitle="La renovación mantiene la duración de la licencia actual. Para cambiar de duración o de plan usa «Cambiar plan»."
      onClose={onClose}
    >
      <div className="space-y-3 text-sm text-gray-800">
        <p>Plan: <strong>{row.planName || row.planCode}</strong> · {LICENSE_LABEL[months] ?? `${months} meses`}</p>
        <p>Vigencia actual: {row.endsAt ? shortDate(row.endsAt) : 'sin fecha'} <StatusPill status={row.status} /></p>
        {next && <p>Nuevo fin de licencia (estimado): <strong>{shortDate(next.toISOString())}</strong>. Si la cuenta estaba en gracia o en solo lectura, vuelve a estar activa.</p>}
        {months === 0 && <Callout tone="info">Esta licencia no vence: no hay nada que renovar.</Callout>}
        {error && <Callout tone="critical">{error}</Callout>}
      </div>
      <Actions>
        <button type="button" onClick={onClose} className={BTN_SECONDARY}>Cancelar</button>
        <button type="button" onClick={() => void submit()} disabled={months === 0 || renew.isPending} className={BTN_PRIMARY}>
          {renew.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          {renew.isPending ? 'Renovando…' : 'Renovar licencia'}
        </button>
      </Actions>
    </Modal>
  );
}

// ── Extender prueba ──

export function ExtendTrialModal({ row, onClose, notify }: { row: SubscriptionRow; onClose: () => void; notify: Notify }) {
  const extend = useExtendTrial();
  const [days, setDays] = useState('7');
  const [error, setError] = useState<string | null>(null);
  const n = parseWhole(days);
  const valid = n !== null && n >= 1 && n <= 365;
  const next = valid ? trialExtensionEnd(row.trialEndsAt, n, new Date(), row.storedStatus === 'TRIAL') : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || n === null) return;
    setError(null);
    try {
      await extend.mutateAsync({ organizationId: row.organizationId, days: n });
      notify('ok', `Se extendió la prueba de ${row.organizationName} por ${n} ${n === 1 ? 'día' : 'días'}.`);
      onClose();
    } catch (err) {
      setError(errMsg(err, 'No se pudo extender la prueba.'));
    }
  }

  return (
    <Modal title={`Extender prueba — ${row.organizationName}`} subtitle="Suma días a la prueba vigente (o desde hoy si ya terminó) y deja la cuenta en prueba." onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-gray-800">Prueba actual hasta: <strong>{row.trialEndsAt ? shortDate(row.trialEndsAt) : 'sin fecha'}</strong></p>
        <Field label="Días a sumar" htmlFor="tr-days" help="De 1 a 365." error={!valid ? 'Escribe un número de días entre 1 y 365.' : undefined}>
          <input id="tr-days" type="text" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} aria-invalid={!valid} className={`${INPUT_CLS} max-w-[10rem] tabular-nums`} />
        </Field>
        {next && <p className="text-sm text-gray-800">Nueva fecha de fin (estimada): <strong>{shortDate(next.toISOString())}</strong></p>}
        {error && <Callout tone="critical">{error}</Callout>}
        <Actions>
          <button type="button" onClick={onClose} className={BTN_SECONDARY}>Cancelar</button>
          <button type="submit" disabled={!valid || extend.isPending} className={BTN_PRIMARY}>
            {extend.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {extend.isPending ? 'Extendiendo…' : 'Extender prueba'}
          </button>
        </Actions>
      </form>
    </Modal>
  );
}

// ── Ajustes por cliente ──

const CHOICE_LABEL: Record<OverrideChoice, string> = { plan: 'Según el plan', add: 'Agregar a este cliente', remove: 'Quitar a este cliente' };

function OverrideSelect({ id, label, description, now, value, onChange }: {
  id: string; label: string; description?: string; now: boolean; value: OverrideChoice; onChange: (c: OverrideChoice) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-gray-200 px-3 py-2">
      <div className="min-w-[12rem] flex-1">
        <label htmlFor={id} className="block text-sm font-semibold text-gray-900">{label}</label>
        <p className="text-xs text-gray-600">{description ? `${description} · ` : ''}{now ? 'Incluido ahora' : 'No incluido ahora'}</p>
      </div>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value as OverrideChoice)} className={`${INPUT_CLS} w-auto min-w-[11rem]`}>
        {(Object.keys(CHOICE_LABEL) as OverrideChoice[]).map((c) => <option key={c} value={c}>{CHOICE_LABEL[c]}</option>)}
      </select>
    </div>
  );
}

export function SubscriptionSettingsModal({ row, onClose, notify }: { row: SubscriptionRow; onClose: () => void; notify: Notify }) {
  const update = useUpdateSubscription();
  const initialPrice = toNumber(row.agreedPriceUsd);
  const [price, setPrice] = useState(initialPrice === null ? '' : String(initialPrice));
  const [extra, setExtra] = useState(String(row.extraUsers));
  const [exempt, setExempt] = useState(row.exempt);
  const [notes, setNotes] = useState(row.notes ?? '');
  const [overrides, setOverrides] = useState<SubscriptionOverrides>(() => ({ ...(row.overrides ?? {}) }));
  const [error, setError] = useState<string | null>(null);

  const priceNum = price.trim() === '' ? null : parseMoney(price);
  const priceInvalid = price.trim() !== '' && priceNum === null;
  const extraNum = parseWhole(extra);
  const extraInvalid = extraNum === null || extraNum > 1000;
  const notesInvalid = notes.length > 1000;

  const patch: SubscriptionPatchBody = {};
  if (!priceInvalid && priceNum !== initialPrice) patch.agreedPriceUsd = priceNum; // null = quitar el precio pactado
  if (!extraInvalid && extraNum !== row.extraUsers) patch.extraUsers = extraNum!;
  if (exempt !== row.exempt) patch.exempt = exempt;
  if (!notesInvalid && notes !== (row.notes ?? '')) patch.notes = notes;
  if (JSON.stringify(overrides) !== JSON.stringify(row.overrides ?? {})) patch.overrides = overrides;
  const changed = Object.keys(patch).length > 0;
  const invalid = priceInvalid || extraInvalid || notesInvalid;

  const setChoice = (kind: OverrideKind, key: string) => (c: OverrideChoice) => setOverrides((o) => setOverrideChoice(o, kind, key, c));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!changed || invalid) return;
    setError(null);
    try {
      await update.mutateAsync({ organizationId: row.organizationId, patch });
      notify('ok', `Se guardaron los ajustes de ${row.organizationName}.`);
      onClose();
    } catch (err) {
      setError(errMsg(err, 'No se pudieron guardar los ajustes.'));
    }
  }

  async function changeStatus(status: 'ACTIVE' | 'SUSPENDED' | 'CANCELLED') {
    const text = {
      SUSPENDED: `¿Suspender la cuenta de ${row.organizationName}? Con el cumplimiento en ENFORCE quedará en solo lectura. No se borra nada y puedes reactivarla.`,
      CANCELLED: `¿Cancelar la suscripción de ${row.organizationName}? Con el cumplimiento en ENFORCE quedará en solo lectura. No se borra nada.`,
      ACTIVE: `¿Reactivar la cuenta de ${row.organizationName}?`,
    }[status];
    if (!window.confirm(text)) return;
    setError(null);
    try {
      await update.mutateAsync({ organizationId: row.organizationId, patch: { status } });
      notify('ok', `${row.organizationName}: ${status === 'ACTIVE' ? 'reactivada' : status === 'SUSPENDED' ? 'suspendida' : 'cancelada'}.`);
      onClose();
    } catch (err) {
      setError(errMsg(err, 'No se pudo cambiar el estado.'));
    }
  }

  const suspendedOrCancelled = row.storedStatus === 'SUSPENDED' || row.storedStatus === 'CANCELLED';
  const risky = reactivationRisk(row);

  return (
    <Modal title={`Ajustes — ${row.organizationName}`} subtitle="Cambios solo para este cliente: no tocan el catálogo ni a otros clientes." onClose={onClose} size="lg">
      <form onSubmit={save} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Precio pactado (USD)" htmlFor="st-price"
            help="Precio de la licencia completa para este cliente. Vacío = precio del plan."
            error={priceInvalid ? 'Escribe un monto en USD (por ejemplo 990 o 990.50).' : undefined}
          >
            <input id="st-price" type="text" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} aria-invalid={priceInvalid} className={`${INPUT_CLS} tabular-nums`} />
          </Field>
          <Field
            label="Usuarios extra comprados" htmlFor="st-extra"
            help={`Se suman a los ${row.limits.users < 0 ? 'incluidos (sin tope)' : row.limits.users + ' incluidos'}, sin pasar del máximo del plan.`}
            error={extraInvalid ? 'Escribe un número entero de 0 a 1000.' : undefined}
          >
            <input id="st-extra" type="text" inputMode="numeric" value={extra} onChange={(e) => setExtra(e.target.value)} aria-invalid={extraInvalid} className={`${INPUT_CLS} max-w-[10rem] tabular-nums`} />
          </Field>
        </div>
        <CheckRow
          id="st-exempt" checked={exempt} onChange={setExempt} label="Organización exenta"
          description="Una organización exenta nunca se bloquea ni pasa a solo lectura (Piloto, Interno, clientes de cortesía)."
        />
        <Field label="Notas internas" htmlFor="st-notes" help="Solo las ve la plataforma. Hasta 1000 caracteres." error={notesInvalid ? 'Las notas admiten hasta 1000 caracteres.' : undefined}>
          <textarea id="st-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} aria-invalid={notesInvalid} className={INPUT_CLS} />
        </Field>

        <fieldset className="space-y-2">
          <legend className="text-sm font-bold text-gray-900">Módulos, funciones y asistentes sueltos ({countOverrides(overrides)} ajustes)</legend>
          <p className="text-xs leading-relaxed text-gray-600">
            Dale a este cliente algo que su plan no trae, o quítale algo que sí trae, sin cambiar de plan. «Según el plan» no hace ningún ajuste.
            «Incluido ahora» refleja lo que hoy tiene la cuenta, antes de guardar.
          </p>
          <div className="space-y-2">
            {MODULE_KEYS.map((k) => (
              <OverrideSelect key={k} id={`ov-m-${k}`} label={MODULE_INFO[k].label} now={row.modules.includes(k)} value={overrideChoice(overrides, 'Modules', k)} onChange={setChoice('Modules', k)} />
            ))}
            {FUNCTION_KEYS.map((k) => (
              <OverrideSelect key={k} id={`ov-f-${k}`} label={FUNCTION_INFO[k].label} now={row.functions.includes(k)} value={overrideChoice(overrides, 'Functions', k)} onChange={setChoice('Functions', k)} />
            ))}
            {ASSISTANT_KEYS.map((a) => (
              <OverrideSelect key={a} id={`ov-a-${a}`} label={a} description={ASSISTANT_INFO[a]} now={row.assistants.includes(a)} value={overrideChoice(overrides, 'Assistants', a)} onChange={setChoice('Assistants', a)} />
            ))}
          </div>
          {hasLimitOverrides(row.overrides) && (
            <p className="text-xs text-gray-600">Este cliente también tiene límites propios (espacio, peticiones…): se conservan tal como están.</p>
          )}
        </fieldset>

        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
          <p className="text-sm font-bold text-gray-900">Estado de la cuenta</p>
          <p className="mt-1 flex items-center gap-2 text-sm text-gray-700">Ahora: <StatusPill status={row.status} /></p>
          <div className="mt-3 flex flex-wrap gap-2">
            {suspendedOrCancelled ? (
              <button type="button" onClick={() => void changeStatus('ACTIVE')} disabled={update.isPending || risky} className={BTN_SECONDARY}>Reactivar cuenta</button>
            ) : (
              <>
                <button type="button" onClick={() => void changeStatus('SUSPENDED')} disabled={update.isPending} className={BTN_DANGER}>Suspender cuenta</button>
                <button type="button" onClick={() => void changeStatus('CANCELLED')} disabled={update.isPending} className={BTN_SECONDARY}>Cancelar suscripción</button>
              </>
            )}
          </div>
          {suspendedOrCancelled && risky && (
            <p className="mt-2 text-xs leading-relaxed text-amber-900">
              Esta cuenta estaba en prueba: reactivarla la dejaría ACTIVA sin vencimiento. Usa «Extender prueba» o «Cambiar plan» para reactivarla con una fecha.
            </p>
          )}
          <p className="mt-2 text-xs leading-relaxed text-gray-600">
            Suspender o cancelar no borra nada. El bloqueo real solo ocurre con el cumplimiento en ENFORCE; mientras esté apagado u observando, la cuenta sigue trabajando.
          </p>
        </div>

        {error && <Callout tone="critical">{error}</Callout>}
        <Actions>
          <button type="button" onClick={onClose} className={BTN_SECONDARY}>Cerrar</button>
          <button type="submit" disabled={!changed || invalid || update.isPending} className={BTN_PRIMARY}>
            {update.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {update.isPending ? 'Guardando…' : 'Guardar ajustes'}
          </button>
        </Actions>
      </form>
    </Modal>
  );
}
