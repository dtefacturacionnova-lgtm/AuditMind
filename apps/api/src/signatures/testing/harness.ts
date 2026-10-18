/* eslint-disable @typescript-eslint/no-explicit-any */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PDFDocument } from 'pdf-lib';
import { AuthUser } from '../../auth/jwt.strategy';
import { PrismaService } from '../../prisma/prisma.service';
import { FakeDb } from './fake-db';
import { SignatureAdapterRegistry, SignatureDocumentAdapter } from '../signature-documents';
import { SignatureEventsService } from '../signature-events.service';
import { SignaturePolicyService } from '../signature-policy.service';
import { SignatureAttachmentsService } from '../signature-attachments.service';
import { SignatureSealingService } from '../signature-sealing.service';
import { SignatureRequestsService } from '../signature-requests.service';
import { SignaturePublicService } from '../signature-public.service';
import { SignatureScheduler } from '../signature-scheduler';

/** PDF real y mínimo (pdf-lib lo puede volver a abrir y contar sus páginas). */
export async function makePdf(pages = 1): Promise<Buffer> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage();
  return Buffer.from(await doc.save());
}

export class FakeStorage {
  files = new Map<string, Buffer>();
  async upload(path: string, data: Buffer, _ct: string, upsert = false) {
    if (this.files.has(path) && !upsert) throw new Error(`ya existe ${path}`);
    this.files.set(path, Buffer.from(data));
  }
  async download(path: string) {
    const f = this.files.get(path);
    if (!f) throw new Error(`no existe ${path}`);
    return Buffer.from(f);
  }
  async remove(paths: string[]) { for (const p of paths) this.files.delete(p); }
  async signedUrl(path: string) { return `https://storage.test/sign/${path}?token=t`; }
  async listAll(prefix: string) { return [...this.files.keys()].filter((k) => k.startsWith(prefix)); }
}

export class FakePdf {
  lastBody = '';
  calls = 0;
  async generateBranded(opts: { title: string; body: string }) { this.lastBody = opts.body; this.calls++; return makePdf(1); }
}

export class FakePdfTools {
  failTsa = new Set<string>();
  signCalls: Array<{ name: string; pageNumber?: number }> = [];
  tsaCalls: string[] = [];
  async sanitizePdf(b: Buffer) { return b; }
  async imageToPdf() { return makePdf(1); }
  async mergePdfs(files: Array<{ buffer: Buffer }>) {
    const out = await PDFDocument.create();
    for (const f of files) {
      const src = await PDFDocument.load(f.buffer);
      for (const p of await out.copyPages(src, src.getPageIndices())) out.addPage(p);
    }
    return Buffer.from(await out.save());
  }
  async signPdf(b: Buffer, _n: string, _c: unknown, opts: { name: string; pageNumber?: number }) {
    this.signCalls.push({ name: opts.name, pageNumber: opts.pageNumber });
    return Buffer.concat([b, Buffer.from('\n%SIGNED')]);
  }
  async timestampPdf(b: Buffer, _n: string, tsa: string) {
    this.tsaCalls.push(tsa);
    if (this.failTsa.has(tsa)) throw new Error(`TSA ${tsa} caída`);
    return Buffer.concat([b, Buffer.from(`\n%TS:${tsa}`)]);
  }
}

export class FakeClam {
  result: any = { status: 'CLEAN' };
  scans = 0;
  async scan() { this.scans++; return this.result; }
  async ping() { return true; }
}

export const OTP_KEY = 'una-clave-maestra-de-prueba-32-chars!';

export function makeConfig(env: Record<string, string> = {}) {
  const values: Record<string, string> = { SIGNATURES_PUBLIC_ENABLED: 'true', ENCRYPTION_KEY: OTP_KEY, ...env };
  return { get: (k: string, d?: string) => values[k] ?? d } as any;
}

export function makeEmail() {
  const ok = async () => ({ sent: true, emailId: 'e1' });
  const m: any = {};
  for (const n of ['sendSignatureRequest', 'sendSignatureReminder', 'sendSignatureOtp', 'sendSignatureCompleted',
    'sendSignatureOutcome', 'sendSignatureSealFailed', 'sendSignatureIntegrityAlert']) m[n] = jest.fn(ok);
  m.signUrl = (t: string) => `https://app.test/firmar#${t}`;
  m.verifyUrl = () => 'https://app.test/verificar';
  m.panelUrl = (p: string) => `https://app.test${p}`;
  return m;
}

