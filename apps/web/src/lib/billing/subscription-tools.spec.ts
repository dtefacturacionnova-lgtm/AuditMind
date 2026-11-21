import type { SubscriptionRow } from './admin-types';
import {
  NO_FILTERS, addMonthsUtc, renewalEnd, trialExtensionEnd, countOverrides, daysUntil, describeEvent, effectivePrice, enforcementImpact, expiryText, filterSubscriptions,
  hasLimitOverrides, licenseText, overrideChoice, reactivationRisk, seatsText, setOverrideChoice, shortDate, subscriptionKpis,
} from './subscription-tools';

const NOW = new Date('2026-11-21T12:00:00.000Z');
const iso = (days: number) => new Date(NOW.getTime() + days * 86400000).toISOString();

const limits = { users: 5, maxUsers: 15, extraUserPriceUsd: 19, storageGb: 100, maxFileMb: 500, aiRequests: 5000, fileTypes: [], packsAi: true, packsStorage: true };

function row(patch: Partial<SubscriptionRow> = {}): SubscriptionRow {
  return {
    organizationId: 'o1', organizationName: 'Despacho Rivas', organizationActive: true, planCode: 'EMPRESA_DESPACHO', planName: 'Empresa Despacho',
    audience: 'EMPRESA', status: 'ACTIVE', storedStatus: 'ACTIVE', months: 12, endsAt: iso(23), graceEndsAt: iso(30), trialEndsAt: null,
    priceUsd: '1490.00', agreedPriceUsd: null, extraUsers: 0, exempt: false, notes: null, overrides: {}, seatsUsed: 4, seatsAllowed: 5,
    limits, modules: [], functions: [], assistants: [], ...patch,
  };
}

describe('textos de la tabla', () => {
  it('precio efectivo: el pactado manda sobre el del catálogo', () => {
    expect(effectivePrice(row())).toBe(1490);
    expect(effectivePrice(row({ agreedPriceUsd: '990.00' }))).toBe(990);
    expect(effectivePrice(row({ priceUsd: null }))).toBeNull();
  });

  it('licencia: duración y precio; prueba aparte', () => {
    expect(licenseText(row())).toEqual({ main: 'Anual · $1,490.00', note: '' });
    expect(licenseText(row({ agreedPriceUsd: '990' }))).toEqual({ main: 'Anual · $990.00', note: 'precio pactado' });
    expect(licenseText(row({ status: 'TRIAL', months: 0, priceUsd: null })).main).toBe('Prueba');
    expect(licenseText(row({ months: 0, priceUsd: null })).main).toBe('Sin vencimiento');
  });

  it('vigencia según el estado', () => {
    expect(expiryText(row(), NOW)).toContain('(23 d)');
    expect(expiryText(row({ endsAt: null }), NOW)).toBe('sin vencimiento');
    expect(expiryText(row({ status: 'TRIAL', endsAt: iso(9) }), NOW)).toContain('prueba hasta');
    expect(expiryText(row({ status: 'GRACE', endsAt: iso(-3), graceEndsAt: iso(4) }), NOW)).toMatch(/^venció .* · gracia hasta /);
    expect(expiryText(row({ status: 'READ_ONLY', endsAt: iso(-10) }), NOW)).toMatch(/^venció /);
    expect(expiryText(row({ status: 'SUSPENDED', endsAt: null }), NOW)).toBe('—');
  });

  it('plazas de usuario', () => {
    expect(seatsText(row())).toBe('4 / 5');
    expect(seatsText(row({ seatsAllowed: null, seatsUsed: 9 }))).toBe('9 / sin tope');
  });

  it('fechas: vacías si no son válidas; días contados hacia arriba', () => {
    expect(shortDate(null)).toBe('');
    expect(shortDate('no es fecha')).toBe('');
    expect(shortDate('2026-12-14T12:00:00.000Z', 'UTC')).toBe('14-12-2026');
    expect(daysUntil(iso(7), NOW)).toBe(7);
    expect(daysUntil(iso(-2), NOW)).toBe(-2);
    expect(daysUntil(null, NOW)).toBeNull();
    expect(daysUntil('x', NOW)).toBeNull();
  });
});

