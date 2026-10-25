/* eslint-disable @typescript-eslint/no-explicit-any */
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { FakeHoursDb } from './testing/fake-hours-db';
import { TimesheetService } from './timesheet.service';
import { HoursCloseService } from './hours-close.service';
import { HoursCloseScheduler } from './hours-close.scheduler';
import { PlansService } from '../plans/plans.service';
import { AuditBackupRestoreService } from '../audits/backup/audit-backup-restore.service';
import { assertNoClosedHours, ENTRY_PUBLIC_SELECT } from './hours-close.util';
import { QueryAdjustmentsDto } from './dto/timesheet.dto';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';

/**
 * Cierre de horas por persona y mes. Todo corre contra una base en memoria (la real es producción) con los servicios REALES:
 * TimesheetService, PlansService (las dos rutas que escriben horas), HoursCloseService y su tarea programada.
 * Hoy simulado: 22-oct-2026, así que septiembre de 2026 ya terminó y octubre no.
 */
beforeEach(() => { jest.useFakeTimers({ now: new Date('2026-10-22T15:00:00Z') }); });
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

const SEPT = { year: 2026, month: 9 };
const entry = (over: Record<string, unknown> = {}) => ({
  workDate: '2026-09-10', hours: 8, category: 'CLIENT_BILLABLE', auditId: 'aud1', description: 'Revisión de cuentas por cobrar', ...over,
}) as any;

function setup(opts: { enabled?: boolean } = { enabled: true }) {
  const db = new FakeHoursDb();
  const u = db.seedOrgUsers();
  db.seedAudit('aud1');
  if (opts.enabled !== false) db.enable('org1');
  const prisma = db as any;
  const email = { send: jest.fn().mockResolvedValue({ sent: true, emailId: 'e1' }) };
  const ts = new TimesheetService(prisma);
  const plans = new PlansService(prisma);
  const hc = new HoursCloseService(prisma, email as any);
  const scheduler = new HoursCloseScheduler(prisma, hc);
  const close = (by: any, userId = u.auditor.id, period = SEPT, note?: string) => hc.closePeriod({ ...period, userId, note } as any, by);
  const reopen = (by: any, userId = u.auditor.id, reason = 'Falta una semana de visita') => hc.reopenPeriod({ ...SEPT, userId, reason } as any, by);
  return { db, u, ts, plans, hc, scheduler, email, close, reopen };
}

describe('Con el cierre apagado nada cambia', () => {
  it('sin fila de parámetros se escribe, edita y borra como siempre, aunque exista una fila CLOSED', async () => {
    const { db, u, ts } = setup({ enabled: false });
    db.tables.hoursPeriodClose.rows.push({ id: 'c1', organizationId: 'org1', userId: u.auditor.id, year: 2026, month: 9, status: 'CLOSED' });
    const e = await ts.createEntry(entry({ description: '' }), u.auditor); // sin descripción: tampoco se exige
    await ts.updateEntry(e.id, { hours: 5 } as any, u.auditor);
    await ts.deleteEntry(e.id, u.auditor);
    expect(db.entries()).toHaveLength(0);
  });

  it('el cierre y los ajustes piden que esté activado', async () => {
    const { u, hc, close } = setup({ enabled: false });
    await expect(close(u.manager)).rejects.toThrow(/no está activado/);
    await expect(hc.createAdjustment({ action: 'ADD', entry: entry(), reason: 'olvidé registrar' } as any, u.auditor)).rejects.toThrow(/no está activado/);
  });
});

