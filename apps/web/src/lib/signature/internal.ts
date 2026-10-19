/**
 * Lógica PURA de la interfaz INTERNA de la firma por enlace (equipo del despacho): estados, etiquetas, qué acciones
 * permite cada estado y validaciones del formulario de envío. Sin React ni red, para probarla sin navegador.
 * Refleja docs/firma-externa-por-enlace.md §9.2 y §14 y las reglas del servicio (signature-requests.service.ts).
 */

export type SignatureDocumentType = 'ENGAGEMENT_LETTER' | 'EXTERNAL_CONFIRMATION' | 'INTERVIEW_RECORD';
export type SignatureStatus = 'PENDING' | 'VIEWED' | 'SIGNED' | 'DECLINED' | 'REVOKED' | 'EXPIRED';
export type SealStatus = 'NOT_APPLICABLE' | 'PENDING' | 'SEALED' | 'FAILED';

/** Rol mínimo para enviar, reenviar y revocar (el servidor lo vuelve a exigir). */
export const MIN_ROLE_BY_TYPE: Record<SignatureDocumentType, 'AUDIT_MANAGER' | 'AUDITOR'> = {
  ENGAGEMENT_LETTER: 'AUDIT_MANAGER',
  EXTERNAL_CONFIRMATION: 'AUDITOR',
  INTERVIEW_RECORD: 'AUDITOR',
};
/** Plazo por defecto al enviar (§0): carta 30 días; confirmación y acta 15. */
export const DEFAULT_EXPIRY_DAYS: Record<SignatureDocumentType, number> = {
  ENGAGEMENT_LETTER: 30,
  EXTERNAL_CONFIRMATION: 15,
  INTERVIEW_RECORD: 15,
};
/** Rol mínimo para verificar la integridad y bajar el adjunto original sin reconstruir. */
export const MANAGER_ROLE = 'AUDIT_MANAGER';

// ─── Estados ─────────────────────────────────────────────────────────────────
export type Tone = 'blue' | 'indigo' | 'green' | 'red' | 'gray' | 'amber';

export const STATUS_META: Record<SignatureStatus, { label: string; tone: Tone; hint: string }> = {
  PENDING:  { label: 'Pendiente',        tone: 'blue',   hint: 'Enviada; el firmante todavía no la abre.' },
  VIEWED:   { label: 'Abierta',          tone: 'indigo', hint: 'El firmante verificó su correo y ya vio el documento.' },
  SIGNED:   { label: 'Firmada',          tone: 'green',  hint: 'El firmante la firmó.' },
  DECLINED: { label: 'Rechazada',        tone: 'red',    hint: 'El firmante decidió no firmar.' },
  REVOKED:  { label: 'Revocada',         tone: 'gray',   hint: 'Se canceló desde el despacho.' },
  EXPIRED:  { label: 'Vencida',          tone: 'amber',  hint: 'Pasó la fecha límite sin firmarse.' },
};

export const TONE_CHIP: Record<Tone, string> = {
  blue:   'bg-blue-50 text-blue-700 border-blue-200',
  indigo: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  green:  'bg-emerald-50 text-emerald-700 border-emerald-200',
  red:    'bg-red-50 text-red-700 border-red-200',
  gray:   'bg-gray-100 text-gray-600 border-gray-200',
  amber:  'bg-amber-50 text-amber-700 border-amber-200',
};

export const isActive = (s: SignatureStatus) => s === 'PENDING' || s === 'VIEWED';
export const canResend = (s: SignatureStatus) => isActive(s) || s === 'EXPIRED';
export const canRevoke = (s: SignatureStatus) => isActive(s);
export const canReseal = (s: SignatureStatus, seal: SealStatus) => s === 'SIGNED' && (seal === 'PENDING' || seal === 'FAILED');

