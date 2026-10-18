/* eslint-disable @typescript-eslint/no-explicit-any */
import { buildHarness, INFO, makePdf, useClock, user } from './testing/harness';
import { sha256Hex } from './signature-crypto.util';
import { verifyChain } from './signature-event-chain.util';
import { CONSENT_VERSION, renderConsentText } from './legal-texts';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const SIGN = { signedName: 'Juan Pérez', signedRole: 'Gerente', consent: true, response: { agrees: true, comments: 'Conforme con el saldo' } } as any;

async function setup(env: Record<string, string> = {}) {
  const h = buildHarness(env);
  const c = await h.create();
  const session = await h.openSession(c.token);
  const seal = jest.spyOn(h.sealing, 'sealRequest').mockResolvedValue('SKIPPED'); // el sellado se prueba aparte
  return { h, ...c, session, seal };
}

describe('Firma pública · firmar', () => {
  let clock: ReturnType<typeof useClock>;
  beforeEach(() => { clock = useClock(); });
  afterEach(() => { clock.restore(); jest.restoreAllMocks(); });

  it('camino feliz: queda firmada con toda la evidencia, efecto en el documento y sellado en marcha', async () => {
    const { h, id, token, session, seal } = await setup();
    const res = await h.public.sign(token, session, SIGN, INFO);

    expect(res).toMatchObject({ status: 'SIGNED', sealing: true });
    expect(res.verificationCode).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){3}$/);

    const row = h.fake.requests.find((r) => r.id === id)!;
    expect(row).toMatchObject({
      status: 'SIGNED', signedName: 'Juan Pérez', signedRole: 'Gerente', signerIp: INFO.ip, signerUserAgent: INFO.userAgent,
      consentVersion: CONSENT_VERSION, sealStatus: 'PENDING', verificationCode: res.verificationCode, otpHash: null,
    });
    expect(row.consentText).toBe(renderConsentText(row.title)); // el texto literal que se mostró
    expect(row.response).toEqual({ agrees: true, comments: 'Conforme con el saldo' });
    expect(row.signedAt).toBeInstanceOf(Date);

    // sesiones cerradas: para descargar la copia hay que verificar el correo otra vez
    expect(h.fake.tables.signatureSession.every((s) => s.revokedAt)).toBe(true);
    // la bitácora sigue íntegra y registra la firma con su IP
    const chain = await h.events.listChain(id);
    expect(verifyChain(id, chain).ok).toBe(true);
    expect(chain.at(-1)).toMatchObject({ type: 'SIGNED', ip: INFO.ip });
    // efecto en el documento de origen + aviso al equipo + sellado en segundo plano
    expect(h.adapter.calls.signed).toHaveLength(1);
    expect(h.adapter.calls.signed[0]).toMatchObject({ signedName: 'Juan Pérez', response: { agrees: true } });
    expect(seal).toHaveBeenCalledWith(id);
    await new Promise((r) => setImmediate(r));
    expect(h.email.sendSignatureOutcome).toHaveBeenCalledWith('auditor@despacho.com', expect.objectContaining({ outcome: 'SIGNED', signerName: 'Juan Pérez' }));
  });

  it('sin consentimiento, sin cargo (cuando es obligatorio) o con respuesta inválida: 400 y NADA cambia', async () => {
    const { h, id, token, session } = await setup();
    await expect(h.public.sign(token, session, { ...SIGN, consent: false }, INFO)).rejects.toThrow(/consentimiento/);
    await expect(h.public.sign(token, session, { ...SIGN, signedRole: '  ' }, INFO)).rejects.toThrow(/cargo/);
    await expect(h.public.sign(token, session, { ...SIGN, response: {} }, INFO)).rejects.toThrow(/de acuerdo/);
    const row = h.fake.requests.find((r) => r.id === id)!;
    expect(row.status).toBe('VIEWED');
    expect(h.fake.events.some((e) => e.type === 'SIGNED')).toBe(false);
    expect(h.adapter.calls.signed).toHaveLength(0);
  });

  it('exige una sesión válida: sin sesión, de otra solicitud, vencida o revocada → 401', async () => {
    const { h, token, session } = await setup();
    const other = await h.create({ targetId: 'conf2' });
    const otherSession = await h.openSession(other.token);

    await expect(h.public.sign(token, undefined, SIGN, INFO)).rejects.toMatchObject({ status: 401 });
    await expect(h.public.sign(token, 'x'.repeat(43), SIGN, INFO)).rejects.toMatchObject({ status: 401 });
    await expect(h.public.sign(token, otherSession, SIGN, INFO)).rejects.toMatchObject({ status: 401 }); // sesión de OTRA solicitud
    clock.advance(31 * 60_000);
    await expect(h.public.sign(token, session, SIGN, INFO)).rejects.toMatchObject({ status: 401 }); // 30 min de vida, sin extensión
  });

  it('una sesión revocada por un reenvío ya no sirve', async () => {
    const { h, id, token, session } = await setup();
    await h.requests.resend(user('AUDITOR'), id, {}, INFO);
    await expect(h.public.sign(token, session, SIGN, INFO)).rejects.toMatchObject({ status: 404 }); // el token viejo ya no existe
  });

  it('dos firmas simultáneas: gana UNA y la otra recibe 409', async () => {
    const { h, id, token, session } = await setup();
    const session2 = await (async () => { clock.advance(61_000); await h.public.sendOtp(token, INFO); return (await h.public.verifyOtp(token, h.lastOtp(), INFO)).sessionToken; })();
    const results = await Promise.allSettled([
      h.public.sign(token, session, SIGN, INFO),
      h.public.sign(token, session2, { ...SIGN, signedName: 'Otra Persona' }, INFO),
    ]);
    const ok = results.filter((r) => r.status === 'fulfilled');
    const ko = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(ok).toHaveLength(1);
    expect(ko).toHaveLength(1);
    expect(ko[0].reason.status).toBe(409);
    expect(h.fake.events.filter((e) => e.type === 'SIGNED')).toHaveLength(1);
    expect(h.adapter.calls.signed).toHaveLength(1);
    expect(h.fake.requests.find((r) => r.id === id)!.status).toBe('SIGNED');
  });

  it('no se puede firmar de nuevo ni rechazar una solicitud ya firmada', async () => {
    const { h, token, session } = await setup();
    await h.public.sign(token, session, SIGN, INFO);
    await expect(h.public.sign(token, session, SIGN, INFO)).rejects.toMatchObject({ status: 409 });
    await expect(h.public.decline(token, session, { reason: 'me arrepentí' }, INFO)).rejects.toMatchObject({ status: 409 });
  });

  it('no se firma después del vencimiento (410)', async () => {
    const { h, token, session } = await setup();
    clock.advance(16 * DAY); // vigencia por defecto de la confirmación: 15 días
    await expect(h.public.sign(token, session, SIGN, INFO)).rejects.toMatchObject({ status: 410 });
  });

  it('si el PDF guardado cambió, NO se firma: 409, alerta al equipo y evento de integridad', async () => {
    const { h, id, token, session } = await setup();
    const path = h.fake.requests.find((r) => r.id === id)!.documentPath;
    h.storage.files.set(path, await makePdf(3)); // alguien reemplazó el archivo
    await expect(h.public.sign(token, session, SIGN, INFO)).rejects.toMatchObject({ status: 409 });
    expect(h.fake.requests.find((r) => r.id === id)!.status).toBe('VIEWED');
    expect(h.fake.events.at(-1)).toMatchObject({ type: 'INTEGRITY_FAILED' });
    await new Promise((r) => setImmediate(r));
    expect(h.email.sendSignatureIntegrityAlert).toHaveBeenCalled();
  });

  it('si el efecto sobre el documento falla, TODO se deshace: sigue pendiente y puede reintentar', async () => {
    const { h, id, token, session } = await setup();
    h.adapter.onSigned = async () => { throw new Error('el documento de origen cambió'); };
    await expect(h.public.sign(token, session, SIGN, INFO)).rejects.toThrow();
    const row = h.fake.requests.find((r) => r.id === id)!;
    expect(row.status).toBe('VIEWED');
    expect(row.verificationCode).toBeNull();
    expect(row.signedAt).toBeNull();
    expect(h.fake.events.some((e) => e.type === 'SIGNED')).toBe(false);
    expect(h.fake.tables.signatureSession.some((s) => !s.revokedAt)).toBe(true); // la sesión sigue activa
  });

  it('los adjuntos limpios quedan como parte de la firma; el resto se descarta', async () => {
    const { h, id, token, session } = await setup();
    const pdf = await makePdf(1);
    await h.public.uploadAttachment(token, session, { originalname: 'estado.pdf', buffer: pdf }, INFO);
    expect(h.fake.tables.signatureAttachment[0].submitted).toBe(false);
    await h.public.sign(token, session, SIGN, INFO);
    expect(h.fake.tables.signatureAttachment[0].submitted).toBe(true);
    expect(h.fake.events.find((e) => e.type === 'SIGNED')!.detail).toMatchObject({ attachments: 1 });
    expect(id).toBeDefined();
  });
});

