/* eslint-disable @typescript-eslint/no-explicit-any */
import { buildHarness, INFO, makePdf, useClock, user } from './testing/harness';
import { decryptSecret } from '../common/utils/signing-key.util';
import { hashToken, sha256Hex } from './signature-crypto.util';
import { verifyChain } from './signature-event-chain.util';
import { OTP_KEY } from './testing/harness';

const DAY = 86_400_000;

describe('Firma interna · crear', () => {
  afterEach(() => jest.restoreAllMocks());

  it('camino feliz: documento congelado, token solo como hash, enlace en claro una sola vez y correo enviado', async () => {
    const h = buildHarness();
    const { id, token, out } = await h.create();
    const row = h.fake.requests.find((r) => r.id === id)!;

    // el documento queda congelado con su huella
    const stored = await h.storage.download(row.documentPath);
    expect(row.documentSha256).toBe(sha256Hex(stored));
    expect(row.documentPath).toBe(`signature-requests/aud1/${id}/original.pdf`);
    expect(row.documentPages).toBe(1);

    // el token en claro NO está en la base; solo su hash y una copia cifrada (para el recordatorio)
    expect(JSON.stringify(row)).not.toContain(token);
    expect(row.tokenHash).toBe(hashToken(token));
    expect(decryptSecret(row.tokenEncrypted, OTP_KEY)).toBe(token);

    expect(out.signUrl).toBe(`https://app.test/firmar#${token}`);
    expect(out.emailSent).toBe(true);
    expect(h.email.sendSignatureRequest).toHaveBeenCalledWith('juan@banco.com', expect.objectContaining({
      orgName: 'Pérez Cortez y Asociados', token, replyTo: 'auditor@despacho.com', senderName: 'Ana Auditora', documentLabel: 'Confirmación externa (NIA 505)',
    }));
    expect(row.sendCount).toBe(1);
    expect(row.sentAt).toBeInstanceOf(Date);
    expect(h.fake.events.map((e) => e.type)).toEqual(['CREATED', 'SENT']);
    expect(h.adapter.calls.created).toEqual([id]);

    // la vista que recibe el auditor no trae secretos ni rutas
    const dump = JSON.stringify(out.request);
    for (const secret of ['tokenHash', 'tokenEncrypted', 'otpHash', 'documentPath', 'signedPdfPath', token]) expect(dump).not.toContain(secret);
  });

  it('vigencia por defecto del tipo (15 días) o la que elija el auditor', async () => {
    const h = buildHarness();
    const a = await h.create({ targetId: 'a' });
    const b = await h.create({ targetId: 'b', expiresInDays: 40 });
    const days = (id: string) => Math.round((h.fake.requests.find((r) => r.id === id)!.expiresAt.getTime() - Date.now()) / DAY);
    expect(days(a.id)).toBe(15);
    expect(days(b.id)).toBe(40);
  });

  it('si el correo falla, la solicitud queda vigente y se avisa (queda "Copiar enlace")', async () => {
    const h = buildHarness();
    h.email.sendSignatureRequest.mockResolvedValueOnce({ sent: false, emailId: null, error: 'Resend caído' });
    const { id, out } = await h.create();
    expect(out.emailSent).toBe(false);
    expect(out.signUrl).toContain('/firmar#');
    expect(h.fake.requests.find((r) => r.id === id)).toMatchObject({ status: 'PENDING', sendCount: 0, sentAt: null });
  });

  it('crear una nueva reemplaza a la anterior del mismo documento: solo una activa y el enlace viejo muere', async () => {
    const h = buildHarness();
    const first = await h.create();
    const second = await h.create();
    const rows = h.fake.requests;
    expect(rows.find((r) => r.id === first.id)).toMatchObject({ status: 'REVOKED', revokedReason: 'Reemplazada por una solicitud nueva' });
    expect(rows.find((r) => r.id === second.id)!.status).toBe('PENDING');
    await expect(h.public.getRequest(first.token)).rejects.toMatchObject({ status: 410 });
    await expect(h.public.getRequest(second.token)).resolves.toBeDefined();
    // reemplazar NO dispara el gancho de "revocada" del documento (la nueva solicitud ya lo cubre)
    expect(h.adapter.calls.revoked).toHaveLength(0);
  });

  it('documentos distintos no se pisan entre sí', async () => {
    const h = buildHarness();
    const a = await h.create({ targetId: 'conf1' });
    const b = await h.create({ targetId: 'conf2' });
    expect(h.fake.requests.filter((r) => r.status === 'PENDING').map((r) => r.id).sort()).toEqual([a.id, b.id].sort());
  });

  it('valida: rol mínimo, tipo sin adaptador, payload enorme, origen inexistente, interruptor y clave', async () => {
    const h = buildHarness();
    (h.adapter as any).minRole = 'AUDIT_MANAGER';
    await expect(h.create({}, user('AUDITOR'))).rejects.toMatchObject({ status: 403 });
    await expect(h.create({}, user('AUDIT_MANAGER'))).resolves.toBeDefined();
    await expect(h.create({ documentType: 'ENGAGEMENT_LETTER' }, user('CAE'))).rejects.toThrow(/todavía no se puede enviar/);
    await expect(h.create({ payload: { x: 'a'.repeat(100_001) } }, user('CAE'))).rejects.toThrow(/demasiado grandes/);
    // un acta de 50 000 caracteres con tildes (hasta ~2 bytes por letra) todavía cabe
    await expect(h.create({ payload: { x: 'á'.repeat(45_000) } }, user('CAE'))).resolves.toBeDefined();
    await expect(h.create({ targetId: 'missing' }, user('CAE'))).rejects.toMatchObject({ status: 404 });
    await expect(buildHarness({ SIGNATURES_PUBLIC_ENABLED: 'no' }).create()).rejects.toMatchObject({ status: 503 });
    await expect(buildHarness({ ENCRYPTION_KEY: '' }).create()).rejects.toMatchObject({ status: 503 });
  });

  it('si algo falla, no queda ni fila ni PDF huérfano', async () => {
    const h = buildHarness();
    h.adapter.onCreated = async () => { throw new Error('boom'); };
    const before = h.storage.files.size;
    await expect(h.create()).rejects.toThrow('boom');
    expect(h.fake.requests).toHaveLength(0);
    expect(h.storage.files.size).toBe(before);

    const h2 = buildHarness();
    jest.spyOn(h2.pdf, 'generateBranded').mockRejectedValueOnce(new Error('chromium caído'));
    await expect(h2.create()).rejects.toThrow(/No se pudo preparar el documento/);
    expect(h2.fake.requests).toHaveLength(0);
    expect(h2.storage.files.size).toBe(0);
  });

  it('el tope diario de correos de la organización frena los envíos (429)', async () => {
    const h = buildHarness();
    const first = await h.create();
    for (let i = 0; i < 300; i++) h.fake.tables.signatureEvent.push({ id: `x${i}`, requestId: first.id, seq: 100 + i, type: 'RESENT', at: new Date(), ip: null, userAgent: null, actorId: null, detail: null, prevHash: '', hash: '' });
    await expect(h.create({ targetId: 'otra' })).rejects.toMatchObject({ status: 429 });
    // otra organización no se ve afectada
    h.fake.seedUser('u2');
    await expect(h.create({ targetId: 'otra' }, user('AUDITOR', 'u2', 'org2'))).resolves.toBeDefined();
  });
});

