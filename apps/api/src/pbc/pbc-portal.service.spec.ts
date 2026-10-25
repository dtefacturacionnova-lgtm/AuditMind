/* eslint-disable @typescript-eslint/no-explicit-any */
import { GoneException, HttpException, NotFoundException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { MAX_PBC_OTP_EMAILS_PER_ORG_PER_DAY, PbcPortalService } from './pbc-portal.service';
import { PbcService } from './pbc.service';
import {
  deriveOtpKey, derivePortalOtpKey, generateToken, hashToken, hmacOtp,
} from '../signatures/signature-crypto.util';
import { OTP_MAX_LOCKS, OTP_TTL_MS, SESSION_TTL_MS } from '../signatures/otp-limits';

/**
 * Portal PBC · código por correo (docs/portal-pbc-codigo-por-correo.md §7). Sin base real: una BD falsa en memoria que
 * serializa las transacciones; la concurrencia de verdad se prueba en pbc-portal.integration.spec.ts.
 */
const KEY = 'clave-maestra-de-prueba-0123456789';
const INFO = { ip: '203.0.113.7', userAgent: 'Jest' };
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

function useClock(start = '2026-10-25T12:00:00.000Z') {
  jest.useFakeTimers({ now: new Date(start), doNotFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'clearImmediate', 'nextTick', 'queueMicrotask', 'performance', 'hrtime'] });
  return { advance: (ms: number) => jest.setSystemTime(new Date(Date.now() + ms)), restore: () => jest.useRealTimers() };
}

function build(env: Record<string, string> = { ENCRYPTION_KEY: KEY }, emailOk = true) {
  const requests: any[] = []; const sessions: any[] = []; const events: any[] = []; const messages: any[] = [];
  let seq = 0;
  const byId = (id: string) => requests.find((r) => r.id === id);
  const project = (r: any, select?: any) => {
    if (!select) return { ...r };
    const o: any = {};
    for (const k of Object.keys(select)) o[k] = r[k];
    return o;
  };
  const calls = { findUnique: 0 };
  const prisma: any = {
    organization: { findUniqueOrThrow: async () => ({ name: 'Despacho Demo' }) },
    user: { findUnique: async () => ({ email: 'creador@despacho.test' }) },
    audit: { findFirst: async () => ({ id: 'aud1', isInvestigationMode: false, team: [] }) },
    pbcRequest: {
      findUnique: async ({ where, select }: any) => {
        calls.findUnique++;
        const r = requests.find((x) => (where.id ? x.id === where.id : x.portalTokenHash === where.portalTokenHash));
        return r ? project(r, select) : null;
      },
      findUniqueOrThrow: async (a: any) => { const r = await prisma.pbcRequest.findUnique(a); if (!r) throw new Error('no existe'); return r; },
      findFirst: async ({ where, select }: any) => {
        const r = requests.find((x) => (!where.id || x.id === where.id) && (!where.organizationId || x.organizationId === where.organizationId));
        return r ? project(r, select) : null;
      },
      update: async ({ where, data, select }: any) => { const r = byId(where.id); Object.assign(r, data); return project(r, select); },
    },
    pbcPortalSession: {
      findUnique: async ({ where }: any) => sessions.find((s) => s.tokenHash === where.tokenHash) ?? null,
      create: async ({ data }: any) => { const s = { id: `s${++seq}`, createdAt: new Date(), revokedAt: null, ...data }; sessions.push(s); return s; },
      updateMany: async ({ where, data }: any) => {
        const hit = sessions.filter((s) => s.requestId === where.requestId && (where.revokedAt === null ? s.revokedAt === null : true));
        hit.forEach((s) => Object.assign(s, data));
        return { count: hit.length };
      },
    },
    pbcPortalEvent: {
      create: async ({ data }: any) => { events.push({ id: `e${++seq}`, at: new Date(), ...data }); },
      count: async ({ where }: any) => events.filter((e) =>
        (!where.requestId || e.requestId === where.requestId) && e.type === where.type && e.at >= where.at.gte
        && (!where.request || byId(e.requestId)?.organizationId === where.request.organizationId)).length,
    },
    pbcMessage: { create: async ({ data }: any) => { const m = { id: `m${messages.length + 1}`, ...data }; messages.push(m); return m; } },
    $queryRaw: async () => [],
    $transaction: async (cb: any) => cb(prisma),
  };
  const codes: string[] = [];
  const email: any = {
    sendPbcPortalOtp: jest.fn(async (_to: string, p: { code: string }) => { if (emailOk) codes.push(p.code); return { sent: emailOk }; }),
    sendPbcPortalLockedAlert: jest.fn(async () => ({ sent: true })),
    portalUrl: (t: string) => `https://app.test/portal#${t}`,
  };
  const config: any = { get: (k: string, d?: string) => env[k] ?? d };
  const portal = new PbcPortalService(prisma, config, email);
  const team = new PbcService(prisma, config, email);

  const addRequest = (over: Partial<any> = {}) => {
    const token = generateToken();
    const r: any = {
      id: `p${requests.length + 1}`, organizationId: 'org1', auditId: 'aud1', createdById: 'u1', title: 'Estados de cuenta', description: 'Envíe los estados',
      status: 'PENDING', dueDate: new Date(Date.now() + 30 * DAY), requestedToEmail: 'juan@cliente.com', requestedToName: 'Juan', fileUrls: [],
      submittedAt: null, acceptedAt: null, rejectionReason: null, portalTokenHash: hashToken(token), portalTokenEncrypted: 'x.y.z',
      portalTokenExpiresAt: new Date(Date.now() + 60 * DAY),
      portalOtpHash: null, portalOtpExpiresAt: null, portalOtpAttempts: 0, portalOtpFailuresHour: 0, portalOtpWindowStart: null,
      portalOtpSentCount: 0, portalOtpLastSentAt: null, portalLockedUntil: null, portalLockCount: 0,
      audit: { title: 'Auditoría 2026' }, messages: [],
      ...over,
    };
    requests.push(r);
    return { r, token };
  };
  const wrongCode = () => { let c = '000000'; while (codes.at(-1) === c) c = '999999'; return c; };
  return { prisma, portal, team, email, codes, requests, sessions, events, messages, calls, addRequest, wrongCode };
}

