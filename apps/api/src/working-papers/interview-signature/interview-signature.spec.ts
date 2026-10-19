/* eslint-disable @typescript-eslint/no-explicit-any */
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AuditInvestigationAccessService } from '../../investigation-report/audit-investigation-access.service';
import { buildHarness, INFO, user } from '../../signatures/testing/harness';
import { InterviewSignatureAdapter } from './interview-signature.adapter';

const auditor = user('AUDITOR');
const CONTENT = 'El entrevistado explicó el proceso de aprobación de pagos y confirmó que existe segregación de funciones.\nSegunda línea del acta.';
const today = () => new Date().toISOString().slice(0, 10);
const PAYLOAD = () => ({ interviewDate: today(), modality: 'VIRTUAL', location: 'Teams', interviewers: 'Ana Auditora', content: CONTENT });

/** Arnés de firma + papel + auditoría reales (BD falsa), con el adaptador REAL del acta registrado. */
function setup(opts: { investigation?: boolean; team?: string[]; withS2?: boolean; paper?: Record<string, unknown> } = {}) {
  const h = buildHarness();
  h.fake.seedAudit({ isInvestigationMode: !!opts.investigation });
  h.fake.seedPaper(opts.paper);
  if (opts.withS2 !== false) h.fake.seedSection();
  const accessPrisma: any = {
    audit: { findFirst: async ({ where }: any) => (where.organizationId === 'org1' && where.id === 'aud1'
      ? { id: 'aud1', isInvestigationMode: !!opts.investigation, team: (opts.team ?? []).map((userId) => ({ userId })) } : null) },
  };
  const adapter = new InterviewSignatureAdapter(h.prisma as any, h.registry, new AuditInvestigationAccessService(accessPrisma));
  adapter.onModuleInit();

  const request = (id: string) => h.fake.requests.find((r) => r.id === id)!;
  const section = () => h.fake.tables.paperSection[0];
  const send = async (payload: Record<string, unknown> = {}, over: Record<string, unknown> = {}, u = auditor) => {
    const out = await h.requests.create(u, {
      documentType: 'INTERVIEW_RECORD', targetId: 'wp1', signerName: 'Carlos Entrevistado', signerEmail: 'carlos@cliente.com',
      signerRole: 'Jefe de Tesorería', payload: { ...PAYLOAD(), ...payload }, ...over,
    } as any, INFO);
    return { id: out.request.id as string, token: h.tokenOf(out.signUrl), out };
  };
  const signAs = async (token: string, response: Record<string, unknown>, extra: Record<string, unknown> = {}) => {
    const session = await h.openSession(token);
    const spy = jest.spyOn(h.sealing, 'sealRequest').mockResolvedValue('SKIPPED');
    try { return await h.public.sign(token, session, { signedName: 'Carlos Entrevistado', consent: true, response, ...extra } as any, INFO); }
    finally { spy.mockRestore(); }
  };
  return { h, adapter, request, section, send, signAs };
}

afterEach(() => jest.restoreAllMocks());