describe('Captura con el cierre activo', () => {
  it('las horas de cliente exigen descripción y las no facturables exigen motivo', async () => {
    const { u, ts } = setup();
    await expect(ts.createEntry(entry({ description: '' }), u.auditor)).rejects.toThrow(/descripción/);
    await expect(ts.createEntry(entry({ category: 'CLIENT_NON_BILLABLE' }), u.auditor)).rejects.toThrow(/motivo/);
    await expect(ts.createEntry(entry({ nonBillableReason: 'REWORK' }), u.auditor)).rejects.toThrow(/Solo las horas/);
    const ok = await ts.createEntry(entry({ category: 'CLIENT_NON_BILLABLE', nonBillableReason: 'OVER_BUDGET' }), u.auditor);
    expect(ok.nonBillableReason).toBe('OVER_BUDGET');
  });

  it('un lote con una fila mala no guarda nada y dice cuál es', async () => {
    const { db, u, ts } = setup();
    const err: any = await ts.createEntriesBulk({ entries: [entry(), entry({ workDate: '2026-09-11', description: '' })] } as any, u.auditor).catch((e) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect(err.getResponse().errors).toEqual([{ index: 1, error: expect.stringMatching(/descripción/) }]);
    expect(db.entries()).toHaveLength(0);
    expect(db.rollbacks).toBe(1);
  });

  it('cada alta, edición y borrado deja una línea en la bitácora con el antes y el después', async () => {
    const { db, u, ts } = setup();
    const e = await ts.createEntry(entry(), u.auditor);
    await ts.updateEntry(e.id, { hours: 6, description: 'Revisión ajustada' } as any, u.auditor);
    await ts.deleteEntry(e.id, u.auditor);
    const logs = db.logs();
    expect(logs.map((l) => l.action)).toEqual(['CREATE', 'UPDATE', 'DELETE']);
    expect(logs[1].before).toMatchObject({ hours: 8 });
    expect(logs[1].after).toMatchObject({ hours: 6, description: 'Revisión ajustada' });
    expect(logs[2].before).toMatchObject({ hours: 6 });
    expect(logs.every((l) => l.actorId === u.auditor.id && l.userId === u.auditor.id && l.timeEntryId === e.id)).toBe(true);
  });

  it('el lote registra una línea de bitácora por hora', async () => {
    const { db, u, ts } = setup();
    await ts.createEntriesBulk({ entries: [entry(), entry({ workDate: '2026-09-11' })] } as any, u.auditor);
    expect(db.logs()).toHaveLength(2);
  });

  it('solo se edita lo propio y el tope de 20 h no cuenta la hora que se está cambiando', async () => {
    const { u, ts } = setup();
    const e = await ts.createEntry(entry({ hours: 15 }), u.auditor);
    await expect(ts.updateEntry(e.id, { hours: 1 } as any, u.senior)).rejects.toThrow(ForbiddenException);
    await expect(ts.updateEntry(e.id, { hours: 20 } as any, u.auditor)).resolves.toMatchObject({ hours: 20 }); // 15 → 20, no 15 + 20
    await expect(ts.updateEntry(e.id, { hours: 21 } as any, u.auditor)).rejects.toThrow(/mayores que 0/);
  });

  it('pasar una hora a una categoría que no es de cliente suelta el encargo', async () => {
    const { u, ts } = setup();
    const e = await ts.createEntry(entry(), u.auditor);
    const edited = await ts.updateEntry(e.id, { category: 'TRAINING' } as any, u.auditor);
    expect(edited).toMatchObject({ category: 'TRAINING', auditId: null });
  });
});

describe('Un mes cerrado no se toca', () => {
  async function closedSeptember() {
    const s = setup();
    const e = await s.ts.createEntry(entry(), s.u.auditor);
    await s.close(s.u.manager);
    return { ...s, e };
  }

  it('la captura general rechaza alta, lote, edición y borrado', async () => {
    const { u, ts, e } = await closedSeptember();
    await expect(ts.createEntry(entry({ workDate: '2026-09-20' }), u.auditor)).rejects.toThrow(ConflictException);
    await expect(ts.createEntriesBulk({ entries: [entry({ workDate: '2026-09-21' })] } as any, u.auditor)).rejects.toThrow(/cerrado/);
    await expect(ts.updateEntry(e.id, { hours: 2 } as any, u.auditor)).rejects.toThrow(/cerrado/);
    await expect(ts.deleteEntry(e.id, u.auditor)).rejects.toThrow(/cerrado/);
  });

  it('la otra ruta que escribe horas (PlansService) también lo rechaza', async () => {
    const { u, plans, e } = await closedSeptember();
    await expect(plans.createTimeEntry({ workDate: '2026-09-20', hours: 2, auditId: 'aud1', description: 'Visita' } as any, u.auditor)).rejects.toThrow(/cerrado/);
    await expect(plans.deleteTimeEntry(e.id, u.auditor)).rejects.toThrow(/cerrado/);
  });

  it('mover una hora ABIERTA hacia un mes cerrado también se rechaza', async () => {
    const { u, ts } = await closedSeptember();
    const open = await ts.createEntry(entry({ workDate: '2026-10-05' }), u.auditor);
    await expect(ts.updateEntry(open.id, { workDate: '2026-09-25' } as any, u.auditor)).rejects.toThrow(/cerrado/);
  });

  it('solo bloquea a esa persona y a ese mes', async () => {
    const { u, ts } = await closedSeptember();
    await expect(ts.createEntry(entry({ workDate: '2026-10-05' }), u.auditor)).resolves.toBeDefined(); // octubre sigue abierto
    await expect(ts.createEntry(entry({ workDate: '2026-09-20' }), u.senior)).resolves.toBeDefined(); // otra persona
  });

  it('pide el candado de la persona y el mes (para que un cierre no se cuele a mitad de una escritura)', async () => {
    const { db, u, ts } = setup();
    await ts.createEntry(entry(), u.auditor);
    expect(db.lockKeys).toEqual([`hours-close:org1:${u.auditor.id}:2026-09`]);
  });

  it('un error dentro de la transacción deja todo como estaba', async () => {
    const { db, u, ts } = setup();
    jest.spyOn(db.tables.timeEntryLog, 'create').mockRejectedValueOnce(new Error('falla la bitácora'));
    await expect(ts.createEntry(entry(), u.auditor)).rejects.toThrow('falla la bitácora');
    expect(db.entries()).toHaveLength(0); // sin bitácora no hay hora: nunca queda un cambio sin rastro
  });
});

describe('Cerrar', () => {
  it('solo un gerente o superior, y nunca las propias horas', async () => {
    const { u, close } = setup();
    await expect(close(u.auditor, u.senior.id)).rejects.toThrow(ForbiddenException);
    await expect(close(u.manager, u.manager.id)).rejects.toThrow(/propias horas/);
    await expect(close(u.manager, u.manager2.id)).rejects.toThrow(/dirección/);
    await expect(close(u.cae, u.manager.id)).resolves.toMatchObject({ closed: true });
    await expect(close(u.cae, u.cae.id)).rejects.toThrow(/propias horas/);
  });

  it('no cierra una persona de otra organización (aunque la suya también tenga el cierre activo)', async () => {
    const { db, u, close } = setup();
    db.enable('org2');
    await expect(close(u.outsider, u.auditor.id)).rejects.toThrow(NotFoundException);
    expect(db.tables.hoursPeriodClose.rows).toHaveLength(0);
  });

  it('solo cierra meses terminados', async () => {
    const { u, hc } = setup();
    await expect(hc.closePeriod({ year: 2026, month: 10, userId: u.auditor.id } as any, u.manager)).rejects.toThrow(/meses terminados/);
  });

  it('no se cierra dos veces', async () => {
    const { u, close } = setup();
    await close(u.manager);
    await expect(close(u.manager)).rejects.toThrow(/ya está cerrado/);
  });

  it('congela el costo por hora y la tarifa pactada, y guarda cuántas horas y registros cerró', async () => {
    const { db, u, ts, close } = setup();
    db.tables.userCostProfile.rows.push({ organizationId: 'org1', userId: u.auditor.id, year: 2026, costRatePerHour: 12.5 });
    db.tables.auditTeam.rows.push({ auditId: 'aud1', userId: u.auditor.id, agreedRatePerHour: 40 });
    await ts.createEntry(entry({ hours: 6 }), u.auditor);
    await ts.createEntry(entry({ workDate: '2026-09-11', hours: 2, category: 'ADMIN', auditId: undefined, description: undefined }), u.auditor);
    await ts.createEntry(entry({ workDate: '2026-10-02' }), u.auditor); // octubre: fuera del cierre
    const res = await close(u.manager, u.auditor.id, SEPT, 'Todo conforme');
    expect(res).toMatchObject({ entryCount: 2, totalHours: 8, entriesWithoutCostRate: 0 });
    const [client, admin] = [db.entries({ category: 'CLIENT_BILLABLE', workDate: new Date('2026-09-10T00:00:00Z') })[0], db.entries({ category: 'ADMIN' })[0]];
    expect(client).toMatchObject({ costRateSnapshot: 12.5, billRateSnapshot: 40 });
    expect(client.closedAt).toBeInstanceOf(Date);
    expect(admin).toMatchObject({ costRateSnapshot: 12.5, billRateSnapshot: null }); // lo no ligado a un encargo no tiene tarifa
    expect(db.entries({ workDate: new Date('2026-10-02T00:00:00Z') })[0]).toMatchObject({ costRateSnapshot: null, closedAt: null });
    expect(db.tables.hoursPeriodClose.rows[0]).toMatchObject({ status: 'CLOSED', closedById: u.manager.id, closeNote: 'Todo conforme', entryCount: 2, totalHours: 8 });
    expect(db.logs().filter((l) => l.action === 'PERIOD_CLOSED')).toHaveLength(1);
  });

  it('cambiar el salario después NO mueve el costo de un mes cerrado', async () => {
    const { db, u, ts, close } = setup();
    db.tables.userCostProfile.rows.push({ organizationId: 'org1', userId: u.auditor.id, year: 2026, costRatePerHour: 12.5 });
    await ts.createEntry(entry(), u.auditor);
    await close(u.manager);
    db.tables.userCostProfile.rows[0].costRatePerHour = 99; // sube el salario
    expect(db.entries()[0].costRateSnapshot).toBe(12.5);
  });

  it('sin perfil de costeo cierra igual, pero lo avisa', async () => {
    const { u, ts, close } = setup();
    await ts.createEntry(entry(), u.auditor);
    await expect(close(u.manager)).resolves.toMatchObject({ entriesWithoutCostRate: 1 });
  });
});

describe('Reabrir', () => {
  it('solo un mes cerrado, con las mismas reglas de quién cierra a quién', async () => {
    const { u, reopen } = setup();
    await expect(reopen(u.manager)).rejects.toThrow(/no está cerrado/);
  });

  it('el mes vuelve a ser provisional: se sueltan costo y tarifa, y se puede escribir otra vez', async () => {
    const { db, u, ts, close, reopen } = setup();
    db.tables.userCostProfile.rows.push({ organizationId: 'org1', userId: u.auditor.id, year: 2026, costRatePerHour: 12.5 });
    await ts.createEntry(entry(), u.auditor);
    await close(u.manager);
    await expect(reopen(u.auditor, u.auditor.id)).rejects.toThrow(ForbiddenException);
    await reopen(u.manager);
    expect(db.entries()[0]).toMatchObject({ costRateSnapshot: null, billRateSnapshot: null, closedAt: null });
    expect(db.tables.hoursPeriodClose.rows[0]).toMatchObject({ status: 'OPEN', reopenedById: u.manager.id, reopenReason: 'Falta una semana de visita' });
    await expect(ts.createEntry(entry({ workDate: '2026-09-22' }), u.auditor)).resolves.toBeDefined();
    expect(db.logs().map((l) => l.action)).toContain('PERIOD_REOPENED');
  });

  it('un mes reabierto se puede volver a cerrar', async () => {
    const { db, u, close, reopen } = setup();
    await close(u.manager);
    await reopen(u.manager);
    await expect(close(u.manager)).resolves.toMatchObject({ closed: true });
    expect(db.tables.hoursPeriodClose.rows).toHaveLength(1); // misma fila: una por persona y mes
    expect(db.tables.hoursPeriodClose.rows[0].status).toBe('CLOSED');
  });
});

describe('Ajustes de un mes cerrado', () => {
  async function closed() {
    const s = setup();
    s.db.tables.userCostProfile.rows.push({ organizationId: 'org1', userId: s.u.auditor.id, year: 2026, costRatePerHour: 12.5 });
    s.db.tables.auditTeam.rows.push({ auditId: 'aud1', userId: s.u.auditor.id, agreedRatePerHour: 40 });
    const e = await s.ts.createEntry(entry({ hours: 4 }), s.u.auditor);
    await s.close(s.u.manager);
    return { ...s, e };
  }

  it('no hace falta ajuste si el mes está abierto', async () => {
    const { u, ts, hc } = setup();
    const e = await ts.createEntry(entry(), u.auditor);
    await expect(hc.createAdjustment({ action: 'DELETE', timeEntryId: e.id, reason: 'me equivoqué' } as any, u.auditor)).rejects.toThrow(/abierto/);
  });

  it('agregar horas olvidadas: entra marcada como posterior al cierre, con costo y tarifa congelados, y el cierre se actualiza', async () => {
    const { db, u, hc } = await closed();
    const req = await hc.createAdjustment({ action: 'ADD', entry: entry({ workDate: '2026-09-15', hours: 3 }), reason: 'Visita sin registrar' } as any, u.auditor);
    expect(req.status).toBe('PENDING');
    expect(db.entries()).toHaveLength(1); // todavía nada cambió
    await hc.decideAdjustment(req.id, { approve: true, note: 'Confirmado con el cliente' } as any, u.manager);
    const added = db.entries({ workDate: new Date('2026-09-15T00:00:00Z') })[0];
    expect(added).toMatchObject({ hours: 3, afterClose: true, costRateSnapshot: 12.5, billRateSnapshot: 40 });
    expect(db.tables.hoursPeriodClose.rows[0]).toMatchObject({ entryCount: 2, totalHours: 7 });
    expect(db.logs().find((l) => l.action === 'ADJUSTMENT_APPROVED')).toMatchObject({ actorId: u.manager.id, userId: u.auditor.id, note: 'Visita sin registrar' });
    expect(db.tables.timeAdjustmentRequest.rows[0]).toMatchObject({ status: 'APPROVED', decidedById: u.manager.id, decisionNote: 'Confirmado con el cliente' });
    expect(db.tables.audit.rows[0].actualHours).toBe(7);
  });

  it('corregir y borrar una hora ya cerrada', async () => {
    const { db, u, hc, e } = await closed();
    const edit = await hc.createAdjustment({ action: 'EDIT', timeEntryId: e.id, changes: { hours: 5, description: 'Revisión completa' }, reason: 'Eran 5 horas' } as any, u.auditor);
    await hc.decideAdjustment(edit.id, { approve: true } as any, u.manager);
    expect(db.entries()[0]).toMatchObject({ hours: 5, afterClose: true });
    const del = await hc.createAdjustment({ action: 'DELETE', timeEntryId: e.id, reason: 'Se cargó al encargo equivocado' } as any, u.auditor);
    await hc.decideAdjustment(del.id, { approve: true } as any, u.manager);
    expect(db.entries()).toHaveLength(0);
    expect(db.tables.hoursPeriodClose.rows[0]).toMatchObject({ entryCount: 0, totalHours: 0 });
  });

  it('rechazar no cambia nada y deja la decisión', async () => {
    const { db, u, hc, e } = await closed();
    const req = await hc.createAdjustment({ action: 'DELETE', timeEntryId: e.id, reason: 'Quiero borrarla' } as any, u.auditor);
    await hc.decideAdjustment(req.id, { approve: false, note: 'No procede' } as any, u.manager);
    expect(db.entries()).toHaveLength(1);
    expect(db.tables.timeAdjustmentRequest.rows[0]).toMatchObject({ status: 'REJECTED', decisionNote: 'No procede' });
    await expect(hc.decideAdjustment(req.id, { approve: true } as any, u.manager)).rejects.toThrow(/ya fue resuelto/);
  });

  it('no se pide el ajuste de horas ajenas, ni mover una hora a otro mes, ni con datos inválidos', async () => {
    const { u, hc, e } = await closed();
    await expect(hc.createAdjustment({ action: 'DELETE', timeEntryId: e.id, reason: 'no son mías' } as any, u.senior)).rejects.toThrow(ForbiddenException);
    await expect(hc.createAdjustment({ action: 'EDIT', timeEntryId: e.id, changes: { workDate: '2026-10-03' }, reason: 'cambiar de mes' } as any, u.auditor)).rejects.toThrow(/otro mes/);
    await expect(hc.createAdjustment({ action: 'ADD', entry: entry({ workDate: '2026-09-15', description: '' }), reason: 'sin descripción' } as any, u.auditor)).rejects.toThrow(/descripción/);
    await expect(hc.createAdjustment({ action: 'ADD', reason: 'sin hora' } as any, u.auditor)).rejects.toThrow(/entry/);
  });

  it('quien decide sigue las mismas reglas: no su propio ajuste, ni otra organización, ni un auditor', async () => {
    const { db, u, ts, hc, close } = await closed();
    await ts.createEntry(entry({ workDate: '2026-09-12' }), u.manager);
    await close(u.cae, u.manager.id);
    const own = await hc.createAdjustment({ action: 'ADD', entry: entry({ workDate: '2026-09-14' }), reason: 'Olvidé registrar' } as any, u.manager);
    await expect(hc.decideAdjustment(own.id, { approve: true } as any, u.manager)).rejects.toThrow(ForbiddenException);
    await expect(hc.decideAdjustment(own.id, { approve: true } as any, u.manager2)).rejects.toThrow(/dirección/);
    await expect(hc.decideAdjustment(own.id, { approve: true } as any, u.outsider)).rejects.toThrow(NotFoundException);
    await expect(hc.decideAdjustment(own.id, { approve: true } as any, u.auditor)).rejects.toThrow(ForbiddenException);
    await hc.decideAdjustment(own.id, { approve: true } as any, u.cae);
    expect(db.entries({ userId: u.manager.id })).toHaveLength(2);
  });

  it('al reabrir el mes, los pedidos pendientes se rechazan solos (la persona edita directo) y ya no se pueden aprobar', async () => {
    const { db, u, hc, e, reopen } = await closed();
    const req = await hc.createAdjustment({ action: 'DELETE', timeEntryId: e.id, reason: 'Se cargó mal' } as any, u.auditor);
    await reopen(u.manager);
    expect(db.tables.timeAdjustmentRequest.rows[0]).toMatchObject({ status: 'REJECTED', decidedById: u.manager.id, decisionNote: expect.stringMatching(/reabrió/) });
    await expect(hc.decideAdjustment(req.id, { approve: true } as any, u.manager)).rejects.toThrow(/ya fue resuelto/);
    expect(db.entries()).toHaveLength(1);
  });

  it('la lista: cada quien ve lo suyo y el gerente ve todo', async () => {
    const { u, hc, e } = await closed();
    await hc.createAdjustment({ action: 'DELETE', timeEntryId: e.id, reason: 'Se cargó mal' } as any, u.auditor);
    expect(await hc.listAdjustments({} as any, u.senior)).toHaveLength(0);
    expect(await hc.listAdjustments({} as any, u.auditor)).toHaveLength(1);
    const all = await hc.listAdjustments({} as any, u.manager);
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ user: { name: 'Ana Auditora' }, entry: { id: e.id } });
    expect(await hc.listAdjustments({} as any, u.outsider)).toHaveLength(0);
  });
});

