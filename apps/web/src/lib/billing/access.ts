import { type EntitlementKey, type SubscriptionStatus, isEntitlementKey } from './catalog';

/**
 * Qué ve el CLIENTE de su plan (respuesta de GET /billing/me) y las reglas puras para decidir si un módulo se muestra
 * abierto o con candado.
 *
 * REGLA DE ORO — con el interruptor apagado NADA cambia: solo con modo OBSERVE/ENFORCE, suscripción y organización NO exenta
 * hay candados y avisos. Si no se pudo leer el plan (`me` nulo), todo queda abierto (falla abierta): nunca se oculta ni se
 * bloquea nada por no poder leer el plan.
 */

export type EnforcementMode = 'OFF' | 'OBSERVE' | 'ENFORCE';

export interface BillingLimits {
  users: number; // -1 = sin tope
  maxUsers: number;
  extraUserPriceUsd: number;
  storageGb: number;
  maxFileMb: number;
  aiRequests: number;
  fileTypes: string[];
  packsAi: boolean;
  packsStorage: boolean;
}

export interface BillingNotice {
  level: 'info' | 'warning' | 'critical';
  code: string;
  message: string;
}

export interface BillingMe {
  organization: { id: string; name: string };
  enforcementMode: EnforcementMode;
  hasSubscription: boolean;
  plan: { code: string; name: string; audience: string } | null;
  status: SubscriptionStatus | null;
  readOnly: boolean;
  exempt: boolean;
  months: number;
  endsAt: string | null;
  graceEndsAt: string | null;
  daysLeft: number | null;
  modules: string[];
  functions: string[];
  assistants: string[];
  limits: BillingLimits | null;
  seats: { used: number; allowed: number | null };
  notice: BillingNotice | null;
}

type MaybeMe = BillingMe | null | undefined;

const list = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

/** ¿Aplica el plan a esta organización (candados y avisos)? Falso con el interruptor apagado, sin suscripción, exenta o sin datos. */
export function isPlanActive(me: MaybeMe): boolean {
  if (!me) return false;
  if (me.enforcementMode !== 'OBSERVE' && me.enforcementMode !== 'ENFORCE') return false;
  return me.hasSubscription === true && me.exempt !== true;
}

/** ¿El servidor bloquea de verdad? (solo en ENFORCE; en OBSERVE únicamente registra lo que habría bloqueado). */
export function isEnforcing(me: MaybeMe): boolean {
  return isPlanActive(me) && me!.enforcementMode === 'ENFORCE';
}

/** ¿Incluye el plan este módulo o función? Sin plan activo, todo está incluido. */
export function isIncluded(me: MaybeMe, key: EntitlementKey): boolean {
  if (!isPlanActive(me)) return true;
  // Respuesta malformada (sin las listas): no se pudo leer el plan, así que no se bloquea nada.
  if (!Array.isArray(me!.modules) || !Array.isArray(me!.functions)) return true;
  return list(me!.modules).includes(key) || list(me!.functions).includes(key);
}

/** ¿Debe mostrarse con candado? (lo contrario de «incluido»). */
export function isLocked(me: MaybeMe, key: EntitlementKey | null | undefined): boolean {
  if (!key) return false;
  return !isIncluded(me, key);
}

/** ¿Incluye el plan este asistente de IA? */
export function isAssistantIncluded(me: MaybeMe, assistant: string): boolean {
  if (!isPlanActive(me)) return true;
  if (!Array.isArray(me!.assistants)) return true;
  return list(me!.assistants).includes(assistant.toUpperCase());
}

/** Aviso del plan (vencimiento, solo lectura…). Con el interruptor apagado el servidor igual lo calcula, pero la interfaz no lo muestra. */
export function visibleNotice(me: MaybeMe): BillingNotice | null {
  if (!isPlanActive(me) || !me!.notice) return null;
  const n = me!.notice;
  if (typeof n.message !== 'string' || !n.message) return null;
  return n;
}

/** ¿Está la cuenta en solo lectura (licencia vencida) y el plan aplica? */
export function isReadOnlyAccount(me: MaybeMe): boolean {
  return isPlanActive(me) && me!.readOnly === true;
}

/** Valida una clave que viene de la URL o del API. */
export function parseEntitlementKey(raw: unknown): EntitlementKey | null {
  return isEntitlementKey(raw) ? raw : null;
}

/** Texto de un límite numérico: -1 = sin tope. */
export function limitText(value: number | null | undefined, unit = ''): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  if (value < 0) return 'Sin tope';
  return `${value.toLocaleString('en-US')}${unit ? ' ' + unit : ''}`;
}

/** Tamaño máximo por archivo en MB, con GB cuando es redondo. */
export function fileSizeText(mb: number | null | undefined): string {
  if (mb === null || mb === undefined || !Number.isFinite(mb)) return '—';
  if (mb < 0) return 'Sin tope';
  if (mb >= 1024 && mb % 1024 === 0) return `${(mb / 1024).toLocaleString('en-US')} GB`;
  return `${mb.toLocaleString('en-US')} MB`;
}
