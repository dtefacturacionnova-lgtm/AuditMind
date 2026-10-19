import type {
  OtpSent, OtpVerified, PublicAttachment, PublicDocument, PublicRequest, SignedDownload, SignPayload, SignResult, VerifyResult,
} from './types';

/**
 * Cliente HTTP de los endpoints PÚBLICOS de la firma por enlace (sin login).
 *
 * Reglas (docs/firma-externa-por-enlace.md §5, §9.1):
 *  - El token del enlace y la sesión viajan SOLO en las cabeceras X-Signature-Token / X-Signature-Session:
 *    nunca en la ruta ni en la query (no deben llegar a logs ni a Referer).
 *  - Sin cookies ni credenciales del sitio (`credentials: 'omit'`), sin caché y sin Referer.
 *  - Un tiempo máximo por petición: una API colgada no debe dejar al firmante mirando una rueda para siempre.
 */
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
const BASE = `${API_BASE}/public/signatures`;

export class SignatureApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    /** Solo en 410: 'expired' | 'revoked'. */
    public readonly reason?: string,
    /** Solo en 409: estado final de la solicitud ('SIGNED' | 'DECLINED'). */
    public readonly finalStatus?: string,
  ) {
    super(message);
    this.name = 'SignatureApiError';
  }
}

const NETWORK_MESSAGE = 'No pudimos conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.';

interface CallOptions {
  method?: 'GET' | 'POST' | 'DELETE';
  token?: string;
  session?: string;
  json?: unknown;
  form?: FormData;
  timeoutMs?: number;
}

/** Convierte el cuerpo de error de Nest ({ message: string | string[], reason?, status? }) en un SignatureApiError. */
export function toApiError(status: number, body: unknown): SignatureApiError {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const raw = b.message;
  const message = Array.isArray(raw) ? raw.filter((x) => typeof x === 'string').join(' ') : typeof raw === 'string' ? raw : '';
  return new SignatureApiError(
    status,
    message || 'No se pudo completar la operación.',
    typeof b.reason === 'string' ? b.reason : undefined,
    typeof b.status === 'string' ? b.status : undefined,
  );
}

async function call<T>(path: string, opts: CallOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (opts.token) headers['X-Signature-Token'] = opts.token;
  if (opts.session) headers['X-Signature-Session'] = opts.session;
  if (opts.json !== undefined) headers['Content-Type'] = 'application/json';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 30_000);
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.form ?? (opts.json !== undefined ? JSON.stringify(opts.json) : undefined),
      credentials: 'omit',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
      signal: controller.signal,
    });
  } catch {
    throw new SignatureApiError(0, NETWORK_MESSAGE);
  } finally {
    clearTimeout(timer);
  }

  let body: unknown = null;
  try { body = await res.json(); } catch { /* respuesta sin cuerpo JSON */ }
  if (!res.ok) throw toApiError(res.status, body);
  return body as T;
}

export const signatureApi = {
  getRequest: (token: string) => call<PublicRequest>('/request', { token }),
  sendOtp: (token: string) => call<OtpSent>('/otp/send', { method: 'POST', token }),
  verifyOtp: (token: string, code: string) => call<OtpVerified>('/otp/verify', { method: 'POST', token, json: { code } }),
  getDocument: (token: string, session: string) => call<PublicDocument>('/document', { token, session }),
  uploadAttachment: (token: string, session: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return call<PublicAttachment & { status: 'accepted' }>('/attachments', { method: 'POST', token, session, form, timeoutMs: 120_000 });
  },
  removeAttachment: (token: string, session: string, id: string) =>
    call<{ removed: true }>(`/attachments/${encodeURIComponent(id)}`, { method: 'DELETE', token, session }),
  sign: (token: string, session: string, payload: SignPayload) => call<SignResult>('/sign', { method: 'POST', token, session, json: payload }),
  decline: (token: string, session: string, reason: string) =>
    call<{ status: 'DECLINED' }>('/decline', { method: 'POST', token, session, json: { reason } }),
  getSigned: (token: string, session: string) => call<SignedDownload>('/signed', { token, session }),
  /** El código es público por diseño: va en la ruta. */
  verify: (code: string) => call<VerifyResult>(`/verify/${encodeURIComponent(code)}`),
};
