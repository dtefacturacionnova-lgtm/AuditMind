import type { AdminPaymentRow } from './admin-types';
import type { ChosenMethod, CreatePaymentBody, PaymentMethod, PaymentRow, PaymentStatus } from './client-types';
import { formatBytes } from './consumption';
import { usd } from './pricing';
import { shortDate } from './subscription-tools';

/**
 * Pagos de licencias y paquetes (cliente y superadmin): etiquetas, filtros de la cola de aprobación, validación del comprobante,
 * plazos y cuerpos exactos que se envían al API. Todo es puro: las pantallas solo pintan.
 * Las reglas numéricas (5 pagos pendientes, 5 MB, 14 días) son las del API (apps/api/src/billing/payments.service.ts).
 */

export const MAX_PENDING_PAYMENTS = 5;
export const MAX_PROOF_BYTES = 5 * 1024 * 1024;
export const REJECT_MIN = 3;
export const REJECT_MAX = 500;
/** Duraciones de licencia que se pueden pagar por referencia (sin 0: «sin vencimiento» no se compra). */
export const LICENSE_PURCHASE_MONTHS = [1, 3, 6, 12] as const;

const DAY_MS = 24 * 60 * 60 * 1000;

export type Tone = 'gray' | 'blue' | 'green' | 'amber' | 'red';

// ── Estados ──

export const PAYMENT_STATUSES: readonly PaymentStatus[] = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'EXPIRED'];

export const isPaymentStatus = (v: unknown): v is PaymentStatus => typeof v === 'string' && (PAYMENT_STATUSES as readonly string[]).includes(v);

/** Nombre del estado para los filtros y los contadores. */
export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  PENDING: 'Pendientes', APPROVED: 'Aprobados', REJECTED: 'Rechazados', CANCELLED: 'Cancelados', EXPIRED: 'Vencidos',
};

export interface PaymentStatusView {
  label: string;
  tone: Tone;
  /** Una frase que explica qué sigue (o por qué terminó así). */
  hint: string;
}

/** Etiqueta, color y explicación del estado de UN pago. «Pendiente» con comprobante se muestra como «En revisión». */
export function paymentStatusView(p: Pick<PaymentRow, 'status' | 'hasProof' | 'rejectedReason'>): PaymentStatusView {
  switch (p.status) {
    case 'PENDING':
      return p.hasProof
        ? { label: 'En revisión', tone: 'blue', hint: 'Recibimos tu comprobante. Un administrador de la plataforma lo revisa y te avisamos cuando se acredite.' }
        : { label: 'Falta el comprobante', tone: 'amber', hint: 'Haz el pago con tu referencia y sube el comprobante para que lo revisen.' };
    case 'APPROVED':
      return { label: 'Aprobado', tone: 'green', hint: 'El pago se acreditó en tu cuenta.' };
    case 'REJECTED': {
      const reason = (p.rejectedReason ?? '').trim();
      return { label: 'Rechazado', tone: 'red', hint: reason ? `Motivo: ${reason}` : 'La plataforma rechazó este pago. Escríbele si crees que es un error.' };
    }
    case 'CANCELLED':
      return { label: 'Cancelado', tone: 'gray', hint: 'Cancelaste este pago. No se cobró ni se acreditó nada.' };
    case 'EXPIRED':
      return { label: 'Vencido', tone: 'gray', hint: 'El plazo terminó sin que se aprobara. Si ya pagaste, escribe a la plataforma indicando tu referencia.' };
    default:
      return { label: 'Estado desconocido', tone: 'gray', hint: '' };
  }
}

const METHOD_LABEL: Record<PaymentMethod, string> = {
  TRANSFER: 'Transferencia bancaria', QR: 'QR 365', CASH: 'Efectivo', WOMPI: 'Pago en línea',
};

export function methodLabel(m: unknown): string {
  return typeof m === 'string' && Object.prototype.hasOwnProperty.call(METHOD_LABEL, m) ? METHOD_LABEL[m as PaymentMethod] : 'Otro método';
}

/** Métodos que el cliente puede elegir hoy. El pago en línea se muestra como «Próximamente». */
export const CHOOSABLE_METHODS: ReadonlyArray<{ value: ChosenMethod; label: string; description: string }> = [
  { value: 'QR', label: 'QR 365', description: 'Escanea el código con tu app bancaria y sube el comprobante.' },
  { value: 'TRANSFER', label: 'Transferencia bancaria', description: 'Transfiere a la cuenta de la plataforma con tu referencia y sube el comprobante.' },
  { value: 'CASH', label: 'Efectivo', description: 'Paga en efectivo con tu referencia y sube el comprobante o recibo.' },
];

