import type { PackRow } from './client-types';
import {
  afterPurchaseText, defaultLicenseMonths, parseBuyTab, estimateStorageMonths, groupPacks, isUsablePack, licenseAvailability, licenseMonthsText, packQuote,
  packTitle, packUnitText, packsAvailability,
} from './packs';

const NOW = new Date('2026-11-21T12:00:00.000Z');
const iso = (days: number) => new Date(NOW.getTime() + days * 86400000).toISOString();

const ai = (code: string, quantity: number, priceUsd: number): PackRow => ({ code, kind: 'AI', name: code, quantity, priceUsd, recurring: false });
const st = (code: string, quantity: number, priceUsd: number): PackRow => ({ code, kind: 'STORAGE', name: code, quantity, priceUsd, recurring: true });

describe('catálogo de paquetes', () => {
  it('separa IA y espacio y ordena del más chico al más grande', () => {
    const g = groupPacks([ai('IA20', 20000, 60), st('E50', 50, 12), ai('IA1', 1000, 5), st('E10', 10, 3), ai('IA5', 5000, 20)]);
    expect(g.ai.map((p) => p.code)).toEqual(['IA1', 'IA5', 'IA20']);
    expect(g.storage.map((p) => p.code)).toEqual(['E10', 'E50']);
  });

  it('descarta paquetes mal formados sin romper', () => {
    const g = groupPacks([
      ai('OK', 1000, 5), null, 'x', { code: '', kind: 'AI', quantity: 5, priceUsd: 1 }, { code: 'A', kind: 'OTRO', quantity: 5, priceUsd: 1 },
      { code: 'B', kind: 'AI', quantity: 0, priceUsd: 1 }, { code: 'C', kind: 'AI', quantity: -5, priceUsd: 1 }, { code: 'D', kind: 'AI', quantity: 5, priceUsd: '5' },
      { code: 'E', kind: 'AI', quantity: 5, priceUsd: -1 }, { code: 'F', kind: 'AI', quantity: NaN, priceUsd: 1 }, { code: 'G', kind: 'AI', quantity: 5, priceUsd: NaN },
    ]);
    expect(g.ai.map((p) => p.code)).toEqual(['OK']);
    expect(g.storage).toEqual([]);
    expect(groupPacks(null)).toEqual({ ai: [], storage: [] });
    expect(groupPacks({} as never)).toEqual({ ai: [], storage: [] });
  });

  it('un paquete gratis (precio 0) es válido', () => {
    expect(isUsablePack(ai('GRATIS', 100, 0))).toBe(true);
  });

  it('títulos como en la maqueta', () => {
    expect(packTitle(ai('a', 1000, 5))).toBe('+1,000 peticiones');
    expect(packTitle(ai('a', 20000, 60))).toBe('+20,000 peticiones');
    expect(packTitle(st('s', 10, 3))).toBe('+10 GB');
    expect(packTitle(st('s', 200, 40))).toBe('+200 GB');
    expect(packTitle(st('s', 1000, 150))).toBe('+1 TB');
    expect(packTitle(st('s', 2000, 300))).toBe('+2 TB');
    expect(packTitle(st('s', 1500, 200))).toBe('+1,500 GB');
    expect(packTitle(st('s', 0.5, 1))).toBe('+0.5 GB');
  });

  it('precio unitario: IA por cada 1,000 y espacio por mes y por GB', () => {
    expect(packUnitText(ai('a', 1000, 5))).toBe('$5.00 por cada 1,000');
    expect(packUnitText(ai('a', 5000, 20))).toBe('$4.00 por cada 1,000');
    expect(packUnitText(ai('a', 20000, 60))).toBe('$3.00 por cada 1,000');
    expect(packUnitText(st('s', 10, 3))).toBe('$3.00 al mes · $0.30 por GB');
    expect(packUnitText(st('s', 50, 12))).toBe('$12.00 al mes · $0.24 por GB');
    expect(packUnitText(st('s', 1000, 150))).toBe('$150.00 al mes · $0.15 por GB');
    expect(packUnitText(st('s', 1000, 20))).toBe('$20.00 al mes · $0.020 por GB');
  });

  it('con datos inválidos no escribe nada', () => {
    expect(packUnitText({ kind: 'AI', quantity: 0, priceUsd: 5 })).toBe('');
    expect(packUnitText({ kind: 'AI', quantity: 10, priceUsd: NaN })).toBe('');
  });
});

