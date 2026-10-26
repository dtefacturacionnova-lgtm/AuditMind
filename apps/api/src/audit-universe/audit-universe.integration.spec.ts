/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { AuditUniverseService } from './audit-universe.service';
import { computeCoverage } from './coverage.util';

/**
 * Universo de Auditoría → candidatas al Plan Anual (revisión de Plan, 2026-10-25), contra un Postgres REAL.
 *
 *   COLLECTIONS_TEST_DATABASE_URL=postgresql://postgres:test@localhost:54329/cobros_test npx jest audit-universe.integration
 */
const URL = process.env.COLLECTIONS_TEST_DATABASE_URL;
const suite = URL ? describe : describe.skip;
jest.setTimeout(120_000);

describe('computeCoverage', () => {
  const now = new Date('2026-10-25T12:00:00Z');
  it('nunca auditada no tiene brecha (antes 9999 días) y se marca aparte', () => {
    expect(computeCoverage(null, 12, now)).toEqual({ nextRecommendedDate: null, coverageGapDays: null, neverAudited: true });
  });
  it('la brecha es hoy menos la fecha en que tocaba volver (positiva = vencida, negativa = aún en plazo)', () => {
    const vencida = computeCoverage(new Date('2024-10-25T12:00:00Z'), 12, now);
    expect(vencida.neverAudited).toBe(false);
    expect(vencida.coverageGapDays).toBeGreaterThan(360);
    expect(computeCoverage(new Date('2026-08-25T12:00:00Z'), 12, now).coverageGapDays).toBeLessThan(0);
  });
});

