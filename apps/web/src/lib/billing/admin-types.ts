import type { BillingLimits, EnforcementMode } from './access';
import type { FileTypeKey, SubscriptionStatus } from './catalog';
import type { PaymentRow } from './client-types';

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
  /** Texto de «cómo pagar» por método (QR, TRANSFER, CASH) que el cliente ve al pedir un pago. */
  paymentInstructions?: Record<string, string>;
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

// ── Pagos y paquetes (GET /billing-admin/payments, /packs) ──

/** Un pago de cualquier organización: lo mismo que ve el cliente más el nombre de la organización. */
export interface AdminPaymentRow extends PaymentRow {
  organizationId: string;
  /** «—» si la organización ya no existe. */
  organizationName: string;
}

/** Paquete del catálogo tal como sale de la base (los Decimal llegan como texto). */
export interface AdminPackRow {
  id: string;
  code: string;
  kind: 'AI' | 'STORAGE';
  name: string;
  quantity: number;
  priceUsd: Money;
  recurring: boolean;
  active: boolean;
  sortOrder: number;
}

// ── Consumo y costos (GET /billing-admin/consumption?period=AAAA-MM) ──

export type StorageBytesByType = Partial<Record<FileTypeKey, number>>;

/** Una organización en la pantalla de consumo. Las peticiones son del mes pedido; el espacio y el ingreso son los de HOY. */
export interface ConsumptionOrgRow {
  organizationId: string;
  organizationName: string;
  planCode: string | null;
  planName: string | null;
  /** Estado vigente de la suscripción (null si no tiene). */
  status: string | null;
  exempt: boolean;
  /** Peticiones del mes, incluidas las pagadas con paquetes. */
  requests: number;
  /** Peticiones mensuales del plan; null = sin tope. */
  requestsIncluded: number | null;
  /** De las peticiones del mes, cuántas salieron de paquetes comprados. */
  packRequests: number;
  /** Costo real de la IA del mes (USD). */
  aiCostUsd: number;
  /** Espacio usado HOY en GB. */
  storageGb: number;
  /** Espacio total (plan + comprado) en GB; null = sin tope. */
  storageLimitGb: number | null;
  /** Bytes por tipo de archivo; null si no se pudo medir. */
  storageByType: StorageBytesByType | null;
  storageCostSupabaseUsd: number;
  storageCostR2Usd: number;
  /** Licencia llevada a mes (precio pactado o del catálogo ÷ meses); 0 si no hay ingreso. */
  monthlyIncomeUsd: number;
  /** IA + espacio (con Supabase). */
  variableCostUsd: number;
  marginUsd: number;
}

export interface ConsumptionAgentRow {
  agent: string;
  requests: number;
  costUsd: number;
}

export interface AdminConsumption {
  periodKey: string;
  costPerRequestUsd: number;
  safetyMultiplier: number;
  /** USD por GB-mes de cada proveedor. */
  rates: { supabase: number; cloudflareR2: number };
  /** Ya viene ordenado por costo variable, de mayor a menor. */
  organizations: ConsumptionOrgRow[];
  agents: ConsumptionAgentRow[];
}
