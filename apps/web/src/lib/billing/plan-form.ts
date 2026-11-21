import type { BillingLimits } from './access';
import type { BillingSettingsRow, PlanRow } from './admin-types';
import {
  ASSISTANT_KEYS, FILE_TYPE_KEYS, FUNCTION_KEYS, LICENSE_MONTHS, MODULE_KEYS,
  type AssistantKey, type FileTypeKey, type FunctionKey, type ModuleKey,
  isAssistantKey, suggestAssistants,
} from './catalog';
import {
  STORAGE_USD_PER_GB_R2, STORAGE_USD_PER_GB_SUPABASE, aiExpectedCost, aiSafetyCap, lowestMonthlyPrice, marginOver, storageCost, sumCosts, toNumber,
  type Margin,
} from './pricing';

/**
 * Formulario del editor de planes: estado de los campos (todo texto o casilla, como los escribe la persona), conversión al cuerpo
 * que acepta el API (el ValidationPipe es estricto: solo los campos del DTO y con el tipo exacto), validación y advertencias.
 */

export interface LimitField { unlimited: boolean; value: string }
export interface PriceField { on: boolean; value: string; /** ya existe en la base: no se puede borrar, solo desactivar */ existing: boolean }

export interface PlanFormState {
  code: string;
  name: string;
  description: string;
  audience: 'PERSONA' | 'EMPRESA';
  isPublic: boolean;
  featured: boolean;
  active: boolean;
  sortOrder: string;
  /** Clave = meses de licencia (1, 3, 6, 12; 0 = sin vencimiento). */
  prices: Record<number, PriceField>;
  trialDays: string;
  users: LimitField;
  maxUsers: LimitField;
  extraUserPriceUsd: string;
  storageGb: LimitField;
  maxFileMb: LimitField;
  aiRequests: LimitField;
  fileTypes: Record<FileTypeKey, boolean>;
  packsAi: boolean;
  packsStorage: boolean;
  modules: Record<ModuleKey, boolean>;
  functions: Record<FunctionKey, boolean>;
  assistants: Record<AssistantKey, boolean>;
  /** Mientras sea verdadero, los asistentes siguen a los módulos y funciones marcados (pre-marcado por afinidad). */
  assistantsAuto: boolean;
}

export type LimitKey = 'users' | 'maxUsers' | 'storageGb' | 'maxFileMb' | 'aiRequests';

/** Planes que se pueden asignar sin precio y sin vencimiento (igual que el API: EXEMPT_PLAN_CODES). */
export const EXEMPT_PLAN_CODES: readonly string[] = ['PILOTO', 'INTERNO'];

const recordOf = <K extends string, V>(keys: readonly K[], value: (k: K) => V): Record<K, V> =>
  Object.fromEntries(keys.map((k) => [k, value(k)])) as Record<K, V>;

const limit = (value: number): LimitField => (value < 0 ? { unlimited: true, value: '' } : { unlimited: false, value: String(value) });

/** Mismos valores por defecto que el API (DEFAULT_LIMITS) para un plan nuevo. */
export function emptyPlanForm(): PlanFormState {
  const modules = recordOf(MODULE_KEYS, () => false);
  const functions = recordOf(FUNCTION_KEYS, () => false);
  return {
    code: '', name: '', description: '', audience: 'EMPRESA', isPublic: true, featured: false, active: true, sortOrder: '0',
    prices: Object.fromEntries(LICENSE_MONTHS.map((m) => [m, { on: false, value: '', existing: false }])) as Record<number, PriceField>,
    trialDays: '14',
    users: limit(1), maxUsers: limit(1), extraUserPriceUsd: '0', storageGb: limit(5), maxFileMb: limit(100), aiRequests: limit(500),
    fileTypes: recordOf(FILE_TYPE_KEYS, (k) => k !== 'VIDEO'),
    packsAi: true, packsStorage: true,
    modules, functions,
    assistants: assistantRecord(suggestAssistants(selected(modules), selected(functions))), assistantsAuto: true,
  };
}

function selected(rec: Record<string, boolean>): string[] {
  return Object.keys(rec).filter((k) => rec[k]);
}

function assistantRecord(on: readonly string[]): Record<AssistantKey, boolean> {
  return recordOf(ASSISTANT_KEYS, (k) => on.includes(k));
}

const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x) => b.includes(x));