describe('Resumen del mes para el gerente', () => {
  it('avisa de días sin horas, horas bajas, días largos, falta de descripción y de perfiles', async () => {
    const { db, u, ts, hc } = setup();
    db.tables.userAvailabilityProfile.rows.push({ organizationId: 'org1', userId: u.auditor.id, year: 2026, standardDailyHours: 8 });
    await ts.createEntry(entry({ workDate: '2026-09-01', hours: 14 }), u.auditor);
    db.tables.timeEntry.rows.push({ ...db.entries()[0], id: 'sin-desc', workDate: new Date('2026-09-02T00:00:00Z'), hours: 4, description: '' });
    const view = await hc.overview(2026, 9, u.manager);
    const row = view.rows.find((r) => r.userId === u.auditor.id)!;
    const codes = row.warnings.map((w) => w.code);
    expect(codes).toEqual(expect.arrayContaining(['MISSING_DAYS', 'HOURS_LOW', 'LONG_DAYS', 'NO_DESCRIPTION', 'NO_COST_PROFILE']));
    expect(row).toMatchObject({ businessDays: 22, daysWithHours: 2, totalHours: 18, availableHours: 176, status: 'OPEN', canClose: true });
    expect(row.missingDays).toHaveLength(20);
    // quien no tiene perfil de disponibilidad no se compara contra horas disponibles (no se inventa un número)
    const senior = view.rows.find((r) => r.userId === u.senior.id)!;
    expect(senior.availableHours).toBeNull();
    expect(view.summary).toMatchObject({ people: 5, closed: 0 });
    expect(view).toMatchObject({ enabled: true, finished: true, entryDeadline: '2026-10-07', closeDeadline: '2026-10-14' });
  });

  it('los días futuros del mes en curso no cuentan como faltantes', async () => {
    const { hc, u } = setup();
    const view = await hc.overview(2026, 10, u.manager);
    expect(view.finished).toBe(false);
    expect(view.rows[0].missingDays.every((d) => d <= '2026-10-22')).toBe(true);
    expect(view.rows[0].missingDays).toHaveLength(16); // del 1 al 22 de octubre: 16 días hábiles
  });

  it('un festivo no es día faltante', async () => {
    const { db, hc, u } = setup();
    db.tables.holidayConfig.rows.push({ organizationId: 'org1', date: new Date('2026-09-15T00:00:00Z'), active: true });
    const view = await hc.overview(2026, 9, u.manager);
    expect(view.rows[0].businessDays).toBe(21);
    expect(view.rows[0].missingDays).not.toContain('2026-09-15');
  });

  it('muestra quién cerró y marca qué puede cerrar quien mira', async () => {
    const { u, hc, close } = setup();
    await close(u.manager);
    const asManager = await hc.overview(2026, 9, u.manager);
    const ana = asManager.rows.find((r) => r.userId === u.auditor.id)!;
    expect(ana).toMatchObject({ status: 'CLOSED', closedByName: 'Marta Gerente', canClose: false, canReopen: true }); // se cierra o se reabre, nunca ambos
    expect(asManager.rows.find((r) => r.userId === u.senior.id)).toMatchObject({ canClose: true, canReopen: false });
    expect(asManager.rows.find((r) => r.userId === u.manager.id)).toMatchObject({ canClose: false, canReopen: false }); // ni las propias
    expect(asManager.rows.find((r) => r.userId === u.manager2.id)!.canClose).toBe(false); // ni las de otro gerente
    expect((await hc.overview(2026, 9, u.cae)).rows.find((r) => r.userId === u.manager2.id)!.canClose).toBe(true);
    expect(asManager.summary.closed).toBe(1);
  });

  it('un auditor no ve el resumen, y otra organización no ve a nadie de esta', async () => {
    const { hc, u } = setup();
    await expect(hc.overview(2026, 9, u.auditor)).rejects.toThrow(ForbiddenException);
    const other = await hc.overview(2026, 9, u.outsider);
    expect(other.rows.map((r) => r.userId)).toEqual([u.outsider.id]);
  });

  it('mi estado para la captura: solo mis meses cerrados', async () => {
    const { u, hc, close } = setup();
    await close(u.manager);
    const mine = await hc.getMyPeriods('2026-08-25', '2026-10-05', u.auditor);
    expect(mine.closed.map((c) => `${c.year}-${c.month}`)).toEqual(['2026-9']);
    expect((await hc.getMyPeriods('2026-08-25', '2026-10-05', u.senior)).closed).toEqual([]);
  });
});

