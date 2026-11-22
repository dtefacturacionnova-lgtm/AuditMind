import type { AdminPackRow, AdminPaymentRow } from './admin-types';
import { packTitle, packUnitText, type PackKind } from './packs';
import { parseMoney } from './plan-form';
import { STORAGE_USD_PER_GB_SUPABASE, aiExpectedCost, marginOver, storageCost, toNumber, usd, type Margin } from './pricing';

/**
 * Editor del catálogo de paquetes (SOLO superadmin): formulario, validación, cuerpos exactos para el API, margen y advertencias.
 * Todo es puro y se prueba aparte; las pantallas solo pintan. Los límites son los del API (SavePackDto y la columna de la base).
 */

export const PACK_KINDS: readonly PackKind[] = ['AI', 'STORAGE'];
export const PACK_KIND_LABEL: Record<PackKind, string> = { AI: 'Peticiones de IA', STORAGE: 'Espacio' };
/** Unidad de la cantidad de cada tipo. */
export const PACK_UNIT: Record<PackKind, string> = { AI: 'peticiones', STORAGE: 'GB' };

export const PACK_CODE_RE = /^[A-Z0-9_]{3,40}$/;
export const PACK_NAME_MAX = 120;
export const PACK_QUANTITY_MAX = 100_000_000;
export const PACK_PRICE_MAX = 9_999_999;
export const PACK_SORT_MAX = 1000;
/** Por debajo de este margen (sobre el costo estimado) se avisa; el diseño apunta a ≈ 60 %–76 %. */
export const LOW_MARGIN_PCT = 40;

export const isPackKind = (v: unknown): v is PackKind => v === 'AI' || v === 'STORAGE';

// ── Formulario ──

export interface PackFormState {
  kind: PackKind;
  /** Solo al crear; después no se puede cambiar. */
  code: string;
  name: string;
  quantity: string;
  price: string;
  sortOrder: string;
  active: boolean;
}

export function emptyPackForm(kind: PackKind = 'AI', sortOrder = 10): PackFormState {
  return { kind, code: '', name: '', quantity: '', price: '', sortOrder: String(sortOrder), active: true };
}

export function packToForm(p: Pick<AdminPackRow, 'kind' | 'code' | 'name' | 'quantity' | 'priceUsd' | 'sortOrder' | 'active'>): PackFormState {
  const price = toNumber(p.priceUsd);
  return {
    kind: isPackKind(p.kind) ? p.kind : 'AI', code: p.code, name: p.name, quantity: String(p.quantity),
    price: price === null ? '' : String(price), sortOrder: String(p.sortOrder ?? 0), active: p.active !== false,
  };
}

/** Orden sugerido para un paquete nuevo: al final del catálogo, de 10 en 10 (queda lugar para intercalar). */
export function nextSortOrder(rows: ReadonlyArray<Pick<AdminPackRow, 'sortOrder'>>): number {
  const max = rows.reduce((m, r) => (Number.isFinite(r.sortOrder) && r.sortOrder > m ? r.sortOrder : m), 0);
  return Math.min(PACK_SORT_MAX, max + 10);
}

// ── Lectura de números ──

/** Entero de 1 a 100,000,000 (acepta comas de miles); null si no lo es. */
export function parseQuantity(s: string): number | null {
  const t = (s ?? '').trim().replace(/,(?=\d{3}(?:\D|$))/g, '');
  if (!/^\d{1,9}$/.test(t)) return null;
  const n = Number(t);
  return n >= 1 && n <= PACK_QUANTITY_MAX ? n : null;
}

/** Precio en USD de 0 a 9,999,999 con hasta 2 decimales; null si no lo es. */
export function parsePackPrice(s: string): number | null {
  const n = parseMoney(s);
  return n !== null && n <= PACK_PRICE_MAX ? n : null;
}

/** Orden: entero de 0 a 1000. */
export function parseSortOrder(s: string): number | null {
  const t = (s ?? '').trim();
  if (!/^\d{1,4}$/.test(t)) return null;
  const n = Number(t);
  return n <= PACK_SORT_MAX ? n : null;
}

// ── Sugerencias ──

/** «+1,000 peticiones de IA», «+50 GB de espacio», «+1 TB de espacio» (como los paquetes de fábrica). */
export function suggestPackName(kind: PackKind, quantity: number | null): string {
  if (quantity === null) return '';
  return `${packTitle({ kind, quantity })} ${kind === 'AI' ? 'de IA' : 'de espacio'}`;
}

/** «AI_1000», «STORAGE_50». */
export function suggestPackCode(kind: PackKind, quantity: number | null): string {
  return quantity === null ? '' : `${kind}_${quantity}`;
}

// ── Validación ──

export type PackField = 'code' | 'name' | 'quantity' | 'price' | 'sortOrder';
export type PackErrors = Partial<Record<PackField, string>>;