describe('indicadores', () => {
  const rows = [
    row({ organizationId: 'a', status: 'ACTIVE', months: 12, priceUsd: '1490' }), // 124.17 por mes
    row({ organizationId: 'b', status: 'GRACE', months: 1, priceUsd: '59' }), // 59
    row({ organizationId: 'c', status: 'ACTIVE', months: 6, priceUsd: '805', agreedPriceUsd: '600' }), // 100
    row({ organizationId: 'd', status: 'READ_ONLY', months: 1, priceUsd: '59' }), // no cuenta
    row({ organizationId: 'e', status: 'TRIAL', months: 0, priceUsd: null, endsAt: iso(9) }),
    row({ organizationId: 'f', status: 'TRIAL', months: 0, priceUsd: null, endsAt: iso(3) }),
    row({ organizationId: 'g', status: 'ACTIVE', months: 0, priceUsd: null, exempt: true, endsAt: null }), // Interno: no suma
    row({ organizationId: 'h', status: 'SUSPENDED' }),
  ];

  it('ingreso mensual estimado: activas y en gracia, llevado a mes, con el precio pactado', () => {
    expect(subscriptionKpis(rows, NOW).monthlyRevenue).toBeCloseTo(124.17 + 59 + 100, 1);
  });

  it('una exenta sin precio pactado no suma, con precio pactado sí', () => {
    const k = subscriptionKpis([row({ exempt: true, months: 12, priceUsd: '1490', agreedPriceUsd: null })], NOW);
    expect(k.monthlyRevenue).toBe(0);
    expect(subscriptionKpis([row({ exempt: true, months: 12, priceUsd: '1490', agreedPriceUsd: '1200' })], NOW).monthlyRevenue).toBe(100);
  });

  it('conteos y prueba más próxima', () => {
    const k = subscriptionKpis(rows, NOW);
    expect(k.active).toBe(3);
    expect(k.exemptActive).toBe(1);
    expect(k.trial).toBe(2);
    expect(k.nextTrialDays).toBe(3);
    expect(k.graceOrReadOnly).toBe(2);
    expect(k.suspended).toBe(1);
  });

  it('sin pruebas no hay prueba próxima', () => {
    expect(subscriptionKpis([row()], NOW).nextTrialDays).toBeNull();
    expect(subscriptionKpis([], NOW)).toMatchObject({ monthlyRevenue: 0, active: 0, trial: 0 });
  });
});

describe('filtros', () => {
  const rows = [
    row({ organizationId: 'a', organizationName: 'Despacho Rivas', status: 'ACTIVE', endsAt: iso(5), seatsUsed: 5, seatsAllowed: 5 }),
    row({ organizationId: 'b', organizationName: 'Corporación Ejemplo', planCode: 'EMPRESA_AI', planName: 'Empresa Auditoría Interna', status: 'ACTIVE', endsAt: iso(20), seatsUsed: 2 }),
    row({ organizationId: 'c', organizationName: 'CPA Marta', planCode: 'PERSONA_PRO', status: 'GRACE', endsAt: iso(-3) }),
    row({ organizationId: 'd', organizationName: 'Demo', planCode: 'INTERNO', status: 'ACTIVE', endsAt: null, seatsAllowed: null, seatsUsed: 9, exempt: true }),
    row({ organizationId: 'e', organizationName: 'Norte', status: 'TRIAL', endsAt: iso(9), trialEndsAt: iso(9) }),
  ];
  const ids = (f: Partial<typeof NO_FILTERS>) => filterSubscriptions(rows, { ...NO_FILTERS, ...f }, NOW).map((r) => r.organizationId);

  it('sin filtros devuelve todo', () => expect(ids({})).toEqual(['a', 'b', 'c', 'd', 'e']));
  it('por estado', () => {
    expect(ids({ status: 'ACTIVE' })).toEqual(['a', 'b', 'd']);
    expect(ids({ status: 'GRACE' })).toEqual(['c']);
    expect(ids({ status: 'TRIAL' })).toEqual(['e']);
    expect(ids({ status: 'READ_ONLY' })).toEqual([]);
  });
  it('por plan', () => expect(ids({ planCode: 'INTERNO' })).toEqual(['d']));
  it('por vigencia', () => {
    expect(ids({ expiry: 'SOON7' })).toEqual(['a']);
    expect(ids({ expiry: 'SOON30' })).toEqual(['a', 'b', 'e']);
    expect(ids({ expiry: 'PAST' })).toEqual(['c']);
    expect(ids({ expiry: 'NONE' })).toEqual(['d']);
  });
  it('por plazas', () => {
    expect(ids({ seats: 'FULL' })).toEqual(['a']);
    expect(ids({ seats: 'FREE' })).toEqual(['b', 'c', 'd', 'e']);
  });
  it('por texto, sin importar mayúsculas ni acentos', () => {
    expect(ids({ q: 'corporacion' })).toEqual(['b']);
    expect(ids({ q: 'CPA' })).toEqual(['c']);
    expect(ids({ q: 'auditoría interna' })).toEqual(['b']);
    expect(ids({ q: 'nada' })).toEqual([]);
  });
  it('se combinan', () => expect(ids({ status: 'ACTIVE', expiry: 'SOON30', seats: 'FREE' })).toEqual(['b']));
});

