/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';

/**
 * Catálogo público de planes contra un Postgres REAL (SQL de las etapas 1 y 2 aplicado, con los planes y paquetes sembrados).
 *
 *   COLLECTIONS_TEST_DATABASE_URL=postgresql://postgres:test@127.0.0.1:54329/cobros_test npx jest public-plans.integration
 */
const URL = process.env.COLLECTIONS_TEST_DATABASE_URL;
const suite = URL ? describe : describe.skip;
jest.setTimeout(120_000);

suite('catálogo público de planes contra Postgres real', () => {
  let prisma: PrismaClient;
  let plans: any;
  let releaseLock: () => Promise<void>;
  const ACTOR = 'test-actor-5';
  const tag = randomUUID().slice(0, 6).toUpperCase();
  const code = (s: string) => `T5_${s}_${tag}`;

  beforeAll(async () => {
    process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
    process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-key';
    prisma = new PrismaClient({ datasourceUrl: URL });
    await prisma.$connect();
    releaseLock = await (await import('./billing-test-lock')).acquireBillingTestLock(prisma);
    const { BillingSettingsService } = await import('./billing-settings.service');
    const { EntitlementsService } = await import('./entitlements.service');
    const { PlansService } = await import('./plans.service');
    const settings = new BillingSettingsService(prisma as any);
    plans = new PlansService(prisma as any, new EntitlementsService(prisma as any, settings));
  });

  afterAll(async () => {
    await prisma.billingEvent.deleteMany({ where: { actorId: ACTOR } });
    await prisma.billingPlan.deleteMany({ where: { code: { startsWith: 'T5_' } } });
    await prisma.addonPack.deleteMany({ where: { code: { startsWith: 'T5_' } } });
    await releaseLock();
    await prisma.$disconnect();
  });

  const mk = (suffix: string, over: Record<string, unknown> = {}) => plans.create({
    code: code(suffix), name: `Plan ${suffix} ${tag}`, audience: 'PERSONA', description: 'Plan de prueba', modules: ['CARTERA'], functions: ['FIRMA'], assistants: ['MINERVA'],
    limits: { users: 2, maxUsers: 3, storageGb: 7, maxFileMb: 50, aiRequests: 123 }, prices: [{ months: 1, priceUsd: 10 }], isPublic: true, active: true, ...over,
  }, ACTOR);

  it('trae los planes públicos y activos con sus precios activos, y deja fuera los ocultos, los inactivos y los internos', async () => {
    await mk('PUB', { featured: true, prices: [{ months: 1, priceUsd: 10 }, { months: 3, priceUsd: 25, active: false }, { months: 12, priceUsd: 90 }] });
    await mk('HID', { isPublic: false });
    await mk('OFF', { active: false });
    const c = await plans.publicCatalog({ email: 'ventas@auditmind.com', whatsapp: '+503 7000-0000' });
    const codes = c.plans.map((p: any) => p.code);

    expect(codes).toContain(code('PUB'));
    for (const hidden of [code('HID'), code('OFF'), 'PILOTO', 'INSTITUCIONAL', 'INTERNO']) expect(codes).not.toContain(hidden);

    const pub = c.plans.find((p: any) => p.code === code('PUB'));
    expect(pub).toMatchObject({ audience: 'PERSONA', featured: true, modules: ['CARTERA'], functions: ['FIRMA'], assistants: ['MINERVA'] });
    expect(pub.prices).toEqual([{ months: 1, priceUsd: 10 }, { months: 12, priceUsd: 90 }]); // el trimestral está desactivado
    expect(pub.limits).toMatchObject({ users: 2, maxUsers: 3, storageGb: 7, maxFileMb: 50, aiRequests: 123 });
    expect(c.contact).toEqual({ email: 'ventas@auditmind.com', whatsapp: '50370000000' });
    expect(c.currency).toBe('USD');
  });

  it('incluye los planes de fábrica con sus cuatro duraciones y los ordena por «orden»', async () => {
    const c = await plans.publicCatalog({});
    const despacho = c.plans.find((p: any) => p.code === 'EMPRESA_DESPACHO');
    expect(despacho).toBeDefined();
    expect(despacho.prices.map((p: any) => p.months)).toEqual([1, 3, 6, 12]);
    const factory = c.plans.filter((p: any) => !p.code.startsWith('T5_')).map((p: any) => p.code);
    expect(factory).toEqual(['PERSONA_INICIAL', 'PERSONA_PROFESIONAL', 'EMPRESA_DESPACHO', 'EMPRESA_AUDITORIA_INTERNA', 'EMPRESA_PLUS']);
  });

  it('lista los paquetes activos y no los inactivos', async () => {
    await prisma.addonPack.create({ data: { id: `t5_${tag}_on`, code: code('PACKON'), kind: 'AI', name: `Paquete visible ${tag}`, quantity: 777, priceUsd: 7, recurring: false, active: true, sortOrder: 999 } });
    await prisma.addonPack.create({ data: { id: `t5_${tag}_off`, code: code('PACKOFF'), kind: 'AI', name: `Paquete oculto ${tag}`, quantity: 888, priceUsd: 8, recurring: false, active: false, sortOrder: 998 } });
    const c = await plans.publicCatalog({});
    const names = c.packs.map((p: any) => p.name);
    expect(names).toContain(`Paquete visible ${tag}`);
    expect(names).not.toContain(`Paquete oculto ${tag}`);
    expect(c.packs.find((p: any) => p.name === `Paquete visible ${tag}`)).toEqual({ kind: 'AI', name: `Paquete visible ${tag}`, quantity: 777, priceUsd: 7 });
    expect(c.packs.filter((p: any) => !p.name.includes(tag)).map((p: any) => p.quantity)).toEqual(expect.arrayContaining([1000, 5000, 20000, 10, 50, 200, 1000]));
  });

  it('no publica ids, fechas, suscriptores ni costos internos', async () => {
    const json = JSON.stringify(await plans.publicCatalog({ email: 'ventas@auditmind.com' }));
    for (const forbidden of ['plan_empresa_despacho', 'price_empresa', 'pack_ai_1000', 'createdAt', 'updatedAt', 'subscribers', 'costPerRequest', 'organizationId', '"id"', 'sortOrder', 'isPublic', 'active']) {
      expect(json).not.toContain(forbidden);
    }
  });
});
