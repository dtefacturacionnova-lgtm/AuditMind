import {
  confirmationResponseRows, defaultAsOfDate, initialConfirmationPayload, isValidAsOfDate, validateConfirmationPayload,
  type ConfirmationSendPayload,
} from './confirmation';

const NOW = new Date('2026-10-19T12:00:00Z');
const ok: ConfirmationSendPayload = { mode: 'POSITIVE_WITH_AMOUNT', asOfDate: '2025-12-31', currency: 'USD', recipientVerified: true };
const check = (over: Partial<ConfirmationSendPayload> = {}, hasAmount = true) => validateConfirmationPayload({ ...ok, ...over }, { hasAmount, now: NOW });

describe('valores iniciales', () => {
  it('fecha de corte: cierre del año anterior', () => {
    expect(defaultAsOfDate(NOW)).toBe('2025-12-31');
  });
  it('con monto registrado propone mostrar el saldo; sin monto, saldo en blanco; la verificación empieza sin marcar', () => {
    expect(initialConfirmationPayload(true, NOW)).toEqual({ mode: 'POSITIVE_WITH_AMOUNT', asOfDate: '2025-12-31', currency: 'USD', recipientVerified: false });
    expect(initialConfirmationPayload(false, NOW).mode).toBe('POSITIVE_BLANK');
  });
});

describe('validación previa (igual que el servidor)', () => {
  it('listo para enviar', () => {
    expect(check()).toBeNull();
    expect(check({ mode: 'POSITIVE_BLANK' }, false)).toBeNull();
  });
  it('tipo, monto, fecha, moneda y verificación del correo', () => {
    expect(check({ mode: undefined })).toMatch(/Elige el tipo/);
    expect(check({}, false)).toMatch(/no tiene monto/);
    for (const bad of ['', undefined, '2026-02-31', '31/12/2025', '1999-12-31', '2030-01-01']) expect(check({ asOfDate: bad })).toMatch(/fecha de corte/);
    for (const bad of ['US', 'DOLAR', '', undefined, '12$']) expect(check({ currency: bad })).toMatch(/3 letras/);
    for (const bad of [false, undefined]) expect(check({ recipientVerified: bad })).toMatch(/verificar de forma independiente/);
  });
  it('fechas válidas', () => {
    expect(isValidAsOfDate('2026-02-28', NOW)).toBe(true);
    expect(isValidAsOfDate('2028-12-31', NOW)).toBe(true);
    expect(isValidAsOfDate('2028-12-32', NOW)).toBe(false);
  });
});

describe('respuesta del confirmante en el panel', () => {
  it('de acuerdo, en desacuerdo con saldo y comentarios', () => {
    expect(confirmationResponseRows({ agrees: true, confirmedAmount: null, comments: '' })).toEqual([['Respuesta', 'De acuerdo']]);
    expect(confirmationResponseRows({ agrees: false, confirmedAmount: 1300, comments: ' no coincide ' })).toEqual([
      ['Respuesta', 'En desacuerdo'], ['Saldo según el confirmante', '1,300.00'], ['Comentarios', 'no coincide'],
    ]);
  });
  it('formas raras no rompen', () => {
    expect(confirmationResponseRows(null)).toEqual([]);
    expect(confirmationResponseRows('x')).toEqual([]);
    expect(confirmationResponseRows({ confirmedAmount: NaN })).toEqual([]);
  });
});
