import { BadRequestException } from '@nestjs/common';

/**
 * Datos propios de la confirmación externa que el auditor elige al enviarla a firma
 * (docs/firma-externa-por-enlace.md §11.2) y la respuesta que escribe el confirmante. Lógica pura, sin Nest ni BD,
 * para probarla sin armar el servicio.
 */

export const CONFIRMATION_MODES = ['POSITIVE_WITH_AMOUNT', 'POSITIVE_BLANK'] as const;
export type ConfirmationMode = (typeof CONFIRMATION_MODES)[number];

export interface SendPayload {
  mode: ConfirmationMode;
  /** Fecha de corte, YYYY-MM-DD. */
  asOfDate: string;
  /** Código ISO de 3 letras (USD por defecto). */
  currency: string;
  /** Ruta (en Storage) de la carta de autorización ya limpia, o null. */
  authorizationPath: string | null;
  recipientVerified: true;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const CURRENCY = /^[A-Z]{3}$/;
const MAX_AMOUNT = 1e13;

const bad = (message: string) => new BadRequestException(message);

/** Fecha de calendario válida (rechaza 2026-02-31) y razonable: entre 10 años atrás y 2 años adelante. */
function validIsoDate(value: string, now = new Date()): boolean {
  if (!ISO_DATE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) return false;
  const year = now.getUTCFullYear();
  return d.getUTCFullYear() >= year - 10 && d.getUTCFullYear() <= year + 2;
}

/** Valida y normaliza lo que manda el modal. Lanza 400 con un mensaje que el auditor entiende. */
export function parseSendPayload(raw: Record<string, unknown>, opts: { hasAmount: boolean; now?: Date }): SendPayload {
  const mode = raw.mode;
  if (!CONFIRMATION_MODES.includes(mode as ConfirmationMode)) throw bad('Elige el tipo de confirmación: con saldo o con saldo en blanco.');
  if (mode === 'POSITIVE_WITH_AMOUNT' && !opts.hasAmount) {
    throw bad('Esta confirmación no tiene monto registrado: elige «saldo en blanco» o registra primero el monto.');
  }

  const asOfDate = typeof raw.asOfDate === 'string' ? raw.asOfDate.trim() : '';
  if (!validIsoDate(asOfDate, opts.now)) throw bad('Escribe la fecha de corte (por ejemplo 2025-12-31).');

  const currency = (typeof raw.currency === 'string' && raw.currency.trim() ? raw.currency.trim() : 'USD').toUpperCase();
  if (!CURRENCY.test(currency)) throw bad('La moneda debe ser un código de 3 letras, por ejemplo USD.');

  // `=== true`: la casilla de verificación del destinatario no se acepta como texto ("sí", "true", 1…).
  if (raw.recipientVerified !== true) {
    throw bad('Marca la casilla: debes verificar de forma independiente que el correo del confirmante es correcto (NIA 505).');
  }

  let authorizationPath: string | null = null;
  if (raw.authorizationPath !== undefined && raw.authorizationPath !== null && raw.authorizationPath !== '') {
    if (typeof raw.authorizationPath !== 'string' || raw.authorizationPath.length > 300) throw bad('La carta de autorización no es válida.');
    authorizationPath = raw.authorizationPath;
  }

  return { mode: mode as ConfirmationMode, asOfDate, currency, authorizationPath, recipientVerified: true };
}

/** La carta de autorización solo puede ser un PDF que ESTA confirmación subió (la ruta la arma el servidor, no el cliente). */
export function authorizationFolder(auditId: string, confirmationId: string): string {
  return `signature-requests/${auditId}/authorizations/${confirmationId}`;
}

export function isOwnAuthorizationPath(path: string, auditId: string, confirmationId: string): boolean {
  const folder = authorizationFolder(auditId, confirmationId);
  return path.startsWith(`${folder}/`) && /^[0-9a-f-]{36}\.pdf$/.test(path.slice(folder.length + 1));
}

// ─── Respuesta del confirmante ───────────────────────────────────────────────
export interface ConfirmationResponse {
  agrees: boolean;
  confirmedAmount: number | null;
  comments: string;
}

/**
 * `agrees` es obligatorio. `confirmedAmount` es obligatorio si no está de acuerdo o si el saldo venía en blanco; si se manda,
 * debe ser un número ≥ 0 con a lo sumo 2 decimales. `comments` ≤ 4000.
 */
export function parseResponse(raw: unknown, mode: ConfirmationMode): ConfirmationResponse {
  const r = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const allowed = new Set(['agrees', 'confirmedAmount', 'comments']);
  if (Object.keys(r).some((k) => !allowed.has(k))) throw bad('La respuesta contiene datos que no corresponden a este documento.');

  if (typeof r.agrees !== 'boolean') throw bad('Indica si estás de acuerdo.');
  const mustWriteAmount = r.agrees === false || mode === 'POSITIVE_BLANK';

  let confirmedAmount: number | null = null;
  if (r.confirmedAmount !== undefined && r.confirmedAmount !== null) {
    const n = r.confirmedAmount;
    if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > MAX_AMOUNT || Math.abs(n * 100 - Math.round(n * 100)) > 1e-6) {
      throw bad('El saldo debe ser un número mayor o igual a cero, con a lo sumo 2 decimales.');
    }
    confirmedAmount = Math.round(n * 100) / 100;
  }
  if (mustWriteAmount && confirmedAmount === null) {
    throw bad(mode === 'POSITIVE_BLANK' ? 'Escribe el saldo según tus registros.' : 'Si no estás de acuerdo, escribe el saldo según tus registros.');
  }

  const comments = typeof r.comments === 'string' ? r.comments.trim() : '';
  if (r.comments !== undefined && r.comments !== null && typeof r.comments !== 'string') throw bad('Los comentarios deben ser texto.');
  if (comments.length > 4000) throw bad('Los comentarios son demasiado largos (máximo 4000 caracteres).');

  return { agrees: r.agrees, confirmedAmount, comments };
}

/** Qué monto queda como "respuesta" de la confirmación: el saldo mostrado si está de acuerdo, o el que escribió. */
export function responseAmountOf(mode: ConfirmationMode, shownAmount: number | null, r: ConfirmationResponse): number | null {
  if (mode === 'POSITIVE_WITH_AMOUNT' && r.agrees) return shownAmount;
  return r.confirmedAmount;
}