export const isChosenMethod = (v: unknown): v is ChosenMethod => v === 'TRANSFER' || v === 'QR' || v === 'CASH';

/** «Licencia», «Paquete». */
export function kindLabel(kind: unknown): string {
  return kind === 'LICENSE' ? 'Licencia' : kind === 'PACK' ? 'Paquete' : 'Pago';
}

// ── Plazo ──

/** Plazo para que el pago se apruebe: «Vence el 05/12/2026 · quedan 14 días». Vacío si la fecha no es válida. */
export function deadlineText(expiresAt: string | null | undefined, now: Date): string {
  const end = shortDate(expiresAt);
  if (!end || !expiresAt) return '';
  const ms = new Date(expiresAt).getTime() - now.getTime();
  if (ms <= 0) return `El plazo terminó el ${end}`;
  const days = Math.ceil(ms / DAY_MS);
  if (days <= 1) return `Vence en menos de 24 horas (${end})`;
  return `Vence el ${end} · quedan ${days} días`;
}

// ── Qué se puede hacer con cada pago ──

export interface PaymentActions {
  /** El cliente puede subir (o cambiar) el comprobante. */
  canUploadProof: boolean;
  canCancel: boolean;
  canViewProof: boolean;
  canApprove: boolean;
  canReject: boolean;
  /** Aprobar sin comprobante es posible (efectivo, por ejemplo) pero merece una advertencia. */
  approveWithoutProof: boolean;
}

export function paymentActions(p: Pick<PaymentRow, 'status' | 'hasProof'>): PaymentActions {
  const pending = p.status === 'PENDING';
  return {
    canUploadProof: pending,
    canCancel: pending,
    canViewProof: p.hasProof === true,
    canApprove: pending,
    canReject: pending,
    approveWithoutProof: pending && p.hasProof !== true,
  };
}

/** ¿Ya hay demasiados pagos pendientes para pedir otro? (el API devuelve 409 en ese caso). */
export function pendingLimitReached(rows: ReadonlyArray<Pick<PaymentRow, 'status'>> | null | undefined): boolean {
  if (!rows) return false;
  return rows.filter((r) => r.status === 'PENDING').length >= MAX_PENDING_PAYMENTS;
}

// ── Cola de aprobación (superadmin) ──

export type StatusFilter = 'ALL' | PaymentStatus;

export interface PaymentFilters {
  status: StatusFilter;
  q: string;
}

/** Por defecto la cola muestra lo pendiente. */
export const DEFAULT_PAYMENT_FILTERS: PaymentFilters = { status: 'PENDING', q: '' };

export interface PaymentCounts {
  ALL: number;
  PENDING: number;
  APPROVED: number;
  REJECTED: number;
  CANCELLED: number;
  EXPIRED: number;
  /** De los pendientes, los que ya traen comprobante (los que se pueden revisar). */
  pendingWithProof: number;
}

export function paymentCounts(rows: ReadonlyArray<Pick<PaymentRow, 'status' | 'hasProof'>>): PaymentCounts {
  const c: PaymentCounts = { ALL: 0, PENDING: 0, APPROVED: 0, REJECTED: 0, CANCELLED: 0, EXPIRED: 0, pendingWithProof: 0 };
  for (const r of rows) {
    c.ALL++;
    if (isPaymentStatus(r.status)) c[r.status]++;
    if (r.status === 'PENDING' && r.hasProof) c.pendingWithProof++;
  }
  return c;
}

/** Minúsculas sin acentos para buscar. */
const fold = (s: string): string => (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
/** Solo letras y números: «aud-8m1» y «AUD 8M1» se buscan igual. */
const refKey = (s: string): string => fold(s).replace(/[^a-z0-9]/g, '');

/** Filtra por estado y por texto (nombre de la organización o referencia). */
export function filterPayments<T extends Pick<AdminPaymentRow, 'status' | 'organizationName' | 'reference'>>(rows: readonly T[], f: PaymentFilters): T[] {
  const text = fold(f.q);
  const ref = refKey(f.q);
  return rows.filter((r) => {
    if (f.status !== 'ALL' && r.status !== f.status) return false;
    if (!text) return true;
    return fold(r.organizationName ?? '').includes(text) || (ref.length > 0 && refKey(r.reference ?? '').includes(ref));
  });
}

const time = (iso: string): number => {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
};

/**
 * Orden de la cola: primero lo pendiente (con comprobante antes que sin él, y lo más antiguo primero: se atiende en el orden
 * en que llegó); después lo ya resuelto, lo más reciente primero. No modifica la lista recibida.
 */
export function sortQueue<T extends Pick<PaymentRow, 'status' | 'hasProof' | 'createdAt'>>(rows: readonly T[]): T[] {
  const rank = (r: T) => (r.status === 'PENDING' ? (r.hasProof ? 0 : 1) : 2);
  return [...rows].sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra - rb;
    const d = time(a.createdAt) - time(b.createdAt);
    return ra === 2 ? -d : d;
  });
}