export function normalizeCode(raw: string): string {
  return (raw ?? '').trim().toUpperCase();
}

export function validatePackForm(form: PackFormState, mode: 'create' | 'update', existingCodes: readonly string[] = []): PackErrors {
  const e: PackErrors = {};
  if (mode === 'create') {
    const code = normalizeCode(form.code);
    if (!PACK_CODE_RE.test(code)) e.code = 'El código debe tener de 3 a 40 letras, números o guion bajo (sin espacios ni acentos).';
    else if (existingCodes.some((c) => normalizeCode(c) === code)) e.code = `Ya existe el paquete ${code}.`;
  }
  const name = (form.name ?? '').trim();
  if (!name) e.name = 'El paquete necesita un nombre.';
  else if (name.length > PACK_NAME_MAX) e.name = `El nombre admite hasta ${PACK_NAME_MAX} caracteres (ahora tiene ${name.length}).`;
  if (parseQuantity(form.quantity) === null) {
    e.quantity = `La cantidad debe ser un número entero de 1 a ${PACK_QUANTITY_MAX.toLocaleString('en-US')} (${PACK_UNIT[form.kind]}).`;
  }
  if (parsePackPrice(form.price) === null) {
    e.price = `El precio debe ser un monto en USD de 0 a ${PACK_PRICE_MAX.toLocaleString('en-US')} (por ejemplo 5 o 19.50).`;
  }
  if (parseSortOrder(form.sortOrder) === null) e.sortOrder = `El orden debe ser un número de 0 a ${PACK_SORT_MAX}.`;
  return e;
}

// ── Cuerpos para el API ──

export interface CreatePackBody {
  code: string;
  kind: PackKind;
  name: string;
  quantity: number;
  priceUsd: number;
  active: boolean;
  sortOrder: number;
}

/**
 * Cuerpo de POST /billing-admin/packs, con SOLO los campos del DTO (el API rechaza cualquier otro). No se envía `recurring`: el API lo deduce
 * del tipo y no cambia nada de lo que ve o paga el cliente. Null si el formulario no es válido (no se envía nada).
 */
export function buildCreateBody(form: PackFormState, existingCodes: readonly string[] = []): CreatePackBody | null {
  if (Object.keys(validatePackForm(form, 'create', existingCodes)).length > 0) return null;
  return {
    code: normalizeCode(form.code), kind: form.kind, name: form.name.trim(), quantity: parseQuantity(form.quantity)!,
    priceUsd: parsePackPrice(form.price)!, active: form.active === true, sortOrder: parseSortOrder(form.sortOrder)!,
  };
}

export interface UpdatePackBody {
  name?: string;
  quantity?: number;
  priceUsd?: number;
  active?: boolean;
  sortOrder?: number;
}

/**
 * Cuerpo de PATCH /billing-admin/packs/:id: SOLO lo que cambió (el código y el tipo no se pueden cambiar y no se envían nunca).
 * Con `quantityLocked` la cantidad se ignora aunque se haya tocado (hay pagos pendientes). Null si el formulario no es válido o no hay cambios.
 */
export function buildUpdateBody(form: PackFormState, original: Pick<AdminPackRow, 'name' | 'quantity' | 'priceUsd' | 'active' | 'sortOrder'>, opts: { quantityLocked?: boolean } = {}): UpdatePackBody | null {
  if (Object.keys(validatePackForm(form, 'update')).length > 0) return null;
  const body: UpdatePackBody = {};
  const name = form.name.trim();
  if (name !== original.name) body.name = name;
  const quantity = parseQuantity(form.quantity)!;
  if (!opts.quantityLocked && quantity !== original.quantity) body.quantity = quantity;
  const price = parsePackPrice(form.price)!;
  if (price !== toNumber(original.priceUsd)) body.priceUsd = price;
  if ((form.active === true) !== original.active) body.active = form.active === true;
  const sort = parseSortOrder(form.sortOrder)!;
  if (sort !== original.sortOrder) body.sortOrder = sort;
  return Object.keys(body).length > 0 ? body : null;
}

// ── Pagos pendientes por paquete ──

/** Pagos PENDIENTES de cada paquete (por código). Mientras haya alguno no se puede cambiar su cantidad. */
export function pendingByPack(payments: ReadonlyArray<Pick<AdminPaymentRow, 'kind' | 'packCode' | 'status'>> | null | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of payments ?? []) {
    if (p.kind === 'PACK' && p.status === 'PENDING' && typeof p.packCode === 'string' && p.packCode) out[p.packCode] = (out[p.packCode] ?? 0) + 1;
  }
  return out;
}

