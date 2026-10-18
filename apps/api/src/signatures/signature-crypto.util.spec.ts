import {
  deriveOtpKey, generateOtp, generateToken, generateVerificationCode, hashToken, hmacOtp,
  isWellFormedToken, maskEmail, normalizeVerificationCode, safeEqualHex, sha256Hex, verifyOtp,
} from './signature-crypto.util';

describe('token', () => {
  it('genera 43 caracteres base64url, distintos cada vez', () => {
    const a = generateToken();
    const b = generateToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a).not.toEqual(b);
  });

  it('el hash es sha256 hex y no es el token', () => {
    const t = generateToken();
    expect(hashToken(t)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(t)).not.toContain(t);
    expect(hashToken(t)).toEqual(hashToken(t));
  });

  it('descarta formatos inválidos antes de tocar la BD', () => {
    expect(isWellFormedToken(generateToken())).toBe(true);
    expect(isWellFormedToken('corto')).toBe(false);
    expect(isWellFormedToken('a'.repeat(44))).toBe(false);
    expect(isWellFormedToken("x'; DROP TABLE--" + 'a'.repeat(27))).toBe(false);
    expect(isWellFormedToken(undefined)).toBe(false);
    expect(isWellFormedToken(12345)).toBe(false);
  });
});

describe('código de verificación por correo (OTP)', () => {
  const key = deriveOtpKey('una-clave-maestra-de-32-caracteres');

  it('siempre son 6 dígitos, con ceros a la izquierda', () => {
    for (let i = 0; i < 500; i++) expect(generateOtp()).toMatch(/^\d{6}$/);
  });

  it('la clave derivada es determinista y depende de la maestra', () => {
    expect(deriveOtpKey('una-clave-maestra-de-32-caracteres').equals(key)).toBe(true);
    expect(deriveOtpKey('otra-clave-maestra-distinta-123456').equals(key)).toBe(false);
    expect(key.length).toBe(32);
  });

  it('exige ENCRYPTION_KEY', () => {
    expect(() => deriveOtpKey('')).toThrow();
  });

  it('verifica el código correcto y rechaza el incorrecto', () => {
    const h = hmacOtp('123456', key, 'req1');
    expect(verifyOtp('123456', key, 'req1', h)).toBe(true);
    expect(verifyOtp('123457', key, 'req1', h)).toBe(false);
  });

  it('un código de una solicitud no sirve en otra', () => {
    const h = hmacOtp('123456', key, 'req1');
    expect(verifyOtp('123456', key, 'req2', h)).toBe(false);
  });

  it('rechaza formatos raros y hash ausente sin lanzar', () => {
    const h = hmacOtp('123456', key, 'req1');
    expect(verifyOtp('12345', key, 'req1', h)).toBe(false);
    expect(verifyOtp('abcdef', key, 'req1', h)).toBe(false);
    expect(verifyOtp('123456', key, 'req1', null)).toBe(false);
    expect(verifyOtp('123456', key, 'req1', 'zz')).toBe(false);
  });
});

describe('código público de verificación', () => {
  it('tiene formato XXXX-XXXX-XXXX-XXXX con alfabeto Crockford', () => {
    for (let i = 0; i < 200; i++) {
      expect(generateVerificationCode()).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){3}$/);
    }
  });

  it('no se repite en una muestra grande', () => {
    const set = new Set(Array.from({ length: 5000 }, generateVerificationCode));
    expect(set.size).toBe(5000);
  });

  it('normaliza minúsculas, espacios y confusiones típicas', () => {
    const code = generateVerificationCode();
    expect(normalizeVerificationCode(code.toLowerCase().replace(/-/g, ' '))).toBe(code);
    expect(normalizeVerificationCode('0000-0000-0000-000O')).toBe('0000-0000-0000-0000');
    expect(normalizeVerificationCode('1111-1111-1111-111I')).toBe('1111-1111-1111-1111');
  });

  it('rechaza lo que no es un código', () => {
    expect(normalizeVerificationCode('')).toBeNull();
    expect(normalizeVerificationCode('ABCD-EFGH')).toBeNull();
    expect(normalizeVerificationCode('UUUU-UUUU-UUUU-UUUU')).toBeNull(); // U no existe en Crockford
    expect(normalizeVerificationCode("'; DROP TABLE--")).toBeNull();
    expect(normalizeVerificationCode(null)).toBeNull();
  });
});

describe('utilidades', () => {
  it('safeEqualHex compara en tiempo constante sin lanzar con entradas raras', () => {
    const h = sha256Hex('a');
    expect(safeEqualHex(h, sha256Hex('a'))).toBe(true);
    expect(safeEqualHex(h, sha256Hex('b'))).toBe(false);
    expect(safeEqualHex(h, 'abc')).toBe(false);
    expect(safeEqualHex('', '')).toBe(false);
  });

  it('maskEmail no revela el correo completo', () => {
    expect(maskEmail('juan.perez@gmail.com')).toBe('j•••@g•••.com');
    expect(maskEmail('a@b.com.sv')).toBe('a•••@b•••.sv');
    expect(maskEmail('sin-arroba')).not.toContain('sin-arroba');
  });
});
