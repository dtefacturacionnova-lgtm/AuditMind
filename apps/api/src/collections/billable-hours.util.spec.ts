import { buildHourLine, hoursUnits, lineAmountCents, monthOf, sumLines, unitsToDecimal } from './billable-hours.util';

describe('horas facturables — aritmética entera', () => {
  it('el monto de una hora es horas × tarifa redondeado a centavos, con .5 hacia arriba', () => {
    expect(lineAmountCents(8, 5000)).toBe(40000);          // 8 h × $50.00
    expect(lineAmountCents(1.5, 1055)).toBe(1583);          // 15.825 → 15.83
    expect(lineAmountCents(0.3333, 1055)).toBe(352);        // 3.516315 → 3.52
    expect(lineAmountCents(0.25, 10)).toBe(3);              // 0.025 → 0.03 (mitad hacia arriba)
    expect(lineAmountCents(2.75, 8000)).toBe(22000);
  });

  it('las horas se llevan a diezmilésimas sin arrastrar errores de coma flotante', () => {
    expect(hoursUnits(0.1 + 0.2)).toBe(3000);
    expect(hoursUnits(1.0001)).toBe(10001);
    expect(unitsToDecimal(hoursUnits(2.5))).toBe('2.5000');
    expect(unitsToDecimal(hoursUnits(0.3333))).toBe('0.3333');
  });

  it('una hora sin tarifa, con tarifa cero o sin horas no genera línea', () => {
    expect(buildHourLine('a', 2, null)).toBeNull();
    expect(buildHourLine('a', 2, 0)).toBeNull();
    expect(buildHourLine('a', 0, 5000)).toBeNull();
    expect(buildHourLine('a', 0.00001, 5000)).toBeNull();   // menos de media diezmilésima
    expect(buildHourLine('a', 2, 5000)).toEqual({ timeEntryId: 'a', hoursUnits: 20000, rateCents: 5000, amountCents: 10000 });
  });

  it('suma las líneas y ubica el mes de la fecha de trabajo', () => {
    expect(sumLines([{ amountCents: 1583 }, { amountCents: 352 }])).toBe(1935);
    expect(monthOf(new Date('2026-09-30T00:00:00Z'))).toBe('2026-09');
    expect(monthOf(new Date('2026-10-01T00:00:00Z'))).toBe('2026-10');
  });

  it('la suma de montos por hora puede diferir de multiplicar el total (por eso cada hora lleva su propio monto)', () => {
    // 3 horas de 0.3333 a $10.55: por hora 352 centavos cada una (1056); en conjunto 0.9999 × 10.55 = 10.549… → 1055
    const each = lineAmountCents(0.3333, 1055) * 3;
    const together = lineAmountCents(0.3333 * 3, 1055);
    expect(each).toBe(1056);
    expect(together).toBe(1055);
  });
});
