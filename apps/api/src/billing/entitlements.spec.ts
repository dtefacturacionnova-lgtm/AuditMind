import { DEFAULT_LIMITS, SubscriptionInput, addMonths, canReactivateManually, computeEntitlements, computeStatus, hasEntitlement, seatsAllowed } from './entitlements';
import { isBillableRole, suggestAssistants } from './billing.constants';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-11-21T12:00:00Z');
const SETTINGS = { graceDays: 7, readOnlyDays: 60 };
const day = (n: number) => new Date(NOW.getTime() + n * DAY);

const sub = (over: Partial<SubscriptionInput> = {}): SubscriptionInput => ({
  status: 'ACTIVE', months: 12, currentPeriodEnd: day(100), trialEndsAt: null, extraUsers: 0, exempt: false, overrides: {},
  planSnapshot: {
    code: 'EMPRESA_DESPACHO', name: 'Empresa Despacho', audience: 'EMPRESA',
    modules: ['CARTERA', 'HORAS', 'RIESGOS'], functions: ['FIRMA'], assistants: ['MINERVA', 'FISCUS'],
    limits: { users: 5, maxUsers: 15, extraUserPriceUsd: 19, storageGb: 100, maxFileMb: 500, aiRequests: 5000, fileTypes: ['PDF', 'VIDEO'], packsAi: true, packsStorage: true },
  },
  ...over,
});

describe('estado vigente deducido de las fechas', () => {
  it('licencia vigente → ACTIVE, con acceso completo', () => {
    const r = computeStatus(sub(), SETTINGS, NOW);
    expect(r.status).toBe('ACTIVE');
    expect(computeEntitlements(sub(), SETTINGS, NOW).readOnly).toBe(false);
  });

  it('vence → 7 días de GRACIA (sigue con acceso completo) → SOLO LECTURA hasta 60 días → SUSPENDIDA', () => {
    const vencida = (dias: number) => computeEntitlements(sub({ currentPeriodEnd: day(-dias) }), SETTINGS, NOW);
    expect(vencida(0.5).status).toBe('GRACE');
    expect(vencida(7).status).toBe('GRACE');
    expect(vencida(7).readOnly).toBe(false);
    expect(vencida(8).status).toBe('READ_ONLY');
    expect(vencida(8).readOnly).toBe(true);
    expect(vencida(67).status).toBe('READ_ONLY');
    expect(vencida(68).status).toBe('SUSPENDED');
    expect(vencida(68).readOnly).toBe(true);
  });

  it('los límites de gracia y solo lectura salen de los parámetros de la plataforma', () => {
    const e = computeEntitlements(sub({ currentPeriodEnd: day(-3) }), { graceDays: 2, readOnlyDays: 5 }, NOW);
    expect(e.status).toBe('READ_ONLY');
    expect(computeEntitlements(sub({ currentPeriodEnd: day(-9) }), { graceDays: 2, readOnlyDays: 5 }, NOW).status).toBe('SUSPENDED');
  });

  it('una licencia sin vencimiento (sin fecha de fin) nunca caduca', () => {
    const e = computeEntitlements(sub({ currentPeriodEnd: null, months: 0 }), SETTINGS, new Date('2040-01-01'));
    expect(e.status).toBe('ACTIVE');
    expect(e.endsAt).toBeNull();
  });

  it('la prueba usa trialEndsAt y sigue el mismo ciclo gracia → solo lectura', () => {
    const t = (dias: number) => computeEntitlements(sub({ status: 'TRIAL', currentPeriodEnd: null, trialEndsAt: day(dias) }), SETTINGS, NOW);
    expect(t(5).status).toBe('TRIAL');
    expect(t(-3).status).toBe('GRACE');
    expect(t(-20).status).toBe('READ_ONLY');
  });

  it('SUSPENDED y CANCELLED fijados a mano se respetan aunque las fechas estén vigentes y dejan solo lectura', () => {
    for (const status of ['SUSPENDED', 'CANCELLED']) {
      const e = computeEntitlements(sub({ status }), SETTINGS, NOW);
      expect(e.status).toBe(status);
      expect(e.readOnly).toBe(true);
    }
  });

  it('un GRACE o READ_ONLY guardado en la base se recalcula por fechas (no depende de que un cron haya corrido)', () => {
    expect(computeEntitlements(sub({ status: 'READ_ONLY', currentPeriodEnd: day(30) }), SETTINGS, NOW).status).toBe('ACTIVE');
  });
});

describe('reactivar a mano («Activa»): solo con fecha o sin vencimiento por diseño', () => {
  const s = (over: Partial<Pick<SubscriptionInput, 'currentPeriodEnd' | 'trialEndsAt' | 'months'>> = {}) => ({ currentPeriodEnd: null, trialEndsAt: null, months: 0, ...over });

  it('con fecha de vencimiento: sí, vigente o ya vencida (si venció, el estado vuelve a salir de las fechas)', () => {
    expect(canReactivateManually(s({ currentPeriodEnd: day(100), months: 12 }), false)).toBe(true);
    expect(canReactivateManually(s({ currentPeriodEnd: day(-30), months: 1 }), false)).toBe(true);
  });
  it('venía de una prueba (sin fecha de licencia y con fecha de prueba): no, quedaría gratis para siempre', () => {
    expect(canReactivateManually(s({ trialEndsAt: day(5) }), false)).toBe(false);
    expect(canReactivateManually(s({ trialEndsAt: day(-30) }), false)).toBe(false); // prueba ya terminada: igual
  });
  it('sin vencimiento por diseño (0 meses y sin prueba: Piloto, Interno, licencia sin vencimiento): sí', () => {
    expect(canReactivateManually(s(), false)).toBe(true);
  });
  it('datos incoherentes (meses pero sin fecha ni prueba): no se adivina, se rechaza', () => {
    expect(canReactivateManually(s({ months: 12 }), false)).toBe(false);
  });
  it('si el mismo ajuste la marca exenta, sí: una exenta nunca se bloquea y no necesita fecha', () => {
    expect(canReactivateManually(s({ trialEndsAt: day(5) }), true)).toBe(true);
    expect(canReactivateManually(s({ months: 12 }), true)).toBe(true);
  });
});

