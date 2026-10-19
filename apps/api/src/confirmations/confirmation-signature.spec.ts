/* eslint-disable @typescript-eslint/no-explicit-any */
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AuditInvestigationAccessService } from '../investigation-report/audit-investigation-access.service';
import { buildHarness, INFO, makePdf, user } from '../signatures/testing/harness';
import { ConfirmationAuthorizationService } from './confirmation-authorization.service';
import { ConfirmationSignatureAdapter, formatMoney } from './confirmation-signature.adapter';
import { ConfirmationsService } from './confirmations.service';

const auditor = user('AUDITOR');
const BASE = { mode: 'POSITIVE_WITH_AMOUNT', asOfDate: '2025-12-31', currency: 'USD', recipientVerified: true };
const SIGN = { signedName: 'Juan Banco Pérez', signedRole: 'Gerente de Cumplimiento' } as any;

/** Arnés de firma + confirmación + auditoría reales (BD falsa), con el adaptador REAL de la confirmación registrado. */
function setup(opts: { investigation?: boolean; team?: string[] } = {}) {
  const h = buildHarness();
  h.fake.seedAudit({ isInvestigationMode: !!opts.investigation });
  h.fake.seedConfirmation();
  const confirmations = new ConfirmationsService(h.prisma as any, h.requests);
  // El criterio de equipo es el servicio REAL, con una BD mínima que le responde lo que necesita.
  const accessPrisma: any = {
    audit: { findFirst: async ({ where }: any) => (where.organizationId === 'org1' && where.id === 'aud1'
      ? { id: 'aud1', isInvestigationMode: !!opts.investigation, team: (opts.team ?? []).map((userId) => ({ userId })) } : null) },
  };
  const access = new AuditInvestigationAccessService(accessPrisma);
  const adapter = new ConfirmationSignatureAdapter(h.prisma as any, h.registry, confirmations, h.storage as any, access);
  adapter.onModuleInit();
  const authorization = new ConfirmationAuthorizationService(h.prisma as any, h.attachments, h.storage as any, access);

  const conf = () => h.fake.tables.externalConfirmation[0];
  const request = (id: string) => h.fake.requests.find((r) => r.id === id)!;
  const send = async (payload: Record<string, unknown> = {}, over: Record<string, unknown> = {}, u = auditor) => {
    const out = await h.requests.create(u, {
      documentType: 'EXTERNAL_CONFIRMATION', targetId: 'conf1', signerName: 'Juan Banco Pérez', signerEmail: 'confirmaciones@banco.com',
      signerRole: 'Gerente', payload: { ...BASE, ...payload }, ...over,
    } as any, INFO);
    return { id: out.request.id as string, token: h.tokenOf(out.signUrl), out };
  };
  const signAs = async (token: string, response: Record<string, unknown>) => {
    const session = await h.openSession(token);
    const spy = jest.spyOn(h.sealing, 'sealRequest').mockResolvedValue('SKIPPED');
    try { return await h.public.sign(token, session, { ...SIGN, consent: true, response } as any, INFO); } finally { spy.mockRestore(); }
  };
  return { h, confirmations, adapter, authorization, conf, request, send, signAs };
}

afterEach(() => jest.restoreAllMocks());

