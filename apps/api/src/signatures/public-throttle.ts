import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { ipv6Groups } from '../common/utils/ssrf.util';

/**
 * Límite de intentos para endpoints PÚBLICOS (docs/firma-externa-por-enlace.md §7).
 * El guard se aplica por controlador (`@UseGuards(PublicThrottlerGuard)`), no global.
 *
 * Requiere `app.set('trust proxy', 'loopback')` en main.ts: nginx corre en el mismo VPS y agrega
 * la IP real a X-Forwarded-For. Sin eso todas las peticiones parecen venir de 127.0.0.1 y el
 * límite bloquearía a todo el mundo a la vez.
 *
 * Almacenamiento en memoria: la API corre en UN solo proceso PM2. Si algún día se escala a
 * varios procesos, migrar el almacenamiento a Redis.
 */
@Injectable()
export class PublicThrottlerGuard extends ThrottlerGuard {
  protected errorMessage = 'Demasiadas solicitudes. Espera un momento e inténtalo de nuevo.';

  /** Con trust proxy, `req.ip` ya es la IP real; un valor falso en X-Forwarded-For queda a la izquierda y se ignora. */
  protected async getTracker(req: Record<string, any>): Promise<string> { // eslint-disable-line @typescript-eslint/no-explicit-any
    return throttleKey(typeof req.ip === 'string' ? req.ip : '');
  }
}

/**
 * Clave del límite por IP. Una IPv6 cuenta por su /64 (lo que recibe un solo cliente o servidor): si no, quien tiene
 * un /64 rota direcciones y esquiva todos los límites (revisión de seguridad F5b, 2026-10-19). IPv4 y las IPv6 que
 * llevan una IPv4 (`::ffff:a.b.c.d`) cuentan por la IPv4.
 */
export function throttleKey(ip: string): string {
  if (!ip) return 'unknown';
  const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (mapped) return mapped[1];
  if (!ip.includes(':')) return ip;
  const groups = ipv6Groups(ip);
  if (!groups) return ip;
  return `${groups.slice(0, 4).map((g) => g.toString(16)).join(':')}::/64`;
}

const MINUTE = 60_000;
const HOUR = 3_600_000;

/** Límites por IP y por ruta (cada ruta lleva su propio contador). Uso: `@Throttle(PUBLIC_LIMITS.read)`. */
export const PUBLIC_LIMITS = {
  read:      { default: { limit: 30, ttl: MINUTE } },   // GET request / document / signed
  write:     { default: { limit: 10, ttl: MINUTE } },   // POST sign / decline
  upload:    { default: { limit: 10, ttl: MINUTE } },   // POST attachments
  otpSend:   { default: { limit: 10, ttl: HOUR } },     // POST otp/send
  otpVerify: { default: { limit: 20, ttl: HOUR } },     // POST otp/verify
  verify:    { default: { limit: 20, ttl: MINUTE } },   // GET verify/:code
} as const;
