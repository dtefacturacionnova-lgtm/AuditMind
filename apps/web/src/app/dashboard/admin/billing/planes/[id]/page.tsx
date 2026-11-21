'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, Save, Users } from 'lucide-react';
import { MenuPreview } from '@/components/billing/MenuPreview';
import {
  BTN_PRIMARY, BTN_SECONDARY, Callout, Card, CheckRow, Field, INPUT_CLS, Modal, QueryError,
} from '@/components/billing/ui';
import { useApplyPlan, useBillingSettings, useCreatePlan, usePlan, usePlans, useUpdatePlan } from '@/hooks/useBillingAdmin';
import { FALLBACK_SETTINGS, type BillingSettingsRow, type PlanRow } from '@/lib/billing/admin-types';
import {
  ASSISTANT_INFO, ASSISTANT_KEYS, FILE_TYPE_INFO, FILE_TYPE_KEYS, FUNCTION_INFO, FUNCTION_KEYS, LICENSE_LABEL, LICENSE_MONTHS,
  MODULE_INFO, MODULE_KEYS,
} from '@/lib/billing/catalog';
import {
  emptyPlanForm, formToDto, includedKeys, parseMoney, planEconomics, planToForm, planWarnings, resetAssistants, setAssistant,
  setFunction, setModule, validatePlanForm, type LimitField, type LimitKey, type PlanFormState,
} from '@/lib/billing/plan-form';
import { intText, monthlyEquivalent, usd } from '@/lib/billing/pricing';
import { cn } from '@/lib/utils';

const idFor = (key: string) => (key.startsWith('price') ? `plan-price-${key.slice(5)}` : `plan-${key}`);

/** Campo numérico con casilla «Sin tope» (el API usa -1 para «sin tope»). */
function LimitInput({ id, label, field, onChange, error, help, unit }: {
  id: string; label: string; field: LimitField; onChange: (f: LimitField) => void; error?: string; help?: string; unit?: string;
}) {
  return (
    <Field label={label} htmlFor={id} help={help} error={error}>
      <div className="flex items-center gap-3">
        <input
          id={id} type="text" inputMode="numeric" value={field.unlimited ? '' : field.value} disabled={field.unlimited}
          placeholder={field.unlimited ? 'Sin tope' : ''} aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : help ? `${id}-help` : undefined}
          onChange={(e) => onChange({ ...field, value: e.target.value })}
          className={cn(INPUT_CLS, 'max-w-[11rem] tabular-nums')}
        />
        {unit && <span className="text-sm text-gray-600">{unit}</span>}
        <label className="flex items-center gap-1.5 text-sm text-gray-800">
          <input
            type="checkbox" checked={field.unlimited} onChange={(e) => onChange({ ...field, unlimited: e.target.checked })}
            className="h-4 w-4 rounded border-gray-400 text-[#0F2D4A] focus:ring-2 focus:ring-[#0F2D4A]/40"
          />
          Sin tope
        </label>
      </div>
    </Field>
  );
}

function TextInput({ id, label, value, onChange, error, help, maxLength, className, inputMode, readOnly }: {
  id: string; label: string; value: string; onChange: (v: string) => void; error?: string; help?: string; maxLength?: number;
  className?: string; inputMode?: 'numeric' | 'decimal'; readOnly?: boolean;
}) {
  return (
    <Field label={label} htmlFor={id} help={help} error={error} className={className}>
      <input
        id={id} type="text" value={value} maxLength={maxLength} inputMode={inputMode} readOnly={readOnly}
        aria-invalid={!!error} aria-describedby={error ? `${id}-error` : help ? `${id}-help` : undefined}
        onChange={(e) => onChange(e.target.value)} className={cn(INPUT_CLS, inputMode && 'tabular-nums')}
      />
    </Field>
  );
}

function SummaryRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-gray-600">{label}</span>
      <strong className="text-right tabular-nums text-gray-900">{value}</strong>
    </div>
  );
}

