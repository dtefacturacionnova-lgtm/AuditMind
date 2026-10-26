import { computeAccrual, AccrualInput } from './accrual.util';
import {
  CutoffInvoice, CutoffMovement, StatementEvent, agingAt, balanceAt, buildStatement, invoiceExistsAt, movementActiveAt, salvadorDay,
} from './cutoff.util';

/** Funciones puras de la fase 3c: saldos a una fecha de corte, antigüedad, estado de cuenta y devengado. Todo en centavos. */
const inv = (over: Partial<CutoffInvoice> = {}): CutoffInvoice => ({
  id: 'i1', clientId: 'c1', invoiceNumber: 'DTE-03-1', invoiceDate: '2026-01-10', dueDate: '2026-02-09', totalCents: 11300, voidedOn: null, ...over,
});
const mv = (over: Partial<CutoffMovement>): CutoffMovement => ({ invoiceId: 'i1', kind: 'APPLICATION', cents: 1000, effectiveOn: '2026-02-01', undoneOn: null, ...over });

describe('día de El Salvador', () => {
  it('un instante de la noche (UTC) cae todavía en el día anterior en El Salvador (UTC−6)', () => {
    expect(salvadorDay(new Date('2026-03-05T03:00:00Z'))).toBe('2026-03-04');
    expect(salvadorDay(new Date('2026-03-05T06:00:00Z'))).toBe('2026-03-05');
    expect(salvadorDay(new Date('2026-03-05T12:00:00Z'))).toBe('2026-03-05');
  });
});

describe('vigencia de un movimiento y de una factura al corte', () => {
  it('un movimiento cuenta desde su día y deja de contar el día en que se deshizo', () => {
    const m = mv({ effectiveOn: '2026-02-01', undoneOn: '2026-03-01' });
    expect(movementActiveAt(m, '2026-01-31')).toBe(false);
    expect(movementActiveAt(m, '2026-02-01')).toBe(true);
    expect(movementActiveAt(m, '2026-02-28')).toBe(true);
    expect(movementActiveAt(m, '2026-03-01')).toBe(false); // al cierre del día de la reversa ya no cuenta
  });
  it('una factura existe desde su fecha y hasta el día anterior a su anulación', () => {
    const i = inv({ voidedOn: '2026-03-01' });
    expect(invoiceExistsAt(i, '2026-01-09')).toBe(false);
    expect(invoiceExistsAt(i, '2026-01-10')).toBe(true);
    expect(invoiceExistsAt(i, '2026-02-28')).toBe(true);
    expect(invoiceExistsAt(i, '2026-03-01')).toBe(false);
  });
});

describe('saldo a una fecha de corte', () => {
  const moves: CutoffMovement[] = [
    mv({ kind: 'WITHHOLDING', cents: 1300, effectiveOn: '2026-01-10' }),                         // retención al emitir
    mv({ kind: 'APPLICATION', cents: 4000, effectiveOn: '2026-02-01', undoneOn: '2026-04-01' }),  // cobro aplicado y quitado después
    mv({ kind: 'CREDIT_NOTE', cents: 1000, effectiveOn: '2026-03-01' }),
    mv({ kind: 'WRITE_OFF', cents: 2000, effectiveOn: '2026-05-01', undoneOn: '2026-06-01' }),
  ];
  it('reconstruye cada fecha con lo que valía entonces, no con lo de hoy', () => {
    expect(balanceAt(inv(), moves, '2026-01-09')).toBeNull();                       // la factura aún no existía
    expect(balanceAt(inv(), moves, '2026-01-31')!.balanceCents).toBe(10000);        // 11300 − 1300
    expect(balanceAt(inv(), moves, '2026-02-15')!.balanceCents).toBe(6000);         // − 4000
    expect(balanceAt(inv(), moves, '2026-03-15')!.balanceCents).toBe(5000);         // − 1000 de la nota de crédito
    expect(balanceAt(inv(), moves, '2026-04-15')!.balanceCents).toBe(9000);         // el cobro se quitó el 1-abr: el saldo vuelve a subir
    expect(balanceAt(inv(), moves, '2026-05-15')!.balanceCents).toBe(7000);         // − 2000 castigado
    expect(balanceAt(inv(), moves, '2026-06-15')!.balanceCents).toBe(9000);         // castigo revertido el 1-jun
  });
  it('una factura anulada después del corte sí existía en el corte; la anulada antes no', () => {
    expect(balanceAt(inv({ voidedOn: '2026-03-01' }), [], '2026-02-15')!.balanceCents).toBe(11300);
    expect(balanceAt(inv({ voidedOn: '2026-03-01' }), [], '2026-03-02')).toBeNull();
  });
  it('nunca devuelve un saldo negativo y desglosa lo descontado', () => {
    const b = balanceAt(inv({ totalCents: 1000 }), [mv({ cents: 1500, effectiveOn: '2026-01-11' })], '2026-02-01')!;
    expect(b.balanceCents).toBe(0);
    expect(b.paidCents).toBe(1500);
  });
});

