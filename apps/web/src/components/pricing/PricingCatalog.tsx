'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { Check, Minus } from 'lucide-react';
import {
  AUDIENCES, CORE_TEXT, assistantLines, audiencesIn, bestSavings, billingText, contactHref, contactMessage, defaultAudience, defaultDuration, durationLabel, durationsIn,
  ensureDuration, fileTypesNote, functionLabels, headlinePrice, limitRows, moduleRows, packGroups, packLine, plansIn, priceView, trialText,
  type PublicAudience, type PublicCatalog, type PublicContact, type PublicPlan,
} from '@/lib/billing/public-catalog';

const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

/** Selector de una opción entre varias, con radios nativos (se usa con teclado y lector de pantalla sin código extra). */
function Segmented<T extends string | number>({ legend, name, value, options, onChange }: {
  legend: string; name: string; value: T; onChange: (v: T) => void;
  options: ReadonlyArray<{ value: T; label: string; badge?: string }>;
}) {
  return (
    <fieldset className="min-w-0">
      <legend className="sr-only">{legend}</legend>
      <div className="inline-flex flex-wrap gap-1 rounded-xl bg-slate-200/70 p-1">
        {options.map((o) => (
          <label key={String(o.value)} className="relative">
            <input type="radio" name={name} value={String(o.value)} checked={o.value === value} onChange={() => onChange(o.value)} className="peer sr-only" />
            <span className="flex cursor-pointer items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:text-slate-900 peer-checked:bg-white peer-checked:font-semibold peer-checked:text-slate-900 peer-checked:shadow-sm peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-primary">
              {o.label}
              {o.badge && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-900">{o.badge}</span>}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function CtaLink({ href, primary, children }: { href: string | null; primary: boolean; children: ReactNode }) {
  if (!href) return null;
  return (
    <a
      href={href}
      className={`block rounded-lg px-4 py-2.5 text-center text-sm font-semibold transition-colors ${FOCUS} ${
        primary ? 'bg-primary text-white hover:bg-primary-light' : 'border border-slate-300 bg-white text-slate-800 hover:bg-slate-50'
      }`}
    >
      {children}
    </a>
  );
}

function PlanCard({ plan, months, contact }: { plan: PublicPlan; months: number | null; contact: PublicContact }) {
  const view = months === null ? ({ priced: false } as const) : priceView(plan, months);
  const trial = trialText(plan);
  const href = contactHref(contact, contactMessage('TRIAL', plan, months));
  const modules = moduleRows(plan);
  const extras = functionLabels(plan);
  const assistants = assistantLines(plan);
  const fileNote = fileTypesNote(plan);
  const headingId = `plan-${plan.code}`;

  return (
    <article
      aria-labelledby={headingId}
      className={`relative flex flex-col rounded-2xl border bg-white p-6 shadow-card ${plan.featured ? 'border-primary ring-2 ring-primary' : 'border-slate-200'}`}
    >
      {plan.featured && (
        <span className="absolute -top-3 left-6 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-white">Más elegido</span>
      )}
      <h3 id={headingId} className="text-lg font-bold text-slate-900">{plan.name}</h3>
      <p className="mt-1 min-h-[2.5rem] text-sm leading-relaxed text-slate-600">{plan.description}</p>

      <div className="mt-5" aria-live="polite">
        {view.priced ? (
          <>
            <p className="flex items-baseline gap-1">
              <span className="text-4xl font-bold tabular-nums tracking-tight text-slate-900">{headlinePrice(view.perMonth)}</span>
              <span className="text-sm text-slate-600">/ mes</span>
            </p>
            <p className="mt-1 text-sm text-slate-600">{billingText(view)}</p>
            {view.savings !== null && (
              <p className="mt-2"><span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-900">Ahorras {view.savings} %</span></p>
            )}
          </>
        ) : (
          <>
            <p className="text-2xl font-bold text-slate-900">A convenir</p>
            <p className="mt-1 text-sm text-slate-600">Escríbenos para conocer el precio de esta duración.</p>
          </>
        )}
      </div>

      <div className="mt-5 space-y-2">
        <CtaLink href={href} primary>{trial ? `Empezar ${trial.charAt(0).toLowerCase()}${trial.slice(1)}` : 'Hablar con ventas'}</CtaLink>
        {trial && href && <p className="text-center text-xs text-slate-600">Tus datos se conservan al cambiar de plan.</p>}
      </div>

      <dl className="mt-6 divide-y divide-slate-100 border-t border-slate-100 text-sm">
        {limitRows(plan).map((r) => (
          <div key={r.label} className="flex items-baseline justify-between gap-3 py-2">
            <dt className="text-slate-600">{r.label}</dt>
            <dd className="text-right font-semibold tabular-nums text-slate-900">{r.value}</dd>
          </div>
        ))}
      </dl>
      {fileNote && <p className="mt-1 text-xs text-slate-600">{fileNote}</p>}

      <h4 className="mt-6 text-xs font-semibold uppercase tracking-wide text-slate-600">Módulos</h4>
      <p className="mt-1.5 text-xs text-slate-600">{CORE_TEXT}</p>
      <ul className="mt-2 space-y-1.5 text-sm">
        {modules.map((m) => (
          <li key={m.key} className={`flex items-start gap-2 ${m.included ? 'text-slate-900' : 'text-slate-500'}`}>
            {m.included
              ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
              : <Minus className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />}
            <span>{m.label}<span className="sr-only">{m.included ? ': incluido' : ': no incluido'}</span></span>
          </li>
        ))}
      </ul>

      {extras.length > 0 && (
        <>
          <h4 className="mt-5 text-xs font-semibold uppercase tracking-wide text-slate-600">Además</h4>
          <ul className="mt-2 space-y-1.5 text-sm">
            {extras.map((e) => (
              <li key={e} className="flex items-start gap-2 text-slate-900">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" /> <span>{e}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {assistants.length > 0 && (
        <details className="group mt-5 rounded-lg border border-slate-200 px-3 py-2 text-sm">
          <summary className={`cursor-pointer list-none font-semibold text-slate-800 ${FOCUS} rounded`}>
            {assistants.length} {assistants.length === 1 ? 'asistente' : 'asistentes'} de IA <span className="font-normal text-slate-600 group-open:hidden">· ver cuáles</span>
          </summary>
          <ul className="mt-2 space-y-1 text-xs text-slate-700">
            {assistants.map((a) => <li key={a}>{a}</li>)}
          </ul>
        </details>
      )}
    </article>
  );
}

/** La página de precios: elige audiencia y duración, y muestra cada plan con lo que incluye. */
export function PricingCatalog({ catalog }: { catalog: PublicCatalog }) {
  const audiences = useMemo(() => audiencesIn(catalog.plans), [catalog.plans]);
  const firstAudience = defaultAudience(catalog.plans) ?? 'EMPRESA';
  const [audience, setAudience] = useState<PublicAudience>(firstAudience);
  const plans = useMemo(() => plansIn(catalog.plans, audience), [catalog.plans, audience]);
  const durations = useMemo(() => durationsIn(plans), [plans]);
  const [wanted, setWanted] = useState<number>(() => defaultDuration(durationsIn(plansIn(catalog.plans, firstAudience))) ?? 12);
  const months = ensureDuration(wanted, durations);
  const packs = useMemo(() => packGroups(catalog.packs), [catalog.packs]);
  const corporateHref = contactHref(catalog.contact, contactMessage('CORPORATE'));
  const demoHref = contactHref(catalog.contact, contactMessage('DEMO'));

  return (
    <>
      <section className="mx-auto w-full max-w-7xl px-4 pb-6 pt-12 text-center sm:px-6 lg:px-8">
        <p className="text-sm font-semibold uppercase tracking-widest text-primary-600">Planes y precios</p>
        <h1 className="mx-auto mt-2 max-w-3xl text-balance text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
          Planes para auditores independientes y equipos de auditoría
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-pretty text-base leading-relaxed text-slate-600">
          Cada plan ya trae lo que necesitas. Cambia de plan cuando quieras: tus datos se conservan, y si una licencia vence la cuenta pasa a solo lectura:
          nunca se borra nada.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          {audiences.length > 1 && (
            <Segmented
              legend="Para quién es el plan" name="audience" value={audience} onChange={setAudience}
              options={AUDIENCES.filter((a) => audiences.includes(a.id)).map((a) => ({ value: a.id, label: a.label }))}
            />
          )}
          {durations.length > 1 && months !== null && (
            <Segmented
              legend="Duración de la licencia" name="duration" value={months} onChange={setWanted}
              options={durations.map((m) => {
                const s = bestSavings(plans, m);
                return { value: m, label: durationLabel(m), badge: s !== null ? `ahorra hasta ${s} %` : undefined };
              })}
            />
          )}
        </div>
      </section>

      <section aria-label="Planes" className="mx-auto w-full max-w-7xl px-4 pb-12 pt-6 sm:px-6 lg:px-8">
        <div className={`grid gap-6 ${plans.length >= 3 ? 'md:grid-cols-2 xl:grid-cols-3' : 'mx-auto max-w-4xl md:grid-cols-2'}`}>
          {plans.map((p) => <PlanCard key={p.code} plan={p} months={months} contact={catalog.contact} />)}
        </div>
      </section>

      {(packs.ai.length > 0 || packs.storage.length > 0) && (
        <section aria-labelledby="mas" className="border-y border-slate-200 bg-white">
          <div className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
            <h2 id="mas" className="text-xl font-bold text-slate-900">¿Necesitas más? Compra cuando quieras</h2>
            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-slate-600">
              Se suman a tu plan en cuanto se aprueba el pago. Las peticiones compradas valen 12 meses; el espacio se suma mientras dure tu licencia.
            </p>
            <div className="mt-6 grid gap-6 md:grid-cols-2">
              {([['Peticiones de IA adicionales', packs.ai], ['Espacio adicional', packs.storage]] as const).map(([title, list]) => list.length > 0 && (
                <div key={title} className="rounded-xl border border-slate-200 p-5">
                  <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
                  <ul className="mt-3 divide-y divide-slate-100">
                    {list.map((p) => {
                      const l = packLine(p);
                      return (
                        <li key={`${p.kind}-${p.quantity}`} className="flex items-baseline justify-between gap-3 py-2.5 text-sm">
                          <span className="font-semibold text-slate-900">{l.title}</span>
                          <span className="text-right tabular-nums"><span className="font-semibold text-slate-900">{l.price}</span><span className="block text-xs text-slate-600">{l.unit}</span></span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
            <p className="mt-5 max-w-3xl text-xs leading-relaxed text-slate-600">
              Una petición es un mensaje a un asistente o una acción de IA sencilla. Analizar un documento largo cuenta como 5 y analizar audio o video, como 10 por cada 10 minutos.
            </p>
          </div>
        </section>
      )}

      <section aria-labelledby="todos" className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <h2 id="todos" className="text-xl font-bold text-slate-900">En todos los planes</h2>
        <ul className="mt-4 grid gap-4 text-sm leading-relaxed text-slate-700 md:grid-cols-3">
          <li className="rounded-xl border border-slate-200 bg-white p-4"><strong className="block text-slate-900">Tus datos son tuyos</strong>Si una licencia vence, la cuenta pasa a solo lectura: puedes consultar y exportar todo. Nunca se borra nada.</li>
          <li className="rounded-xl border border-slate-200 bg-white p-4"><strong className="block text-slate-900">Invitados sin costo</strong>Tus auditados del portal PBC y las personas con rol de solo lectura no cuentan como usuarios de pago.</li>
          <li className="rounded-xl border border-slate-200 bg-white p-4"><strong className="block text-slate-900">Cambia cuando quieras</strong>Pasa a otro plan o amplía tu espacio y tus peticiones de IA sin perder lo que ya guardaste.</li>
        </ul>

        <div className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-primary px-6 py-5 text-white">
          <p className="max-w-2xl text-sm leading-relaxed">
            <strong className="block text-base">¿Auditoría interna corporativa o gobierno?</strong>
            Plan Institucional a convenir, con más usuarios, espacio y asistentes.
          </p>
          {(corporateHref || demoHref) && (
            <a href={corporateHref ?? demoHref!} className={`rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-primary transition-colors hover:bg-primary-50 ${FOCUS}`}>
              Hablar con ventas
            </a>
          )}
        </div>
      </section>
    </>
  );
}
