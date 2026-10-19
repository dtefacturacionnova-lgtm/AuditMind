import type { PublicDocument, PublicRequest } from './types';
import { SignatureApiError } from './api';

/**
 * Máquina de estados del flujo del firmante. PURA (sin React ni red): el componente solo dibuja y despacha
 * eventos, y aquí se decide qué pantalla toca. Así las reglas (qué hacer ante un 401, un 410, un 423…) se prueban
 * sin navegador.
 */
export type CodePurpose = 'sign' | 'download';

export type Stage =
  | { kind: 'loading' }
  | { kind: 'no-token' }
  | { kind: 'invalid' }
  | { kind: 'gone'; reason: 'expired' | 'revoked' }
  | { kind: 'unavailable'; message: string }
  | { kind: 'declined'; justNow: boolean }
  | { kind: 'intro'; request: PublicRequest }
  | { kind: 'already-signed'; request: PublicRequest }
  | { kind: 'code'; request: PublicRequest; purpose: CodePurpose; maskedEmail: string; sent: boolean; error: string | null; notice: string | null; locked: boolean }
  | { kind: 'document'; request: PublicRequest; doc: PublicDocument; sessionToken: string; sessionExpiresAt: string }
  | { kind: 'signed'; request: PublicRequest; verificationCode: string }
  | { kind: 'download'; request: PublicRequest; sessionToken: string; state: 'checking' | 'sealing' | 'failed' | 'ready'; pdfUrl: string | null };

export type FlowEvent =
  | { type: 'LOADED'; request: PublicRequest }
  | { type: 'TERMINAL'; stage: Extract<Stage, { kind: 'no-token' | 'invalid' | 'gone' | 'unavailable' | 'declined' }> }
  | { type: 'GO_CODE'; purpose: CodePurpose }
  | { type: 'OTP_SENT'; maskedEmail: string }
  | { type: 'CODE_ERROR'; message: string; locked?: boolean }
  | { type: 'VERIFIED_SIGN'; doc: PublicDocument; sessionToken: string; sessionExpiresAt: string }
  | { type: 'VERIFIED_DOWNLOAD'; sessionToken: string }
  | { type: 'DOWNLOAD_STATE'; state: 'checking' | 'sealing' | 'failed' | 'ready'; pdfUrl?: string }
  | { type: 'SESSION_EXPIRED' }
  | { type: 'SIGNED'; verificationCode: string }
  | { type: 'ALREADY_SIGNED' }
  | { type: 'RESTART' };

const requestOf = (s: Stage): PublicRequest | null => ('request' in s ? s.request : null);

export const SESSION_EXPIRED_NOTICE = 'Tu sesión segura venció. Verifica tu correo otra vez; no perderás lo que escribiste.';

export function reducer(state: Stage, ev: FlowEvent): Stage {
  switch (ev.type) {
    case 'LOADED':
      if (ev.request.status === 'DECLINED') return { kind: 'declined', justNow: false };
      return ev.request.status === 'SIGNED' ? { kind: 'already-signed', request: ev.request } : { kind: 'intro', request: ev.request };

    case 'TERMINAL':
      return ev.stage;

    case 'GO_CODE': {
      const request = requestOf(state);
      if (!request) return state;
      return { kind: 'code', request, purpose: ev.purpose, maskedEmail: request.maskedEmail, sent: false, error: null, notice: null, locked: false };
    }

    case 'OTP_SENT':
      return state.kind === 'code' ? { ...state, sent: true, maskedEmail: ev.maskedEmail, error: null, notice: null } : state;

    case 'CODE_ERROR':
      return state.kind === 'code' ? { ...state, error: ev.message, locked: ev.locked ?? state.locked } : state;

    case 'VERIFIED_SIGN':
      return state.kind === 'code'
        ? { kind: 'document', request: state.request, doc: ev.doc, sessionToken: ev.sessionToken, sessionExpiresAt: ev.sessionExpiresAt }
        : state;

    case 'VERIFIED_DOWNLOAD':
      return state.kind === 'code'
        ? { kind: 'download', request: state.request, sessionToken: ev.sessionToken, state: 'checking', pdfUrl: null }
        : state;

    case 'DOWNLOAD_STATE':
      return state.kind === 'download' ? { ...state, state: ev.state, pdfUrl: ev.pdfUrl ?? state.pdfUrl } : state;

    case 'SESSION_EXPIRED': {
      // La sesión venció (o la revocaron): volver a pedir el código. El formulario vive fuera de la máquina.
      if (state.kind === 'document') {
        return { kind: 'code', request: state.request, purpose: 'sign', maskedEmail: state.request.maskedEmail, sent: false, error: null, notice: SESSION_EXPIRED_NOTICE, locked: false };
      }
      if (state.kind === 'download') {
        return { kind: 'code', request: state.request, purpose: 'download', maskedEmail: state.request.maskedEmail, sent: false, error: null, notice: SESSION_EXPIRED_NOTICE, locked: false };
      }
      return state;
    }

    case 'SIGNED': {
      const request = requestOf(state);
      return request ? { kind: 'signed', request, verificationCode: ev.verificationCode } : state;
    }

    case 'ALREADY_SIGNED': {
      // Un doble clic en "Firmar" hace que la 2.ª petición responda "ya firmado": no debe tapar la constancia recién mostrada.
      if (state.kind === 'signed') return state;
      const request = requestOf(state);
      return request ? { kind: 'already-signed', request: { ...request, status: 'SIGNED' } } : state;
    }

    case 'RESTART':
      // Reintentar tras un fallo de red al abrir el enlace: volver a la pantalla de carga.
      return state.kind === 'unavailable' ? { kind: 'loading' } : state;
  }
}

// ─── Qué hacer ante un error de la API ───────────────────────────────────────
export type ErrorAction =
  | { action: 'terminal'; stage: Extract<Stage, { kind: 'invalid' | 'gone' | 'unavailable' | 'declined' }> }
  | { action: 'session-expired' }
  | { action: 'already-signed' }
  | { action: 'locked'; message: string }
  | { action: 'inline'; message: string };

/**
 * @param ctx 'load' = al abrir el enlace; 'session' = operación que exige sesión (documento, adjuntos, firmar…);
 *            'code' = pedir/verificar el código.
 */
export function classifyApiError(err: unknown, ctx: 'load' | 'session' | 'code'): ErrorAction {
  if (!(err instanceof SignatureApiError)) return { action: 'inline', message: 'Ocurrió un error inesperado. Inténtalo de nuevo.' };
  const { status, message } = err;

  if (status === 404) return { action: 'terminal', stage: { kind: 'invalid' } };
  if (status === 410) return { action: 'terminal', stage: { kind: 'gone', reason: err.reason === 'revoked' ? 'revoked' : 'expired' } };
  if (status === 409) {
    if (err.finalStatus === 'DECLINED') return { action: 'terminal', stage: { kind: 'declined', justNow: false } };
    if (err.finalStatus === 'SIGNED') return { action: 'already-signed' };
    return { action: 'inline', message };
  }
  if (status === 401 && ctx === 'session') return { action: 'session-expired' };
  if (status === 423) return { action: 'locked', message };
  if (ctx === 'load' && (status === 0 || status >= 500)) return { action: 'terminal', stage: { kind: 'unavailable', message } };
  return { action: 'inline', message };
}