describe('Firma pública · rechazar', () => {
  let clock: ReturnType<typeof useClock>;
  beforeEach(() => { clock = useClock(); });
  afterEach(() => { clock.restore(); jest.restoreAllMocks(); });

  it('queda DECLINED con el motivo, avisa al equipo y ya no se puede firmar', async () => {
    const { h, id, token, session } = await setup();
    const res = await h.public.decline(token, session, { reason: 'El saldo no corresponde a nuestros registros' }, INFO);
    expect(res).toEqual({ status: 'DECLINED' });
    const row = h.fake.requests.find((r) => r.id === id)!;
    expect(row).toMatchObject({ status: 'DECLINED', declineReason: 'El saldo no corresponde a nuestros registros' });
    expect(row.signedAt).toBeNull();
    expect(row.sealStatus).toBe('NOT_APPLICABLE'); // lo rechazado no se sella
    expect(h.adapter.calls.declined).toEqual([{ id, reason: 'El saldo no corresponde a nuestros registros' }]);
    expect(h.fake.tables.signatureSession.every((s) => s.revokedAt)).toBe(true);
    await new Promise((r) => setImmediate(r));
    expect(h.email.sendSignatureOutcome).toHaveBeenCalledWith('auditor@despacho.com', expect.objectContaining({ outcome: 'DECLINED', reason: 'El saldo no corresponde a nuestros registros' }));
    await expect(h.public.sign(token, session, SIGN, INFO)).rejects.toMatchObject({ status: 409 });
  });

  it('rechazar descarta los adjuntos que el firmante había subido', async () => {
    const { h, token, session } = await setup();
    await h.public.uploadAttachment(token, session, { originalname: 'x.pdf', buffer: await makePdf(1) }, INFO);
    expect(h.storage.files.size).toBeGreaterThan(2);
    await h.public.decline(token, session, { reason: 'No corresponde' }, INFO);
    expect(h.fake.tables.signatureAttachment).toHaveLength(0);
    expect([...h.storage.files.keys()].some((k) => k.includes('/attachments/'))).toBe(false);
  });
});

