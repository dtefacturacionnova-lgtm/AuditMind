import type { FileTypeKey } from './catalog';

/**
 * Formas de las respuestas de /billing/* que ve el CLIENTE (apps/api/src/billing/billing.controller.ts,
 * payments.service.ts y billing-usage.service.ts). Nada de dinero interno: el cliente solo ve el PRECIO de lo que compra.
 */

export type PaymentStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'EXPIRED';
export type PaymentKind = 'LICENSE' | 'PACK';
/** Métodos que el cliente puede elegir al pedir un pago (WOMPI existe en la base pero aún no se ofrece). */
export type ChosenMethod = 'TRANSFER' | 'QR' | 'CASH';
export type PaymentMethod = ChosenMethod | 'WOMPI';

/** Un pago tal como lo devuelve `present` del API. Los Decimal ya llegan como número y las fechas como texto ISO. */
export interface PaymentRow {
  id: string;
  kind: PaymentKind;
  planCode: string | null;
  months: number | null;
  packCode: string | null;
  concept: string;
  amountUsd: number;
  method: PaymentMethod;
  status: PaymentStatus;
  /** AUD-XXXXXX */
  reference: string;
  /** Hay un comprobante subido (la ruta del archivo nunca se envía al navegador). */
  hasProof: boolean;
  proofName: string | null;
  /** Solo si el pago fue rechazado. */
  rejectedReason: string | null;
  /** Fecha en que se aprobó o se rechazó (el API usa el mismo campo para las dos cosas). */
  approvedAt: string | null;
  expiresAt: string;
  createdAt: string;
  /** Solo viene al crear el pago (texto que carga la plataforma para ese método); en las listas es null. */
  instructions: string | null;
}

/** Paquete que el plan del cliente permite comprar (GET /billing/packs). */
export interface PackRow {
  code: string;
  kind: 'AI' | 'STORAGE';
  name: string;
  /** Peticiones (AI) o GB (STORAGE). */
  quantity: number;
  /** AI: pago único. STORAGE: por mes. */
  priceUsd: number;
  recurring: boolean;
}

/** Cuerpo de POST /billing/payments: SOLO los campos del DTO (el API rechaza cualquier otro). */
export type CreatePaymentBody =
  | { kind: 'LICENSE'; planCode: string; months: number; method: ChosenMethod }
  | { kind: 'PACK'; packCode: string; method: ChosenMethod };

export interface ClientAiUsage {
  /** Peticiones mensuales del plan; null = sin tope. */
  included: number | null;
  /** Gastadas este mes (del plan y de paquetes). */
  used: number;
  usedFromPlan: number;
  /** Lo que queda de los paquetes comprados (no vencen por mes). */
  packRemaining: number;
  /** Lo que se puede gastar todavía (plan + paquetes); null = sin tope. */
  available: number | null;
  byAgent: Array<{ agent: string; requests: number }>;
}

export interface ClientStorageUsage {
  usedBytes: number;
  /** Total con el espacio comprado; null = sin tope. */
  limitGb: number | null;
  includedGb: number | null;
  extraGb: number;
  /** Bytes por tipo de archivo. */
  byType: Partial<Record<FileTypeKey, number>>;
  maxFileMb: number | null;
  fileTypes: string[];
}

/** GET /billing/usage */
export interface ClientUsage {
  periodKey: string;
  ai: ClientAiUsage;
  storage: ClientStorageUsage;
}
