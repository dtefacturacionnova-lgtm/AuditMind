import type { PlanRow, SubscriptionRow } from './admin-types';
import { STATUS_LABEL, isStatus } from './catalog';
import { EXEMPT_PLAN_CODES } from './plan-form';
import { shortDate } from './subscription-tools';

/**
 * Pantalla «Organizaciones» (solo superadmin): qué planes se ofrecen al crear una organización y cómo se muestra el plan de cada una.
 * Todo es puro y se prueba aparte. La lista sale del catálogo real de planes, no de una lista fija: un plan nuevo o editado aparece solo.
 */

export interface PlanChoice {
  code: string;
  label: string;
  exempt: boolean;
  trialDays: number;
}

export interface PlanChoiceGroup {
  id: 'TRIAL' | 'EXEMPT';
  label: string;
  choices: PlanChoice[];
}

const dayText = (n: number): string => (n > 0 ? `prueba de ${n} ${n === 1 ? 'día' : 'días'}` : 'sin prueba');

const byOrder = (a: PlanRow, b: PlanRow): number => (a.sortOrder - b.sortOrder) || a.name.localeCompare(b.name);

/**
 * Planes que se pueden elegir al crear una organización: solo los activos, en el orden del catálogo, en dos grupos.
 *  · «Con prueba»: los planes de venta (también los no públicos, como Institucional): la organización empieza con su prueba.
 *  · «Sin cobro»: Piloto e Interno (exentos): para clientes actuales y cuentas de la plataforma.
 * Un grupo vacío no se devuelve; sin planes (lista vacía o ausente) devuelve [].
 */
export function planChoiceGroups(plans: readonly PlanRow[] | null | undefined): PlanChoiceGroup[] {
  const active = (Array.isArray(plans) ? plans : [])
    .filter((p) => !!p && typeof p.code === 'string' && p.code !== '' && typeof p.name === 'string' && p.active !== false)
    .sort(byOrder);
  const trial: PlanChoice[] = active
    .filter((p) => !EXEMPT_PLAN_CODES.includes(p.code))
    .map((p) => {
      const trialDays = Math.max(0, Math.floor(Number(p.trialDays) || 0));
      return { code: p.code, exempt: false, trialDays, label: `${p.name} · ${dayText(trialDays)}` };
    });
  const exempt: PlanChoice[] = active
    .filter((p) => EXEMPT_PLAN_CODES.includes(p.code))
    .map((p) => ({ code: p.code, exempt: true, trialDays: 0, label: `${p.name} · exenta, sin vencimiento` }));
  const groups: PlanChoiceGroup[] = [];
  if (trial.length > 0) groups.push({ id: 'TRIAL', label: 'Empiezan con una prueba', choices: trial });
  if (exempt.length > 0) groups.push({ id: 'EXEMPT', label: 'Sin cobro ni vencimiento', choices: exempt });
  return groups;
}

const allChoices = (groups: readonly PlanChoiceGroup[]): PlanChoice[] => groups.flatMap((g) => g.choices);

/** El plan preseleccionado: el plan por defecto de la plataforma si se puede elegir; si no, el primero con prueba; si no, el primero. */
export function defaultPlanCode(groups: readonly PlanChoiceGroup[], preferred?: string | null): string {
  const all = allChoices(groups);
  if (preferred && all.some((c) => c.code === preferred)) return preferred;
  return groups.find((g) => g.id === 'TRIAL')?.choices[0]?.code ?? all[0]?.code ?? '';
}

/** Lo que se manda como `subscriptionTier`: el código elegido si existe en la lista; si no, nada (el API usa su plan por defecto). */
export function tierToSend(selected: string, groups: readonly PlanChoiceGroup[]): string | undefined {
  return allChoices(groups).some((c) => c.code === selected) ? selected : undefined;
}

/** Una frase que explica qué pasa con el plan elegido. */
export function choiceHint(selected: string, groups: readonly PlanChoiceGroup[], enforcementMode?: string | null): string {
  const c = allChoices(groups).find((x) => x.code === selected);
  if (!c) return '';
  const base = c.exempt
    ? 'Sin cobro ni vencimiento: para clientes actuales o cuentas de la plataforma.'
    : `${c.trialDays > 0 ? `Empieza con una ${dayText(c.trialDays)}` : 'Empieza sin prueba'}; después se le asigna una licencia desde «Planes y suscripciones».`;
  return enforcementMode === 'OFF' ? `${base} El cumplimiento de planes está apagado: por ahora el plan no limita nada.` : base;
}

// ── Plan de cada organización en la tabla ──

export interface OrgPlanView {
  name: string;
  /** «Exenta», «En prueba · vence 05/12/2026»… o null si solo se conoce el texto antiguo. */
  detail: string | null;
  exempt: boolean;
  /** true si viene de la suscripción real; false si es el texto antiguo de la organización. */
  fromSubscription: boolean;
}

/** «professional» → «Professional», «empresa_despacho» → «Empresa despacho»; vacío → «—». */
export function prettyLegacyPlan(plan: unknown): string {
  const t = typeof plan === 'string' ? plan.replace(/[_-]+/g, ' ').trim() : '';
  return t === '' ? '—' : t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}

export function subscriptionsByOrg(subs: readonly SubscriptionRow[] | null | undefined): Map<string, SubscriptionRow> {
  const map = new Map<string, SubscriptionRow>();
  for (const s of Array.isArray(subs) ? subs : []) if (s && typeof s.organizationId === 'string') map.set(s.organizationId, s);
  return map;
}

/**
 * El plan de una organización: el de su suscripción (con su estado y vencimiento) si se pudo leer; si no (tablas sin crear, error o todavía
 * cargando), el texto antiguo del campo `plan`, que no se inventa ni se «traduce» a un plan nuevo.
 */
export function orgPlanView(legacyPlan: string, sub: Pick<SubscriptionRow, 'planName' | 'exempt' | 'status' | 'endsAt'> | null | undefined): OrgPlanView {
  if (!sub) return { name: prettyLegacyPlan(legacyPlan), detail: null, exempt: false, fromSubscription: false };
  if (sub.exempt) return { name: sub.planName || prettyLegacyPlan(legacyPlan), detail: 'Exenta', exempt: true, fromSubscription: true };
  const status = isStatus(sub.status) ? STATUS_LABEL[sub.status] : '';
  const until = sub.endsAt ? shortDate(sub.endsAt) : '';
  const detail = [status, until ? `vence ${until}` : ''].filter(Boolean).join(' · ');
  return { name: sub.planName || prettyLegacyPlan(legacyPlan), detail: detail || null, exempt: false, fromSubscription: true };
}