describe('Confirmación externa · enviar a firma', () => {
  it('con saldo: PDF con todo escapado y el saldo, confirmación ENVIADA con quién y cuándo, y solicitud ligada al encargo', async () => {
    const { h, conf, request, send } = setup();
    const { id } = await send();

    const body = h.pdf.lastBody;
    expect(body).toContain('Banco &lt;Cuscatlán&gt; &amp; Cía'); // el HTML del nombre no se interpreta
    expect(body).not.toContain('<Cuscatlán>');
    expect(body).toContain('Pérez Cortez y Asociados');
    expect(body).toContain('Cta. 001-234567-8');
    expect(body).toContain('$1,250.50');
    expect(body).toContain('31 de diciembre de 2025');
    expect(body).toContain('directamente');

    expect(conf()).toMatchObject({ status: 'SENT', sentBy: 'Ana Auditora' });
    expect(conf().sentAt).toBeInstanceOf(Date);
    expect(request(id)).toMatchObject({ documentType: 'EXTERNAL_CONFIRMATION', targetId: 'conf1', auditId: 'aud1', status: 'PENDING' });
    expect(request(id).title).toBe('Confirmación externa — Banco — Banco <Cuscatlán> & Cía');
    expect(request(id).payload).toMatchObject({ mode: 'POSITIVE_WITH_AMOUNT', amountShown: 1250.5, currency: 'USD', recipientVerified: true });
    expect(request(id).expiresAt.getTime() - Date.now()).toBeLessThan(15.1 * 864e5); // 15 días por defecto
  });

  it('con saldo en blanco: el saldo NO aparece en el documento ni se guarda en la solicitud', async () => {
    const { h, request, send } = setup();
    const { id } = await send({ mode: 'POSITIVE_BLANK' });
    expect(h.pdf.lastBody).not.toContain('1,250.50');
    expect(h.pdf.lastBody).toContain('Indique el saldo según sus registros');
    expect(request(id).payload.amountShown).toBeNull();
  });

  it('exige lo que NIA 505 pide: verificar el correo, tipo y fecha válidos; y no cambia nada si algo falta', async () => {
    const { h, conf, send } = setup();
    await expect(send({ recipientVerified: 'true' })).rejects.toThrow(/verificar de forma independiente/);
    await expect(send({ mode: undefined })).rejects.toThrow(/Elige el tipo/);
    await expect(send({ asOfDate: '2025-02-31' })).rejects.toThrow(/fecha de corte/);
    conf().amount = null;
    await expect(send()).rejects.toThrow(/no tiene monto/);
    expect(conf().status).toBe('DRAFT');
    expect(h.fake.requests).toHaveLength(0);
  });

  it('un auditor puede enviarla; un rol inferior, otra organización y estados sin pendiente de respuesta, no', async () => {
    const { conf, send } = setup();
    await expect(send({}, {}, user('READ_ONLY'))).rejects.toBeInstanceOf(ForbiddenException);
    await expect(send({}, {}, user('AUDITOR', 'u9', 'org2'))).rejects.toBeInstanceOf(NotFoundException);
    await expect(send({}, { targetId: 'no-existe' })).rejects.toBeInstanceOf(NotFoundException);
    for (const status of ['RECEIVED', 'RECONCILED', 'NO_RESPONSE', 'ALT_PROCEDURE']) {
      conf().status = status;
      await expect(send()).rejects.toBeInstanceOf(ConflictException);
    }
    conf().status = 'DRAFT';
    expect((await send()).out.emailSent).toBe(true);
  });

  it('enviar de nuevo reemplaza la solicitud vigente y la confirmación sigue ENVIADA', async () => {
    const { conf, request, send } = setup();
    const first = await send();
    const second = await send({ asOfDate: '2025-11-30' });
    expect(request(first.id).status).toBe('REVOKED');
    expect(request(second.id).status).toBe('PENDING');
    expect(conf().status).toBe('SENT');
  });
});