describe('Firma interna · reenviar', () => {
  let clock: ReturnType<typeof useClock>;
  beforeEach(() => { clock = useClock(); });
  afterEach(() => { clock.restore(); jest.restoreAllMocks(); });

  it('rota el token (el viejo muere), reinicia código y bloqueo, cierra sesiones y cuenta el envío', async () => {
    const h = buildHarness();
    const { id, token } = await h.create();
    const session = await h.openSession(token);
    Object.assign(h.fake.requests[0], { lockedUntil: new Date(Date.now() + 3_600_000), otpAttempts: 3, otpFailuresHour: 7 });

    const out = await h.requests.resend(user('AUDITOR'), id, {}, INFO);
    const newToken = h.tokenOf(out.signUrl);
    expect(newToken).not.toBe(token);

    await expect(h.public.getRequest(token)).rejects.toMatchObject({ status: 404 }); // el enlace anterior ya no existe
    await expect(h.public.getRequest(newToken)).resolves.toBeDefined();
    const row = h.fake.requests.find((r) => r.id === id)!;
    expect(row).toMatchObject({ status: 'PENDING', lockedUntil: null, otpHash: null, otpAttempts: 0, otpFailuresHour: 0, otpSentCount: 0, sendCount: 2 });
    expect(h.fake.tables.signatureSession.every((s) => s.revokedAt)).toBe(true);
    expect(session).toBeDefined();
    expect(h.fake.events.at(-1)!.type).toBe('RESENT');
    expect(h.email.sendSignatureRequest).toHaveBeenCalledTimes(2);
    expect(out.emailSent).toBe(true);
  });

  it('una solicitud vencida se puede reenviar: vuelve a PENDING con vigencia nueva', async () => {
    const h = buildHarness();
    const { id } = await h.create({ expiresInDays: 1 });
    clock.advance(2 * DAY);
    await h.scheduler.expireDue();
    expect(h.fake.requests[0].status).toBe('EXPIRED');
    const out = await h.requests.resend(user('AUDITOR'), id, { expiresInDays: 7 }, INFO);
    const row = h.fake.requests.find((r) => r.id === id)!;
    expect(row.status).toBe('PENDING');
    expect(Math.round((row.expiresAt.getTime() - Date.now()) / DAY)).toBe(7);
    await expect(h.public.getRequest(h.tokenOf(out.signUrl))).resolves.toBeDefined();
  });

  it('una solicitud firmada, rechazada o revocada NO se reenvía (409)', async () => {
    const h = buildHarness();
    const { id } = await h.create();
    h.fake.requests[0].status = 'SIGNED';
    await expect(h.requests.resend(user('AUDITOR'), id, {}, INFO)).rejects.toMatchObject({ status: 409 });
    h.fake.requests[0].status = 'REVOKED';
    await expect(h.requests.resend(user('AUDITOR'), id, {}, INFO)).rejects.toMatchObject({ status: 409 });
  });
});

