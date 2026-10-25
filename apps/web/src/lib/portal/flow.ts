import { PortalApiError, type PortalCover } from '../portal-api';

/**
 * Máquina de estados del portal PBC del auditado. PURA (sin React ni red): el componente solo dibuja y despacha eventos,
 * y aquí se decide qué pantalla toca ante cada respuesta de la API. Mismo enfoque que lib/signature/flow.ts.
 *
 *   cargando ─► código (sin enviar) ─[Enviar código]─► código (enviado) ─[verificar]─► portal
 *      │              ▲                                                                   │
 *      │              └──────────── sesión vencida (30 min o 401) ◄────────────────────────┘
 *      └─► inválido (404) · vencido (410) · no disponible (red / 5xx / 429 al abrir)
 */
export type PortalStage =
  | { kind: 'loading' }
  | { kind: 'invalid' }
  | { kind: 'expired' }
  | { kind: 'unavailable'; message: string }
  | { kind: 'code'; cover: PortalCover; sent: boolean; error: string | null; notice: string | null; locked: boolean; permanent: boolean }
  | { kind: 'portal'; cover: PortalCover; sessionToken: string; sessionExpiresAt: string };

export type PortalEvent =
  | { type: 'COVER_LOADED'; cover: PortalCover }
  | { type: 'TERMINAL'; stage: Extract<PortalStage, { kind: 'invalid' | 'expired' | 'unavailable' }> }
  | { type: 'OTP_SENT'; maskedEmail: string }
  | { type: 'CODE_ERROR'; message: string; locked?: boolean; permanent?: boolean }
  | { type: 'VERIFIED'; sessionToken: string; sessionExpiresAt: string }
  | { type: 'SESSION_EXPIRED' }
  | { type: 'RESTART' };

export const SESSION_EXPIRED_NOTICE = 'Tu sesión segura venció. Verifica tu correo otra vez; no perderás lo que escribiste.';

const coverOf = (s: PortalStage): PortalCover | null => ('cover' in s ? s.cover : null);

export function reducer(state: PortalStage, ev: PortalEvent): PortalStage {
  switch (ev.type) {
    case 'COVER_LOADED':
      return { kind: 'code', cover: ev.cover, sent: false, error: null, notice: null, locked: false, permanent: false };

    case 'TERMINAL':
      return ev.stage;

    case 'OTP_SENT':
      return state.kind === 'code' ? { ...state, sent: true, cover: { ...state.cover, maskedEmail: ev.maskedEmail }, error: null, notice: null } : state;

    case 'CODE_ERROR':
      return state.kind === 'code'
        ? { ...state, error: ev.message, locked: ev.locked ?? state.locked, permanent: ev.permanent ?? state.permanent }
        : state;

    case 'VERIFIED':
      return state.kind === 'code' ? { kind: 'portal', cover: state.cover, sessionToken: ev.sessionToken, sessionExpiresAt: ev.sessionExpiresAt } : state;

    case 'SESSION_EXPIRED': {
      // La sesión venció (o la revocaron): volver a pedir el código. Lo escrito vive FUERA de la máquina y no se pierde.
      const cover = state.kind === 'portal' ? coverOf(state) : null;
      return cover ? { kind: 'code', cover, sent: false, error: null, notice: SESSION_EXPIRED_NOTICE, locked: false, permanent: false } : state;
    }

    case 'RESTART':
      // Reintentar tras un fallo de red al abrir el enlace: volver a la pantalla de carga.
      return state.kind === 'unavailable' ? { kind: 'loading' } : state;
  }
}

// ─── Qué hacer ante un error de la API ───────────────────────────────────────
export type PortalErrorAction =
  | { action: 'terminal'; stage: Extract<PortalStage, { kind: 'invalid' | 'expired' | 'unavailable' }> }
  | { action: 'session-expired' }
  | { action: 'locked'; permanent: boolean; message: string }
  | { action: 'wait'; seconds: number; message: string }
  | { action: 'inline'; message: string };

/** «Espera 30 segundos para pedir otro código.» → 30 (la cuenta regresiva de «Reenviar» se ajusta a lo que dice el servidor). */
export function waitSecondsOf(message: string): number | null {
  const m = /espera\s+(\d{1,4})\s+segundos?/i.exec(message);
  return m ? Number(m[1]) : null;
}

/**
 * @param ctx 'load' = al abrir el enlace; 'session' = operación que exige sesión (ver la solicitud, escribir, enviar);
 *            'code' = pedir/verificar el código.
 */
export function classifyApiError(err: unknown, ctx: 'load' | 'session' | 'code'): PortalErrorAction {
  if (!(err instanceof PortalApiError)) return { action: 'inline', message: 'Ocurrió un error inesperado. Inténtalo de nuevo.' };
  const { status, message } = err;

  if (status === 404) return { action: 'terminal', stage: { kind: 'invalid' } };
  if (status === 410) return { action: 'terminal', stage: { kind: 'expired' } };
  if (status === 401 && ctx === 'session') return { action: 'session-expired' };
  if (status === 423) return { action: 'locked', permanent: err.reason === 'locked-permanent', message };
  if (status === 429) {
    const seconds = waitSecondsOf(message);
    if (ctx === 'code' && seconds !== null) return { action: 'wait', seconds, message };
    if (ctx === 'load') return { action: 'terminal', stage: { kind: 'unavailable', message } };
    return { action: 'inline', message };
  }
  if (ctx === 'load' && (status === 0 || status >= 500)) return { action: 'terminal', stage: { kind: 'unavailable', message } };
  return { action: 'inline', message };
}