describe('¿el plan admite paquetes?', () => {
  it('con paquetes y plan que los admite: disponible', () => {
    expect(packsAvailability('AI', [ai('a', 1000, 5)], { packsAi: true, packsStorage: false })).toEqual({ state: 'OK' });
  });

  it('el plan no admite: lo dice claro (aunque haya paquetes en el catálogo)', () => {
    const r = packsAvailability('STORAGE', [st('s', 10, 3)], { packsAi: true, packsStorage: false });
    expect(r.state).toBe('PLAN_NO_ADMITE');
    expect((r as { message: string }).message).toMatch(/no admite comprar paquetes de espacio/);
    expect(packsAvailability('AI', [], { packsAi: false, packsStorage: true }).state).toBe('PLAN_NO_ADMITE');
  });

  it('plan que sí admite pero sin paquetes publicados: otro mensaje', () => {
    const r = packsAvailability('AI', [], { packsAi: true, packsStorage: true });
    expect(r.state).toBe('SIN_PAQUETES');
    expect((r as { message: string }).message).toMatch(/peticiones de IA/);
  });

  it('si no se pudo leer el plan, se guía por el catálogo que sí llegó', () => {
    expect(packsAvailability('AI', [ai('a', 1000, 5)], null).state).toBe('OK');
    expect(packsAvailability('AI', [], undefined).state).toBe('SIN_PAQUETES');
  });
});

describe('meses que se cobran por el espacio', () => {
  it('hasta el vencimiento, contando meses de calendario (mínimo 1)', () => {
    expect(estimateStorageMonths(iso(23), 'ACTIVE', NOW)).toBe(1);
    expect(estimateStorageMonths('2027-02-21T12:00:00.000Z', 'ACTIVE', NOW)).toBe(3);
    expect(estimateStorageMonths('2027-11-21T12:00:00.000Z', 'ACTIVE', NOW)).toBe(12);
  });

  it('una licencia de 3 meses cuenta 3 aunque tenga 92 días', () => {
    const start = new Date('2026-12-01T00:00:00.000Z');
    expect(estimateStorageMonths('2027-03-01T00:00:00.000Z', 'ACTIVE', start)).toBe(3);
    expect(estimateStorageMonths('2027-03-02T00:00:00.000Z', 'ACTIVE', start)).toBe(4);
  });

  it('ya vencida (gracia o solo lectura): 1 mes', () => {
    expect(estimateStorageMonths(iso(-10), 'GRACE', NOW)).toBe(1);
    expect(estimateStorageMonths(iso(-40), 'READ_ONLY', NOW)).toBe(1);
  });

  it('sin fecha de fin se cobran 12', () => {
    expect(estimateStorageMonths(null, 'ACTIVE', NOW)).toBe(12);
    expect(estimateStorageMonths(undefined, 'ACTIVE', NOW)).toBe(12);
  });

  it('en prueba o sin plan no se estima (la fecha que usa el servidor es otra)', () => {
    expect(estimateStorageMonths(iso(10), 'TRIAL', NOW)).toBeNull();
    expect(estimateStorageMonths(iso(10), null, NOW)).toBeNull();
    expect(estimateStorageMonths(iso(10), undefined, NOW)).toBeNull();
  });

  it('fecha inválida no se estima; fechas muy lejanas se acotan en 120', () => {
    expect(estimateStorageMonths('basura', 'ACTIVE', NOW)).toBeNull();
    expect(estimateStorageMonths('2099-01-01T00:00:00.000Z', 'ACTIVE', NOW)).toBe(120);
  });

  it('el 31 no desborda los meses cortos', () => {
    expect(estimateStorageMonths('2026-02-28T00:00:00.000Z', 'ACTIVE', new Date('2026-01-31T00:00:00.000Z'))).toBe(1);
  });
});

describe('cotización del paquete', () => {
  it('IA: pago único', () => {
    expect(packQuote(ai('a', 5000, 20), null)).toEqual({ total: 20, billing: 'Pago único · las peticiones no vencen por mes (valen 12 meses)', months: null });
    // los meses no cambian el precio de la IA
    expect(packQuote(ai('a', 5000, 20), 7).total).toBe(20);
  });

  it('espacio: precio mensual × meses', () => {
    expect(packQuote(st('s', 50, 12), 3)).toEqual({ total: 36, billing: '$12.00 al mes × 3 meses hasta tu vencimiento', months: 3 });
    expect(packQuote(st('s', 50, 12), 1).billing).toBe('$12.00 al mes × 1 mes hasta tu vencimiento');
  });

  it('el total no arrastra errores de coma flotante', () => {
    expect(packQuote(st('s', 10, 0.1), 3).total).toBe(0.3);
    expect(packQuote(st('s', 10, 3.33), 3).total).toBe(9.99);
  });

  it('espacio sin meses conocidos: no inventa un total', () => {
    const q = packQuote(st('s', 50, 12), null);
    expect(q.total).toBeNull();
    expect(q.billing).toMatch(/se confirma al generar la referencia/);
  });

  it('precio enorme se mantiene exacto', () => {
    expect(packQuote(st('s', 1000, 150), 120).total).toBe(18000);
  });
});

