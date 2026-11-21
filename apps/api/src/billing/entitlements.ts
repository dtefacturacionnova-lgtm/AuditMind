import { ENTITLEMENT_KEYS, EntitlementKey } from './billing.constants';

/**
 * Cálculo PURO de los derechos de una organización a partir de su suscripción (sin base de datos: se prueba solo).
 * El estado vigente se deduce de las FECHAS (no depende de que un cron haya corrido): prueba/licencia → gracia → solo lectura → suspendida.
 */

export type EffectiveStatus = 'TRIAL' | 'ACTIVE' | 'GRACE' | 'READ_ONLY' | 'SUSPENDED' | 'CANCELLED';

export interface PlanLimits {
  users: number; // incluidos; -1 = sin tope
  maxUsers: number; // máximo con usuarios extra; -1 = sin tope
  extraUserPriceUsd: number;
  storageGb: number; // -1 = sin tope
  maxFileMb: number; // -1 = sin tope
  aiRequests: number; // peticiones de IA al mes; -1 = sin tope
  fileTypes: string[];
  packsAi: boolean;
  packsStorage: boolean;
}

export interface SubscriptionInput {
  status: string;
  months: number;
  currentPeriodEnd: Date | null;
  trialEndsAt: Date | null;
  planSnapshot: unknown;
  overrides: unknown;
  extraUsers: number;
  exempt: boolean;
}

export interface LifecycleSettings {
  graceDays: number;
  readOnlyDays: number;
}

export interface Entitlements {
  status: EffectiveStatus;
  readOnly: boolean;
  exempt: boolean;
  planCode: string;
  planName: string;
  audience: string;
  endsAt: Date | null; // fin de la prueba o de la licencia (null = sin vencimiento)
  graceEndsAt: Date | null;
  readOnlyEndsAt: Date | null;
  modules: string[];
  functions: string[];
  assistants: string[];
  limits: PlanLimits;
  seatsAllowed: number; // Infinity = sin tope
  /** Lo comprado aparte (paquetes vigentes): GB de espacio extra y peticiones de IA que quedan en paquetes. */
  extra: { storageGb: number; aiPackRemaining: number };
}

export interface PackTotals {
  storageGb: number;
  aiPackRemaining: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export const DEFAULT_LIMITS: PlanLimits = {
  users: 1, maxUsers: 1, extraUserPriceUsd: 0, storageGb: 5, maxFileMb: 100, aiRequests: 500,
  fileTypes: ['PDF', 'FOTO', 'AUDIO', 'PPT', 'XLS', 'OTROS'], packsAi: true, packsStorage: true,
};

/** Suma meses sin desbordar fin de mes (31 ene + 1 mes = 28/29 feb). */
export function addMonths(date: Date, months: number): Date {
  const d = new Date(date.getTime());
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d;
}

const asRecord = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const asStrings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const unique = (items: string[]) => [...new Set(items)];

/** Estado vigente deducido de las fechas. SUSPENDED/CANCELLED fijados a mano se respetan. */
export function computeStatus(sub: SubscriptionInput, settings: LifecycleSettings, now: Date): Pick<Entitlements, 'status' | 'endsAt' | 'graceEndsAt' | 'readOnlyEndsAt'> {
  if (sub.status === 'SUSPENDED' || sub.status === 'CANCELLED') {
    return { status: sub.status, endsAt: sub.currentPeriodEnd, graceEndsAt: null, readOnlyEndsAt: null };
  }
  const inTrial = sub.status === 'TRIAL';
  const endsAt = inTrial ? sub.trialEndsAt : sub.currentPeriodEnd;
  if (!endsAt) return { status: inTrial ? 'TRIAL' : 'ACTIVE', endsAt: null, graceEndsAt: null, readOnlyEndsAt: null };
  const graceEndsAt = new Date(endsAt.getTime() + settings.graceDays * DAY_MS);
  const readOnlyEndsAt = new Date(graceEndsAt.getTime() + settings.readOnlyDays * DAY_MS);
  if (now <= endsAt) return { status: inTrial ? 'TRIAL' : 'ACTIVE', endsAt, graceEndsAt, readOnlyEndsAt };
  if (now <= graceEndsAt) return { status: 'GRACE', endsAt, graceEndsAt, readOnlyEndsAt };
  if (now <= readOnlyEndsAt) return { status: 'READ_ONLY', endsAt, graceEndsAt, readOnlyEndsAt };
  return { status: 'SUSPENDED', endsAt, graceEndsAt, readOnlyEndsAt };
}

/** Plazas de usuario permitidas: incluidas + extras compradas, sin pasar del máximo del plan. */
export function seatsAllowed(limits: PlanLimits, extraUsers: number): number {
  if (limits.users < 0) return Infinity;
  const withExtra = limits.users + Math.max(0, extraUsers);
  return limits.maxUsers < 0 ? withExtra : Math.min(withExtra, Math.max(limits.maxUsers, limits.users));
}

export function computeEntitlements(sub: SubscriptionInput, settings: LifecycleSettings, now: Date = new Date(), packs?: PackTotals): Entitlements {
  const snap = asRecord(sub.planSnapshot);
  const ov = asRecord(sub.overrides);
  const snapLimits = asRecord(snap.limits);
  const ovLimits = asRecord(ov.limits);
  const limits = { ...DEFAULT_LIMITS, ...snapLimits, ...ovLimits } as PlanLimits;

  const withOverrides = (base: string[], add: unknown, remove: unknown) => {
    const removed = new Set(asStrings(remove));
    return unique([...base, ...asStrings(add)]).filter((x) => !removed.has(x));
  };
  const modules = withOverrides(asStrings(snap.modules), ov.addModules, ov.removeModules);
  const functions = withOverrides(asStrings(snap.functions), ov.addFunctions, ov.removeFunctions);
  const assistants = withOverrides(asStrings(snap.assistants), ov.addAssistants, ov.removeAssistants);

  const life = computeStatus(sub, settings, now);
  return {
    ...life,
    readOnly: life.status === 'READ_ONLY' || life.status === 'SUSPENDED' || life.status === 'CANCELLED',
    exempt: sub.exempt,
    planCode: String(snap.code ?? ''),
    planName: String(snap.name ?? ''),
    audience: String(snap.audience ?? ''),
    modules,
    functions,
    assistants,
    limits,
    seatsAllowed: seatsAllowed(limits, sub.extraUsers),
    extra: { storageGb: Math.max(0, packs?.storageGb ?? 0), aiPackRemaining: Math.max(0, packs?.aiPackRemaining ?? 0) },
  };
}

/** Espacio total en GB (plan + paquetes); null = sin tope. */
export function totalStorageGb(ent: Pick<Entitlements, 'limits' | 'extra'>): number | null {
  return ent.limits.storageGb < 0 ? null : ent.limits.storageGb + ent.extra.storageGb;
}

/** ¿Incluye este derecho? (módulo o función; 'CORE' siempre). */
export function hasEntitlement(ent: Pick<Entitlements, 'modules' | 'functions'>, key: EntitlementKey | 'CORE'): boolean {
  if (key === 'CORE') return true;
  return ent.modules.includes(key) || ent.functions.includes(key);
}

export const isEntitlementKey = (k: string): k is EntitlementKey => (ENTITLEMENT_KEYS as readonly string[]).includes(k);
