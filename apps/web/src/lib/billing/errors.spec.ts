import { describeBillingError, isGlobalBillingNotice, parseBillingError } from './errors';

describe('reconocer errores de plan del guardián', () => {
  it('402 LICENCIA_VENCIDA', () => {
    const info = parseBillingError(402, { statusCode: 402, code: 'LICENCIA_VENCIDA', message: 'x', status: 'READ_ONLY' });
    expect(info).toEqual({ code: 'LICENCIA_VENCIDA', status: 402 });
  });

  it('403 MODULO_NO_INCLUIDO con módulo conocido', () => {
    expect(parseBillingError(403, { code: 'MODULO_NO_INCLUIDO', module: 'CARTERA' })).toEqual({ code: 'MODULO_NO_INCLUIDO', status: 403, module: 'CARTERA' });
  });

  it('un módulo desconocido o hostil no se conserva', () => {
    const info = parseBillingError(403, { code: 'MODULO_NO_INCLUIDO', module: '<img src=x onerror=alert(1)>' });
    expect(info).toEqual({ code: 'MODULO_NO_INCLUIDO', status: 403 });
  });

  it('402 LIMITE_USUARIOS con cifras', () => {
    expect(parseBillingError(402, { code: 'LIMITE_USUARIOS', used: 5, allowed: 5 })).toEqual({ code: 'LIMITE_USUARIOS', status: 402, used: 5, allowed: 5 });
    expect(parseBillingError(402, { code: 'LIMITE_USUARIOS', used: '5', allowed: null })).toEqual({ code: 'LIMITE_USUARIOS', status: 402 });
  });

  it('403 ASISTENTE_NO_INCLUIDO acepta mayúsculas o minúsculas del servidor', () => {
    expect(parseBillingError(403, { code: 'ASISTENTE_NO_INCLUIDO', assistant: 'atlas' })?.assistant).toBe('ATLAS');
    expect(parseBillingError(403, { code: 'ASISTENTE_NO_INCLUIDO', assistant: 'NO_EXISTE' })?.assistant).toBeUndefined();
  });

  it('ignora lo que no es un error de plan', () => {
    expect(parseBillingError(500, { code: 'LICENCIA_VENCIDA' })).toBeNull();
    expect(parseBillingError(401, { code: 'LICENCIA_VENCIDA' })).toBeNull();
    expect(parseBillingError(403, { message: 'Forbidden resource' })).toBeNull();
    expect(parseBillingError(403, { code: 'OTRA_COSA' })).toBeNull();
    expect(parseBillingError(402, null)).toBeNull();
    expect(parseBillingError(402, 'texto')).toBeNull();
    expect(parseBillingError(402, [])).toBeNull();
    expect(parseBillingError(403, { code: 42 })).toBeNull();
  });
});

describe('mensajes en español', () => {
  it('solo lectura explica que no se borró nada', () => {
    const n = describeBillingError({ code: 'LICENCIA_VENCIDA', status: 402 });
    expect(n.tone).toBe('critical');
    expect(n.title).toContain('solo lectura');
    expect(n.message).toContain('No se borró nada');
  });

  it('módulo fuera del plan nombra el módulo con su etiqueta, no con la clave', () => {
    const n = describeBillingError({ code: 'MODULO_NO_INCLUIDO', status: 403, module: 'CARTERA' });
    expect(n.message).toContain('Cartera de Auditoría Externa');
    expect(n.message).not.toContain('CARTERA');
    expect(n.tone).toBe('warning');
  });

  it('sin módulo conocido el mensaje sigue siendo claro', () => {
    expect(describeBillingError({ code: 'MODULO_NO_INCLUIDO', status: 403 }).message).toContain('no está incluido en tu plan');
  });

  it('límite de usuarios usa las cifras si las hay', () => {
    expect(describeBillingError({ code: 'LIMITE_USUARIOS', status: 402, used: 5, allowed: 5 }).message).toContain('permite 5 usuarios y ya tienes 5');
    expect(describeBillingError({ code: 'LIMITE_USUARIOS', status: 402 }).message).toContain('plazas libres');
  });

  it('asistente fuera del plan', () => {
    expect(describeBillingError({ code: 'ASISTENTE_NO_INCLUIDO', status: 403, assistant: 'ATLAS' }).message).toContain('ATLAS (ESG)');
    expect(describeBillingError({ code: 'ASISTENTE_NO_INCLUIDO', status: 403 }).message).toContain('asistente de IA');
  });

  it('solo dos códigos muestran el aviso global', () => {
    expect(isGlobalBillingNotice({ code: 'LICENCIA_VENCIDA', status: 402 })).toBe(true);
    expect(isGlobalBillingNotice({ code: 'MODULO_NO_INCLUIDO', status: 403 })).toBe(true);
    expect(isGlobalBillingNotice({ code: 'LIMITE_USUARIOS', status: 402 })).toBe(false);
    expect(isGlobalBillingNotice({ code: 'ASISTENTE_NO_INCLUIDO', status: 403 })).toBe(false);
  });
});