describe('Firma interna · revocar y aislamiento entre organizaciones', () => {
  afterEach(() => jest.restoreAllMocks());

  it('revocar cierra la solicitud, las sesiones y el gancho del documento, y purga adjuntos', async () => {
    const h = buildHarness();
    const { id, token } = await h.create();
    const session = await h.openSession(token);
    await h.public.uploadAttachment(token, session, { originalname: 'a.pdf', buffer: await makePdf(1) }, INFO);

    const view = await h.requests.revoke(user('AUDITOR'), id, 'Se envió a la persona equivocada', INFO);
    expect(view.status).toBe('REVOKED');
    expect(view.revokedReason).toBe('Se envió a la persona equivocada');
    expect(h.adapter.calls.revoked).toEqual([{ id, reason: 'Se envió a la persona equivocada' }]);
    expect(h.fake.tables.signatureSession.every((s) => s.revokedAt)).toBe(true);
    expect(h.fake.tables.signatureAttachment).toHaveLength(0);
    await expect(h.public.getDocument(token, session)).rejects.toMatchObject({ status: 410 });
    // y solo se revoca lo que está activo
    await expect(h.requests.revoke(user('AUDITOR'), id, 'otra vez', INFO)).rejects.toMatchObject({ status: 409 });
  });

  it('revokeActiveForTarget (cuando cambia el documento de origen): TARGET_UPDATED y REVOKED, sin gancho', async () => {
    const h = buildHarness();
    const { id, token } = await h.create();
    const closed = await h.prisma.$transaction((tx) => h.requests.revokeActiveForTarget(tx, {
      organizationId: 'org1', documentType: 'EXTERNAL_CONFIRMATION', targetId: 'conf1', reason: 'El documento de origen cambió', actorId: 'u1',
    }));
    expect(closed.map((r) => r.id)).toEqual([id]);
    expect(h.fake.events.map((e) => e.type)).toEqual(['CREATED', 'SENT', 'TARGET_UPDATED', 'REVOKED']);
    await expect(h.public.getRequest(token)).rejects.toMatchObject({ status: 410 });
  });

  it('otra organización no ve ni toca nada: 404 en consultar, reenviar, revocar, archivos, integridad y resellar', async () => {
    const h = buildHarness();
    const { id } = await h.create();
    const intruder = user('CAE', 'u9', 'org2');
    await expect(h.requests.get(intruder, id)).rejects.toMatchObject({ status: 404 });
    await expect(h.requests.resend(intruder, id, {}, INFO)).rejects.toMatchObject({ status: 404 });
    await expect(h.requests.revoke(intruder, id, 'x'.repeat(10), INFO)).rejects.toMatchObject({ status: 404 });
    await expect(h.requests.getFile(intruder, id, 'original')).rejects.toMatchObject({ status: 404 });
    await expect(h.requests.integrity(intruder, id)).rejects.toMatchObject({ status: 404 });
    await expect(h.requests.reseal(intruder, id)).rejects.toMatchObject({ status: 404 });
    await expect(h.requests.list(intruder, 'EXTERNAL_CONFIRMATION', 'conf1')).resolves.toEqual([]);
    // y no se pudo revocar lo ajeno
    expect(h.fake.requests[0].status).toBe('PENDING');
  });

  it('la lista trae bitácora y adjuntos, sin secretos', async () => {
    const h = buildHarness();
    const { token } = await h.create();
    const session = await h.openSession(token);
    await h.public.uploadAttachment(token, session, { originalname: 'estado.pdf', buffer: await makePdf(1) }, INFO);
    const [item] = await h.requests.list(user('AUDITOR'), 'EXTERNAL_CONFIRMATION', 'conf1');
    expect(item.events.map((e: any) => e.type)).toContain('ATTACHMENT_ACCEPTED');
    expect(item.attachments[0]).toMatchObject({ originalName: 'estado.pdf', scanStatus: 'CLEAN', hasSafeCopy: true });
    expect(JSON.stringify(item)).not.toMatch(/tokenHash|tokenEncrypted|otpHash|quarantine/);
  });
});

