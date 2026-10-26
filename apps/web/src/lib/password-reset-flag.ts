/**
 * «¿Olvidaste tu contraseña?»: el correo de Supabase trae al usuario a /auth/callback con `?code=` (flujo PKCE, que solo funciona en el
 * MISMO navegador donde se pidió). Para saber que esa visita es una recuperación y mandarla a crear la contraseña, el login deja una
 * marca en el navegador; el callback la consume una sola vez. No se usa un parámetro en la URL de retorno porque la lista de
 * direcciones permitidas de Supabase puede no aceptar parámetros nuevos y mandaría al usuario a otro sitio.
 */
const KEY = 'auditmind_pwreset';
/** Vigencia de la marca: igual que el enlace de recuperación (1 hora). */
export const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

export interface FlagStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function browserStorage(): FlagStorage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null; // navegación privada o almacenamiento bloqueado
  }
}

export function markPasswordReset(storage: FlagStorage | null = browserStorage(), now: number = Date.now()): void {
  try { storage?.setItem(KEY, String(now)); } catch { /* sin almacenamiento: el usuario igual puede crear su contraseña desde el panel */ }
}

/** true si hay una recuperación pendiente y vigente; la marca se borra siempre (se usa una sola vez). */
export function consumePasswordReset(storage: FlagStorage | null = browserStorage(), now: number = Date.now()): boolean {
  try {
    const raw = storage?.getItem(KEY) ?? null;
    storage?.removeItem(KEY);
    if (!raw) return false;
    const at = Number(raw);
    return Number.isFinite(at) && now >= at && now - at <= PASSWORD_RESET_TTL_MS;
  } catch {
    return false;
  }
}
