/**
 * Lo que el auditor elige al enviar una CONFIRMACIÓN EXTERNA a firma (docs/firma-externa-por-enlace.md §11.2): valores
 * iniciales y validación previa. Refleja `parseSendPayload` de la API (que vuelve a validar todo); aquí solo se avisa antes
 * de enviar. Lógica pura, sin React.
 */
export type ConfirmationMode = 'POSITIVE_WITH_AMOUNT' | 'POSITIVE_BLANK';

export interface ConfirmationSendPayload {
  mode?: ConfirmationMode;
  asOfDate?: string;
  currency?: string;
  /** Ruta de la carta de autorización ya subida (la devuelve la API). */
  authorizationPath?: string;
  /** Solo para mostrar el nombre en pantalla: la API lo ignora. */
  authorizationName?: string;
  recipientVerified?: boolean;
}

/** Cierre del año anterior: la fecha de corte más habitual de una confirmación. */
export const defaultAsOfDate = (now = new Date()) => `${now.getFullYear() - 1}-12-31`;

export function initialConfirmationPayload(hasAmount: boolean, now = new Date()): ConfirmationSendPayload {
  return {
    mode: hasAmount ? 'POSITIVE_WITH_AMOUNT' : 'POSITIVE_BLANK',
    asOfDate: defaultAsOfDate(now),
    currency: 'USD',
    recipientVerified: false,
  };
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Fecha real (rechaza 2026-02-31) entre 10 años atrás y 2 adelante, igual que el servidor. */
export function isValidAsOfDate(value: string, now = new Date()): boolean {
  if (!ISO_DATE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) return false;
  const year = now.getUTCFullYear();
  return d.getUTCFullYear() >= year - 10 && d.getUTCFullYear() <= year + 2;
}

/** Texto del primer problema, o null si está listo para enviar. */
export function validateConfirmationPayload(p: ConfirmationSendPayload, opts: { hasAmount: boolean; now?: Date }): string | null {
  if (p.mode !== 'POSITIVE_WITH_AMOUNT' && p.mode !== 'POSITIVE_BLANK') return 'Elige el tipo de confirmación: con saldo o con saldo en blanco.';
  if (p.mode === 'POSITIVE_WITH_AMOUNT' && !opts.hasAmount) {
    return 'Esta confirmación no tiene monto registrado: elige «saldo en blanco» o registra primero el monto.';
  }
  if (!p.asOfDate || !isValidAsOfDate(p.asOfDate, opts.now)) return 'Escribe la fecha de corte.';
  if (!/^[A-Za-z]{3}$/.test((p.currency ?? '').trim())) return 'La moneda debe ser un código de 3 letras, por ejemplo USD.';
  if (p.recipientVerified !== true) return 'Marca la casilla: debes verificar de forma independiente que el correo del confirmante es correcto (NIA 505).';
  return null;
}

/** La respuesta que firmó el confirmante (la forma que guarda la API) en líneas «campo → valor» para el panel. */
export function confirmationResponseRows(response: unknown): Array<[string, string]> {
  if (!response || typeof response !== 'object') return [];
  const r = response as { agrees?: unknown; confirmedAmount?: unknown; comments?: unknown };
  const rows: Array<[string, string]> = [];
  if (typeof r.agrees === 'boolean') rows.push(['Respuesta', r.agrees ? 'De acuerdo' : 'En desacuerdo']);
  if (typeof r.confirmedAmount === 'number' && Number.isFinite(r.confirmedAmount)) {
    rows.push(['Saldo según el confirmante', r.confirmedAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })]);
  }
  if (typeof r.comments === 'string' && r.comments.trim()) rows.push(['Comentarios', r.comments.trim()]);
  return rows;
}
