import { classifyApiError, reducer, SESSION_EXPIRED_NOTICE, Stage } from './flow';
import { SignatureApiError, toApiError } from './api';
import type { PublicDocument, PublicRequest } from './types';

const request = (over: Partial<PublicRequest> = {}): PublicRequest => ({
  orgName: 'Pérez Cortez y Asociados', documentLabel: 'Confirmación externa', title: 'Confirmación de saldo', maskedEmail: 'j•••@b•••.com',
  expiresAt: '2026-11-01T00:00:00Z', status: 'PENDING', requiresOtp: true, signedAt: null, canDownloadSigned: false, ...over,
});
const doc = {
  title: 'T', documentLabel: 'L', orgName: 'O', signerName: 'S', signerRole: null, expiresAt: null, documentSha256: 'a'.repeat(64), pdfUrl: 'https://x/y.pdf',
  consentVersion: 'v1', consentText: 'c', privacyNotice: 'p', declineNotice: 'd', form: { fields: [], allowAttachments: false, signedRoleRequired: true }, attachments: [],
} as PublicDocument;

const run = (events: Parameters<typeof reducer>[1][], from: Stage = { kind: 'loading' }) => events.reduce(reducer, from);

describe('máquina de estados del firmante', () => {
  it('camino feliz de firma: cargar → pedir código → código enviado → verificado → documento → firmado', () => {
    const s = run([
      { type: 'LOADED', request: request() },
      { type: 'GO_CODE', purpose: 'sign' },
      { type: 'OTP_SENT', maskedEmail: 'j•••@b•••.com' },
      { type: 'VERIFIED_SIGN', doc, sessionToken: 'S'.repeat(43), sessionExpiresAt: '2026-10-19T12:30:00Z' },
      { type: 'SIGNED', verificationCode: 'ABCD-EFGH-JKMN-PQRS' },
    ]);
    expect(s).toMatchObject({ kind: 'signed', verificationCode: 'ABCD-EFGH-JKMN-PQRS' });
  });

  it('una solicitud ya firmada se abre en "ya firmada" (permite descargar); ya rechazada, en "rechazada"', () => {
    expect(reducer({ kind: 'loading' }, { type: 'LOADED', request: request({ status: 'SIGNED' }) }).kind).toBe('already-signed');
    expect(reducer({ kind: 'loading' }, { type: 'LOADED', request: request({ status: 'DECLINED' }) })).toEqual({ kind: 'declined', justNow: false });
  });

  it('la sesión vencida vuelve a pedir el código CONSERVANDO el propósito y explicando por qué', () => {
    const inDoc = run([{ type: 'LOADED', request: request() }, { type: 'GO_CODE', purpose: 'sign' }, { type: 'VERIFIED_SIGN', doc, sessionToken: 's', sessionExpiresAt: 'x' }]);
    expect(inDoc.kind).toBe('document');
    expect(reducer(inDoc, { type: 'SESSION_EXPIRED' })).toMatchObject({ kind: 'code', purpose: 'sign', sent: false, notice: SESSION_EXPIRED_NOTICE });

    const inDownload = run([{ type: 'LOADED', request: request({ status: 'SIGNED' }) }, { type: 'GO_CODE', purpose: 'download' }, { type: 'VERIFIED_DOWNLOAD', sessionToken: 's' }]);
    expect(reducer(inDownload, { type: 'SESSION_EXPIRED' })).toMatchObject({ kind: 'code', purpose: 'download', notice: SESSION_EXPIRED_NOTICE });
  });

  it('un "ya firmado" tardío (doble clic en Firmar) no reemplaza la constancia recién mostrada', () => {
    const signed = run([{ type: 'LOADED', request: request() }, { type: 'SIGNED', verificationCode: 'ABCD-EFGH-JKMN-PQRS' }]);
    expect(signed.kind).toBe('signed');
    expect(reducer(signed, { type: 'ALREADY_SIGNED' })).toBe(signed);
  });

  it('"Reintentar" tras un fallo de red solo reinicia desde la pantalla de no disponible', () => {
    expect(reducer({ kind: 'unavailable', message: 'sin red' }, { type: 'RESTART' })).toEqual({ kind: 'loading' });
    const intro: Stage = { kind: 'intro', request: request() };
    expect(reducer(intro, { type: 'RESTART' })).toBe(intro);
  });

  it('SESSION_EXPIRED fuera de documento/descarga no hace nada', () => {
    const s: Stage = { kind: 'intro', request: request() };
    expect(reducer(s, { type: 'SESSION_EXPIRED' })).toBe(s);
  });

  it('errores del código quedan en pantalla; un bloqueo (423) se recuerda', () => {
    let s = run([{ type: 'LOADED', request: request() }, { type: 'GO_CODE', purpose: 'sign' }]);
    s = reducer(s, { type: 'CODE_ERROR', message: 'Código incorrecto. Te quedan 4 intento(s).' });
    expect(s).toMatchObject({ kind: 'code', error: 'Código incorrecto. Te quedan 4 intento(s).', locked: false });
    s = reducer(s, { type: 'CODE_ERROR', message: 'Demasiados intentos.', locked: true });
    expect(s).toMatchObject({ locked: true });
    // reenviar un código nuevo limpia el error
    expect(reducer(s, { type: 'OTP_SENT', maskedEmail: 'j•••@b•••.com' })).toMatchObject({ sent: true, error: null });
  });

  it('descarga: comprobando → sellando → listo, y recuerda el enlace', () => {
    let s = run([{ type: 'LOADED', request: request({ status: 'SIGNED' }) }, { type: 'GO_CODE', purpose: 'download' }, { type: 'VERIFIED_DOWNLOAD', sessionToken: 's' }]);
    expect(s).toMatchObject({ kind: 'download', state: 'checking' });
    s = reducer(s, { type: 'DOWNLOAD_STATE', state: 'sealing' });
    expect(s).toMatchObject({ state: 'sealing', pdfUrl: null });
    s = reducer(s, { type: 'DOWNLOAD_STATE', state: 'ready', pdfUrl: 'https://x/signed.pdf' });
    expect(s).toMatchObject({ state: 'ready', pdfUrl: 'https://x/signed.pdf' });
  });

  it('los eventos que no corresponden al estado actual se ignoran (no rompen la pantalla)', () => {
    const s: Stage = { kind: 'invalid' };
    expect(reducer(s, { type: 'OTP_SENT', maskedEmail: 'x' })).toBe(s);
    expect(reducer(s, { type: 'GO_CODE', purpose: 'sign' })).toBe(s);
    expect(reducer(s, { type: 'SIGNED', verificationCode: 'X' })).toBe(s);
    expect(reducer(s, { type: 'DOWNLOAD_STATE', state: 'ready' })).toBe(s);
  });

  it('"ya firmada" detectada durante la operación (409) conserva la solicitud', () => {
    const s = run([{ type: 'LOADED', request: request() }, { type: 'GO_CODE', purpose: 'sign' }, { type: 'ALREADY_SIGNED' }]);
    expect(s).toMatchObject({ kind: 'already-signed', request: { status: 'SIGNED' } });
  });
});

