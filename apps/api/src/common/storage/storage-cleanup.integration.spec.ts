/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';

process.env.SUPABASE_URL ??= 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'clave-de-prueba';

import { WorkingPapersService } from '../../working-papers/working-papers.service';
import { AuditProceduresService } from '../../audit-procedures/audit-procedures.service';

/**
 * Borrar un papel, un procedimiento o un paso borra también sus archivos de Storage (lote C, 2026-10-25). Antes se iban las filas y los
 * archivos quedaban sin dueño. El Storage es una base en memoria (la real es producción); las filas, un Postgres real.
 *
 *   COLLECTIONS_TEST_DATABASE_URL=postgresql://postgres:test@localhost:54329/cobros_test npx jest storage-cleanup
 */
const URL = process.env.COLLECTIONS_TEST_DATABASE_URL;
const suite = URL ? describe : describe.skip;
jest.setTimeout(120_000);

function fakeStorage(files: string[]) {
  const live = new Set(files);
  const bucket = {
    list: async (folder: string, o: { limit: number; offset: number }) => {
      const prefix = folder ? `${folder}/` : '';
      const names = new Map<string, boolean>();
      for (const f of live) {
        if (!f.startsWith(prefix)) continue;
        const [head, ...tail] = f.slice(prefix.length).split('/');
        names.set(head, tail.length === 0);
      }
      return { data: [...names.entries()].map(([name, isFile]) => ({ name, id: isFile ? `id-${name}` : null })).slice(o.offset, o.offset + o.limit), error: null };
    },
    remove: async (batch: string[]) => { batch.forEach((b) => live.delete(b)); return { data: batch.map((name) => ({ name })), error: null }; },
  };
  return { client: { storage: { from: () => bucket } } as any, live };
}

suite('limpieza de Storage al borrar (Postgres real)', () => {
  let prisma: PrismaClient;
  let user: any;
  let org: { id: string };
  let auditId: string;

  beforeAll(async () => {
    const sep = (URL as string).includes('?') ? '&' : '?';
    prisma = new PrismaClient({ datasourceUrl: `${URL}${sep}connection_limit=5&pool_timeout=30` });
    await prisma.$connect();
    const tag = `${Date.now().toString(36)}${randomUUID().slice(0, 6)}`;
    org = await prisma.organization.create({ data: { name: `Limpieza ${tag}`, slug: `limpieza-${tag}` } });
    const row = await prisma.user.create({ data: { organizationId: org.id, supabaseUserId: randomUUID(), email: `cae-${tag}@t.test`, name: 'cae', role: 'CAE' } });
    user = { id: row.id, supabaseUserId: row.supabaseUserId, email: row.email, name: row.name, role: row.role, organizationId: org.id, aiAssistantPersonality: 'ATHENA' };
    auditId = (await prisma.audit.create({ data: { organizationId: org.id, title: 'Auditoría', type: 'EXTERNAL', leadAuditorId: user.id } })).id;
  });
  afterAll(async () => { await prisma?.$disconnect(); });

  const mkPaper = async (code: string) => {
    const paper = await prisma.workingPaper.create({ data: { auditId, code, indexSection: 'A', title: 'Papel', type: 'PLANNING_UNDERSTANDING' as any } });
    const section = await prisma.paperSection.create({ data: { paperId: paper.id, sectionKey: 'S1', label: 'Procedimientos' } });
    const procedure = await prisma.auditProcedure.create({ data: { sectionId: section.id, refNumber: 'P-1', description: 'p' } });
    const step = await prisma.auditStep.create({ data: { procedureId: procedure.id, refNumber: 'P-1-A', description: 'a' } });
    return { paper, section, procedure, step };
  };

  it('borrar un papel borra los archivos de sus secciones, evidencia, cédulas y procedimientos, y solo los suyos', async () => {
    const a = await mkPaper('LC-a'); const b = await mkPaper('LC-b');
    const files = [
      `sections/${a.paper.id}/S1/x.pdf`, `docevidence/${a.paper.id}/r1/y.pdf`, `acct-schedule/${a.paper.id}/r1/z.xlsx`, `procedures/${a.paper.id}/${a.procedure.id}/w.pdf`,
      `sections/${b.paper.id}/S1/otro.pdf`, `${auditId}/del-encargo.pdf`,
    ];
    const { client, live } = fakeStorage(files);
    const wps = new WorkingPapersService(prisma as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any);
    (wps as any).supabaseAdmin = client;
    await expect(wps.remove(a.paper.id, user)).resolves.toEqual({ deleted: true });
    expect([...live].sort()).toEqual([`${auditId}/del-encargo.pdf`, `sections/${b.paper.id}/S1/otro.pdf`].sort());
    expect(await prisma.workingPaper.count({ where: { id: a.paper.id } })).toBe(0);
  });

  it('borrar un paso o un procedimiento borra la evidencia de sus pasos y la del procedimiento', async () => {
    const a = await mkPaper('LC-c');
    const step2 = await prisma.auditStep.create({ data: { procedureId: a.procedure.id, refNumber: 'P-1-B', description: 'b' } });
    const other = await mkPaper('LC-d');
    const files = [
      `procedures/steps/${a.step.id}/1.pdf`, `procedures/steps/${step2.id}/2.pdf`, `procedures/${a.paper.id}/${a.procedure.id}/3.pdf`,
      `procedures/steps/${other.step.id}/ajeno.pdf`, `procedures/${other.paper.id}/${other.procedure.id}/ajeno2.pdf`,
    ];
    const { client, live } = fakeStorage(files);
    const svc = new AuditProceduresService(prisma as any, { get: () => '' } as any);
    (svc as any).supabase = client;

    await svc.deleteStep(a.step.id, user);
    expect(live.has(`procedures/steps/${a.step.id}/1.pdf`)).toBe(false);
    expect(live.has(`procedures/steps/${step2.id}/2.pdf`)).toBe(true); // el otro paso sigue

    await svc.deleteProcedure(a.procedure.id, user);
    expect([...live].sort()).toEqual([`procedures/${other.paper.id}/${other.procedure.id}/ajeno2.pdf`, `procedures/steps/${other.step.id}/ajeno.pdf`].sort());
    expect(await prisma.auditProcedure.count({ where: { id: a.procedure.id } })).toBe(0);
  });
});
