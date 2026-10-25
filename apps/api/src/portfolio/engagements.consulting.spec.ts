/* eslint-disable @typescript-eslint/no-explicit-any */
import { BadRequestException, ConflictException } from '@nestjs/common';
import { AuditType, EngagementKind, EngagementStatus, PhaseType } from '@prisma/client';
import { EngagementsService, CONSULTING_PHASES } from './engagements.service';

/**
 * Encargos de CONSULTORÍA (fase 3-0 de cobros):
 *  · una consultoría necesita nombre y no usa plantilla de auditoría;
 *  · "una auditoría por cliente y año" sigue valiendo, pero solo para auditorías: un cliente puede tener varias consultorías;
 *  · aprobar una consultoría crea una auditoría OPERATIONAL/CONSULTORIA con las tres etapas básicas, sin plantilla ni expediente;
 *  · el nombre solo se edita en consultorías y se mantiene igual en su auditoría real.
 */
const USER: any = { id: 'u1', organizationId: 'org1', role: 'AUDIT_MANAGER' };

function makeService(opts: { engagement?: any; existingAudit?: boolean; claimCount?: number; investigation?: boolean } = {}) {
  const calls = { auditCreate: [] as any[], phases: [] as any[], engagementCreate: [] as any[], engagementUpdate: [] as any[], auditUpdate: [] as any[], scaffold: 0 };
  const eng = opts.engagement;
  const tx: any = {
    audit: {
      create: async ({ data }: any) => { calls.auditCreate.push(data); return { id: 'aud1', ...data }; },
      update: async (a: any) => { calls.auditUpdate.push(a); return {}; },
    },
    auditTeam: { upsert: async () => ({}) },
    auditPhase: { createMany: async ({ data }: any) => { calls.phases.push(...data); return { count: data.length }; } },
    engagement: {
      update: async (a: any) => { calls.engagementUpdate.push(a); return { ...eng, ...a.data }; },
      updateMany: async () => ({ count: opts.claimCount ?? 1 }), // el reclamo DRAFT → APPROVED
    },
    client: { findUnique: async () => ({ id: 'c1', auditEntityId: 'ae1', legalName: 'Cliente SA' }), update: async () => ({}) },
    $queryRaw: async () => [],
  };
  const prisma: any = {
    engagement: {
      findFirst: async () => (opts.existingAudit ? { id: 'engOld' } : null),
      findUnique: async () => eng ?? null,
      create: async ({ data }: any) => { calls.engagementCreate.push(data); return { id: 'eng1', ...data }; },
      update: tx.engagement.update,
    },
    // Modo investigación: la auditoría del encargo (visible para el equipo; si `investigation`, el usuario NO es del equipo).
    audit: {
      findFirst: async () => ({ id: 'aud1', isInvestigationMode: !!opts.investigation, team: [] }),
      findMany: async () => (opts.investigation ? [{ id: 'aud1' }] : []),
    },
    engagementLetter: { findUnique: async () => null },
    auditTemplate: { findFirst: async () => { throw new Error('una consultoría no debe resolver plantilla'); } },
    user: { findFirst: async () => ({ id: 'p1' }) },
    client: { findUnique: async () => ({ id: 'c1', auditEntityId: 'ae1', legalName: 'Cliente SA' }), update: async () => ({}) },
    $transaction: async (cb: any) => cb(tx),
  };
  const clients: any = { getClientOrThrow: async () => ({ id: 'c1', status: 'ACTIVE', legalName: 'Cliente SA' }) };
  const auditIndex: any = { scaffold: async () => { calls.scaffold++; } };
  const auditFolders: any = { initializeFromAuditTemplateSections: async () => { calls.scaffold++; } };
  const service = new EngagementsService(prisma, clients, auditIndex, auditFolders);
  return { service, calls };
}

const baseDto = { clientId: 'c1', fiscalYear: 2026, fiscalYearEndDate: '2026-12-31' };

