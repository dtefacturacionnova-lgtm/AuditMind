import { createHash, createHmac, hkdfSync, randomBytes, randomInt, timingSafeEqual } from 'crypto';

/**
 * Utilidades criptográficas de la firma por enlace (docs/firma-externa-por-enlace.md §5–§6).
 * Sin dependencias de Nest ni de la BD: son funciones puras, fáciles de probar.
 */

// ─── Hash genérico ───────────────────────────────────────────────────────────
export const sha256Hex = (data: string | Buffer): string =>
  createHash('sha256').update(data).digest('hex');

/** Comparación en tiempo constante de dos cadenas hex del mismo largo. */
export function safeEqualHex(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  const ba = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  if (ba.length === 0 || ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

// ─── Tokens (enlace y sesión) ────────────────────────────────────────────────
/** 32 bytes aleatorios en base64url (43 caracteres). */
export const generateToken = (): string => randomBytes(32).toString('base64url');

/** Lo único que se guarda del token para buscarlo. */
export const hashToken = (token: string): string => sha256Hex(token);

/** Formato válido de token: 43 caracteres base64url. Descarta basura antes de tocar la BD. */
export const isWellFormedToken = (token: unknown): token is string =>
  typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token);

// ─── Código de verificación por correo (OTP) ─────────────────────────────────
/** Clave del HMAC derivada de ENCRYPTION_KEY: no hace falta un secreto nuevo. */
export function deriveOtpKey(encryptionKey: string): Buffer {
  if (!encryptionKey) throw new Error('ENCRYPTION_KEY no configurada');
  return Buffer.from(hkdfSync('sha256', encryptionKey, 'auditmind-signature', 'otp-v1', 32));
}

/** 6 dígitos, con ceros a la izquierda. */
export const generateOtp = (): string => String(randomInt(0, 1_000_000)).padStart(6, '0');

/** HMAC del código, ligado a la solicitud (un código de una no sirve en otra). */
export const hmacOtp = (code: string, key: Buffer, requestId: string): string =>
  createHmac('sha256', key).update(`${requestId}:${code}`).digest('hex');

export function verifyOtp(code: string, key: Buffer, requestId: string, storedHash: string | null): boolean {
  if (!storedHash || !/^\d{6}$/.test(code)) return false;
  return safeEqualHex(hmacOtp(code, key, requestId), storedHash);
}

// ─── Código público de verificación del PDF (§5, §10) ───────────────────────
// Base32 de Crockford (sin I, L, O, U): 10 bytes = 80 bits = 16 caracteres.
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export function generateVerificationCode(): string {
  const bytes = randomBytes(10);
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += CROCKFORD[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  return out.match(/.{4}/g)!.join('-'); // XXXX-XXXX-XXXX-XXXX
}

/** Acepta minúsculas, guiones y espacios; corrige I/L→1 y O→0 (confusiones típicas al teclear). */
export function normalizeVerificationCode(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const clean = input.toUpperCase().replace(/[\s-]/g, '').replace(/[IL]/g, '1').replace(/O/g, '0');
  if (clean.length !== 16 || ![...clean].every((c) => CROCKFORD.includes(c))) return null;
  return clean.match(/.{4}/g)!.join('-');
}

// ─── Presentación ────────────────────────────────────────────────────────────
/** "juan.perez@gmail.com" → "j•••@g•••.com" (no revela el correo completo en pantalla). */
export function maskEmail(email: string): string {
  const [local = '', domain = ''] = email.split('@');
  const dot = domain.lastIndexOf('.');
  const host = dot > 0 ? domain.slice(0, dot) : domain;
  const tld = dot > 0 ? domain.slice(dot) : '';
  return `${local.slice(0, 1)}•••@${host.slice(0, 1)}•••${tld}`;
}
