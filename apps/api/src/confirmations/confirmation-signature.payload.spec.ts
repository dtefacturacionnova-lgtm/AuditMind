import { BadRequestException } from '@nestjs/common';
import {
  authorizationFolder, isOwnAuthorizationPath, parseResponse, parseSendPayload, responseAmountOf,
} from './confirmation-signature.payload';

const NOW = new Date('2026-10-19T12:00:00Z');
const ok = { mode: 'POSITIVE_WITH_AMOUNT', asOfDate: '2025-12-31', currency: 'usd', recipientVerified: true };
const send = (over: Record<string, unknown> = {}, hasAmount = true) => parseSendPayload({ ...ok, ...over }, { hasAmount, now: NOW });
const msg = (fn: () => unknown) => { try { fn(); } catch (e) { expect(e).toBeInstanceOf(BadRequestException); return (e as BadRequestException).message; } throw new Error('no lanzó'); };

describe('Confirmación · datos que elige el auditor al enviar', () => {
  it('datos correctos: se normalizan (moneda en mayúsculas, sin carta de autorización)', () => {
    expect(send()).toEqual({ mode: 'POSITIVE_WITH_AMOUNT', asOfDate: '2025-12-31', currency: 'USD', authorizationPath: null, recipientVerified: true });
    expect(send({ currency: undefined }).currency).toBe('USD'); // por defecto
    expect(send({ currency: '  eur ' }).currency).toBe('EUR');
  });

  it('el tipo debe ser uno de los dos y «con saldo» exige que la confirmación tenga monto', () => {
    expect(msg(() => send({ mode: 'NEGATIVA' }))).toMatch(/Elige el tipo/);
    expect(msg(() => send({ mode: undefined }))).toMatch(/Elige el tipo/);
    expect(msg(() => send({}, false))).toMatch(/no tiene monto/);
    expect(send({ mode: 'POSITIVE_BLANK' }, false).mode).toBe('POSITIVE_BLANK'); // en blanco no necesita monto
  });

  it('la fecha de corte debe ser una fecha real y razonable', () => {
    for (const bad of ['', '31/12/2025', '2025-13-01', '2026-02-31', '2025-1-5', '1999-12-31', '2030-01-01', undefined, 20251231]) {
      expect(msg(() => send({ asOfDate: bad }))).toMatch(/fecha de corte/);
    }
    expect(send({ asOfDate: '2026-02-28' }).asOfDate).toBe('2026-02-28');
  });

  it('la moneda son 3 letras', () => {
    for (const bad of ['US', 'DOLAR', 'U$D', '123']) expect(msg(() => send({ currency: bad }))).toMatch(/3 letras/);
  });

  it('la verificación del correo del confirmante (NIA 505) debe venir como booleano verdadero, nunca como texto', () => {
    for (const bad of [false, undefined, 'true', 'sí', 1, 'on']) expect(msg(() => send({ recipientVerified: bad }))).toMatch(/verificar de forma independiente/);
  });

  it('la carta de autorización es opcional y solo una ruta corta', () => {
    expect(send({ authorizationPath: 'signature-requests/a/authorizations/c/x.pdf' }).authorizationPath).toBe('signature-requests/a/authorizations/c/x.pdf');
    expect(send({ authorizationPath: '' }).authorizationPath).toBeNull();
    expect(send({ authorizationPath: null }).authorizationPath).toBeNull();
    for (const bad of [42, {}, 'x'.repeat(301)]) expect(msg(() => send({ authorizationPath: bad }))).toMatch(/carta de autorización/);
  });
});

describe('Confirmación · la carta de autorización solo puede ser de ESTA confirmación', () => {
  const folder = authorizationFolder('aud1', 'conf1');
  const id = '0f8b2c1e-4d3a-4b6c-9a7e-1234567890ab';
  it('acepta solo un PDF con nombre de uuid dentro de su carpeta', () => {
    expect(folder).toBe('signature-requests/aud1/authorizations/conf1');
    expect(isOwnAuthorizationPath(`${folder}/${id}.pdf`, 'aud1', 'conf1')).toBe(true);
  });
  it('rechaza otra confirmación, otra auditoría, el original en cuarentena, otras extensiones y rutas con trucos', () => {
    for (const bad of [
      `signature-requests/aud1/authorizations/conf2/${id}.pdf`, `signature-requests/aud2/authorizations/conf1/${id}.pdf`,
      `${folder}/quarantine/${id}.pdf`, `${folder}/${id}.png`, `${folder}/${id}.pdf.exe`, `${folder}/../conf2/${id}.pdf`,
      `${folder}/x.pdf`, `${folder}/`, folder, `/${folder}/${id}.pdf`, `signature-requests/aud1/${id}/original.pdf`, '',
    ]) expect(isOwnAuthorizationPath(bad, 'aud1', 'conf1')).toBe(false);
  });
});

