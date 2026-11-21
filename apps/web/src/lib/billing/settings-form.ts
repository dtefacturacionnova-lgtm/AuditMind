import type { BillingSettingsRow } from './admin-types';
import type { EnforcementMode } from './access';

/** Parámetros de la plataforma: formulario, validación y cuerpo del PATCH (solo lo que cambió). Límites iguales a los del API. */

export interface SettingsFormState {
  graceDays: string;
  readOnlyDays: string;
  costPerRequestUsd: string;
  safetyMultiplier: string;
  defaultPlanCode: string;
}

export type SettingsErrors = Partial<Record<keyof SettingsFormState, string>>;

export function settingsToForm(s: BillingSettingsRow): SettingsFormState {
  return {
    graceDays: String(s.graceDays),
    readOnlyDays: String(s.readOnlyDays),
    costPerRequestUsd: String(s.costPerRequestUsd),
    safetyMultiplier: String(s.safetyMultiplier),
    defaultPlanCode: s.defaultPlanCode,
  };
}

/** Número decimal positivo con hasta `maxDecimals` decimales; null si no lo es. */
export function parseDecimal(s: string, maxDecimals: number): number | null {
  const t = (s ?? '').trim();
  const re = new RegExp(`^\\d{1,6}(\\.\\d{1,${maxDecimals}})?$`);
  return re.test(t) ? Number(t) : null;
}

const whole = (s: string): number | null => (/^\d{1,4}$/.test((s ?? '').trim()) ? Number(s.trim()) : null);

export function validateSettings(f: SettingsFormState): SettingsErrors {
  const e: SettingsErrors = {};
  const grace = whole(f.graceDays);
  if (grace === null || grace > 90) e.graceDays = 'Los días de gracia deben estar entre 0 y 90.';
  const ro = whole(f.readOnlyDays);
  if (ro === null || ro > 365) e.readOnlyDays = 'Los días de solo lectura deben estar entre 0 y 365.';
  if (parseDecimal(f.costPerRequestUsd, 6) === null) e.costPerRequestUsd = 'Escribe el costo por petición en USD (hasta 6 decimales, por ejemplo 0.0012).';
  const mult = parseDecimal(f.safetyMultiplier, 2);
  if (mult === null || mult < 1 || mult > 20) e.safetyMultiplier = 'El multiplicador debe estar entre 1 y 20.';
  const code = f.defaultPlanCode.trim();
  if (!code || code.length > 40) e.defaultPlanCode = 'Elige el plan por defecto.';
  return e;
}

export interface SettingsPatch {
  graceDays?: number;
  readOnlyDays?: number;
  costPerRequestUsd?: number;
  safetyMultiplier?: number;
  defaultPlanCode?: string;
}

/** Cuerpo del PATCH con solo lo que cambió (números reales). Supone un formulario válido. */
export function settingsPatch(f: SettingsFormState, current: BillingSettingsRow): SettingsPatch {
  const p: SettingsPatch = {};
  const grace = whole(f.graceDays);
  if (grace !== null && grace !== current.graceDays) p.graceDays = grace;
  const ro = whole(f.readOnlyDays);
  if (ro !== null && ro !== current.readOnlyDays) p.readOnlyDays = ro;
  const cost = parseDecimal(f.costPerRequestUsd, 6);
  if (cost !== null && cost !== current.costPerRequestUsd) p.costPerRequestUsd = cost;
  const mult = parseDecimal(f.safetyMultiplier, 2);
  if (mult !== null && mult !== current.safetyMultiplier) p.safetyMultiplier = mult;
  const code = f.defaultPlanCode.trim();
  if (code && code !== current.defaultPlanCode) p.defaultPlanCode = code;
  return p;
}

export interface ModeInfo {
  label: string;
  short: string;
  /** Qué pasa en el servidor. */
  server: string;
  /** Qué ven los clientes. */
  clients: string;
}

export const MODE_INFO: Record<EnforcementMode, ModeInfo> = {
  OFF: {
    label: 'Apagado',
    short: 'Nada cambia',
    server: 'El servidor no revisa el plan: nadie se bloquea.',
    clients: 'Los clientes no ven candados ni avisos; todo funciona como siempre. Es el estado inicial.',
  },
  OBSERVE: {
    label: 'Observar',
    short: 'Solo registra',
    server: 'El servidor registra en su bitácora lo que habría bloqueado, pero no bloquea nada.',
    clients: 'Los clientes ven candados en los módulos fuera de su plan y avisos de vigencia, pero pueden seguir entrando. Úsalo una semana antes de aplicar.',
  },
  ENFORCE: {
    label: 'Aplicar',
    short: 'Bloquea de verdad',
    server: 'El servidor bloquea: licencia vencida → solo lectura (402); módulo fuera del plan → 403; tope de usuarios → 402; asistente fuera del plan → 403.',
    clients: 'Los clientes no exentos quedan limitados a su plan. No afecta a organizaciones exentas (Piloto, Interno) ni al SUPER_ADMIN.',
  },
};

export const MODE_ORDER: readonly EnforcementMode[] = ['OFF', 'OBSERVE', 'ENFORCE'];

/** ¿Este cambio de modo necesita la casilla de «entiendo que bloquea de verdad»? Solo al pasar a ENFORCE. */
export function needsStrongConfirmation(from: EnforcementMode, to: EnforcementMode): boolean {
  return to === 'ENFORCE' && from !== 'ENFORCE';
}
