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

  // ── Puente interina → final ──────────────────────────────────────────────

  const PERIOD = { auditPeriodStart: new Date('2026-01-01T00:00:00Z'), auditPeriodEnd: new Date('2026-12-31T00:00:00Z') };
  const INTERIM = [acc('1101', 1000), acc('1201', 400), acc('2101', -400), acc('4101', -9000), acc('5101', 3000), acc('1301', 5000)];
  const FINAL = [acc('1101', 1500), acc('1201', 450), acc('2101', -400), acc('4101', -17000), acc('5101', 4000), acc('1401', 900)];
  /** Auditoría con visitas activas y los dos balances cargados (interina y final). */
  const bridgeWorld = async (extra: Record<string, unknown> = {}, me: number | null = 200) => {
    const w = await world();
    const a = await w.audit({ ...PERIOD, ...extra });
    const m = w.user();
    await svc.enable(a.id, DATES as any, m);
    await importTo((await visitOf(a.id, 'INTERIM')).id, m, INTERIM);
    await importTo((await visitOf(a.id, 'FINAL')).id, m, FINAL);
    if (me !== null) await paperA4(a.id, me);
    return { ...w, a, m };
  };
  const paperA4 = (auditId: string, s4: unknown) => prisma.workingPaper.create({
    data: { auditId, code: 'A-06', indexSection: 'A', title: 'Materialidad', type: 'PLANNING_UNDERSTANDING', paperCode: 'PT-A4', sections: { create: [{ sectionKey: 'S4', label: 'ME', fieldType: 'NUMBER', value: s4 as any }] } } as any,
  });
  const gridPaper = (auditId: string, code: string, fieldType = 'PROCEDURE_GRID') => prisma.workingPaper.create({
    data: { auditId, code, indexSection: 'C', title: `Papel ${code}`, type: 'SUBSTANTIVE_TEST', paperCode: 'PT-FIN-C-SUST', sections: { create: [{ sectionKey: 'S3', label: 'Procedimientos', fieldType }] } },
    include: { sections: true },
  } as any) as Promise<any>;
  const row = (b: any, code: string) => b.rows.find((r: any) => r.code === code);

  it('puente: marca movimientos sobre la materialidad y desvíos de resultados sobre el esperado, y muestra de dónde sale cada dato', async () => {
    const { a, m } = await bridgeWorld();
    const b = await svc.bridge(a.id, undefined, m);
    expect(b.materiality).toEqual({ execution: 200, source: 'PT-A4' });
    expect(b.period).toEqual({ start: '2026-01-01', end: '2026-12-31', source: 'ENCARGO' });
    expect(b.annualizationFactor).toBeCloseTo(365 / 273, 6);
    expect(b.pctThreshold).toBe(20);
    // Balance: |movimiento| 500 > 200 → alerta; 50 no.
    expect(row(b, '1101')).toMatchObject({ presence: 'AMBAS', movement: 500, alert: true, reason: 'MOVIMIENTO_SOBRE_ME' });
    expect(row(b, '1201')).toMatchObject({ movement: 50, alert: false });
    // Resultados: esperado = -9000 × 365/273 = -12032.97; desvío -4967.03 (41 %) → alerta.
    expect(row(b, '4101')).toMatchObject({ expectedFinal: -12032.97, deviation: -4967.03, alert: true, reason: 'DESVIO_SOBRE_ESPERADO' });
    expect(row(b, '4101').deviationPct).toBeCloseTo(41.28, 2);
    // Cuentas en una sola visita.
    expect(row(b, '1301')).toMatchObject({ presence: 'SOLO_INTERINA', alert: true, reason: 'CUENTA_DESAPARECIDA_MATERIAL' });
    expect(row(b, '1401')).toMatchObject({ presence: 'SOLO_FINAL', alert: true, reason: 'CUENTA_NUEVA_MATERIAL' });
    expect(row(b, '4101').suggestedStep).toMatch(/NIA 330/);
    expect(b.alerts).toBe(b.rows.filter((r: any) => r.alert).length);
    expect(b.rows.every((r: any) => r.stepId === null)).toBe(true);
  });

  it('puente: el umbral porcentual se puede cambiar y se valida', async () => {
    const { a, m } = await bridgeWorld();
    // 5101: esperado 4010.99, final 4000 → desvío -10.99, menor a la ME: no alerta aunque el umbral sea 0.
    expect(row(await svc.bridge(a.id, '0', m), '5101').alert).toBe(false);
    // Con un umbral de 50 % la cuenta 4101 (41 %) deja de alertar.
    expect(row(await svc.bridge(a.id, '50', m), '4101')).toMatchObject({ alert: false, reason: null, suggestedStep: null });
    for (const bad of ['abc', '-1', '5000', 'NaN']) await expect(svc.bridge(a.id, bad, m)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('puente: sin la materialidad del papel usa la del encargo; sin ninguna avisa y no marca alertas', async () => {
    const own = await bridgeWorld({ materialityExecution: 300 }, null);
    const b1 = await svc.bridge(own.a.id, undefined, own.m);
    expect(b1.materiality).toEqual({ execution: 300, source: 'ENCARGO' });
    expect(row(b1, '1101').alert).toBe(true);

    // Un valor no numérico en PT-A4 no cuenta: cae a la del encargo.
    const bad = await bridgeWorld({ materialityExecution: 300 }, null);
    await paperA4(bad.a.id, 'n/a');
    expect((await svc.bridge(bad.a.id, undefined, bad.m)).materiality).toEqual({ execution: 300, source: 'ENCARGO' });

    // Un cero (en el papel o en el encargo) no es una materialidad: no se usa ni se muestra como tal.
    const zeroPaper = await bridgeWorld({ materialityExecution: 300 }, 0);
    expect((await svc.bridge(zeroPaper.a.id, undefined, zeroPaper.m)).materiality).toEqual({ execution: 300, source: 'ENCARGO' });
    const zeroOwn = await bridgeWorld({ materialityExecution: 0 }, null);
    expect((await svc.bridge(zeroOwn.a.id, undefined, zeroOwn.m)).materiality).toEqual({ execution: null, source: null });

    const none = await bridgeWorld({}, null);
    const b2 = await svc.bridge(none.a.id, undefined, none.m);
    expect(b2.materiality).toEqual({ execution: null, source: null });
    expect(b2.alerts).toBe(0);
    expect(b2.warnings.join(' ')).toMatch(/no tiene materialidad de ejecución/);
    expect(row(b2, '1101')).toMatchObject({ movement: 500, alert: false });
  });

  it('puente: sin ejercicio definido asume el año de la interina; un corte fuera del ejercicio avisa y no proyecta resultados', async () => {
    const sin = await bridgeWorld({ auditPeriodStart: null, auditPeriodEnd: null });
    const b = await svc.bridge(sin.a.id, undefined, sin.m);
    expect(b.period).toEqual({ start: null, end: null, source: 'ANO_CALENDARIO' });
    expect(b.annualizationFactor).toBeCloseTo(365 / 273, 6);

    const fuera = await bridgeWorld({ auditPeriodStart: new Date('2025-01-01T00:00:00Z'), auditPeriodEnd: new Date('2025-12-31T00:00:00Z') });
    const f = await svc.bridge(fuera.a.id, undefined, fuera.m);
    expect(f.annualizationFactor).toBeNull();
    expect(f.warnings.join(' ')).toMatch(/fuera del ejercicio/);
    // Sin proyección, una cuenta de resultados se compara por su movimiento (regla del paso 1), y lo dice el aviso.
    expect(row(f, '4101')).toMatchObject({ expectedFinal: null, deviation: null, alert: true, reason: 'MOVIMIENTO_SOBRE_ME' });
    expect(row(f, '1101').alert).toBe(true);
  });

  it('puente: exige las dos visitas con balance y avisa si alguno no cuadra', async () => {
    const w = await world(); const a = await w.audit(PERIOD); const m = w.user();
    await expect(svc.bridge(a.id, undefined, m)).rejects.toBeInstanceOf(NotFoundException);
    await svc.enable(a.id, DATES as any, m);
    await expect(svc.bridge(a.id, undefined, m)).rejects.toThrow(/interina aún no tiene balance/);
    await importTo((await visitOf(a.id, 'INTERIM')).id, m, INTERIM);
    await expect(svc.bridge(a.id, undefined, m)).rejects.toThrow(/final aún no tiene balance/);
    await importTo((await visitOf(a.id, 'FINAL')).id, m, FINAL);
    const b = await svc.bridge(a.id, undefined, m);
    expect(b.warnings.join(' ')).toMatch(/final no cuadra/);
    expect(b.warnings.join(' ')).not.toMatch(/interina no cuadra/);
    await importTo((await visitOf(a.id, 'INTERIM')).id, m, [acc('1101', 5)]);
    expect((await svc.bridge(a.id, undefined, m)).warnings.join(' ')).toMatch(/interina no cuadra/);
  });

  it('puente: otra organización o una investigación ajena no lo ven ni crean pasos', async () => {
    const { a } = await bridgeWorld();
    const grid = await gridPaper(a.id, 'C-01');
    const otra = (await world()).user();
    await expect(svc.bridge(a.id, undefined, otra)).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.bridgeTargets(a.id, otra)).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.createBridgeSteps(a.id, { sectionId: grid.sections[0].id, codes: ['1101'] }, otra)).rejects.toBeInstanceOf(NotFoundException);
    expect(await prisma.auditStep.count({ where: { procedure: { section: { paper: { auditId: a.id } } } } })).toBe(0);

    const w = await world(); const inv = await w.audit({ ...PERIOD, isInvestigationMode: true });
    await svc.enable(inv.id, DATES as any, w.user('CAE'));
    await expect(svc.bridge(inv.id, undefined, w.user('AUDIT_MANAGER'))).rejects.toBeInstanceOf(ForbiddenException);
    await expect(svc.bridgeTargets(inv.id, w.user('AUDIT_MANAGER'))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('destinos: solo las cuadrículas de procedimientos de ESTE encargo, ordenadas por código', async () => {
    const { a, m } = await bridgeWorld();
    await gridPaper(a.id, 'C-10'); await gridPaper(a.id, 'C-02'); await gridPaper(a.id, 'C-03', 'TEXT');
    const otro = await bridgeWorld(); await gridPaper(otro.a.id, 'C-01');
    const t = await svc.bridgeTargets(a.id, m);
    expect(t.map((x) => x.paperCode)).toEqual(['C-02', 'C-10']);
    expect(t[0]).toMatchObject({ sectionLabel: 'Procedimientos', procedureCount: 0 });
  });

  it('aceptar pasos: crea el procedimiento del período restante y un paso ROLLFORWARD por cuenta con alerta, con el texto del servidor', async () => {
    const { a, m } = await bridgeWorld();
    const grid = await gridPaper(a.id, 'C-01'); const sectionId = grid.sections[0].id;
    const r = await svc.createBridgeSteps(a.id, { sectionId, codes: ['1101', '4101', '1201', '9999', '1101'] }, m);
    expect(r.created).toBe(2);
    expect(r.skipped).toEqual(expect.arrayContaining([
      { code: '1201', reason: expect.stringMatching(/no tiene alerta/) },
      { code: '9999', reason: expect.stringMatching(/no figura en el puente/) },
    ]));
    const proc = await prisma.auditProcedure.findFirstOrThrow({ where: { sectionId }, include: { steps: { orderBy: { sortOrder: 'asc' } } } });
    expect(proc).toMatchObject({ refNumber: 'RF-NIA330' });
    expect(proc.steps.map((s) => [s.refNumber, s.timing, s.status, s.conclusion, s.testType])).toEqual([
      ['RF-1101', 'ROLLFORWARD', 'DRAFT', 'PENDING', 'DETAIL'], ['RF-4101', 'ROLLFORWARD', 'DRAFT', 'PENDING', 'DETAIL'],
    ]);
    expect(proc.steps[0].description).toMatch(/1101/);
    expect(proc.steps[0].population).toBe('Cuenta 1101: saldo interina 1000.00 → saldo final 1500.00 (movimiento 500.00)');

    // El puente ya sabe qué cuentas tienen paso.
    const b = await svc.bridge(a.id, undefined, m);
    expect(row(b, '1101').stepId).toBe(proc.steps[0].id);
    expect(row(b, '1201').stepId).toBeNull();
  });

  it('aceptar pasos no se repite: una segunda vez omite las cuentas que ya tienen paso y reutiliza el procedimiento', async () => {
    const { a, m } = await bridgeWorld();
    const sectionId = (await gridPaper(a.id, 'C-01')).sections[0].id;
    await svc.createBridgeSteps(a.id, { sectionId, codes: ['1101'] }, m);
    const again = await svc.createBridgeSteps(a.id, { sectionId, codes: ['1101', '1401'] }, m);
    expect(again.created).toBe(1);
    expect(again.skipped).toEqual([{ code: '1101', reason: expect.stringMatching(/Ya tiene un paso/) }]);
    // El paso nuevo va después del que ya había.
    const orden = await prisma.auditStep.findMany({ where: { procedure: { sectionId } }, orderBy: { sortOrder: 'asc' }, select: { refNumber: true, sortOrder: true } });
    expect(orden).toEqual([{ refNumber: 'RF-1101', sortOrder: 0 }, { refNumber: 'RF-1401', sortOrder: 1 }]);
    expect(await prisma.auditProcedure.count({ where: { sectionId } })).toBe(1);
    const only = await svc.createBridgeSteps(a.id, { sectionId, codes: ['1101', '1401'] }, m);
    expect(only).toMatchObject({ created: 0, procedureId: null });
    expect(await prisma.auditStep.count({ where: { procedure: { sectionId } } })).toBe(2);
    // Un paso por cuenta en TODO el encargo: aunque se elija otra cuadrícula, no se duplica.
    const other = (await gridPaper(a.id, 'C-02')).sections[0].id;
    expect((await svc.createBridgeSteps(a.id, { sectionId: other, codes: ['1101'] }, m)).created).toBe(0);
    expect(await prisma.auditProcedure.count({ where: { sectionId: other } })).toBe(0);
  });

  it('aceptar pasos a la vez no duplica (se serializa por encargo)', async () => {
    const { a, m } = await bridgeWorld();
    const sectionId = (await gridPaper(a.id, 'C-01')).sections[0].id;
    const dto = { sectionId, codes: ['1101', '4101', '1401'] };
    const todos = await Promise.all(Array.from({ length: 6 }, () => svc.createBridgeSteps(a.id, dto, m)));
    expect(todos.reduce((n, r) => n + r.created, 0)).toBe(3);
    expect(await prisma.auditStep.count({ where: { procedure: { sectionId } } })).toBe(3);
    expect(await prisma.auditProcedure.count({ where: { sectionId } })).toBe(1);
  });

  it('aceptar pasos solo en una cuadrícula de procedimientos de este encargo', async () => {
    const { a, m } = await bridgeWorld();
    const texto = (await gridPaper(a.id, 'C-01', 'TEXT')).sections[0].id;
    const ajeno = (await gridPaper((await bridgeWorld()).a.id, 'C-01')).sections[0].id;
    for (const sectionId of [texto, ajeno, 'no-existe']) {
      await expect(svc.createBridgeSteps(a.id, { sectionId, codes: ['1101'] }, m)).rejects.toBeInstanceOf(NotFoundException);
    }
    expect(await prisma.auditProcedure.count({ where: { section: { paper: { auditId: a.id } } } })).toBe(0);
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