describe('Confirmación · respuesta del confirmante', () => {
  const resp = (raw: unknown, mode: 'POSITIVE_WITH_AMOUNT' | 'POSITIVE_BLANK' = 'POSITIVE_WITH_AMOUNT') => parseResponse(raw, mode);

  it('de acuerdo con el saldo mostrado: basta con indicarlo (el monto es opcional)', () => {
    expect(resp({ agrees: true })).toEqual({ agrees: true, confirmedAmount: null, comments: '' });
    expect(resp({ agrees: true, confirmedAmount: 1250.5, comments: '  todo bien  ' })).toEqual({ agrees: true, confirmedAmount: 1250.5, comments: 'todo bien' });
  });

  it('en desacuerdo exige el saldo; con saldo en blanco SIEMPRE lo exige', () => {
    expect(msg(() => resp({ agrees: false }))).toMatch(/Si no estás de acuerdo/);
    expect(resp({ agrees: false, confirmedAmount: 0 }).confirmedAmount).toBe(0); // cero es un saldo válido
    expect(msg(() => resp({ agrees: true }, 'POSITIVE_BLANK'))).toMatch(/Escribe el saldo/);
    expect(resp({ agrees: true, confirmedAmount: 10 }, 'POSITIVE_BLANK').confirmedAmount).toBe(10);
  });

  it('«agrees» debe ser un booleano de verdad', () => {
    for (const bad of [undefined, null, 'true', 'sí', 1, 0]) expect(msg(() => resp({ agrees: bad }))).toMatch(/Indica si estás de acuerdo/);
    expect(msg(() => resp(null))).toMatch(/Indica si estás de acuerdo/);
    expect(msg(() => resp([1, 2]))).toMatch(/Indica si estás de acuerdo/);
  });

  it('el saldo: número finito ≥ 0 con 2 decimales como máximo, nada de textos', () => {
    for (const bad of [-1, NaN, Infinity, 1.005, 1e14, '100', {}, true]) expect(msg(() => resp({ agrees: false, confirmedAmount: bad }))).toMatch(/número mayor o igual a cero/);
    expect(resp({ agrees: false, confirmedAmount: 19.99 }).confirmedAmount).toBe(19.99);
    expect(resp({ agrees: false, confirmedAmount: 0.1 + 0.2 }).confirmedAmount).toBe(0.3); // 0.30000000000000004 es 0.30 para efectos del dinero
  });

  it('los comentarios son texto de hasta 4000 caracteres; campos de más se rechazan', () => {
    expect(msg(() => resp({ agrees: true, comments: 123 }))).toMatch(/comentarios deben ser texto/);
    expect(msg(() => resp({ agrees: true, comments: 'x'.repeat(4001) }))).toMatch(/demasiado largos/);
    expect(resp({ agrees: true, comments: 'x'.repeat(4000) }).comments).toHaveLength(4000);
    expect(msg(() => resp({ agrees: true, organizationId: 'otra', status: 'RECEIVED' }))).toMatch(/no corresponden/);
  });

  it('qué monto queda como «respuesta»: el mostrado si está de acuerdo; si no, el que escribió', () => {
    const agree = { agrees: true, confirmedAmount: null, comments: '' };
    expect(responseAmountOf('POSITIVE_WITH_AMOUNT', 1250.5, agree)).toBe(1250.5);
    expect(responseAmountOf('POSITIVE_WITH_AMOUNT', 1250.5, { ...agree, agrees: false, confirmedAmount: 1300 })).toBe(1300);
    expect(responseAmountOf('POSITIVE_BLANK', null, { ...agree, confirmedAmount: 900 })).toBe(900);
    // en blanco, aunque «esté de acuerdo», manda lo que escribió
    expect(responseAmountOf('POSITIVE_BLANK', 5000, { agrees: true, confirmedAmount: 900, comments: '' })).toBe(900);
  });
});