describe('módulos, funciones, asistentes y ajustes por cliente', () => {
  it('toma lo del plan y los ajustes del cliente suman o quitan', () => {
    const e = computeEntitlements(sub({ overrides: { addModules: ['GOBIERNO'], removeModules: ['HORAS'], addFunctions: ['FORENSE'], addAssistants: ['SHERLOCK'], removeAssistants: ['MINERVA'] } }), SETTINGS, NOW);
    expect(e.modules.sort()).toEqual(['CARTERA', 'GOBIERNO', 'RIESGOS']);
    expect(e.functions.sort()).toEqual(['FIRMA', 'FORENSE']);
    expect(e.assistants.sort()).toEqual(['FISCUS', 'SHERLOCK']);
  });

  it('hasEntitlement: el núcleo siempre; módulos y funciones según el plan', () => {
    const e = computeEntitlements(sub(), SETTINGS, NOW);
    expect(hasEntitlement(e, 'CORE')).toBe(true);
    expect(hasEntitlement(e, 'CARTERA')).toBe(true);
    expect(hasEntitlement(e, 'FIRMA')).toBe(true);
    expect(hasEntitlement(e, 'PLAN_ANUAL')).toBe(false);
    expect(hasEntitlement(e, 'FORENSE')).toBe(false);
  });

  it('los límites del cliente pisan los del plan; los que faltan toman valores por defecto seguros', () => {
    const e = computeEntitlements(sub({ overrides: { limits: { storageGb: 250 } } }), SETTINGS, NOW);
    expect(e.limits.storageGb).toBe(250);
    expect(e.limits.aiRequests).toBe(5000);
    const vacio = computeEntitlements(sub({ planSnapshot: {} }), SETTINGS, NOW);
    expect(vacio.limits).toEqual(DEFAULT_LIMITS);
    expect(vacio.modules).toEqual([]);
  });

  it('un snapshot o ajustes corruptos no rompen el cálculo', () => {
    expect(() => computeEntitlements(sub({ planSnapshot: 'basura', overrides: ['x'] }), SETTINGS, NOW)).not.toThrow();
    expect(() => computeEntitlements(sub({ planSnapshot: null, overrides: null }), SETTINGS, NOW)).not.toThrow();
  });
});

describe('plazas de usuario', () => {
  const limits = { ...DEFAULT_LIMITS, users: 5, maxUsers: 15 };
  it('incluidas + extras compradas, sin pasar del máximo del plan', () => {
    expect(seatsAllowed(limits, 0)).toBe(5);
    expect(seatsAllowed(limits, 4)).toBe(9);
    expect(seatsAllowed(limits, 100)).toBe(15);
  });
  it('-1 es sin tope', () => {
    expect(seatsAllowed({ ...limits, users: -1 }, 0)).toBe(Infinity);
    expect(seatsAllowed({ ...limits, maxUsers: -1 }, 3)).toBe(8);
  });
  it('solo los roles de pago cuentan; invitados, clientes del portal y la plataforma no', () => {
    for (const r of ['ADMIN', 'CAE', 'AUDIT_MANAGER', 'SENIOR_AUDITOR', 'AUDITOR']) expect(isBillableRole(r)).toBe(true);
    for (const r of ['SUPER_ADMIN', 'AUDITEE', 'READ_ONLY']) expect(isBillableRole(r)).toBe(false);
  });
});

describe('addMonths', () => {
  it('suma meses y no desborda fin de mes', () => {
    expect(addMonths(new Date('2026-01-31T00:00:00Z'), 1).toISOString().slice(0, 10)).toBe('2026-02-28');
    expect(addMonths(new Date('2028-01-31T00:00:00Z'), 1).toISOString().slice(0, 10)).toBe('2028-02-29');
    expect(addMonths(new Date('2026-11-21T00:00:00Z'), 12).toISOString().slice(0, 10)).toBe('2027-11-21');
    expect(addMonths(new Date('2026-11-30T00:00:00Z'), 3).toISOString().slice(0, 10)).toBe('2027-02-28');
  });
});

describe('asistentes sugeridos por módulo (misma regla que el editor de planes)', () => {
  it('Empresa Despacho (Cartera, Horas, Riesgos…) sugiere 10 y no los forenses ni los de gobierno', () => {
    const a = suggestAssistants(['CARTERA', 'HORAS', 'RIESGOS', 'SEGUIMIENTO_EXT', 'REPORTES_IA'], ['FIRMA', 'MARCA']);
    expect(a).toHaveLength(10);
    expect(a).toEqual(expect.arrayContaining(['MINERVA', 'FISCUS', 'THEMIS', 'CICERO']));
    expect(a).not.toContain('SHERLOCK');
    expect(a).not.toContain('ATLAS');
  });
  it('con Gobierno suma ATLAS, FENIX y MINERVA_QAIP; con Forense, HERMES y SHERLOCK', () => {
    expect(suggestAssistants(['GOBIERNO'], [])).toEqual(expect.arrayContaining(['ATLAS', 'FENIX', 'MINERVA_QAIP']));
    expect(suggestAssistants([], ['FORENSE'])).toEqual(expect.arrayContaining(['HERMES', 'SHERLOCK']));
  });
});
