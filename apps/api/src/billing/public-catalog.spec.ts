import {
  isPublishablePlan, sanitizeEmail, sanitizeWhatsapp, toPublicCatalog, toPublicPack, toPublicPlan, type PackSource, type PlanSource,
} from './public-catalog';

const plan = (over: Partial<PlanSource> & Record<string, unknown> = {}): PlanSource => ({
  code: 'EMPRESA_DESPACHO', name: 'Empresa Despacho', audience: 'EMPRESA', description: 'Despacho de auditoría pequeño o mediano.', isPublic: true, featured: false,
  active: true, sortOrder: 30, trialDays: 14,
  limits: { users: 5, maxUsers: 15, extraUserPriceUsd: 19, storageGb: 100, maxFileMb: 500, aiRequests: 5000, fileTypes: ['PDF', 'VIDEO'], packsAi: true, packsStorage: false },
  modules: ['CARTERA', 'HORAS'], functions: ['FIRMA'], assistants: ['MINERVA', 'FISCUS'],
  prices: [{ months: 12, priceUsd: '1490.00', active: true }, { months: 1, priceUsd: 149, active: true }],
  ...over,
});
const pack = (over: Partial<PackSource> = {}): PackSource => ({ kind: 'AI', name: '+1,000 peticiones de IA', quantity: 1000, priceUsd: '5.00', active: true, sortOrder: 10, ...over });
const noContact = { email: undefined, whatsapp: undefined };

describe('qué planes se publican', () => {
  it('solo públicos y activos de audiencia conocida', () => {
    expect(isPublishablePlan(plan())).toBe(true);
    expect(isPublishablePlan(plan({ isPublic: false }))).toBe(false);
    expect(isPublishablePlan(plan({ active: false }))).toBe(false);
    expect(isPublishablePlan(plan({ audience: 'GOBIERNO' }))).toBe(false);
  });
  it('Piloto e Interno nunca, aunque alguien los marque como públicos', () => {
    expect(isPublishablePlan(plan({ code: 'PILOTO' }))).toBe(false);
    expect(isPublishablePlan(plan({ code: 'INTERNO' }))).toBe(false);
  });
  it('el catálogo deja fuera lo no publicable y ordena por «orden» y luego por nombre', () => {
    const c = toPublicCatalog([
      plan({ code: 'B', name: 'Beta', sortOrder: 20 }), plan({ code: 'A', name: 'Alfa', sortOrder: 20 }), plan({ code: 'C', name: 'Cero', sortOrder: 5 }),
      plan({ code: 'PILOTO', name: 'Piloto' }), plan({ code: 'X', name: 'Oculto', isPublic: false }), plan({ code: 'Y', name: 'Inactivo', active: false }),
    ], [], noContact);
    expect(c.plans.map((p) => p.code)).toEqual(['C', 'A', 'B']);
    expect(c.currency).toBe('USD');
  });
});

describe('precios', () => {
  it('solo los activos, con vencimiento (1, 3, 6, 12), como número y de menor a mayor duración', () => {
    const p = toPublicPlan(plan({ prices: [
      { months: 12, priceUsd: '1490.00', active: true }, { months: 1, priceUsd: 149, active: true }, { months: 3, priceUsd: 425, active: false },
      { months: 0, priceUsd: 0, active: true }, { months: 6, priceUsd: '805.5', active: true }, { months: 5, priceUsd: 10, active: true },
    ] }));
    expect(p.prices).toEqual([{ months: 1, priceUsd: 149 }, { months: 6, priceUsd: 805.5 }, { months: 12, priceUsd: 1490 }]);
  });
  it('entiende el Decimal de Prisma (la base devuelve los precios como objeto, no como número)', () => {
    const { Prisma } = jest.requireActual('@prisma/client');
    const p = toPublicPlan(plan({ prices: [{ months: 1, priceUsd: new Prisma.Decimal('149.50'), active: true }, { months: 12, priceUsd: new Prisma.Decimal('1490'), active: true }] }));
    expect(p.prices).toEqual([{ months: 1, priceUsd: 149.5 }, { months: 12, priceUsd: 1490 }]);
    expect(toPublicPack(pack({ priceUsd: new Prisma.Decimal('5.00') }))?.priceUsd).toBe(5);
  });
  it('un objeto cualquiera no es un precio', () => {
    const p = toPublicPlan(plan({ prices: [{ months: 1, priceUsd: { valueOf: () => 5 }, active: true }, { months: 3, priceUsd: {}, active: true }, { months: 6, priceUsd: [], active: true }] }));
    expect(p.prices).toEqual([]);
  });
  it('descarta precios inválidos o repetidos', () => {
    const p = toPublicPlan(plan({ prices: [
      { months: 1, priceUsd: 'gratis', active: true }, { months: 3, priceUsd: -5, active: true }, { months: 6, priceUsd: null, active: true },
      { months: 12, priceUsd: 100, active: true }, { months: 12, priceUsd: 999, active: true },
    ] }));
    expect(p.prices).toEqual([{ months: 12, priceUsd: 100 }]);
  });
  it('un plan sin precios se publica igual (la página dirá «a convenir»)', () => {
    expect(toPublicPlan(plan({ prices: [] })).prices).toEqual([]);
  });
});