describe('Firma interna · archivos e integridad', () => {
  afterEach(() => jest.restoreAllMocks());

  it('getFile: original, firmado, adjunto reconstruido; el original en cuarentena solo para gerente o superior', async () => {
    const h = buildHarness();
    const { id, token } = await h.create();
    const session = await h.openSession(token);
    const att = await h.public.uploadAttachment(token, session, { originalname: 'estado.pdf', buffer: await makePdf(1) }, INFO);

    expect((await h.requests.getFile(user('AUDITOR'), id, 'original')).url).toContain('original.pdf');
    await expect(h.requests.getFile(user('AUDITOR'), id, 'signed')).rejects.toMatchObject({ status: 404 }); // aún no hay firmado
    expect((await h.requests.getFile(user('AUDITOR'), id, `attachment:${att.id}`)).url).toContain(`${att.id}.pdf`);
    await expect(h.requests.getFile(user('AUDITOR'), id, `quarantine:${att.id}`)).rejects.toMatchObject({ status: 403 });
    const q = await h.requests.getFile(user('AUDIT_MANAGER'), id, `quarantine:${att.id}`);
    expect(q.url).toContain('quarantine');
    expect(q.warning).toMatch(/sin reconstruir/);
    await expect(h.requests.getFile(user('AUDITOR'), id, '../../etc/passwd')).rejects.toMatchObject({ status: 400 });
    await expect(h.requests.getFile(user('AUDITOR'), id, 'attachment:no-existe')).rejects.toMatchObject({ status: 404 });
  });

  it('integridad: íntegro → ok; PDF alterado o bitácora editada → falla y deja constancia', async () => {
    const h = buildHarness();
    const { id } = await h.create();
    const mgr = user('AUDIT_MANAGER');
    const fine = await h.requests.integrity(mgr, id);
    expect(fine.ok).toBe(true);
    expect(fine.checks.map((c) => c.name)).toEqual(['bitacora_encadenada', 'documento_original']);

    // alguien edita un evento directamente en la base
    h.fake.events[0].detail = { documentType: 'EXTERNAL_CONFIRMATION', expiresInDays: 999 };
    const bad = await h.requests.integrity(mgr, id);
    expect(bad.ok).toBe(false);
    expect(bad.checks.find((c) => c.name === 'bitacora_encadenada')).toMatchObject({ ok: false });
    expect(h.fake.events.at(-1)).toMatchObject({ type: 'INTEGRITY_FAILED' });
    expect(verifyChain(id, await h.events.listChain(id)).ok).toBe(false);

    // y alguien reemplaza el PDF
    h.storage.files.set(h.fake.requests[0].documentPath, await makePdf(4));
    expect((await h.requests.integrity(mgr, id)).checks.find((c) => c.name === 'documento_original')).toMatchObject({ ok: false });
  });

  it('integridad de una solicitud sellada: la huella registrada debe tener su MAC (si alguien la cambió en la BD, falla)', async () => {
    const h = buildHarness();
    const { id } = await h.openSignedRequest();
    expect(await h.sealing.sealRequest(id)).toBe('SEALED');
    const mgr = user('AUDIT_MANAGER');
    const fine = await h.requests.integrity(mgr, id);
    expect(fine.ok).toBe(true);
    expect(fine.checks.find((c) => c.name === 'huella_sellada_autenticada')).toMatchObject({ ok: true });

    // alguien reemplaza el PDF sellado Y actualiza la huella en la base: el archivo «coincide», pero sin MAC válido
    const row = h.fake.requests.find((r) => r.id === id)!;
    const forged = await makePdf(6);
    h.storage.files.set(row.signedPdfPath, forged);
    row.signedPdfSha256 = sha256Hex(forged);
    const bad = await h.requests.integrity(mgr, id);
    expect(bad.ok).toBe(false);
    expect(bad.checks.find((c) => c.name === 'pdf_sellado')).toMatchObject({ ok: true });
    expect(bad.checks.find((c) => c.name === 'huella_sellada_autenticada')).toMatchObject({ ok: false });
    expect(h.fake.events.at(-1)).toMatchObject({ type: 'INTEGRITY_FAILED', detail: { failed: ['huella_sellada_autenticada'] } });
  });

  it('reseal: solo una solicitud firmada con sellado pendiente o fallido; dispara el sellado', async () => {
    const h = buildHarness();
    const { id } = await h.create();
    await expect(h.requests.reseal(user('AUDITOR'), id)).rejects.toMatchObject({ status: 409 }); // aún no firmada
    Object.assign(h.fake.requests[0], { status: 'SIGNED', sealStatus: 'FAILED', sealAttempts: 5 });
    const spy = jest.spyOn(h.sealing, 'sealRequest').mockResolvedValue('SEALED');
    await h.requests.reseal(user('AUDITOR'), id);
    expect(h.fake.requests[0]).toMatchObject({ sealStatus: 'PENDING', sealAttempts: 0 });
    expect(spy).toHaveBeenCalledWith(id);
  });
});