describe('Confirmación externa · carta de autorización del cliente', () => {
  const upload = async (ctx: ReturnType<typeof setup>, name = 'autorizacion.pdf') =>
    ctx.authorization.upload('conf1', { originalname: name, buffer: await makePdf(1) }, auditor);

  it('se sube con la misma cadena de defensa, se une al documento congelado y su huella queda en la solicitud', async () => {
    const ctx = setup();
    const { authorizationPath, name } = await upload(ctx);
    expect(name).toBe('autorizacion.pdf');
    expect(authorizationPath).toMatch(/^signature-requests\/aud1\/authorizations\/conf1\/[0-9a-f-]{36}\.pdf$/);
    expect(ctx.h.clam.scans).toBe(1);

    const merge = jest.spyOn(ctx.h.pdfTools, 'mergePdfs');
    const { id } = await ctx.send({ authorizationPath });
    expect(merge).toHaveBeenCalledTimes(1);
    expect(ctx.request(id).documentPages).toBe(2); // el documento + la carta
    expect(ctx.request(id).payload).toMatchObject({ authorizationPath, authorizationSha256: expect.stringMatching(/^[0-9a-f]{64}$/) });
    expect(ctx.h.pdf.lastBody).toContain('se anexa la carta de autorización');
  });

  it('subir otra reemplaza la anterior; quitarla borra todo; solo con la confirmación en borrador', async () => {
    const ctx = setup();
    const first = await upload(ctx);
    const second = await upload(ctx, 'otra.pdf');
    const files = () => [...ctx.h.storage.files.keys()].filter((k) => k.includes('/authorizations/conf1/'));
    expect(files().some((f) => f === first.authorizationPath)).toBe(false);
    expect(files().some((f) => f === second.authorizationPath)).toBe(true);

    await expect(ctx.authorization.remove('conf1', auditor)).resolves.toEqual({ removed: true });
    expect(files()).toHaveLength(0);

    ctx.conf().status = 'SENT';
    await expect(upload(ctx)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(ctx.authorization.remove('conf1', auditor)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('no se acepta una carta de otra confirmación, una ruta inventada ni un archivo que ya no existe', async () => {
    const ctx = setup();
    const { authorizationPath } = await upload(ctx);
    ctx.h.fake.seedConfirmation({ id: 'conf2' });
    await expect(ctx.send({ authorizationPath }, { targetId: 'conf2' })).rejects.toThrow(/carta de autorización no es válida/);
    await expect(ctx.send({ authorizationPath: 'signature-requests/aud1/otro/original.pdf' })).rejects.toThrow(/no es válida/);
    await ctx.h.storage.remove([authorizationPath]);
    await expect(ctx.send({ authorizationPath })).rejects.toThrow(/No se encontró la carta de autorización/);
    // nada quedó a medias
    expect(ctx.h.fake.requests).toHaveLength(0);
    expect(ctx.conf().status).toBe('DRAFT');
  });

  it('un archivo con virus o que no es PDF/JPG/PNG se rechaza y no queda nada guardado', async () => {
    const ctx = setup();
    ctx.h.clam.result = { status: 'INFECTED', signature: 'Win.Test.EICAR_HDB-1' };
    await expect(upload(ctx)).rejects.toMatchObject({ status: 422 });
    ctx.h.clam.result = { status: 'CLEAN' };
    await expect(ctx.authorization.upload('conf1', { originalname: 'a.pdf', buffer: Buffer.from('MZ\x90 programa') }, auditor)).rejects.toThrow(/Tipo de archivo no permitido/);
    await expect(ctx.authorization.upload('conf1', undefined, auditor)).rejects.toBeInstanceOf(BadRequestException);
    expect([...ctx.h.storage.files.keys()].filter((k) => k.includes('/authorizations/'))).toHaveLength(0);
  });
});

describe('Confirmación externa · el confirmante firma', () => {
  it('de acuerdo: RECIBIDA con el saldo mostrado, sin diferencia y con el texto de la respuesta', async () => {
    const { conf, request, send, signAs } = setup();
    const { id, token } = await send();
    const r = await signAs(token, { agrees: true, comments: 'Conforme con el saldo.' });

    expect(r).toMatchObject({ status: 'SIGNED' });
    expect(conf()).toMatchObject({ status: 'RECEIVED', responseAmount: 1250.5, difference: 0 });
    expect(conf().responseReceivedAt).toBeInstanceOf(Date);
    expect(conf().responseContent).toMatch(/^Respuesta electrónica firmada por Juan Banco Pérez \(Gerente de Cumplimiento\) el .+: De acuerdo\. Comentarios: Conforme con el saldo\.$/);
    expect(request(id).status).toBe('SIGNED');
    expect(request(id).response).toEqual({ agrees: true, confirmedAmount: null, comments: 'Conforme con el saldo.' });
  });

  it('en desacuerdo: queda el saldo que escribió y la diferencia contra el monto solicitado', async () => {
    const { conf, send, signAs } = setup();
    const { token } = await send();
    await signAs(token, { agrees: false, confirmedAmount: 1300 });
    expect(conf()).toMatchObject({ status: 'RECEIVED', responseAmount: 1300, difference: 49.5 });
    expect(conf().responseContent).toContain('En desacuerdo. Comentarios: ninguno');
  });

  it('con saldo en blanco: lo que escribe el confirmante es la respuesta', async () => {
    const { conf, send, signAs } = setup();
    const { token } = await send({ mode: 'POSITIVE_BLANK' });
    await signAs(token, { agrees: true, confirmedAmount: 1250.5 });
    expect(conf()).toMatchObject({ status: 'RECEIVED', responseAmount: 1250.5, difference: 0 });
  });

  it('la respuesta se valida en el servidor: falta el saldo en desacuerdo o en blanco, datos de más, tipos raros', async () => {
    const { h, conf, send } = setup();
    const { token } = await send();
    const session = await h.openSession(token);
    const sign = (response: unknown) => h.public.sign(token, session, { ...SIGN, consent: true, response } as any, INFO);
    await expect(sign({ agrees: false })).rejects.toThrow(/Si no estás de acuerdo/);
    await expect(sign({})).rejects.toThrow(/Indica si estás de acuerdo/);
    await expect(sign({ agrees: 'true' })).rejects.toThrow(/Indica si estás de acuerdo/);
    await expect(sign({ agrees: true, confirmedAmount: -5 })).rejects.toThrow(/mayor o igual a cero/);
    await expect(sign({ agrees: true, status: 'RECONCILED' })).rejects.toThrow(/no corresponden/);
    expect(conf().status).toBe('SENT'); // nada de lo anterior cambió la confirmación
  });

  it('el formulario que ve el firmante: saldo obligatorio solo si no está de acuerdo (o siempre en blanco), con soportes opcionales', async () => {
    const { h, send } = setup();
    const { token } = await send();
    const doc: any = await h.public.getDocument(token, await h.openSession(token));
    expect(doc.form).toMatchObject({ allowAttachments: true, signedRoleRequired: true });
    expect(doc.form.fields.map((f: any) => f.key)).toEqual(['agrees', 'confirmedAmount', 'comments']);
    expect(doc.form.fields[0]).toMatchObject({ type: 'boolean', required: true });
    expect(doc.form.fields[1]).toMatchObject({ type: 'amount', requiredIf: { field: 'agrees', equals: false } });
    expect(doc.form.fields[1].required).toBeUndefined();

    const blank = setup();
    const b = await blank.send({ mode: 'POSITIVE_BLANK' });
    const docB: any = await blank.h.public.getDocument(b.token, await blank.h.openSession(b.token));
    expect(docB.form.fields[1]).toMatchObject({ required: true });
    expect(docB.form.fields[1].requiredIf).toBeUndefined();
  });

  it('si el confirmante rechaza, la confirmación sigue ENVIADA y el motivo queda en la solicitud', async () => {
    const { h, conf, request, send } = setup();
    const { id, token } = await send();
    await h.public.decline(token, await h.openSession(token), { reason: 'No tenemos relación con esa cuenta.' } as any, INFO);
    expect(request(id)).toMatchObject({ status: 'DECLINED', declineReason: 'No tenemos relación con esa cuenta.' });
    expect(conf().status).toBe('SENT');
  });

  it('sus soportes pasan por la cadena de defensa y quedan como enviados al firmar', async () => {
    const { h, send } = setup();
    const { id, token } = await send();
    const session = await h.openSession(token);
    await h.public.uploadAttachment(token, session, { originalname: 'estado.pdf', buffer: await makePdf(1) }, INFO);
    const spy = jest.spyOn(h.sealing, 'sealRequest').mockResolvedValue('SKIPPED');
    await h.public.sign(token, session, { ...SIGN, consent: true, response: { agrees: true } } as any, INFO);
    spy.mockRestore();
    expect(h.fake.tables.signatureAttachment.filter((a) => a.requestId === id).map((a) => a.submitted)).toEqual([true]);
  });
});

describe('Confirmación externa · revocar, editar y registro manual', () => {
  it('revocar desde el panel devuelve la confirmación a borrador (sin fecha ni autor de envío)', async () => {
    const { h, conf, request, send } = setup();
    const { id } = await send();
    await h.requests.revoke(auditor, id, 'Me equivoqué de destinatario', INFO);
    expect(request(id).status).toBe('REVOKED');
    expect(conf()).toMatchObject({ status: 'DRAFT', sentAt: null, sentBy: null });
  });

  it('registrar la respuesta a mano cierra la solicitud por enlace: el confirmante que llega después ya no puede firmar', async () => {
    const { h, confirmations, conf, request, send } = setup();
    const { id, token } = await send();
    const session = await h.openSession(token);
    await confirmations.receiveResponse('conf1', { responseContent: 'Respondió por carta física', responseAmount: 1250.5 } as any, auditor);
    expect(conf()).toMatchObject({ status: 'RECEIVED', responseAmount: 1250.5 });
    expect(request(id)).toMatchObject({ status: 'REVOKED', revokedReason: 'La respuesta se registró de forma manual' });
    await expect(h.public.sign(token, session, { ...SIGN, consent: true, response: { agrees: true } } as any, INFO)).rejects.toBeDefined();
    expect(conf().responseContent).toBe('Respondió por carta física');
  });

  it('marcar «sin respuesta» también cierra la solicitud vigente', async () => {
    const { confirmations, conf, request, send } = setup();
    const { id } = await send();
    await confirmations.markNoResponse('conf1', auditor);
    expect(conf().status).toBe('NO_RESPONSE');
    expect(request(id).status).toBe('REVOKED');
  });

  it('cambiar el monto, la cuenta, el nombre o el correo revoca la solicitud vigente; guardar igual no', async () => {
    const { confirmations, conf, request, send } = setup();
    const { id } = await send();
    conf().status = 'DRAFT'; // estado "a medias": borrador con solicitud vigente (p. ej. tras un fallo)
    await confirmations.update('conf1', { amount: 1250.5, accountRef: 'Cta. 001-234567-8' } as any, auditor);
    expect(request(id).status).toBe('PENDING'); // mismos valores: nada cambió

    await confirmations.update('conf1', { amount: 1999 } as any, auditor);
    expect(request(id)).toMatchObject({ status: 'REVOKED', revokedReason: 'Los datos de la confirmación cambiaron después de enviarla' });
    expect(Number(conf().amount)).toBe(1999);
  });
});

describe('Confirmación externa · modo investigación', () => {
  it('solo el equipo del encargo (y CAE, ADMIN, SUPER_ADMIN) puede enviar, ver o gestionar; el resto recibe 403 y no cambia nada', async () => {
    const ctx = setup({ investigation: true, team: ['u-team'] });
    const outsider = user('AUDIT_MANAGER', 'u-fuera');
    await expect(ctx.send({}, {}, outsider)).rejects.toThrow(/modo investigación/);
    expect(ctx.conf().status).toBe('DRAFT');
    await expect(ctx.authorization.upload('conf1', { originalname: 'a.pdf', buffer: await makePdf(1) }, outsider)).rejects.toThrow(/modo investigación/);

    const member = user('AUDITOR', 'u-team');
    const { id } = await ctx.send({}, {}, member);
    await expect(ctx.h.requests.list(outsider, 'EXTERNAL_CONFIRMATION' as any, 'conf1')).rejects.toThrow(/modo investigación/);
    await expect(ctx.h.requests.get(outsider, id)).rejects.toThrow(/modo investigación/);
    await expect(ctx.h.requests.revoke(outsider, id, 'motivo suficiente', INFO)).rejects.toThrow(/modo investigación/);
    expect((await ctx.h.requests.list(member, 'EXTERNAL_CONFIRMATION' as any, 'conf1'))).toHaveLength(1);
    expect((await ctx.h.requests.list(user('CAE', 'u-cae'), 'EXTERNAL_CONFIRMATION' as any, 'conf1'))).toHaveLength(1);
  });

  it('en una auditoría normal basta con pertenecer a la organización', async () => {
    const ctx = setup({ investigation: false });
    await ctx.send({}, {}, user('AUDITOR', 'cualquiera'));
    expect(ctx.conf().status).toBe('SENT');
  });
});

describe('Confirmación externa · registro del tipo y formato', () => {
  it('queda registrado con su rol mínimo, etiqueta, plazo y soportes', () => {
    const { h } = setup();
    expect(h.registry.find('EXTERNAL_CONFIRMATION')).toMatchObject({
      minRole: 'AUDITOR', label: 'Confirmación externa (NIA 505)', defaultExpiryDays: 15, allowsAttachments: true,
    });
  });

  it('el dinero se escribe con su moneda y no revienta con una moneda desconocida', () => {
    expect(formatMoney(1250.5, 'USD')).toBe('$1,250.50');
    expect(formatMoney(0, 'USD')).toBe('$0.00');
    expect(formatMoney(1250.5, 'ZZZ')).toMatch(/1,250\.50/);
  });
});
