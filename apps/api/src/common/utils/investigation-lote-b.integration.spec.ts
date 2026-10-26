/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomUUID } from 'crypto';
import { ForbiddenException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

process.env.SUPABASE_URL ??= 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'clave-de-prueba';

import { AuditsService } from '../../audits/audits.service';
import { AuditProjectsService } from '../../audit-projects/audit-projects.service';
import { PerformanceService } from '../../qaip/performance.service';

/**
 * Modo investigación · lote B (2026-10-25), contra un Postgres REAL:
 *  · quién puede cambiar el equipo de una investigación (sumar a alguien es darle acceso a ella);
 *  · la cobertura de los proyectos y los indicadores del plan de QAIP no cuentan investigaciones (quien no las ve podría inferirlas).
 *
 *   COLLECTIONS_TEST_DATABASE_URL=postgresql://postgres:test@localhost:54329/cobros_test npx jest investigation-lote-b
 */
const URL = process.env.COLLECTIONS_TEST_DATABASE_URL;
const suite = URL ? describe : describe.skip;
jest.setTimeout(120_000);

suite('modo investigación · lote B (Postgres real)', () => {
  let prisma: PrismaClient;
  let org: { id: string };
  let u: Record<'cae' | 'lead' | 'memberMgr' | 'manager' | 'newcomer', any>;
  let audits: AuditsService;

  beforeAll(async () => {
    const sep = (URL as string).includes('?') ? '&' : '?';
    prisma = new PrismaClient({ datasourceUrl: `${URL}${sep}connection_limit=10&pool_timeout=30` });
    await prisma.$connect();
    const tag = `${Date.now().toString(36)}${randomUUID().slice(0, 6)}`;
    org = await prisma.organization.create({ data: { name: `LoteB ${tag}`, slug: `loteb-${tag}` } });
    const mk = async (role: any, name: string) => {
      const row = await prisma.user.create({ data: { organizationId: org.id, supabaseUserId: randomUUID(), email: `${name}-${tag}@t.test`, name, role } });
      return { id: row.id, supabaseUserId: row.supabaseUserId, email: row.email, name: row.name, role: row.role, organizationId: org.id, aiAssistantPersonality: 'ATHENA' };
    };
    u = {
      cae: await mk('CAE', 'cae'), lead: await mk('AUDIT_MANAGER', 'lead'), memberMgr: await mk('AUDIT_MANAGER', 'memberMgr'),
      manager: await mk('AUDIT_MANAGER', 'manager'), newcomer: await mk('AUDITOR', 'newcomer'),
    };
    audits = new AuditsService(prisma as any, {} as any, {} as any, {} as any);
  });
  afterAll(async () => { await prisma?.$disconnect(); });

  const mkAudit = async (title: string, investigation: boolean, extra: any = {}) => {
    const a = await prisma.audit.create({
      data: { organizationId: org.id, title, type: 'OPERATIONAL', isInvestigationMode: investigation, leadAuditorId: u.lead.id, ...extra },
    });
    await prisma.auditTeam.create({ data: { auditId: a.id, userId: u.lead.id, role: 'LEAD' } });
    await prisma.auditTeam.create({ data: { auditId: a.id, userId: u.memberMgr.id, role: 'MEMBER' } });
    return a;
  };
  const teamOf = async (auditId: string) => (await prisma.auditTeam.findMany({ where: { auditId }, include: { user: true } })).map((m) => m.user.name).sort();

  it('en una investigación solo el CAE o el auditor líder cambian el equipo; un gerente integrante no, aunque pueda verla', async () => {
    const inv = await mkAudit('Investigación del equipo', true);
    const memberRow = await prisma.auditTeam.findFirstOrThrow({ where: { auditId: inv.id, userId: u.memberMgr.id } });

    await expect(audits.addTeamMember(inv.id, { userId: u.newcomer.id } as any, u.memberMgr)).rejects.toThrow(/solo el CAE o el auditor líder/);
    await expect(audits.updateTeamMember(inv.id, memberRow.id, { role: 'LEAD' } as any, u.memberMgr)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(audits.removeTeamMember(inv.id, memberRow.id, u.memberMgr)).rejects.toBeInstanceOf(ForbiddenException);
    expect(await teamOf(inv.id)).toEqual(['lead', 'memberMgr']);

    // las horas presupuestadas las sigue ajustando cualquier gerente del equipo
    await expect(audits.updateTeamMember(inv.id, memberRow.id, { budgetedHours: 40 } as any, u.memberMgr)).resolves.toMatchObject({ budgetedHours: 40 });

    // el auditor líder sí suma a alguien; el CAE lo quita
    await audits.addTeamMember(inv.id, { userId: u.newcomer.id } as any, u.lead);
    expect(await teamOf(inv.id)).toEqual(['lead', 'memberMgr', 'newcomer']);
    const newcomerRow = await prisma.auditTeam.findFirstOrThrow({ where: { auditId: inv.id, userId: u.newcomer.id } });
    await audits.removeTeamMember(inv.id, newcomerRow.id, u.cae);
    expect(await teamOf(inv.id)).toEqual(['lead', 'memberMgr']);

    // quien no es del equipo ni lo ve: ni siquiera llega a la regla
    await expect(audits.addTeamMember(inv.id, { userId: u.newcomer.id } as any, u.manager)).rejects.toThrow(/modo investigación/);
  });

  it('en una auditoría normal cualquier gerente del equipo sigue cambiando el equipo', async () => {
    const normal = await mkAudit('Auditoría normal del equipo', false);
    await expect(audits.addTeamMember(normal.id, { userId: u.newcomer.id } as any, u.memberMgr)).resolves.toBeDefined();
    expect(await teamOf(normal.id)).toEqual(['lead', 'memberMgr', 'newcomer']);
  });

  it('la cobertura de un proyecto no cuenta investigaciones cerradas (ni para el puntaje ni para la fecha que se muestra, ni al CAE)', async () => {
    const projects = new AuditProjectsService(prisma as any);
    const entityOnlyInv = await prisma.auditEntity.create({ data: { organizationId: org.id, name: 'Área con solo una investigación' } });
    const entityNormal = await prisma.auditEntity.create({ data: { organizationId: org.id, name: 'Área auditada hace 2 años' } });
    const monthAgo = new Date(Date.now() - 30 * 86_400_000);
    const twoYearsAgo = new Date(Date.now() - 800 * 86_400_000);
    await mkAudit('Investigación cerrada', true, { status: 'CLOSED', endDate: monthAgo, auditEntityId: entityOnlyInv.id });
    await mkAudit('Auditoría cerrada', false, { status: 'CLOSED', endDate: twoYearsAgo, auditEntityId: entityNormal.id });
    const mkProject = (name: string, entityId: string) => prisma.auditProject.create({
      data: { organizationId: org.id, correlative: `BAP-${randomUUID().slice(0, 5)}`, name, planYear: new Date().getFullYear(), responsibleEntityId: entityId, coverageHistoryScore: 1 },
    });
    const pInv = await mkProject('Proyecto del área con investigación', entityOnlyInv.id);
    const pNor = await mkProject('Proyecto del área auditada', entityNormal.id);

    await projects.syncCoverage(u.cae);
    // sin la investigación, el área no tiene ninguna auditoría cerrada: máximo riesgo de cobertura (antes salía 1 por la investigación)
    expect((await prisma.auditProject.findUniqueOrThrow({ where: { id: pInv.id } })).coverageHistoryScore).toBe(5);
    expect((await prisma.auditProject.findUniqueOrThrow({ where: { id: pNor.id } })).coverageHistoryScore).toBe(3);

    for (const who of [u.cae, u.manager]) {
      const rows: any[] = await projects.findAll(who);
      const row = rows.find((r) => r.id === pInv.id);
      expect(row.coverageGapDays).toBeNull();
      expect(row.lastAuditDate).toBeNull();
    }
  });

  it('los indicadores del plan de QAIP no cuentan ítems ligados a investigaciones', async () => {
    const perf = new PerformanceService(prisma as any, { getOrgWideProfitability: async () => ({}), getAuditFinancialSummary: async () => null } as any);
    const year = 2041;
    const plan = await prisma.auditPlan.create({ data: { organizationId: org.id, year, name: `Plan ${year}`, status: 'ACTIVE' } });
    const normal = await mkAudit('Auditoría del plan', false, { estimatedHours: 100 });
    const inv = await mkAudit('Investigación en el plan', true, { estimatedHours: 500 });
    await prisma.auditPlanItem.create({ data: { planId: plan.id, auditId: normal.id, estimatedHours: 100 } });
    await prisma.auditPlanItem.create({ data: { planId: plan.id, auditId: inv.id, estimatedHours: 500 } });
    await prisma.auditPlanItem.create({ data: { planId: plan.id, auditEntityId: null, estimatedHours: 50 } });

    for (const who of [u.manager, u.cae]) {
      const d: any = await perf.getDashboard(who, year);
      expect(d.workPlanCompliance.totalItems).toBe(2); // el normal y el libre; la investigación no cuenta
      expect(d.workPlanCompliance.startedItems).toBe(1);
      expect(d.profitabilityCompliance.hours.planned).toBe(150); // 100 + 50, sin las 500 de la investigación
    }
  });
});
