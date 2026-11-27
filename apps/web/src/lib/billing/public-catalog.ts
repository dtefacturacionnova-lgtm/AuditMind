import {
  ASSISTANT_INFO, ASSISTANT_KEYS, FILE_TYPE_INFO, FILE_TYPE_KEYS, FUNCTION_INFO, FUNCTION_KEYS, LICENSE_LABEL, MODULE_INFO, MODULE_KEYS,
  type AssistantKey, type FileTypeKey, type FunctionKey, type ModuleKey,
} from './catalog';
import { packTitle, packUnitText } from './packs';
import { usd } from './pricing';

/**
 * Página PÚBLICA de precios (/precios): lee el catálogo público del API (`GET /public/plans`) y lo prepara para pintarlo. Todo es puro y se prueba
 * aparte. El catálogo viene de un servicio externo a la pantalla, así que se lee con defensas: lo que no tenga la forma esperada se descarta sin romper.
 */

export type PublicAudience = 'PERSONA' | 'EMPRESA';

export interface PublicPlanLimits {
  users: number; maxUsers: number; extraUserPriceUsd: number; storageGb: number; maxFileMb: number; aiRequests: number;
  fileTypes: FileTypeKey[]; packsAi: boolean; packsStorage: boolean;
}

export interface PublicPlanPrice { months: number; priceUsd: number }

export interface PublicPlan {
  code: string;
  name: string;
  audience: PublicAudience;
  description: string;
  featured: boolean;
  trialDays: number;
  limits: PublicPlanLimits;
  modules: ModuleKey[];
  functions: FunctionKey[];
  assistants: AssistantKey[];
  prices: PublicPlanPrice[];
}

export interface PublicPack { kind: 'AI' | 'STORAGE'; name: string; quantity: number; priceUsd: number }
export interface PublicContact { email: string | null; whatsapp: string | null }
export interface PublicCatalog { currency: 'USD'; plans: PublicPlan[]; packs: PublicPack[]; contact: PublicContact }

/** Duraciones que se pueden mostrar, de menor a mayor. */
export const DURATIONS = [1, 3, 6, 12] as const;
export const AUDIENCES: ReadonlyArray<{ id: PublicAudience; label: string }> = [{ id: 'PERSONA', label: 'Personas' }, { id: 'EMPRESA', label: 'Empresas' }];

// ── Lectura defensiva ──

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const text = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const pick = <T extends string>(v: unknown, allowed: readonly T[]): T[] => (Array.isArray(v) ? [...new Set(v.filter((x): x is T => (allowed as readonly string[]).includes(x as string)))] : []);

/** Correo razonable (la página arma un enlace `mailto:` con él). */
export function validEmail(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const e = v.trim();
  return e.length <= 254 && /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/.test(e) ? e : null;
}

/** WhatsApp: solo dígitos (8 a 15). */
export function validWhatsapp(v: unknown): string | null {
  return typeof v === 'string' && /^\d{8,15}$/.test(v.trim()) ? v.trim() : null;
}

function parsePlan(raw: unknown): PublicPlan | null {
  if (!isRecord(raw)) return null;
  const code = text(raw.code, 40);
  const name = text(raw.name, 120);
  if (!code || !name || (raw.audience !== 'PERSONA' && raw.audience !== 'EMPRESA')) return null;
  const l = isRecord(raw.limits) ? raw.limits : {};
  const prices: PublicPlanPrice[] = [];
  for (const p of Array.isArray(raw.prices) ? raw.prices : []) {
    if (!isRecord(p)) continue;
    const months = num(p.months);
    const price = num(p.priceUsd);
    if (months === null || price === null || price < 0 || !(DURATIONS as readonly number[]).includes(months) || prices.some((x) => x.months === months)) continue;
    prices.push({ months, priceUsd: price });
  }
  prices.sort((a, b) => a.months - b.months);
  return {
    code, name, audience: raw.audience, description: text(raw.description, 500), featured: raw.featured === true,
    trialDays: Math.max(0, Math.floor(num(raw.trialDays) ?? 0)),
    limits: {
      users: num(l.users) ?? 1, maxUsers: num(l.maxUsers) ?? 1, extraUserPriceUsd: Math.max(0, num(l.extraUserPriceUsd) ?? 0),
      storageGb: num(l.storageGb) ?? 0, maxFileMb: num(l.maxFileMb) ?? 0, aiRequests: num(l.aiRequests) ?? 0,
      fileTypes: pick(l.fileTypes, FILE_TYPE_KEYS), packsAi: l.packsAi !== false, packsStorage: l.packsStorage !== false,
    },
    modules: pick(raw.modules, MODULE_KEYS), functions: pick(raw.functions, FUNCTION_KEYS), assistants: pick(raw.assistants, ASSISTANT_KEYS), prices,
  };
}