function PlanEditor({ plan, settings, settingsFailed, subscribers }: {
  plan: PlanRow | null; settings: BillingSettingsRow; settingsFailed: boolean; subscribers: number;
}) {
  const router = useRouter();
  const isNew = plan === null;
  const create = useCreatePlan();
  const update = useUpdatePlan();
  const apply = useApplyPlan();

  const [form, setForm] = useState<PlanFormState>(() => (plan ? planToForm(plan) : emptyPlanForm()));
  const [baseline, setBaseline] = useState(() => JSON.stringify(form));
  const [showErrors, setShowErrors] = useState(false);
  const [confirmApply, setConfirmApply] = useState(false);
  const [toast, setToast] = useState<{ kind: 'ok' | 'warn'; msg: string } | null>(null);

  const dirty = JSON.stringify(form) !== baseline;
  const errors = useMemo(() => validatePlanForm(form, isNew ? 'create' : 'update'), [form, isNew]);
  const errorKeys = Object.keys(errors);
  const warnings = useMemo(() => planWarnings(form), [form]);
  const eco = useMemo(() => planEconomics(form, settings), [form, settings]);
  const included = useMemo(() => includedKeys(form), [form]);
  const saving = create.isPending || update.isPending;
  const err = (k: string) => (showErrors ? errors[k] : undefined);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const patch = (p: Partial<PlanFormState>) => setForm((f) => ({ ...f, ...p }));
  const setLimit = (k: LimitKey) => (v: LimitField) => patch({ [k]: v } as Partial<PlanFormState>);

  async function save() {
    setShowErrors(true);
    setToast(null);
    if (errorKeys.length > 0) {
      document.getElementById(idFor(errorKeys[0]))?.focus();
      return;
    }
    try {
      if (isNew) {
        const created = await create.mutateAsync(formToDto(form, 'create'));
        setBaseline(JSON.stringify(form));
        router.replace(`/dashboard/admin/billing/planes/${encodeURIComponent(created.id)}`);
      } else {
        const saved = await update.mutateAsync({ id: plan.id, dto: formToDto(form, 'update') });
        const next = planToForm(saved);
        setForm(next);
        setBaseline(JSON.stringify(next));
        setShowErrors(false);
        setToast({ kind: 'ok', msg: 'Plan guardado. No cambia lo que ya contrataron los clientes: usa «Aplicar a clientes» para propagarlo.' });
      }
    } catch (e) {
      setToast({ kind: 'warn', msg: (e as Error).message || 'No se pudo guardar el plan.' });
    }
  }

  async function applyToClients() {
    if (!plan) return;
    try {
      const res = await apply.mutateAsync(plan.id);
      setConfirmApply(false);
      setToast({ kind: 'ok', msg: `Plan aplicado a ${res.updated} ${res.updated === 1 ? 'cliente' : 'clientes'}.` });
    } catch (e) {
      setConfirmApply(false);
      setToast({ kind: 'warn', msg: (e as Error).message || 'No se pudo aplicar el plan.' });
    }
  }

  const aiRequests = eco.aiRequests;
  const w = settings.weights;

  return (
    <div className="space-y-5">
      {/* Barra superior */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-5 py-4">
        <div className="min-w-0">
          <p className="text-sm text-gray-600">
            <Link href="/dashboard/admin/billing/planes" className="underline-offset-2 hover:underline">Planes</Link> › {isNew ? 'Nuevo plan' : 'Editar plan'}
          </p>
          <h1 className="truncate text-xl font-bold text-gray-900">{form.name.trim() || 'Plan sin nombre'}</h1>
        </div>
        <div className="flex items-center gap-3">
          {dirty && <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900">Cambios sin guardar</span>}
          <button type="button" onClick={() => void save()} disabled={saving || (!isNew && !dirty)} className={BTN_PRIMARY}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
            {saving ? 'Guardando…' : isNew ? 'Crear plan' : 'Guardar plan'}
          </button>
        </div>
      </div>

      {toast && (
        <Callout tone={toast.kind === 'ok' ? 'success' : 'critical'}>{toast.msg}</Callout>
      )}
      {settingsFailed && (
        <Callout tone="warning">
          No se pudieron leer los parámetros de la plataforma: las equivalencias en dinero usan los valores por defecto (costo por petición {usd(FALLBACK_SETTINGS.costPerRequestUsd, 4)}).
        </Callout>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="space-y-5">
          {/* 1 · Identidad */}
          <Card title="1 · Identidad">
            <div className="grid gap-4 sm:grid-cols-2">
              <TextInput id="plan-name" label="Nombre del plan" value={form.name} onChange={(v) => patch({ name: v })} error={err('name')} maxLength={120} />
              {isNew ? (
                <TextInput
                  id="plan-code" label="Código" value={form.code} onChange={(v) => patch({ code: v.toUpperCase().replace(/\s+/g, '_') })}
                  error={err('code')} maxLength={40} help="Único y no se puede cambiar después. Letras mayúsculas, números y guion bajo (por ejemplo EMPRESA_DESPACHO)."
                />
              ) : (
                <div className="flex flex-col gap-1.5">
                  <span className="text-sm font-semibold text-gray-800">Código</span>
                  <p className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800">{form.code}</p>
                  <p className="text-xs text-gray-600">El código no se puede cambiar.</p>
                </div>
              )}
            </div>
            <fieldset className="mt-4">
              <legend className="mb-1.5 text-sm font-semibold text-gray-800">Audiencia</legend>
              <div className="inline-flex gap-1 rounded-xl bg-gray-200 p-1">
                {(['PERSONA', 'EMPRESA'] as const).map((a) => (
                  <label
                    key={a}
                    className={cn(
                      'cursor-pointer rounded-lg px-4 py-1.5 text-sm font-semibold focus-within:outline focus-within:outline-2 focus-within:outline-[#0F2D4A]',
                      form.audience === a ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-700 hover:text-gray-900',
                    )}
                  >
                    <input type="radio" name="plan-audience" value={a} checked={form.audience === a} onChange={() => patch({ audience: a })} className="sr-only" />
                    {a === 'PERSONA' ? 'Persona' : 'Empresa'}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="mt-4">
              <Field label="Descripción (opcional)" htmlFor="plan-description" error={err('description')} help="Hasta 500 caracteres. Se muestra en el catálogo público cuando exista.">
                <textarea
                  id="plan-description" rows={2} value={form.description} maxLength={500} onChange={(e) => patch({ description: e.target.value })}
                  aria-invalid={!!err('description')} className={INPUT_CLS}
                />
              </Field>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              <CheckRow id="plan-active" checked={form.active} onChange={(v) => patch({ active: v })} label="Plan activo" description="Se puede asignar a organizaciones" />
              <CheckRow id="plan-public" checked={form.isPublic} onChange={(v) => patch({ isPublic: v })} label="Visible al público" description="Aparecerá en la página de precios (aún no existe)" />
              <CheckRow id="plan-featured" checked={form.featured} onChange={(v) => patch({ featured: v })} label="Marcar como «Más elegido»" />
            </div>
            <div className="mt-4 max-w-[12rem]">
              <TextInput id="plan-sortOrder" label="Orden en el catálogo" value={form.sortOrder} onChange={(v) => patch({ sortOrder: v })} error={err('sortOrder')} inputMode="numeric" help="0 a 1000; menor sale primero." />
            </div>
          </Card>

          {/* 2 · Licencia y precio */}
          <Card
            title="2 · Licencia y precio"
            subtitle="Cuánto dura cada licencia al contratar o renovar. Al vencer, la cuenta pasa a solo lectura (nunca se borra nada). El mismo plan se ofrece a varias duraciones. Los precios son en USD, sin IVA."
          >
            <div className="space-y-2.5">
              {LICENSE_MONTHS.map((m) => {
                const p = form.prices[m];
                const price = p.on ? parseMoney(p.value) : null;
                const eq = price !== null ? monthlyEquivalent(price, m) : null;
                const key = `price${m}`;
                return (
                  <div key={m} className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5">
                    <label className="flex min-w-[10rem] flex-1 items-center gap-2.5 text-sm font-medium text-gray-900">
                      <input
                        type="checkbox" checked={p.on}
                        onChange={(e) => patch({ prices: { ...form.prices, [m]: { ...p, on: e.target.checked } } })}
                        className="h-4 w-4 rounded border-gray-400 text-[#0F2D4A] focus:ring-2 focus:ring-[#0F2D4A]/40"
                      />
                      {LICENSE_LABEL[m]}
                      {p.existing && !p.on && <span className="text-xs font-normal text-gray-600">(desactivada)</span>}
                    </label>
                    <div className="flex items-center gap-1.5">
                      <label htmlFor={idFor(key)} className="text-sm text-gray-700">USD</label>
                      <input
                        id={idFor(key)} type="text" inputMode="decimal" value={p.value} disabled={!p.on}
                        aria-invalid={!!err(key)} aria-describedby={err(key) ? `${idFor(key)}-error` : undefined}
                        onChange={(e) => patch({ prices: { ...form.prices, [m]: { ...p, value: e.target.value } } })}
                        className={cn(INPUT_CLS, 'w-28 text-right tabular-nums')}
                      />
                    </div>
                    <span className="min-w-[10rem] flex-1 text-sm text-gray-600">
                      {m === 0 ? 'Solo para plan Interno y pilotos' : eq !== null ? `≈ ${usd(eq)} por mes` : ''}
                    </span>
                    {err(key) && <p id={`${idFor(key)}-error`} role="alert" className="w-full text-xs font-medium text-red-700">{err(key)}</p>}
                  </div>
                );
              })}
            </div>
          </Card>

          {/* 3 · Prueba y usuarios */}
          <Card title="3 · Prueba y usuarios">
            <div className="grid gap-5 sm:grid-cols-2">
              <TextInput id="plan-trialDays" label="Días de prueba" value={form.trialDays} onChange={(v) => patch({ trialDays: v })} error={err('trialDays')} inputMode="numeric" help="0 a 365. Una prueba por organización." />
              <TextInput id="plan-extraUserPriceUsd" label="Precio por usuario extra (USD al mes)" value={form.extraUserPriceUsd} onChange={(v) => patch({ extraUserPriceUsd: v })} error={err('extraUserPriceUsd')} inputMode="decimal" />
              <LimitInput id="plan-users" label="Usuarios incluidos" field={form.users} onChange={setLimit('users')} error={err('users')} help="No cuentan invitados del portal ni usuarios de solo lectura." />
              <LimitInput id="plan-maxUsers" label="Máximo con usuarios extra" field={form.maxUsers} onChange={setLimit('maxUsers')} error={err('maxUsers')} />
            </div>
          </Card>

          {/* 4 · Almacenamiento */}
          <Card
            title="4 · Almacenamiento"
            subtitle="Es compartido por todos los archivos de la organización: evidencia de campo, papeles, portal de auditados y firmas. El video y el audio son lo que más espacio ocupa."
          >
            <div className="grid gap-5 sm:grid-cols-2">
              <LimitInput id="plan-storageGb" label="Espacio total" unit="GB" field={form.storageGb} onChange={setLimit('storageGb')} error={err('storageGb')} />
              <LimitInput id="plan-maxFileMb" label="Tamaño máximo por archivo" unit="MB" field={form.maxFileMb} onChange={setLimit('maxFileMb')} error={err('maxFileMb')} help="Un video de 10 minutos suele pesar entre 150 y 250 MB." />
            </div>
            <fieldset className="mt-5">
              <legend className="mb-2 text-sm font-semibold text-gray-800">Tipos de archivo permitidos</legend>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {FILE_TYPE_KEYS.map((k) => (
                  <CheckRow
                    key={k} id={`plan-ft-${k}`} checked={form.fileTypes[k]} onChange={(v) => patch({ fileTypes: { ...form.fileTypes, [k]: v } })}
                    label={FILE_TYPE_INFO[k].label} description={FILE_TYPE_INFO[k].note}
                  />
                ))}
              </div>
            </fieldset>
            <div className="mt-4">
              <CheckRow id="plan-packsStorage" checked={form.packsStorage} onChange={(v) => patch({ packsStorage: v })} label="Permitir que el cliente compre paquetes de espacio cuando se llene" description="La compra de paquetes llegará en una etapa posterior; la casilla ya queda guardada." />
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-blue-900">Lo que verá el cliente</p>
                <p className="mt-2 text-sm text-gray-900"><strong>Espacio incluido:</strong> {form.storageGb.unlimited ? 'sin tope' : eco.storageGb !== null ? `${intText(eco.storageGb)} GB` : '—'}</p>
                <p className="mt-1 text-xs leading-relaxed text-gray-700">
                  Archivo máximo: {form.maxFileMb.unlimited ? 'sin tope' : `${form.maxFileMb.value || '—'} MB`}.{' '}
                  {form.packsStorage ? 'Podrá ampliar el espacio con paquetes adicionales (próximamente).' : 'Si se llena no podrá subir más archivos hasta liberar espacio.'}
                </p>
              </div>
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-gray-700">Lo que ves tú (superadmin)</p>
                <div className="mt-2 space-y-1">
                  <SummaryRow label="Costo si se llena, Supabase" value={usd(eco.storageSupabase)} />
                  <SummaryRow label="Costo si se llena, Cloudflare R2" value={usd(eco.storageR2)} />
                </div>
                <p className="mt-2 text-xs leading-relaxed text-gray-600">
                  Valores ilustrativos: Supabase $0.0213 por GB-mes sobre lo incluido (y $0.09 por GB descargado sobre 250 GB al mes); R2 $0.015 por GB-mes sin cobro de descargas. Confirma las tarifas en las páginas oficiales.
                </p>
              </div>
            </div>
          </Card>

          {/* 5 · Inteligencia artificial */}
          <Card title="5 · Inteligencia artificial" subtitle="El límite se fija en peticiones, que es lo que entiende el cliente. Aquí ves cuánto dinero equivale.">
            <div className="max-w-md">
              <LimitInput id="plan-aiRequests" label="Peticiones de IA al mes" field={form.aiRequests} onChange={setLimit('aiRequests')} error={err('aiRequests')} />
            </div>
            <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950">
              <p className="text-sm font-semibold tabular-nums">
                {aiRequests === null
                  ? 'Sin tope: el costo de IA de este plan no tiene límite.'
                  : `${intText(aiRequests)} peticiones al mes ≈ ${usd(eco.aiCost)} de costo esperado`}
              </p>
              <p className="mt-1 text-xs leading-relaxed">
                Se calcula con el costo por petición de los parámetros de la plataforma ({usd(settings.costPerRequestUsd, 4)} por petición) y se recalibra con el consumo real de cada mes.
              </p>
            </div>
            <div className="mt-4">
              <p className="mb-2 text-sm font-semibold text-gray-800">Cuánto pesa cada acción</p>
              <ul className="space-y-2">
                {[
                  { n: w.light, what: 'Un mensaje a un asistente, mejorar un texto, redactar un hallazgo, sugerir una sección de papel.' },
                  { n: w.medium, what: 'Analizar un documento largo, un informe o propuesta completa, extraer datos de una evidencia.' },
                  { n: w.heavy, what: 'Analizar audio o video (por cada 10 minutos) o una investigación forense con varias fuentes.' },
                ].map((r) => (
                  <li key={r.what} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-gray-200 bg-gray-50 px-3.5 py-2 text-sm">
                    <span className="rounded-full bg-blue-100 px-3 py-0.5 text-xs font-bold tabular-nums text-blue-900">{r.n} {r.n === 1 ? 'petición' : 'peticiones'}</span>
                    <span className="min-w-[14rem] flex-1 text-gray-800">{r.what}</span>
                    <span className="tabular-nums text-gray-600">≈ {usd(r.n * settings.costPerRequestUsd, 4)}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="mt-4">
              <CheckRow id="plan-packsAi" checked={form.packsAi} onChange={(v) => patch({ packsAi: v })} label="Permitir que el cliente compre paquetes de peticiones cuando llegue al límite" description="La compra de paquetes llegará en una etapa posterior; la casilla ya queda guardada." />
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-blue-900">Lo que verá el cliente</p>
                <p className="mt-2 text-sm text-gray-900"><strong>Peticiones de IA al mes:</strong> {aiRequests === null ? 'sin tope' : intText(aiRequests)}</p>
                <p className="mt-1 text-xs leading-relaxed text-gray-700">
                  {form.packsAi ? 'Al llegar al límite podrá ampliar con paquetes adicionales (próximamente).' : 'Al llegar al límite la IA se pausa hasta el próximo mes.'} Nunca ve dinero ni costos.
                </p>
              </div>
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-gray-700">Lo que ves tú (superadmin)</p>
                <div className="mt-2 space-y-1">
                  <SummaryRow label="Costo esperado al mes" value={usd(eco.aiCost)} />
                  <SummaryRow label={`Tope de seguridad (${settings.safetyMultiplier} veces)`} value={usd(eco.aiCap)} />
                </div>
                <p className="mt-2 text-xs leading-relaxed text-gray-600">
                  Si el gasto real del mes supera el tope, la IA se pausa aunque queden peticiones: protege contra un error de cálculo del peso.
                </p>
              </div>
            </div>
          </Card>

          {/* 6 · Módulos */}
          <Card title="6 · Módulos incluidos" subtitle="Cada módulo es un grupo del menú. Si se desactiva, se oculta y se bloquea; los datos no se borran.">
            <div className="space-y-2">
              <CheckRow id="plan-core" checked disabled onChange={() => undefined} label={<>Núcleo <span className="font-normal text-blue-900">· siempre incluido</span></>} description="Dashboard, proyectos de auditoría, papeles, hallazgos y administración básica" />
              {MODULE_KEYS.map((k) => (
                <CheckRow key={k} id={`plan-mod-${k}`} checked={form.modules[k]} onChange={(v) => setForm((f) => setModule(f, k, v))} label={MODULE_INFO[k].label} description={MODULE_INFO[k].description} />
              ))}
            </div>
          </Card>

          {/* 7 · Funciones */}
          <Card title="7 · Funciones adicionales">
            <div className="grid gap-2 sm:grid-cols-2">
              {FUNCTION_KEYS.map((k) => (
                <CheckRow key={k} id={`plan-fn-${k}`} checked={form.functions[k]} onChange={(v) => setForm((f) => setFunction(f, k, v))} label={FUNCTION_INFO[k].label} description={FUNCTION_INFO[k].description} />
              ))}
            </div>
          </Card>

          {/* 8 · Asistentes */}
          <Card
            title="8 · Asistentes de IA permitidos"
            subtitle="El editor pre-marca los afines a los módulos elegidos; puedes ajustarlos uno por uno."
            action={<button type="button" onClick={() => setForm((f) => resetAssistants(f))} className={BTN_SECONDARY}>Pre-marcar según módulos</button>}
          >
            {!form.assistantsAuto && (
              <p className="mb-3 text-xs text-gray-600">Los asistentes están ajustados a mano: cambiar los módulos ya no los modifica. Usa «Pre-marcar según módulos» para volver a la regla.</p>
            )}
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {ASSISTANT_KEYS.map((a) => (
                <CheckRow key={a} id={`plan-as-${a}`} checked={form.assistants[a]} onChange={(v) => setForm((f) => setAssistant(f, a, v))} label={a} description={ASSISTANT_INFO[a]} />
              ))}
            </div>
          </Card>

          {/* Pie */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-5 py-4">
            <p className="max-w-lg text-sm leading-relaxed text-gray-600">
              Guardar no cambia lo que ya contrataron los clientes (cada suscripción guarda una copia del plan). Para propagar el cambio, usa «Aplicar a clientes».
            </p>
            <div className="flex flex-wrap gap-2.5">
              {!isNew && (
                <button
                  type="button" onClick={() => setConfirmApply(true)} disabled={dirty || subscribers === 0 || apply.isPending}
                  title={dirty ? 'Guarda primero los cambios para poder aplicarlos' : subscribers === 0 ? 'Ninguna organización usa este plan' : undefined}
                  className={BTN_SECONDARY}
                >
                  <Users className="h-4 w-4" aria-hidden="true" />
                  Aplicar a {subscribers} {subscribers === 1 ? 'cliente actual' : 'clientes actuales'}
                </button>
              )}
              <button type="button" onClick={() => void save()} disabled={saving || (!isNew && !dirty)} className={BTN_PRIMARY}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
                {isNew ? 'Crear plan' : 'Guardar plan'}
              </button>
            </div>
          </div>
        </div>

        {/* Columna derecha */}
        <aside className="space-y-4 lg:sticky lg:top-4" aria-label="Vista previa y resumen del plan">
          <Card title="Así lo ve el cliente" className="p-4">
            <MenuPreview modules={[...included.modules, ...included.functions]} />
            <p className="mt-3 text-xs leading-relaxed text-gray-600">
              Los módulos fuera del plan siguen visibles con un candado: al tocarlos, el cliente ve qué incluyen.
            </p>
          </Card>

          <Card title="Resumen" className="p-4">
            <div className="space-y-2">
              <SummaryRow label="Audiencia" value={form.audience === 'PERSONA' ? 'Persona' : 'Empresa'} />
              <SummaryRow label="Módulos opcionales" value={`${eco.modulesCount} de ${MODULE_KEYS.length}`} />
              <SummaryRow label="Funciones" value={`${eco.functionsCount} de ${FUNCTION_KEYS.length}`} />
              <SummaryRow label="Asistentes" value={`${eco.assistantsCount} de ${ASSISTANT_KEYS.length}`} />
              <SummaryRow label="Usuarios" value={form.users.unlimited ? 'Sin tope' : form.users.value || '—'} />
              <SummaryRow label="Espacio" value={form.storageGb.unlimited ? 'Sin tope' : eco.storageGb !== null ? `${intText(eco.storageGb)} GB` : '—'} />
              <SummaryRow label="Peticiones de IA" value={aiRequests === null ? 'Sin tope' : intText(aiRequests)} />
              <SummaryRow label="Prueba" value={`${form.trialDays || '0'} días`} />
              <SummaryRow label="Precio por mes más bajo" value={eco.monthlyPrice !== null ? usd(eco.monthlyPrice) : '—'} />
            </div>
            <div className="mt-4 space-y-2 border-t border-gray-200 pt-3">
              <p className="text-xs font-bold uppercase tracking-wide text-gray-700">Costo y margen (solo superadmin)</p>
              <SummaryRow label="IA si se agota" value={usd(eco.aiCost)} />
              <SummaryRow label="Espacio si se llena" value={usd(eco.storageSupabase)} />
              <SummaryRow label="Costo variable total" value={usd(eco.totalCost)} />
              <SummaryRow
                label="Margen"
                value={eco.margin ? `${eco.margin.pct} %  (${usd(eco.margin.amount)} de ${usd(eco.monthlyPrice)})` : '—'}
              />
              <p className="text-[11px] leading-relaxed text-gray-600">
                Margen sobre el precio por mes más bajo del plan. Sin costos fijos (servidor, base de datos, correo). Peor caso: todo el plan consumido. El costo del espacio es un valor ilustrativo.
              </p>
            </div>
          </Card>

          {showErrors && errorKeys.length > 0 && (
            <Callout tone="critical" title="Corrige antes de guardar">
              <ul className="mt-1 list-disc space-y-1 pl-4">
                {errorKeys.map((k) => <li key={k}>{errors[k]}</li>)}
              </ul>
            </Callout>
          )}
          {warnings.length > 0 && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950">
              <p className="flex items-center gap-1.5 text-sm font-bold"><AlertTriangle className="h-4 w-4" aria-hidden="true" /> Revisa antes de guardar</p>
              <ul className="mt-2 space-y-1.5 text-sm leading-snug">
                {warnings.map((m) => <li key={m}>{m}</li>)}
              </ul>
            </div>
          )}
          {!dirty && !isNew && warnings.length === 0 && (
            <p className="flex items-center gap-1.5 text-xs text-gray-600"><CheckCircle2 className="h-3.5 w-3.5 text-green-700" aria-hidden="true" /> Sin cambios pendientes.</p>
          )}
        </aside>
      </div>

      {confirmApply && plan && (
        <Modal
          title={`Aplicar «${plan.name}» a ${subscribers} ${subscribers === 1 ? 'cliente' : 'clientes'}`}
          subtitle="Se actualiza la copia del plan que guarda cada suscripción: módulos, funciones, asistentes y límites. Cada cliente conserva su precio pactado, sus usuarios extra y sus ajustes por cliente. El cambio llega a sus cuentas de inmediato."
          onClose={() => setConfirmApply(false)}
        >
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setConfirmApply(false)} className={BTN_SECONDARY}>Cancelar</button>
            <button type="button" onClick={() => void applyToClients()} disabled={apply.isPending} className={BTN_PRIMARY}>
              {apply.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {apply.isPending ? 'Aplicando…' : 'Aplicar a los clientes'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default function PlanEditorPage() {
  const params = useParams<{ id: string }>();
  const id = String(params?.id ?? '');
  const isNew = id === 'nuevo';
  const plan = usePlan(isNew ? null : id);
  const settings = useBillingSettings();
  const plans = usePlans();

  if (!isNew && plan.isLoading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-gray-400" aria-label="Cargando" /></div>;
  }
  if (!isNew && (plan.isError || !plan.data)) {
    return <QueryError error={plan.error} what="el plan" onRetry={() => void plan.refetch()} />;
  }
  const subscribers = isNew ? 0 : (plans.data?.find((p) => p.id === id)?.subscribers ?? 0);
  return (
    <PlanEditor
      key={isNew ? 'nuevo' : id}
      plan={isNew ? null : plan.data!}
      settings={settings.data ?? FALLBACK_SETTINGS}
      settingsFailed={settings.isError}
      subscribers={subscribers}
    />
  );
}