describe('antigüedad de saldos', () => {
  const invoices: CutoffInvoice[] = [
    inv({ id: 'a', clientId: 'c1', invoiceNumber: 'A', invoiceDate: '2026-06-01', dueDate: '2026-07-01', totalCents: 10000 }),  // al 2026-07-10: 9 días
    inv({ id: 'b', clientId: 'c1', invoiceNumber: 'B', invoiceDate: '2026-03-01', dueDate: '2026-03-31', totalCents: 20000 }),  // 101 días
    inv({ id: 'c', clientId: 'c2', invoiceNumber: 'C', invoiceDate: '2026-07-01', dueDate: '2026-07-31', totalCents: 5000 }),   // corriente
    inv({ id: 'd', clientId: 'c2', invoiceNumber: 'D', invoiceDate: '2026-04-01', dueDate: '2026-05-01', totalCents: 7000 }),   // 70 días
    inv({ id: 'e', clientId: 'c3', invoiceNumber: 'E', invoiceDate: '2026-04-01', dueDate: '2026-05-01', totalCents: 3000 }),   // saldada: no aparece
  ];
  const moves: CutoffMovement[] = [
    mv({ invoiceId: 'e', cents: 3000, effectiveOn: '2026-05-05' }),
    mv({ invoiceId: 'b', kind: 'WRITE_OFF', cents: 5000, effectiveOn: '2026-07-05' }), // castigado: sale de la antigüedad
  ];
  it('reparte por días vencidos, excluye lo castigado y lo saldado, y ordena por monto', () => {
    const r = agingAt(invoices, moves, '2026-07-10');
    expect(r.clients.map((c) => c.clientId)).toEqual(['c1', 'c2']);
    const c1 = r.clients[0];
    expect(c1.totals).toEqual({ CURRENT: 0, D1_30: 10000, D31_60: 0, D61_90: 0, D90_PLUS: 15000 }); // B: 20000 − 5000 castigados
    expect(c1.totalCents).toBe(25000);
    const c2 = r.clients[1];
    expect(c2.totals).toEqual({ CURRENT: 5000, D1_30: 0, D31_60: 0, D61_90: 7000, D90_PLUS: 0 });
    expect(r.totalCents).toBe(37000);
    expect(r.totals.D90_PLUS).toBe(15000);
    expect(c1.invoices.map((i) => i.invoiceNumber)).toEqual(['B', 'A']); // la más atrasada primero
  });
  it('a una fecha anterior el castigo aún no existía: el saldo era mayor', () => {
    expect(agingAt(invoices, moves, '2026-07-04').clients[0].totals.D90_PLUS).toBe(20000);
  });
});