describe('classifyApiError', () => {
  const err = (status: number, extra: { reason?: string; finalStatus?: string } = {}, msg = 'mensaje') =>
    new SignatureApiError(status, msg, extra.reason, extra.finalStatus);

  it('404 = enlace inválido; 410 distingue vencida de revocada', () => {
    expect(classifyApiError(err(404), 'load')).toEqual({ action: 'terminal', stage: { kind: 'invalid' } });
    expect(classifyApiError(err(410, { reason: 'revoked' }), 'load')).toEqual({ action: 'terminal', stage: { kind: 'gone', reason: 'revoked' } });
    expect(classifyApiError(err(410, { reason: 'expired' }), 'session')).toEqual({ action: 'terminal', stage: { kind: 'gone', reason: 'expired' } });
    expect(classifyApiError(err(410), 'code')).toEqual({ action: 'terminal', stage: { kind: 'gone', reason: 'expired' } });
  });

  it('401 solo significa "sesión vencida" cuando la operación exige sesión', () => {
    expect(classifyApiError(err(401), 'session')).toEqual({ action: 'session-expired' });
    expect(classifyApiError(err(401, {}, 'x'), 'code')).toEqual({ action: 'inline', message: 'x' });
  });

  it('409 usa el estado final que manda la API', () => {
    expect(classifyApiError(err(409, { finalStatus: 'SIGNED' }), 'session')).toEqual({ action: 'already-signed' });
    expect(classifyApiError(err(409, { finalStatus: 'DECLINED' }), 'session')).toEqual({ action: 'terminal', stage: { kind: 'declined', justNow: false } });
    expect(classifyApiError(err(409, {}, 'El documento no pudo verificarse'), 'session')).toEqual({ action: 'inline', message: 'El documento no pudo verificarse' });
  });

  it('423 = bloqueado; 400/422/429 son mensajes en pantalla', () => {
    expect(classifyApiError(err(423, {}, 'Demasiados intentos'), 'code')).toEqual({ action: 'locked', message: 'Demasiados intentos' });
    for (const s of [400, 422, 429, 413]) expect(classifyApiError(err(s, {}, 'm'), 'session')).toEqual({ action: 'inline', message: 'm' });
  });

  it('al abrir el enlace, un fallo de red o del servidor es "no disponible"; durante una operación es un mensaje en pantalla', () => {
    expect(classifyApiError(err(0, {}, 'sin red'), 'load')).toEqual({ action: 'terminal', stage: { kind: 'unavailable', message: 'sin red' } });
    expect(classifyApiError(err(503, {}, 'apagado'), 'load')).toEqual({ action: 'terminal', stage: { kind: 'unavailable', message: 'apagado' } });
    expect(classifyApiError(err(0, {}, 'sin red'), 'session')).toEqual({ action: 'inline', message: 'sin red' });
    expect(classifyApiError(err(503, {}, 'apagado'), 'code')).toEqual({ action: 'inline', message: 'apagado' });
  });

  it('un error que no es de la API no revienta', () => {
    expect(classifyApiError(new Error('boom'), 'load')).toEqual({ action: 'inline', message: 'Ocurrió un error inesperado. Inténtalo de nuevo.' });
  });
});

describe('toApiError (cuerpos de error de Nest)', () => {
  it('une los mensajes de validación y conserva reason/status', () => {
    expect(toApiError(400, { message: ['El código son 6 dígitos.', 'Otro'] }).message).toBe('El código son 6 dígitos. Otro');
    expect(toApiError(410, { message: 'Venció', reason: 'expired' })).toMatchObject({ status: 410, reason: 'expired' });
    expect(toApiError(409, { message: 'Ya firmada', status: 'SIGNED' })).toMatchObject({ finalStatus: 'SIGNED' });
    expect(toApiError(500, null).message).toBe('No se pudo completar la operación.');
  });
});
