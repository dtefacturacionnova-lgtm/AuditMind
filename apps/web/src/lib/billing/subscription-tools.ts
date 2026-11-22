import type { BillingEventRow, SubscriptionOverrides, SubscriptionRow } from './admin-types';
import {
  FUNCTION_KEYS, LICENSE_LABEL, MODULE_KEYS, ASSISTANT_KEYS, STATUS_LABEL,
  type SubscriptionStatus, isStatus,
} from './catalog';
import { toNumber } from './pricing';

/** Utilidades puras de la pantalla de Suscripciones (superadmin): textos, filtros, indicadores, ajustes sueltos y registro de actividad. */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Fecha corta dd/mm/aaaa en la zona del navegador (o la indicada). Vacío si no es una fecha válida. */
export function shortDate(iso: string | null | undefined, timeZone?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric', ...(timeZone && { timeZone }) }).format(d);
}

/** Días enteros desde `now` hasta `iso` (negativo si ya pasó); null si no hay fecha válida. */
export function daysUntil(iso: string | null | undefined, now: Date): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.ceil((t - now.getTime()) / DAY_MS);
}

/** Precio de la licencia que realmente se cobra: el pactado si lo hay, si no el del catálogo al contratar. */
export function effectivePrice(row: Pick<SubscriptionRow, 'agreedPriceUsd' | 'priceUsd'>): number | null {
  return toNumber(row.agreedPriceUsd) ?? toNumber(row.priceUsd);
}

/** «Anual · $1,490.00», «Prueba», «Sin vencimiento». */
export function licenseText(row: SubscriptionRow): { main: string; note: string } {
  const price = effectivePrice(row);
  const priceText = price === null ? '' : '$' + price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const agreed = toNumber(row.agreedPriceUsd) !== null ? 'precio pactado' : '';
  if (row.status === 'TRIAL') return { main: 'Prueba', note: '' };
  const label = LICENSE_LABEL[row.months] ?? `${row.months} meses`;
  return { main: priceText ? `${label} · ${priceText}` : label, note: agreed };
}

/** Texto de vigencia según el estado vigente. */
export function expiryText(row: SubscriptionRow, now: Date): string {
  const end = shortDate(row.endsAt);
  const grace = shortDate(row.graceEndsAt);
  const days = daysUntil(row.endsAt, now);
  switch (row.status) {
    case 'TRIAL':
      return end ? `prueba hasta ${end}${days !== null && days >= 0 ? ` (${days} d)` : ''}` : 'prueba sin fecha de fin';
    case 'ACTIVE':
      if (!row.endsAt) return 'sin vencimiento';
      return `${end}${days !== null && days >= 0 ? ` (${days} d)` : ''}`;
    case 'GRACE':
      return `venció ${end}${grace ? ` · gracia hasta ${grace}` : ''}`;
    case 'READ_ONLY':
      return `venció ${end}`;
    case 'SUSPENDED':
    case 'CANCELLED':
      return end ? `corte ${end}` : '—';
  }
}

/** Plazas de usuario: «4 / 5» o «9 / sin tope». */
export function seatsText(row: Pick<SubscriptionRow, 'seatsUsed' | 'seatsAllowed'>): string {
  return `${row.seatsUsed} / ${row.seatsAllowed === null ? 'sin tope' : row.seatsAllowed}`;
}

// ── Indicadores ──

export interface SubscriptionKpis {
  /** Suma de licencias activas o en gracia, llevada a mes (USD). Estimación. */
  monthlyRevenue: number;
  active: number;
  exemptActive: number;
  trial: number;
  /** Días que le quedan a la prueba que termina antes (null si no hay pruebas vigentes). */
  nextTrialDays: number | null;
  graceOrReadOnly: number;
  suspended: number;
}

export function subscriptionKpis(rows: readonly SubscriptionRow[], now: Date): SubscriptionKpis {
  let monthlyRevenue = 0;
  let nextTrialDays: number | null = null;
  for (const r of rows) {
    if ((r.status === 'ACTIVE' || r.status === 'GRACE') && r.months > 0) {
      const price = effectivePrice(r);
      if (price !== null && !(r.exempt && toNumber(r.agreedPriceUsd) === null)) monthlyRevenue += price / r.months;
    }
    if (r.status === 'TRIAL') {
      const d = daysUntil(r.endsAt ?? r.trialEndsAt, now);
      if (d !== null && d >= 0 && (nextTrialDays === null || d < nextTrialDays)) nextTrialDays = d;
    }
  }
  return {
    monthlyRevenue: Math.round(monthlyRevenue * 100) / 100,
    active: rows.filter((r) => r.status === 'ACTIVE').length,
    exemptActive: rows.filter((r) => r.status === 'ACTIVE' && r.exempt).length,
    trial: rows.filter((r) => r.status === 'TRIAL').length,
    nextTrialDays,
    graceOrReadOnly: rows.filter((r) => r.status === 'GRACE' || r.status === 'READ_ONLY').length,
    suspended: rows.filter((r) => r.status === 'SUSPENDED' || r.status === 'CANCELLED').length,
  };
}