/** Pide un código y acierta: devuelve la sesión. */
async function login(h: ReturnType<typeof build>, token: string) {
  await h.portal.sendOtp(token, INFO);
  return h.portal.verifyOtp(token, h.codes.at(-1)!, INFO);
}
/** Quema el código vigente con fallos (5 intentos). */
async function burn(h: ReturnType<typeof build>, token: string) {
  const out: string[] = [];
  for (let i = 0; i < 5; i++) {
    try { await h.portal.verifyOtp(token, h.wrongCode(), INFO); } catch (e: any) { out.push(e.message); }
  }
  return out;
}

describe('Portal PBC · el código por correo', () => {
  let clock: ReturnType<typeof useClock>;
  beforeEach(() => { clock = useClock(); });
  afterEach(() => { clock.restore(); jest.restoreAllMocks(); });

  it('guarda solo el HMAC del código (con la sal del portal); el código viaja en el correo y no queda en ningún registro', async () => {
    const h = build(); const { r, token } = h.addRequest();
    const res = await h.portal.sendOtp(token, INFO);
    const code = h.codes[0];
    expect(code).toMatch(/^\d{6}$/);
    expect(r.portalOtpHash).toBe(hmacOtp(code, derivePortalOtpKey(KEY), r.id));
    expect(JSON.stringify(r)).not.toContain(code);
    expect(JSON.stringify(h.events)).not.toContain(code);
    expect(res).toEqual({ sent: true, maskedEmail: 'j•••@c•••.com', resendInSeconds: 60 });
    expect(h.events.at(-1)).toMatchObject({ type: 'OTP_SENT', ip: INFO.ip });
    expect(h.email.sendPbcPortalOtp).toHaveBeenCalledWith('juan@cliente.com', expect.objectContaining({ orgName: 'Despacho Demo' }));
  });

  it('sal propia: un código de la firma por enlace no sirve en el portal, ni al revés', async () => {
    const h = build(); const { r, token } = h.addRequest();
    await h.portal.sendOtp(token, INFO);
    expect(derivePortalOtpKey(KEY).equals(deriveOtpKey(KEY))).toBe(false);
    // Un HMAC calculado con la clave de la firma sobre el mismo código e id NO coincide con el guardado.
    expect(hmacOtp(h.codes[0], deriveOtpKey(KEY), r.id)).not.toBe(r.portalOtpHash);
    // Y si la BD tuviera el HMAC de la firma, el código correcto tampoco abriría.
    r.portalOtpHash = hmacOtp(h.codes[0], deriveOtpKey(KEY), r.id);
    await expect(h.portal.verifyOtp(token, h.codes[0], INFO)).rejects.toThrow(/Código incorrecto/);
  });

  it('el código correcto abre una sesión de 30 min, se consume y no se puede reutilizar', async () => {
    const h = build(); const { r, token } = h.addRequest();
    await h.portal.sendOtp(token, INFO);
    const code = h.codes[0];
    const v = await h.portal.verifyOtp(token, code, INFO);
    expect(v.sessionToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(new Date(v.sessionExpiresAt).getTime()).toBe(Date.now() + SESSION_TTL_MS);
    expect(h.sessions[0].tokenHash).toBe(hashToken(v.sessionToken));
    expect(JSON.stringify(h.sessions)).not.toContain(v.sessionToken);
    expect(r.portalOtpHash).toBeNull();
    expect(h.events.map((e) => e.type)).toEqual(['OTP_SENT', 'SESSION_STARTED']);
    await expect(h.portal.verifyOtp(token, code, INFO)).rejects.toThrow(/venció o no se solicitó/);
  });

  it('exige 60 segundos entre códigos', async () => {
    const h = build(); const { token } = h.addRequest();
    await h.portal.sendOtp(token, INFO);
    await expect(h.portal.sendOtp(token, INFO)).rejects.toMatchObject({ status: 429 });
    clock.advance(30_000);
    await expect(h.portal.sendOtp(token, INFO)).rejects.toThrow(/Espera 30 segundos/);
    clock.advance(31_000);
    await expect(h.portal.sendOtp(token, INFO)).resolves.toMatchObject({ sent: true });
  });

  it('un código nuevo invalida el anterior', async () => {
    const h = build(); const { token } = h.addRequest();
    await h.portal.sendOtp(token, INFO);
    clock.advance(61_000);
    await h.portal.sendOtp(token, INFO);
    await expect(h.portal.verifyOtp(token, h.codes[0], INFO)).rejects.toThrow(/Código incorrecto/);
    await expect(h.portal.verifyOtp(token, h.codes[1], INFO)).resolves.toHaveProperty('sessionToken');
  });

  it('el código vence a los 10 minutos', async () => {
    const h = build(); const { token } = h.addRequest();
    await h.portal.sendOtp(token, INFO);
    clock.advance(OTP_TTL_MS + 1000);
    await expect(h.portal.verifyOtp(token, h.codes[0], INFO)).rejects.toThrow(/venció o no se solicitó/);
  });

  it('máximo 5 códigos por hora y 10 por día por solicitud', async () => {
    const h = build(); const { token } = h.addRequest();
    for (let i = 0; i < 5; i++) { await h.portal.sendOtp(token, INFO); clock.advance(61_000); }
    await expect(h.portal.sendOtp(token, INFO)).rejects.toThrow(/demasiados códigos/);
    clock.advance(HOUR);
    for (let i = 0; i < 5; i++) { await h.portal.sendOtp(token, INFO); clock.advance(61_000); }
    clock.advance(HOUR); // la ventana de la hora se reinició, pero el tope del día sigue
    await expect(h.portal.sendOtp(token, INFO)).rejects.toThrow(/demasiados códigos/);
    clock.advance(DAY);
    await expect(h.portal.sendOtp(token, INFO)).resolves.toMatchObject({ sent: true });
  });

  it('5 fallos con un mismo código lo invalidan, y los contadores se guardan aunque la respuesta sea un error', async () => {
    const h = build(); const { r, token } = h.addRequest();
    await h.portal.sendOtp(token, INFO);
    await expect(h.portal.verifyOtp(token, h.wrongCode(), INFO)).rejects.toThrow(/Te quedan 4 intento/);
    expect(r.portalOtpAttempts).toBe(1);
    expect(r.portalOtpFailuresHour).toBe(1);
    const rest = await burn(h, token);
    expect(rest.some((m) => /Demasiados intentos con este código/.test(m))).toBe(true); // el 5.º fallo lo quema
    expect(rest.at(-1)).toMatch(/venció o no se solicitó/);                              // y el siguiente ya no tiene código
    expect(r.portalOtpHash).toBeNull();
    await expect(h.portal.verifyOtp(token, h.codes[0], INFO)).rejects.toThrow(/venció o no se solicitó/); // ni el correcto sirve ya
  });

  it('10 fallos en una hora bloquean 1 hora (423) y el bloqueo termina', async () => {
    const h = build(); const { r, token } = h.addRequest();
    await h.portal.sendOtp(token, INFO); await burn(h, token);
    clock.advance(61_000);
    await h.portal.sendOtp(token, INFO);
    const second = await burn(h, token);
    expect(second.at(-1)).toMatch(/Vuelve a intentarlo en una hora/);
    expect(r.portalLockCount).toBe(1);
    expect(h.events.filter((e) => e.type === 'OTP_LOCKED')).toHaveLength(1);
    await expect(h.portal.sendOtp(token, INFO)).rejects.toMatchObject({ status: 423 });
    await expect(h.portal.verifyOtp(token, '123456', INFO)).rejects.toMatchObject({ status: 423 });
    clock.advance(HOUR + 1000);
    await expect(h.portal.sendOtp(token, INFO)).resolves.toMatchObject({ sent: true });
    await expect(h.portal.verifyOtp(token, h.codes.at(-1)!, INFO)).resolves.toHaveProperty('sessionToken');
  });

  /** Provoca un bloqueo: dos códigos quemados (10 fallos en la hora). */
  async function triggerLock(h: ReturnType<typeof build>, token: string) {
    await h.portal.sendOtp(token, INFO); await burn(h, token);
    clock.advance(61_000);
    await h.portal.sendOtp(token, INFO); await burn(h, token);
  }

  it('al 3.er bloqueo el enlace queda inservible, se cierran sus sesiones y se avisa a quien creó la solicitud; regenerar lo restablece', async () => {
    const h = build(); const { r, token } = h.addRequest();
    await triggerLock(h, token);                  // 1.er bloqueo
    clock.advance(HOUR + 1000);
    await triggerLock(h, token);                  // 2.º bloqueo
    clock.advance(HOUR + 1000);
    const open = await login(h, token);           // el auditado de verdad entra: sesión abierta
    clock.advance(61_000);
    expect(r.portalLockCount).toBe(2);
    expect(h.email.sendPbcPortalLockedAlert).not.toHaveBeenCalled();
    await triggerLock(h, token);                  // 3.er bloqueo
    expect(r.portalLockCount).toBe(OTP_MAX_LOCKS);
    await new Promise((res) => setImmediate(res)); // el aviso va en segundo plano
    expect(h.email.sendPbcPortalLockedAlert).toHaveBeenCalledTimes(1);
    expect(h.email.sendPbcPortalLockedAlert).toHaveBeenCalledWith('creador@despacho.test', expect.objectContaining({ requestedToEmail: 'juan@cliente.com' }));
    await expect(h.portal.getRequest(token, open.sessionToken)).rejects.toBeInstanceOf(UnauthorizedException); // sesión revocada
    clock.advance(10 * HOUR); // ni esperando se recupera
    await expect(h.portal.sendOtp(token, INFO)).rejects.toThrow(/se bloqueó por demasiados intentos/);
    await expect(h.portal.verifyOtp(token, '123456', INFO)).rejects.toThrow(/se bloqueó por demasiados intentos/);
    await expect(h.portal.sendOtp(token, INFO)).rejects.toMatchObject({ status: 423, response: { reason: 'locked-permanent' } });
    // el bloqueo de 1 hora NO lleva esa marca


    // «Regenerar enlace» lo restablece: contadores en cero y token nuevo.
    const regen = await h.team.regenerateToken(r.id, { id: 'u1', organizationId: 'org1', role: 'AUDITOR' } as any);
    const newToken = regen.portalUrl.split('#')[1];
    expect(r.portalLockCount).toBe(0);
    expect(r.portalLockedUntil).toBeNull();
    await expect(h.portal.sendOtp(token, INFO)).rejects.toBeInstanceOf(NotFoundException); // el viejo ya no sirve
    await expect(login(h, newToken)).resolves.toHaveProperty('sessionToken');
  });

  it('regenerar revoca las sesiones abiertas y reinicia el código', async () => {
    const h = build(); const { r, token } = h.addRequest();
    const s = await login(h, token);
    expect(r.portalOtpSentCount).toBe(1);
    await h.team.regenerateToken(r.id, { id: 'u1', organizationId: 'org1', role: 'AUDITOR' } as any);
    expect(h.sessions.every((x) => x.revokedAt)).toBe(true);
    expect(r.portalOtpHash).toBeNull();
    expect(r.portalOtpSentCount).toBe(0);
    await expect(h.portal.getRequest(token, s.sessionToken)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('tope diario de códigos por organización (presupuesto propio del portal)', async () => {
    const h = build(); const { token } = h.addRequest();
    const { r: other } = h.addRequest();
    for (let i = 0; i < MAX_PBC_OTP_EMAILS_PER_ORG_PER_DAY; i++) h.events.push({ id: `x${i}`, requestId: other.id, type: 'OTP_SENT', at: new Date(), ip: null, userAgent: null });
    await expect(h.portal.sendOtp(token, INFO)).rejects.toMatchObject({ status: 429 });
    expect(h.codes).toHaveLength(0);
    clock.advance(DAY + 1000);
    await expect(h.portal.sendOtp(token, INFO)).resolves.toMatchObject({ sent: true });
  });

  it('si el correo no sale, responde 503 (el código quedó guardado pero nadie lo recibió)', async () => {
    const h = build({ ENCRYPTION_KEY: KEY }, false); const { token } = h.addRequest();
    await expect(h.portal.sendOtp(token, INFO)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('sin ENCRYPTION_KEY el portal no funciona (503) en vez de derivar una clave vacía', async () => {
    const h = build({}); const { token } = h.addRequest();
    await expect(h.portal.sendOtp(token, INFO)).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(h.portal.verifyOtp(token, '123456', INFO)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});

describe('Portal PBC · el enlace y la sesión', () => {
  let clock: ReturnType<typeof useClock>;
  beforeEach(() => { clock = useClock(); });
  afterEach(() => { clock.restore(); jest.restoreAllMocks(); });

  it('la portada no trae ningún dato de la solicitud: solo despacho, correo enmascarado y vencimiento', async () => {
    const h = build(); const { r, token } = h.addRequest();
    const cover: any = await h.portal.getCover(token);
    expect(Object.keys(cover).sort()).toEqual(['expiresAt', 'maskedEmail', 'orgName']);
    expect(cover.maskedEmail).toBe('j•••@c•••.com');
    const text = JSON.stringify(cover);
    for (const secret of [r.title, r.description, 'Juan', 'juan@cliente.com', r.id, 'Auditoría 2026']) expect(text).not.toContain(secret);
  });

  it('sin sesión (ausente, mal formada, desconocida, vencida, revocada o de otra solicitud) se responde 401', async () => {
    const h = build(); const { r, token } = h.addRequest();
    const other = h.addRequest();
    const mine = await login(h, token);
    await h.portal.sendOtp(other.token, INFO);
    const theirs = await h.portal.verifyOtp(other.token, h.codes.at(-1)!, INFO);

    await expect(h.portal.getRequest(token, mine.sessionToken)).resolves.toMatchObject({ id: r.id, title: 'Estados de cuenta' });
    for (const bad of [undefined, '', 'corto', 'x'.repeat(44), generateToken(), theirs.sessionToken]) {
      await expect(h.portal.getRequest(token, bad)).rejects.toBeInstanceOf(UnauthorizedException);
      await expect(h.portal.addMessage(token, bad, 'hola')).rejects.toBeInstanceOf(UnauthorizedException);
      await expect(h.portal.submit(token, bad)).rejects.toBeInstanceOf(UnauthorizedException);
    }
    h.sessions.find((s) => s.tokenHash === hashToken(mine.sessionToken)).revokedAt = new Date();
    await expect(h.portal.getRequest(token, mine.sessionToken)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(h.messages).toHaveLength(0);
  });

  it('la sesión vence a los 30 minutos y no se extiende por usarla', async () => {
    const h = build(); const { token } = h.addRequest();
    const s = await login(h, token);
    clock.advance(25 * MIN);
    await expect(h.portal.getRequest(token, s.sessionToken)).resolves.toBeDefined(); // usarla no la alarga
    clock.advance(6 * MIN);
    await expect(h.portal.getRequest(token, s.sessionToken)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('con sesión el auditado puede escribir y enviar; el envío repetido y escribir en una solicitud aceptada se rechazan', async () => {
    const h = build(); const { r, token } = h.addRequest();
    const s = await login(h, token);
    await h.portal.addMessage(token, s.sessionToken, 'Adjunto los estados', ['estados.pdf']);
    expect(h.messages[0]).toMatchObject({ requestId: r.id, isAuditor: false, senderEmail: 'juan@cliente.com' });
    await h.portal.submit(token, s.sessionToken, ['estados.pdf'], 'listo');
    expect(r.status).toBe('SUBMITTED');
    await expect(h.portal.submit(token, s.sessionToken)).rejects.toThrow(/ya fue enviada/);
    r.status = 'ACCEPTED';
    await expect(h.portal.addMessage(token, s.sessionToken, 'otra')).rejects.toThrow(/ya fue aceptada/);
  });

  it('un token mal formado, vacío o ausente se descarta sin consultar la BD', async () => {
    const h = build(); h.addRequest();
    const before = h.calls.findUnique;
    for (const bad of [undefined, '', 'corto', 'x'.repeat(44), `${'A'.repeat(42)}!`, 123, ['a']]) {
      await expect(h.portal.getCover(bad)).rejects.toBeInstanceOf(NotFoundException);
      await expect(h.portal.sendOtp(bad, INFO)).rejects.toBeInstanceOf(NotFoundException);
      await expect(h.portal.verifyOtp(bad, '123456', INFO)).rejects.toBeInstanceOf(NotFoundException);
      await expect(h.portal.getRequest(bad, generateToken())).rejects.toBeInstanceOf(NotFoundException);
    }
    expect(h.calls.findUnique).toBe(before);
  });

  it('un token desconocido es 404; la huella guardada tampoco sirve como token', async () => {
    const h = build(); const { r } = h.addRequest();
    await expect(h.portal.getCover('Z'.repeat(43))).rejects.toBeInstanceOf(NotFoundException);
    await expect(h.portal.getCover(r.portalTokenHash.slice(0, 43))).rejects.toBeInstanceOf(NotFoundException);
  });

  it('un enlace vencido responde 410 en todas las rutas', async () => {
    const h = build(); const { r, token } = h.addRequest();
    const s = await login(h, token);
    r.portalTokenExpiresAt = new Date(Date.now() - 1000);
    await expect(h.portal.getCover(token)).rejects.toBeInstanceOf(GoneException);
    await expect(h.portal.sendOtp(token, INFO)).rejects.toBeInstanceOf(GoneException);
    await expect(h.portal.verifyOtp(token, '123456', INFO)).rejects.toBeInstanceOf(GoneException);
    await expect(h.portal.getRequest(token, s.sessionToken)).rejects.toBeInstanceOf(GoneException);
    await expect(h.portal.addMessage(token, s.sessionToken, 'hola')).rejects.toBeInstanceOf(GoneException);
  });

  it('el detalle del equipo trae el resumen del bloqueo y ningún campo crudo del código', async () => {
    const h = build(); const { r, token } = h.addRequest();
    r.organizationId = 'org1';
    const user = { id: 'u1', organizationId: 'org1', role: 'AUDITOR' } as any;
    const detail: any = await h.team.findOneForAuditor(r.id, user);
    expect(detail.portalLock).toBeNull();
    for (const f of ['portalOtpHash', 'portalOtpExpiresAt', 'portalOtpAttempts', 'portalOtpFailuresHour', 'portalOtpWindowStart', 'portalOtpSentCount', 'portalOtpLastSentAt', 'portalLockedUntil', 'portalLockCount', 'portalTokenHash']) {
      expect(detail[f]).toBeUndefined();
    }
    await h.portal.sendOtp(token, INFO); await burn(h, token); clock.advance(61_000);
    await h.portal.sendOtp(token, INFO); await burn(h, token);
    const locked: any = await h.team.findOneForAuditor(r.id, user);
    expect(locked.portalLock).toEqual({ permanent: false, until: expect.any(String) });
    r.portalLockCount = OTP_MAX_LOCKS;
    expect(((await h.team.findOneForAuditor(r.id, user)) as any).portalLock).toEqual({ permanent: true, until: null });
  });
});