describe('Acta de entrevista · enviar a firma', () => {
  it('PDF con todo escapado y los datos de la sesión; el acta queda en la solicitud (inmutable) y ligada al encargo', async () => {
    const { h, request, send } = setup();
    const { id } = await send({ interviewers: 'Ana <script>x</script> Auditora', confidentialityNote: 'Reservado & confidencial' });

    const body = h.pdf.lastBody;
    expect(body).toContain('Carlos Entrevistado');
    expect(body).toContain('Jefe de Tesorería');
    expect(body).toContain('Virtual — Teams');
    expect(body).toContain('Ana &lt;script&gt;x&lt;/script&gt; Auditora'); // el HTML no se interpreta
    expect(body).not.toContain('<script>');
    expect(body).toContain('Reservado &amp; confidencial');
    expect(body).toContain('El entrevistado explicó el proceso');
    expect(body).toContain('PT-ENTREV');
    expect(body).toContain('Conformidad del entrevistado');

    const r = request(id);
    expect(r).toMatchObject({ documentType: 'INTERVIEW_RECORD', targetId: 'wp1', auditId: 'aud1', status: 'PENDING' });
    expect(r.title).toBe('Acta de entrevista — Carlos Entrevistado');
    expect(r.payload).toMatchObject({ modality: 'VIRTUAL', content: CONTENT, intervieweeName: 'Carlos Entrevistado', intervieweeRole: 'Jefe de Tesorería', paperCode: 'PT-ENTREV' });
    expect(r.expiresAt.getTime() - Date.now()).toBeLessThan(15.1 * 864e5);
  });

  it('solo desde un papel de entrevista, de la propia organización, con datos válidos; no deja nada a medias', async () => {
    const { h, send } = setup();
    await expect(send({}, { targetId: 'no-existe' })).rejects.toBeInstanceOf(NotFoundException);
    await expect(send({}, {}, user('AUDITOR', 'u9', 'org2'))).rejects.toBeInstanceOf(NotFoundException);
    await expect(send({}, {}, user('READ_ONLY'))).rejects.toBeInstanceOf(ForbiddenException);
    await expect(send({ content: 'corto' })).rejects.toThrow(/muy corto/);
    await expect(send({ modality: 'POR_CARTA' })).rejects.toThrow(/modalidad/);
    expect(h.fake.requests).toHaveLength(0);

    const other = setup({ paper: { paperCode: 'PT-FIN-C-SUST', type: 'SUBSTANTIVE_TEST', code: 'C-1' } });
    await expect(other.send()).rejects.toBeInstanceOf(BadRequestException);
    await expect(other.send()).rejects.toThrow(/papel de entrevista/);
  });

  it('también admiten acta los papeles de tipo entrevista y los B-INT-*', async () => {
    await expect(setup({ paper: { paperCode: null, type: 'INTERVIEW', code: 'E-9' } }).send()).resolves.toBeDefined();
    await expect(setup({ paper: { paperCode: 'B-INT-02', type: 'CONTROL_EVALUATION', code: 'B-INT-02' } }).send()).resolves.toBeDefined();
  });

  it('el papel no cambia al enviar: el acta vive en la solicitud', async () => {
    const { h, section, send } = setup();
    const before = JSON.stringify(h.fake.tables.workingPaper);
    await send();
    expect(JSON.stringify(h.fake.tables.workingPaper)).toBe(before);
    expect(section().attachments).toBeNull();
  });
});

describe('Acta de entrevista · firma presencial', () => {
  it('sin correo con el enlace: el auditor abre el enlace y el código igual llega al correo del entrevistado', async () => {
    const { h, request, send, signAs } = setup();
    const { id, token, out } = await send({}, { sendEmail: false });
    expect(out).toMatchObject({ emailSent: false, emailSkipped: true });
    expect(h.email.sendSignatureRequest).not.toHaveBeenCalled();
    expect(request(id).reminderEnabled).toBe(false);

    const r = await signAs(token, { conforme: true });
    expect(r.status).toBe('SIGNED');
    expect(h.email.sendSignatureOtp).toHaveBeenCalledTimes(1);
    expect(h.email.sendSignatureOtp.mock.calls[0][0]).toBe('carlos@cliente.com'); // el código va al entrevistado, no al auditor
  });

  it('abrir para firma presencial una solicitud ya enviada rota el enlace sin enviar correo', async () => {
    const { h, send } = setup();
    const { id, token } = await send();
    h.email.sendSignatureRequest.mockClear();
    const r = await h.requests.inPerson(auditor, id, {} as any, INFO);
    expect(h.tokenOf(r.signUrl)).not.toBe(token);
    expect(h.email.sendSignatureRequest).not.toHaveBeenCalled();
    await expect(h.public.sendOtp(token, INFO)).rejects.toBeDefined();
  });
});