// ── Filtros ──

export type ExpiryFilter = 'ALL' | 'SOON7' | 'SOON30' | 'PAST' | 'NONE';
export type SeatsFilter = 'ALL' | 'FULL' | 'FREE';

export interface SubscriptionFilters {
  status: 'ALL' | SubscriptionStatus;
  planCode: 'ALL' | string;
  expiry: ExpiryFilter;
  seats: SeatsFilter;
  q: string;
}

export const NO_FILTERS: SubscriptionFilters = { status: 'ALL', planCode: 'ALL', expiry: 'ALL', seats: 'ALL', q: '' };

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export function filterSubscriptions(rows: readonly SubscriptionRow[], f: SubscriptionFilters, now: Date): SubscriptionRow[] {
  const q = norm(f.q);
  return rows.filter((r) => {
    if (f.status !== 'ALL' && r.status !== f.status) return false;
    if (f.planCode !== 'ALL' && r.planCode !== f.planCode) return false;
    if (q && !norm(r.organizationName).includes(q) && !norm(r.planName).includes(q)) return false;
    if (f.seats === 'FULL' && !(r.seatsAllowed !== null && r.seatsUsed >= r.seatsAllowed)) return false;
    if (f.seats === 'FREE' && !(r.seatsAllowed === null || r.seatsUsed < r.seatsAllowed)) return false;
    if (f.expiry !== 'ALL') {
      const days = daysUntil(r.endsAt, now);
      if (f.expiry === 'NONE') return days === null && r.status !== 'TRIAL' && r.status !== 'SUSPENDED' && r.status !== 'CANCELLED';
      if (days === null) return false;
      if (f.expiry === 'SOON7' && !(days >= 0 && days <= 7)) return false;
      if (f.expiry === 'SOON30' && !(days >= 0 && days <= 30)) return false;
      if (f.expiry === 'PAST' && !(days < 0)) return false;
    }
    return true;
  });
}

// ── Ajustes sueltos por cliente (módulos, funciones y asistentes) ──

export type OverrideKind = 'Modules' | 'Functions' | 'Assistants';
export type OverrideChoice = 'plan' | 'add' | 'remove';

const KIND_UNIVERSE: Record<OverrideKind, readonly string[]> = { Modules: MODULE_KEYS, Functions: FUNCTION_KEYS, Assistants: ASSISTANT_KEYS };

const listOf = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

/** Qué ajuste tiene este cliente sobre un módulo, función o asistente: ninguno (el plan manda), agregado o quitado. */
export function overrideChoice(o: SubscriptionOverrides | null | undefined, kind: OverrideKind, key: string): OverrideChoice {
  if (listOf(o?.[`remove${kind}`]).includes(key)) return 'remove';
  if (listOf(o?.[`add${kind}`]).includes(key)) return 'add';
  return 'plan';
}

/**
 * Nuevo objeto de ajustes con la elección cambiada. CONSERVA todo lo demás (p. ej. `limits`): el API reemplaza el objeto
 * completo de ajustes, así que enviar solo una parte borraría el resto. Las listas vacías se quitan.
 */
export function setOverrideChoice(
  o: SubscriptionOverrides | null | undefined, kind: OverrideKind, key: string, choice: OverrideChoice,
): SubscriptionOverrides {
  const next: SubscriptionOverrides = { ...(o ?? {}) };
  const addKey = `add${kind}`;
  const removeKey = `remove${kind}`;
  const add = listOf(next[addKey]).filter((k) => k !== key);
  const remove = listOf(next[removeKey]).filter((k) => k !== key);
  if (choice === 'add') add.push(key);
  if (choice === 'remove') remove.push(key);
  if (add.length) next[addKey] = add; else delete next[addKey];
  if (remove.length) next[removeKey] = remove; else delete next[removeKey];
  return next;
}

/** Cuántos ajustes sueltos hay (para mostrar «3 ajustes»). */
export function countOverrides(o: SubscriptionOverrides | null | undefined): number {
  let n = 0;
  for (const kind of ['Modules', 'Functions', 'Assistants'] as OverrideKind[]) {
    n += listOf(o?.[`add${kind}`]).filter((k) => KIND_UNIVERSE[kind].includes(k)).length;
    n += listOf(o?.[`remove${kind}`]).filter((k) => KIND_UNIVERSE[kind].includes(k)).length;
  }
  return n;
}

