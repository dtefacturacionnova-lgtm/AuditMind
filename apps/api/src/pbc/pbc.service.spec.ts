/* eslint-disable @typescript-eslint/no-explicit-any */
import { ConflictException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { PbcService, withoutPortalSecrets } from './pbc.service';
import { sha256Hex } from '../signatures/signature-crypto.util';

const KEY = 'clave-maestra-de-prueba-0123456789';
const ORG = 'org1';
const user = { id: 'u1', organizationId: ORG, email: 'a@x.com', name: 'Aud', role: 'AUDITOR' } as any;
const otherOrgUser = { ...user, organizationId: 'org2' } as any;

/** BD falsa en memoria: solo lo que usa PbcService. `audit` es la auditoría aud1 (modo investigación y equipo). */
function fakePrisma(audit: { isInvestigationMode: boolean; team: Array<{ userId: string }> } = { isInvestigationMode: false, team: [] }) {
  const rows: any[] = [];
  const messages: any[] = [];
  const sessions: any[] = [];
  let n = 0;
  const match = (r: any, where: any = {}) =>
    Object.entries(where).every(([k, v]) => (v && typeof v === 'object' && !(v instanceof Date) ? true : r[k] === v));
  const project = (r: any, select?: any) => {
    if (!select) return { ...r };
    const o: any = {};
    for (const k of Object.keys(select)) if (select[k] === true) o[k] = r[k];
    return o;
  };
  const prisma: any = {
    rows, messages, sessions,
    audit: { findFirst: async ({ where }: any) => (where.id === 'aud1' && where.organizationId === ORG ? { id: 'aud1', ...audit } : null) },
    pbcRequest: {
      create: async ({ data }: any) => { const r = { id: `p${++n}`, createdAt: new Date(), updatedAt: new Date(), fileUrls: [], ...data, audit: { id: data.auditId, title: 'Auditoría' } }; rows.push(r); return { ...r }; },
      findUnique: async ({ where, select }: any) => { const r = rows.find((x) => (where.id ? x.id === where.id : x.portalTokenHash === where.portalTokenHash)); return r ? project(r, select) : null; },
      findFirst: async ({ where, select }: any) => { const r = rows.find((x) => match(x, where)); return r ? project(r, select) : null; },
      findMany: async ({ where }: any) => rows.filter((x) => match(x, where)).map((r) => ({ ...r, messages: [] })),
      count: async () => rows.length,
      update: async ({ where, data, select }: any) => { const r = rows.find((x) => x.id === where.id)!; Object.assign(r, data); return project(r, select); },
    },
    pbcMessage: { create: async ({ data }: any) => { const m = { id: `m${messages.length + 1}`, ...data }; messages.push(m); return m; } },
    pbcPortalSession: {
      updateMany: async ({ where, data }: any) => {
        const hit = sessions.filter((s) => s.requestId === where.requestId && s.revokedAt === null);
        hit.forEach((s) => Object.assign(s, data));
        return { count: hit.length };
      },
    },
    $transaction: async (cb: any) => cb(prisma),
  };
  return prisma;
}

function makeService(env: Record<string, string> = { ENCRYPTION_KEY: KEY }, audit?: Parameters<typeof fakePrisma>[0]) {
  const prisma = fakePrisma(audit);
  const config = { get: (k: string, d?: string) => env[k] ?? d } as any;
  const email = { portalUrl: (t: string) => `https://app.test/portal#${t}` } as any;
  return { svc: new PbcService(prisma as any, config, email), prisma };
}
const tokenOf = (url: string) => url.split('#')[1];
const dto = { auditId: 'aud1', title: 'Estados de cuenta', assignedToEmail: 'a@b.com', dueDate: '2030-01-31' } as any;

describe('Portal PBC · el token no se guarda en claro', () => {
  it('crear guarda solo la huella y una copia cifrada, y NO devuelve ni una ni otra', async () => {
    const { svc, prisma } = makeService();
    const created: any = await svc.create(dto, user);
    const row = prisma.rows[0];
    expect(row.portalTokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(row.portalTokenEncrypted).toMatch(/^[^.]+\.[^.]+\.[^.]+$/); // iv.tag.datos
    expect('portalToken' in row).toBe(false);
    expect(created.portalTokenHash).toBeUndefined();
    expect(created.portalTokenEncrypted).toBeUndefined();
    expect(JSON.stringify(created)).not.toContain(row.portalTokenHash);
  });

  it('la huella guardada es el sha256 del token del enlace que luego se entrega (y el token no está en la fila)', async () => {
    const { svc, prisma } = makeService();
    await svc.create(dto, user);
    const { url } = await svc.getPortalLink(prisma.rows[0].id, user);
    const token = tokenOf(url);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(prisma.rows[0].portalTokenHash).toBe(sha256Hex(token));
    expect(JSON.stringify(prisma.rows[0])).not.toContain(token);
  });

  it('sin ENCRYPTION_KEY no se crea nada (en vez de guardar un token sin copia cifrada)', async () => {
    const { svc, prisma } = makeService({});
    await expect(svc.create(dto, user)).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(prisma.rows).toHaveLength(0);
  });

  it('los listados y el detalle del auditor nunca incluyen los campos del token', async () => {
    const { svc, prisma } = makeService();
    await svc.create(dto, user);
    prisma.rows[0].organizationId = ORG;
    const list: any = await svc.findAllForOrg(user);
    const detail: any = await svc.findOneForAuditor(prisma.rows[0].id, user);
    const byAudit: any = await svc.findAllForAudit('aud1', user);
    for (const x of [list.data[0], detail, byAudit[0]]) {
      expect(x.portalTokenHash).toBeUndefined();
      expect(x.portalTokenEncrypted).toBeUndefined();
    }
  });

  it('withoutPortalSecrets quita el token y el estado del código por correo, y nada más', () => {
    expect(withoutPortalSecrets({
      id: 1, title: 't', status: 'PENDING', portalTokenExpiresAt: 'vence',
      portalTokenHash: 'h', portalTokenEncrypted: 'e', portalOtpHash: 'o', portalOtpExpiresAt: 'x', portalOtpAttempts: 2, portalOtpFailuresHour: 3,
      portalOtpWindowStart: 'w', portalOtpSentCount: 1, portalOtpLastSentAt: 'l', portalLockedUntil: 'u', portalLockCount: 1,
    })).toEqual({ id: 1, title: 't', status: 'PENDING', portalTokenExpiresAt: 'vence' });
  });

  it('el detalle del auditor trae solo el resumen del bloqueo, nunca el estado crudo del código', async () => {
    const { svc, prisma } = makeService();
    await svc.create(dto, user);
    Object.assign(prisma.rows[0], { organizationId: ORG, portalOtpHash: 'h', portalOtpAttempts: 3, portalLockCount: 3, portalLockedUntil: new Date(Date.now() + 1000) });
    const detail: any = await svc.findOneForAuditor(prisma.rows[0].id, user);
    expect(detail.portalLock).toEqual({ permanent: true, until: null });
    for (const f of ['portalOtpHash', 'portalOtpAttempts', 'portalLockCount', 'portalLockedUntil']) expect(detail[f]).toBeUndefined();
  });
});

describe('Portal PBC · rotación del enlace (el acceso con token y código se prueba en pbc-portal.service.spec.ts)', () => {
  async function withLink() {
    const ctx = makeService();
    await ctx.svc.create(dto, user);
    const id = ctx.prisma.rows[0].id;
    const { url } = await ctx.svc.getPortalLink(id, user);
    return { ...ctx, id, token: tokenOf(url) };
  }

  it('regenerar entrega el enlace nuevo UNA vez, cambia la huella y el equipo puede volver a copiarlo', async () => {
    const { svc, prisma, id, token } = await withLink();
    const before = prisma.rows[0].portalTokenHash;
    const r = await svc.regenerateToken(id, user);
    expect(r.portalUrl).toMatch(/^https:\/\/app\.test\/portal#[A-Za-z0-9_-]{43}$/);
    expect(prisma.rows[0].portalTokenHash).not.toBe(before);
    expect(prisma.rows[0].portalTokenHash).toBe(sha256Hex(tokenOf(r.portalUrl)));
    expect(prisma.rows[0].portalTokenHash).not.toBe(sha256Hex(token));
    expect((await svc.getPortalLink(id, user)).url).toBe(r.portalUrl);
  });

  it('regenerar reinicia el código, los contadores y los bloqueos, y revoca las sesiones abiertas', async () => {
    const { svc, prisma, id } = await withLink();
    Object.assign(prisma.rows[0], {
      portalOtpHash: 'h', portalOtpExpiresAt: new Date(), portalOtpAttempts: 4, portalOtpFailuresHour: 9, portalOtpWindowStart: new Date(),
      portalOtpSentCount: 5, portalOtpLastSentAt: new Date(), portalLockedUntil: new Date(Date.now() + 3600_000), portalLockCount: 3,
    });
    prisma.sessions.push({ id: 's1', requestId: id, revokedAt: null }, { id: 's2', requestId: id, revokedAt: null }, { id: 's3', requestId: 'otra', revokedAt: null });
    await svc.regenerateToken(id, user);
    expect(prisma.rows[0]).toMatchObject({
      portalOtpHash: null, portalOtpExpiresAt: null, portalOtpAttempts: 0, portalOtpFailuresHour: 0, portalOtpWindowStart: null,
      portalOtpSentCount: 0, portalOtpLastSentAt: null, portalLockedUntil: null, portalLockCount: 0,
    });
    expect(prisma.sessions.filter((s: any) => s.requestId === id).every((s: any) => s.revokedAt)).toBe(true);
    expect(prisma.sessions.find((s: any) => s.requestId === 'otra').revokedAt).toBeNull(); // las de otra solicitud no se tocan
  });
});

describe('Portal PBC · el equipo auditor y su organización', () => {
  it('«copiar enlace» y «regenerar» solo funcionan con solicitudes de la propia organización', async () => {
    const { svc, prisma } = makeService();
    await svc.create(dto, user);
    const id = prisma.rows[0].id;
    await expect(svc.getPortalLink(id, otherOrgUser)).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.regenerateToken(id, otherOrgUser)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.rows[0].portalTokenHash).toBeDefined();
  });

  it('una solicitud sin copia cifrada (o con una ilegible) pide regenerar, no revienta', async () => {
    const { svc, prisma } = makeService();
    await svc.create(dto, user);
    const id = prisma.rows[0].id;
    prisma.rows[0].portalTokenEncrypted = null;
    await expect(svc.getPortalLink(id, user)).rejects.toBeInstanceOf(ConflictException);
    prisma.rows[0].portalTokenEncrypted = 'basura.basura.basura';
    await expect(svc.getPortalLink(id, user)).rejects.toBeInstanceOf(ConflictException);
  });

  it('modo investigación: fuera del equipo nadie ve la solicitud, recupera ni regenera el enlace del auditado, ni escribe', async () => {
    const investigation = { isInvestigationMode: true, team: [{ userId: 'u2' }] };
    const { svc, prisma } = makeService({ ENCRYPTION_KEY: KEY }, investigation);
    const teamMember = { ...user, id: 'u2' };
    await svc.create(dto, teamMember);
    const id = prisma.rows[0].id;
    prisma.rows[0].organizationId = ORG;
    prisma.rows[0].audit = { ...prisma.rows[0].audit, organizationId: ORG };
    const before = prisma.rows[0].portalTokenHash;

    await expect(svc.create(dto, user)).rejects.toThrow(/modo investigación/);
    await expect(svc.findAllForAudit('aud1', user)).rejects.toThrow(/modo investigación/);
    await expect(svc.findOneForAuditor(id, user)).rejects.toThrow(/modo investigación/);
    await expect(svc.getPortalLink(id, user)).rejects.toThrow(/modo investigación/);
    await expect(svc.regenerateToken(id, user)).rejects.toThrow(/modo investigación/);
    await expect(svc.addAuditorMessage(id, user, 'hola')).rejects.toThrow(/modo investigación/);
    await expect(svc.review(id, 'ACCEPTED' as any, undefined, user)).rejects.toThrow(/modo investigación/);
    await expect(svc.getStats('aud1', user)).rejects.toThrow(/modo investigación/);
    expect(prisma.rows[0].portalTokenHash).toBe(before); // el enlace del auditado sigue intacto
    expect(prisma.messages).toHaveLength(0);

    // El equipo y CAE sí.
    await expect(svc.getPortalLink(id, teamMember)).resolves.toMatchObject({ url: expect.stringContaining('#') });
    await expect(svc.getPortalLink(id, { ...user, role: 'CAE' })).resolves.toBeDefined();
  });

  it('con otra ENCRYPTION_KEY la copia no se puede descifrar (la BD sola no revela el enlace)', async () => {
    const { svc, prisma } = makeService();
    await svc.create(dto, user);
    const other = new PbcService(prisma as any, { get: (k: string, d?: string) => (k === 'ENCRYPTION_KEY' ? 'otra-clave' : d) } as any, { portalUrl: (t: string) => t } as any);
    await expect(other.getPortalLink(prisma.rows[0].id, user)).rejects.toBeInstanceOf(ConflictException);
  });
});
