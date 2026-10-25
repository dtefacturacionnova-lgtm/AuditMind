/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomUUID } from 'crypto';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

process.env.SUPABASE_URL ??= 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'clave-de-prueba';

import { PlansService } from './plans.service';
import { AuditProjectsService } from '../audit-projects/audit-projects.service';
import { TimesheetService } from '../timesheet/timesheet.service';
import { CreatePlanDto, CreatePlanItemDto } from './dto/plan.dto';
import { computeProjectRisk } from '../audit-projects/project-risk.util';

/**
 * Plan Anual (revisión del 2026-10-25) contra un Postgres REAL: estados atómicos, historial que escribe el servidor, importación del
 * Banco sin duplicados, riesgo y cobertura del Banco, y una sola definición de las horas del ítem.
 *
 *   COLLECTIONS_TEST_DATABASE_URL=postgresql://postgres:test@localhost:54329/cobros_test npx jest plans.integration
 */
const URL = process.env.COLLECTIONS_TEST_DATABASE_URL;
const suite = URL ? describe : describe.skip;
jest.setTimeout(120_000);

suite('Plan Anual · de punta a punta (Postgres real)', () => {
  let prisma: PrismaClient;
  let org: { id: string };
  let manager: any; let cae: any;
  let plans: PlansService; let projects: AuditProjectsService; let timesheet: TimesheetService;
  let yearSeq = 2200; // años que no chocan con otras pruebas ni con planes reales

  beforeAll(async () => {
    const sep = (URL as string).includes('?') ? '&' : '?';
    prisma = new PrismaClient({ datasourceUrl: `${URL}${sep}connection_limit=10&pool_timeout=30` });
    await prisma.$connect();
    const tag = `${Date.now().toString(36)}${randomUUID().slice(0, 6)}`;
    org = await prisma.organization.create({ data: { name: `Plan ${tag}`, slug: `plan-${tag}` } });
    const mk = async (role: any, name: string) => {
      const u = await prisma.user.create({ data: { organizationId: org.id, supabaseUserId: randomUUID(), email: `${name}-${tag}@t.test`, name, role } });
      return { id: u.id, supabaseUserId: u.supabaseUserId, email: u.email, name: u.name, role: u.role, organizationId: org.id, aiAssistantPersonality: 'ATHENA' };
    };
    manager = await mk('AUDIT_MANAGER', 'gerente'); cae = await mk('CAE', 'cae');
    plans = new PlansService(prisma as any);
    projects = new AuditProjectsService(prisma as any);
    timesheet = new TimesheetService(prisma as any);
  });
  afterAll(async () => { await prisma?.$disconnect(); });

  const newPlan = (extra: any = {}) => plans.create({ year: yearSeq++, name: 'Plan de prueba', totalHours: 1000, ...extra }, manager);
  const scores = { impactScore: 4, likelihoodScore: 4, controlMaturityScore: 2, materialityScore: 4, strategicAlignScore: 4, operationalAlignScore: 3, fraudHistoryScore: 2, managementReqScore: 3, staffTurnoverScore: 3, coverageHistoryScore: 1 };
  const newProject = (extra: any = {}) => projects.create({ correlative: `BAP-${randomUUID().slice(0, 6)}`, name: `Proyecto ${randomUUID().slice(0, 4)}`, planYear: 2026, includeInPlan: true, ...extra } as any, manager);
  const entity = (name = `Gerencia ${randomUUID().slice(0, 4)}`) => prisma.auditEntity.create({ data: { organizationId: org.id, name } });
  const audit = (extra: any = {}) => prisma.audit.create({ data: { organizationId: org.id, title: `Auditoría ${randomUUID().slice(0, 4)}`, type: 'EXTERNAL', leadAuditorId: manager.id, ...extra } });

  // ═══ Estados y gobierno ═════════════════════════════════════════════════════════════════════════
  it('aprobar, activar y cerrar son atómicos: dos pedidos a la vez, uno solo gana', async () => {
    const plan: any = await newPlan();
    const [a, b] = await Promise.allSettled([plans.approve(plan.id, manager), plans.approve(plan.id, manager)]);
    expect([a.status, b.status].sort()).toEqual(['fulfilled', 'rejected']);
    const row = await prisma.auditPlan.findUniqueOrThrow({ where: { id: plan.id } });
    expect(row.status).toBe('APPROVED');
    const [c, d] = await Promise.allSettled([plans.activate(plan.id, manager), plans.activate(plan.id, manager)]);
    expect([c.status, d.status].sort()).toEqual(['fulfilled', 'rejected']);
    await plans.close(plan.id, manager);
    await expect(plans.close(plan.id, manager)).rejects.toThrow(/ACTIVE/);
  });

  it('el historial lo escribe el servidor (fecha y persona reales) y dos registros a la vez no se pisan', async () => {
    const plan: any = await newPlan();
    await Promise.all([
      plans.addAmendment(plan.id, { description: 'Se amplía el alcance de TI' }, manager),
      plans.addAmendment(plan.id, { description: 'Se difiere la auditoría de compras' }, cae),
    ]);
    const log = (await prisma.auditPlan.findUniqueOrThrow({ where: { id: plan.id } })).amendments as any[];
    expect(log).toHaveLength(2);
    expect(log.map((l) => l.approvedBy).sort()).toEqual(['cae', 'gerente']);
    expect(log.every((l) => !Number.isNaN(Date.parse(l.date)))).toBe(true);
    // el cliente ya no puede reescribir el historial por el PATCH del plan
    const errs = await validate(plainToInstance((await import('./dto/plan.dto')).UpdatePlanDto, { amendments: [] }), { whitelist: true, forbidNonWhitelisted: true });
    expect(errs.some((e) => e.property === 'amendments')).toBe(true);
  });

  it('cambiar horas, objetivos o ítems de un plan ya aprobado deja un renglón automático en el historial', async () => {
    const plan: any = await newPlan();
    const e = await entity();
    await plans.approve(plan.id, manager);
    await plans.update(plan.id, { totalHours: 1200 }, manager);
    const withItem: any = await plans.addItem(plan.id, { auditEntityId: e.id, estimatedHours: 80 } as any, manager);
    await plans.updateItem(plan.id, withItem.items[0].id, { estimatedHours: 120 }, manager);
    await plans.removeItem(plan.id, withItem.items[0].id, manager);
    const log = (await prisma.auditPlan.findUniqueOrThrow({ where: { id: plan.id } })).amendments as any[];
    const texts = log.map((l) => l.description).join(' | ');
    expect(texts).toContain('Horas totales del plan: 1000 → 1200');
    expect(texts).toContain('Se agregó');
    expect(texts).toContain('80 → 120');
    expect(texts).toContain('Se quitó');
    expect(log.every((l) => l.auto === true)).toBe(true);
    // en borrador no se registran renglones automáticos
    const draft: any = await newPlan();
    await plans.update(draft.id, { totalHours: 5 }, manager);
    expect(((await prisma.auditPlan.findUniqueOrThrow({ where: { id: draft.id } })).amendments as any[])).toHaveLength(0);
  });

  it('dos importaciones simultáneas del mismo proyecto no lo duplican; ids repetidos se cuentan bien', async () => {
    const plan: any = await newPlan();
    const p = await newProject({ ...scores, plannedHours: 120 });
    await Promise.all([plans.importFromProjects(plan.id, { projectIds: [p.id] } as any, manager), plans.importFromProjects(plan.id, { projectIds: [p.id] } as any, manager)]);
    expect(await prisma.auditPlanItem.count({ where: { planId: plan.id, auditProjectId: p.id } })).toBe(1);
    const again: any = await plans.importFromProjects(plan.id, { projectIds: [p.id, p.id] } as any, manager);
    expect(again.importResult).toEqual({ imported: 0, skipped: 1, notFound: 0 });
    expect(again.allocatedHours).toBe(120);
  });

  it('solo un plan en borrador se elimina (con el año equivocado no había forma de corregirlo)', async () => {
    const draft: any = await newPlan();
    await expect(plans.remove(draft.id, manager)).resolves.toEqual({ deleted: true });
    expect(await prisma.auditPlan.count({ where: { id: draft.id } })).toBe(0);
    const approved: any = await newPlan();
    await plans.approve(approved.id, manager);
    await expect(plans.remove(approved.id, manager)).rejects.toThrow(/borrador/);
    expect(await prisma.auditPlan.count({ where: { id: approved.id } })).toBe(1);
  });

  it('crear dos planes del mismo año a la vez da un 409 claro, no un 500', async () => {
    const year = yearSeq++;
    const results = await Promise.allSettled([plans.create({ year, name: 'A', totalHours: 1 }, manager), plans.create({ year, name: 'B', totalHours: 1 }, manager)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const failed = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(failed.reason).toBeInstanceOf(ConflictException);
  });

  it('validaciones: horas negativas, años absurdos y fin antes del inicio se rechazan', async () => {
    for (const bad of [{ year: 0 }, { year: 1999 }, { totalHours: -5 }, { name: '' }]) {
      const errs = await validate(plainToInstance(CreatePlanDto, { year: 2030, name: 'Plan', totalHours: 10, ...bad }));
      expect(errs.length).toBeGreaterThan(0);
    }
    const neg = await validate(plainToInstance(CreatePlanItemDto, { auditEntityId: 'e', estimatedHours: -3 }));
    expect(neg.some((e) => e.property === 'estimatedHours')).toBe(true);
    const plan: any = await newPlan();
    const e = await entity();
    await expect(plans.addItem(plan.id, { auditEntityId: e.id, estimatedHours: 10, tentativeStartDate: '2030-05-10', tentativeEndDate: '2030-05-01' } as any, manager))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  // ═══ Banco de Proyectos ═════════════════════════════════════════════════════════════════════════
  it('el puntaje y el nivel de riesgo los calcula el servidor al crear y al editar', async () => {
    const created: any = await newProject(scores);
    const expected = computeProjectRisk(scores)!;
    expect(created.finalRiskScore).toBe(expected.score);
    expect(created.finalRiskLevel).toBe(expected.level);
    // editar un solo factor recalcula con los demás guardados
    const edited: any = await projects.update(created.id, { impactScore: 5, controlMaturityScore: 1 } as any, manager);
    const exp2 = computeProjectRisk({ ...scores, impactScore: 5, controlMaturityScore: 1 })!;
    expect(edited.finalRiskScore).toBe(exp2.score);
    // sin los 10 factores no se inventa un puntaje
    const partial: any = await newProject({ impactScore: 3 });
    expect(partial.finalRiskScore ?? null).toBeNull();
  });

  it('las claves foráneas vacías del formulario no rompen (antes: 500), y editar con solo los campos del DTO funciona', async () => {
    const created: any = await newProject({ strategicObjectiveId: '', strategicLineId: '', responsibleEntityId: '', supportEntityId: '' });
    expect(created.responsibleEntityId).toBeNull();
    const e = await entity();
    const edited: any = await projects.update(created.id, { name: 'Renombrado', responsibleEntityId: e.id } as any, manager);
    expect(edited.name).toBe('Renombrado');
    const cleared: any = await projects.update(created.id, { responsibleEntityId: '' } as any, manager);
    expect(cleared.responsibleEntityId).toBeNull();
  });

  it('sincronizar la cobertura recalcula también el puntaje y el nivel, y la mide por proyecto (no por área)', async () => {
    const area = await entity();
    const a = await newProject({ ...scores, responsibleEntityId: area.id });
    const b = await newProject({ ...scores, responsibleEntityId: area.id });
    // el proyecto A se audita vía el plan: auditoría cerrada hace 2 años, ligada a su ítem de plan
    const plan: any = await newPlan();
    const closed = await audit({ status: 'CLOSED', auditEntityId: area.id, endDate: new Date(Date.now() - 2 * 365 * 86_400_000) });
    await prisma.auditPlanItem.create({ data: { planId: plan.id, estimatedHours: 80, auditProjectId: a.id, auditId: closed.id } });
    const res: any = await projects.syncCoverage(manager);
    const rows = await prisma.auditProject.findMany({ where: { id: { in: [a.id, b.id] } } });
    const ra = rows.find((r) => r.id === a.id)!; const rb = rows.find((r) => r.id === b.id)!;
    expect(res.updated).toBeGreaterThanOrEqual(2);
    expect(ra.coverageHistoryScore).toBe(3);                 // 730–1095 días
    expect(rb.coverageHistoryScore).toBe(5);                 // B nunca se auditó: la auditoría de A no lo «cubre» aunque sean de la misma área
    expect(ra.finalRiskScore).toBe(computeProjectRisk({ ...scores, coverageHistoryScore: 3 })!.score);
    expect(rb.finalRiskScore).toBe(computeProjectRisk({ ...scores, coverageHistoryScore: 5 })!.score);
    expect(rb.finalRiskLevel).toBe(computeProjectRisk({ ...scores, coverageHistoryScore: 5 })!.level);
  });

  it('un proyecto que está en un plan no se puede borrar (soltaría el ítem de planes aprobados o cerrados)', async () => {
    const p = await newProject(scores);
    const plan: any = await newPlan();
    await plans.importFromProjects(plan.id, { projectIds: [p.id] } as any, manager);
    await expect(projects.remove(p.id, manager)).rejects.toThrow(/ítem\(s\) de plan/);
    const free = await newProject(scores);
    await expect(projects.remove(free.id, manager)).resolves.toBeDefined();
  });

  it('las candidatas del plan van ordenadas por riesgo y las que no tienen puntaje, al final', async () => {
    const plan: any = await newPlan();
    const hi = await newProject({ ...scores, impactScore: 5, likelihoodScore: 5, controlMaturityScore: 1, targetPlanYear: plan.year });
    const none = await newProject({ targetPlanYear: plan.year });
    const cands: any[] = await plans.getProjectCandidates(plan.id, manager);
    const ids = cands.map((c) => c.id);
    expect(ids.indexOf(hi.id)).toBeLessThan(ids.indexOf(none.id));
  });

  // ═══ Horas del ítem y del encargo ═══════════════════════════════════════════════════════════════
  it('una sola definición de las horas del ítem: el ítem hereda el encargo y el encargo hereda el ítem', async () => {
    const plan: any = await newPlan();
    const au = await audit();
    const item = await prisma.auditPlanItem.create({ data: { planId: plan.id, estimatedHours: 80, auditId: au.id } });
    const day = (n: number) => `2031-03-${String(10 + n)}`;
    const base = { hours: 2, description: 'trabajo de campo', category: 'CLIENT_BILLABLE' as any };
    // solo el ítem → hereda el encargo
    const e1: any = await timesheet.createEntry({ workDate: day(1), planItemId: item.id, ...base } as any, manager);
    expect(e1.auditId).toBe(au.id);
    // solo el encargo → hereda el ítem
    const e2: any = await timesheet.createEntry({ workDate: day(2), auditId: au.id, ...base } as any, manager);
    expect(e2.planItemId).toBe(item.id);
    // por el plan también
    const e3: any = await plans.createTimeEntry({ workDate: day(3), planItemId: item.id, hours: 1, description: 'desde el plan' } as any, manager);
    expect(e3.auditId).toBe(au.id);
    // las horas reales del plan = horas del encargo = horas del ítem
    const actual = (await prisma.audit.findUniqueOrThrow({ where: { id: au.id } })).actualHours;
    const byItem = await prisma.timeEntry.aggregate({ where: { planItemId: item.id }, _sum: { hours: true } });
    expect(actual).toBe(5);
    expect(byItem._sum.hours).toBe(5);
    const planView: any = await plans.findOne(plan.id, manager);
    expect(planView.realHours).toBe(5);
    // un ítem vinculado a un encargo no admite horas de otro encargo
    const other = await audit();
    await expect(timesheet.createEntry({ workDate: day(4), planItemId: item.id, auditId: other.id, ...base } as any, manager)).rejects.toThrow(/otro encargo/);
  });

  it('al vincular un encargo a un ítem, las horas ya anotadas en meses abiertos se unifican (las de un mes cerrado no se tocan)', async () => {
    const plan: any = await newPlan();
    const au = await audit();
    const item = await prisma.auditPlanItem.create({ data: { planId: plan.id, estimatedHours: 80 } });
    const mkEntry = (extra: any) => prisma.timeEntry.create({ data: { organizationId: org.id, userId: manager.id, workDate: new Date('2031-04-10'), hours: 2, category: 'CLIENT_BILLABLE' as any, description: 'previo', ...extra } });
    const onlyItem = await mkEntry({ planItemId: item.id });
    const onlyAudit = await mkEntry({ auditId: au.id });
    const closedOne = await mkEntry({ planItemId: item.id, closedAt: new Date() });
    await plans.linkAudit(plan.id, item.id, { auditId: au.id }, manager);
    expect((await prisma.timeEntry.findUniqueOrThrow({ where: { id: onlyItem.id } })).auditId).toBe(au.id);
    expect((await prisma.timeEntry.findUniqueOrThrow({ where: { id: onlyAudit.id } })).planItemId).toBe(item.id);
    expect((await prisma.timeEntry.findUniqueOrThrow({ where: { id: closedOne.id } })).auditId).toBeNull();
    expect((await prisma.audit.findUniqueOrThrow({ where: { id: au.id } })).actualHours).toBe(4);
  });

  it('las horas desde el plan: la hora de cliente exige encargo o ítem, y la categoría declarada se respeta', async () => {
    await expect(plans.createTimeEntry({ workDate: '2031-05-05', hours: 1, description: 'sin ancla' } as any, manager)).rejects.toBeInstanceOf(BadRequestException);
    const e: any = await plans.createTimeEntry({ workDate: '2031-05-06', hours: 1, description: 'capacitación interna', category: 'TRAINING' } as any, manager);
    expect(e.category).toBe('TRAINING');
  });

  it('solo se vinculan encargos abiertos', async () => {
    const plan: any = await newPlan();
    const open = await audit({ status: 'PLANNING' });
    const closed = await audit({ status: 'CLOSED' });
    const cancelled = await audit({ status: 'CANCELLED' });
    const ids = (await plans.getLinkableAudits(plan.id, manager)).map((a: any) => a.id);
    expect(ids).toContain(open.id);
    expect(ids).not.toContain(closed.id);
    expect(ids).not.toContain(cancelled.id);
  });
});
