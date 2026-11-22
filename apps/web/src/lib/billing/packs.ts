import type { BillingLimits, BillingMe } from './access';
import type { ClientStorageUsage, ClientAiUsage, PackRow } from './client-types';
import { countText, gbText } from './consumption';
import { EXEMPT_PLAN_CODES } from './plan-form';
import { usd } from './pricing';
import { addMonthsUtc } from './subscription-tools';

/**
 * Paquetes de peticiones de IA y de espacio, y la compra de licencia: lo que se muestra antes de pedir el pago.
 * El monto exacto SIEMPRE lo calcula el servidor al crear el pago; aquí solo hay una estimación para que el cliente sepa qué esperar.
 */

export type PackKind = 'AI' | 'STORAGE';

const isPositive = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;

/** Un paquete utilizable: código, tipo conocido, cantidad positiva y precio válido. Lo demás se descarta sin romper la pantalla. */
export function isUsablePack(p: unknown): p is PackRow {
  if (!p || typeof p !== 'object') return false;
  const r = p as Partial<PackRow>;
  return typeof r.code === 'string' && r.code.trim() !== '' && (r.kind === 'AI' || r.kind === 'STORAGE')
    && isPositive(r.quantity) && typeof r.priceUsd === 'number' && Number.isFinite(r.priceUsd) && r.priceUsd >= 0;
}

/** Paquetes separados por tipo, del más chico al más grande. */
export function groupPacks(rows: unknown): { ai: PackRow[]; storage: PackRow[] } {
  const list = (Array.isArray(rows) ? rows : []).filter(isUsablePack);
  const bySize = (a: PackRow, b: PackRow) => a.quantity - b.quantity;
  return { ai: list.filter((p) => p.kind === 'AI').sort(bySize), storage: list.filter((p) => p.kind === 'STORAGE').sort(bySize) };
}

/** «+5,000 peticiones», «+50 GB», «+1 TB». */
export function packTitle(p: Pick<PackRow, 'kind' | 'quantity'>): string {
  if (p.kind === 'AI') return `+${countText(p.quantity)} peticiones`;
  if (p.quantity >= 1000 && p.quantity % 1000 === 0) return `+${countText(p.quantity / 1000)} TB`;
  return `+${p.quantity.toLocaleString('en-US', { maximumFractionDigits: 1 })} GB`;
}

/** «$20.00 por cada 1,000» (IA) o «$12.00 al mes · $0.240 por GB» (espacio). */
export function packUnitText(p: Pick<PackRow, 'kind' | 'quantity' | 'priceUsd'>): string {
  if (!isPositive(p.quantity) || !Number.isFinite(p.priceUsd)) return '';
  if (p.kind === 'AI') return `${usd((p.priceUsd / p.quantity) * 1000)} por cada 1,000`;
  const perGb = p.priceUsd / p.quantity;
  return `${usd(p.priceUsd)} al mes · ${usd(perGb, perGb < 0.1 ? 3 : 2)} por GB`;
}

export type PacksAvailability =
  | { state: 'OK' }
  | { state: 'PLAN_NO_ADMITE'; message: string }
  | { state: 'SIN_PAQUETES'; message: string };

/**
 * ¿Se pueden comprar paquetes de este tipo? El plan decide si los admite (`packsAi` / `packsStorage`); el catálogo ya viene
 * filtrado por el servidor, así que sin paquetes hay dos causas distintas y se explican distinto.
 */
export function packsAvailability(kind: PackKind, packs: readonly PackRow[], limits: Pick<BillingLimits, 'packsAi' | 'packsStorage'> | null | undefined): PacksAvailability {
  const noun = kind === 'AI' ? 'peticiones de IA' : 'espacio';
  if (limits && (kind === 'AI' ? limits.packsAi : limits.packsStorage) === false) {
    return { state: 'PLAN_NO_ADMITE', message: `Tu plan no admite comprar paquetes de ${noun}. Para ampliar, pide un cambio de plan a la plataforma.` };
  }
  if (packs.length === 0) {
    return { state: 'SIN_PAQUETES', message: `Por ahora no hay paquetes de ${noun} disponibles. Escribe a la plataforma si necesitas más.` };
  }
  return { state: 'OK' };
}

/**
 * Meses de calendario (mínimo 1) hasta el vencimiento: lo que multiplica al precio mensual del espacio. Es la misma regla del servidor
 * (`monthsUntil`), pero solo se estima cuando se sabe con seguridad cuál es la fecha que usará: en prueba o sin plan devuelve null
 * (el servidor lo calcula al crear el pago). Sin fecha de fin se cobran 12.
 */