describe('Firma pública · documento y copia firmada', () => {
  let clock: ReturnType<typeof useClock>;
  beforeEach(() => { clock = useClock(); });
  afterEach(() => { clock.restore(); jest.restoreAllMocks(); });

  it('GET /document exige sesión y devuelve el formulario, el consentimiento literal y un PDF con enlace firmado', async () => {
    const { h, token, session } = await setup();
    await expect(h.public.getDocument(token, undefined)).rejects.toMatchObject({ status: 401 });
    const doc = await h.public.getDocument(token, session);
    expect(doc.pdfUrl).toMatch(/^https:\/\/storage\.test\/sign\//);
    expect(doc.consentText).toBe(renderConsentText(doc.title));
    expect(doc.consentVersion).toBe(CONSENT_VERSION);
    expect(doc.privacyNotice).toContain('Pérez Cortez y Asociados');
    expect(doc.form.fields[0].key).toBe('agrees');
  });

  it('antes del sellado dice "sellando"; sin sesión, 401; tras firmar hay que verificar el correo otra vez', async () => {
    const { h, id, token, session } = await setup();
    await h.public.sign(token, session, SIGN, INFO);
    await expect(h.public.getSigned(token, session)).rejects.toMatchObject({ status: 401 }); // sesión revocada al firmar
    clock.advance(61_000);
    const s2 = await h.openSession(token); // el estado SIGNED sí permite pedir código
    await expect(h.public.getSigned(token, s2)).resolves.toEqual({ sealing: true, failed: false });

    // sellada → entrega el enlace
    Object.assign(h.fake.requests.find((r) => r.id === id)!, { sealStatus: 'SEALED', signedPdfPath: 'signature-requests/aud1/x/signed.pdf' });
    const done = await h.public.getSigned(token, s2);
    expect(done).toMatchObject({ sealing: false, failed: false });
    expect((done as any).pdfUrl).toContain('signed.pdf');
  });

  it('la copia firmada deja de estar disponible a los 30 días', async () => {
    const { h, token, session } = await setup();
    await h.public.sign(token, session, SIGN, INFO);
    clock.advance(31 * DAY);
    await expect(h.public.getRequest(token)).rejects.toMatchObject({ status: 410 });
    await expect(h.public.sendOtp(token, INFO)).rejects.toMatchObject({ status: 410 });
  });
});

describe('Firma pública · verificación por código', () => {
  afterEach(() => jest.restoreAllMocks());

  it('un código desconocido o mal formado da 404', async () => {
    const h = buildHarness();
    for (const bad of ['', 'ABCD', 'UUUU-UUUU-UUUU-UUUU', undefined, "'; DROP--", 'AAAA-AAAA-AAAA-AAAA']) {
      await expect(h.public.verify(bad)).rejects.toMatchObject({ status: 404 });
    }
  });

  it('un documento firmado es válido, y acepta TODAS las huellas por las que pasó el PDF sellado', async () => {
    const { h, id, token, session } = await setup();
    const { verificationCode } = await h.public.sign(token, session, SIGN, INFO);
    // lo sella el servicio de sellado REAL (con PDF, almacenamiento y sello de tiempo simulados)
    (h.sealing.sealRequest as jest.Mock).mockRestore();
    await h.sealing.sealRequest(id);

    const sealedRow = h.fake.requests.find((r) => r.id === id)!;
    expect(sealedRow.sealStatus).toBe('SEALED');
    const view = await h.public.verify(verificationCode.toLowerCase().replace(/-/g, ' '));
    expect(view.valid).toBe(true);
    expect(view.sealing).toBe(false);
    expect(view.signedName).toBe('Juan Pérez');
    expect(view.acceptedHashes).toContain(sealedRow.signedPdfSha256);
    expect(view.sealFingerprint).toBe('AA:BB');
    expect(Object.keys(view).sort()).toEqual(['acceptedHashes', 'documentLabel', 'orgName', 'sealFingerprint', 'sealedAt', 'sealing', 'signedAt', 'signedName', 'timestamped', 'title', 'valid']);
    expect(sha256Hex('x')).toBeDefined();
  });

  it('un documento firmado pero todavía sin sellar se muestra como "en proceso"', async () => {
    const { h, token, session } = await setup();
    const { verificationCode } = await h.public.sign(token, session, SIGN, INFO);
    const view = await h.public.verify(verificationCode);
    expect(view).toMatchObject({ valid: true, sealing: true, acceptedHashes: [] });
  });
});
