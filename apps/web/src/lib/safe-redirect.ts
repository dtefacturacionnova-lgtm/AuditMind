/**
 * Destino seguro después de iniciar sesión (`/auth/callback?next=…`). Solo rutas internas del panel: nunca otro sitio
 * (`https://…`, `//otro`, `/\otro`) ni `javascript:` — el router de Next trata esas direcciones como externas y navega
 * a ellas tal cual (revisión de seguridad F5b, 2026-10-19). Cualquier otra cosa vuelve al panel.
 */
export const DEFAULT_AFTER_LOGIN = '/dashboard';

export function safeAfterLoginPath(raw: string | null | undefined): string {
  if (!raw) return DEFAULT_AFTER_LOGIN;
  if (!/^\/dashboard(?=$|[/?#])/.test(raw)) return DEFAULT_AFTER_LOGIN;
  if (/[\\\s]/.test(raw) || raw.includes('//')) return DEFAULT_AFTER_LOGIN;
  return raw;
}