function parsePack(raw: unknown): PublicPack | null {
  if (!isRecord(raw)) return null;
  const quantity = num(raw.quantity);
  const price = num(raw.priceUsd);
  if ((raw.kind !== 'AI' && raw.kind !== 'STORAGE') || quantity === null || quantity <= 0 || price === null || price < 0) return null;
  return { kind: raw.kind, name: text(raw.name, 120), quantity, priceUsd: price };
}

/** Catálogo del API → catálogo seguro para pintar. Null si la respuesta no es un catálogo. */
export function parsePublicCatalog(raw: unknown): PublicCatalog | null {
  if (!isRecord(raw) || !Array.isArray(raw.plans)) return null;
  const contact = isRecord(raw.contact) ? raw.contact : {};
  return {
    currency: 'USD',
    plans: raw.plans.map(parsePlan).filter((p): p is PublicPlan => p !== null),
    packs: (Array.isArray(raw.packs) ? raw.packs : []).map(parsePack).filter((p): p is PublicPack => p !== null),
    contact: { email: validEmail(contact.email), whatsapp: validWhatsapp(contact.whatsapp) },
  };
}

// ── Audiencia y duración ──

export function audiencesIn(plans: readonly PublicPlan[]): PublicAudience[] {
  return AUDIENCES.map((a) => a.id).filter((id) => plans.some((p) => p.audience === id));
}

/** Empresas si hay; si no, la primera que exista. */
export function defaultAudience(plans: readonly PublicPlan[]): PublicAudience | null {
  const present = audiencesIn(plans);
  return present.includes('EMPRESA') ? 'EMPRESA' : (present[0] ?? null);
}

export const plansIn = (plans: readonly PublicPlan[], audience: PublicAudience): PublicPlan[] => plans.filter((p) => p.audience === audience);

/** Duraciones que algún plan de la lista tiene con precio, de menor a mayor. */
export function durationsIn(plans: readonly PublicPlan[]): number[] {
  return DURATIONS.filter((m) => plans.some((p) => p.prices.some((x) => x.months === m)));
}

/** El anual si existe (es la que más conviene mostrar); si no, la más larga. */
export function defaultDuration(durations: readonly number[]): number | null {
  if (durations.length === 0) return null;
  return durations.includes(12) ? 12 : Math.max(...durations);
}

/** Una duración que ya no existe (al cambiar de audiencia) se reemplaza por la mejor disponible. */
export function ensureDuration(current: number, durations: readonly number[]): number | null {
  return durations.includes(current) ? current : defaultDuration(durations);
}

// ── Precios ──

export const priceFor = (plan: Pick<PublicPlan, 'prices'>, months: number): number | null => plan.prices.find((p) => p.months === months)?.priceUsd ?? null;

/** Ahorro (%) de pagar esta duración frente a pagar mes a mes; null si no hay precio mensual o no ahorra. */
export function savingsPercent(plan: Pick<PublicPlan, 'prices'>, months: number): number | null {
  if (months <= 1) return null;
  const monthly = priceFor(plan, 1);
  const price = priceFor(plan, months);
  if (monthly === null || price === null || !(monthly > 0)) return null;
  const pct = Math.round((1 - price / months / monthly) * 100);
  return pct > 0 ? pct : null;
}

