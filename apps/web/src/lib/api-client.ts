import { createClient } from './supabase/client';
import { emitBillingError, parseBillingError, type BillingErrorCode } from './billing/errors';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

/**
 * Error de la API. Sigue siendo un `Error` común (el `message` es el del servidor), pero conserva el estado HTTP y, si es un
 * bloqueo del plan (licencia vencida, módulo o asistente fuera del plan, tope de usuarios), su código.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code?: BillingErrorCode;
  constructor(message: string, status: number, code?: BillingErrorCode) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

/** Lee el cuerpo de una respuesta fallida, avisa a la interfaz si es un bloqueo del plan y arma el error. */
async function failFromResponse(res: Response): Promise<ApiError> {
  const body = await res.json().catch(() => ({ message: res.statusText }));
  const block = parseBillingError(res.status, body);
  if (block) emitBillingError(res.status, body);
  // Igual que antes: el `message` del servidor tal cual (si es una lista de errores de validación, `String()` los une con comas).
  const raw = body && typeof body === 'object' ? (body as { message?: unknown }).message : undefined;
  return new ApiError(String(raw ?? `API error ${res.status}`), res.status, block?.code);
}

/** Igual que `failFromResponse` para las descargas, que leen el cuerpo como texto. */
async function failFromDownload(res: Response): Promise<Error> {
  const text = await res.text().catch(() => 'Download failed');
  let body: unknown = null;
  try { body = JSON.parse(text); } catch { /* no era JSON */ }
  const block = parseBillingError(res.status, body);
  if (block) emitBillingError(res.status, body);
  return new ApiError(`Download error ${res.status}: ${text.slice(0, 120)}`, res.status, block?.code);
}

async function getAuthHeaders(): Promise<HeadersInit> {
  const supabase = createClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
  };
}

async function getAuthToken(): Promise<string | undefined> {
  const supabase = createClient();
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token;
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { ...headers, ...options.headers },
  });

  if (!res.ok) throw await failFromResponse(res);

  if (res.status === 204) return undefined as T;
  return res.json();
}

export const apiClient = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  // Multipart/form-data upload — does NOT set Content-Type (browser sets boundary automatically)
  postForm: async <T>(path: string, formData: FormData): Promise<T> => {
    const token = await getAuthToken();
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });
    if (!res.ok) throw await failFromResponse(res);
    if (res.status === 204) return undefined as T;
    return res.json();
  },
  /** Multipart POST que devuelve un blob binario (no JSON) — usado por las
   *  operaciones de pdf-tools, donde el llamador necesita el blob en mano
   *  (para mostrar un botón "Descargar") en vez de forzar la descarga de
   *  inmediato como hace `downloadFile`. */
  postFormBlob: async (
    path: string,
    formData: FormData,
  ): Promise<{ blob: Blob; filename: string; contentType: string }> => {
    const token = await getAuthToken();
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });
    if (!res.ok) throw await failFromResponse(res);
    const contentType = res.headers.get('Content-Type') ?? 'application/octet-stream';
    const disposition = res.headers.get('Content-Disposition') ?? '';
    const match = /filename="?([^"]+)"?/.exec(disposition);
    const filename = match?.[1] ?? 'resultado.pdf';
    const blob = await res.blob();
    return { blob, filename, contentType };
  },
  /** Download a binary response and trigger save dialog */
  downloadFile: async (path: string, filename: string): Promise<void> => {
    const token = await getAuthToken();
    const res = await fetch(`${API_BASE}${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw await failFromDownload(res);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  },
  /** Igual que `downloadFile`, pero devuelve los headers de la respuesta —
   *  usado por la plantilla genérica (EXC-27) para leer `X-AuditMind-Omitidas`. */
  downloadFileWithHeaders: async (path: string, filename: string): Promise<Headers> => {
    const token = await getAuthToken();
    const res = await fetch(`${API_BASE}${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw await failFromDownload(res);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    return res.headers;
  },
  /** Igual que `downloadFile`, pero POST con body JSON (ej. exportar un
   *  resultado ya calculado en el cliente, sin volver a persistirlo). */
  postDownload: async (path: string, body: unknown, filename: string): Promise<void> => {
    const headers = await getAuthHeaders();
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) throw await failFromDownload(res);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  },
};