describe('proyección de un plan', () => {
  it('copia lo que debe y nada más', () => {
    const p = toPublicPlan(plan({ featured: true }));
    expect(Object.keys(p).sort()).toEqual(['assistants', 'audience', 'code', 'description', 'featured', 'functions', 'limits', 'modules', 'name', 'prices', 'trialDays']);
    expect(Object.keys(p.limits).sort()).toEqual(['aiRequests', 'extraUserPriceUsd', 'fileTypes', 'maxFileMb', 'maxUsers', 'packsAi', 'packsStorage', 'storageGb', 'users']);
    expect(p).toMatchObject({ code: 'EMPRESA_DESPACHO', featured: true, trialDays: 14, modules: ['CARTERA', 'HORAS'], functions: ['FIRMA'], assistants: ['MINERVA', 'FISCUS'] });
    expect(p.limits).toMatchObject({ users: 5, maxUsers: 15, extraUserPriceUsd: 19, storageGb: 100, maxFileMb: 500, aiRequests: 5000, packsAi: true, packsStorage: false, fileTypes: ['PDF', 'VIDEO'] });
  });

  it('NO filtra ningún campo interno aunque la fila de la base traiga más (ids, fechas, costos, suscriptores, organizaciones)', () => {
    const dirty = plan({
      id: 'plan_secreto', createdAt: new Date(), updatedAt: new Date(), subscribers: 42, organizationId: 'org_x', costPerRequestUsd: 0.0012, marginUsd: 99, internalNotes: 'no publicar',
      limits: { users: 1, maxUsers: 1, storageGb: 1, maxFileMb: 1, aiRequests: 1, fileTypes: ['PDF'], costUsd: 9, secretKey: 'x' },
      prices: [{ months: 1, priceUsd: 10, active: true, id: 'price_secreto', planId: 'plan_secreto', createdAt: new Date() }] as never,
    });
    const json = JSON.stringify(toPublicCatalog([dirty], [pack({ id: 'pack_secreto', createdAt: new Date() } as never)], { email: 'ventas@auditmind.test', whatsapp: '50370000000' }));
    for (const forbidden of ['plan_secreto', 'price_secreto', 'pack_secreto', 'org_x', 'subscribers', 'costPerRequestUsd', 'marginUsd', 'internalNotes', 'costUsd', 'secretKey', 'createdAt', 'updatedAt', 'no publicar']) {
      expect(json).not.toContain(forbidden);
    }
  });

  it('módulos, funciones y asistentes desconocidos o repetidos se descartan', () => {
    const p = toPublicPlan(plan({ modules: ['CARTERA', 'INVENTADO', 'CARTERA'], functions: ['FIRMA', '<script>'], assistants: ['MINERVA', 'NO_EXISTE'] }));
    expect(p.modules).toEqual(['CARTERA']);
    expect(p.functions).toEqual(['FIRMA']);
    expect(p.assistants).toEqual(['MINERVA']);
  });

  it('límites ausentes o con tipos raros toman los valores por defecto y los tipos de archivo desconocidos se descartan', () => {
    const p = toPublicPlan(plan({ limits: { users: 'muchos', storageGb: null, fileTypes: ['PDF', 'EXE', 5, 'PDF'] } }));
    expect(p.limits.users).toBe(1);
    expect(p.limits.storageGb).toBe(5);
    expect(p.limits.aiRequests).toBe(500);
    expect(p.limits.fileTypes).toEqual(['PDF']);
    expect(toPublicPlan(plan({ limits: null })).limits.storageGb).toBe(5);
    expect(toPublicPlan(plan({ limits: [] })).limits.users).toBe(1);
  });

  it('«sin tope» (-1) se publica tal cual', () => {
    expect(toPublicPlan(plan({ limits: { users: -1, storageGb: -1, aiRequests: -1 } })).limits).toMatchObject({ users: -1, storageGb: -1, aiRequests: -1 });
  });

  it('la descripción se recorta a 500 caracteres y los días de prueba son enteros no negativos', () => {
    expect(toPublicPlan(plan({ description: `  ${'x'.repeat(600)}  ` })).description).toHaveLength(500);
    expect(toPublicPlan(plan({ trialDays: -3 })).trialDays).toBe(0);
    expect(toPublicPlan(plan({ trialDays: 14.9 })).trialDays).toBe(14);
  });
});

