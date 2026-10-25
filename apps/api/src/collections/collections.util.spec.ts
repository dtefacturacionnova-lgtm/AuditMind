import { BadRequestException, ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { formatMoney, fromCents, parseMoneyInput, parseSignedMoneyInput, toCents } from './money.util';
import { agingBucket, balanceCents, daysOverdue, deriveInvoiceStatus } from './balance.util';
import {
  allocateOldestFirst, assertWithinBalance, checkApplications, parseApplications, sumApplications,
} from './allocation.util';
import { addMonthsClamped, equalInstallments, milestoneItems, singlePayment } from './schedule.util';

describe('dinero en centavos', () => {
  it('convierte sin errores de coma flotante', () => {
    expect(toCents(0.1 + 0.2)).toBe(30);
    expect(toCents('1234.56')).toBe(123456);
    expect(toCents(new Prisma.Decimal('19.99'))).toBe(1999);
    expect(fromCents(123456).toString()).toBe('1234.56');
  });

  it('formatea para los mensajes', () => {
    expect(formatMoney(123456)).toBe('$1,234.56');
    expect(formatMoney(5)).toBe('$0.05');
    expect(formatMoney(-250)).toBe('-$2.50');
  });

  it('rechaza lo que no es un monto válido', () => {
    for (const bad of [0, -1, 'abc', 1.005, NaN, Infinity, null, undefined, {}, 1e10]) {
      expect(() => parseMoneyInput(bad as unknown)).toThrow(BadRequestException);
    }
    expect(parseMoneyInput(100.1)).toBe(10010);
    expect(parseMoneyInput('0.01')).toBe(1);
    expect(() => parseSignedMoneyInput(0)).toThrow(BadRequestException);
    expect(parseSignedMoneyInput(-50.5)).toBe(-5050);
  });
});

describe('saldo y estado de una factura', () => {
  const inv = (o: Partial<Record<'totalCents' | 'paidCents' | 'withheldCents' | 'creditedCents' | 'writtenOffCents', number>>) =>
    ({ totalCents: 11300, paidCents: 0, withheldCents: 0, creditedCents: 0, writtenOffCents: 0, ...o });

  it('abierta, parcial y saldada', () => {
    expect(deriveInvoiceStatus(inv({}))).toBe('OPEN');
    expect(deriveInvoiceStatus(inv({ paidCents: 5000 }))).toBe('PARTIAL');
    expect(deriveInvoiceStatus(inv({ paidCents: 11300 }))).toBe('SETTLED');
  });

  it('una retención baja el saldo sin ser dinero: cobrada neta de retención llega a SETTLED', () => {
    const m = inv({ paidCents: 10170, withheldCents: 1130 });
    expect(balanceCents(m)).toBe(0);
    expect(deriveInvoiceStatus(m)).toBe('SETTLED');
  });

  it('solo retención deja la factura en PARCIAL', () => {
    expect(deriveInvoiceStatus(inv({ withheldCents: 1130 }))).toBe('PARTIAL');
  });

  it('un saldo negativo es un error, no un estado', () => {
    expect(() => deriveInvoiceStatus(inv({ paidCents: 11300, withheldCents: 1 }))).toThrow();
  });

  it('antigüedad por días vencidos', () => {
    expect(daysOverdue('2026-03-01', '2026-02-01')).toBe(0);
    expect(agingBucket('2026-03-01', '2026-03-01')).toBe('CURRENT');
    expect(agingBucket('2026-03-01', '2026-03-02')).toBe('D1_30');
    expect(agingBucket('2026-03-01', '2026-03-31')).toBe('D1_30');
    expect(agingBucket('2026-03-01', '2026-04-01')).toBe('D31_60');
    expect(agingBucket('2026-03-01', '2026-05-30')).toBe('D61_90');
    expect(agingBucket('2026-03-01', '2026-06-01')).toBe('D90_PLUS');
  });
});

describe('reparto de un cobro (más antigua primero)', () => {
  const invs = [
    { id: 'inv-b-0001', invoiceNumber: 'DTE-03-0010', dueDate: '2026-03-10', balanceCents: 5000 },
    { id: 'inv-a-0001', invoiceNumber: 'DTE-03-0002', dueDate: '2026-02-10', balanceCents: 3000 },
    { id: 'inv-c-0001', invoiceNumber: 'DTE-03-0009', dueDate: '2026-03-10', balanceCents: 4000 },
  ];

  it('reparte por vencimiento y desempata por número en orden natural', () => {
    const r = allocateOldestFirst(10000, invs);
    expect(r.applications.map((a) => a.invoiceId)).toEqual(['inv-a-0001', 'inv-c-0001', 'inv-b-0001']);
    expect(r.applications.map((a) => a.amountCents)).toEqual([3000, 4000, 3000]);
    expect(r.appliedCents).toBe(10000);
    expect(r.unappliedCents).toBe(0);
  });

  it('lo que sobra queda sin aplicar y nada pasa del saldo', () => {
    const r = allocateOldestFirst(20000, invs);
    expect(r.appliedCents).toBe(12000);
    expect(r.unappliedCents).toBe(8000);
  });

  it('no usa facturas sin saldo ni montos negativos', () => {
    expect(allocateOldestFirst(-5, invs).applications).toEqual([]);
    expect(allocateOldestFirst(1000, [{ ...invs[0], balanceCents: 0 }]).applications).toEqual([]);
  });

  it('interpreta la lista que llega del cliente', () => {
    expect(parseApplications(undefined)).toEqual([]);
    expect(parseApplications([{ invoiceId: 'inv-a-0001', amount: 10.5 }])).toEqual([{ invoiceId: 'inv-a-0001', amountCents: 1050 }]);
    expect(() => parseApplications('x')).toThrow(BadRequestException);
    expect(() => parseApplications([{ invoiceId: 'corto', amount: 1 }])).toThrow(BadRequestException);
    expect(() => parseApplications([{ invoiceId: 'inv-a-0001', amount: 0 }])).toThrow(BadRequestException);
    expect(() => parseApplications([{ invoiceId: 'inv-a-0001', amount: 1.234 }])).toThrow(BadRequestException);
    expect(() => parseApplications([{ invoiceId: 'inv-a-0001', amount: 1 }, { invoiceId: 'inv-a-0001', amount: 2 }])).toThrow(BadRequestException);
    expect(sumApplications([{ invoiceId: 'a', amountCents: 5 }, { invoiceId: 'b', amountCents: 7 }])).toBe(12);
  });

  describe('revisión previa', () => {
    const rows = [
      { id: 'inv-a-0001', invoiceNumber: 'N-1', clientId: 'cl1', status: 'OPEN' as const, balanceCents: 3000 },
      { id: 'inv-v-0001', invoiceNumber: 'N-2', clientId: 'cl1', status: 'VOID' as const, balanceCents: 3000 },
      { id: 'inv-s-0001', invoiceNumber: 'N-3', clientId: 'cl1', status: 'SETTLED' as const, balanceCents: 0 },
      { id: 'inv-x-0001', invoiceNumber: 'N-4', clientId: 'otro', status: 'OPEN' as const, balanceCents: 3000 },
    ];
    const check = (apps: { invoiceId: string; amountCents: number }[], unappliedCents = 10000) =>
      checkApplications({ unappliedCents, clientId: 'cl1', applications: apps, invoices: rows });

    it('acepta una aplicación válida', () => {
      expect(check([{ invoiceId: 'inv-a-0001', amountCents: 3000 }])).toBe(3000);
    });
    it('404 si la factura no existe', () => {
      expect(() => check([{ invoiceId: 'inv-z-0001', amountCents: 1 }])).toThrow(NotFoundException);
    });
    it('422 si es de otro cliente', () => {
      expect(() => check([{ invoiceId: 'inv-x-0001', amountCents: 1 }])).toThrow(UnprocessableEntityException);
    });
    it('409 si está anulada o saldada', () => {
      expect(() => check([{ invoiceId: 'inv-v-0001', amountCents: 1 }])).toThrow(ConflictException);
      expect(() => check([{ invoiceId: 'inv-s-0001', amountCents: 1 }])).toThrow(ConflictException);
    });
    it('422 si el abono supera el saldo o el total supera lo no aplicado del cobro', () => {
      expect(() => check([{ invoiceId: 'inv-a-0001', amountCents: 3001 }])).toThrow(UnprocessableEntityException);
      expect(() => check([{ invoiceId: 'inv-a-0001', amountCents: 3000 }], 2999)).toThrow(UnprocessableEntityException);
    });
  });

  it('dinero + retención no puede pasar del saldo', () => {
    expect(() => assertWithinBalance({ invoiceNumber: 'N-1', balanceCents: 11300, moneyCents: 10170, withholdingCents: 1130 })).not.toThrow();
    expect(() => assertWithinBalance({ invoiceNumber: 'N-1', balanceCents: 11300, moneyCents: 10171, withholdingCents: 1130 })).toThrow(UnprocessableEntityException);
  });
});

describe('generador del calendario', () => {
  it('suma meses recortando al último día del mes sin acumular el recorte', () => {
    expect(addMonthsClamped('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonthsClamped('2026-01-31', 2)).toBe('2026-03-31');
    expect(addMonthsClamped('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonthsClamped('2026-11-15', 3)).toBe('2027-02-15');
    expect(addMonthsClamped('2026-12-31', 12)).toBe('2027-12-31');
  });

  it('cuotas iguales: la última absorbe los centavos y la suma es exacta', () => {
    const items = equalInstallments({ baseCents: 100000, count: 3, firstDate: '2026-01-31', everyMonths: 1, startSequence: 1 });
    expect(items.map((i) => i.amountCents)).toEqual([33333, 33333, 33334]);
    expect(items.reduce((s, i) => s + i.amountCents, 0)).toBe(100000);
    expect(items.map((i) => i.dueDate)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
    expect(items.map((i) => i.sequence)).toEqual([1, 2, 3]);
    expect(items[0].label).toBe('Cuota 1 de 3');
  });

  it('continúa la numeración y rechaza parámetros inválidos', () => {
    expect(equalInstallments({ baseCents: 5000, count: 2, firstDate: '2026-06-01', everyMonths: 3, startSequence: 4 }).map((i) => i.sequence)).toEqual([4, 5]);
    expect(() => equalInstallments({ baseCents: 0, count: 2, firstDate: '2026-06-01', everyMonths: 1, startSequence: 1 })).toThrow(BadRequestException);
    expect(() => equalInstallments({ baseCents: 100, count: 0, firstDate: '2026-06-01', everyMonths: 1, startSequence: 1 })).toThrow(BadRequestException);
    expect(() => equalInstallments({ baseCents: 100, count: 2, firstDate: '2026-02-30', everyMonths: 1, startSequence: 1 })).toThrow(BadRequestException);
    expect(() => equalInstallments({ baseCents: 100, count: 2, firstDate: '2026-06-01', everyMonths: 5, startSequence: 1 })).toThrow(BadRequestException);
    expect(() => equalInstallments({ baseCents: 3, count: 5, firstDate: '2026-06-01', everyMonths: 1, startSequence: 1 })).toThrow(BadRequestException);
  });

  it('hitos por porcentaje: suman 100 % y la suma de montos es exacta', () => {
    const items = milestoneItems({
      baseCents: 100001, startSequence: 1,
      milestones: [
        { label: 'Informe final', date: '2026-09-30', percent: 40 },
        { label: 'Firma del contrato', date: '2026-02-01', percent: 30 },
        { label: 'Fin de planificación', date: '2026-04-15', percent: 30 },
      ],
    });
    expect(items.map((i) => i.label)).toEqual(['Firma del contrato', 'Fin de planificación', 'Informe final']);
    expect(items.reduce((s, i) => s + i.amountCents, 0)).toBe(100001);
    expect(items.every((i) => i.kind === 'MILESTONE')).toBe(true);
    expect(() => milestoneItems({ baseCents: 1000, startSequence: 1, milestones: [{ label: 'a', date: '2026-01-01', percent: 50 }] })).toThrow(BadRequestException);
  });

  it('hitos por monto deben sumar lo que falta; no se mezclan porcentajes y montos', () => {
    expect(milestoneItems({ baseCents: 1000, startSequence: 1, milestones: [{ label: 'a', date: '2026-01-01', amountCents: 400 }, { label: 'b', date: '2026-02-01', amountCents: 600 }] })).toHaveLength(2);
    expect(() => milestoneItems({ baseCents: 1000, startSequence: 1, milestones: [{ label: 'a', date: '2026-01-01', amountCents: 400 }, { label: 'b', date: '2026-02-01', amountCents: 500 }] })).toThrow(BadRequestException);
    expect(() => milestoneItems({ baseCents: 1000, startSequence: 1, milestones: [{ label: 'a', date: '2026-01-01', amountCents: 400 }, { label: 'b', date: '2026-02-01', percent: 50 }] })).toThrow(BadRequestException);
  });

  it('un hito con porcentaje o monto null se trata como ausente: 400, nunca un error interno', () => {
    expect(() => milestoneItems({ baseCents: 1000, startSequence: 1, milestones: [{ label: 'a', date: '2026-01-01', percent: null as any }, { label: 'b', date: '2026-02-01', percent: null as any }] })).toThrow(BadRequestException);
    expect(() => milestoneItems({ baseCents: 1000, startSequence: 1, milestones: [{ label: 'a', date: '2026-01-01', percent: 'abc' as any }] })).toThrow(BadRequestException);
    expect(milestoneItems({ baseCents: 1000, startSequence: 1, milestones: [{ label: 'a', date: '2026-01-01', percent: 100, amountCents: null as any }] })).toHaveLength(1);
  });

  it('pago único', () => {
    expect(singlePayment({ baseCents: 2500, date: '2026-12-01', startSequence: 3 })).toEqual([
      { sequence: 3, label: 'Honorarios', kind: 'INSTALLMENT', dueDate: '2026-12-01', amountCents: 2500 },
    ]);
  });
});