describe('Detalle de una persona para revisar', () => {
  it('el gerente ve las horas del mes con descripción y encargo, pero nunca costos ni tarifas', async () => {
    const { db, u, ts, hc, close } = setup();
    db.tables.userCostProfile.rows.push({ organizationId: 'org1', userId: u.auditor.id, year: 2026, costRatePerHour: 12.5 });
    db.tables.audit.rows[0].title = 'Auditoría Pérez 2026';
    await ts.createEntry(entry({ workDate: '2026-09-10' }), u.auditor);
    await ts.createEntry(entry({ workDate: '2026-10-02' }), u.auditor); // otro mes: no aparece
    await close(u.manager);
    const detail = await hc.personEntries(u.auditor.id, 2026, 9, u.manager);
    expect(detail.user).toEqual({ id: u.auditor.id, name: 'Ana Auditora' });
    expect(detail.entries).toHaveLength(1);
    expect(detail.entries[0]).toMatchObject({ hours: 8, description: 'Revisión de cuentas por cobrar', auditTitle: 'Auditoría Pérez 2026' });
    expect(JSON.stringify(detail)).not.toMatch(/costRate|billRate|12\.5/);
  });

  it('un auditor no lo ve y otra organización no alcanza a la persona', async () => {
    const { u, hc } = setup();
    await expect(hc.personEntries(u.senior.id, 2026, 9, u.auditor)).rejects.toThrow(ForbiddenException);
    await expect(hc.personEntries(u.auditor.id, 2026, 9, u.outsider)).rejects.toThrow(NotFoundException);
  });
});

