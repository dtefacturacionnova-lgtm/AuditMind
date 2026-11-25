/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';

/**
 * Restricciones del SQL de visitas contra un Postgres REAL (con 2026-11-visitas-1-saldos.sql aplicado):
 *
 *   COLLECTIONS_TEST_DATABASE_URL=postgresql://postgres:test@127.0.0.1:54329/cobros_test node ../../node_modules/jest/bin/jest.js visit-sql.integration
 *
 * Reconstruir la base de pruebas si está vacía: python infrastructure/test-db/rebuild_test_db.py
 */
const URL = process.env.COLLECTIONS_TEST_DATABASE_URL;
const suite = URL ? describe : describe.skip;
jest.setTimeout(120_000);

suite('visitas: restricciones del SQL en Postgres real', () => {
  let prisma: PrismaClient;
  const orgs: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: URL });
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.audit.deleteMany({ where: { organizationId: { in: orgs } } }); // visitas y balances caen en cascada
    await prisma.organization.deleteMany({ where: { id: { in: orgs } } });
    await prisma.$disconnect();
  });

  const newOrg = async () => {
    const id = randomUUID();
    const org = await prisma.organization.create({ data: { name: `Prueba visitas ${id}`, slug: `vs-${id}` } });
    orgs.push(org.id);
    return org.id;
  };
  const newAudit = (organizationId: string) => prisma.audit.create({ data: { organizationId, title: 'Auditoría de prueba', type: 'EXTERNAL' } });
  const visit = (auditId: string, organizationId: string, kind: 'PLANNING' | 'INTERIM' | 'FINAL', extra: Record<string, unknown> = {}) =>
    prisma.auditVisit.create({ data: { auditId, organizationId, kind, cutoffDate: new Date('2026-06-30'), ...extra } as any });
  const balance = (auditId: string, organizationId: string, extra: Record<string, unknown> = {}) =>
    prisma.trialBalance.create({ data: { auditId, orgId: organizationId, filename: 'tb.xlsx', periodLabel: 'Prueba', accounts: [], totalDebit: 0, totalCredit: 0, importedById: 'u', ...extra } as any });

  it('una visita de cada tipo por encargo: la repetida se rechaza, tipos distintos conviven', async () => {
    const org = await newOrg(); const a = await newAudit(org);
    await visit(a.id, org, 'INTERIM');
    await expect(visit(a.id, org, 'INTERIM')).rejects.toThrow();
    await visit(a.id, org, 'PLANNING');
    await visit(a.id, org, 'FINAL');
    expect(await prisma.auditVisit.count({ where: { auditId: a.id } })).toBe(3);
  });

  it('el mismo tipo de visita sí puede existir en OTRO encargo', async () => {
    const org = await newOrg(); const a1 = await newAudit(org); const a2 = await newAudit(org);
    await visit(a1.id, org, 'INTERIM');
    await expect(visit(a2.id, org, 'INTERIM')).resolves.toBeDefined();
  });

  it('una sola base de análisis por encargo; se puede pasar la marca de una visita a otra', async () => {
    const org = await newOrg(); const a = await newAudit(org);
    const interim = await visit(a.id, org, 'INTERIM', { isAnalysisBase: true });
    await expect(visit(a.id, org, 'FINAL', { isAnalysisBase: true })).rejects.toThrow();
    const final = await visit(a.id, org, 'FINAL');
    // pasar la marca: primero se quita y luego se pone (en una transacción, como lo hará el servicio)
    await prisma.$transaction([
      prisma.auditVisit.update({ where: { id: interim.id }, data: { isAnalysisBase: false } }),
      prisma.auditVisit.update({ where: { id: final.id }, data: { isAnalysisBase: true } }),
    ]);
    expect((await prisma.auditVisit.findMany({ where: { auditId: a.id, isAnalysisBase: true } })).map((v) => v.kind)).toEqual(['FINAL']);
    // poner la marca en otra visita SIN quitarla de la primera se rechaza
    await expect(prisma.auditVisit.update({ where: { id: interim.id }, data: { isAnalysisBase: true } })).rejects.toThrow();
  });

  it('otro encargo puede tener su propia base de análisis', async () => {
    const org = await newOrg(); const a1 = await newAudit(org); const a2 = await newAudit(org);
    await visit(a1.id, org, 'FINAL', { isAnalysisBase: true });
    await expect(visit(a2.id, org, 'FINAL', { isAnalysisBase: true })).resolves.toBeDefined();
  });

  it('cerrada ⇔ con fecha de cierre', async () => {
    const org = await newOrg(); const a = await newAudit(org);
    await expect(visit(a.id, org, 'PLANNING', { status: 'CLOSED' })).rejects.toThrow();                     // cerrada sin fecha
    await expect(visit(a.id, org, 'PLANNING', { status: 'IN_PROGRESS', closedAt: new Date() })).rejects.toThrow(); // fecha sin cerrar
    await expect(visit(a.id, org, 'PLANNING', { status: 'CLOSED', closedAt: new Date(), closedById: 'u' })).resolves.toBeDefined();
    const v = await visit(a.id, org, 'INTERIM');
    await expect(prisma.auditVisit.update({ where: { id: v.id }, data: { status: 'CLOSED' } })).rejects.toThrow(); // cerrar sin fecha
    await expect(prisma.auditVisit.update({ where: { id: v.id }, data: { status: 'CLOSED', closedAt: new Date() } })).resolves.toBeDefined();
    await expect(prisma.auditVisit.update({ where: { id: v.id }, data: { status: 'IN_PROGRESS' } })).rejects.toThrow(); // reabrir dejando la fecha
    await expect(prisma.auditVisit.update({ where: { id: v.id }, data: { status: 'IN_PROGRESS', closedAt: null } })).resolves.toBeDefined();
  });

  it('un balance sin visita sigue funcionando igual que antes (columnas nulas)', async () => {
    const org = await newOrg(); const a = await newAudit(org);
    const tb = await balance(a.id, org);
    expect(tb.visitId).toBeNull();
    expect(tb.asOfDate).toBeNull();
  });

  it('un balance guarda su visita y su fecha de corte (como fecha, sin hora)', async () => {
    const org = await newOrg(); const a = await newAudit(org);
    const v = await visit(a.id, org, 'INTERIM');
    const tb = await balance(a.id, org, { visitId: v.id, asOfDate: new Date('2026-09-30') });
    const read = await prisma.trialBalance.findUnique({ where: { id: tb.id } });
    expect(read?.visitId).toBe(v.id);
    expect(read?.asOfDate?.toISOString().slice(0, 10)).toBe('2026-09-30');
    expect(await prisma.trialBalance.count({ where: { visitId: v.id } })).toBe(1);
  });

  it('no se puede asignar un balance a una visita que no existe', async () => {
    const org = await newOrg(); const a = await newAudit(org);
    await expect(balance(a.id, org, { visitId: 'no-existe' })).rejects.toThrow();
  });

  it('al borrar una visita sus balances se CONSERVAN, sin visita', async () => {
    const org = await newOrg(); const a = await newAudit(org);
    const v = await visit(a.id, org, 'INTERIM');
    const tb = await balance(a.id, org, { visitId: v.id, asOfDate: new Date('2026-09-30') });
    await prisma.auditVisit.delete({ where: { id: v.id } });
    const read = await prisma.trialBalance.findUnique({ where: { id: tb.id } });
    expect(read).not.toBeNull();
    expect(read?.visitId).toBeNull();
  });

  it('al borrar la auditoría caen sus visitas y sus balances', async () => {
    const org = await newOrg(); const a = await newAudit(org);
    const v = await visit(a.id, org, 'FINAL');
    const tb = await balance(a.id, org, { visitId: v.id });
    await prisma.audit.delete({ where: { id: a.id } });
    expect(await prisma.auditVisit.findUnique({ where: { id: v.id } })).toBeNull();
    expect(await prisma.trialBalance.findUnique({ where: { id: tb.id } })).toBeNull();
  });

  it('anon y authenticated no pueden leer ni escribir audit_visits (RLS + sin permisos)', async () => {
    for (const role of ['anon', 'authenticated']) {
      await expect(prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO ${role}`); // como en Supabase; se deshace con la transacción
        await tx.$executeRawUnsafe(`SET LOCAL ROLE ${role}`);
        return tx.$queryRawUnsafe(`SELECT * FROM "audit_visits"`);
      })).rejects.toThrow(/permission denied/i);
      await expect(prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO ${role}`);
        await tx.$executeRawUnsafe(`SET LOCAL ROLE ${role}`);
        return tx.$executeRawUnsafe(`INSERT INTO "audit_visits" ("id","auditId","organizationId","kind","cutoffDate","updatedAt") VALUES ('x','x','x','FINAL','2026-01-01',now())`);
      })).rejects.toThrow(/permission denied/i);
    }
  });

  it('rechaza valores fuera de los tipos permitidos', async () => {
    const org = await newOrg(); const a = await newAudit(org);
    await expect(visit(a.id, org, 'CUARTA' as any)).rejects.toThrow();
  });
});
