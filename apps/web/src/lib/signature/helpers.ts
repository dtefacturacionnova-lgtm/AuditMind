import type { FormField } from './types';

/** Límites de adjuntos (los mismos que impone la API: docs/firma-externa-por-enlace.md §12). */
export const MAX_FILES = 5;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 30 * 1024 * 1024;
const ALLOWED_EXT = ['.pdf', '.jpg', '.jpeg', '.png'];

// ─── Código de verificación del documento: XXXX-XXXX-XXXX-XXXX ──────────────
export function formatVerificationInput(raw: string): string {
  const clean = raw.toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 16);
  return clean.match(/.{1,4}/g)?.join('-') ?? '';
}
export const isCompleteVerificationCode = (v: string) => /^[0-9A-Z]{4}(-[0-9A-Z]{4}){3}$/.test(v);

// ─── Montos: acepta 1250, 1,250.50, 1.250,50, $1 250,5 … ─────────────────────
/**
 * Devuelve el monto como número con 2 decimales o null si no se entiende. Ante una entrada ambigua o mal
 * agrupada ("1234.567", "12,34,5") responde null: es preferible pedir que la corrijan a leer un monto equivocado
 * en un documento de auditoría.
 */
export function parseAmount(input: string): number | null {
  const s = input.trim().replace(/[^\d.,]/g, '');
  if (!s || input.includes('-')) return null;

  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  let decimalSep: '.' | ',' | null = null;
  if (lastDot >= 0 && lastComma >= 0) {
    decimalSep = lastDot > lastComma ? '.' : ',';
  } else if (lastDot >= 0 || lastComma >= 0) {
    const sep = lastDot >= 0 ? '.' : ',';
    const parts = s.split(sep);
    // "12,5" y "12.50" son decimales; "1,234" y "1.234.567" son miles. "1.234" (punto + 3 dígitos) es AMBIGUO
    // —en El Salvador el punto es el decimal y 3 decimales no es un monto—: se rechaza y se pide reescribirlo.
    if (sep === '.' && parts.length === 2 && parts[1].length === 3) return null;
    decimalSep = parts.length === 2 && parts[1].length !== 3 ? sep : null;
  }
  const thousandSep = decimalSep === '.' ? ',' : decimalSep === ',' ? '.' : lastDot >= 0 ? '.' : lastComma >= 0 ? ',' : null;

  const [intPartRaw, decPart = ''] = decimalSep ? s.split(decimalSep) : [s, ''];
  if (decimalSep && s.split(decimalSep).length !== 2) return null;
  let intPart = intPartRaw;
  if (thousandSep && intPart.includes(thousandSep)) {
    // agrupación válida: 1–3 dígitos y luego grupos de EXACTAMENTE 3
    const groups = intPart.split(thousandSep);
    if (groups[0].length < 1 || groups[0].length > 3 || groups.slice(1).some((g) => g.length !== 3)) return null;
    intPart = groups.join('');
  }
  if (!/^\d+$/.test(intPart) || (decPart !== '' && !/^\d{1,2}$/.test(decPart))) return null;
  const n = Number(`${intPart}.${decPart || '0'}`);
  if (!Number.isFinite(n) || n > 1e13) return null;
  return Math.round(n * 100) / 100;
}

// ─── Formulario ──────────────────────────────────────────────────────────────
export type FieldValues = Record<string, string | boolean | undefined>;

export interface BuiltResponse {
  ok: boolean;
  response: Record<string, unknown>;
  errors: Record<string, string>;
}

/** ¿Es obligatorio ahora? Fijo (`required`) o condicionado al valor de otro campo (`requiredIf`). */
export function isFieldRequired(field: FormField, values: FieldValues): boolean {
  if (field.required) return true;
  return !!field.requiredIf && values[field.requiredIf.field] === field.requiredIf.equals;
}

/** Valida los campos que describe el servidor y arma el objeto `response` que se envía al firmar. */
export function buildResponse(fields: FormField[], values: FieldValues): BuiltResponse {
  const response: Record<string, unknown> = {};
  const errors: Record<string, string> = {};
  for (const f of fields) {
    const v = values[f.key];
    const required = isFieldRequired(f, values);
    if (f.type === 'boolean') {
      if (typeof v === 'boolean') response[f.key] = v;
      else if (required) errors[f.key] = 'Elige una opción.';
    } else if (f.type === 'amount') {
      const text = typeof v === 'string' ? v.trim() : '';
      if (!text) { if (required) errors[f.key] = 'Escribe el monto.'; continue; }
      const n = parseAmount(text);
      if (n === null) errors[f.key] = 'Monto no válido. Ejemplo: 1,250.00';
      else response[f.key] = n;
    } else {
      const text = typeof v === 'string' ? v.trim() : '';
      const max = f.maxLength ?? (f.type === 'textarea' ? 4000 : 500);
      if (!text) { if (required) errors[f.key] = 'Este campo es obligatorio.'; continue; }
      if (text.length > max) errors[f.key] = `Máximo ${max} caracteres.`;
      else response[f.key] = text;
    }
  }
  return { ok: Object.keys(errors).length === 0, response, errors };
}

export function validateSigner(p: { name: string; role: string; roleRequired: boolean }): Record<string, string> {
  const errors: Record<string, string> = {};
  const name = p.name.trim();
  const role = p.role.trim();
  if (name.length < 2) errors.signedName = 'Escribe tu nombre completo.';
  else if (name.length > 120) errors.signedName = 'Máximo 120 caracteres.';
  if (p.roleRequired && !role) errors.signedRole = 'Escribe tu cargo.';
  else if (role.length > 120) errors.signedRole = 'Máximo 120 caracteres.';
  return errors;
}

// ─── Archivos adjuntos ───────────────────────────────────────────────────────
export const formatBytes = (n: number) =>
  n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;

/** Mensaje de por qué NO se puede subir este archivo, o null si es válido (la API vuelve a comprobarlo todo). */
export function fileProblem(file: { name: string; size: number }, existing: { count: number; bytes: number }): string | null {
  const lower = file.name.toLowerCase();
  if (!ALLOWED_EXT.some((e) => lower.endsWith(e))) return 'Solo se aceptan archivos PDF, JPG o PNG.';
  if (file.size === 0) return 'El archivo está vacío.';
  if (file.size > MAX_FILE_BYTES) return 'El archivo supera el límite de 10 MB.';
  if (existing.count >= MAX_FILES) return `Máximo ${MAX_FILES} archivos.`;
  if (existing.bytes + file.size > MAX_TOTAL_BYTES) return 'Los archivos superan el límite total de 30 MB.';
  return null;
}

// ─── Huella del documento ────────────────────────────────────────────────────
export async function sha256Hex(data: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
export const sameHash = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

// ─── Fechas (hora de El Salvador) ────────────────────────────────────────────
const SV = 'America/El_Salvador';
export const formatDateSv = (iso: string | null | undefined) =>
  iso ? new Intl.DateTimeFormat('es-SV', { timeZone: SV, dateStyle: 'long' }).format(new Date(iso)) : '—';
export const formatDateTimeSv = (iso: string | null | undefined) =>
  iso ? new Intl.DateTimeFormat('es-SV', { timeZone: SV, dateStyle: 'long', timeStyle: 'short' }).format(new Date(iso)) : '—';
export const formatTimeSv = (iso: string | null | undefined) =>
  iso ? new Intl.DateTimeFormat('es-SV', { timeZone: SV, hour: '2-digit', minute: '2-digit' }).format(new Date(iso)) : '—';
