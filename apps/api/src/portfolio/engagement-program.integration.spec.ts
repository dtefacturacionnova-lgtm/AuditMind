/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { EngagementProgramService } from './engagement-program.service';

/**
 * Programa anual de encargos contra un Postgres REAL (horas comprometidas vs. capacidad neta del equipo).
 *
 *   COLLECTIONS_TEST_DATABASE_URL=postgresql://postgres:test@localhost:54329/cobros_test npx jest engagement-program.integration
 */
const URL = process.env.COLLECTIONS_TEST_DATABASE_URL;
const suite = URL ? describe : describe.skip;
jest.setTimeout(120_000);

suite('programa anual de encargos contra Postgres real', () => {
  let prisma: PrismaClient;
  let svc: EngagementProgramService;

  beforeAll(async () => {
    const sep = (URL as string).includes('?') ? '&' : '?';
    prisma = new PrismaClient({ datasourceUrl: `${URL}${sep}connection_limit=8&pool_timeout=30` });
    await prisma.$connect();
    svc = new EngagementProgramService(prisma as any);
  });
  afterAll(async () => { await prisma?.$disconnect(); });

  let seq = 0;
  async function seed() {
    const tag = `${Date.now().toString(36)}${(seq++).toString(36)}${randomUUID().slice(0, 6)}`;
    const org = await prisma.organization.create({ data: { name: `Org ${tag}`, slug: `org-${tag}`, auditModality: 'EXTERNAL' } });
    const mk = (role: any, n: string, active = true) => prisma.user.create({ data: { organizationId: org.id, supabaseUserId: randomUUID(), email: `${n}-${tag}@t.test`, name: n, role, active } });
    const [cae, manager, ana, beto, baja] = await Promise.all([mk('CAE', 'cae'), mk('AUDIT_MANAGER', 'manager'), mk('AUDITOR', 'ana'), mk('AUDITOR', 'beto'), mk('AUDITOR', 'baja', false)]);
    const au = (u: any) => ({ id: u.id, supabaseUserId: u.supabaseUserId, email: u.email, name: u.name, role: u.role, organizationId: org.id, aiAssistantPersonality: 'ATHENA' });
    for (const [u, h] of [[ana, 1500], [beto, 1000], [manager, 800], [baja, 900]] as const) {
      await prisma.userAvailabilityProfile.create({ data: { organizationId: org.id, userId: u.id, year: 2027, netAvailableHours: h } });
    }
    const client = (n: string) => prisma.client.create({ data: { organizationId: org.id, legalName: `Cliente ${n} ${tag}`, status: 'ACTIVE', createdById: cae.id } });
    const audit = (title: string, o: any = {}) => prisma.audit.create({ data: { organizationId: org.id, title, type: 'EXTERNAL_FINANCIAL', leadAuditorId: manager.id, ...o } });
    const engagement = (clientId: string, o: any = {}) => prisma.engagement.create({
      data: { organizationId: org.id, clientId, fiscalYear: 2026, fiscalYearEndDate: new Date('2026-12-31'), createdById: cae.id, status: 'APPROVED', ...o },
    });
    return { org, tag, cae: au(cae), manager: au(manager), ana, beto, client, audit, engagement };
  }

  it('suma las horas del equipo por persona contra su capacidad, separa lo sin asignar y deja fuera lo que no cuenta', async () => {
    const s = await seed();
    const [c1, c2, c3, c4, c5] = [await s.client('1'), await s.client('2'), await s.client('3'), await s.client('4'), await s.client('5')];

    // auditoría 2026 → se trabaja en 2027: Ana 900 + Beto 600, y 1.700 estimadas (200 sin repartir)
    const a1 = await s.audit('Auditoría 1', { status: 'IN_PROGRESS', estimatedHours: 1700 });
    await prisma.auditTeam.createMany({ data: [{ auditId: a1.id, userId: s.ana.id, budgetedHours: 900 }, { auditId: a1.id, userId: s.beto.id, budgetedHours: 600 }] });
    const e1 = await s.engagement(c1.id, { auditId: a1.id });
    // consultoría del 2027: Ana 700 → Ana queda en 1.600 de 1.500
    const a2 = await s.audit('Consultoría', { status: 'IN_PROGRESS' });
    await prisma.auditTeam.create({ data: { auditId: a2.id, userId: s.ana.id, budgetedHours: 700 } });
    const e2 = await s.engagement(c2.id, { kind: 'CONSULTING', title: 'Asesoría', fiscalYear: 2027, fiscalYearEndDate: new Date('2027-12-31'), auditId: a2.id });
    // borrador sin auditoría ni propuesta: aparece aparte
    const e3 = await s.engagement(c3.id, { status: 'DRAFT' });
    // cancelado, cerrado y una investigación ajena: no cuentan
    await s.engagement(c3.id, { status: 'CANCELLED', fiscalYear: 2026 });
    const closed = await s.audit('Cerrada', { status: 'CLOSED', estimatedHours: 999 });
    await s.engagement(c4.id, { auditId: closed.id });
    const secret = await s.audit('Investigación', { status: 'IN_PROGRESS', estimatedHours: 500, isInvestigationMode: true });
    await prisma.auditTeam.create({ data: { auditId: secret.id, userId: s.beto.id, budgetedHours: 500 } });
    await s.engagement(c5.id, { auditId: secret.id });
    // horas ya trabajadas en 2027 (referencia)
    await prisma.timeEntry.create({ data: { organizationId: s.org.id, userId: s.ana.id, auditId: a1.id, workDate: new Date('2027-03-10T00:00:00Z'), hours: 40, category: 'CLIENT_BILLABLE' } });

    const r: any = await svc.program(2027, s.manager);
    expect(r.year).toBe(2027);
    expect(r.engagements.map((l: any) => [l.id, l.hours, l.assignedHours, l.unassignedHours])).toEqual([[e1.id, 1700, 1500, 200], [e2.id, 700, 700, 0]]);
    expect(r.withoutHours.map((l: any) => l.id)).toEqual([e3.id]);

    const byName = (n: string) => r.people.find((p: any) => p.name === n);
    expect(byName('ana')).toMatchObject({ capacity: 1500, committed: 1600, actual: 40, overbooked: true });
    expect(byName('beto')).toMatchObject({ capacity: 1000, committed: 600, overbooked: false, free: 400 });
    expect(byName('manager')).toMatchObject({ capacity: 800, committed: 0 });
    expect(byName('baja')).toBeUndefined();                 // una persona dada de baja no suma capacidad
    expect(r.totals).toMatchObject({ capacity: 3300, committed: 2200, unassigned: 200, overbookedPeople: 1, engagementsWithoutHours: 1, peopleWithoutProfile: 0 });
    // la investigación ajena no aparece ni cuenta para el gerente que no está en su equipo…
    expect(JSON.stringify(r)).not.toContain(secret.id);
    // …pero la dirección sí la ve
    const cae: any = await svc.program(2027, s.cae);
    expect(cae.engagements.some((l: any) => l.hours === 500)).toBe(true);

    // otro año: la auditoría de 2026 no se trabaja en 2026, la consultoría de 2027 no está en 2028
    const y26: any = await svc.program(2026, s.manager);
    expect(y26.engagements.map((l: any) => l.id)).toEqual([]);
    const y28: any = await svc.program(2028, s.manager);
    expect(y28.engagements).toEqual([]);
  });

  it('con fechas previstas reparte por días, y una organización no ve los encargos de otra', async () => {
    const s = await seed();
    const c = await s.client('1');
    const a = await s.audit('Cruza de año', { status: 'IN_PROGRESS' });
    await prisma.auditTeam.create({ data: { auditId: a.id, userId: s.ana.id, budgetedHours: 620 } });
    const e = await s.engagement(c.id, { auditId: a.id, plannedStartDate: new Date('2027-12-17T00:00:00Z'), plannedEndDate: new Date('2028-01-15T00:00:00Z') });

    const y27: any = await svc.program(2027, s.manager);
    expect(y27.engagements.find((l: any) => l.id === e.id)).toMatchObject({ hours: 310, basis: 'PLANNED_DATES' });
    expect(y27.people.find((p: any) => p.name === 'ana').committed).toBe(310);

    const other = await seed();
    const none: any = await svc.program(2027, other.manager);
    expect(none.engagements).toEqual([]);
    expect(JSON.stringify(none)).not.toContain(e.id);

    await expect(svc.program(1999, s.manager)).rejects.toThrow(/año no es válido/);
  });
});