/** El mayor ahorro entre los planes, para la etiqueta de la duración («ahorra hasta 17 %»). */
export function bestSavings(plans: readonly PublicPlan[], months: number): number | null {
  let best: number | null = null;
  for (const p of plans) {
    const s = savingsPercent(p, months);
    if (s !== null && (best === null || s > best)) best = s;
  }
  return best;
}

export type PriceView =
  | { priced: true; months: number; perMonth: number; total: number; savings: number | null }
  | { priced: false };

export function priceView(plan: Pick<PublicPlan, 'prices'>, months: number): PriceView {
  const total = priceFor(plan, months);
  if (total === null || months <= 0) return { priced: false };
  return { priced: true, months, perMonth: total / months, total, savings: savingsPercent(plan, months) };
}

/** «$124» si es entero, «$124.17» si no (el titular de la tarjeta no necesita centavos cuando no los hay). */
export function headlinePrice(n: number): string {
  return Number.isInteger(n) ? `$${n.toLocaleString('en-US')}` : usd(n);
}

/** «Facturado $1,490.00 cada 12 meses» / «Se paga cada mes». */
export function billingText(v: Extract<PriceView, { priced: true }>): string {
  return v.months === 1 ? 'Se paga cada mes' : `Se paga ${usd(v.total)} por ${v.months} meses`;
}

export const durationLabel = (months: number): string => LICENSE_LABEL[months] ?? `${months} meses`;

// ── Filas de la tarjeta de un plan ──

const countText = (n: number): string => n.toLocaleString('en-US');

/** «100 GB», «1 TB», «Sin tope». */
export function gbText(gb: number): string {
  if (gb < 0) return 'Sin tope';
  if (gb >= 1000 && gb % 1000 === 0) return `${countText(gb / 1000)} TB`;
  return `${countText(gb)} GB`;
}

/** «500 MB», «2 GB», «Sin tope». */
export function mbText(mb: number): string {
  if (mb < 0) return 'Sin tope';
  if (mb >= 1024 && mb % 1024 === 0) return `${countText(mb / 1024)} GB`;
  return `${countText(mb)} MB`;
}

export interface LimitRow { label: string; value: string }

export function limitRows(plan: Pick<PublicPlan, 'limits' | 'assistants'>): LimitRow[] {
  const l = plan.limits;
  const rows: LimitRow[] = [];
  const usersValue = l.users < 0 ? 'Sin tope' : l.maxUsers > l.users || l.maxUsers < 0
    ? `${countText(l.users)} incluidos${l.maxUsers < 0 ? ', ampliable' : ` (hasta ${countText(l.maxUsers)})`}`
    : countText(l.users);
  rows.push({ label: 'Usuarios', value: usersValue });
  if (l.extraUserPriceUsd > 0 && (l.maxUsers > l.users || l.maxUsers < 0)) rows.push({ label: 'Usuario adicional', value: `${usd(l.extraUserPriceUsd)} al mes` });
  rows.push({ label: 'Espacio', value: gbText(l.storageGb) });
  rows.push({ label: 'Archivo máximo', value: mbText(l.maxFileMb) });
  rows.push({ label: 'Peticiones de IA al mes', value: l.aiRequests < 0 ? 'Sin tope' : countText(l.aiRequests) });
  rows.push({ label: 'Asistentes de IA', value: String(plan.assistants.length) });
  return rows;
}

/** «No admite: Video» cuando el plan deja fuera tipos de archivo (lo que más espacio ocupa); null si admite todos. */
export function fileTypesNote(plan: Pick<PublicPlan, 'limits'>): string | null {
  const allowed = plan.limits.fileTypes;
  if (allowed.length === 0) return null; // el API trata la lista vacía como «sin restricción»
  const excluded = FILE_TYPE_KEYS.filter((k) => !allowed.includes(k));
  return excluded.length === 0 ? null : `No admite: ${excluded.map((k) => FILE_TYPE_INFO[k].label).join(', ')}`;
}

