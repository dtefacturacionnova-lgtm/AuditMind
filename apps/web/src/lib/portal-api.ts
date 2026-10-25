/**
 * Cliente HTTP del portal PBC PÚBLICO del auditado (sin login). Mismas reglas que lib/signature/api.ts:
 *  - el token del enlace viaja SOLO en la cabecera X-Portal-Token y la sesión (tras verificar el código del correo) SOLO en
 *    X-Portal-Session: nunca en la ruta ni en la query. Ninguno se guarda en localStorage ni en cookies;
 *  - sin cookies ni credenciales del sitio, sin caché y sin Referer;
 *  - un tiempo máximo por petición.
 * No usa `apiClient`: aquel adjunta la sesión de Supabase del navegador, y un auditado externo no debe enviar ninguna.
 */
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
const BASE = `${API_BASE}/pbc-portal`;

export class PortalApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    /** Solo en 423: 'locked-permanent' cuando el enlace quedó inservible hasta que el equipo lo regenere. */
    public readonly reason?: string,
  ) {
    super(message);
    this.name = 'PortalApiError';
  }
}

const NETWORK_MESSAGE = 'No pudimos conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.';

/** Convierte el cuerpo de error de Nest ({ message: string | string[], reason? }) en un PortalApiError. */
export function toPortalError(status: number, body: unknown): PortalApiError {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const raw = b.message;
  const message = Array.isArray(raw) ? raw.filter((x) => typeof x === 'string').join(' ') : typeof raw === 'string' ? raw : '';
  return new PortalApiError(status, message || 'No se pudo completar la operación.', typeof b.reason === 'string' ? b.reason : undefined);
}

/** Portada: lo único que se ve con solo el enlace. */
export interface PortalCover { orgName: string; maskedEmail: string; expiresAt: string | null }
export interface PortalOtpSent { sent: boolean; maskedEmail: string; resendInSeconds: number }
export interface PortalOtpVerified { sessionToken: string; sessionExpiresAt: string }

interface CallInit { method?: 'GET' | 'POST'; json?: unknown; session?: string }

async function call<T>(token: string, path: string, init: CallInit = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json', 'X-Portal-Token': token };
  if (init.session) headers['X-Portal-Session'] = init.session;
  if (init.json !== undefined) headers['Content-Type'] = 'application/json';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method: init.method ?? 'GET', headers,
      body: init.json !== undefined ? JSON.stringify(init.json) : undefined,
      credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer', signal: controller.signal,
    });
  } catch {
    throw new PortalApiError(0, NETWORK_MESSAGE);
  } finally {
    clearTimeout(timer);
  }

  let body: unknown = null;
  try { body = await res.json(); } catch { /* sin cuerpo JSON */ }
  if (!res.ok) throw toPortalError(res.status, body);
  return body as T;
}

export const portalApi = {
  cover: (token: string) => call<PortalCover>(token, ''),
  sendOtp: (token: string) => call<PortalOtpSent>(token, '/otp/send', { method: 'POST', json: {} }),
  verifyOtp: (token: string, code: string) => call<PortalOtpVerified>(token, '/otp/verify', { method: 'POST', json: { code } }),
  request: <T>(token: string, session: string) => call<T>(token, '/request', { session }),
  post: <T>(token: string, session: string, path: '/message' | '/submit', json: unknown) => call<T>(token, path, { method: 'POST', json, session }),
};