describe('ajustes sueltos por cliente', () => {
  it('lee la elección actual', () => {
    const o = { addModules: ['GOBIERNO'], removeAssistants: ['ATLAS'] };
    expect(overrideChoice(o, 'Modules', 'GOBIERNO')).toBe('add');
    expect(overrideChoice(o, 'Modules', 'CARTERA')).toBe('plan');
    expect(overrideChoice(o, 'Assistants', 'ATLAS')).toBe('remove');
    expect(overrideChoice(null, 'Functions', 'FIRMA')).toBe('plan');
  });

  it('agrega, quita y devuelve a «según el plan»', () => {
    let o = setOverrideChoice({}, 'Modules', 'GOBIERNO', 'add');
    expect(o).toEqual({ addModules: ['GOBIERNO'] });
    o = setOverrideChoice(o, 'Modules', 'GOBIERNO', 'remove');
    expect(o).toEqual({ removeModules: ['GOBIERNO'] });
    o = setOverrideChoice(o, 'Modules', 'GOBIERNO', 'plan');
    expect(o).toEqual({});
  });

  it('CONSERVA los límites propios y otras claves (el API reemplaza el objeto entero)', () => {
    const o = setOverrideChoice({ limits: { storageGb: 200 }, addFunctions: ['FIRMA'] }, 'Assistants', 'ATLAS', 'add');
    expect(o).toEqual({ limits: { storageGb: 200 }, addFunctions: ['FIRMA'], addAssistants: ['ATLAS'] });
  });

  it('no repite y no toca otras claves de la misma lista', () => {
    let o = setOverrideChoice({}, 'Assistants', 'ATLAS', 'add');
    o = setOverrideChoice(o, 'Assistants', 'FENIX', 'add');
    o = setOverrideChoice(o, 'Assistants', 'ATLAS', 'add');
    expect(o.addAssistants).toEqual(['FENIX', 'ATLAS']);
  });

  it('no modifica el objeto original', () => {
    const original = { addModules: ['GOBIERNO'] };
    setOverrideChoice(original, 'Modules', 'GOBIERNO', 'plan');
    expect(original).toEqual({ addModules: ['GOBIERNO'] });
  });

  it('cuenta ajustes y detecta límites propios', () => {
    expect(countOverrides({ addModules: ['GOBIERNO', 'CARTERA'], removeAssistants: ['ATLAS'], addFunctions: ['NO_EXISTE'] })).toBe(3);
    expect(countOverrides(null)).toBe(0);
    expect(hasLimitOverrides({ limits: { storageGb: 1 } })).toBe(true);
    expect(hasLimitOverrides({ limits: {} })).toBe(false);
    expect(hasLimitOverrides({})).toBe(false);
  });
});

describe('reactivar con cuidado', () => {
  it('una cuenta suspendida que estaba en prueba quedaría ACTIVA sin vencimiento: se marca como riesgo', () => {
    expect(reactivationRisk({ storedStatus: 'SUSPENDED', endsAt: null, trialEndsAt: iso(-5), months: 0 })).toBe(true);
  });
  it('una con licencia con fecha, o exenta sin prueba, no', () => {
    expect(reactivationRisk({ storedStatus: 'SUSPENDED', endsAt: iso(30), trialEndsAt: null, months: 12 })).toBe(false);
    expect(reactivationRisk({ storedStatus: 'SUSPENDED', endsAt: null, trialEndsAt: null, months: 0 })).toBe(false);
    expect(reactivationRisk({ storedStatus: 'ACTIVE', endsAt: null, trialEndsAt: iso(3), months: 0 })).toBe(false);
  });
});

describe('efecto de encender el cumplimiento', () => {
  it('separa exentas, vigentes, en gracia y las que quedarían en solo lectura', () => {
    const rows = [
      row({ organizationId: 'a', status: 'ACTIVE' }), row({ organizationId: 'b', status: 'TRIAL' }), row({ organizationId: 'c', status: 'GRACE' }),
      row({ organizationId: 'd', status: 'READ_ONLY' }), row({ organizationId: 'e', status: 'SUSPENDED' }), row({ organizationId: 'f', status: 'READ_ONLY', exempt: true }),
    ];
    const r = enforcementImpact(rows);
    expect(r.total).toBe(6);
    expect(r.exempt).toBe(1);
    expect(r.inForce).toBe(2);
    expect(r.inGrace).toBe(1);
    expect(r.readOnlyOrBlocked.map((x) => x.organizationId)).toEqual(['d', 'e']);
  });
});

