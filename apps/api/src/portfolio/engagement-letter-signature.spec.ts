/* eslint-disable @typescript-eslint/no-explicit-any */
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { buildHarness, INFO, user } from '../signatures/testing/harness';
import { EngagementLetterSignatureAdapter } from './engagement-letter-signature.adapter';
import { EngagementLettersService } from './engagement-letters.service';

const SIGN = { signedName: 'Roberto Morales', signedRole: 'Representante Legal', consent: true, response: {} } as any;
const manager = user('AUDIT_MANAGER');

/** Arnés de firma + carta + cliente reales (BD falsa), con el adaptador REAL de la carta registrado. */
function setup() {
  const h = buildHarness();
  h.fake.seedClient();
  h.fake.seedLetter();
  const letters = new EngagementLettersService(h.prisma as any, h.requests);
  const adapter = new EngagementLetterSignatureAdapter(h.prisma as any, h.registry, letters);
  adapter.onModuleInit();

  const letter = () => h.fake.tables.engagementLetter[0];
  const client = () => h.fake.tables.client[0];
  const request = (id: string) => h.fake.requests.find((r) => r.id === id)!;
  const send = async (over: Record<string, unknown> = {}, u = manager) => {
    const out = await h.requests.create(u, {
      documentType: 'ENGAGEMENT_LETTER', targetId: 'letter1', signerName: 'Roberto Morales', signerEmail: 'roberto@cliente.com',
      signerRole: 'Representante Legal', ...over,
    } as any, INFO);
    return { id: out.request.id as string, token: h.tokenOf(out.signUrl), out };
  };
  /** Firma como el cliente, por la vía pública real (el sellado en segundo plano se desactiva). */
  const signAs = async (token: string, body = SIGN) => {
    const session = await h.openSession(token);
    const spy = jest.spyOn(h.sealing, 'sealRequest').mockResolvedValue('SKIPPED');
    try { return await h.public.sign(token, session, body, INFO); } finally { spy.mockRestore(); }
  };
  return { h, letters, adapter, letter, client, request, send, signAs };
}

afterEach(() => jest.restoreAllMocks());