/** Convierte un plan del API en el estado del formulario. */
export function planToForm(plan: PlanRow): PlanFormState {
  const base = emptyPlanForm();
  const l: Partial<BillingLimits> = plan.limits ?? {};
  const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
  const modules = recordOf(MODULE_KEYS, (k) => (plan.modules ?? []).includes(k));
  const functions = recordOf(FUNCTION_KEYS, (k) => (plan.functions ?? []).includes(k));
  const knownAssistants = (plan.assistants ?? []).filter(isAssistantKey);
  const prices = { ...base.prices };
  for (const p of plan.prices ?? []) {
    if (!(LICENSE_MONTHS as readonly number[]).includes(p.months)) continue;
    const n = toNumber(p.priceUsd);
    prices[p.months] = { on: p.active !== false, value: n === null ? '' : String(n), existing: true };
  }
  const fileTypes: string[] = Array.isArray(l.fileTypes) ? l.fileTypes : FILE_TYPE_KEYS.filter((k) => base.fileTypes[k]);
  return {
    code: plan.code, name: plan.name, description: plan.description ?? '', audience: plan.audience === 'PERSONA' ? 'PERSONA' : 'EMPRESA',
    isPublic: plan.isPublic !== false, featured: plan.featured === true, active: plan.active !== false, sortOrder: String(plan.sortOrder ?? 0),
    prices, trialDays: String(plan.trialDays ?? 14),
    users: limit(num(l.users, 1)), maxUsers: limit(num(l.maxUsers, 1)), extraUserPriceUsd: String(num(l.extraUserPriceUsd, 0)),
    storageGb: limit(num(l.storageGb, 5)), maxFileMb: limit(num(l.maxFileMb, 100)), aiRequests: limit(num(l.aiRequests, 500)),
    fileTypes: recordOf(FILE_TYPE_KEYS, (k) => fileTypes.includes(k)),
    packsAi: l.packsAi !== false, packsStorage: l.packsStorage !== false,
    modules, functions,
    assistants: assistantRecord(knownAssistants),
    assistantsAuto: sameSet(knownAssistants, suggestAssistants(selected(modules), selected(functions))),
  };
}

// ── Edición ──

export function setModule(form: PlanFormState, key: ModuleKey, on: boolean): PlanFormState {
  const modules = { ...form.modules, [key]: on };
  return withAuto({ ...form, modules });
}

export function setFunction(form: PlanFormState, key: FunctionKey, on: boolean): PlanFormState {
  const functions = { ...form.functions, [key]: on };
  return withAuto({ ...form, functions });
}

/** Marcar un asistente a mano deja de seguir a los módulos hasta que se pida «Pre-marcar según módulos». */
export function setAssistant(form: PlanFormState, key: AssistantKey, on: boolean): PlanFormState {
  return { ...form, assistants: { ...form.assistants, [key]: on }, assistantsAuto: false };
}

export function resetAssistants(form: PlanFormState): PlanFormState {
  return withAuto({ ...form, assistantsAuto: true });
}

function withAuto(form: PlanFormState): PlanFormState {
  if (!form.assistantsAuto) return form;
  return { ...form, assistants: assistantRecord(suggestAssistants(selected(form.modules), selected(form.functions))) };
}

// ── Lectura de números ──

/** Entero no negativo escrito solo con dígitos; null si no lo es. */
export function parseWhole(s: string): number | null {
  const t = (s ?? '').trim();
  return /^\d{1,9}$/.test(t) ? Number(t) : null;
}

/** Dinero con hasta 2 decimales (acepta «$» y comas de miles); null si no es un monto válido. */
export function parseMoney(s: string): number | null {
  const t = (s ?? '').trim().replace(/^\$\s*/, '').replace(/,(?=\d{3}(?:\D|$))/g, '');
  return /^\d{1,9}(\.\d{1,2})?$/.test(t) ? Number(t) : null;
}

/** Valor de un límite: -1 si es sin tope; null si el texto no es un entero válido. */
export function limitValue(f: LimitField): number | null {
  return f.unlimited ? -1 : parseWhole(f.value);
}

// ── Validación ──

export type PlanFormErrors = Partial<Record<string, string>>;