/** «Mis pagos»: lo pendiente primero (lo más reciente arriba) y luego el historial, también del más reciente al más antiguo. No modifica la lista. */
export function sortMine<T extends Pick<PaymentRow, 'status' | 'createdAt'>>(rows: readonly T[]): T[] {
  const rank = (r: T) => (r.status === 'PENDING' ? 0 : 1);
  return [...rows].sort((a, b) => rank(a) - rank(b) || time(b.createdAt) - time(a.createdAt));
}

// ── Qué hará aprobar ──

export interface ApprovalContext {
  /** Código del plan que tiene hoy la organización (null = todavía no tiene suscripción; undefined = no se pudo saber). */
  currentPlanCode?: string | null;
  /** Datos del paquete, si se pudieron leer del catálogo. */
  pack?: { kind: 'AI' | 'STORAGE'; quantity: number } | null;
}

const monthsText = (n: number | null): string => (n === null ? 'la duración indicada' : n === 1 ? '1 mes' : `${n} meses`);

/** Frases que explican, antes de confirmar, qué ocurre al aprobar este pago (el servidor decide igual: renovar si es el mismo plan). */
export function approvalEffect(p: Pick<AdminPaymentRow, 'kind' | 'planCode' | 'months' | 'packCode' | 'concept' | 'organizationName'>, ctx: ApprovalContext = {}): string[] {
  const org = p.organizationName || 'la organización';
  if (p.kind === 'LICENSE') {
    const plan = p.planCode ?? 'el plan indicado';
    const dur = monthsText(p.months);
    if (ctx.currentPlanCode === undefined) {
      return [`Renovará o asignará la licencia ${plan} por ${dur} a ${org}: si ya tiene ese plan se renueva, si no se le asigna.`];
    }
    if (ctx.currentPlanCode !== null && ctx.currentPlanCode === p.planCode) {
      return [
        `Renovará la licencia de ${org} (plan ${plan}) por ${dur}.`,
        'La renovación se suma a la vigencia actual; si ya venció o estaba en prueba, cuenta desde hoy y la cuenta vuelve a estar activa.',
      ];
    }
    return [
      ctx.currentPlanCode === null
        ? `Asignará el plan ${plan} a ${org} por ${dur}, desde hoy (todavía no tiene suscripción).`
        : `Asignará el plan ${plan} a ${org} por ${dur}, desde hoy. Reemplaza su plan actual (${ctx.currentPlanCode}).`,
    ];
  }
  const lines = [`Acreditará el paquete «${p.concept || p.packCode || 'comprado'}» a ${org}.`];
  if (ctx.pack?.kind === 'AI') {
    lines.push(`Suma ${ctx.pack.quantity.toLocaleString('en-US')} peticiones de IA: se gastan después de las incluidas en el plan y valen 12 meses.`);
  } else if (ctx.pack?.kind === 'STORAGE') {
    lines.push(`Suma ${ctx.pack.quantity.toLocaleString('en-US')} GB de espacio mientras dure la licencia vigente.`);
  }
  return lines;
}

// ── Cuerpos que se envían al API ──

export type PurchaseChoice =
  | { kind: 'LICENSE'; planCode: string; months: number; method: string }
  | { kind: 'PACK'; packCode: string; method: string };

const CODE_RE = /^[A-Za-z0-9_]{1,40}$/;

/** Cuerpo de POST /billing/payments con SOLO los campos del DTO; null si algo no es válido (no se envía nada). */
export function buildPaymentBody(c: PurchaseChoice): CreatePaymentBody | null {
  if (!isChosenMethod(c.method)) return null;
  if (c.kind === 'LICENSE') {
    const planCode = (c.planCode ?? '').trim();
    if (!CODE_RE.test(planCode)) return null;
    if (!(LICENSE_PURCHASE_MONTHS as readonly number[]).includes(c.months)) return null;
    return { kind: 'LICENSE', planCode, months: c.months, method: c.method };
  }
  if (c.kind === 'PACK') {
    const packCode = (c.packCode ?? '').trim();
    if (!CODE_RE.test(packCode)) return null;
    return { kind: 'PACK', packCode, method: c.method };
  }
  return null;
}

export type RejectCheck = { ok: true; reason: string } | { ok: false; message: string };