describe('crear encargos de consultoría', () => {
  it('una consultoría exige nombre', async () => {
    const { service } = makeService();
    await expect(service.create({ ...baseDto, kind: EngagementKind.CONSULTING }, USER)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.create({ ...baseDto, kind: EngagementKind.CONSULTING, title: '   ' }, USER)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('una consultoría no admite plantilla de auditoría', async () => {
    const { service } = makeService();
    await expect(
      service.create({ ...baseDto, kind: EngagementKind.CONSULTING, title: 'Asesoría tributaria', templateId: 't1' }, USER),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('puede haber una consultoría aunque ya exista una auditoría del mismo cliente y año', async () => {
    const { service, calls } = makeService({ existingAudit: true });
    await service.create({ ...baseDto, kind: EngagementKind.CONSULTING, title: 'Asesoría tributaria 2026' }, USER);
    expect(calls.engagementCreate[0]).toMatchObject({ kind: 'CONSULTING', title: 'Asesoría tributaria 2026' });
  });

  it('una segunda AUDITORÍA del mismo cliente y año se rechaza', async () => {
    const { service } = makeService({ existingAudit: true });
    await expect(service.create(baseDto, USER)).rejects.toBeInstanceOf(ConflictException);
  });

  it('sin tipo indicado se crea una auditoría, como siempre', async () => {
    const { service, calls } = makeService();
    await service.create(baseDto, USER);
    expect(calls.engagementCreate[0]).toMatchObject({ kind: 'AUDIT', title: null });
  });
});

describe('aprobar una consultoría', () => {
  const consulting = {
    id: 'eng1', organizationId: 'org1', clientId: 'c1', kind: EngagementKind.CONSULTING, title: 'Asesoría tributaria 2026',
    status: EngagementStatus.DRAFT, fiscalYear: 2026, fiscalYearEndDate: new Date('2026-12-31'), plannedStartDate: null, plannedEndDate: null,
    leadPartnerId: null, templateId: null, engagementLetter: null, auditId: null, notes: null,
    client: { id: 'c1', legalName: 'Cliente SA', auditEntityId: 'ae1' },
  };

  it('crea una auditoría OPERATIONAL/CONSULTORIA con las tres etapas y sin plantilla ni expediente', async () => {
    const { service, calls } = makeService({ engagement: consulting });
    const res: any = await service.approve('eng1', USER);
    expect(calls.auditCreate).toHaveLength(1);
    expect(calls.auditCreate[0]).toMatchObject({
      type: AuditType.OPERATIONAL, subtype: 'CONSULTORIA', templateId: null, title: 'Cliente SA — Asesoría tributaria 2026',
    });
    expect(calls.phases.map((p) => [p.phaseType, p.name])).toEqual([
      [PhaseType.PLANNING, 'Planificación'], [PhaseType.FIELDWORK, 'Ejecución'], [PhaseType.REPORTING, 'Informes y cierre'],
    ]);
    expect(CONSULTING_PHASES).toHaveLength(3);
    expect(res.status).toBe(EngagementStatus.APPROVED);
    expect(res.auditId).toBe('aud1');
    // el expediente (papeles y carpetas) no se precarga
    await new Promise((r) => setImmediate(r));
    expect(calls.scaffold).toBe(0);
  });

  it('no se aprueba dos veces', async () => {
    const { service } = makeService({ engagement: { ...consulting, status: EngagementStatus.APPROVED } });
    await expect(service.approve('eng1', USER)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('si otra aprobación gana el reclamo, esta recibe 409 y no crea auditoría ni etapas', async () => {
    const { service, calls } = makeService({ engagement: consulting, claimCount: 0 });
    await expect(service.approve('eng1', USER)).rejects.toBeInstanceOf(ConflictException);
    expect(calls.auditCreate).toHaveLength(0);
    expect(calls.phases).toHaveLength(0);
  });
});

describe('editar un encargo', () => {
  const consulting = {
    id: 'eng1', organizationId: 'org1', clientId: 'c1', kind: EngagementKind.CONSULTING, title: 'Viejo', status: EngagementStatus.APPROVED,
    plannedStartDate: new Date('2026-02-01'), plannedEndDate: new Date('2026-06-01'), auditId: 'aud1', leadPartnerId: 'p1',
    client: { id: 'c1', legalName: 'Cliente SA' },
  };

  it('renombrar una consultoría renombra también su auditoría', async () => {
    const { service, calls } = makeService({ engagement: consulting });
    await service.update('eng1', { title: 'Nuevo nombre' }, USER);
    expect(calls.engagementUpdate[0].data).toMatchObject({ title: 'Nuevo nombre' });
    expect(calls.auditUpdate[0]).toMatchObject({ where: { id: 'aud1' }, data: { title: 'Cliente SA — Nuevo nombre' } });
  });

  it('una consultoría cuya auditoría es una investigación ajena no se renombra y la respuesta no muestra su auditoría', async () => {
    const withAudit = { ...consulting, audit: { id: 'aud1', title: 'Investigación reservada', status: 'IN_PROGRESS', type: 'OPERATIONAL', templateId: null } };
    const hidden = makeService({ engagement: withAudit, investigation: true });
    await expect(hidden.service.update('eng1', { title: 'Nuevo nombre' }, USER)).rejects.toThrow(/modo investigación/);
    expect(hidden.calls.auditUpdate).toHaveLength(0);
    // otros campos sí se editan, pero la respuesta no revela la auditoría
    const res: any = await hidden.service.update('eng1', { notes: 'nota' }, USER);
    expect(res.audit).toEqual({ id: 'aud1', title: 'Encargo restringido', restricted: true });
  });

  it('el nombre de solo espacios no pasa', async () => {
    const { service } = makeService({ engagement: consulting });
    await expect(service.update('eng1', { title: '     ' }, USER)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.create({ ...baseDto, kind: EngagementKind.CONSULTING, title: '   ab   ' }, USER)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('el nombre no se edita en una auditoría', async () => {
    const { service } = makeService({ engagement: { ...consulting, kind: EngagementKind.AUDIT, title: null } });
    await expect(service.update('eng1', { title: 'Otro' }, USER)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('el socio a cargo solo cambia mientras es borrador', async () => {
    const { service } = makeService({ engagement: consulting });
    await expect(service.update('eng1', { leadPartnerId: 'p2' }, USER)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rechaza fechas al revés y encargos cancelados', async () => {
    const { service } = makeService({ engagement: consulting });
    await expect(service.update('eng1', { plannedEndDate: '2026-01-01' }, USER)).rejects.toBeInstanceOf(BadRequestException);
    const { service: s2 } = makeService({ engagement: { ...consulting, status: EngagementStatus.CANCELLED } });
    await expect(s2.update('eng1', { notes: 'x' }, USER)).rejects.toBeInstanceOf(BadRequestException);
  });
});