/** Estado del sellado en palabras (solo tiene sentido en una solicitud firmada). */
export function sealLabel(status: SignatureStatus, seal: SealStatus, timestamped: boolean): { label: string; tone: Tone } | null {
  if (status !== 'SIGNED') return null;
  switch (seal) {
    case 'PENDING': return { label: 'Sellando el PDF…', tone: 'blue' };
    case 'SEALED': return { label: timestamped ? 'Sellado, con sello de tiempo' : 'Sellado (sello de tiempo pendiente)', tone: timestamped ? 'green' : 'amber' };
    case 'FAILED': return { label: 'Falló el sellado', tone: 'red' };
    default: return null;
  }
}

/**
 * La lista se refresca sola: cada pocos segundos mientras algo se está sellando, y más despacio mientras se espera que el
 * firmante abra o firme (así el equipo ve el cambio sin recargar la página).
 */
export const SEAL_POLL_MS = 8000;
export const WAITING_POLL_MS = 30_000;
export function pollInterval(list: Array<{ status: SignatureStatus; sealStatus: SealStatus }> | undefined): number | false {
  if (list?.some((r) => r.status === 'SIGNED' && r.sealStatus === 'PENDING')) return SEAL_POLL_MS;
  if (list?.some((r) => isActive(r.status))) return WAITING_POLL_MS;
  return false;
}

// ─── Bitácora ────────────────────────────────────────────────────────────────
export const EVENT_LABELS: Record<string, string> = {
  CREATED: 'Solicitud creada',
  SENT: 'Correo enviado al firmante',
  RESENT: 'Enlace reenviado',
  REMINDER_SENT: 'Recordatorio enviado',
  OTP_SENT: 'Código de verificación enviado',
  OTP_FAILED: 'Código de verificación incorrecto',
  OTP_LOCKED: 'Verificación bloqueada por demasiados intentos',
  SESSION_STARTED: 'El firmante verificó su correo',
  VIEWED: 'El firmante abrió el documento',
  ATTACHMENT_ACCEPTED: 'Adjunto aceptado',
  ATTACHMENT_REJECTED: 'Adjunto rechazado',
  SIGNED: 'Firmada',
  DECLINED: 'Rechazada por el firmante',
  REVOKED: 'Solicitud revocada',
  EXPIRED: 'Venció sin firmarse',
  SEALED: 'PDF sellado',
  SEAL_FAILED: 'Falló el sellado del PDF',
  TARGET_UPDATED: 'El documento de origen cambió',
  INTEGRITY_FAILED: 'Falló una verificación de integridad',
};

export interface SignatureEventView {
  seq: number;
  type: string;
  at: string;
  ip: string | null;
  userAgent: string | null;
  detail: unknown;
}

const str = (v: unknown, max = 200): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);

export function eventLabel(e: Pick<SignatureEventView, 'type' | 'detail'>): string {
  const d = (e.detail ?? {}) as Record<string, unknown>;
  if (e.type === 'SEALED' && d.phase === 'timestamp') return 'Sello de tiempo aplicado';
  return EVENT_LABELS[e.type] ?? e.type;
}

/** Complemento de una línea de la bitácora (texto plano: se pinta escapado). Los textos del firmante vienen acotados. */
export function eventDetail(e: Pick<SignatureEventView, 'type' | 'detail'>): string | null {
  const d = (e.detail ?? {}) as Record<string, unknown>;
  switch (e.type) {
    case 'SENT': return str(d.to);
    case 'OTP_FAILED': return typeof d.attempt === 'number' ? `Intento ${d.attempt}` : null;
    case 'SIGNED': return str(d.signedName);
    case 'DECLINED':
    case 'REVOKED':
    case 'TARGET_UPDATED': return str(d.reason, 500);
    case 'ATTACHMENT_ACCEPTED':
    case 'ATTACHMENT_REJECTED': return str(d.name);
    case 'SEAL_FAILED': return d.final === true ? 'Se agotaron los reintentos automáticos' : typeof d.attempt === 'number' ? `Intento ${d.attempt}` : null;
    case 'INTEGRITY_FAILED': return d.phase === 'sign' ? 'Al firmar' : d.phase === 'seal' ? 'Al sellar' : d.phase === 'check' ? 'En una revisión manual' : null;
    default: return null;
  }
}