export function estimateStorageMonths(endsAt: string | null | undefined, status: string | null | undefined, now: Date): number | null {
  if (status === null || status === undefined || status === 'TRIAL') return null;
  if (!endsAt) return 12;
  const end = new Date(endsAt);
  if (Number.isNaN(end.getTime())) return null;
  let n = 1;
  while (n < 120 && addMonthsUtc(now, n) < end) n++;
  return n;
}

export interface PackQuote {
  /** Total estimado en USD; null si todavía no se puede estimar. */
  total: number | null;
  /** Cómo se cobra, en una frase. */
  billing: string;
  /** Meses que se cobran (solo espacio). */
  months: number | null;
}

/** Cuánto cuesta el paquete y cómo se cobra. IA = pago único; espacio = precio mensual × meses hasta el vencimiento. */
export function packQuote(pack: Pick<PackRow, 'kind' | 'priceUsd'>, months: number | null): PackQuote {
  if (pack.kind === 'AI') return { total: pack.priceUsd, billing: 'Pago único · las peticiones no vencen por mes (valen 12 meses)', months: null };
  if (months === null) return { total: null, billing: 'Mensual, hasta el vencimiento de tu licencia (el total se confirma al generar la referencia)', months: null };
  return {
    total: Math.round(pack.priceUsd * months * 100) / 100,
    billing: `${usd(pack.priceUsd)} al mes × ${months} ${months === 1 ? 'mes' : 'meses'} hasta tu vencimiento`,
    months,
  };
}

/** Qué pasa después de comprar, con los números del cliente si se pudieron leer. */
export function afterPurchaseText(
  pack: Pick<PackRow, 'kind' | 'quantity'>,
  usage?: { ai?: Partial<ClientAiUsage> | null; storage?: Partial<ClientStorageUsage> | null } | null,
): string {
  if (pack.kind === 'AI') {
    return `Se suman ${countText(pack.quantity)} peticiones. Se gastan después de las incluidas en tu plan y no se pierden al cambiar de mes (valen 12 meses).`;
  }
  const limit = usage?.storage?.limitGb;
  if (typeof limit === 'number' && Number.isFinite(limit)) {
    return `Tu espacio pasa de ${gbText(limit)} a ${gbText(limit + pack.quantity)} y podrás subir archivos de inmediato al aprobarse el pago.`;
  }
  return `Se suman ${gbText(pack.quantity)} a tu espacio al aprobarse el pago.`;
}

// ── Licencia ──

export interface LicenseAvailability {
  canPay: boolean;
  planCode: string | null;
  planName: string | null;
  /** Por qué no se puede pagar (cuando canPay es falso). */
  reason: string | null;
}

/** ¿Puede esta organización pagar o renovar su licencia por referencia? Usa el plan de GET /billing/me. */
export function licenseAvailability(me: Pick<BillingMe, 'hasSubscription' | 'plan'> | null | undefined): LicenseAvailability {
  if (!me) return { canPay: false, planCode: null, planName: null, reason: 'No se pudo leer tu plan en este momento. Intenta de nuevo en unos minutos.' };
  if (!me.hasSubscription || !me.plan) {
    return { canPay: false, planCode: null, planName: null, reason: 'Tu organización todavía no tiene un plan: contacta a la plataforma para que te asigne uno.' };
  }
  const code = (me.plan.code ?? '').toUpperCase();
  if (EXEMPT_PLAN_CODES.includes(code)) {
    return { canPay: false, planCode: me.plan.code, planName: me.plan.name, reason: `Tu plan (${me.plan.name}) no se paga por referencia: no tiene vencimiento ni necesita renovarse.` };
  }
  return { canPay: true, planCode: me.plan.code, planName: me.plan.name, reason: null };
}

/** Duración que se propone al abrir la compra: la de la licencia actual si es pagable, si no 12 meses. */
export function defaultLicenseMonths(current: number | null | undefined): number {
  return current === 1 || current === 3 || current === 6 || current === 12 ? current : 12;
}

/** «1 mes», «3 meses (trimestral)». */
export function licenseMonthsText(months: number): string {
  const names: Record<number, string> = { 1: 'mensual', 3: 'trimestral', 6: 'semestral', 12: 'anual' };
  const base = `${months} ${months === 1 ? 'mes' : 'meses'}`;
  return names[months] ? `${base} (${names[months]})` : base;
}

export type BuyTab = 'IA' | 'ESPACIO' | 'LICENCIA';

/** Pestaña inicial de «Comprar más» desde la dirección (`?tipo=IA|ESPACIO|LICENCIA`); lo desconocido abre la de peticiones de IA. */
export function parseBuyTab(raw: unknown): BuyTab {
  const v = typeof raw === 'string' ? raw.trim().toUpperCase() : '';
  return v === 'ESPACIO' || v === 'LICENCIA' ? v : 'IA';
}
