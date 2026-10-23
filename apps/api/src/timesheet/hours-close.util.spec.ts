/* eslint-disable @typescript-eslint/no-explicit-any */
import { ForbiddenException } from '@nestjs/common';
import { TimeEntryCategory } from '@prisma/client';
import {
  assertCanCloseFor, mergeEntryChanges, periodKeyOf, periodLabel, periodRange, uniquePeriods, validateCategoryLinkage,
  validateEntryRules,
} from './hours-close.util';
import {
  businessDaysOf, isPeriodFinished, nextPeriod, nthBusinessDay, previousPeriod, reminderAlreadySent, reminderKey, todayInSalvador,
} from './hours-close.calendar';

const who = (id: string, role: string) => ({ id, role });

describe('Quién cierra a quién', () => {
  it('un auditor o un auditor sénior no cierran nada', () => {
    expect(() => assertCanCloseFor(who('a', 'AUDITOR'), who('b', 'AUDITOR'))).toThrow(ForbiddenException);
    expect(() => assertCanCloseFor(who('a', 'SENIOR_AUDITOR'), who('b', 'AUDITOR'))).toThrow(ForbiddenException);
  });
  it('un gerente cierra a un auditor y a un sénior', () => {
    expect(() => assertCanCloseFor(who('m', 'AUDIT_MANAGER'), who('a', 'AUDITOR'))).not.toThrow();
    expect(() => assertCanCloseFor(who('m', 'AUDIT_MANAGER'), who('s', 'SENIOR_AUDITOR'))).not.toThrow();
  });
  it('nadie cierra sus propias horas, ni siquiera la dirección ni un administrador', () => {
    for (const role of ['AUDIT_MANAGER', 'CAE', 'ADMIN', 'SUPER_ADMIN']) {
      expect(() => assertCanCloseFor(who('x', role), who('x', role))).toThrow(/propias horas/);
    }
  });
  it('las horas de un gerente las cierra la dirección, no otro gerente', () => {
    expect(() => assertCanCloseFor(who('m1', 'AUDIT_MANAGER'), who('m2', 'AUDIT_MANAGER'))).toThrow(/dirección/);
    expect(() => assertCanCloseFor(who('c', 'CAE'), who('m2', 'AUDIT_MANAGER'))).not.toThrow();
    expect(() => assertCanCloseFor(who('ad', 'ADMIN'), who('c', 'CAE'))).not.toThrow();
  });
});

