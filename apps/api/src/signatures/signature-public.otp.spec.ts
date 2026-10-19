/* eslint-disable @typescript-eslint/no-explicit-any */
import { buildHarness, INFO, OTP_KEY, useClock, user } from './testing/harness';
import { deriveOtpKey, hmacOtp, hashToken, generateToken } from './signature-crypto.util';

const MIN = 60_000;
const HOUR = 60 * MIN;

describe('Firma pública · código de verificación por correo', () => {
  let clock: ReturnType<typeof useClock>;
  beforeEach(() => { clock = useClock(); });
  afterEach(() => { clock.restore(); jest.restoreAllMocks(); });

  it('el servidor guarda solo el HMAC del código; el código viaja en el cuerpo del correo y no en el asunto', async () => {
    const h = buildHarness();
    const { id, token } = await h.create();
    const res = await h.public.sendOtp(token, INFO);
    const code = h.lastOtp();
    const row = h.fake.requests.find((r) => r.id === id)!;
    expect(code).toMatch(/^\d{6}$/);
    expect(row.otpHash).toBe(hmacOtp(code, deriveOtpKey(OTP_KEY), id));
    expect(JSON.stringify(row)).not.toContain(code);
    expect(res).toEqual({ sent: true, maskedEmail: 'j•••@b•••.com', resendInSeconds: 60 });
    expect(h.fake.events.at(-1)).toMatchObject({ type: 'OTP_SENT', ip: INFO.ip });
    // el evento tampoco contiene el código
    expect(JSON.stringify(h.fake.events)).not.toContain(code);
  });

  it('el código correcto abre una sesión, marca la solicitud como vista y se consume', async () => {
    const h = buildHarness();
    const { id, token } = await h.create();
    await h.public.sendOtp(token, INFO);
    const code = h.lastOtp();
    const v = await h.public.verifyOtp(token, code, INFO);

    expect(v.sessionToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const row = h.fake.requests.find((r) => r.id === id)!;
    expect(row.status).toBe('VIEWED');
    expect(row.viewedAt).toBeInstanceOf(Date);
    expect(row.otpHash).toBeNull();
    expect(row.otpVerifiedAt).toBeInstanceOf(Date);
    const session = h.fake.tables.signatureSession[0];
    expect(session.tokenHash).toBe(hashToken(v.sessionToken)); // solo se guarda el hash
    expect(JSON.stringify(session)).not.toContain(v.sessionToken);
    expect(h.fake.events.map((e) => e.type)).toEqual(['CREATED', 'SENT', 'OTP_SENT', 'SESSION_STARTED', 'VIEWED']);

    // un código usado no se puede reutilizar
    await expect(h.public.verifyOtp(token, code, INFO)).rejects.toThrow(/venció o no se solicitó/);
  });

  it('exige 60 segundos entre códigos', async () => {
    const h = buildHarness();
    const { token } = await h.create();
    await h.public.sendOtp(token, INFO);
    await expect(h.public.sendOtp(token, INFO)).rejects.toMatchObject({ status: 429 });
    clock.advance(30_000);
    await expect(h.public.sendOtp(token, INFO)).rejects.toThrow(/Espera 30 segundos/);
    clock.advance(31_000);
    await expect(h.public.sendOtp(token, INFO)).resolves.toMatchObject({ sent: true });
  });

  it('máximo 5 códigos por hora; pasada la hora se reinicia', async () => {
    const h = buildHarness();
    const { token } = await h.create();
    for (let i = 0; i < 5; i++) { await h.public.sendOtp(token, INFO); clock.advance(61_000); }
    await expect(h.public.sendOtp(token, INFO)).rejects.toThrow(/demasiados códigos/);
    clock.advance(HOUR);
    await expect(h.public.sendOtp(token, INFO)).resolves.toMatchObject({ sent: true });
  });

  it('un código nuevo invalida al anterior', async () => {
    const h = buildHarness();
    const { token } = await h.create();
    await h.public.sendOtp(token, INFO);
    const first = h.lastOtp();
    clock.advance(61_000);
    await h.public.sendOtp(token, INFO);
    const second = h.lastOtp();
    if (first !== second) await expect(h.public.verifyOtp(token, first, INFO)).rejects.toThrow(/Código incorrecto/);
    await expect(h.public.verifyOtp(token, second, INFO)).resolves.toBeDefined();
  });

  it('un código incorrecto cuenta intentos y al quinto se invalida', async () => {
    const h = buildHarness();
    const { id, token } = await h.create();
    await h.public.sendOtp(token, INFO);
    const real = h.lastOtp();
    const wrong = real === '000000' ? '000001' : '000000';
    await expect(h.public.verifyOtp(token, wrong, INFO)).rejects.toThrow(/Te quedan 4 intento/);
    await expect(h.public.verifyOtp(token, wrong, INFO)).rejects.toThrow(/Te quedan 3 intento/);
    await expect(h.public.verifyOtp(token, wrong, INFO)).rejects.toThrow(/Te quedan 2 intento/);
    await expect(h.public.verifyOtp(token, wrong, INFO)).rejects.toThrow(/Te quedan 1 intento/);
    await expect(h.public.verifyOtp(token, wrong, INFO)).rejects.toThrow(/Demasiados intentos con este código/);
    // el contador SE GUARDÓ aunque la respuesta fue un error, y el código quedó invalidado: ni el correcto sirve
    const row = h.fake.requests.find((r) => r.id === id)!;
    expect(row.otpAttempts).toBe(5);
    expect(row.otpHash).toBeNull();
    await expect(h.public.verifyOtp(token, real, INFO)).rejects.toThrow(/venció o no se solicitó/);
    expect(h.fake.events.filter((e) => e.type === 'OTP_FAILED')).toHaveLength(5);
  });

  it('10 fallos en una hora bloquean la solicitud 1 h, incluso con el código correcto', async () => {
    const h = buildHarness();
    const { id, token } = await h.create();
    for (let round = 0; round < 2; round++) {
      await h.public.sendOtp(token, INFO);
      const wrong = h.lastOtp() === '000000' ? '000001' : '000000';
      for (let i = 0; i < 5; i++) await h.public.verifyOtp(token, wrong, INFO).catch(() => undefined);
      clock.advance(61_000);
    }
    const row = h.fake.requests.find((r) => r.id === id)!;
    expect(row.lockedUntil).toBeInstanceOf(Date);
    expect(h.fake.events.some((e) => e.type === 'OTP_LOCKED')).toBe(true);

    await expect(h.public.sendOtp(token, INFO)).rejects.toMatchObject({ status: 423 });
    await expect(h.public.verifyOtp(token, '123456', INFO)).rejects.toMatchObject({ status: 423 });

    clock.advance(HOUR);
    await expect(h.public.sendOtp(token, INFO)).resolves.toMatchObject({ sent: true });
    await expect(h.public.verifyOtp(token, h.lastOtp(), INFO)).resolves.toBeDefined();
  });

  it('un código vencido (10 min) pide uno nuevo y NO cuenta como intento fallido', async () => {
    const h = buildHarness();
    const { id, token } = await h.create();
    await h.public.sendOtp(token, INFO);
    const code = h.lastOtp();
    clock.advance(11 * MIN);
    await expect(h.public.verifyOtp(token, code, INFO)).rejects.toThrow(/venció o no se solicitó/);
    expect(h.fake.requests.find((r) => r.id === id)!.otpAttempts).toBe(0);
  });

  it('un código de otra solicitud no sirve', async () => {
    const h = buildHarness();
    const a = await h.create({ targetId: 'conf1' });
    const b = await h.create({ targetId: 'conf2' });
    await h.public.sendOtp(a.token, INFO);
    const codeA = h.lastOtp();
    await h.public.sendOtp(b.token, INFO);
    const codeB = h.lastOtp();
    if (codeA !== codeB) await expect(h.public.verifyOtp(b.token, codeA, INFO)).rejects.toThrow(/Código incorrecto/);
    await expect(h.public.verifyOtp(b.token, codeB, INFO)).resolves.toBeDefined();
  });

  it('si el correo falla, avisa y no finge que lo envió', async () => {
    const h = buildHarness();
    const { token } = await h.create();
    h.email.sendSignatureOtp.mockResolvedValueOnce({ sent: false, emailId: null, error: 'x' });
    await expect(h.public.sendOtp(token, INFO)).rejects.toMatchObject({ status: 503 });
  });

  const pushEvents = (h: ReturnType<typeof buildHarness>, requestId: string, type: string, n: number) => {
    for (let i = 0; i < n; i++) {
      h.fake.tables.signatureEvent.push({ id: `${type}${i}`, requestId, seq: 1000 + i, type, at: new Date(), ip: null, userAgent: null, actorId: null, detail: null, prevHash: '', hash: '' });
    }
  };

  it('los códigos tienen su PROPIO tope por organización: agotar las invitaciones no los frena, ni ellos a las invitaciones', async () => {
    const h = buildHarness();
    const { id, token } = await h.create();
    pushEvents(h, id, 'SENT', 300); // tope de invitaciones agotado…
    await expect(h.public.sendOtp(token, INFO)).resolves.toMatchObject({ sent: true }); // …el firmante igual recibe su código
    await expect(h.create({ targetId: 'conf9' })).rejects.toMatchObject({ status: 429 }); // y el equipo sí está frenado

    const h2 = buildHarness();
    const r2 = await h2.create();
    pushEvents(h2, r2.id, 'OTP_SENT', 1000); // un tercero pidió 1000 códigos hoy: ya no salen más códigos…
    await expect(h2.public.sendOtp(r2.token, INFO)).rejects.toMatchObject({ status: 429 });
    await expect(h2.create({ targetId: 'conf2' })).resolves.toBeDefined(); // …pero el equipo sigue enviando documentos
  });

  it('máximo 10 códigos por día por solicitud (aunque se respete el de 5 por hora)', async () => {
    const h = buildHarness();
    const { token } = await h.create();
    for (let i = 0; i < 10; i++) { await h.public.sendOtp(token, INFO); clock.advance(i % 5 === 4 ? HOUR : 61_000); }
    await expect(h.public.sendOtp(token, INFO)).rejects.toThrow(/demasiados códigos/);
    clock.advance(24 * HOUR);
    await expect(h.public.sendOtp(token, INFO)).resolves.toMatchObject({ sent: true });
  });

  it('ya firmada, el código solo sirve para descargar: 3 por día; y la hora de «correo verificado» no cambia', async () => {
    const h = buildHarness();
    const { id, token } = await h.create();
    const session = await h.openSession(token);
    const verifiedAt = h.fake.requests.find((r) => r.id === id)!.otpVerifiedAt;
    clock.advance(5_000); // el código de antes de firmar no cuenta en el tope de después
    await h.public.sign(token, session, { signedName: 'Juan Pérez', signedRole: 'Gerente', consent: true, response: { agrees: true } } as any, INFO);
    for (let i = 0; i < 3; i++) {
      clock.advance(HOUR);
      await h.public.sendOtp(token, INFO);
      await h.public.verifyOtp(token, h.lastOtp(), INFO);
    }
    expect(h.fake.requests.find((r) => r.id === id)!.otpVerifiedAt).toEqual(verifiedAt); // la evidencia conserva la de antes de firmar
    clock.advance(HOUR);
    await expect(h.public.sendOtp(token, INFO)).rejects.toThrow(/demasiados códigos/);
  });

  it('al TERCER bloqueo el enlace queda inservible hasta que el equipo lo reenvíe, y se avisa a quien lo envió', async () => {
    const h = buildHarness();
    const { id, token } = await h.create();
    const lockOnce = async () => {
      for (let round = 0; round < 2; round++) {
        await h.public.sendOtp(token, INFO);
        const wrong = h.lastOtp() === '000000' ? '000001' : '000000';
        for (let i = 0; i < 5; i++) await h.public.verifyOtp(token, wrong, INFO).catch(() => undefined);
        clock.advance(61_000);
      }
      clock.advance(HOUR + MIN); // vence el bloqueo de 1 h y la ventana de fallos
    };
    await lockOnce();
    await lockOnce();
    expect(h.email.sendSignatureLockedAlert).not.toHaveBeenCalled();
    await lockOnce();
    expect(h.fake.events.filter((e) => e.type === 'OTP_LOCKED')).toHaveLength(3);
    expect(h.email.sendSignatureLockedAlert).toHaveBeenCalledWith('auditor@despacho.com', expect.objectContaining({ signerEmail: 'juan@banco.com' }));

    // Ni pasado el bloqueo de 1 h: el enlace ya no sirve.
    clock.advance(5 * HOUR);
    await expect(h.public.sendOtp(token, INFO)).rejects.toThrow(/Pide a quien te lo envió que te lo reenvíe/);
    await expect(h.public.verifyOtp(token, '123456', INFO)).rejects.toMatchObject({ status: 423 });

    // El equipo reenvía: enlace nuevo, la cuenta de bloqueos vuelve a cero.
    const r = await h.requests.resend(user('AUDITOR'), id, {}, INFO);
    const fresh = h.tokenOf(r.signUrl);
    await expect(h.public.sendOtp(fresh, INFO)).resolves.toMatchObject({ sent: true });
    await expect(h.public.verifyOtp(fresh, h.lastOtp(), INFO)).resolves.toBeDefined();
  });
});

describe('Firma pública · enlace, estado e interruptor', () => {
  let clock: ReturnType<typeof useClock>;
  beforeEach(() => { clock = useClock(); });
  afterEach(() => { clock.restore(); jest.restoreAllMocks(); });

  it('un token mal formado, inexistente o ausente responde 404 genérico (sin revelar nada)', async () => {
    const h = buildHarness();
    await h.create();
    for (const bad of [undefined, '', 'corto', 'a'.repeat(44), generateToken(), "'; DROP TABLE x;--"]) {
      await expect(h.public.getRequest(bad)).rejects.toMatchObject({ status: 404 });
      await expect(h.public.sendOtp(bad, INFO)).rejects.toMatchObject({ status: 404 });
    }
  });

  it('GET /request: vista mínima, el estado interno VIEWED se muestra como PENDING', async () => {
    const h = buildHarness();
    const { token } = await h.create();
    await h.openSession(token);
    const view = await h.public.getRequest(token);
    expect(view.status).toBe('PENDING');
    expect(view.requiresOtp).toBe(true);
    expect(view.maskedEmail).not.toContain('juan');
  });

  it('una solicitud vencida responde 410 (por fecha, sin esperar al cron)', async () => {
    const h = buildHarness();
    const { token } = await h.create({ expiresInDays: 1 });
    clock.advance(25 * HOUR);
    await expect(h.public.getRequest(token)).rejects.toMatchObject({ status: 410 });
    await expect(h.public.sendOtp(token, INFO)).rejects.toMatchObject({ status: 410 });
  });

  it('una solicitud revocada responde 410 con motivo', async () => {
    const h = buildHarness();
    const { id, token } = await h.create();
    await h.requests.revoke({ id: 'u1', role: 'AUDITOR', organizationId: 'org1' } as any, id, 'Se envió al destinatario equivocado', INFO);
    await expect(h.public.getRequest(token)).rejects.toMatchObject({ status: 410, response: { reason: 'revoked' } });
  });

  it('con SIGNATURES_PUBLIC_ENABLED distinto de "true" todo responde 503', async () => {
    const h = buildHarness();
    const { token } = await h.create();
    const off = buildHarness({ SIGNATURES_PUBLIC_ENABLED: 'false' });
    await expect(off.public.getRequest(token)).rejects.toMatchObject({ status: 503 });
    await expect(off.public.sendOtp(token, INFO)).rejects.toMatchObject({ status: 503 });
    await expect(off.public.verify('AAAA-AAAA-AAAA-AAAA')).rejects.toMatchObject({ status: 503 });
  });

  it('sin ENCRYPTION_KEY no se puede pedir un código (falla cerrado)', async () => {
    const h = buildHarness();
    const { token } = await h.create();
    const noKey = buildHarness({ ENCRYPTION_KEY: '' });
    await expect(noKey.public.sendOtp(token, INFO)).rejects.toMatchObject({ status: 503 });
  });
});
