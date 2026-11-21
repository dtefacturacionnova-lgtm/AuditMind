import type { BillingLimits, EnforcementMode } from './access';
import type { SubscriptionStatus } from './catalog';

/** Formas de las respuestas de /billing-admin/* (apps/api/src/billing). Los Decimal de Prisma llegan como texto. */

export type Money = string | number | null;

export interface PlanPriceRow {
  id?: string;
  planId?: string;
  months: number;
  priceUsd: Money;
  active: boolean;
}

export interface PlanRow {
  id: string;
  code: string;
  name: string;
  audience: 'PERSONA' | 'EMPRESA';
  description: string;
  isPublic: boolean;
  featured: boolean;
  active: boolean;
  sortOrder: number;
  trialDays: number;
  limits: Partial<BillingLimits>;
  modules: string[];
  functions: string[];
  assistants: string[];
  prices: PlanPriceRow[];
  /** Solo viene en la lista (GET /billing-admin/plans). */
  subscribers?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface SubscriptionOverrides {
  addModules?: string[];
  removeModules?: string[];
  addFunctions?: string[];
  removeFunctions?: string[];
  addAssistants?: string[];
  removeAssistants?: string[];
  limits?: Record<string, unknown>;
  [extra: string]: unknown;
}

export interface SubscriptionRow {
  organizationId: string;
  organizationName: string;
  organizationActive: boolean;
  planCode: string;
  planName: string;
  audience: string;
  /** Estado vigente deducido de las fechas. */
  status: SubscriptionStatus;
  /** Estado guardado (TRIAL / ACTIVE / SUSPENDED / CANCELLED). */
  storedStatus: string;
  months: number;
  endsAt: string | null;
  graceEndsAt: string | null;
  trialEndsAt: string | null;
  priceUsd: Money;
  agreedPriceUsd: Money;
  extraUsers: number;
  exempt: boolean;
  notes: string | null;
  overrides: SubscriptionOverrides | null;
  seatsUsed: number;
  /** null = sin tope. */
  seatsAllowed: number | null;
  limits: BillingLimits;
  modules: string[];
  functions: string[];
  assistants: string[];
}

export interface BillingEventRow {
  id: string;
  organizationId: string | null;
  actorId: string | null;
  type: string;
  data: unknown;
  createdAt: string;
}

export interface BillingSettingsRow {
  enforcementMode: EnforcementMode;
  graceDays: number;
  readOnlyDays: number;
  reminderDays: number[];
  costPerRequestUsd: number;
  safetyMultiplier: number;
  weights: { light: number; medium: number; heavy: number };
  ivaPercent: number | null;
  defaultPlanCode: string;
}

/** Valores de respaldo si no se pudo leer (el API usa los mismos por defecto). */
export const FALLBACK_SETTINGS: BillingSettingsRow = {
  enforcementMode: 'OFF', graceDays: 7, readOnlyDays: 60, reminderDays: [7, 1], costPerRequestUsd: 0.0012, safetyMultiplier: 3,
  weights: { light: 1, medium: 5, heavy: 10 }, ivaPercent: null, defaultPlanCode: 'EMPRESA_DESPACHO',
};

export interface OrganizationLite {
  id: string;
  name: string;
  active: boolean;
}