/** Motivo del rechazo: obligatorio, de 3 a 500 caracteres (sin contar los espacios de los extremos). */
export function validateRejectReason(raw: string): RejectCheck {
  const reason = (raw ?? '').trim();
  if (reason.length < REJECT_MIN) return { ok: false, message: `Escribe el motivo del rechazo (al menos ${REJECT_MIN} caracteres).` };
  if (reason.length > REJECT_MAX) return { ok: false, message: `El motivo admite hasta ${REJECT_MAX} caracteres (ahora tiene ${reason.length}).` };
  return { ok: true, reason };
}

/** Cuerpo de POST /billing-admin/payments/:id/reject. */
export function buildRejectBody(raw: string): { reason: string } | null {
  const r = validateRejectReason(raw);
  return r.ok ? { reason: r.reason } : null;
}

// ── Comprobante ──

export const PROOF_EXTENSIONS: readonly string[] = ['pdf', 'jpg', 'jpeg', 'png'];
export const PROOF_MIMES: readonly string[] = ['application/pdf', 'image/jpeg', 'image/png'];
export const PROOF_TYPE_MESSAGE = 'El comprobante debe ser un PDF, JPG o PNG.';

export type ProofCheck = { ok: true } | { ok: false; message: string };

const fail = (message: string): ProofCheck => ({ ok: false, message });

function extensionOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i < 0 ? '' : name.slice(i + 1).trim().toLowerCase();
}

/** Primera revisión, sin leer el archivo: tipo (extensión y tipo que declara el navegador) y tamaño. El servidor vuelve a validar. */
export function validateProofMeta(file: { name: string; size: number; type?: string } | null | undefined): ProofCheck {
  if (!file || typeof file.name !== 'string' || file.name.trim() === '') return fail('Elige el archivo del comprobante.');
  const type = (file.type ?? '').toLowerCase();
  if (!PROOF_EXTENSIONS.includes(extensionOf(file.name)) || (type !== '' && !PROOF_MIMES.includes(type))) return fail(PROOF_TYPE_MESSAGE);
  if (!Number.isFinite(file.size) || file.size <= 0) return fail('El archivo está vacío.');
  if (file.size > MAX_PROOF_BYTES) {
    const size = formatBytes(file.size);
    const max = formatBytes(MAX_PROOF_BYTES);
    return fail(size === max ? `El comprobante pesa un poco más del máximo permitido (${max}).` : `El comprobante pesa ${size} y el máximo es ${max}.`);
  }
  return { ok: true };
}

/** El tipo real por los primeros bytes (la misma regla del servidor); null si no es PDF, JPG ni PNG. */
export function sniffProofBytes(bytes: Uint8Array): 'pdf' | 'jpg' | 'png' | null {
  if (bytes.length >= 5 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d) return 'pdf';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg';
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length >= 8 && png.every((b, i) => bytes[i] === b)) return 'png';
  return null;
}

export interface FileLike {
  name: string;
  size: number;
  type?: string;
  slice(start?: number, end?: number): { arrayBuffer(): Promise<ArrayBuffer> };
}

/** Revisión completa antes de enviar: tipo, tamaño y los primeros bytes. */
export async function validateProofFile(file: FileLike | null | undefined): Promise<ProofCheck> {
  const meta = validateProofMeta(file);
  if (!meta.ok || !file) return meta;
  try {
    const head = new Uint8Array(await file.slice(0, 8).arrayBuffer());
    if (sniffProofBytes(head) === null) return fail('El archivo no parece un PDF, JPG o PNG válido.');
  } catch {
    return fail('No se pudo leer el archivo. Elígelo de nuevo.');
  }
  return { ok: true };
}

/** Enlace del comprobante: solo se abre si es una dirección http(s) (nunca `javascript:` ni `data:`). */
export function safeProofUrl(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 4096) return null;
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
  } catch {
    return null;
  }
}

// ── Datos de pago que ve el cliente (superadmin) ──

/** Los métodos que se pueden elegir y su texto de instrucciones (el que se muestra al crear el pago). */
export const INSTRUCTION_METHODS: ReadonlyArray<{ key: ChosenMethod; label: string; placeholder: string }> = [
  { key: 'QR', label: 'QR 365', placeholder: 'Banco, cuenta o enlace del QR, a nombre de quién, y qué poner en el concepto.' },
  { key: 'TRANSFER', label: 'Transferencia bancaria', placeholder: 'Banco, tipo y número de cuenta, titular y correo para enviar el comprobante.' },
  { key: 'CASH', label: 'Efectivo', placeholder: 'Dónde y cuándo se recibe el pago en efectivo y a quién entregarlo.' },
];
export const INSTRUCTIONS_MAX = 2000;