describe('Firma interna · anexos y control de acceso del documento de origen', () => {
  afterEach(() => jest.restoreAllMocks());

  it('los PDF que el adaptador pide anexar se UNEN al documento congelado antes de limpiarlo y calcular su huella', async () => {
    const h = buildHarness();
    const annex = await makePdf(2);
    const base = h.adapter.prepare.bind(h.adapter);
    h.adapter.prepare = async (ctx) => ({ ...(await base(ctx)), appendPdfs: [annex] });
    const merge = jest.spyOn(h.pdfTools, 'mergePdfs');
    const { id } = await h.create();
    expect(merge).toHaveBeenCalledTimes(1);
    expect(merge.mock.calls[0][0].map((f: any) => f.filename)).toEqual(['documento.pdf', 'anexo-1.pdf']);
    const row = h.fake.requests.find((r) => r.id === id)!;
    expect(row.documentPages).toBe(3); // 1 página del documento + 2 del anexo
    expect(row.documentSha256).toBe(sha256Hex(await h.storage.download(row.documentPath)));
  });

  it('sin anexos no se fusiona nada', async () => {
    const h = buildHarness();
    const merge = jest.spyOn(h.pdfTools, 'mergePdfs');
    await h.create();
    expect(merge).not.toHaveBeenCalled();
  });

  it('el gancho assertAccess del adaptador se aplica al listar y a toda consulta o acción sobre una solicitud', async () => {
    const h = buildHarness();
    const { id } = await h.create();
    const spy = jest.fn(async () => undefined);
    h.adapter.assertAccess = spy;
    const u = user('AUDIT_MANAGER');

    await h.requests.list(u, 'EXTERNAL_CONFIRMATION' as any, 'conf1');
    await h.requests.get(u, id);
    await h.requests.getFile(u, id, 'original');
    await h.requests.integrity(u, id);
    expect(spy).toHaveBeenCalledTimes(4);
    expect(spy).toHaveBeenCalledWith(u, 'conf1');

    // Si el adaptador lo prohíbe (modo investigación y no es del equipo), nada se entrega.
    h.adapter.assertAccess = async () => { throw new (require('@nestjs/common').ForbiddenException)('Acceso restringido — modo investigación'); };
    await expect(h.requests.list(u, 'EXTERNAL_CONFIRMATION' as any, 'conf1')).rejects.toThrow(/modo investigación/);
    await expect(h.requests.get(u, id)).rejects.toThrow(/modo investigación/);
    await expect(h.requests.getFile(u, id, 'original')).rejects.toThrow(/modo investigación/);
    await expect(h.requests.revoke(u, id, 'motivo suficiente', INFO)).rejects.toThrow(/modo investigación/);
    await expect(h.requests.resend(u, id, {} as any, INFO)).rejects.toThrow(/modo investigación/);
    expect(h.fake.requests.find((r) => r.id === id)!.status).toBe('PENDING'); // la revocación no se ejecutó
  });
});

