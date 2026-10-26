import { FlagStorage, PASSWORD_RESET_TTL_MS, consumePasswordReset, markPasswordReset } from './password-reset-flag';

const memory = (): FlagStorage & { data: Record<string, string> } => {
  const data: Record<string, string> = {};
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = v; },
    removeItem: (k) => { delete data[k]; },
  };
};

describe('marca de recuperación de contraseña', () => {
  it('se consume una sola vez', () => {
    const s = memory();
    markPasswordReset(s, 1_000);
    expect(consumePasswordReset(s, 2_000)).toBe(true);
    expect(consumePasswordReset(s, 2_001)).toBe(false);
  });

  it('sin marca no hay recuperación', () => {
    expect(consumePasswordReset(memory(), 5_000)).toBe(false);
  });

  it('vence a la hora y la marca vencida también se borra', () => {
    const s = memory();
    markPasswordReset(s, 0);
    expect(consumePasswordReset(s, PASSWORD_RESET_TTL_MS + 1)).toBe(false);
    expect(Object.keys(s.data)).toHaveLength(0);
    markPasswordReset(s, 0);
    expect(consumePasswordReset(s, PASSWORD_RESET_TTL_MS)).toBe(true);   // justo en el límite todavía vale
  });

  it('una marca del futuro o corrupta no cuenta', () => {
    const s = memory();
    markPasswordReset(s, 10_000);
    expect(consumePasswordReset(s, 5_000)).toBe(false);
    s.setItem('auditmind_pwreset', 'basura');
    expect(consumePasswordReset(s, 5_000)).toBe(false);
  });

  it('sin almacenamiento disponible no falla', () => {
    expect(() => markPasswordReset(null)).not.toThrow();
    expect(consumePasswordReset(null)).toBe(false);
    const roto: FlagStorage = { getItem: () => { throw new Error('bloqueado'); }, setItem: () => { throw new Error('bloqueado'); }, removeItem: () => { throw new Error('bloqueado'); } };
    expect(() => markPasswordReset(roto)).not.toThrow();
    expect(consumePasswordReset(roto)).toBe(false);
  });
});
