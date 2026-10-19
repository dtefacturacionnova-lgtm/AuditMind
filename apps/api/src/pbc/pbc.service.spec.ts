/* eslint-disable @typescript-eslint/no-explicit-any */
import { ConflictException, GoneException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
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
  let n = 0;
  const match = (r: any, where: any = {}) =>
    Object.entries(where).every(([k, v]) => (v && typeof v === 'object' && !(v instanceof Date) ? true : r[k] === v));
  const project = (r: any, select?: any) => {
    if (!select) return { ...r };
    const o: any = {};
    for (const k of Object.keys(select)) if (select[k] === true) o[k] = r[k];
    return o;
  };
  return {
    rows, messages,
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
  };
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

  it('withoutPortalSecrets quita solo esos dos campos', () => {
    expect(withoutPortalSecrets({ id: 1, title: 't', portalTokenHash: 'h', portalTokenEncrypted: 'e', status: 'PENDING' })).toEqual({ id: 1, title: 't', status: 'PENDING' });
  });
});

describe('Portal PBC · acceso con el token', () => {
  async function withLink() {
    const ctx = makeService();
    await ctx.svc.create(dto, user);
    const id = ctx.prisma.rows[0].id;
    const { url } = await ctx.svc.getPortalLink(id, user);
    return { ...ctx, id, token: tokenOf(url) };
  }

  it('el token correcto abre la solicitud', async () => {
    const { svc, token } = await withLink();
    expect((await svc.findByToken(token) as any).id).toBeDefined();
  });

  it('un token mal formado, vacío o ausente se descarta sin consultar la BD', async () => {
    const { svc, prisma } = await withLink();
    const spy = jest.spyOn(prisma.pbcRequest, 'findUnique');
    for (const bad of [undefined, '', 'corto', 'x'.repeat(44), `${'A'.repeat(42)}!`, 123, ['a']]) {
      await expect(svc.findByToken(bad)).rejects.toBeInstanceOf(NotFoundException);
      await expect(svc.addMessageByToken(bad, 'hola')).rejects.toBeInstanceOf(NotFoundException);
      await expect(svc.submitByToken(bad)).rejects.toBeInstanceOf(NotFoundException);
    }
    expect(spy).not.toHaveBeenCalled();
  });

  it('un token bien formado pero desconocido es 404; la huella (sha256) tampoco sirve como token', async () => {
    const { svc, prisma } = await withLink();
    await expect(svc.findByToken('Z'.repeat(43))).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.findByToken(prisma.rows[0].portalTokenHash.slice(0, 43))).rejects.toBeInstanceOf(NotFoundException);
  });

  it('regenerar entrega el enlace nuevo UNA vez y el anterior deja de servir', async () => {
    const { svc, prisma, id, token } = await withLink();
    const before = prisma.rows[0].portalTokenHash;
    const r = await svc.regenerateToken(id, user);
    expect(r.portalUrl).toMatch(/^https:\/\/app\.test\/portal#[A-Za-z0-9_-]{43}$/);
    expect(prisma.rows[0].portalTokenHash).not.toBe(before);
    await expect(svc.findByToken(token)).rejects.toBeInstanceOf(NotFoundException);
    expect((await svc.findByToken(tokenOf(r.portalUrl)) as any).id).toBe(id);
    expect((await svc.getPortalLink(id, user)).url).toBe(r.portalUrl); // el equipo puede volver a copiar el vigente
  });

  it('un enlace vencido responde 410', async () => {
    const { svc, prisma, token } = await withLink();
    prisma.rows[0].portalTokenExpiresAt = new Date(Date.now() - 1000);
    await expect(svc.findByToken(token)).rejects.toBeInstanceOf(GoneException);
    await expect(svc.addMessageByToken(token, 'hola')).rejects.toBeInstanceOf(GoneException);
  });

  it('el auditado puede escribir y enviar con el token; el envío repetido se rechaza', async () => {
    const { svc, prisma, token } = await withLink();
    await svc.addMessageByToken(token, 'Adjunto los estados', ['estados.pdf']);
    expect(prisma.messages).toHaveLength(1);
    await svc.submitByToken(token, ['estados.pdf'], 'listo');
    await expect(svc.submitByToken(token)).rejects.toThrow(/ya fue enviada/);
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