describe('Acta de entrevista · el entrevistado firma', () => {
  it('conforme: queda firmada (sin cargo obligatorio) y la respuesta guardada', async () => {
    const { request, send, signAs } = setup();
    const { id, token } = await send();
    const r = await signAs(token, { conforme: true, observations: 'Todo correcto.' });
    expect(r.status).toBe('SIGNED');
    expect(request(id)).toMatchObject({ status: 'SIGNED', signedName: 'Carlos Entrevistado', response: { conforme: true, observations: 'Todo correcto.' } });
  });

  it('el formulario: conforme obligatorio; observaciones obligatorias solo si NO está conforme; sin cargo ni adjuntos', async () => {
    const { h, send } = setup();
    const { token } = await send();
    const doc: any = await h.public.getDocument(token, await h.openSession(token));
    expect(doc.form).toMatchObject({ allowAttachments: false, signedRoleRequired: false });
    expect(doc.form.fields[0]).toMatchObject({ key: 'conforme', type: 'boolean', required: true });
    expect(doc.form.fields[1]).toMatchObject({ key: 'observations', type: 'textarea', requiredIf: { field: 'conforme', equals: false } });
  });

  it('la respuesta se valida en el servidor y nada cambia si es inválida', async () => {
    const { h, request, send } = setup();
    const { id, token } = await send();
    const session = await h.openSession(token);
    const sign = (response: unknown) => h.public.sign(token, session, { signedName: 'Carlos Entrevistado', consent: true, response } as any, INFO);
    await expect(sign({})).rejects.toThrow(/Indica si estás conforme/);
    await expect(sign({ conforme: 'true' })).rejects.toThrow(/Indica si estás conforme/);
    await expect(sign({ conforme: false })).rejects.toThrow(/escribe tus observaciones/);
    await expect(sign({ conforme: true, aprobado: true })).rejects.toThrow(/no corresponden/);
    expect(request(id).status).toBe('VIEWED'); // abrió el documento pero no firmó
    expect(request(id).signedAt).toBeNull();
  });

  it('no conforme con observaciones queda firmada y se deja constancia; rechazar no toca el papel', async () => {
    const { h, request, section, send, signAs } = setup();
    const a = await send();
    await signAs(a.token, { conforme: false, observations: 'Falta la reunión del lunes.' });
    expect(request(a.id).response).toEqual({ conforme: false, observations: 'Falta la reunión del lunes.' });

    const b = await send();
    await h.public.decline(b.token, await h.openSession(b.token), { reason: 'No quiero firmar sin consultar a mi abogado.' } as any, INFO);
    expect(request(b.id)).toMatchObject({ status: 'DECLINED', declineReason: 'No quiero firmar sin consultar a mi abogado.' });
    expect(section().attachments).toBeNull();
  });
});

