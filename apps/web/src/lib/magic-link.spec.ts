import { isUnknownUserError, magicLinkOptions } from './magic-link';

describe('enlace mágico solo para cuentas existentes', () => {
  it('nunca crea cuentas y vuelve por el callback del propio sitio', () => {
    expect(magicLinkOptions('https://auditoria.ianovatechsystems.com')).toEqual({
      emailRedirectTo: 'https://auditoria.ianovatechsystems.com/auth/callback', shouldCreateUser: false,
    });
    expect(magicLinkOptions('http://localhost:3008').shouldCreateUser).toBe(false);
  });

  it('reconoce el error de Supabase por un correo sin cuenta (por código o por mensaje)', () => {
    expect(isUnknownUserError({ code: 'otp_disabled', message: 'Signups not allowed for otp' })).toBe(true);
    expect(isUnknownUserError({ message: 'Signups not allowed for otp' })).toBe(true);
    expect(isUnknownUserError({ code: 'otp_disabled' })).toBe(true);
    expect(isUnknownUserError({ message: 'User not found' })).toBe(true);
  });

  it('no confunde otros errores: límite de envíos, red o ausencia de error', () => {
    expect(isUnknownUserError({ code: 'over_email_send_rate_limit', message: 'email rate limit exceeded' })).toBe(false);
    expect(isUnknownUserError({ message: 'Failed to fetch' })).toBe(false);
    expect(isUnknownUserError({})).toBe(false);
    expect(isUnknownUserError(null)).toBe(false);
    expect(isUnknownUserError(undefined)).toBe(false);
  });
});
