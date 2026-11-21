import {
  STORAGE_USD_PER_GB_R2, STORAGE_USD_PER_GB_SUPABASE, aiExpectedCost, aiSafetyCap, lowestMonthlyPrice, marginOver, monthlyEquivalent,
  roundCents, storageCost, sumCosts, toNumber, usd,
} from './pricing';

describe('equivalencia peticiones de IA → dinero', () => {
  it('1,000 peticiones ≈ $1.20 con el costo medido de $0.0012', () => {
    expect(roundCents(aiExpectedCost(1000, 0.0012)!)).toBe(1.2);
  });

  it('coincide con la tabla del diseño (§11.3): 500 → $0.60, 2,000 → $2.40, 5,000 → $6.00, 20,000 → $24.00', () => {
    expect(roundCents(aiExpectedCost(500, 0.0012)!)).toBe(0.6);
    expect(roundCents(aiExpectedCost(2000, 0.0012)!)).toBe(2.4);
    expect(roundCents(aiExpectedCost(5000, 0.0012)!)).toBe(6);
    expect(roundCents(aiExpectedCost(20000, 0.0012)!)).toBe(24);
  });

  it('el tope de seguridad es costo × multiplicador (3 veces por defecto)', () => {
    expect(roundCents(aiSafetyCap(500, 0.0012, 3)!)).toBe(1.8);
    expect(roundCents(aiSafetyCap(20000, 0.0012, 3)!)).toBe(72);
    expect(roundCents(aiSafetyCap(5000, 0.0012, 2.5)!)).toBe(15);
  });

  it('usa los parámetros que se le pasan (si cambia el costo por petición, cambia el resultado)', () => {
    expect(roundCents(aiExpectedCost(1000, 0.002)!)).toBe(2);
  });

  it('sin tope (-1) o valores inválidos no tienen costo calculable', () => {
    expect(aiExpectedCost(-1, 0.0012)).toBeNull();
    expect(aiExpectedCost(NaN, 0.0012)).toBeNull();
    expect(aiExpectedCost(100, NaN)).toBeNull();
    expect(aiSafetyCap(-1, 0.0012, 3)).toBeNull();
    expect(aiSafetyCap(100, 0.0012, NaN)).toBeNull();
    expect(aiExpectedCost(0, 0.0012)).toBe(0);
  });
});

describe('costo del espacio (valor ilustrativo)', () => {
  it('100 GB en Supabase ≈ $2.13 y en R2 = $1.50', () => {
    expect(roundCents(storageCost(100)!)).toBe(2.13);
    expect(roundCents(storageCost(100, STORAGE_USD_PER_GB_R2)!)).toBe(1.5);
    expect(STORAGE_USD_PER_GB_SUPABASE).toBe(0.0213);
  });

  it('500 GB en Supabase ≈ $10.65 (cifra del diseño §11.2)', () => {
    expect(roundCents(storageCost(500)!)).toBe(10.65);
  });

  it('sin tope no tiene costo calculable', () => {
    expect(storageCost(-1)).toBeNull();
  });
});

describe('equivalencia por mes de una licencia', () => {
  it('divide el precio entre los meses', () => {
    expect(monthlyEquivalent(1490, 12)).toBeCloseTo(124.1667, 3);
    expect(monthlyEquivalent(424, 3)).toBeCloseTo(141.3333, 3);
    expect(monthlyEquivalent(149, 1)).toBe(149);
  });

  it('sin vencimiento no tiene equivalencia mensual', () => {
    expect(monthlyEquivalent(0, 0)).toBeNull();
    expect(monthlyEquivalent(100, -1)).toBeNull();
  });

  it('el precio por mes más bajo entre las duraciones activas', () => {
    expect(lowestMonthlyPrice([
      { months: 1, on: true, price: 149 }, { months: 3, on: true, price: 424 }, { months: 12, on: true, price: 1490 }, { months: 0, on: true, price: 0 },
    ])).toBeCloseTo(124.1667, 3);
  });

  it('ignora duraciones apagadas, sin precio o sin vencimiento', () => {
    expect(lowestMonthlyPrice([{ months: 12, on: false, price: 1200 }, { months: 1, on: true, price: 149 }])).toBe(149);
    expect(lowestMonthlyPrice([{ months: 1, on: true, price: null }])).toBeNull();
    expect(lowestMonthlyPrice([{ months: 0, on: true, price: 0 }])).toBeNull();
    expect(lowestMonthlyPrice([])).toBeNull();
  });
});

describe('costo total y margen', () => {
  it('plan Empresa Despacho del diseño: costo $8.13 y margen del 95 % sobre $149', () => {
    const total = sumCosts(aiExpectedCost(5000, 0.0012), storageCost(100));
    expect(roundCents(total!)).toBe(8.13);
    const m = marginOver(149, total);
    expect(m!.pct).toBe(95);
    expect(roundCents(m!.amount)).toBe(140.87);
  });

  it('plan Plus del diseño: costo $34.65 y margen del 88 % sobre $299', () => {
    const total = sumCosts(aiExpectedCost(20000, 0.0012), storageCost(500));
    expect(roundCents(total!)).toBe(34.65);
    expect(marginOver(299, total)!.pct).toBe(88);
  });

  it('sin precio o sin costo no hay margen', () => {
    expect(marginOver(null, 5)).toBeNull();
    expect(marginOver(0, 5)).toBeNull();
    expect(marginOver(100, null)).toBeNull();
  });

  it('un costo mayor que el precio da margen negativo', () => {
    expect(marginOver(10, 15)!.pct).toBe(-50);
  });

  it('si un costo no es calculable (sin tope), el total tampoco', () => {
    expect(sumCosts(1, null, 2)).toBeNull();
    expect(sumCosts()).toBe(0);
  });
});

describe('texto de dinero', () => {
  it('formatea USD', () => {
    expect(usd(8.1315)).toBe('$8.13');
    expect(usd(1490)).toBe('$1,490.00');
    expect(usd(0.0012, 4)).toBe('$0.0012');
    expect(usd(null)).toBe('—');
    expect(usd(NaN)).toBe('—');
  });

  it('lee decimales del API (texto)', () => {
    expect(toNumber('149.00')).toBe(149);
    expect(toNumber(12)).toBe(12);
    expect(toNumber('')).toBeNull();
    expect(toNumber(null)).toBeNull();
    expect(toNumber('abc')).toBeNull();
  });
});