describe('Acta de entrevista · sellado: el PDF firmado pasa a la sección S2', () => {
  const sealed = async (ctx: ReturnType<typeof setup>) => {
    const { id, token } = await ctx.send();
    await ctx.signAs(token, { conforme: true });
    await new Promise((r) => setImmediate(r));
    expect(await ctx.h.sealing.sealRequest(id)).toBe('SEALED');
    await new Promise((r) => setImmediate(r));
    return id;
  };
  const withEnv = async (fn: () => Promise<void>) => {
    const prev = process.env.SUPABASE_URL;
    process.env.SUPABASE_URL = 'https://proyecto.supabase.co';
    try { await fn(); } finally { if (prev === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = prev; }
  };

  it('se agrega como adjunto con su URL canónica y el origen «firma-externa»', async () => {
    await withEnv(async () => {
      const ctx = setup();
      const id = await sealed(ctx);
      expect(ctx.section().attachments).toHaveLength(1);
      expect(ctx.section().attachments[0]).toMatchObject({
        id: `sig_${id}`, filename: 'Acta firmada - Carlos Entrevistado.pdf', mimeType: 'application/pdf', source: 'firma-externa', signatureRequestId: id,
        url: `https://proyecto.supabase.co/storage/v1/object/public/audit-files/signature-requests/aud1/${id}/signed.pdf`,
      });
      expect(ctx.section().attachments[0].size).toBeGreaterThan(0);
      expect(ctx.section().attachments[0].uploadedAt).toEqual(expect.any(String));
    });
  });

  it('conserva los adjuntos que ya tenía la sección y no se duplica si el sellado se repite (sello de tiempo)', async () => {
    await withEnv(async () => {
      const ctx = setup();
      ctx.section().attachments = [{ id: 'att_1', filename: 'consentimiento.pdf', url: 'https://x/c.pdf' }];
      const id = await sealed(ctx);
      const req = ctx.request(id);
      await ctx.adapter.afterSealed(req as any, req.signedPdfPath, Buffer.from('%PDF-otra-version'));
      const list = ctx.section().attachments;
      expect(list.map((a: any) => a.id)).toEqual(['att_1', `sig_${id}`]);
      expect(list[1].size).toBe(Buffer.from('%PDF-otra-version').length); // actualizado, no repetido
    });
  });

  it('un papel sin sección S2 se omite sin error: el acta queda solo en el panel', async () => {
    await withEnv(async () => {
      const ctx = setup({ withS2: false });
      await expect(sealed(ctx)).resolves.toBeDefined();
      expect(ctx.h.fake.tables.paperSection).toHaveLength(0);
    });
  });

  it('solo se toca la sección S2 del papel del acta, no otras secciones', async () => {
    await withEnv(async () => {
      const ctx = setup();
      ctx.h.fake.seedSection({ sectionKey: 'S1', label: 'Planificación' });
      ctx.h.fake.seedSection({ paperId: 'otro-papel', sectionKey: 'S2' });
      await sealed(ctx);
      const byKey = (paperId: string, key: string) => ctx.h.fake.tables.paperSection.find((s) => s.paperId === paperId && s.sectionKey === key);
      expect(byKey('wp1', 'S2')!.attachments).toHaveLength(1);
      expect(byKey('wp1', 'S1')!.attachments).toBeNull();
      expect(byKey('otro-papel', 'S2')!.attachments).toBeNull();
    });
  });
});

describe('Acta de entrevista · modo investigación', () => {
  it('solo el equipo del encargo (y CAE, ADMIN, SUPER_ADMIN) puede enviar, ver o gestionar; el resto recibe 403', async () => {
    const ctx = setup({ investigation: true, team: ['u-team'] });
    const outsider = user('AUDIT_MANAGER', 'u-fuera');
    await expect(ctx.send({}, {}, outsider)).rejects.toThrow(/modo investigación/);
    expect(ctx.h.fake.requests).toHaveLength(0);

    const member = user('AUDITOR', 'u-team');
    const { id } = await ctx.send({}, {}, member);
    await expect(ctx.h.requests.list(outsider, 'INTERVIEW_RECORD' as any, 'wp1')).rejects.toThrow(/modo investigación/);
    await expect(ctx.h.requests.get(outsider, id)).rejects.toThrow(/modo investigación/);
    await expect(ctx.h.requests.inPerson(outsider, id, {} as any, INFO)).rejects.toThrow(/modo investigación/);
    await expect(ctx.h.requests.revoke(outsider, id, 'motivo suficiente', INFO)).rejects.toThrow(/modo investigación/);
    expect(await ctx.h.requests.list(member, 'INTERVIEW_RECORD' as any, 'wp1')).toHaveLength(1);
    for (const role of ['CAE', 'ADMIN', 'SUPER_ADMIN']) expect(await ctx.h.requests.list(user(role, `u-${role}`), 'INTERVIEW_RECORD' as any, 'wp1')).toHaveLength(1);
  });
});

describe('Acta de entrevista · registro del tipo', () => {
  it('queda registrado con su rol mínimo, etiqueta, plazo y sin adjuntos', () => {
    expect(setup().h.registry.find('INTERVIEW_RECORD')).toMatchObject({ minRole: 'AUDITOR', label: 'Acta de entrevista', defaultExpiryDays: 15, allowsAttachments: false });
  });
});