/** Adaptador de prueba con la forma de la confirmación externa; registra cada gancho que se dispara. */
export function makeAdapter(over: Partial<SignatureDocumentAdapter> = {}) {
  const calls: { created: any[]; signed: any[]; declined: any[]; revoked: any[]; sealed: any[] } = { created: [], signed: [], declined: [], revoked: [], sealed: [] };
  const adapter: SignatureDocumentAdapter & { calls: typeof calls } = {
    type: 'EXTERNAL_CONFIRMATION',
    minRole: 'AUDITOR',
    label: 'Confirmación externa (NIA 505)',
    defaultExpiryDays: 15,
    allowsAttachments: true,
    calls,
    async prepare(ctx) {
      if (ctx.targetId === 'missing') throw new NotFoundException('Confirmación no encontrada');
      return { auditId: 'aud1', title: `Confirmación ${ctx.targetId}`, subtitle: 'Banco Cuscatlán', bodyHtml: '<p>cuerpo</p>', payload: { mode: 'POSITIVE_WITH_AMOUNT' } };
    },
    validateResponse(_p, response) {
      const r = (response ?? {}) as Record<string, unknown>;
      if (typeof r.agrees !== 'boolean') throw new BadRequestException('Indica si estás de acuerdo.');
      return { agrees: r.agrees, comments: String(r.comments ?? '') };
    },
    buildForm: () => ({ fields: [{ key: 'agrees', label: '¿De acuerdo?', type: 'boolean', required: true }], allowAttachments: true, signedRoleRequired: true }),
    summarizeResponse: (_p, r) => [['Respuesta', r.agrees ? 'De acuerdo' : 'En desacuerdo']],
    async onCreated(_tx, req) { calls.created.push(req.id); },
    async onSigned(_tx, ctx) { calls.signed.push(ctx); },
    async onDeclined(_tx, req, reason) { calls.declined.push({ id: req.id, reason }); },
    async onRevoked(_tx, req, reason) { calls.revoked.push({ id: req.id, reason }); },
    async afterSealed(req, path) { calls.sealed.push({ id: req.id, path }); },
    ...over,
  };
  return adapter;
}

export const INFO = { ip: '203.0.113.7', userAgent: 'Jest/1.0' };

export function user(role = 'AUDITOR', id = 'u1', org = 'org1'): AuthUser {
  return { id, supabaseUserId: 's', email: 'auditor@despacho.com', name: 'Ana Auditora', role, organizationId: org, aiAssistantPersonality: 'x' } as AuthUser;
}

/** Arma TODOS los servicios con colaboradores falsos. Cada prueba usa el suyo. */
export function buildHarness(env: Record<string, string> = {}) {
  const fake = new FakeDb();
  fake.seedOrg('org1'); fake.seedOrg('org2', 'Otro Despacho'); fake.seedUser('u1');
  const prisma = fake.client as unknown as PrismaService;
  const config = makeConfig(env);
  const policy = new SignaturePolicyService(config, prisma);
  const events = new SignatureEventsService(prisma);
  const storage = new FakeStorage();
  const clam = new FakeClam();
  const pdf = new FakePdf();
  const pdfTools = new FakePdfTools();
  const email = makeEmail();
  const adapter = makeAdapter();
  const registry = new SignatureAdapterRegistry();
  registry.register(adapter);
  const orgSeal: any = {
    getOrCreateSeal: jest.fn(async (orgId: string) => ({ certPem: 'CERT', privateKeyPem: 'KEY', fingerprintSha256: 'AA:BB', organizationName: orgId })),
    getFingerprintIfExists: jest.fn(async () => 'AA:BB'),
  };
  const attachments = new SignatureAttachmentsService(prisma, storage as any, events, clam as any, pdfTools as any);
  const sealing = new SignatureSealingService(prisma, storage as any, events, pdf as any, pdfTools as any, orgSeal, email, registry, config);
  const requests = new SignatureRequestsService(prisma, events, storage as any, attachments, sealing, registry, policy, pdf as any, pdfTools as any, email);
  const publicSvc = new SignaturePublicService(prisma, events, storage as any, attachments, sealing, orgSeal, registry, policy, email);
  const scheduler = new SignatureScheduler(prisma, events, sealing, attachments, policy, email, registry);

  const tokenOf = (signUrl: string) => signUrl.split('#')[1];
  const lastOtp = (): string => email.sendSignatureOtp.mock.calls.at(-1)[1].code;

  return {
    fake, prisma, config, policy, events, storage, clam, pdf, pdfTools, email, adapter, registry, orgSeal, attachments,
    sealing, requests, public: publicSvc, scheduler, tokenOf, lastOtp,

    /** Crea una solicitud de firma por la vía real y devuelve su id y su token. */
    async create(over: Record<string, unknown> = {}, u: AuthUser = user('AUDITOR')) {
      const out = await requests.create(u, { documentType: 'EXTERNAL_CONFIRMATION', targetId: 'conf1', signerName: 'Juan Pérez', signerEmail: 'juan@banco.com', signerRole: 'Gerente', ...over } as any, INFO);
      return { id: out.request.id as string, token: tokenOf(out.signUrl), out };
    },
    /** Pide el código, lo verifica y devuelve la sesión. */
    async openSession(token: string) {
      await publicSvc.sendOtp(token, INFO);
      const v = await publicSvc.verifyOtp(token, lastOtp(), INFO);
      return v.sessionToken;
    },
    async openSignedRequest() {
      const c = await this.create();
      const session = await this.openSession(c.token);
      jest.spyOn(sealing, 'sealRequest').mockResolvedValue('SKIPPED'); // no sellar en segundo plano
      const signed = await publicSvc.sign(c.token, session, { signedName: 'Juan Pérez', signedRole: 'Gerente', consent: true, response: { agrees: true, comments: 'ok' } } as any, INFO);
      (sealing.sealRequest as jest.Mock).mockRestore();
      return { ...c, session, signed };
    },
  };
}

/** Reloj controlado: solo se falsea Date (el resto del tiempo real sigue funcionando). */
export function useClock(start = '2026-10-18T12:00:00.000Z') {
  jest.useFakeTimers({ now: new Date(start), doNotFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'clearImmediate', 'nextTick', 'queueMicrotask', 'performance', 'hrtime'] });
  return {
    advance: (ms: number) => jest.setSystemTime(new Date(Date.now() + ms)),
    restore: () => jest.useRealTimers(),
  };
}