describe('Carta de compromiso · enviar a firma', () => {
  it('congela el texto en un PDF con todo escapado, deja la carta en ENVIADA y no guarda el texto en la solicitud', async () => {
    const { h, letter, request, send } = setup();
    const { id } = await send();

    expect(letter().status).toBe('SENT');
    const body = h.pdf.lastBody;
    expect(body).toContain('&lt;b&gt;HTML&lt;/b&gt; &amp; más.'); // el HTML del texto no se interpreta
    expect(body).not.toContain('<b>HTML</b>');
    expect(body).toContain('Por el despacho');
    expect(body).toContain('Pérez Cortez y Asociados');
    expect(body).toContain('Ana Auditora'); // quien envía
    expect(body).toContain('Gerente de Auditoría');
    expect(body).toContain('Aceptación del cliente');
    expect(body).toContain('Comercial Demo S.A. de C.V.');

    const r = request(id);
    expect(r).toMatchObject({ documentType: 'ENGAGEMENT_LETTER', targetId: 'letter1', auditId: null, status: 'PENDING' });
    expect(r.title).toBe('Carta de compromiso 2026 — Comercial Demo S.A. de C.V.');
    expect(JSON.stringify(r.payload)).not.toContain('Texto con'); // solo la huella del texto, no el texto
    expect(r.payload.contentSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(r.expiresAt.getTime() - Date.now()).toBeGreaterThan(29 * 864e5); // 30 días por defecto
  });

  it('solo gerente o superior puede enviar la carta; un auditor recibe 403 y la carta no cambia', async () => {
    const { letter, send } = setup();
    await expect(send({}, user('AUDITOR'))).rejects.toBeInstanceOf(ForbiddenException);
    expect(letter().status).toBe('DRAFT');
  });

  it('solo cartas de la propia organización, y nunca una firmada o rechazada', async () => {
    const { h, letter, send } = setup();
    await expect(send({}, user('AUDIT_MANAGER', 'u9', 'org2'))).rejects.toBeInstanceOf(NotFoundException);
    await expect(send({ targetId: 'no-existe' })).rejects.toBeInstanceOf(NotFoundException);

    letter().status = 'SIGNED';
    await expect(send()).rejects.toBeInstanceOf(ConflictException);
    letter().status = 'DECLINED';
    await expect(send()).rejects.toThrow(/rechazó/);
    letter().status = 'DRAFT';
    letter().content = '   ';
    await expect(send()).rejects.toBeInstanceOf(BadRequestException);
    expect(h.fake.requests).toHaveLength(0); // nada quedó a medias
  });

  it('enviar otra vez reemplaza la solicitud vigente y la carta sigue ENVIADA', async () => {
    const { letter, request, send } = setup();
    const first = await send();
    const second = await send({ signerEmail: 'otra@cliente.com' });
    expect(request(first.id)).toMatchObject({ status: 'REVOKED', revokedReason: 'Reemplazada por una solicitud nueva' });
    expect(request(second.id).status).toBe('PENDING');
    expect(letter().status).toBe('SENT');
  });
});

describe('Carta de compromiso · el cliente firma', () => {
  it('firmar es la misma transición que la firma manual: FIRMADA con lo que escribió el firmante y el cliente pasa a ACTIVO', async () => {
    const { letter, client, request, send, signAs } = setup();
    const { id, token } = await send();
    const r = await signAs(token);

    expect(r).toMatchObject({ status: 'SIGNED', verificationCode: expect.stringMatching(/^[0-9A-Z]{4}(-[0-9A-Z]{4}){3}$/) });
    expect(letter()).toMatchObject({ status: 'SIGNED', signedByClientName: 'Roberto Morales', signedByClientRole: 'Representante Legal' });
    expect(letter().signedAt).toBeInstanceOf(Date);
    expect(client().status).toBe('ACTIVE');
    expect(request(id).status).toBe('SIGNED');
  });

  it('el formulario de la carta no pide datos; la respuesta debe venir vacía y exige cargo', async () => {
    const { h, letter, send } = setup();
    const { token } = await send();
    const session = await h.openSession(token);
    const doc: any = await h.public.getDocument(token, session);
    expect(doc.form).toEqual({ fields: [], allowAttachments: false, signedRoleRequired: true });

    await expect(h.public.sign(token, session, { ...SIGN, response: { saldo: 5 } }, INFO)).rejects.toBeInstanceOf(BadRequestException);
    await expect(h.public.sign(token, session, { ...SIGN, signedRole: undefined }, INFO)).rejects.toBeInstanceOf(BadRequestException);
    expect(letter().status).toBe('SENT');
  });

  it('si el cliente rechaza, la carta queda RECHAZADA con su motivo; para reenviarla hay que editarla', async () => {
    const { h, letters, letter, request, send } = setup();
    const { id, token } = await send();
    const session = await h.openSession(token);
    await h.public.decline(token, session, { reason: 'Los honorarios no coinciden con la propuesta.' } as any, INFO);

    expect(request(id).status).toBe('DECLINED');
    expect(letter()).toMatchObject({ status: 'DECLINED', declineReason: 'Los honorarios no coinciden con la propuesta.' });
    await expect(send()).rejects.toThrow(/rechazó/);

    // Editar el texto la devuelve a borrador (y borra el motivo): ya puede volver a enviarse.
    await letters.update('letter1', { content: 'CARTA corregida' }, manager);
    expect(letter()).toMatchObject({ status: 'DRAFT', declineReason: null, content: 'CARTA corregida' });
    expect((await send()).out.emailSent).toBe(true);
    expect(letter().status).toBe('SENT');
  });

  it('un firmante que llega después de que la carta se firmó en papel ya no puede firmar', async () => {
    const { h, letters, letter, client, request, send } = setup();
    const { id, token } = await send();
    const session = await h.openSession(token);

    // El despacho registra la firma manual mientras el enlace sigue vigente.
    await letters.sign('letter1', { signedByClientName: 'Roberto Morales', signedByClientRole: 'Representante Legal' } as any, manager);
    expect(letter().status).toBe('SIGNED');
    expect(client().status).toBe('ACTIVE');
    expect(request(id)).toMatchObject({ status: 'REVOKED', revokedReason: 'La carta se registró como firmada de forma manual' });
    expect(h.fake.events.some((e) => e.requestId === id && e.type === 'TARGET_UPDATED')).toBe(true);

    await expect(h.public.sign(token, session, SIGN, INFO)).rejects.toBeDefined();
    expect(letter().signedAt).toBeInstanceOf(Date);
  });
});

describe('Carta de compromiso · cambios del texto y revocación', () => {
  it('cambiar el texto con una solicitud vigente la revoca, vuelve la carta a borrador y lo deja en la bitácora', async () => {
    const { h, letters, letter, request, send } = setup();
    const { id } = await send();
    expect(letter().status).toBe('SENT');

    const updated: any = await letters.update('letter1', { content: 'Texto NUEVO de la carta' }, manager);
    expect(updated).toMatchObject({ status: 'DRAFT', content: 'Texto NUEVO de la carta' });
    expect(request(id)).toMatchObject({ status: 'REVOKED', revokedReason: 'El texto de la carta cambió después de enviarla' });
    const types = h.fake.events.filter((e) => e.requestId === id).map((e) => e.type);
    expect(types).toEqual(expect.arrayContaining(['CREATED', 'TARGET_UPDATED', 'REVOKED']));
  });

  it('guardar sin cambiar el texto no revoca nada; una carta firmada no se edita', async () => {
    const { letters, letter, request, send } = setup();
    const { id } = await send();
    await letters.update('letter1', { content: letter().content }, manager);
    expect(request(id).status).toBe('PENDING');
    expect(letter().status).toBe('SENT');

    letter().status = 'SIGNED';
    await expect(letters.update('letter1', { content: 'x' }, manager)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('revocar desde el panel devuelve la carta a borrador', async () => {
    const { h, letter, request, send } = setup();
    const { id } = await send();
    await h.requests.revoke(manager, id, 'Me equivoqué de destinatario', INFO);
    expect(request(id).status).toBe('REVOKED');
    expect(letter().status).toBe('DRAFT');
  });

  it('si el envío falla a medias (carta cambió de estado), no queda solicitud ni PDF huérfano', async () => {
    const { h, letter, send } = setup();
    // Simula una carta que otro usuario firmó justo entre la validación y la transacción.
    const real = h.fake.client.engagementLetter.updateMany;
    h.fake.client.engagementLetter.updateMany = async () => ({ count: 0 });
    await expect(send()).rejects.toBeInstanceOf(ConflictException);
    h.fake.client.engagementLetter.updateMany = real;
    expect(h.fake.requests).toHaveLength(0);
    expect(h.storage.files.size).toBe(0);
    expect(letter().status).toBe('DRAFT');
  });
});

describe('Carta de compromiso · sellado', () => {
  it('al terminar el sellado, el archivo de la carta es el PDF firmado (URL canónica del bucket privado)', async () => {
    const prev = process.env.SUPABASE_URL;
    process.env.SUPABASE_URL = 'https://proyecto.supabase.co/';
    try {
      const { h, letter, send, signAs } = setup();
      const { id, token } = await send();
      await signAs(token);
      await new Promise((r) => setImmediate(r));
      expect(await h.sealing.sealRequest(id)).toBe('SEALED');
      await new Promise((r) => setImmediate(r));
      expect(letter().fileUrl).toBe(`https://proyecto.supabase.co/storage/v1/object/public/audit-files/signature-requests/org-org1/${id}/signed.pdf`);
    } finally {
      if (prev === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = prev;
    }
  });

  it('el tipo queda registrado con su rol mínimo, etiqueta y plazo', () => {
    const { h } = setup();
    expect(h.registry.find('ENGAGEMENT_LETTER')).toMatchObject({
      minRole: 'AUDIT_MANAGER', label: 'Carta de compromiso', defaultExpiryDays: 30, allowsAttachments: false,
    });
  });
});

describe('Carta de compromiso · revisión de seguridad F5b', () => {
  it('editar la carta cierra también las solicitudes VENCIDAS: «Reenviar» ya no resucita el PDF con el texto viejo', async () => {
    const { h, letters, letter, request, send } = setup();
    const { id } = await send();
    request(id).status = 'EXPIRED'; // el cron la venció; la carta sigue ENVIADA
    await letters.update('letter1', { content: 'Texto B, distinto del que se envió' } as any, manager);
    expect(letter()).toMatchObject({ status: 'DRAFT', content: 'Texto B, distinto del que se envió' });
    expect(request(id)).toMatchObject({ status: 'REVOKED', revokedReason: 'El texto de la carta cambió después de enviarla' });
    await expect(h.requests.resend(manager, id, {}, INFO)).rejects.toBeInstanceOf(ConflictException);
  });

  it('aunque una vencida sobreviviera (datos viejos), reenviarla exige que la carta siga ENVIADA y con el mismo texto', async () => {
    const { h, letter, request, send } = setup();
    const { id } = await send();
    request(id).status = 'EXPIRED';
    letter().content = 'Texto cambiado por otra vía';
    await expect(h.requests.resend(manager, id, {}, INFO)).rejects.toThrow(/La carta cambió/);
    letter().status = 'DRAFT'; // tampoco si ya no está enviada; y la firma presencial sigue la misma regla
    await expect(h.requests.inPerson(manager, id, {}, INFO)).rejects.toThrow(/La carta cambió/);
  });

  it('si el texto cambia MIENTRAS se arma el PDF, la solicitud no se crea', async () => {
    const { h, letter, send } = setup();
    const generate = h.pdf.generateBranded.bind(h.pdf);
    jest.spyOn(h.pdf, 'generateBranded').mockImplementationOnce(async (args: any) => {
      letter().content = 'Otro texto guardado en ese instante';
      return generate(args);
    });
    await expect(send()).rejects.toThrow(/cambió mientras se preparaba el documento/);
    expect(h.fake.requests).toHaveLength(0);
    expect(letter().status).toBe('DRAFT');
  });

  it('al firmar, si la carta ya no es la que se congeló, NO queda firmada otra cosa (la firma entera se revierte)', async () => {
    const { letter, client, request, send, signAs } = setup();
    const { id, token } = await send();
    letter().content = 'Texto que nadie le envió al cliente';
    await expect(signAs(token)).rejects.toThrow(/La carta cambió después de que se te envió/);
    expect(letter().status).toBe('SENT');
    expect(client().status).toBe('PENDING_SIGNATURE');
    expect(request(id).status).not.toBe('SIGNED');
  });

  it('nunca dos enlaces vivos: una vencida no se reactiva si hay otra solicitud vigente del mismo documento', async () => {
    const { h, request, send } = setup();
    const first = await send();
    const second = await send(); // reemplaza a la primera (REVOKED)
    request(first.id).status = 'EXPIRED'; // datos de antes de este cambio: vencida y vigente a la vez
    await expect(h.requests.resend(manager, first.id, {}, INFO)).rejects.toThrow(/otra solicitud vigente/);
    expect(request(second.id).status).toBe('PENDING');
  });
});