describe('registro de actividad', () => {
  it('describe cada tipo en español', () => {
    expect(describeEvent({ type: 'PLAN_ASSIGNED', data: { plan: 'EMPRESA_PLUS', months: 12 } }, 'Firma Delta')).toBe('Se asignó el plan EMPRESA_PLUS a Firma Delta (anual).');
    expect(describeEvent({ type: 'PLAN_ASSIGNED', data: { plan: 'X', months: 1, agreedPriceUsd: 99 } }, 'A')).toContain('precio pactado de $99.00');
    expect(describeEvent({ type: 'RENEWED', data: { months: 1 } }, 'A')).toBe('Se renovó la licencia de A por 1 mes.');
    expect(describeEvent({ type: 'RENEWED', data: { months: 12 } }, 'A')).toContain('por 12 meses');
    expect(describeEvent({ type: 'TRIAL_EXTENDED', data: { days: 7 } }, 'Norte')).toBe('Se extendió la prueba de Norte por 7 días.');
    expect(describeEvent({ type: 'SUBSCRIPTION_UPDATED', data: { fields: ['agreedPriceUsd', 'status'], status: 'SUSPENDED' } }, 'A'))
      .toBe('Se ajustó la suscripción de A: precio pactado, estado (estado: suspendida).');
    expect(describeEvent({ type: 'PLAN_APPLIED', data: { code: 'P', updated: 3 } }, null)).toBe('Se aplicó el plan P a 3 clientes.');
    expect(describeEvent({ type: 'PLAN_APPLIED', data: { code: 'P', updated: 1 } }, null)).toBe('Se aplicó el plan P a 1 cliente.');
    expect(describeEvent({ type: 'PLAN_CREATED', data: { code: 'P' } }, null)).toBe('Se creó el plan P.');
    expect(describeEvent({ type: 'SUBSCRIPTION_CREATED', data: { plan: 'P' } }, 'A')).toBe('Se creó la suscripción de A con el plan P.');
  });

  it('un tipo desconocido o datos raros no rompen ni se interpretan', () => {
    expect(describeEvent({ type: 'OTRO', data: null }, 'A')).toBe('Se registró un cambio.');
    expect(describeEvent({ type: 'PLAN_ASSIGNED', data: 'texto' }, null)).toContain('una organización');
    expect(describeEvent({ type: 'SUBSCRIPTION_UPDATED', data: { fields: ['<script>'] } }, 'A')).toBe('Se ajustó la suscripción de A.');
    expect(describeEvent({ type: 'PLAN_CREATED', data: { code: 'x'.repeat(200) } }, null).length).toBeLessThan(90);
  });
});

describe('fechas estimadas', () => {
  it('suma meses sin desbordar el fin de mes', () => {
    expect(addMonthsUtc(new Date('2026-01-31T00:00:00Z'), 1).toISOString().slice(0, 10)).toBe('2026-02-28');
    expect(addMonthsUtc(new Date('2028-01-31T00:00:00Z'), 1).toISOString().slice(0, 10)).toBe('2028-02-29');
    expect(addMonthsUtc(new Date('2026-11-21T00:00:00Z'), 12).toISOString().slice(0, 10)).toBe('2027-11-21');
    expect(addMonthsUtc(new Date('2026-11-21T00:00:00Z'), 3).toISOString().slice(0, 10)).toBe('2027-02-21');
  });

  it('renovar suma al fin vigente; si ya venció, a partir de hoy; si es prueba, a partir de hoy', () => {
    expect(renewalEnd('2026-12-14T00:00:00Z', 1, NOW).toISOString().slice(0, 10)).toBe('2027-01-14');
    expect(renewalEnd('2026-11-01T00:00:00Z', 1, NOW).toISOString().slice(0, 10)).toBe('2026-12-21');
    expect(renewalEnd(null, 12, NOW).toISOString().slice(0, 10)).toBe('2027-11-21');
    expect(renewalEnd('2026-12-14T00:00:00Z', 1, NOW, true).toISOString().slice(0, 10)).toBe('2026-12-21');
  });

  it('extender la prueba suma días al fin vigente, o a hoy si ya terminó', () => {
    expect(trialExtensionEnd('2026-11-30T12:00:00Z', 7, NOW).toISOString().slice(0, 10)).toBe('2026-12-07');
    expect(trialExtensionEnd('2026-11-01T12:00:00Z', 7, NOW).toISOString().slice(0, 10)).toBe('2026-11-28');
    expect(trialExtensionEnd(null, 14, NOW).toISOString().slice(0, 10)).toBe('2026-12-05');
    expect(trialExtensionEnd('2026-11-30T12:00:00Z', 7, NOW, false).toISOString().slice(0, 10)).toBe('2026-11-28');
  });
});
