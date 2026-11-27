/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomUUID } from 'crypto';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { AuthUser } from '../../auth/jwt.strategy';
import { AuditVisitsService } from './audit-visits.service';

/**
 * El servicio de visitas contra un Postgres REAL (con 2026-11-visitas-1-saldos.sql aplicado):
 *
 *   COLLECTIONS_TEST_DATABASE_URL=postgresql://postgres:test@127.0.0.1:54329/cobros_test node ../../node_modules/jest/bin/jest.js audit-visits.service.integration
 *
 * Reconstruir la base de pruebas si está vacía: python infrastructure/test-db/rebuild_test_db.py
 */
const URL = process.env.COLLECTIONS_TEST_DATABASE_URL;
const suite = URL ? describe : describe.skip;
jest.setTimeout(120_000);

const DATES = { planning: '2026-03-31', interim: '2026-09-30', final: '2026-12-31' };

suite('AuditVisitsService (Postgres real)', () => {
  let prisma: PrismaClient;
  let svc: AuditVisitsService;
  const orgs: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: URL });
    await prisma.$connect();
    svc = new AuditVisitsService(prisma as any);
  });
  afterAll(async () => {
    await prisma.audit.deleteMany({ where: { organizationId: { in: orgs } } });
    await prisma.organization.deleteMany({ where: { id: { in: orgs } } });
    await prisma.$disconnect();
  });

  const world = async () => {
    const id = randomUUID();
    const org = await prisma.organization.create({ data: { name: `Prueba servicio visitas ${id}`, slug: `sv-${id}` } });
    orgs.push(org.id);
    const user = (role = 'AUDIT_MANAGER') => ({ id: `u-${role}-${id}`, role, organizationId: org.id }) as AuthUser;
    const audit = (extra: Record<string, unknown> = {}) =>
      prisma.audit.create({ data: { organizationId: org.id, title: 'Auditoría de prueba', type: 'EXTERNAL_FINANCIAL', ...extra } as any });
    return { org: org.id, user, audit };
  };
  const acc = (code: string, balance: number, name = `Cuenta ${code}`) => ({ code, name, debit: balance > 0 ? balance : 0, credit: balance < 0 ? -balance : 0, balance });
  const BAL_A = [acc('1101', 1000), acc('2101', -1000), acc('4101', 0)]; // cuadra
  const kinds = async (auditId: string) => (await prisma.auditVisit.findMany({ where: { auditId }, orderBy: { cutoffDate: 'asc' } })).map((v) => v.kind);
  const visitOf = async (auditId: string, kind: 'PLANNING' | 'INTERIM' | 'FINAL') => (await prisma.auditVisit.findFirst({ where: { auditId, kind } }))!;
  const importTo = (visitId: string, user: AuthUser, accounts: any[], extra: Record<string, unknown> = {}) =>
    svc.importBalance(visitId, { filename: 'tb.xlsx', accounts, ...extra } as any, user);

  // ── Activar ──────────────────────────────────────────────────────────────

  it('un encargo sin visitas lo dice; activar crea las tres en orden y una segunda activación se rechaza', async () => {
    const w = await world(); const a = await w.audit(); const m = w.user();
    const before = await svc.list(a.id, m);
    expect(before).toMatchObject({ enabled: false, supported: true, visits: [], analysisBase: null, suggestedAnalysisBase: null });

    const after = await svc.enable(a.id, DATES as any, m);
    expect(after.enabled).toBe(true);
    expect(after.visits.map((v) => [v.kind, v.cutoffDate, v.status])).toEqual([
      ['PLANNING', '2026-03-31', 'PLANNED'], ['INTERIM', '2026-09-30', 'PLANNED'], ['FINAL', '2026-12-31', 'PLANNED'],
    ]);
    await expect(svc.enable(a.id, DATES as any, m)).rejects.toBeInstanceOf(ConflictException);
    expect(await prisma.auditVisit.count({ where: { auditId: a.id } })).toBe(3);
  });

  it('activar rechaza fechas fuera de orden, repetidas o inexistentes, sin crear nada', async () => {
    const w = await world(); const a = await w.audit(); const m = w.user();
    for (const bad of [
      { planning: '2026-09-30', interim: '2026-03-31', final: '2026-12-31' },
      { planning: '2026-03-31', interim: '2026-03-31', final: '2026-12-31' },
      { planning: '2026-02-30', interim: '2026-09-30', final: '2026-12-31' },
    ]) {
      await expect(svc.enable(a.id, bad as any, m)).rejects.toBeInstanceOf(BadRequestException);
    }
    expect(await prisma.auditVisit.count({ where: { auditId: a.id } })).toBe(0);
  });

  it('un encargo de otro tipo (p. ej. interno) no admite visitas', async () => {
    const w = await world(); const a = await w.audit({ type: 'INTERNAL' }); const m = w.user();
    expect((await svc.list(a.id, m)).supported).toBe(false);
    await expect(svc.enable(a.id, DATES as any, m)).rejects.toBeInstanceOf(BadRequestException);
  });

  // ── Aislamiento ──────────────────────────────────────────────────────────

  it('otra organización no ve, activa, cambia, carga ni compara nada', async () => {
    const w = await world(); const a = await w.audit(); const m = w.user();
    await svc.enable(a.id, DATES as any, m);
    const v = await visitOf(a.id, 'INTERIM');
    const otra = (await world()).user();
    await expect(svc.list(a.id, otra)).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.enable(a.id, DATES as any, otra)).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.update(v.id, { notes: 'x' }, otra)).rejects.toBeInstanceOf(NotFoundException);
    await expect(importTo(v.id, otra, BAL_A)).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.compare(a.id, 'PLANNING', 'INTERIM', otra)).rejects.toBeInstanceOf(NotFoundException);
    expect(await prisma.trialBalance.count({ where: { auditId: a.id } })).toBe(0);
  });

  it('una investigación ajena al equipo es inaccesible salvo para CAE o más', async () => {
    const w = await world(); const a = await w.audit({ isInvestigationMode: true });
    await expect(svc.list(a.id, w.user('AUDIT_MANAGER'))).rejects.toBeInstanceOf(ForbiddenException);
    await expect(svc.enable(a.id, DATES as any, w.user('AUDIT_MANAGER'))).rejects.toBeInstanceOf(ForbiddenException);
    await expect(svc.enable(a.id, DATES as any, w.user('CAE'))).resolves.toMatchObject({ enabled: true });
  });

  it('en una investigación ajena tampoco se cambia ni se carga nada por el id de una visita', async () => {
    const w = await world(); const a = await w.audit({ isInvestigationMode: true });
    await svc.enable(a.id, DATES as any, w.user('CAE'));
    const v = await visitOf(a.id, 'INTERIM');
    await expect(svc.update(v.id, { notes: 'x' }, w.user('AUDIT_MANAGER'))).rejects.toBeInstanceOf(ForbiddenException);
    await expect(importTo(v.id, w.user('AUDITOR'), BAL_A)).rejects.toBeInstanceOf(ForbiddenException);
    expect(await prisma.trialBalance.count({ where: { auditId: a.id } })).toBe(0);
    await expect(importTo(v.id, w.user('CAE'), BAL_A)).resolves.toMatchObject({ visitId: v.id });
  });

  // ── Balance por visita ───────────────────────────────────────────────────

  it('carga un balance: queda ligado a la visita y a su fecha de corte, con etiqueta por defecto y conteo de cuentas', async () => {
    const w = await world(); const a = await w.audit(); const m = w.user('AUDITOR'); const mgr = w.user();
    await svc.enable(a.id, DATES as any, mgr);
    const v = await visitOf(a.id, 'INTERIM');
    const r = await importTo(v.id, m, BAL_A);
    expect(r).toMatchObject({ visitId: v.id, asOfDate: '2026-09-30', accountCount: 3, isBalanced: true, supersedes: null, warnings: [] });
    expect(r.periodLabel).toBe('Visita interina al 30/09/2026');
    const row = await prisma.trialBalance.findUniqueOrThrow({ where: { id: r.id } });
    expect(row).toMatchObject({ auditId: a.id, orgId: w.org, visitId: v.id, importedById: m.id });

    const lista = await svc.list(a.id, m);
    const interina = lista.visits.find((x) => x.kind === 'INTERIM')!;
    expect(interina.balance).toMatchObject({ id: r.id, accountCount: 3, asOfDate: '2026-09-30' });
    expect(interina.balanceVersions).toBe(1);
    expect(lista.visits.find((x) => x.kind === 'PLANNING')!.balance).toBeNull();
    expect(lista.suggestedAnalysisBase).toBe('INTERIM');
  });

  it('avisa si el balance no cuadra o repite códigos, pero lo carga', async () => {
    const w = await world(); const a = await w.audit(); const m = w.user();
    await svc.enable(a.id, DATES as any, m);
    const v = await visitOf(a.id, 'PLANNING');
    const r = await importTo(v.id, m, [acc('1101', 500), acc('1101', 200), acc('2101', -300)], { periodLabel: 'Saldos de apertura' });
    expect(r.isBalanced).toBe(false);
    expect(r.periodLabel).toBe('Saldos de apertura');
    expect(r.warnings.join(' ')).toMatch(/no cuadra/);
    expect(r.warnings.join(' ')).toMatch(/repetido/);
  });

  it('una diferencia de UN centavo ya es un balance que no cuadra (sin errores de redondeo de decimales)', async () => {
    const w = await world(); const a = await w.audit(); const m = w.user();
    await svc.enable(a.id, DATES as any, m);
    const v = await visitOf(a.id, 'PLANNING');
    const r = await importTo(v.id, m, [acc('1101', 1000.01), acc('2101', -1000)]);
    expect(r.isBalanced).toBe(false);
    expect(r.warnings.join(' ')).toMatch(/0\.01/);
    const ok = await importTo(v.id, m, [acc('1101', 1000.01), acc('2101', -1000.01)]);
    expect(ok.isBalanced).toBe(true);
  });

  it('cargar otra vez NO pisa la anterior: la más reciente es la vigente y la anterior queda como historia', async () => {
    const w = await world(); const a = await w.audit(); const m = w.user();
    await svc.enable(a.id, DATES as any, m);
    const v = await visitOf(a.id, 'FINAL');
    const first = await importTo(v.id, m, BAL_A);
    const second = await importTo(v.id, m, [acc('1101', 2000), acc('2101', -2000)]);
    expect(second.supersedes).toBe(first.id);
    expect(await prisma.trialBalance.count({ where: { visitId: v.id } })).toBe(2);
    const fin = (await svc.list(a.id, m)).visits.find((x) => x.kind === 'FINAL')!;
    expect(fin.balance).toMatchObject({ id: second.id, accountCount: 2 });
    expect(fin.balanceVersions).toBe(2);
  });

  // ── Cuentas de la visita (para copiarlas a B-00) ────────────────────────

  it('las cuentas de una visita son las de su balance VIGENTE, una fila por código y con el saldo neto', async () => {
    const w = await world(); const a = await w.audit(); const m = w.user();
    await svc.enable(a.id, DATES as any, m);
    const v = await visitOf(a.id, 'INTERIM');
    await importTo(v.id, m, [acc('1101', 9999), acc('2101', -9999)]);
    // Vigente: repite 1101 (se suma), trae un saldo con centavos y una cuenta en cero.
    const second = await importTo(v.id, m, [acc('1101', 500.1), acc('1101', 200.2), acc('2101', -700.3), acc('4101', 0, 'Ventas')]);
    const r = await svc.balanceOf(v.id, w.user('AUDITOR'));
    expect(r).toMatchObject({ visitId: v.id, kind: 'INTERIM', cutoffDate: '2026-09-30' });
    expect(r.balance).toMatchObject({ id: second.id, versions: 2, asOfDate: '2026-09-30' });
    expect(r.accounts).toEqual([
      { code: '1101', name: 'Cuenta 1101', balance: 700.3 },
      { code: '2101', name: 'Cuenta 2101', balance: -700.3 },
      { code: '4101', name: 'Ventas', balance: 0 },
    ]);
    expect((r.balance as any).accounts).toBeUndefined();
  });

  it('pedir las cuentas de una visita sin balance lo explica; otra organización o una investigación ajena no las ven', async () => {
    const w = await world(); const a = await w.audit(); const m = w.user();
    await svc.enable(a.id, DATES as any, m);
    const v = await visitOf(a.id, 'PLANNING');
    await expect(svc.balanceOf(v.id, m)).rejects.toThrow(/planificación aún no tiene balance/);
    await importTo(v.id, m, BAL_A);
    await expect(svc.balanceOf(v.id, (await world()).user())).rejects.toBeInstanceOf(NotFoundException);

    const inv = await w.audit({ isInvestigationMode: true });
    await svc.enable(inv.id, DATES as any, w.user('CAE'));
    const vi = await visitOf(inv.id, 'FINAL');
    await importTo(vi.id, w.user('CAE'), BAL_A);
    await expect(svc.balanceOf(vi.id, w.user('AUDIT_MANAGER'))).rejects.toBeInstanceOf(ForbiddenException);
    await expect(svc.balanceOf(vi.id, w.user('CAE'))).resolves.toMatchObject({ visitId: vi.id });
  });

  it('en una visita cerrada, un Auditor no carga; un Gerente sí (corrección como nueva versión)', async () => {
    const w = await world(); const a = await w.audit(); const mgr = w.user(); const aud = w.user('AUDITOR');
    await svc.enable(a.id, DATES as any, mgr);
    const v = await visitOf(a.id, 'PLANNING');
    const first = await importTo(v.id, aud, BAL_A);
    await svc.update(v.id, { status: 'CLOSED' }, mgr);
    await expect(importTo(v.id, aud, BAL_A)).rejects.toBeInstanceOf(ForbiddenException);
    expect(await prisma.trialBalance.count({ where: { visitId: v.id } })).toBe(1);
    const corr = await importTo(v.id, mgr, [acc('1101', 1500), acc('2101', -1500)]);
    expect(corr.supersedes).toBe(first.id);
    expect(await prisma.trialBalance.count({ where: { visitId: v.id } })).toBe(2);
  });

  // ── Cambiar una visita ───────────────────────────────────────────────────

  it('estados: cerrar guarda quién y cuándo; no se vuelve a «planificada» desde cerrada; reabrir limpia el cierre', async () => {
    const w = await world(); const a = await w.audit(); const m = w.user();
    await svc.enable(a.id, DATES as any, m);
    const v = await visitOf(a.id, 'INTERIM');
    await svc.update(v.id, { status: 'IN_PROGRESS' }, m);
    await svc.update(v.id, { status: 'CLOSED' }, m);
    let row = await prisma.auditVisit.findUniqueOrThrow({ where: { id: v.id } });
    expect(row).toMatchObject({ status: 'CLOSED', closedById: m.id });
    expect(row.closedAt).toBeInstanceOf(Date);
    await expect(svc.update(v.id, { status: 'PLANNED' }, m)).rejects.toBeInstanceOf(BadRequestException);
    await svc.update(v.id, { status: 'IN_PROGRESS' }, m);
    row = await prisma.auditVisit.findUniqueOrThrow({ where: { id: v.id } });
    expect(row).toMatchObject({ status: 'IN_PROGRESS', closedAt: null, closedById: null });
  });

  it('fecha de corte: se valida el orden con las otras visitas y no se cambia en una cerrada', async () => {
    const w = await world(); const a = await w.audit(); const m = w.user();
    await svc.enable(a.id, DATES as any, m);
    const interim = await visitOf(a.id, 'INTERIM');
    await expect(svc.update(interim.id, { cutoffDate: '2026-03-01' }, m)).rejects.toBeInstanceOf(BadRequestException); // antes de la planificación
    await expect(svc.update(interim.id, { cutoffDate: '2026-12-31' }, m)).rejects.toBeInstanceOf(BadRequestException); // igual a la final
    await expect(svc.update(interim.id, { cutoffDate: 'ayer' as any }, m)).rejects.toBeInstanceOf(BadRequestException);
    await svc.update(interim.id, { cutoffDate: '2026-10-15' }, m);
    expect((await visitOf(a.id, 'INTERIM')).cutoffDate.toISOString().slice(0, 10)).toBe('2026-10-15');
    await svc.update(interim.id, { status: 'CLOSED' }, m);
    await expect(svc.update(interim.id, { cutoffDate: '2026-10-20' }, m)).rejects.toBeInstanceOf(BadRequestException);
    expect((await visitOf(a.id, 'INTERIM')).cutoffDate.toISOString().slice(0, 10)).toBe('2026-10-15');
  });

  it('notas: se recortan y vacías se borran', async () => {
    const w = await world(); const a = await w.audit(); const m = w.user();
    await svc.enable(a.id, DATES as any, m);
    const v = await visitOf(a.id, 'FINAL');
    await svc.update(v.id, { notes: '  Pendiente de confirmaciones  ' }, m);
    expect((await visitOf(a.id, 'FINAL')).notes).toBe('Pendiente de confirmaciones');
    await svc.update(v.id, { notes: '   ' }, m);
    expect((await visitOf(a.id, 'FINAL')).notes).toBeNull();
  });

  // ── Base de análisis ─────────────────────────────────────────────────────

  it('base de análisis: exige balance, es única por encargo y se puede quitar', async () => {
    const w = await world(); const a = await w.audit(); const m = w.user();
    await svc.enable(a.id, DATES as any, m);
    const interim = await visitOf(a.id, 'INTERIM'); const final = await visitOf(a.id, 'FINAL');
    await expect(svc.update(interim.id, { isAnalysisBase: true }, m)).rejects.toBeInstanceOf(BadRequestException); // sin balance
    await importTo(interim.id, m, BAL_A); await importTo(final.id, m, BAL_A);

    await svc.update(interim.id, { isAnalysisBase: true }, m);
    expect((await svc.list(a.id, m)).analysisBase).toBe('INTERIM');
    const l = await svc.update(final.id, { isAnalysisBase: true }, m); // pasa la marca
    expect(l.analysisBase).toBe('FINAL');
    expect(await prisma.auditVisit.count({ where: { auditId: a.id, isAnalysisBase: true } })).toBe(1);
    const q = await svc.update(final.id, { isAnalysisBase: false }, m);
    expect(q.analysisBase).toBeNull();
    expect(q.suggestedAnalysisBase).toBe('FINAL');
  });

  it('la base de análisis de un encargo no afecta a la de otro', async () => {
    const w = await world(); const a1 = await w.audit(); const a2 = await w.audit(); const m = w.user();
    for (const a of [a1, a2]) { await svc.enable(a.id, DATES as any, m); await importTo((await visitOf(a.id, 'FINAL')).id, m, BAL_A); }
    await svc.update((await visitOf(a1.id, 'FINAL')).id, { isAnalysisBase: true }, m);
    await svc.update((await visitOf(a2.id, 'FINAL')).id, { isAnalysisBase: true }, m);
    expect((await svc.list(a1.id, m)).analysisBase).toBe('FINAL');
    expect((await svc.list(a2.id, m)).analysisBase).toBe('FINAL');
  });

  // ── Comparación ──────────────────────────────────────────────────────────

  it('compara dos visitas por código usando el balance VIGENTE de cada una', async () => {
    const w = await world(); const a = await w.audit(); const m = w.user();
    await svc.enable(a.id, DATES as any, m);
    const interim = await visitOf(a.id, 'INTERIM'); const final = await visitOf(a.id, 'FINAL');
    await importTo(interim.id, m, [acc('1101', 1000), acc('1201', 400), acc('2101', -1400)]);
    await importTo(final.id, m, [acc('1101', 900), acc('2101', -900)]); // versión antigua: se corrige después
    await importTo(final.id, m, [acc('1101', 1500), acc('1301', 100), acc('2101', -1600)]);
    const r = await svc.compare(a.id, 'INTERIM', 'FINAL', m);
    expect(r.from).toMatchObject({ kind: 'INTERIM', cutoffDate: '2026-09-30' });
    expect(r.to).toMatchObject({ kind: 'FINAL', cutoffDate: '2026-12-31' });
    expect(r.summary).toMatchObject({ NUEVA: 1, DESAPARECIDA: 1, CAMBIO: 2 });
    const byCode = Object.fromEntries(r.rows.map((x) => [x.code, x]));
    expect(byCode['1101']).toMatchObject({ status: 'CAMBIO', delta: 500, deltaPct: 50 });
    expect(byCode['1301'].status).toBe('NUEVA');
    expect(byCode['1201'].status).toBe('DESAPARECIDA');
    expect(r.warnings).toEqual([]);
  });

  it('comparar avisa si un balance no cuadra y explica qué falta', async () => {
    const w = await world(); const a = await w.audit(); const m = w.user();
    await svc.enable(a.id, DATES as any, m);
    const planning = await visitOf(a.id, 'PLANNING'); const interim = await visitOf(a.id, 'INTERIM');
    await expect(svc.compare(a.id, 'PLANNING', 'INTERIM', m)).rejects.toThrow(/planificación aún no tiene balance/);
    await importTo(planning.id, m, [acc('1101', 100), acc('2101', -50)]); // no cuadra
    await expect(svc.compare(a.id, 'PLANNING', 'INTERIM', m)).rejects.toThrow(/interina aún no tiene balance/);
    await importTo(interim.id, m, BAL_A);
    const r = await svc.compare(a.id, 'PLANNING', 'INTERIM', m);
    expect(r.warnings).toEqual([expect.stringMatching(/planificación no cuadra/)]);
  });

  it('comparar avisa también si el balance de destino no cuadra', async () => {
    const w = await world(); const a = await w.audit(); const m = w.user();
    await svc.enable(a.id, DATES as any, m);
    await importTo((await visitOf(a.id, 'INTERIM')).id, m, BAL_A);
    await importTo((await visitOf(a.id, 'FINAL')).id, m, [acc('1101', 100), acc('2101', -50)]);
    const r = await svc.compare(a.id, 'INTERIM', 'FINAL', m);
    expect(r.warnings).toEqual([expect.stringMatching(/final no cuadra/)]);
  });

  it('comparar valida los tipos de visita', async () => {
    const w = await world(); const a = await w.audit(); const m = w.user();
    await svc.enable(a.id, DATES as any, m);
    // Con balances cargados: el rechazo debe venir de la regla, no de que falte un balance.
    await importTo((await visitOf(a.id, 'INTERIM')).id, m, BAL_A);
    await expect(svc.compare(a.id, 'INTERIM', 'INTERIM', m)).rejects.toThrow(/dos visitas distintas/);
    await expect(svc.compare(a.id, 'INTERIM', 'INTERIM', m)).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.compare(a.id, 'INTERIM', 'OTRA', m)).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.compare(a.id, undefined as any, 'FINAL', m)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('un encargo sin visitas no se puede comparar y lo dice', async () => {
    const w = await world(); const a = await w.audit(); const m = w.user();
    await expect(svc.compare(a.id, 'INTERIM', 'FINAL', m)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('los balances sin visita (carga anterior de B-00) no entran en las visitas', async () => {
    const w = await world(); const a = await w.audit(); const m = w.user();
    await prisma.trialBalance.create({ data: { auditId: a.id, orgId: w.org, filename: 'viejo.xlsx', periodLabel: 'Dic 2025', accounts: BAL_A, totalDebit: 1000, totalCredit: 1000, isBalanced: true, importedById: 'u' } as any });
    await svc.enable(a.id, DATES as any, m);
    const lista = await svc.list(a.id, m);
    expect(lista.visits.every((v) => v.balance === null)).toBe(true);
    expect(await kinds(a.id)).toEqual(['PLANNING', 'INTERIM', 'FINAL']);
  });
});
