/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { PbcPortalService } from './pbc-portal.service';
import { PbcService } from './pbc.service';
import { generateToken, hashToken } from '../signatures/signature-crypto.util';

/**
 * Portal PBC · código por correo contra un Postgres REAL (los contadores de intentos y la sesión dependen de bloquear la
 * fila de la solicitud: una base falsa no puede probar eso). Se omite sola si no hay base de pruebas.
 *   docker run -d --name auditmind-cobros-test -e POSTGRES_PASSWORD=test -e POSTGRES_DB=cobros_test -p 54329:5432 postgres:17-alpine
 *   (aplicar el esquema base + 2026-10-pbc-portal-otp.sql — ver docs/portal-pbc-codigo-por-correo.md §7)
 *   COLLECTIONS_TEST_DATABASE_URL=postgresql://postgres:test@localhost:54329/cobros_test npx jest pbc-portal.integration
 */
const URL = process.env.COLLECTIONS_TEST_DATABASE_URL;
const suite = URL ? describe : describe.skip;
jest.setTimeout(120_000);

suite('portal PBC contra Postgres real', () => {
  let prisma: PrismaClient;
  let portal: PbcPortalService;
  let team: PbcService;
  const codes: string[] = [];
  let emailsSent = 0;
  const INFO = { ip: '203.0.113.7', userAgent: 'Jest' };
  const KEY = 'clave-maestra-de-prueba-0123456789';

  beforeAll(async () => {
    const sep = (URL as string).includes('?') ? '&' : '?';
    prisma = new PrismaClient({ datasourceUrl: `${URL}${sep}connection_limit=12&pool_timeout=30` });
    await prisma.$connect();
    const config: any = { get: (k: string, d?: string) => (k === 'ENCRYPTION_KEY' ? KEY : d) };
    const email: any = {
      sendPbcPortalOtp: async (_to: string, p: { code: string }) => { codes.push(p.code); emailsSent++; return { sent: true }; },
      sendPbcPortalLockedAlert: async () => ({ sent: true }),
      portalUrl: (t: string) => `https://app.test/portal#${t}`,
    };
    portal = new PbcPortalService(prisma as any, config, email);
    team = new PbcService(prisma as any, config, email);
  });
  afterAll(async () => { await prisma?.$disconnect(); });
  beforeEach(() => { codes.length = 0; emailsSent = 0; });

  let seq = 0;
  async function seed() {
    const tag = `${Date.now().toString(36)}${(seq++).toString(36)}${randomUUID().slice(0, 6)}`;
    const org = await prisma.organization.create({ data: { name: `Org ${tag}`, slug: `org-${tag}` } });
    const user = await prisma.user.create({ data: { organizationId: org.id, supabaseUserId: randomUUID(), email: `u-${tag}@t.test`, name: 'Creador', role: 'AUDITOR' } });
    const audit = await prisma.audit.create({ data: { organizationId: org.id, title: 'Auditoría de prueba', type: 'EXTERNAL' } });
    const token = generateToken();
    const request = await prisma.pbcRequest.create({
      data: {
        auditId: audit.id, organizationId: org.id, title: 'Estados de cuenta', description: 'x', requestedToEmail: 'juan@cliente.com', requestedToName: 'Juan',
        dueDate: new Date(Date.now() + 30 * 86400e3), portalTokenHash: hashToken(token), portalTokenEncrypted: 'x.y.z',
        portalTokenExpiresAt: new Date(Date.now() + 60 * 86400e3), createdById: user.id,
      },
    });
    const au: any = { id: user.id, organizationId: org.id, role: 'AUDITOR', email: user.email, name: user.name };
    return { org, user, au, audit, request, token };
  }
  const settle = (ps: Promise<unknown>[]) => Promise.allSettled(ps);
  const wrong = () => { let c = '000000'; while (codes.at(-1) === c) c = '999999'; return c; };

  it('20 verificaciones incorrectas simultáneas cuentan exactamente 5 fallos (no se pierden incrementos) y queman el código', async () => {
    const { request, token } = await seed();
    await portal.sendOtp(token, INFO);
    const bad = wrong();
    const rs = await settle(Array.from({ length: 20 }, () => portal.verifyOtp(token, bad, INFO)));
    expect(rs.every((r) => r.status === 'rejected')).toBe(true);
    const row = await prisma.pbcRequest.findUniqueOrThrow({ where: { id: request.id } });
    expect(row.portalOtpAttempts).toBe(5);
    expect(row.portalOtpFailuresHour).toBe(5);
    expect(row.portalOtpHash).toBeNull();
    expect(await prisma.pbcPortalEvent.count({ where: { requestId: request.id, type: 'OTP_FAILED' } })).toBe(5);
    // el código correcto ya no abre nada: se quemó
    await expect(portal.verifyOtp(token, codes[0], INFO)).rejects.toThrow(/venció o no se solicitó/);
  });

  it('el mismo código correcto enviado 8 veces a la vez abre UNA sola sesión', async () => {
    const { request, token } = await seed();
    await portal.sendOtp(token, INFO);
    const rs = await settle(Array.from({ length: 8 }, () => portal.verifyOtp(token, codes[0], INFO)));
    expect(rs.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await prisma.pbcPortalSession.count({ where: { requestId: request.id } })).toBe(1);
    expect(await prisma.pbcPortalEvent.count({ where: { requestId: request.id, type: 'SESSION_STARTED' } })).toBe(1);
  });

  it('pedir 8 códigos a la vez envía UNO solo (la espera de 60 s se respeta aun en paralelo)', async () => {
    const { request, token } = await seed();
    const rs = await settle(Array.from({ length: 8 }, () => portal.sendOtp(token, INFO)));
    expect(rs.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(emailsSent).toBe(1);
    expect(await prisma.pbcPortalEvent.count({ where: { requestId: request.id, type: 'OTP_SENT' } })).toBe(1);
  });

  it('guarda solo el HMAC, abre sesión y el flujo completo lee/escribe/envía solo con sesión', async () => {
    const { request, token } = await seed();
    await portal.sendOtp(token, INFO);
    const row = await prisma.pbcRequest.findUniqueOrThrow({ where: { id: request.id } });
    expect(row.portalOtpHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(row)).not.toContain(codes[0]);
    await expect(portal.getRequest(token, generateToken())).rejects.toThrow(/Verifica tu correo/);
    const { sessionToken } = await portal.verifyOtp(token, codes[0], INFO);
    expect((await portal.getRequest(token, sessionToken) as any).title).toBe('Estados de cuenta');
    await portal.addMessage(token, sessionToken, 'Adjunto los estados', ['estados.pdf']);
    await portal.submit(token, sessionToken, ['estados.pdf'], 'listo');
    expect((await prisma.pbcRequest.findUniqueOrThrow({ where: { id: request.id } })).status).toBe('SUBMITTED');
    expect(await prisma.pbcMessage.count({ where: { requestId: request.id, isAuditor: false } })).toBe(2);
  });

  it('10 fallos en la hora bloquean; con el tercer bloqueo el enlace queda inservible y regenerar lo restablece', async () => {
    const { request, token, au } = await seed();
    const lockOnce = async () => {
      await portal.sendOtp(token, INFO);
      for (let i = 0; i < 5; i++) await portal.verifyOtp(token, wrong(), INFO).catch(() => undefined);
      await prisma.pbcRequest.update({ where: { id: request.id }, data: { portalOtpLastSentAt: new Date(Date.now() - 120_000) } }); // salta la espera de 60 s
      await portal.sendOtp(token, INFO);
      for (let i = 0; i < 5; i++) await portal.verifyOtp(token, wrong(), INFO).catch(() => undefined);
    };
    for (let lock = 1; lock <= 3; lock++) {
      await lockOnce();
      expect((await prisma.pbcRequest.findUniqueOrThrow({ where: { id: request.id } })).portalLockCount).toBe(lock);
      // se vence el bloqueo de 1 hora y se reinicia la ventana para el siguiente intento
      await prisma.pbcRequest.update({ where: { id: request.id }, data: { portalLockedUntil: new Date(Date.now() - 1000), portalOtpWindowStart: new Date(Date.now() - 2 * 3600e3), portalOtpLastSentAt: new Date(Date.now() - 120_000) } });
      await prisma.pbcPortalEvent.deleteMany({ where: { requestId: request.id, type: 'OTP_SENT' } }); // para no chocar con el tope de 10 códigos por día
    }
    await expect(portal.sendOtp(token, INFO)).rejects.toThrow(/se bloqueó por demasiados intentos/);
    const regen = await team.regenerateToken(request.id, au);
    const fresh = await prisma.pbcRequest.findUniqueOrThrow({ where: { id: request.id } });
    expect(fresh.portalLockCount).toBe(0);
    await expect(portal.sendOtp(token, INFO)).rejects.toThrow(/no encontrada o token inválido/); // el enlace viejo ya no existe
    await expect(portal.sendOtp(regen.portalUrl.split('#')[1], INFO)).resolves.toMatchObject({ sent: true });
  });

  it('las tablas nuevas nacen con RLS y sin permisos para anon/authenticated', async () => {
    const [row] = await prisma.$queryRaw<any[]>`
      SELECT bool_and(c.relrowsecurity) AS rls,
             bool_or(has_table_privilege('anon', c.oid, 'SELECT') OR has_table_privilege('authenticated', c.oid, 'SELECT')) AS leaked
      FROM pg_class c WHERE c.relname IN ('pbc_portal_sessions', 'pbc_portal_events')`;
    expect(row.rls).toBe(true);
    expect(row.leaked).toBe(false);
  });
});