export type InstructionsForm = Record<ChosenMethod, string>;

/** Texto de cada método tal como está guardado; lo que no sea texto se ignora. */
export function instructionsToForm(raw: unknown): InstructionsForm {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const pick = (k: ChosenMethod) => (typeof src[k] === 'string' ? (src[k] as string) : '');
  return { QR: pick('QR'), TRANSFER: pick('TRANSFER'), CASH: pick('CASH') };
}

export type InstructionsCheck =
  | { ok: true; body: { paymentInstructions: Record<string, string> } }
  | { ok: false; errors: Partial<Record<ChosenMethod, string>> };

/**
 * Cuerpo de PATCH /billing-admin/settings para los datos de pago. El API REEMPLAZA todo el objeto, así que se conservan las claves
 * que no se editan aquí (por ejemplo la de un método futuro) y se omiten los métodos que queden vacíos.
 */
export function buildInstructionsBody(form: InstructionsForm, existing?: unknown): InstructionsCheck {
  const errors: Partial<Record<ChosenMethod, string>> = {};
  const out: Record<string, string> = {};
  const prev = existing && typeof existing === 'object' && !Array.isArray(existing) ? (existing as Record<string, unknown>) : {};
  for (const [k, v] of Object.entries(prev)) if (typeof v === 'string' && !INSTRUCTION_METHODS.some((m) => m.key === k)) out[k] = v;
  for (const m of INSTRUCTION_METHODS) {
    const text = (form[m.key] ?? '').trim();
    if (text.length > INSTRUCTIONS_MAX) errors[m.key] = `Admite hasta ${INSTRUCTIONS_MAX} caracteres (ahora tiene ${text.length}).`;
    else if (text) out[m.key] = text;
  }
  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, body: { paymentInstructions: out } };
}

/** ¿Cambió algo respecto de lo guardado? (compara el texto recortado). */
export function instructionsChanged(form: InstructionsForm, saved: InstructionsForm): boolean {
  return INSTRUCTION_METHODS.some((m) => (form[m.key] ?? '').trim() !== (saved[m.key] ?? '').trim());
}

// ── Quién puede comprar ──

/** Niveles de rol del API (apps/api/src/common/guards/roles.guard.ts): comprar, subir comprobantes y cancelar exigen ADMIN o más. */
const ROLE_LEVEL: Record<string, number> = { SUPER_ADMIN: 100, ADMIN: 90, CAE: 80, AUDIT_MANAGER: 70, SENIOR_AUDITOR: 60, AUDITOR: 50, AUDITEE: 20, READ_ONLY: 10 };

/** ¿Puede este rol pedir pagos y ver «Mis pagos»? ADMIN de la organización o superior. Un rol desconocido no puede. */
export function canManageBilling(role: string | null | undefined): boolean {
  return typeof role === 'string' && Object.prototype.hasOwnProperty.call(ROLE_LEVEL, role) && ROLE_LEVEL[role] >= ROLE_LEVEL.ADMIN;
}

// ── Errores ──

/**
 * ¿El servidor dijo que el pago ya fue procesado por otra persona? Es un 409 con «ya fue procesado». El API también usa 409 para otros
 * conflictos (por ejemplo, una licencia sin duración que no se puede renovar): esos NO son «ya procesado» y se muestran con su propio mensaje.
 * Un 409 sin mensaje se toma como procesado.
 */
export function isAlreadyProcessed(err: unknown): boolean {
  if (!err || typeof err !== 'object' || (err as { status?: unknown }).status !== 409) return false;
  const message = (err as { message?: unknown }).message;
  return typeof message !== 'string' || message.trim() === '' || /procesad/i.test(message);
}

/** Mensaje del error del API (texto del servidor, que se muestra como texto); si no hay, el de respaldo. */
export function errorText(err: unknown, fallback: string): string {
  return err instanceof Error && err.message.trim() ? err.message : fallback;
}

/** Error al subir el comprobante: el servidor corta los archivos de más de 5 MB con un 413 en inglés; el resto de sus mensajes ya vienen en español. */
export function proofErrorText(err: unknown): string {
  if (err && typeof err === 'object' && (err as { status?: unknown }).status === 413) return 'El comprobante pesa más de 5 MB.';
  return errorText(err, 'No se pudo subir el comprobante. Intenta de nuevo.');
}

/** Monto de un pago para mostrar. */
export const paymentAmount = (p: Pick<PaymentRow, 'amountUsd'>): string => usd(Number.isFinite(p.amountUsd) ? p.amountUsd : null);
