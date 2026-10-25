import { PortalApiError, type PortalCover } from '../portal-api';
import { SESSION_EXPIRED_NOTICE, classifyApiError, reducer, waitSecondsOf, type PortalStage } from './flow';

const cover: PortalCover = { orgName: 'Despacho Demo', maskedEmail: 'j•••@c•••.com', expiresAt: '2026-12-01T00:00:00.000Z' };
const loading: PortalStage = { kind: 'loading' };
const err = (status: number, message = 'x', reason?: string) => new PortalApiError(status, message, reason);

describe('máquina de estados del portal', () => {
  it('carga la portada y pide el código (sin enviarlo solo)', () => {
    expect(reducer(loading, { type: 'COVER_LOADED', cover })).toEqual({
      kind: 'code', cover, sent: false, error: null, notice: null, locked: false, permanent: false,
    });
  });

  it('el código enviado actualiza el correo enmascarado y limpia errores', () => {
    const s = reducer({ kind: 'code', cover, sent: false, error: 'malo', notice: 'aviso', locked: false, permanent: false }, { type: 'OTP_SENT', maskedEmail: 'n•••@c•••.com' });
    expect(s).toMatchObject({ kind: 'code', sent: true, error: null, notice: null, cover: { maskedEmail: 'n•••@c•••.com' } });
  });

  it('un código acertado abre el portal con la sesión; un evento fuera de lugar no cambia nada', () => {
    const code: PortalStage = { kind: 'code', cover, sent: true, error: null, notice: null, locked: false, permanent: false };
    expect(reducer(code, { type: 'VERIFIED', sessionToken: 'S'.repeat(43), sessionExpiresAt: '2026-10-25T12:30:00Z' }))
      .toEqual({ kind: 'portal', cover, sessionToken: 'S'.repeat(43), sessionExpiresAt: '2026-10-25T12:30:00Z' });
    expect(reducer(loading, { type: 'VERIFIED', sessionToken: 'x', sessionExpiresAt: 'y' })).toBe(loading);
    expect(reducer(loading, { type: 'OTP_SENT', maskedEmail: 'x' })).toBe(loading);
  });

  it('un error de código se muestra y un bloqueo definitivo se recuerda', () => {
    const code: PortalStage = { kind: 'code', cover, sent: true, error: null, notice: null, locked: false, permanent: false };
    const wrong = reducer(code, { type: 'CODE_ERROR', message: 'Código incorrecto' });
    expect(wrong).toMatchObject({ error: 'Código incorrecto', locked: false });
    const locked = reducer(wrong, { type: 'CODE_ERROR', message: 'Bloqueado', locked: true, permanent: true });
    expect(locked).toMatchObject({ error: 'Bloqueado', locked: true, permanent: true });
    // un error posterior sin marcas NO desbloquea
    expect(reducer(locked, { type: 'CODE_ERROR', message: 'otro' })).toMatchObject({ locked: true, permanent: true });
  });

  it('al vencer la sesión se vuelve al paso del código con el aviso, sin enviar nada', () => {
    const portal: PortalStage = { kind: 'portal', cover, sessionToken: 'S'.repeat(43), sessionExpiresAt: 'z' };
    expect(reducer(portal, { type: 'SESSION_EXPIRED' })).toEqual({
      kind: 'code', cover, sent: false, error: null, notice: SESSION_EXPIRED_NOTICE, locked: false, permanent: false,
    });
    expect(reducer(loading, { type: 'SESSION_EXPIRED' })).toBe(loading);
  });

  it('los estados terminales y el reintento', () => {
    expect(reducer(loading, { type: 'TERMINAL', stage: { kind: 'invalid' } })).toEqual({ kind: 'invalid' });
    const down = reducer(loading, { type: 'TERMINAL', stage: { kind: 'unavailable', message: 'sin red' } });
    expect(reducer(down, { type: 'RESTART' })).toEqual({ kind: 'loading' });
    expect(reducer({ kind: 'invalid' }, { type: 'RESTART' })).toEqual({ kind: 'invalid' }); // solo se reintenta lo transitorio
  });
});

describe('qué hacer ante un error de la API', () => {
  it('404 → enlace inválido y 410 → vencido, en cualquier contexto', () => {
    for (const ctx of ['load', 'session', 'code'] as const) {
      expect(classifyApiError(err(404), ctx)).toEqual({ action: 'terminal', stage: { kind: 'invalid' } });
      expect(classifyApiError(err(410), ctx)).toEqual({ action: 'terminal', stage: { kind: 'expired' } });
    }
  });

  it('401 pide verificar de nuevo solo en operaciones con sesión', () => {
    expect(classifyApiError(err(401), 'session')).toEqual({ action: 'session-expired' });
    expect(classifyApiError(err(401, 'Código malo'), 'code')).toEqual({ action: 'inline', message: 'Código malo' });
  });

  it('423 distingue el bloqueo de 1 hora del definitivo por la marca de la API, no por el texto', () => {
    expect(classifyApiError(err(423, 'Demasiados intentos. Vuelve a intentarlo en una hora.'), 'code')).toEqual({ action: 'locked', permanent: false, message: 'Demasiados intentos. Vuelve a intentarlo en una hora.' });
    expect(classifyApiError(err(423, 'Texto cualquiera', 'locked-permanent'), 'code')).toMatchObject({ action: 'locked', permanent: true });
  });

  it('429 al pedir código ajusta la cuenta regresiva a lo que dice el servidor', () => {
    expect(classifyApiError(err(429, 'Espera 30 segundos para pedir otro código.'), 'code')).toEqual({ action: 'wait', seconds: 30, message: 'Espera 30 segundos para pedir otro código.' });
    expect(classifyApiError(err(429, 'Pediste demasiados códigos. Inténtalo de nuevo más tarde.'), 'code')).toMatchObject({ action: 'inline' });
  });

  it('al abrir el enlace, red caída, 5xx y 429 son «no disponible» (se puede reintentar); en sesión son errores en línea', () => {
    for (const status of [0, 500, 503, 429]) {
      expect(classifyApiError(err(status, 'fallo'), 'load')).toEqual({ action: 'terminal', stage: { kind: 'unavailable', message: 'fallo' } });
    }
    expect(classifyApiError(err(503, 'No pudimos enviar el código.'), 'code')).toEqual({ action: 'inline', message: 'No pudimos enviar el código.' });
    expect(classifyApiError(err(500, 'x'), 'session')).toEqual({ action: 'inline', message: 'x' });
  });

  it('un error que no es de la API no rompe la pantalla', () => {
    expect(classifyApiError(new Error('boom'), 'session')).toMatchObject({ action: 'inline' });
  });

  it('waitSecondsOf lee los segundos del mensaje', () => {
    expect(waitSecondsOf('Espera 45 segundos para pedir otro código.')).toBe(45);
    expect(waitSecondsOf('Espera 1 segundo')).toBe(1);
    expect(waitSecondsOf('Pediste demasiados códigos')).toBeNull();
  });
});
