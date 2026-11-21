import { type EntitlementKey, ASSISTANT_INFO, entitlementLabel, isAssistantKey, isEntitlementKey } from './catalog';

/**
 * Errores de plan que devuelve el guardián del API:
 *   402 LICENCIA_VENCIDA     — cuenta en solo lectura
 *   403 MODULO_NO_INCLUIDO   — { module }
 *   402 LIMITE_USUARIOS      — { used, allowed }
 *   403 ASISTENTE_NO_INCLUIDO — { assistant }
 * Se convierten en avisos claros en español en vez del error genérico. El cuerpo del error es dato externo: solo se usan
 * claves conocidas y números; nunca se muestra texto del servidor tal cual.
 */

export type BillingErrorCode = 'LICENCIA_VENCIDA' | 'MODULO_NO_INCLUIDO' | 'LIMITE_USUARIOS' | 'ASISTENTE_NO_INCLUIDO';

export interface BillingErrorInfo {
  code: BillingErrorCode;
  status: number;
  /** Módulo o función (solo si es una clave conocida). */
  module?: EntitlementKey;
  assistant?: string;
  used?: number;
  allowed?: number;
}

export interface BillingErrorNotice {
  title: string;
  message: string;
  tone: 'warning' | 'critical';
}

/** Evento de la ventana con el que el cliente de API avisa a la interfaz. */
export const BILLING_ERROR_EVENT = 'auditmind:billing-error';

const CODES: readonly string[] = ['LICENCIA_VENCIDA', 'MODULO_NO_INCLUIDO', 'LIMITE_USUARIOS', 'ASISTENTE_NO_INCLUIDO'];

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const finiteNumber = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

/** Reconoce un error de plan a partir del estado HTTP y el cuerpo JSON; null si no lo es. */
export function parseBillingError(status: number, body: unknown): BillingErrorInfo | null {
  if (status !== 402 && status !== 403) return null;
  if (!isRecord(body) || typeof body.code !== 'string' || !CODES.includes(body.code)) return null;
  const info: BillingErrorInfo = { code: body.code as BillingErrorCode, status };
  if (isEntitlementKey(body.module)) info.module = body.module;
  if (typeof body.assistant === 'string' && isAssistantKey(body.assistant.toUpperCase())) info.assistant = body.assistant.toUpperCase();
  const used = finiteNumber(body.used);
  const allowed = finiteNumber(body.allowed);
  if (used !== undefined) info.used = used;
  if (allowed !== undefined) info.allowed = allowed;
  return info;
}

/** Aviso en español para cada código. */
export function describeBillingError(info: BillingErrorInfo): BillingErrorNotice {
  switch (info.code) {
    case 'LICENCIA_VENCIDA':
      return {
        title: 'Tu cuenta está en solo lectura',
        message: 'Tu licencia venció. Puedes consultar y exportar todo, pero no crear ni editar. No se borró nada: al renovar, vuelve todo a la normalidad.',
        tone: 'critical',
      };
    case 'MODULO_NO_INCLUIDO':
      return {
        title: 'Esto no está en tu plan',
        message: info.module
          ? `El módulo «${entitlementLabel(info.module)}» no está incluido en tu plan. Tus datos no cambian: si lo usaste antes, vuelve tal como lo dejaste cuando se amplíe el plan.`
          : 'Este módulo no está incluido en tu plan. Tus datos no cambian.',
        tone: 'warning',
      };
    case 'LIMITE_USUARIOS':
      return {
        title: 'Llegaste al límite de usuarios',
        message: info.used !== undefined && info.allowed !== undefined
          ? `Tu plan permite ${info.allowed} usuarios y ya tienes ${info.used}. Amplía tu plan o agrega usuarios extra para invitar a más personas.`
          : 'Tu plan ya no tiene plazas libres. Amplía tu plan o agrega usuarios extra para invitar a más personas.',
        tone: 'warning',
      };
    case 'ASISTENTE_NO_INCLUIDO':
      return {
        title: 'Este asistente no está en tu plan',
        message: info.assistant && isAssistantKey(info.assistant)
          ? `El asistente ${info.assistant} (${ASSISTANT_INFO[info.assistant]}) no está incluido en tu plan.`
          : 'Este asistente de IA no está incluido en tu plan.',
        tone: 'warning',
      };
  }
}

/** Avisa a la interfaz (solo en el navegador). Devuelve true si el error era de plan. */
export function emitBillingError(status: number, body: unknown): boolean {
  const info = parseBillingError(status, body);
  if (!info) return false;
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent<BillingErrorInfo>(BILLING_ERROR_EVENT, { detail: info }));
  return true;
}

/** Códigos que muestran el aviso global (los otros dos los muestra cada pantalla con su propio mensaje). */
export function isGlobalBillingNotice(info: BillingErrorInfo): boolean {
  return info.code === 'LICENCIA_VENCIDA' || info.code === 'MODULO_NO_INCLUIDO';
}
