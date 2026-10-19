/**
 * Cliente HTTP del portal PBC PÚBLICO del auditado (sin login). Mismas reglas que lib/signature/api.ts:
 *  - el token del enlace viaja SOLO en la cabecera X-Portal-Token, nunca en la ruta ni en la query;
 *  - sin cookies ni credenciales del sitio, sin caché y sin Referer;
 *  - un tiempo máximo por petición.
 * No usa `apiClient`: aquel adjunta la sesión de Supabase del navegador, y un auditado externo no debe enviar ninguna.
 */
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
const BASE = `${API_BASE}/pbc-portal`;

export class PortalApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'PortalApiError';
  }
}

const NETWORK_MESSAGE = 'No pudimos conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.';

/** Convierte el cuerpo de error de Nest ({ message: string | string[] }) en un PortalApiError. */
export function toPortalError(status: number, body: unknown): PortalApiError {
  const raw = (body && typeof body === 'object' ? (body as Record<string, unknown>).message : undefined);
  const message = Array.isArray(raw) ? raw.filter((x) => typeof x === 'string').join(' ') : typeof raw === 'string' ? raw : '';
  return new PortalApiError(status, message || 'No se pudo completar la operación.');
}

async function call<T>(token: string, path: string, init: { method?: 'GET' | 'POST'; json?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json', 'X-Portal-Token': token };
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
  get: <T>(token: string) => call<T>(token, ''),
  post: <T>(token: string, path: '/message' | '/submit', json: unknown) => call<T>(token, path, { method: 'POST', json }),
};