describe('Períodos', () => {
  it('el mes se toma de la fecha en UTC, sin correrse por la zona horaria', () => {
    expect(periodKeyOf('2026-10-31')).toEqual({ year: 2026, month: 10 });
    expect(periodKeyOf('2026-11-01')).toEqual({ year: 2026, month: 11 });
    expect(periodKeyOf(new Date('2026-12-31T23:59:59Z'))).toEqual({ year: 2026, month: 12 });
  });
  it('una fecha inválida se rechaza', () => {
    expect(() => periodKeyOf('no-es-fecha')).toThrow(/inválida/);
  });
  it('agrupa y ordena los meses sin repetir', () => {
    expect(uniquePeriods(['2026-10-05', '2026-09-30', '2026-10-31']).map(periodLabel)).toEqual(['2026-09', '2026-10']);
  });
  it('el rango del mes es [primer día, primer día del siguiente)', () => {
    const r = periodRange({ year: 2026, month: 12 });
    expect(r.gte.toISOString()).toBe('2026-12-01T00:00:00.000Z');
    expect(r.lt.toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });
});

describe('Calendario del cierre', () => {
  const noHolidays = new Set<string>();
  it('octubre de 2026 tiene 22 días hábiles', () => {
    expect(businessDaysOf({ year: 2026, month: 10 }, noHolidays)).toHaveLength(22);
  });
  it('un festivo deja de ser día hábil', () => {
    const days = businessDaysOf({ year: 2026, month: 10 }, new Set(['2026-10-12']));
    expect(days).toHaveLength(21);
    expect(days).not.toContain('2026-10-12');
  });
  it('el n-ésimo día hábil cuenta fines de semana y festivos como si no existieran', () => {
    // noviembre de 2026: el 1 es domingo → 1.º hábil = lunes 2; con 2 de noviembre festivo (Día de los Difuntos) = martes 3
    expect(nthBusinessDay({ year: 2026, month: 11 }, 1, noHolidays)).toBe('2026-11-02');
    expect(nthBusinessDay({ year: 2026, month: 11 }, 1, new Set(['2026-11-02']))).toBe('2026-11-03');
    expect(nthBusinessDay({ year: 2026, month: 11 }, 5, noHolidays)).toBe('2026-11-06');
    expect(nthBusinessDay({ year: 2026, month: 11 }, 10, noHolidays)).toBe('2026-11-13');
  });
  it('si el mes no tiene tantos días hábiles devuelve el último', () => {
    expect(nthBusinessDay({ year: 2026, month: 11 }, 28, noHolidays)).toBe('2026-11-30');
  });
  it('mes siguiente y anterior cruzan el año', () => {
    expect(nextPeriod({ year: 2026, month: 12 })).toEqual({ year: 2027, month: 1 });
    expect(previousPeriod({ year: 2026, month: 1 })).toEqual({ year: 2025, month: 12 });
  });
  it('un mes está terminado solo cuando ya empezó el siguiente', () => {
    expect(isPeriodFinished({ year: 2026, month: 9 }, '2026-10-01')).toBe(true);
    expect(isPeriodFinished({ year: 2026, month: 10 }, '2026-10-31')).toBe(false);
    expect(isPeriodFinished({ year: 2026, month: 12 }, '2027-01-01')).toBe(true);
  });
  it('"hoy" es el de El Salvador aunque en UTC ya sea el día siguiente', () => {
    expect(todayInSalvador(new Date('2026-10-23T03:30:00Z'))).toBe('2026-10-22'); // 21:30 del 22 en El Salvador
    expect(todayInSalvador(new Date('2026-10-22T14:00:00Z'))).toBe('2026-10-22');
  });
  it('un recordatorio no se repite ni retrocede de etapa', () => {
    const k1 = reminderKey({ year: 2026, month: 9 }, 1);
    const k2 = reminderKey({ year: 2026, month: 9 }, 2);
    expect(reminderAlreadySent(null, k1)).toBe(false);
    expect(reminderAlreadySent(k1, k1)).toBe(true);
    expect(reminderAlreadySent(k1, k2)).toBe(false);
    expect(reminderAlreadySent(k2, k1)).toBe(true);
    expect(reminderAlreadySent('2026-08#2', k1)).toBe(false);
  });
});

describe('Reglas del registro', () => {
  const C = TimeEntryCategory;
  it('una hora de cliente no facturable necesita motivo', () => {
    expect(validateEntryRules({ category: C.CLIENT_NON_BILLABLE, description: 'x' }, false)).toMatch(/motivo/);
    expect(validateEntryRules({ category: C.CLIENT_NON_BILLABLE, nonBillableReason: 'REWORK' }, false)).toBeNull();
  });
  it('solo las no facturables llevan motivo', () => {
    expect(validateEntryRules({ category: C.CLIENT_BILLABLE, nonBillableReason: 'REWORK' }, false)).toMatch(/Solo/);
    expect(validateEntryRules({ category: C.ADMIN, nonBillableReason: 'OTHER' }, false)).toMatch(/Solo/);
  });
  it('la descripción de cliente solo se exige con el cierre activo', () => {
    expect(validateEntryRules({ category: C.CLIENT_BILLABLE, description: '' }, false)).toBeNull();
    expect(validateEntryRules({ category: C.CLIENT_BILLABLE, description: '   ' }, true)).toMatch(/descripción/);
    expect(validateEntryRules({ category: C.CLIENT_BILLABLE, description: 'abc' }, true)).toMatch(/descripción/);
    expect(validateEntryRules({ category: C.CLIENT_BILLABLE, description: 'Revisión de cuentas' }, true)).toBeNull();
  });
  it('lo que no es de cliente no pide descripción', () => {
    expect(validateEntryRules({ category: C.ADMIN }, true)).toBeNull();
    expect(validateEntryRules({ category: C.VACATION }, true)).toBeNull();
  });
  it('las horas de cliente requieren encargo y las demás no pueden traerlo', () => {
    expect(validateCategoryLinkage({ category: C.CLIENT_BILLABLE })).toMatch(/requiere/);
    expect(validateCategoryLinkage({ category: C.CLIENT_BILLABLE, auditId: 'a1' })).toBeNull();
    expect(validateCategoryLinkage({ category: C.ADMIN, auditId: 'a1' })).toMatch(/no admite/);
    expect(validateCategoryLinkage({ category: C.ADMIN })).toBeNull();
  });
});

describe('Cambios parciales de una hora', () => {
  const base = {
    workDate: new Date('2026-09-10T00:00:00Z'), hours: 4, category: TimeEntryCategory.CLIENT_BILLABLE,
    description: 'Revisión', auditId: 'aud1', planItemId: null, nonBillableReason: null,
  } as any;
  it('lo que no se manda se conserva', () => {
    expect(mergeEntryChanges(base, { hours: 6 })).toMatchObject({ workDate: '2026-09-10', hours: 6, auditId: 'aud1', description: 'Revisión' });
  });
  it('null quita el campo', () => {
    expect(mergeEntryChanges(base, { description: null }).description).toBeNull();
  });
  it('pasar a una categoría que no es de cliente suelta el encargo', () => {
    expect(mergeEntryChanges(base, { category: TimeEntryCategory.ADMIN }).auditId).toBeNull();
  });
  it('volver a facturable suelta el motivo de no facturación', () => {
    const noFact = { ...base, category: TimeEntryCategory.CLIENT_NON_BILLABLE, nonBillableReason: 'REWORK' };
    expect(mergeEntryChanges(noFact, { category: TimeEntryCategory.CLIENT_BILLABLE }).nonBillableReason).toBeNull();
    expect(mergeEntryChanges(noFact, { hours: 2 }).nonBillableReason).toBe('REWORK');
  });
});