/** ¿Tiene límites propios (que el editor de ajustes conserva pero no edita)? */
export function hasLimitOverrides(o: SubscriptionOverrides | null | undefined): boolean {
  const l = o?.limits;
  return !!l && typeof l === 'object' && !Array.isArray(l) && Object.keys(l).length > 0;
}

/**
 * Reactivar con «estado = ACTIVA» solo es seguro si la cuenta tenía licencia con fecha de fin o no vence por diseño. Una cuenta
 * suspendida que estaba en PRUEBA (sin fin de licencia) quedaría ACTIVA SIN VENCIMIENTO: para esas se debe extender la prueba o
 * asignar un plan.
 */
export function reactivationRisk(row: Pick<SubscriptionRow, 'storedStatus' | 'endsAt' | 'trialEndsAt' | 'months'>): boolean {
  return (row.storedStatus === 'SUSPENDED' || row.storedStatus === 'CANCELLED') && row.endsAt === null && row.trialEndsAt !== null;
}

// ── Efecto de encender el cumplimiento ──

export interface EnforcementImpact {
  total: number;
  exempt: number;
  /** No exentas con licencia vencida o cuenta suspendida: quedarían en solo lectura o bloqueadas. */
  readOnlyOrBlocked: SubscriptionRow[];
  /** No exentas en gracia: avisos, todavía escriben. */
  inGrace: number;
  /** No exentas, vigentes. */
  inForce: number;
}

export function enforcementImpact(rows: readonly SubscriptionRow[]): EnforcementImpact {
  const covered = rows.filter((r) => !r.exempt);
  return {
    total: rows.length,
    exempt: rows.length - covered.length,
    readOnlyOrBlocked: covered.filter((r) => r.status === 'READ_ONLY' || r.status === 'SUSPENDED' || r.status === 'CANCELLED'),
    inGrace: covered.filter((r) => r.status === 'GRACE').length,
    inForce: covered.filter((r) => r.status === 'TRIAL' || r.status === 'ACTIVE').length,
  };
}

// ── Registro de actividad ──

const FIELD_LABEL: Record<string, string> = {
  agreedPriceUsd: 'precio pactado', extraUsers: 'usuarios extra', exempt: 'exención', notes: 'notas',
  overrides: 'módulos y asistentes sueltos', status: 'estado',
};

/** Texto seguro de un dato del registro (viene de la base: se acota y nunca se interpreta como HTML). */
const text = (v: unknown, max = 60): string => {
  if (typeof v === 'string') return v.length > max ? v.slice(0, max) + '…' : v;
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return '';
};

const rec = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** « (correo a 2 de 2 personas)» si el registro trae a cuántas personas se les escribió y a cuántas llegó. */
function reachedText(d: Record<string, unknown>): string {
  return typeof d.emailed === 'number' && typeof d.recipients === 'number'
    ? ` (correo a ${d.emailed} de ${d.recipients} ${d.recipients === 1 ? 'persona' : 'personas'})` : '';
}