describe('qué pasa después de comprar', () => {
  it('IA', () => {
    expect(afterPurchaseText(ai('a', 5000, 20))).toMatch(/Se suman 5,000 peticiones.*valen 12 meses/);
  });

  it('espacio con los números del cliente', () => {
    expect(afterPurchaseText(st('s', 50, 12), { storage: { limitGb: 100 } })).toBe('Tu espacio pasa de 100 GB a 150 GB y podrás subir archivos de inmediato al aprobarse el pago.');
  });

  it('espacio sin datos o sin tope', () => {
    expect(afterPurchaseText(st('s', 50, 12))).toBe('Se suman 50 GB a tu espacio al aprobarse el pago.');
    expect(afterPurchaseText(st('s', 50, 12), { storage: { limitGb: null } })).toBe('Se suman 50 GB a tu espacio al aprobarse el pago.');
  });
});

describe('pagar o renovar la licencia', () => {
  const plan = (code: string) => ({ hasSubscription: true, plan: { code, name: 'Empresa Despacho', audience: 'EMPRESA' } });

  it('con un plan normal se puede', () => {
    expect(licenseAvailability(plan('EMPRESA_DESPACHO'))).toEqual({ canPay: true, planCode: 'EMPRESA_DESPACHO', planName: 'Empresa Despacho', reason: null });
  });

  it('los planes sin vencimiento (Piloto, Interno) no se pagan', () => {
    for (const code of ['PILOTO', 'INTERNO', 'piloto']) {
      const r = licenseAvailability(plan(code));
      expect(r.canPay).toBe(false);
      expect(r.reason).toMatch(/no se paga por referencia/);
    }
  });

  it('sin suscripción o sin plan, se explica', () => {
    expect(licenseAvailability({ hasSubscription: false, plan: null }).reason).toMatch(/todavía no tiene un plan/);
    expect(licenseAvailability({ hasSubscription: true, plan: null }).canPay).toBe(false);
  });

  it('si no se pudo leer el plan, no se puede pagar y se dice', () => {
    expect(licenseAvailability(null).canPay).toBe(false);
    expect(licenseAvailability(undefined).reason).toMatch(/No se pudo leer tu plan/);
  });

  it('duración propuesta: la actual si se puede pagar, si no 12', () => {
    expect(defaultLicenseMonths(1)).toBe(1);
    expect(defaultLicenseMonths(3)).toBe(3);
    expect(defaultLicenseMonths(6)).toBe(6);
    expect(defaultLicenseMonths(12)).toBe(12);
    expect(defaultLicenseMonths(0)).toBe(12);
    expect(defaultLicenseMonths(2)).toBe(12);
    expect(defaultLicenseMonths(null)).toBe(12);
    expect(defaultLicenseMonths(undefined)).toBe(12);
  });

  it('textos de duración', () => {
    expect(licenseMonthsText(1)).toBe('1 mes (mensual)');
    expect(licenseMonthsText(3)).toBe('3 meses (trimestral)');
    expect(licenseMonthsText(6)).toBe('6 meses (semestral)');
    expect(licenseMonthsText(12)).toBe('12 meses (anual)');
    expect(licenseMonthsText(24)).toBe('24 meses');
  });
});

describe('pestaña inicial de «Comprar más»', () => {
  it('lee el tipo de la dirección sin importar mayúsculas', () => {
    expect(parseBuyTab('IA')).toBe('IA');
    expect(parseBuyTab('espacio')).toBe('ESPACIO');
    expect(parseBuyTab(' Licencia ')).toBe('LICENCIA');
  });

  it('lo desconocido o ausente abre la de IA', () => {
    for (const v of ['', 'otro', null, undefined, 5, ['ESPACIO'], '<script>']) expect(parseBuyTab(v)).toBe('IA');
  });
});