// ─── Integridad (§8) ─────────────────────────────────────────────────────────
export const INTEGRITY_LABELS: Record<string, string> = {
  bitacora_encadenada: 'La bitácora está encadenada y sin alteraciones',
  documento_original: 'El PDF original coincide con su huella',
  pdf_sellado: 'El PDF firmado coincide con su huella',
  cabeza_de_cadena_impresa_en_el_pdf: 'La huella de la bitácora impresa en el PDF está en la bitácora',
};
export const integrityLabel = (name: string) => INTEGRITY_LABELS[name] ?? name;

// ─── Formulario de envío ─────────────────────────────────────────────────────
export const EXPIRY_OPTIONS = [7, 15, 30, 60] as const;

/** Opciones del selector de plazo: las estándar más el valor por defecto del tipo si no está entre ellas. */
export function expiryChoices(defaultDays: number): number[] {
  return [...new Set<number>([...EXPIRY_OPTIONS, defaultDays])].sort((a, b) => a - b);
}

export interface SendFormValues {
  signerName: string;
  signerEmail: string;
  signerRole: string;
  expiresInDays: number;
  reminderEnabled: boolean;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Mismos límites que el DTO del servidor (CreateSignatureRequestDto), para avisar antes de enviar. */
export function validateSendForm(v: SendFormValues): Partial<Record<'signerName' | 'signerEmail' | 'signerRole' | 'expiresInDays', string>> {
  const errors: Partial<Record<'signerName' | 'signerEmail' | 'signerRole' | 'expiresInDays', string>> = {};
  const name = v.signerName.trim();
  if (name.length < 2) errors.signerName = 'Escribe el nombre completo de quien firmará.';
  else if (name.length > 120) errors.signerName = 'El nombre es demasiado largo (máximo 120 caracteres).';
  const email = v.signerEmail.trim();
  if (!email) errors.signerEmail = 'Escribe el correo del firmante.';
  else if (email.length > 254 || !EMAIL_RE.test(email)) errors.signerEmail = 'Escribe un correo válido, por ejemplo nombre@empresa.com.';
  if (v.signerRole.trim().length > 120) errors.signerRole = 'El cargo es demasiado largo (máximo 120 caracteres).';
  if (!Number.isInteger(v.expiresInDays) || v.expiresInDays < 1 || v.expiresInDays > 60) errors.expiresInDays = 'El plazo va de 1 a 60 días.';
  return errors;
}

export function validateReason(reason: string): string | null {
  const t = reason.trim();
  if (t.length < 5) return 'Escribe el motivo (al menos 5 caracteres).';
  if (t.length > 500) return 'El motivo es demasiado largo (máximo 500 caracteres).';
  return null;
}

// ─── Respuesta del firmante (vista genérica) ─────────────────────────────────
const humanize = (key: string) => {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
};

function formatValue(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Sí' : 'No';
  if (typeof v === 'number') return Number.isFinite(v) ? v.toLocaleString('es-SV', { maximumFractionDigits: 2 }) : '—';
  if (typeof v === 'string') return v;
  try { return JSON.stringify(v); } catch { return '—'; }
}

/** Pares «campo → valor» de la respuesta, para el panel. Cada tipo de documento puede pasar sus propias etiquetas. */
export function responseEntries(response: unknown, labels: Record<string, string> = {}): Array<[string, string]> {
  if (!response || typeof response !== 'object' || Array.isArray(response)) return [];
  return Object.entries(response as Record<string, unknown>).map(([k, v]) => [labels[k] ?? humanize(k), formatValue(v)]);
}

/** Ruta de la página pública de verificación con el código ya escrito (el código es público por diseño). */
export const verifyPath = (code: string) => `/verificar#${encodeURIComponent(code)}`;