describe('estado de cuenta', () => {
  const events: StatementEvent[] = [
    { date: '2026-01-10', kind: 'INVOICE', order: 0, reference: 'F1', description: 'Factura', debitCents: 11300, creditCents: 0 },
    { date: '2026-01-10', kind: 'WITHHOLDING', order: 1, reference: 'F1', description: 'Retención', debitCents: 0, creditCents: 1300 },
    { date: '2026-02-01', kind: 'APPLICATION', order: 3, reference: 'F1', description: 'Cobro', debitCents: 0, creditCents: 4000 },
    { date: '2026-03-01', kind: 'APPLICATION_REVERSED', order: 4, reference: 'F1', description: 'Aplicación quitada', debitCents: 4000, creditCents: 0 },
    { date: '2026-09-01', kind: 'WRITE_OFF', order: 7, reference: 'F1', description: 'Castigo', debitCents: 0, creditCents: 2000 },
  ];
  it('lleva el saldo corrido, mete la factura antes de sus movimientos del mismo día y no incluye lo posterior al corte', () => {
    const r = buildStatement(events, { asOf: '2026-06-30' });
    expect(r.lines.map((l) => [l.kind, l.balanceCents])).toEqual([['INVOICE', 11300], ['WITHHOLDING', 10000], ['APPLICATION', 6000], ['APPLICATION_REVERSED', 10000]]);
    expect(r.closingCents).toBe(10000);
    expect(r.openingCents).toBe(0);
  });
  it('con fecha inicial resume lo anterior como saldo de apertura', () => {
    const r = buildStatement(events, { asOf: '2026-12-31', from: '2026-02-15' });
    expect(r.openingCents).toBe(6000);          // al 14-feb
    expect(r.lines.map((l) => l.kind)).toEqual(['APPLICATION_REVERSED', 'WRITE_OFF']);
    expect(r.lines[0].balanceCents).toBe(10000);
    expect(r.closingCents).toBe(8000);
  });
});

describe('devengado', () => {
  const base: AccrualInput = {
    feeType: 'FIXED', feeTotalCents: 1_000_000, method: 'HOURS', invoicedNetCents: 200_000, billableHours: 50, budgetHours: 200,
    completionDone: false, milestoneDoneCents: 0, manualPct: null,
  };
  it('por horas: horas facturables ÷ presupuesto, y por facturar es lo devengado menos lo facturado', () => {
    expect(computeAccrual(base)).toEqual({ progressPct: 25, accruedCents: 250_000, toInvoiceCents: 50_000, basis: 'HOURS', missing: null });
  });
  it('sin presupuesto completo el avance es nulo: no se inventa', () => {
    expect(computeAccrual({ ...base, budgetHours: null })).toMatchObject({ progressPct: null, accruedCents: null, toInvoiceCents: null, missing: 'NO_BUDGET' });
    expect(computeAccrual({ ...base, budgetHours: 0 })).toMatchObject({ progressPct: null, missing: 'NO_BUDGET' });
  });
  it('tope de 100 % y el informe final firmado lo fija en 100 % aunque falte presupuesto', () => {
    expect(computeAccrual({ ...base, billableHours: 400 })).toMatchObject({ progressPct: 100, accruedCents: 1_000_000 });
    expect(computeAccrual({ ...base, budgetHours: null, completionDone: true })).toMatchObject({ progressPct: 100, basis: 'COMPLETION', accruedCents: 1_000_000 });
  });
  it('por facturar nunca es negativo (se facturó por adelantado)', () => {
    expect(computeAccrual({ ...base, invoicedNetCents: 600_000 })).toMatchObject({ accruedCents: 250_000, toInvoiceCents: 0 });
  });
  it('por hitos: lo cumplido ÷ honorario; manual: el porcentaje de la dirección o nulo si no lo fijó', () => {
    expect(computeAccrual({ ...base, method: 'MILESTONES', milestoneDoneCents: 300_000 })).toMatchObject({ progressPct: 30, accruedCents: 300_000, basis: 'MILESTONES' });
    expect(computeAccrual({ ...base, method: 'MANUAL', manualPct: 40 })).toMatchObject({ progressPct: 40, accruedCents: 400_000 });
    expect(computeAccrual({ ...base, method: 'MANUAL', manualPct: null })).toMatchObject({ progressPct: null, missing: 'NO_MANUAL_PROGRESS' });
  });
  it('por tiempo: el ingreso es lo facturado y no hay avance', () => {
    expect(computeAccrual({ ...base, feeType: 'TIME_BASED', feeTotalCents: null })).toEqual({ progressPct: null, accruedCents: 200_000, toInvoiceCents: null, basis: 'INVOICED', missing: null });
  });
  it('redondea a centavos', () => {
    expect(computeAccrual({ ...base, feeTotalCents: 10_000, invoicedNetCents: 0, billableHours: 1, budgetHours: 3 })).toMatchObject({ progressPct: 33.33, accruedCents: 3333 });
  });
});
