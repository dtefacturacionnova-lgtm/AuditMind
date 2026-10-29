/**
 * Enlace mágico del inicio de sesión (2026-10-29): solo entra quien YA tiene cuenta. Antes `signInWithOtp` creaba una cuenta de autenticación y
 * mandaba un correo a cualquier dirección que alguien escribiera (el registro libre de Supabase está activo). Con `shouldCreateUser: false`, un correo
 * desconocido responde 422 `otp_disabled` («Signups not allowed for otp»): la pantalla lo trata como cualquier otro envío para no revelar qué correos
 * existen, igual que «¿Olvidaste tu contraseña?».
 */
export function magicLinkOptions(origin: string): { emailRedirectTo: string; shouldCreateUser: false } {
  return { emailRedirectTo: `${origin}/auth/callback`, shouldCreateUser: false };
}

/** El error de Supabase por pedir un enlace para un correo que no tiene cuenta. */
export function isUnknownUserError(err: { message?: string; code?: string } | null | undefined): boolean {
  if (!err) return false;
  return /otp_disabled|signups? not allowed|user not found/i.test(`${err.code ?? ''} ${err.message ?? ''}`);
}