export interface ModuleRow { key: ModuleKey; label: string; included: boolean }

/** Todos los módulos opcionales, marcando cuáles trae el plan. */
export function moduleRows(plan: Pick<PublicPlan, 'modules'>): ModuleRow[] {
  return MODULE_KEYS.map((key) => ({ key, label: MODULE_INFO[key].label, included: plan.modules.includes(key) }));
}

export const CORE_TEXT = 'Núcleo: dashboard, proyectos, papeles de trabajo y hallazgos';

export const functionLabels = (plan: Pick<PublicPlan, 'functions'>): string[] => plan.functions.map((f) => FUNCTION_INFO[f].label);

/** «MINERVA · Planificación y Riesgos». */
export const assistantLines = (plan: Pick<PublicPlan, 'assistants'>): string[] => plan.assistants.map((a) => `${a} · ${ASSISTANT_INFO[a]}`);

export function trialText(plan: Pick<PublicPlan, 'trialDays'>): string | null {
  return plan.trialDays > 0 ? `Prueba de ${plan.trialDays} ${plan.trialDays === 1 ? 'día' : 'días'}` : null;
}

// ── Paquetes ──

export function packGroups(packs: readonly PublicPack[]): { ai: PublicPack[]; storage: PublicPack[] } {
  const bySize = (a: PublicPack, b: PublicPack) => a.quantity - b.quantity;
  return { ai: packs.filter((p) => p.kind === 'AI').sort(bySize), storage: packs.filter((p) => p.kind === 'STORAGE').sort(bySize) };
}

/** «+5,000 peticiones» / «+50 GB» con su precio y precio unitario. */
export function packLine(p: PublicPack): { title: string; price: string; unit: string } {
  return {
    title: packTitle(p),
    price: p.kind === 'STORAGE' ? `${usd(p.priceUsd)} al mes` : usd(p.priceUsd),
    unit: packUnitText({ kind: p.kind, quantity: p.quantity, priceUsd: p.priceUsd }),
  };
}

// ── Contacto (los botones llevan al correo o WhatsApp que configura el superadmin) ──

export type ContactIntent = 'TRIAL' | 'DEMO' | 'CORPORATE';

export function contactMessage(intent: ContactIntent, plan?: Pick<PublicPlan, 'name' | 'trialDays'> | null, months?: number | null): { subject: string; body: string } {
  const when = months ? ` (${durationLabel(months).toLowerCase()})` : '';
  if (intent === 'TRIAL' && plan) {
    const days = plan.trialDays > 0 ? ` de ${plan.trialDays} días` : '';
    return { subject: `Quiero la prueba${days} del plan ${plan.name}`, body: `Hola, quiero probar Nova Criterio con el plan ${plan.name}${when}.\n\nNombre:\nDespacho o empresa:\nTeléfono:` };
  }
  if (intent === 'CORPORATE') {
    return { subject: 'Plan institucional de Nova Criterio', body: 'Hola, represento a una auditoría interna corporativa o institución y quiero conocer el plan institucional.\n\nNombre:\nInstitución:\nTeléfono:' };
  }
  return { subject: 'Quiero una demo de Nova Criterio', body: 'Hola, quiero ver una demo de Nova Criterio.\n\nNombre:\nDespacho o empresa:\nTeléfono:' };
}

/** Enlace de contacto: correo si hay; si no, WhatsApp; si no, null (la página no muestra botones). Todo va codificado. */
export function contactHref(contact: PublicContact | null | undefined, message: { subject: string; body: string }): string | null {
  const email = validEmail(contact?.email);
  if (email) return `mailto:${email}?subject=${encodeURIComponent(message.subject)}&body=${encodeURIComponent(message.body)}`;
  const phone = validWhatsapp(contact?.whatsapp);
  if (phone) return `https://wa.me/${phone}?text=${encodeURIComponent(`${message.subject}\n\n${message.body}`)}`;
  return null;
}
