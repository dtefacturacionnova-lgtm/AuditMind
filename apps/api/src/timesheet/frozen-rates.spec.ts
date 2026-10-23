import { resolveBillRate, resolveCostRate } from './frozen-rates';

const closed = new Date('2026-10-07T12:00:00Z');

describe('Costo por hora de una hora registrada', () => {
  it('mes abierto: vale el perfil vigente y es provisional', () => {
    expect(resolveCostRate({ closedAt: null, costRateSnapshot: 99 }, 12.5)).toEqual({ rate: 12.5, frozen: false });
  });
  it('mes abierto sin perfil: sin costo, nunca $0', () => {
    expect(resolveCostRate({ closedAt: null }, undefined)).toEqual({ rate: null, frozen: false });
    expect(resolveCostRate({ closedAt: null }, null)).toEqual({ rate: null, frozen: false });
  });
  it('mes cerrado: vale el costo congelado, aunque el perfil de hoy sea otro', () => {
    expect(resolveCostRate({ closedAt: closed, costRateSnapshot: 12.5 }, 99)).toEqual({ rate: 12.5, frozen: true });
  });
  it('mes cerrado SIN costo congelado: queda sin costear, no se mira el perfil de hoy', () => {
    expect(resolveCostRate({ closedAt: closed, costRateSnapshot: null }, 99)).toEqual({ rate: null, frozen: true });
  });
  it('un costo congelado de $0 es un costo de $0 (dato real), no "sin dato"', () => {
    expect(resolveCostRate({ closedAt: closed, costRateSnapshot: 0 }, 99)).toEqual({ rate: 0, frozen: true });
  });
  it('lee los Decimal de Prisma, que llegan como objetos o como texto', () => {
    expect(resolveCostRate({ closedAt: closed, costRateSnapshot: { toString: () => '12.50' } }, 1).rate).toBe(12.5);
    expect(resolveCostRate({ closedAt: closed, costRateSnapshot: '12.5' }, 1).rate).toBe(12.5);
    expect(resolveCostRate({ closedAt: closed, costRateSnapshot: 'no-es-numero' }, 1).rate).toBeNull();
  });
});

describe('Tarifa pactada de una hora registrada', () => {
  it('mes abierto: la tarifa vigente del equipo del encargo', () => {
    expect(resolveBillRate({ closedAt: null, billRateSnapshot: 99 }, 40)).toEqual({ rate: 40, frozen: false });
  });
  it('mes cerrado: la tarifa congelada, aunque hoy sea otra', () => {
    expect(resolveBillRate({ closedAt: closed, billRateSnapshot: 40 }, 55)).toEqual({ rate: 40, frozen: true });
  });
  it('mes cerrado sin tarifa congelada: queda sin tarifa', () => {
    expect(resolveBillRate({ closedAt: closed, billRateSnapshot: null }, 55)).toEqual({ rate: null, frozen: true });
  });
  it('sin tarifa en ningún lado: sin dato', () => {
    expect(resolveBillRate({ closedAt: null }, undefined)).toEqual({ rate: null, frozen: false });
  });
});