describe('Parámetros', () => {
  it('solo la dirección los cambia y el plazo del gerente no puede ser anterior al del auditor', async () => {
    const { u, hc } = setup({ enabled: false });
    await expect(hc.updateSettings({ enabled: true, entryDeadlineDay: 5, closeDeadlineDay: 10 }, u.manager)).rejects.toThrow(ForbiddenException);
    await expect(hc.updateSettings({ enabled: true, entryDeadlineDay: 8, closeDeadlineDay: 3 }, u.cae)).rejects.toThrow(/no puede ser anterior/);
    await expect(hc.updateSettings({ enabled: true, entryDeadlineDay: 5, closeDeadlineDay: 10 }, u.cae)).resolves.toEqual({ enabled: true, entryDeadlineDay: 5, closeDeadlineDay: 10 });
    expect(await hc.getSettings(u.auditor)).toMatchObject({ enabled: true });
    expect(await hc.getSettings(u.outsider)).toEqual({ enabled: false, entryDeadlineDay: 5, closeDeadlineDay: 10 }); // otra organización: sus propios valores
  });
});

describe('Recordatorios por correo', () => {
  it('el botón del gerente avisa solo a quienes tienen días sin horas y no a los ya cerrados', async () => {
    const { u, hc, email, close } = setup();
    await close(u.manager, u.senior.id);
    const res = await hc.remind({ ...SEPT } as any, u.manager);
    expect(res.sent).toBe(res.candidates);
    const to = email.send.mock.calls.map((c) => c[0].to);
    expect(to).not.toContain(u.senior.email);
    expect(to).toContain(u.auditor.email);
    expect(email.send.mock.calls[0][0].body.paragraphs.join(' ')).toMatch(/día\(s\) hábil\(es\)/);
    const only = await hc.remind({ ...SEPT, userIds: [u.auditor.id] } as any, u.manager);
    expect(only.candidates).toBe(1);
  });

  it('un auditor no manda recordatorios', async () => {
    const { u, hc } = setup();
    await expect(hc.remind({ ...SEPT } as any, u.auditor)).rejects.toThrow(ForbiddenException);
  });

  describe('tarea programada', () => {
    const at = (iso: string) => new Date(`${iso}T14:00:00Z`);
    const settings = (db: FakeHoursDb) => db.tables.hoursCloseSettings.rows[0];

    it('etapa 1 el primer día hábil, etapa 2 el día del plazo, y no repite', async () => {
      const { db, scheduler, email } = setup();
      // octubre de 2026: el 1.º es jueves → primer día hábil = 1; plazo (5.º día hábil) = 7
      await scheduler.run(at('2026-10-01'));
      expect(settings(db).lastReminderPeriod).toBe('2026-09#1');
      const first = email.send.mock.calls.length;
      expect(first).toBeGreaterThan(0);
      await scheduler.run(at('2026-10-01')); // el mismo día otra vez: no duplica
      expect(email.send.mock.calls.length).toBe(first);
      await scheduler.run(at('2026-10-02')); // día intermedio: nada
      expect(email.send.mock.calls.length).toBe(first);
      await scheduler.run(at('2026-10-07'));
      expect(settings(db).lastReminderPeriod).toBe('2026-09#2');
      expect(email.send.mock.calls.length).toBeGreaterThan(first);
    });

    it('en fin de semana o festivo no manda nada', async () => {
      const { db, scheduler, email } = setup();
      await scheduler.run(at('2026-10-03')); // sábado
      db.tables.holidayConfig.rows.push({ organizationId: 'org1', date: new Date('2026-10-01T00:00:00Z'), active: true });
      await scheduler.run(at('2026-10-01')); // festivo: el primer día hábil pasa al 2, así que hoy no toca
      expect(email.send).not.toHaveBeenCalled();
    });

    it('solo en organizaciones con el cierre activado', async () => {
      const { scheduler, email } = setup({ enabled: false });
      await scheduler.run(at('2026-10-01'));
      expect(email.send).not.toHaveBeenCalled();
    });

    it('una ejecución superpuesta se ignora', async () => {
      const { scheduler, email } = setup();
      const a = scheduler.run(at('2026-10-01'));
      const b = scheduler.run(at('2026-10-01'));
      await Promise.all([a, b]);
      const sentFirst = email.send.mock.calls.length;
      expect(sentFirst).toBeGreaterThan(0);
      await scheduler.run(at('2026-10-01'));
      expect(email.send.mock.calls.length).toBe(sentFirst);
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Hallazgos de la revisión independiente (2026-10-22): cada uno con su prueba
// ════════════════════════════════════════════════════════════════════════════
describe('El costo por hora nunca sale en una consulta de horas', () => {
  const COSTS = /costRateSnapshot|billRateSnapshot/;
  async function conCierre() {
    const s = setup();
    s.db.tables.userCostProfile.rows.push({ organizationId: 'org1', userId: s.u.auditor.id, year: 2026, costRatePerHour: 12.5 });
    s.db.tables.auditTeam.rows.push({ auditId: 'aud1', userId: s.u.auditor.id, agreedRatePerHour: 40 });
    const e = await s.ts.createEntry(entry(), s.u.auditor);
    await s.close(s.u.manager);
    expect(s.db.entries()[0].costRateSnapshot).toBe(12.5); // el costo SÍ está guardado; lo que no debe es salir
    return { ...s, e };
  }

  it('las listas de horas del encargo y del ítem de plan (las ve cualquier auditor)', async () => {
    const { db, plans, u } = await conCierre();
    // el ítem del plan existe y es de la organización (la lista ahora lo comprueba por el modo investigación)
    db.tables.auditPlanItem.rows.push({ id: 'item1', plan: { organizationId: 'org1' } });
    // una hora ligada a un ítem de plan, ya con su costo congelado
    db.tables.timeEntry.rows.push({
      ...db.entries()[0], id: 'del-item', planItemId: 'item1', auditId: null, costRateSnapshot: 12.5, billRateSnapshot: 40,
    });
    const porEncargo = await plans.getTimeEntries('aud1', u.senior);
    const porItem = await plans.getPlanItemTimeEntries('item1', u.senior);
    expect(porEncargo).toHaveLength(1); // siguen devolviendo la hora
    expect(porItem).toHaveLength(1);
    expect(JSON.stringify(porEncargo)).not.toMatch(COSTS);
    expect(JSON.stringify(porItem)).not.toMatch(COSTS);
  });

  it('mis propias horas', async () => {
    const { ts, u } = await conCierre();
    const mine = await ts.getMyEntries({} as any, u.auditor);
    expect(mine).toHaveLength(1);
    expect(JSON.stringify(mine)).not.toMatch(COSTS);
  });

  it('la hora que acompaña un pedido de ajuste que ve el gerente', async () => {
    const { hc, u, e } = await conCierre();
    await hc.createAdjustment({ action: 'DELETE', timeEntryId: e.id, reason: 'Se cargó mal' } as any, u.auditor);
    const list = await hc.listAdjustments({} as any, u.manager);
    expect(list[0].entry).toMatchObject({ id: e.id });
    expect(JSON.stringify(list)).not.toMatch(COSTS);
  });

  it('la selección pública no trae ninguno de los dos campos', () => {
    expect(Object.keys(ENTRY_PUBLIC_SELECT)).not.toContain('costRateSnapshot');
    expect(Object.keys(ENTRY_PUBLIC_SELECT)).not.toContain('billRateSnapshot');
  });
});

describe('Una sola decisión por pedido de ajuste', () => {
  async function pedidoDeAgregar() {
    const s = setup();
    await s.ts.createEntry(entry({ hours: 4 }), s.u.auditor);
    await s.close(s.u.manager);
    const req = await s.hc.createAdjustment({ action: 'ADD', entry: entry({ workDate: '2026-09-15', hours: 3 }), reason: 'Visita sin registrar' } as any, s.u.auditor);
    return { ...s, req };
  }

  it('dos gerentes (o un doble clic) aprobando a la vez: la hora se agrega UNA vez', async () => {
    const { db, hc, u, req } = await pedidoDeAgregar();
    const results = await Promise.allSettled([
      hc.decideAdjustment(req.id, { approve: true } as any, u.manager),
      hc.decideAdjustment(req.id, { approve: true } as any, u.cae),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((results.find((r) => r.status === 'rejected') as PromiseRejectedResult).reason).toBeInstanceOf(ConflictException);
    expect(db.entries({ workDate: new Date('2026-09-15T00:00:00Z') })).toHaveLength(1);
    expect(db.logs().filter((l) => l.action === 'ADJUSTMENT_APPROVED')).toHaveLength(1);
    expect(db.tables.hoursPeriodClose.rows[0]).toMatchObject({ entryCount: 2, totalHours: 7 });
  });

  it('aprobar y rechazar a la vez: gana uno solo y el resultado es coherente', async () => {
    const { db, hc, u, req } = await pedidoDeAgregar();
    const results = await Promise.allSettled([
      hc.decideAdjustment(req.id, { approve: true } as any, u.manager),
      hc.decideAdjustment(req.id, { approve: false } as any, u.cae),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const status = db.tables.timeAdjustmentRequest.rows[0].status;
    const agregada = db.entries({ workDate: new Date('2026-09-15T00:00:00Z') }).length;
    expect({ status, agregada }).toEqual(status === 'APPROVED' ? { status, agregada: 1 } : { status: 'REJECTED', agregada: 0 });
  });

  it('con el cierre apagado no se aprueba ni se rechaza nada', async () => {
    const { db, hc, u, req } = await pedidoDeAgregar();
    db.tables.hoursCloseSettings.rows[0].enabled = false;
    await expect(hc.decideAdjustment(req.id, { approve: true } as any, u.manager)).rejects.toThrow(/no está activado/);
    expect(db.tables.timeAdjustmentRequest.rows[0].status).toBe('PENDING');
  });
});

describe('Un ajuste solo toca una hora que siga en el mes del pedido', () => {
  it('si la hora se movió a otro mes mientras tanto, aprobar el cambio o el borrado se rechaza y no toca nada', async () => {
    const { db, u, ts, hc, close } = setup();
    const e = await ts.createEntry(entry({ hours: 4 }), u.auditor);
    await close(u.manager);
    const edit = await hc.createAdjustment({ action: 'EDIT', timeEntryId: e.id, changes: { hours: 5 }, reason: 'Eran 5 horas' } as any, u.auditor);
    const del = await hc.createAdjustment({ action: 'DELETE', timeEntryId: e.id, reason: 'Borrar la hora' } as any, u.auditor);
    db.tables.timeEntry.rows[0].workDate = new Date('2026-10-05T00:00:00Z'); // la hora ya está en octubre
    await expect(hc.decideAdjustment(edit.id, { approve: true } as any, u.manager)).rejects.toThrow(/ya no está en ese mes/);
    await expect(hc.decideAdjustment(del.id, { approve: true } as any, u.manager)).rejects.toThrow(/ya no está en ese mes/);
    expect(db.entries()[0]).toMatchObject({ hours: 4, afterClose: false });
    expect(db.tables.timeAdjustmentRequest.rows.map((r) => r.status)).toEqual(['PENDING', 'PENDING']); // la decisión se deshizo con el error
    expect(db.logs().filter((l) => l.action === 'ADJUSTMENT_APPROVED')).toHaveLength(0);
  });
});

describe('Un ajuste usa el costo del mes cerrado, no el de hoy', () => {
  it('agregar y corregir horas después de que subió el perfil de costeo no mezcla costos dentro del mes', async () => {
    const { db, u, ts, hc, close } = setup();
    db.tables.userCostProfile.rows.push({ organizationId: 'org1', userId: u.auditor.id, year: 2026, costRatePerHour: 12.5 });
    db.tables.auditTeam.rows.push({ auditId: 'aud1', userId: u.auditor.id, agreedRatePerHour: 40 });
    const e = await ts.createEntry(entry({ hours: 4 }), u.auditor);
    await close(u.manager);
    expect(db.tables.hoursPeriodClose.rows[0].costRateSnapshot).toBe(12.5);

    db.tables.userCostProfile.rows[0].costRatePerHour = 15; // la dirección sube el costo después
    db.tables.auditTeam.rows[0].agreedRatePerHour = 55;

    const add = await hc.createAdjustment({ action: 'ADD', entry: entry({ workDate: '2026-09-15', hours: 3 }), reason: 'Visita sin registrar' } as any, u.auditor);
    await hc.decideAdjustment(add.id, { approve: true } as any, u.manager);
    const edit = await hc.createAdjustment({ action: 'EDIT', timeEntryId: e.id, changes: { hours: 5 }, reason: 'Eran 5 horas' } as any, u.auditor);
    await hc.decideAdjustment(edit.id, { approve: true } as any, u.manager);

    for (const row of db.entries()) expect(row.costRateSnapshot).toBe(12.5); // todo el mes sigue a 12,50
    expect(db.entries({ hours: 5 })[0].billRateSnapshot).toBe(40); // misma tarifa de siempre al corregir solo las horas
    expect(db.entries({ hours: 3 })[0].billRateSnapshot).toBe(55); // una hora NUEVA toma la tarifa pactada vigente del encargo
  });
});

describe('Feriados recurrentes', () => {
  it('uno guardado en otro año vale también para este (no es día faltante ni día hábil)', async () => {
    const { db, hc, u } = setup();
    db.tables.holidayConfig.rows.push({ organizationId: 'org1', date: new Date('2025-09-15T00:00:00Z'), active: true, recurring: true });
    const view = await hc.overview(2026, 9, u.manager);
    expect(view.rows[0].businessDays).toBe(21);
    expect(view.rows[0].missingDays).not.toContain('2026-09-15');
  });
  it('uno NO recurrente de otro año no cuenta', async () => {
    const { db, hc, u } = setup();
    db.tables.holidayConfig.rows.push({ organizationId: 'org1', date: new Date('2025-09-15T00:00:00Z'), active: true, recurring: false });
    expect((await hc.overview(2026, 9, u.manager)).rows[0].businessDays).toBe(22);
  });
  it('mueve el plazo del auditor', async () => {
    const { db, hc, u } = setup();
    // octubre de 2026 empieza el jueves 1: sin feriados el 5.º día hábil es el 7; con el 2 de octubre recurrente pasa al 8
    db.tables.holidayConfig.rows.push({ organizationId: 'org1', date: new Date('2024-10-02T00:00:00Z'), active: true, recurring: true });
    expect((await hc.overview(2026, 9, u.manager)).entryDeadline).toBe('2026-10-08');
  });
});

describe('Recordatorios — casos de borde', () => {
  const at = (iso: string) => new Date(`${iso}T14:00:00Z`);
  it('no se manda a quien ya no está activo, aunque tenga horas en el mes', async () => {
    const { db, hc, u, ts, email } = setup();
    await ts.createEntry(entry({ workDate: '2026-09-01' }), u.senior); // tiene horas ese mes pero faltan casi todos los días
    db.tables.user.rows.find((r) => r.id === u.senior.id)!.active = false;
    const view = await hc.overview(2026, 9, u.manager);
    expect(view.rows.find((r) => r.userId === u.senior.id)).toMatchObject({ active: false }); // sigue en el resumen
    await hc.remind({ ...SEPT } as any, u.manager);
    const to = email.send.mock.calls.map((c) => c[0].to);
    expect(to).not.toContain(u.senior.email);
    expect(to).toContain(u.auditor.email); // y a los activos sí
  });
  it('si el servidor no corrió el primer día hábil, la etapa 1 sale en los días siguientes', async () => {
    const { db, scheduler, email } = setup();
    await scheduler.run(at('2026-10-02')); // el 1.º no corrió
    expect(db.tables.hoursCloseSettings.rows[0].lastReminderPeriod).toBe('2026-09#1');
    expect(email.send).toHaveBeenCalled();
  });
  it('pasado el margen ya no se manda una etapa vieja', async () => {
    const { scheduler, email } = setup();
    await scheduler.run(at('2026-10-14')); // 10.º día hábil: ni la etapa 1 (margen hasta el 4.º) ni la 2 (plazo 5.º, margen hasta el 8.º)
    expect(email.send).not.toHaveBeenCalled();
  });
  it('con el plazo en el día 1, la etapa 2 no queda tapada por la 1', async () => {
    const { db, scheduler } = setup();
    db.tables.hoursCloseSettings.rows[0].entryDeadlineDay = 1;
    await scheduler.run(at('2026-10-01'));
    expect(db.tables.hoursCloseSettings.rows[0].lastReminderPeriod).toBe('2026-09#2');
  });
  it('el correo de la etapa 2 dice la verdad según el día', async () => {
    const { hc, email } = setup();
    jest.setSystemTime(new Date('2026-10-14T15:00:00Z')); // después del plazo (7-oct)
    await hc.sendReminders({ id: 'system', role: 'CAE', organizationId: 'org1' }, SEPT, 2);
    expect(email.send.mock.calls[0][0].body.paragraphs.join(' ')).toMatch(/venció el 2026-10-07/);
  });
});

describe('Horas antiguas sin motivo de no facturación', () => {
  it('se les puede editar el tiempo sin inventar un motivo, pero no tocar su categoría sin uno', async () => {
    const { db, u, ts } = setup({ enabled: false });
    db.tables.timeEntry.rows.push({
      id: 'viejo', organizationId: 'org1', userId: u.auditor.id, workDate: new Date('2026-09-10T00:00:00Z'), hours: 3,
      category: 'CLIENT_NON_BILLABLE', auditId: 'aud1', nonBillableReason: null, description: null, afterClose: false,
      closedAt: null, costRateSnapshot: null, billRateSnapshot: null, planItemId: null,
    });
    await expect(ts.updateEntry('viejo', { hours: 2 } as any, u.auditor)).resolves.toMatchObject({ hours: 2 });
    await expect(ts.updateEntry('viejo', { category: 'CLIENT_NON_BILLABLE', hours: 1 } as any, u.auditor)).rejects.toThrow(/motivo/);
  });
});

describe('Estado de un pedido: valor inválido', () => {
  it('la validación del DTO lo rechaza (400) en vez de llegar a la base', async () => {
    expect(await validate(plainToInstance(QueryAdjustmentsDto, { status: 'BORRAR' }))).toHaveLength(1);
    expect(await validate(plainToInstance(QueryAdjustmentsDto, { status: 'PENDING' }))).toHaveLength(0);
  });
});

describe('Restaurar o borrar un encargo no esquiva el cierre', () => {
  async function conSeptiembreCerrado() {
    const s = setup();
    await s.ts.createEntry(entry(), s.u.auditor);
    await s.close(s.u.manager);
    return s;
  }
  it('assertNoClosedHours rechaza meses cerrados, ignora los abiertos y no hace nada con el cierre apagado', async () => {
    const { db, u } = await conSeptiembreCerrado();
    const prisma = db as any;
    await expect(assertNoClosedHours(prisma, 'org1', [{ userId: u.auditor.id, workDate: new Date('2026-09-20T00:00:00Z') }], 'Borrar'))
      .rejects.toThrow(/meses ya cerrados \(2026-09\)/);
    await expect(assertNoClosedHours(prisma, 'org1', [{ userId: u.auditor.id, workDate: '2026-10-05' }], 'Borrar')).resolves.toBeUndefined(); // octubre abierto
    await expect(assertNoClosedHours(prisma, 'org1', [{ userId: u.senior.id, workDate: '2026-09-20' }], 'Borrar')).resolves.toBeUndefined(); // otra persona
    await expect(assertNoClosedHours(prisma, 'org1', [{ userId: null, workDate: null }], 'Borrar')).resolves.toBeUndefined();
    db.tables.hoursCloseSettings.rows[0].enabled = false;
    await expect(assertNoClosedHours(prisma, 'org1', [{ userId: u.auditor.id, workDate: '2026-09-20' }], 'Borrar')).resolves.toBeUndefined();
  });

  it('el borrado completo de un encargo (y el modo destructivo) se rechaza ANTES de borrar nada', async () => {
    const { db } = await conSeptiembreCerrado();
    const svc = new AuditBackupRestoreService(db as any, {} as any, {} as any, { get: () => 'secreto' } as any);
    const recolectar = jest.spyOn(svc, 'recolectarIdsExistentes');
    await expect(svc.eliminarDatosExistentes('aud1', [])).rejects.toThrow(/meses ya cerrados/);
    expect(recolectar).not.toHaveBeenCalled();
    expect(db.entries()).toHaveLength(1);
  });

  it('restaurar una copia con horas de un mes cerrado se rechaza antes de crear nada; si el mes está abierto pasa', async () => {
    const { db, u } = await conSeptiembreCerrado();
    const svc = new AuditBackupRestoreService(db as any, {} as any, {} as any, { get: () => 'secreto' } as any) as any;
    const copia = (workDate: string) => ({ timeEntry: [{ id: 'x', userId: u.auditor.id, workDate, hours: 2 }] });
    await expect(svc.asegurarHorasDeLaCopiaAbiertas(copia('2026-09-20T00:00:00.000Z'), u.manager)).rejects.toThrow(/Restaurar esta copia/);
    await expect(svc.asegurarHorasDeLaCopiaAbiertas(copia('2026-10-20T00:00:00.000Z'), u.manager)).resolves.toBeUndefined();
  });

  it('una hora restaurada entra como provisional: se descartan el costo, la tarifa y el cierre que traía la copia', () => {
    const svc = new AuditBackupRestoreService({} as any, {} as any, {} as any, { get: () => 'secreto' } as any) as any;
    const fila = { id: 'x', workDate: '2026-10-20T00:00:00.000Z', hours: 2, costRateSnapshot: '12.5', billRateSnapshot: '40', closedAt: '2026-11-07T00:00:00.000Z', afterClose: true, category: 'ADMIN' };
    const out = svc.remapearFila('timeEntry', fila, new Map(), { User: new Set(), AuditEntity: new Set(), AuditTemplate: new Set() }, { organizationId: 'org1' }, []);
    expect(out).not.toHaveProperty('costRateSnapshot');
    expect(out).not.toHaveProperty('billRateSnapshot');
    expect(out).not.toHaveProperty('closedAt');
    expect(out).not.toHaveProperty('afterClose');
    expect(out).toMatchObject({ hours: 2, category: 'ADMIN' });
  });
});