export function quantityLockText(pending: number): string {
  return `Tiene ${pending} pago${pending === 1 ? '' : 's'} pendiente${pending === 1 ? '' : 's'}: se acreditan con la cantidad vigente al aprobarse, `
    + 'así que no se puede cambiar hasta que se aprueben, se rechacen o venzan. Para otra cantidad, crea un paquete nuevo y desactiva este.';
}

// ── Costo y margen (solo superadmin) ──

export interface PackEconomics {
  /** IA: costo si se gastan todas las peticiones. Espacio: costo mensual de tener el espacio lleno. null si falta un dato. */
  cost: number | null;
  /** Precio menos costo (IA: por la venta; espacio: por mes). */
  margin: Margin | null;
}

export function packEconomics(kind: PackKind, quantity: number | null, price: number | null, costPerRequestUsd: number): PackEconomics {
  if (quantity === null) return { cost: null, margin: null };
  const cost = kind === 'AI' ? aiExpectedCost(quantity, costPerRequestUsd) : storageCost(quantity, STORAGE_USD_PER_GB_SUPABASE);
  return { cost, margin: marginOver(price, cost) };
}

/** Qué significa el costo y el margen de cada tipo, para que no se confundan. */
export const PACK_COST_BASIS: Record<PackKind, string> = {
  AI: 'si el cliente gasta todas las peticiones (costo por petición de los parámetros)',
  STORAGE: 'por mes con el espacio lleno (tarifa ilustrativa de Supabase Pro)',
};

// ── Advertencias (no impiden guardar) ──

export interface PackWarningInput {
  form: PackFormState;
  quantity: number | null;
  price: number | null;
  economics: PackEconomics;
  /** Los demás paquetes del catálogo (sin el que se edita). */
  others: ReadonlyArray<Pick<AdminPackRow, 'kind' | 'quantity' | 'active' | 'name'>>;
}

export function packWarnings(i: PackWarningInput): string[] {
  const w: string[] = [];
  const { form, quantity, price, economics, others } = i;
  if (price === 0) w.push('El precio es $0.00: el cliente recibiría este paquete gratis.');
  if (economics.margin && economics.margin.amount < 0) {
    w.push(`El precio está por debajo del costo estimado (${usd(economics.cost)}): se vendería con pérdida si el cliente lo usa todo.`);
  } else if (economics.margin && economics.margin.pct < LOW_MARGIN_PCT) {
    w.push(`Margen bajo (${economics.margin.pct} %): el diseño busca al menos ${LOW_MARGIN_PCT} %.`);
  }
  if (form.active && quantity !== null) {
    const twin = others.find((o) => o.active && o.kind === form.kind && o.quantity === quantity);
    if (twin) w.push(`Ya hay un paquete activo de ${PACK_KIND_LABEL[form.kind].toLowerCase()} con la misma cantidad («${twin.name}»): el cliente vería dos iguales.`);
  }
  if (!form.active && !others.some((o) => o.active && o.kind === form.kind)) {
    w.push(`Es el único paquete de ${PACK_KIND_LABEL[form.kind].toLowerCase()}: si queda inactivo, los clientes no podrán comprar más ${form.kind === 'AI' ? 'peticiones' : 'espacio'}.`);
  }
  return w;
}

/** Cuántos paquetes ACTIVOS hay de cada tipo (si hay 0, los clientes no pueden comprar ese tipo). */
export function activeCoverage(rows: ReadonlyArray<Pick<AdminPackRow, 'kind' | 'active'>> | null | undefined): Record<PackKind, number> {
  const c: Record<PackKind, number> = { AI: 0, STORAGE: 0 };
  for (const r of rows ?? []) if (r.active && isPackKind(r.kind)) c[r.kind]++;
  return c;
}

// ── Lista ──

/** Orden del catálogo: por «orden» y, a igual orden, por código. No modifica la lista recibida. */
export function sortPacks<T extends Pick<AdminPackRow, 'sortOrder' | 'code'>>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => (a.sortOrder - b.sortOrder) || a.code.localeCompare(b.code));
}

// ── Vista previa: cómo lo ve el cliente (igual que la pantalla «Comprar más») ──

export interface PackPreview {
  title: string;
  name: string;
  priceText: string;
  cadence: string;
  unitText: string;
}

export function packPreview(form: Pick<PackFormState, 'kind' | 'name' | 'quantity' | 'price'>): PackPreview | null {
  const quantity = parseQuantity(form.quantity);
  const price = parsePackPrice(form.price);
  if (quantity === null || price === null) return null;
  return {
    title: packTitle({ kind: form.kind, quantity }),
    name: form.name.trim() || suggestPackName(form.kind, quantity),
    priceText: usd(price),
    cadence: form.kind === 'STORAGE' ? 'al mes' : 'pago único',
    unitText: packUnitText({ kind: form.kind, quantity, priceUsd: price }),
  };
}
