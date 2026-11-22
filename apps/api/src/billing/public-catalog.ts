import { ASSISTANT_KEYS, EXEMPT_PLAN_CODES, FILE_TYPE_KEYS, FUNCTION_KEYS, MODULE_KEYS } from './billing.constants';
import { DEFAULT_LIMITS } from './entitlements';

/**
 * Catálogo PÚBLICO de planes (página /precios, sin sesión). Es una PROYECCIÓN de lista blanca: cada campo que sale se escribe aquí a mano,
 * así que un campo nuevo en la base nunca se publica por accidente. Nunca sale un id, una fecha, un costo interno, el número de suscriptores
 * ni nada de los planes internos (Piloto, Interno, los no públicos o inactivos).
 */

export interface PublicPlanPrice { months: number; priceUsd: number }

export interface PublicPlan {
  code: string;
  name: string;
  audience: 'PERSONA' | 'EMPRESA';
  description: string;
  featured: boolean;
  trialDays: number;
  limits: {
    users: number; maxUsers: number; extraUserPriceUsd: number; storageGb: number; maxFileMb: number; aiRequests: number;
    fileTypes: string[]; packsAi: boolean; packsStorage: boolean;
  };
  modules: string[];
  functions: string[];
  assistants: string[];
  prices: PublicPlanPrice[];
}

export interface PublicPack { kind: 'AI' | 'STORAGE'; name: string; quantity: number; priceUsd: number }

export interface PublicContact { email: string | null; whatsapp: string | null }

export interface PublicCatalog { currency: 'USD'; plans: PublicPlan[]; packs: PublicPack[]; contact: PublicContact }

/** Duraciones que se publican: «sin vencimiento» (0) es solo de planes internos. */
export const PUBLIC_PRICE_MONTHS: readonly number[] = [1, 3, 6, 12];

/** Lo mínimo que se necesita de un plan de la base (Prisma devuelve más; el resto se ignora a propósito). */
export interface PlanSource {
  code: string; name: string; audience: string; description: string; isPublic: boolean; featured: boolean; active: boolean; sortOrder: number;
  trialDays: number; limits: unknown; modules: string[]; functions: string[]; assistants: string[];
  prices: Array<{ months: number; priceUsd: unknown; active: boolean }>;
}

export interface PackSource { kind: string; name: string; quantity: number; priceUsd: unknown; active: boolean; sortOrder: number }

const asRecord = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
/** Número de un valor de la base: número, texto o `Decimal` de Prisma (un objeto con `toNumber()`). Null si no es un número finito. */
const finite = (v: unknown): number | null => {
  let n = Number.NaN;
  if (typeof v === 'number') n = v;
  else if (typeof v === 'string' && v.trim() !== '') n = Number(v);
  else if (v && typeof v === 'object' && typeof (v as { toNumber?: unknown }).toNumber === 'function') n = (v as { toNumber: () => number }).toNumber();
  return Number.isFinite(n) ? n : null;
};
const known = (items: readonly string[] | undefined, allowed: readonly string[]): string[] => [...new Set((items ?? []).filter((i) => allowed.includes(i)))];

function publicLimits(raw: unknown): PublicPlan['limits'] {
  const l = asRecord(raw);
  const num = (key: keyof typeof DEFAULT_LIMITS, fallback: number): number => finite(l[key]) ?? fallback;
  const fileTypes = Array.isArray(l.fileTypes) ? l.fileTypes.filter((t): t is string => typeof t === 'string' && FILE_TYPE_KEYS.includes(t as never)) : DEFAULT_LIMITS.fileTypes;
  return {
    users: num('users', DEFAULT_LIMITS.users), maxUsers: num('maxUsers', DEFAULT_LIMITS.maxUsers), extraUserPriceUsd: num('extraUserPriceUsd', DEFAULT_LIMITS.extraUserPriceUsd),
    storageGb: num('storageGb', DEFAULT_LIMITS.storageGb), maxFileMb: num('maxFileMb', DEFAULT_LIMITS.maxFileMb), aiRequests: num('aiRequests', DEFAULT_LIMITS.aiRequests),
    fileTypes: [...new Set(fileTypes)],
    packsAi: l.packsAi !== false, packsStorage: l.packsStorage !== false,
  };
}

export function isPublishablePlan(p: Pick<PlanSource, 'code' | 'isPublic' | 'active' | 'audience'>): boolean {
  return p.isPublic === true && p.active === true && !EXEMPT_PLAN_CODES.includes(p.code) && (p.audience === 'PERSONA' || p.audience === 'EMPRESA');
}

export function toPublicPlan(p: PlanSource): PublicPlan {
  const prices: PublicPlanPrice[] = [];
  for (const price of p.prices ?? []) {
    const n = finite(price.priceUsd);
    if (price.active !== true || n === null || n < 0 || !PUBLIC_PRICE_MONTHS.includes(price.months)) continue;
    if (prices.some((x) => x.months === price.months)) continue;
    prices.push({ months: price.months, priceUsd: n });
  }
  prices.sort((a, b) => a.months - b.months);
  return {
    code: p.code, name: p.name, audience: p.audience as 'PERSONA' | 'EMPRESA', description: (p.description ?? '').trim().slice(0, 500),
    featured: p.featured === true, trialDays: Math.max(0, Math.floor(finite(p.trialDays) ?? 0)), limits: publicLimits(p.limits),
    modules: known(p.modules, MODULE_KEYS), functions: known(p.functions, FUNCTION_KEYS), assistants: known(p.assistants, ASSISTANT_KEYS), prices,
  };
}

export function toPublicPack(p: PackSource): PublicPack | null {
  const price = finite(p.priceUsd);
  if (p.active !== true || (p.kind !== 'AI' && p.kind !== 'STORAGE') || price === null || price < 0 || !(p.quantity > 0)) return null;
  return { kind: p.kind, name: p.name, quantity: p.quantity, priceUsd: price };
}

/** Correo válido y razonable, o null (lo configura el superadmin en el servidor; aun así no se publica nada raro). */
export function sanitizeEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const e = raw.trim();
  return e.length <= 254 && /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/.test(e) ? e : null;
}

/** WhatsApp: solo dígitos (con país), de 8 a 15; acepta «+», espacios y guiones al escribirlo. Null si no es un número. */
export function sanitizeWhatsapp(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const t = raw.trim();
  if (!/^\+?[\d\s-]+$/.test(t)) return null;
  const digits = t.replace(/\D/g, '');
  return digits.length >= 8 && digits.length <= 15 ? digits : null;
}

export function toPublicCatalog(
  plans: readonly PlanSource[], packs: readonly PackSource[], contact: { email?: unknown; whatsapp?: unknown },
): PublicCatalog {
  const sortedPlans = plans.filter(isPublishablePlan).sort((a, b) => (a.sortOrder - b.sortOrder) || a.name.localeCompare(b.name));
  const sortedPacks = [...packs].sort((a, b) => (a.sortOrder - b.sortOrder) || a.quantity - b.quantity);
  return {
    currency: 'USD',
    plans: sortedPlans.map(toPublicPlan),
    packs: sortedPacks.map(toPublicPack).filter((p): p is PublicPack => p !== null),
    contact: { email: sanitizeEmail(contact.email), whatsapp: sanitizeWhatsapp(contact.whatsapp) },
  };
}