describe('paquetes', () => {
  it('solo activos, de IA o espacio, con cantidad y precio válidos; ordenados por «orden» y cantidad', () => {
    expect(toPublicPack(pack())).toEqual({ kind: 'AI', name: '+1,000 peticiones de IA', quantity: 1000, priceUsd: 5 });
    expect(toPublicPack(pack({ active: false }))).toBeNull();
    expect(toPublicPack(pack({ kind: 'VIDEO' }))).toBeNull();
    expect(toPublicPack(pack({ quantity: 0 }))).toBeNull();
    expect(toPublicPack(pack({ priceUsd: 'x' }))).toBeNull();
    expect(toPublicPack(pack({ priceUsd: -1 }))).toBeNull();
    const c = toPublicCatalog([], [pack({ name: 'C', quantity: 5000, sortOrder: 20 }), pack({ name: 'A', quantity: 1000, sortOrder: 20 }), pack({ name: 'B', quantity: 9, sortOrder: 5 }), pack({ name: 'Off', active: false })], noContact);
    expect(c.packs.map((p) => p.name)).toEqual(['B', 'A', 'C']);
  });
});

describe('contacto de ventas', () => {
  it('correo válido sí; raro, con espacios o sin dominio no', () => {
    expect(sanitizeEmail('  ventas@auditmind.com ')).toBe('ventas@auditmind.com');
    for (const bad of ['', 'ventas', 'a@b', 'a b@c.com', '<script>@x.com', 'javascript:alert(1)', 'a@b.c\nBcc: x@y.com', `${'a'.repeat(250)}@x.com`, 42, null, undefined]) {
      expect(sanitizeEmail(bad)).toBeNull();
    }
  });
  it('WhatsApp: solo dígitos de 8 a 15, aceptando +, espacios y guiones al escribirlo', () => {
    expect(sanitizeWhatsapp('+503 7000-0000')).toBe('50370000000');
    expect(sanitizeWhatsapp('50370000000')).toBe('50370000000');
    for (const bad of ['', '1234567', '1234567890123456', 'llámame', '+503 7000 0000 x', 'javascript:1', '503/7000', 70000000, null, undefined]) {
      expect(sanitizeWhatsapp(bad)).toBeNull();
    }
  });
  it('el catálogo lleva el contacto ya limpio; sin configurar, ambos nulos', () => {
    expect(toPublicCatalog([], [], { email: 'ventas@auditmind.com', whatsapp: '+503 7000-0000' }).contact).toEqual({ email: 'ventas@auditmind.com', whatsapp: '50370000000' });
    expect(toPublicCatalog([], [], { email: 'raro', whatsapp: 'x' }).contact).toEqual({ email: null, whatsapp: null });
    expect(toPublicCatalog([], [], noContact).contact).toEqual({ email: null, whatsapp: null });
  });
});