describe('Firma interna · firma presencial (sin correo con el enlace)', () => {
  afterEach(() => jest.restoreAllMocks());

  it('crear con sendEmail:false no envía ningún correo ni deja recordatorios, y el firmante igual puede verificarse y firmar', async () => {
    const h = buildHarness();
    const { id, token, out } = await h.create({ sendEmail: false });
    const row = h.fake.requests.find((r) => r.id === id)!;

    expect(out).toMatchObject({ emailSent: false, emailSkipped: true });
    expect(h.email.sendSignatureRequest).not.toHaveBeenCalled();
    expect(row).toMatchObject({ reminderEnabled: false, sentAt: null, sendCount: 0 });
    const types = h.fake.events.filter((e) => e.requestId === id).map((e) => e.type);
    expect(types).toEqual(['CREATED']); // sin SENT
    expect(h.fake.events.find((e) => e.type === 'CREATED')!.detail).toMatchObject({ inPerson: true });

    // El código de verificación SÍ llega al correo del firmante: así se confirma quién es, aunque el auditor abra el enlace.
    const session = await h.openSession(token);
    expect(h.email.sendSignatureOtp).toHaveBeenCalledTimes(1);
    expect(session).toBeTruthy();
  });

  it('el tope diario de correos no frena una firma presencial (no envía correo con el enlace)', async () => {
    const h = buildHarness();
    jest.spyOn(h.policy, 'assertDailyEmailCap').mockRejectedValue(new Error('tope'));
    await expect(h.create()).rejects.toThrow('tope');
    await expect(h.create({ sendEmail: false })).resolves.toBeDefined();
  });

  it('sendEmail omitido o true envía el correo como siempre', async () => {
    const h = buildHarness();
    expect((await h.create()).out).toMatchObject({ emailSent: true, emailSkipped: false });
    expect((await h.create({ sendEmail: true })).out.emailSkipped).toBe(false);
    expect(h.email.sendSignatureRequest).toHaveBeenCalledTimes(2);
  });

  it('abrir para firma presencial rota el enlace SIN correo: el anterior muere, no suma envíos y se apagan los recordatorios', async () => {
    const h = buildHarness();
    const { id, token } = await h.create();
    h.email.sendSignatureRequest.mockClear();
    const sendCountBefore = h.fake.requests.find((r) => r.id === id)!.sendCount;

    const r = await h.requests.inPerson(user('AUDITOR'), id, {} as any, INFO);
    const newToken = h.tokenOf(r.signUrl);
    expect(newToken).not.toBe(token);
    expect(r).toMatchObject({ emailSent: false, emailSkipped: true });
    expect(h.email.sendSignatureRequest).not.toHaveBeenCalled();
    const row = h.fake.requests.find((x) => x.id === id)!;
    expect(row).toMatchObject({ reminderEnabled: false, sendCount: sendCountBefore, status: 'PENDING' });
    expect(row.tokenHash).toBe(hashToken(newToken));
    expect(h.fake.events.filter((e) => e.requestId === id && e.type === 'RESENT').at(-1)!.detail).toMatchObject({ inPerson: true });

    await expect(h.public.sendOtp(token, INFO)).rejects.toBeDefined(); // el enlace anterior ya no sirve
    await expect(h.public.sendOtp(newToken, INFO)).resolves.toBeDefined();
  });

  it('solo se abre para firma presencial una solicitud pendiente, abierta o vencida; firmada o revocada, no; y exige el rol del tipo', async () => {
    const h = buildHarness();
    const { id } = await h.create();
    const row = () => h.fake.requests.find((x) => x.id === id)!;
    for (const status of ['SIGNED', 'DECLINED', 'REVOKED']) {
      row().status = status;
      await expect(h.requests.inPerson(user('AUDITOR'), id, {} as any, INFO)).rejects.toMatchObject({ status: 409 });
    }
    row().status = 'EXPIRED';
    row().expiresAt = new Date(Date.now() - DAY);
    const r = await h.requests.inPerson(user('AUDITOR'), id, { expiresInDays: 3 } as any, INFO);
    expect(row()).toMatchObject({ status: 'PENDING' });
    expect(row().expiresAt.getTime()).toBeGreaterThan(Date.now() + 2 * DAY);
    expect(r.emailSkipped).toBe(true);
    await expect(h.requests.inPerson(user('READ_ONLY'), id, {} as any, INFO)).rejects.toMatchObject({ status: 403 });
  });
});