suite('Universo · candidatas al plan (Postgres real)', () => {
  let prisma: PrismaClient;
  let service: AuditUniverseService;
  let org: { id: string };
  let manager: any; let cae: any;
  const year = new Date().getFullYear();
  const u: Record<string, any> = {};
  const e: Record<string, any> = {};

  beforeAll(async () => {
    const sep = (URL as string).includes('?') ? '&' : '?';
    prisma = new PrismaClient({ datasourceUrl: `${URL}${sep}connection_limit=10&pool_timeout=30` });
    await prisma.$connect();
    const tag = `${Date.now().toString(36)}${randomUUID().slice(0, 6)}`;
    org = await prisma.organization.create({ data: { name: `Universo ${tag}`, slug: `universo-${tag}` } });
    const mk = async (role: any, name: string) => {
      const row = await prisma.user.create({ data: { organizationId: org.id, supabaseUserId: randomUUID(), email: `${name}-${tag}@t.test`, name, role } });
      return { id: row.id, role: row.role, organizationId: org.id } as any;
    };
    manager = await mk('AUDIT_MANAGER', 'gerente'); cae = await mk('CAE', 'cae');
    service = new AuditUniverseService(prisma as any);

    for (const n of ['A', 'B', 'C', 'D']) e[n] = await prisma.auditEntity.create({ data: { organizationId: org.id, name: `Entidad ${n}` } });
    const p1 = await prisma.auditProcess.create({ data: { organizationId: org.id, code: 'P1', name: 'Compras' } });
    const p2 = await prisma.auditProcess.create({ data: { organizationId: org.id, code: 'P2', name: 'Nómina' } });
    const unit = (entity: any, process: any) => prisma.auditableUnit.create({ data: { organizationId: org.id, auditEntityId: entity.id, auditProcessId: process.id } });
    u.sinEvaluar = await unit(e.A, p1);          // A × Compras: sin evaluación
    u.nunca = await unit(e.A, p2);               // A × Nómina: evaluada, nunca auditada
    u.vencida = await unit(e.B, p1);             // B × Compras: evaluada con brecha guardada vieja
    u.anterior = await unit(e.C, p1);            // C × Compras: solo tiene evaluación del año anterior
    u.investigacion = await unit(e.D, p1);       // D × Compras: su único ítem de plan es de una investigación ajena

    const assess = (unitId: string, assessmentYear: number, extra: any = {}) => prisma.auditableUnitAssessment.create({
      data: { auditableUnitId: unitId, assessmentYear, totalScore: 60, riskLevel: 'HIGH', ...extra },
    });
    await assess(u.nunca.id, year, { totalScore: 80, riskLevel: 'CRITICAL', lastAuditDate: null, coverageGapDays: 9999 });
    // brecha GUARDADA de 5 días (congelada hace meses); la real, con la fecha de 2022 y frecuencia de 12 meses, es de más de 3 años
    await assess(u.vencida.id, year, { totalScore: 40, riskLevel: 'MEDIUM', lastAuditDate: new Date('2022-01-01T00:00:00Z'), recommendedFreqMonths: 12, coverageGapDays: 5 });
    await assess(u.anterior.id, year - 1, { totalScore: 55, riskLevel: 'HIGH', lastAuditDate: new Date(`${year - 1}-01-01T00:00:00Z`) });

    // auditoría cerrada de la entidad B (visible) y de la entidad A pero en modo investigación (no debe aparecer)
    await prisma.audit.create({ data: { organizationId: org.id, title: 'Cierre B', type: 'OPERATIONAL', leadAuditorId: cae.id, status: 'CLOSED', endDate: new Date('2025-06-30T00:00:00Z'), auditEntityId: e.B.id } });
    await prisma.audit.create({ data: { organizationId: org.id, title: 'Investigación A', type: 'OPERATIONAL', leadAuditorId: cae.id, status: 'CLOSED', endDate: new Date('2026-01-31T00:00:00Z'), auditEntityId: e.A.id, isInvestigationMode: true } });

    // el plan del año: un ítem que nombra la unidad, uno de un proyecto promovido desde A × Nómina, uno de la entidad C y uno ligado a una investigación de D
    const plan = await prisma.auditPlan.create({ data: { organizationId: org.id, year, name: `Plan ${year}`, status: 'DRAFT' } });
    const project = await prisma.auditProject.create({ data: { organizationId: org.id, correlative: 'BAP-T1', name: 'Entidad A — Nómina', planYear: year, responsibleEntityId: e.A.id } });
    const investigation = await prisma.audit.create({ data: { organizationId: org.id, title: 'Investigación D', type: 'OPERATIONAL', leadAuditorId: cae.id, isInvestigationMode: true, auditEntityId: e.D.id } });
    await prisma.auditPlanItem.createMany({ data: [
      { planId: plan.id, auditEntityId: e.B.id, auditableUnitId: u.vencida.id, estimatedHours: 40 },
      { planId: plan.id, auditProjectId: project.id, estimatedHours: 40 },
      { planId: plan.id, auditEntityId: e.C.id, estimatedHours: 40 },
    ] });
    await prisma.auditPlanItem.create({ data: { planId: plan.id, auditEntityId: e.D.id, auditId: investigation.id, estimatedHours: 40 } });
  });
  afterAll(async () => { await prisma?.$disconnect(); });

  const candidates = async (user = manager, y?: number) => {
    const r: any = await service.getPlanCandidates(user, y);
    const by = (id: string) => r.candidates.find((c: any) => c.id === id);
    return { r, by };
  };

  it('nunca auditada: sin brecha inventada de 9999 días, marcada como tal y vencida', async () => {
    const { by } = await candidates();
    const c = by(u.nunca.id);
    expect(c.neverAudited).toBe(true);
    expect(c.coverageGapDays).toBeNull();
    expect(c.isOverdue).toBe(true);
  });

  it('la brecha se recalcula al leer: la guardada hace meses (5 días) no manda', async () => {
    const { by } = await candidates();
    const c = by(u.vencida.id);
    expect(c.neverAudited).toBe(false);
    expect(c.coverageGapDays).toBeGreaterThan(365 * 3);
    const units: any[] = await service.findAllUnits(manager, undefined, year);
    expect(units.find((x) => x.id === u.vencida.id).assessments[0].coverageGapDays).toBeGreaterThan(365 * 3);
  });

  it('una unidad sin evaluar no se hace pasar por riesgo Medio con puntaje 0: queda «sin evaluar» y al final', async () => {
    const { r, by } = await candidates();
    const c = by(u.sinEvaluar.id);
    expect(c).toMatchObject({ scored: false, riskLevel: null, totalScore: null, neverAudited: null, isOverdue: false });
    const order = r.candidates.map((x: any) => x.id);
    const lastScored = Math.max(...r.candidates.filter((x: any) => x.scored).map((x: any) => order.indexOf(x.id)));
    expect(order.indexOf(u.sinEvaluar.id)).toBeGreaterThan(lastScored);
    expect(r.unscored).toBeGreaterThanOrEqual(2); // sin evaluar + la de la entidad D
  });

  it('el año seleccionado usa la evaluación más reciente si ese año aún no se evalúa, marcándola como no vigente', async () => {
    const { by } = await candidates();
    const c = by(u.anterior.id);
    expect(c.scored).toBe(true);
    expect(c.assessmentIsStale).toBe(true);
    expect(c.totalScore).toBe(55);
    expect(by(u.nunca.id).assessmentIsStale).toBe(false);
    // un año futuro sin plan: ninguna unidad aparece «en plan»
    const next = await candidates(manager, year + 1);
    expect(next.r.year).toBe(year + 1);
    expect(next.r.candidates.every((x: any) => x.alreadyInCurrentPlan === false)).toBe(true);
  });

  it('«ya en plan» se reconoce por la unidad, por el proyecto del Banco promovido desde ella o por la entidad completa', async () => {
    const { by } = await candidates();
    expect(by(u.vencida.id)).toMatchObject({ alreadyInCurrentPlan: true, planMatch: 'UNIT' });
    expect(by(u.nunca.id)).toMatchObject({ alreadyInCurrentPlan: true, planMatch: 'PROJECT' });
    expect(by(u.anterior.id)).toMatchObject({ alreadyInCurrentPlan: true, planMatch: 'ENTITY' });
    // A × Compras no tiene ítem propio, ni proyecto de ese nombre, ni ítem de la entidad A completa
    expect(by(u.sinEvaluar.id)).toMatchObject({ alreadyInCurrentPlan: false, planMatch: null });
  });

  it('un ítem ligado a una investigación ajena no revela que la entidad está en el plan; el CAE sí lo ve', async () => {
    expect((await candidates(manager)).by(u.investigacion.id).alreadyInCurrentPlan).toBe(false);
    expect((await candidates(cae)).by(u.investigacion.id)).toMatchObject({ alreadyInCurrentPlan: true, planMatch: 'ENTITY' });
  });

  it('la última auditoría cerrada de la entidad se sugiere sin contar investigaciones', async () => {
    const { by } = await candidates();
    expect(new Date(by(u.vencida.id).entityLastClosedAt).toISOString().slice(0, 10)).toBe('2025-06-30');
    expect(by(u.sinEvaluar.id).entityLastClosedAt).toBeNull(); // la entidad A solo tiene una investigación cerrada
  });
});