export function validatePlanForm(form: PlanFormState, mode: 'create' | 'update'): PlanFormErrors {
  const e: PlanFormErrors = {};
  if (!form.name.trim()) e.name = 'El plan necesita un nombre.';
  else if (form.name.trim().length > 120) e.name = 'El nombre admite hasta 120 caracteres.';
  if (mode === 'create' && !/^[A-Z0-9_]{3,40}$/.test(form.code.trim().toUpperCase())) {
    e.code = 'El código debe tener de 3 a 40 letras, números o guion bajo (sin espacios ni acentos).';
  }
  if (form.description.length > 500) e.description = 'La descripción admite hasta 500 caracteres.';
  const sort = parseWhole(form.sortOrder);
  if (sort === null || sort > 1000) e.sortOrder = 'El orden debe ser un número de 0 a 1000.';
  const trial = parseWhole(form.trialDays);
  if (trial === null || trial > 365) e.trialDays = 'Los días de prueba deben estar entre 0 y 365.';
  const limitFields: Array<[LimitKey, string]> = [
    ['users', 'Los usuarios incluidos'], ['maxUsers', 'El máximo de usuarios'], ['storageGb', 'El espacio'],
    ['maxFileMb', 'El tamaño máximo por archivo'], ['aiRequests', 'Las peticiones de IA'],
  ];
  for (const [k, label] of limitFields) {
    if (limitValue(form[k]) === null) e[k] = `${label} debe ser un número entero (0 o más) o «Sin tope».`;
  }
  const users = limitValue(form.users);
  const maxUsers = limitValue(form.maxUsers);
  if (!e.users && !e.maxUsers && users !== null && maxUsers !== null && users >= 0 && maxUsers >= 0 && maxUsers < users) {
    e.maxUsers = 'El máximo de usuarios no puede ser menor que los usuarios incluidos.';
  }
  if (parseMoney(form.extraUserPriceUsd) === null) e.extraUserPriceUsd = 'El precio del usuario extra debe ser un monto en USD (por ejemplo 19 o 19.50).';
  for (const m of LICENSE_MONTHS) {
    const p = form.prices[m];
    if (p?.on && parseMoney(p.value) === null) e[`price${m}`] = 'Indica un precio en USD (por ejemplo 149 o 149.50).';
  }
  return e;
}

// ── Cuerpo para el API ──

/**
 * Cuerpo de POST /billing-admin/plans (create) o PATCH /billing-admin/plans/:id (update).
 * Solo campos del DTO, con tipos exactos (números y booleanos reales). El código no se envía al actualizar (no se puede cambiar).
 * Supone un formulario ya validado: lo que no se pueda leer se envía como 0.
 */
export function formToDto(form: PlanFormState, mode: 'create' | 'update'): Record<string, unknown> {
  const prices: Array<{ months: number; priceUsd: number; active: boolean }> = [];
  for (const m of LICENSE_MONTHS) {
    const p = form.prices[m];
    if (!p) continue;
    if (p.on) prices.push({ months: m, priceUsd: parseMoney(p.value) ?? 0, active: true });
    else if (p.existing) prices.push({ months: m, priceUsd: parseMoney(p.value) ?? 0, active: false });
  }
  const dto: Record<string, unknown> = {
    name: form.name.trim(),
    audience: form.audience,
    description: form.description,
    isPublic: form.isPublic === true,
    featured: form.featured === true,
    active: form.active === true,
    sortOrder: parseWhole(form.sortOrder) ?? 0,
    trialDays: parseWhole(form.trialDays) ?? 0,
    limits: {
      users: limitValue(form.users) ?? 0,
      maxUsers: limitValue(form.maxUsers) ?? 0,
      extraUserPriceUsd: parseMoney(form.extraUserPriceUsd) ?? 0,
      storageGb: limitValue(form.storageGb) ?? 0,
      maxFileMb: limitValue(form.maxFileMb) ?? 0,
      aiRequests: limitValue(form.aiRequests) ?? 0,
      fileTypes: FILE_TYPE_KEYS.filter((k) => form.fileTypes[k]),
      packsAi: form.packsAi === true,
      packsStorage: form.packsStorage === true,
    },
    modules: MODULE_KEYS.filter((k) => form.modules[k]),
    functions: FUNCTION_KEYS.filter((k) => form.functions[k]),
    assistants: ASSISTANT_KEYS.filter((k) => form.assistants[k]),
    prices,
  };
  if (mode === 'create') dto.code = form.code.trim().toUpperCase();
  return dto;
}

// ── Advertencias (no impiden guardar) ──