export function describeEvent(ev: Pick<BillingEventRow, 'type' | 'data'>, orgName: string | null): string {
  const d = rec(ev.data);
  const org = orgName ? orgName : 'una organización';
  switch (ev.type) {
    case 'SUBSCRIPTION_CREATED': {
      const until = shortDate(typeof d.trialEndsAt === 'string' ? d.trialEndsAt : null);
      return `Se creó la suscripción de ${org} con el plan ${text(d.plan) || '—'}${until ? ` (prueba hasta ${until})` : ''}.`;
    }
    case 'PLAN_ASSIGNED': {
      const months = typeof d.months === 'number' ? d.months : null;
      const lic = months !== null ? (LICENSE_LABEL[months] ?? `${months} meses`).toLowerCase() : '';
      const price = toNumber(d.agreedPriceUsd);
      return `Se asignó el plan ${text(d.plan) || '—'} a ${org}${lic ? ` (${lic})` : ''}${price !== null ? ` con precio pactado de $${price.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : ''}.`;
    }
    case 'RENEWED': {
      const until = shortDate(typeof d.until === 'string' ? d.until : null);
      const m = typeof d.months === 'number' ? d.months : null;
      return `Se renovó la licencia de ${org}${m ? ` por ${m} ${m === 1 ? 'mes' : 'meses'}` : ''}${until ? `, hasta ${until}` : ''}.`;
    }
    case 'TRIAL_EXTENDED': {
      const until = shortDate(typeof d.until === 'string' ? d.until : null);
      const days = typeof d.days === 'number' ? d.days : null;
      return `Se extendió la prueba de ${org}${days ? ` por ${days} ${days === 1 ? 'día' : 'días'}` : ''}${until ? ` (hasta ${until})` : ''}.`;
    }
    case 'SUBSCRIPTION_UPDATED': {
      const fields = listOf(d.fields).map((f) => FIELD_LABEL[f] ?? '').filter(Boolean);
      const st = typeof d.status === 'string' && isStatus(d.status) ? STATUS_LABEL[d.status].toLowerCase() : '';
      return `Se ajustó la suscripción de ${org}${fields.length ? `: ${fields.join(', ')}` : ''}${st ? ` (estado: ${st})` : ''}.`;
    }
    case 'REMINDER_SENT': {
      const days = typeof d.days === 'number' && Number.isInteger(d.days) && d.days > 0 ? d.days : null;
      const what = d.kind === 'EXPIRING' ? `que su licencia o prueba vence${days ? ` (aviso de ${days} ${days === 1 ? 'día' : 'días'})` : ''}`
        : d.kind === 'GRACE' ? 'que su licencia venció y está en periodo de gracia'
        : d.kind === 'READ_ONLY' ? 'que su cuenta pasó a solo lectura'
        : 'del estado de su plan';
      return `Se avisó a ${org} ${what}${reachedText(d)}.`;
    }
    case 'USAGE_ALERT_SENT': {
      const what = d.kind === 'AI_80' ? 'que lleva el 80 % o más de sus peticiones de IA del mes'
        : d.kind === 'AI_100' ? 'que llegó al límite de peticiones de IA del mes'
        : d.kind === 'STORAGE_80' ? 'que lleva el 80 % o más de su espacio'
        : d.kind === 'STORAGE_100' ? 'que su espacio está lleno'
        : 'de su consumo';
      return `Se avisó a ${org} ${what}${reachedText(d)}.`;
    }
    case 'PAYMENT_REQUESTED': {
      const ref = text(d.reference);
      const concept = text(d.concept, 80);
      return `${org} pidió un pago${ref ? ` (${ref})` : ''}${concept ? `: ${concept}` : ''}.`;
    }
    case 'PAYMENT_APPROVED': {
      const ref = text(d.reference);
      const concept = text(d.concept, 80);
      const amount = toNumber(d.amountUsd);
      const money = amount !== null ? ` ($${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})` : '';
      return `Se aprobó el pago${ref ? ` ${ref}` : ''} de ${org}${concept ? `: ${concept}` : ''}${money}.`;
    }
    case 'PAYMENT_REJECTED': {
      const ref = text(d.reference);
      const reason = text(d.reason, 80);
      return `Se rechazó el pago${ref ? ` ${ref}` : ''} de ${org}${reason ? `. Motivo: ${reason}` : ''}.`;
    }
    case 'PACK_CREDITED': {
      const pack = text(d.pack);
      const ref = text(d.reference);
      return `Se acreditó${pack ? ` el paquete ${pack}` : ' un paquete'} a ${org}${ref ? ` (pago ${ref})` : ''}.`;
    }
    case 'PACK_CREATED':
      return `Se creó el paquete ${text(d.code) || '—'}.`;
    case 'PACK_UPDATED':
      return `Se editó el paquete ${text(d.code) || '—'}.`;
    case 'PLAN_CREATED':
      return `Se creó el plan ${text(d.code) || '—'}.`;
    case 'PLAN_UPDATED':
      return `Se editó el plan ${text(d.code) || '—'}.`;
    case 'PLAN_APPLIED': {
      const n = typeof d.updated === 'number' ? d.updated : null;
      return `Se aplicó el plan ${text(d.code) || '—'} a ${n === null ? 'sus' : n} ${n === 1 ? 'cliente' : 'clientes'}.`;
    }
    default:
      return 'Se registró un cambio.';
  }
}

// ── Fechas estimadas de renovación y prueba ──

/** Suma meses sin desbordar fin de mes (31 ene + 1 mes = 28/29 feb). Misma regla que el API (`addMonths`). */
export function addMonthsUtc(date: Date, months: number): Date {
  const d = new Date(date.getTime());
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d;
}

/** Nuevo fin de licencia al renovar: se suma al fin vigente si todavía no venció, si no a partir de hoy (como el API). */
export function renewalEnd(endsAt: string | null | undefined, months: number, now: Date, isTrial = false): Date {
  const end = endsAt ? new Date(endsAt) : null;
  const base = !isTrial && end && !Number.isNaN(end.getTime()) && end > now ? end : now;
  return addMonthsUtc(base, months);
}

/** Nuevo fin de prueba al extenderla: se suma al fin vigente si todavía no venció, si no a partir de hoy (como el API). */
export function trialExtensionEnd(trialEndsAt: string | null | undefined, days: number, now: Date, isTrial = true): Date {
  const end = trialEndsAt ? new Date(trialEndsAt) : null;
  const base = isTrial && end && !Number.isNaN(end.getTime()) && end > now ? end : now;
  return new Date(base.getTime() + days * DAY_MS);
}