export function planWarnings(form: PlanFormState): string[] {
  const w: string[] = [];
  const mods = MODULE_KEYS.filter((k) => form.modules[k]);
  const on = (k: AssistantKey) => form.assistants[k];
  if (form.modules.HORAS && !form.modules.CARTERA) {
    w.push('Horas y Rentabilidad rinde más junto con Cartera de Auditoría Externa (la rentabilidad se calcula por encargo).');
  }
  if ((on('HERMES') || on('SHERLOCK')) && !form.functions.FORENSE) {
    w.push('HERMES o SHERLOCK están marcados, pero la función «Investigador forense» no está incluida en el plan.');
  }
  if ((on('ATLAS') || on('FENIX') || on('MINERVA_QAIP')) && !form.modules.GOBIERNO) {
    w.push('ATLAS, FENIX o MINERVA_QAIP están marcados, pero el módulo «Gobierno Corporativo» no está incluido en el plan.');
  }
  if (mods.length === 0) w.push('El plan solo tiene el núcleo: ningún módulo opcional.');
  const hasPrice = LICENSE_MONTHS.some((m) => form.prices[m]?.on);
  if (!hasPrice && !EXEMPT_PLAN_CODES.includes(form.code.trim().toUpperCase())) {
    w.push('El plan no tiene ningún precio activo: no se podrá asignar a una organización.');
  }
  if (form.aiRequests.unlimited) w.push('Las peticiones de IA están sin tope: el costo de IA de este plan no tiene límite.');
  if (form.storageGb.unlimited) w.push('El espacio está sin tope: el costo de almacenamiento de este plan no tiene límite.');
  if (!FILE_TYPE_KEYS.some((k) => form.fileTypes[k])) w.push('No hay ningún tipo de archivo permitido: nadie podrá subir archivos.');
  if (!form.active) w.push('El plan está inactivo: no se puede asignar a organizaciones nuevas.');
  return w;
}

// ── Resumen económico (solo superadmin) ──

export interface PlanEconomics {
  modulesCount: number;
  functionsCount: number;
  assistantsCount: number;
  aiRequests: number | null; // null = sin tope o inválido
  aiCost: number | null;
  aiCap: number | null;
  storageGb: number | null;
  storageSupabase: number | null;
  storageR2: number | null;
  totalCost: number | null;
  /** Precio por mes más bajo entre las duraciones con vencimiento. */
  monthlyPrice: number | null;
  margin: Margin | null;
}

export function planEconomics(form: PlanFormState, settings: Pick<BillingSettingsRow, 'costPerRequestUsd' | 'safetyMultiplier'>): PlanEconomics {
  const requests = limitValue(form.aiRequests);
  const gb = limitValue(form.storageGb);
  const aiRequests = requests !== null && requests >= 0 ? requests : null;
  const storageGb = gb !== null && gb >= 0 ? gb : null;
  const aiCost = aiRequests === null ? null : aiExpectedCost(aiRequests, settings.costPerRequestUsd);
  const aiCap = aiRequests === null ? null : aiSafetyCap(aiRequests, settings.costPerRequestUsd, settings.safetyMultiplier);
  const storageSupabase = storageGb === null ? null : storageCost(storageGb, STORAGE_USD_PER_GB_SUPABASE);
  const storageR2 = storageGb === null ? null : storageCost(storageGb, STORAGE_USD_PER_GB_R2);
  const totalCost = sumCosts(aiCost, storageSupabase);
  const monthlyPrice = lowestMonthlyPrice(LICENSE_MONTHS.map((m) => ({
    months: m, on: !!form.prices[m]?.on, price: form.prices[m]?.on ? parseMoney(form.prices[m].value) : null,
  })));
  return {
    modulesCount: MODULE_KEYS.filter((k) => form.modules[k]).length,
    functionsCount: FUNCTION_KEYS.filter((k) => form.functions[k]).length,
    assistantsCount: ASSISTANT_KEYS.filter((k) => form.assistants[k]).length,
    aiRequests, aiCost, aiCap, storageGb, storageSupabase, storageR2, totalCost, monthlyPrice,
    margin: marginOver(monthlyPrice, totalCost),
  };
}

/** Módulos y funciones marcados, para la vista previa del menú. */
export function includedKeys(form: PlanFormState): { modules: ModuleKey[]; functions: FunctionKey[] } {
  return { modules: MODULE_KEYS.filter((k) => form.modules[k]), functions: FUNCTION_KEYS.filter((k) => form.functions[k]) };
}

// ── Lista de planes ──

export interface PlanPriceSummary {
  /** Precio de la licencia de 1 mes, si existe y está activo. */
  monthly: number | null;
  /** Precio por mes más bajo entre las duraciones activas con vencimiento (incluye la mensual). */
  lowestPerMonth: number | null;
  /** Hay al menos un precio activo (con o sin vencimiento). */
  hasActivePrice: boolean;
}

export function planPriceSummary(plan: Pick<PlanRow, 'prices'>): PlanPriceSummary {
  const active = (plan.prices ?? []).filter((p) => p.active !== false);
  const one = active.find((p) => p.months === 1);
  return {
    monthly: one ? toNumber(one.priceUsd) : null,
    lowestPerMonth: lowestMonthlyPrice(active.map((p) => ({ months: p.months, on: true, price: toNumber(p.priceUsd) }))),
    hasActivePrice: active.length > 0,
  };
}

