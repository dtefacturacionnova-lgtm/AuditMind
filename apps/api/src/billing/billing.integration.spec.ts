/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';

/**
 * Planes y suscripciones contra un Postgres REAL (con el SQL de infrastructure/db-migrations/2026-11-suscripciones-1-nucleo.sql aplicado):
 *
 *   COLLECTIONS_TEST_DATABASE_URL=postgresql://postgres:test@localhost:54329/cobros_test npx jest billing.integration
 *
 * Reconstruir la base de pruebas si está vacía: python infrastructure/test-db/rebuild_test_db.py
 */
const URL = process.env.COLLECTIONS_TEST_DATABASE_URL;
const suite = URL ? describe : describe.skip;
jest.setTimeout(120_000);

suite('planes y suscripciones contra Postgres real', () => {
  let prisma: PrismaClient;
  let settings: any; let entitlements: any; let plans: any; let subs: any;
  const orgs: string[] = [];
  const DAY = 24 * 60 * 60 * 1000;

  beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: URL });
    await prisma.$connect();
    const { BillingSettingsService } = await import('./billing-settings.service');
    const { EntitlementsService } = await import('./entitlements.service');
    const { PlansService } = await import('./plans.service');
    const { SubscriptionsService } = await import('./subscriptions.service');
    settings = new BillingSettingsService(prisma as any);
    entitlements = new EntitlementsService(prisma as any, settings);
    plans = new PlansService(prisma as any, entitlements);
    subs = new SubscriptionsService(prisma as any, settings, entitlements);
  });

  afterAll(async () => {
    await prisma.billingSettings.update({ where: { id: 'default' }, data: { enforcementMode: 'OFF' } });
    await prisma.billingEvent.deleteMany({ where: { OR: [{ organizationId: { in: orgs } }, { type: { startsWith: 'PLAN_' }, actorId: 'test-actor' }] } });
    await prisma.organization.deleteMany({ where: { id: { in: orgs } } }); // las suscripciones y los usuarios caen en cascada
    await prisma.billingPlan.deleteMany({ where: { code: { startsWith: 'TEST_' } } });
    await prisma.$disconnect();
  });

  const newOrg = async (tag = 'org') => {
    const id = randomUUID();
    const org = await prisma.organization.create({ data: { name: `Prueba ${tag} ${id}`, slug: `t-${id}` } });
    orgs.push(org.id);
    return org.id;
  };
  const addUser = (organizationId: string, role: string, active = true) => {
    const id = randomUUID();
    return prisma.user.create({ data: { organizationId, supabaseUserId: id, email: `${id}@t.test`, name: 'Usuario de prueba', role: role as any, active } });
  };
  const setMode = async (mode: 'OFF' | 'OBSERVE' | 'ENFORCE') => { await settings.update({ enforcementMode: mode }, 'test-actor'); entitlements.invalidate(); };
  const code = async (p: Promise<unknown>) => { try { await p; return null; } catch (e: any) { return e?.getResponse?.()?.code ?? e?.message ?? 'ERROR'; } };

  describe('datos semilla y seguridad del SQL', () => {
    it('trae los 8 planes, los precios por duración y el interruptor apagado', async () => {
      const list = await plans.list();
      const codes = list.map((p: any) => p.code);
      for (const c of ['PERSONA_INICIAL', 'PERSONA_PROFESIONAL', 'EMPRESA_DESPACHO', 'EMPRESA_AUDITORIA_INTERNA', 'EMPRESA_PLUS', 'INSTITUCIONAL', 'PILOTO', 'INTERNO']) expect(codes).toContain(c);
      const despacho = list.find((p: any) => p.code === 'EMPRESA_DESPACHO');
      expect(despacho.prices.map((p: any) => [p.months, Number(p.priceUsd)])).toEqual([[1, 149], [3, 425], [6, 805], [12, 1490]]);
      expect(despacho.limits).toMatchObject({ users: 5, maxUsers: 15, storageGb: 100, aiRequests: 5000 });
      expect(despacho.modules).toEqual(expect.arrayContaining(['CARTERA', 'HORAS']));
      expect(despacho.modules).not.toContain('PLAN_ANUAL');
      expect(list.find((p: any) => p.code === 'INTERNO').prices.map((p: any) => p.months)).toEqual([0]);
      expect((await settings.get()).enforcementMode).toBe('OFF');
    });

    it('las tablas nuevas tienen RLS activo y no dan nada a anon ni authenticated', async () => {
      const tables = ['billing_plans', 'billing_plan_prices', 'billing_subscriptions', 'billing_settings', 'billing_events'];
      const rls: Array<{ relname: string; relrowsecurity: boolean }> = await prisma.$queryRawUnsafe(
        `SELECT relname, relrowsecurity FROM pg_class WHERE relname = ANY($1::text[])`, tables);
      expect(rls).toHaveLength(5);
      expect(rls.every((r) => r.relrowsecurity)).toBe(true);
      for (const t of tables) {
        const priv: Array<{ anon: boolean; auth: boolean }> = await prisma.$queryRawUnsafe(
          `SELECT has_table_privilege('anon', $1, 'SELECT') AS anon, has_table_privilege('authenticated', $1, 'SELECT') AS auth`, `public.${t}`);
        expect(priv[0]).toEqual({ anon: false, auth: false });
      }
    });
  });

  describe('alta de una organización', () => {
    it('nace en prueba del plan por defecto, con la fecha de fin y la instantánea del plan', async () => {
      const id = await newOrg();
      const sub = await subs.createForNewOrganization(id);
      expect(sub.status).toBe('TRIAL');
      expect(sub.exempt).toBe(false);
      expect(sub.planSnapshot.code).toBe('EMPRESA_DESPACHO');
      expect(Math.round((sub.trialEndsAt.getTime() - Date.now()) / DAY)).toBe(14);
      const org = await prisma.organization.findUnique({ where: { id } });
      expect(org?.plan).toBe('empresa_despacho');
    });

    it('con el plan indicado (sin distinguir mayúsculas); uno desconocido cae al plan por defecto', async () => {
      const a = await newOrg(); const b = await newOrg();
      expect((await subs.createForNewOrganization(a, 'persona_inicial')).planSnapshot.code).toBe('PERSONA_INICIAL');
      expect((await subs.createForNewOrganization(b, 'professional')).planSnapshot.code).toBe('EMPRESA_DESPACHO');
    });

    it('Piloto e Interno nacen activos, exentos y sin vencimiento', async () => {
      const id = await newOrg();
      const sub = await subs.createForNewOrganization(id, 'PILOTO');
      expect(sub).toMatchObject({ status: 'ACTIVE', exempt: true, trialEndsAt: null, currentPeriodEnd: null });
    });

    it('es idempotente: un segundo alta no pisa la suscripción existente', async () => {
      const id = await newOrg();
      await subs.createForNewOrganization(id, 'PERSONA_INICIAL');
      await subs.createForNewOrganization(id, 'EMPRESA_PLUS');
      expect((await prisma.billingSubscription.findUnique({ where: { organizationId: id } }))!.planSnapshot).toMatchObject({ code: 'PERSONA_INICIAL' });
    });
  });

  describe('contratar, renovar y extender la prueba', () => {
    it('assign: queda activa, con el periodo de la duración elegida, el precio de lista y el espejo en la organización', async () => {
      const id = await newOrg();
      await subs.createForNewOrganization(id);
      const s = await subs.assign(id, { planCode: 'EMPRESA_DESPACHO', months: 12 }, 'test-actor');
      expect(s.status).toBe('ACTIVE');
      expect(Number(s.priceUsd)).toBe(1490);
      expect(s.trialEndsAt).toBeNull();
      expect(Math.round((s.currentPeriodEnd.getTime() - Date.now()) / DAY)).toBeGreaterThanOrEqual(364);
      expect((await prisma.organization.findUnique({ where: { id } }))!.trialEndsAt).toBeNull();
    });

    it('assign: rechaza duraciones no válidas, planes inexistentes y planes sin precio para esa duración', async () => {
      const id = await newOrg();
      await subs.createForNewOrganization(id);
      expect(await code(subs.assign(id, { planCode: 'EMPRESA_DESPACHO', months: 5 }, 'a'))).toMatch(/Duración no válida/);
      expect(await code(subs.assign(id, { planCode: 'NO_EXISTE', months: 1 }, 'a'))).toMatch(/no existe/);
      expect(await code(subs.assign(id, { planCode: 'INSTITUCIONAL', months: 1 }, 'a'))).toMatch(/no tiene precio/);
      expect(await code(subs.assign(id, { planCode: 'EMPRESA_DESPACHO', months: 0 }, 'a'))).toMatch(/no tiene precio/);
    });

    it('assign: el Piloto puede ser sin vencimiento; el precio pactado se guarda aparte del de lista', async () => {
      const id = await newOrg();
      await subs.createForNewOrganization(id);
      const s = await subs.assign(id, { planCode: 'PILOTO', months: 0, agreedPriceUsd: 99 }, 'test-actor');
      expect(s).toMatchObject({ exempt: true, currentPeriodEnd: null, status: 'ACTIVE' });
      expect(Number(s.agreedPriceUsd)).toBe(99);
    });

    it('assign: conserva los usuarios extra si el plan es el mismo y los reinicia si cambia', async () => {
      const id = await newOrg();
      await subs.createForNewOrganization(id);
      await subs.assign(id, { planCode: 'EMPRESA_DESPACHO', months: 1 }, 'a');
      await subs.update(id, { extraUsers: 3 }, 'a');
      expect((await subs.assign(id, { planCode: 'EMPRESA_DESPACHO', months: 6 }, 'a')).extraUsers).toBe(3);
      expect((await subs.assign(id, { planCode: 'EMPRESA_PLUS', months: 6 }, 'a')).extraUsers).toBe(0);
    });

    it('renew: suma desde el fin vigente; si ya venció, desde hoy; reactiva una cuenta en solo lectura', async () => {
      const id = await newOrg();
      await subs.createForNewOrganization(id);
      const a = await subs.assign(id, { planCode: 'EMPRESA_DESPACHO', months: 1 }, 'a');
      const r1 = await subs.renew(id, 3, 'a');
      expect(Math.round((r1.currentPeriodEnd.getTime() - a.currentPeriodEnd.getTime()) / DAY)).toBeGreaterThanOrEqual(89);

      await prisma.billingSubscription.update({ where: { organizationId: id }, data: { currentPeriodEnd: new Date(Date.now() - 30 * DAY) } });
      entitlements.invalidate(id);
      expect((await entitlements.get(id)).status).toBe('READ_ONLY');
      const r2 = await subs.renew(id, 1, 'a');
      expect(Math.round((r2.currentPeriodEnd.getTime() - Date.now()) / DAY)).toBeGreaterThanOrEqual(27);
      expect((await entitlements.get(id)).status).toBe('ACTIVE');
    });

    it('renew: una licencia sin vencimiento no se renueva', async () => {
      const id = await newOrg();
      await subs.createForNewOrganization(id, 'PILOTO');
      expect(await code(subs.renew(id, undefined, 'a'))).toMatch(/no vence|duración/);
    });

    it('extendTrial: suma días a la prueba vigente o desde hoy si ya terminó, y valida el rango', async () => {
      const id = await newOrg();
      await subs.createForNewOrganization(id);
      const before = (await prisma.billingSubscription.findUnique({ where: { organizationId: id } }))!.trialEndsAt!;
      const s = await subs.extendTrial(id, 7, 'a');
      expect(Math.round((s.trialEndsAt.getTime() - before.getTime()) / DAY)).toBe(7);
      expect(await code(subs.extendTrial(id, 0, 'a'))).toMatch(/entre 1 y 365/);
      expect(await code(subs.extendTrial(id, 400, 'a'))).toMatch(/entre 1 y 365/);
    });

    it('cada cambio deja un registro de actividad (quién, qué y cuándo)', async () => {
      const id = await newOrg();
      await subs.createForNewOrganization(id);
      await subs.assign(id, { planCode: 'EMPRESA_DESPACHO', months: 1 }, 'test-actor');
      await subs.renew(id, 1, 'test-actor');
      const types = (await subs.events(id)).map((e: any) => e.type);
      expect(types).toEqual(expect.arrayContaining(['SUBSCRIPTION_CREATED', 'PLAN_ASSIGNED', 'RENEWED']));
    });
  });

  describe('ajustes por cliente', () => {
    it('módulos sueltos, precio pactado y suspensión manual cambian los derechos', async () => {
      const id = await newOrg();
      await subs.createForNewOrganization(id);
      await subs.assign(id, { planCode: 'EMPRESA_DESPACHO', months: 1 }, 'a');
      expect((await entitlements.get(id)).modules).not.toContain('PLAN_ANUAL');
      await subs.update(id, { overrides: { addModules: ['PLAN_ANUAL'], removeAssistants: ['MINERVA'] }, agreedPriceUsd: 120 }, 'a');
      const e = await entitlements.get(id);
      expect(e.modules).toContain('PLAN_ANUAL');
      expect(e.assistants).not.toContain('MINERVA');
      await subs.update(id, { status: 'SUSPENDED' }, 'a');
      expect((await entitlements.get(id)).readOnly).toBe(true);
    });

    it('rechaza ajustes desconocidos, módulos inexistentes y valores negativos', async () => {
      const id = await newOrg();
      await subs.createForNewOrganization(id);
      expect(await code(subs.update(id, { overrides: { magia: [1] } }, 'a'))).toMatch(/desconocidos/);
      expect(await code(subs.update(id, { overrides: { addModules: ['NO_EXISTE'] } }, 'a'))).toMatch(/no válidos/);
      expect(await code(subs.update(id, { extraUsers: -1 }, 'a'))).toMatch(/≥ 0/);
      expect(await code(subs.update(id, { agreedPriceUsd: -5 }, 'a'))).toMatch(/negativo/);
    });
  });

  describe('plazas de usuario', () => {
    it('ENFORCE: sin plaza libre bloquea con 402 LIMITE_USUARIOS; invitados y solo lectura no cuentan; los usuarios extra abren plazas', async () => {
      const id = await newOrg();
      await subs.createForNewOrganization(id);
      await subs.assign(id, { planCode: 'EMPRESA_DESPACHO', months: 1 }, 'a'); // 5 incluidos, máximo 15
      for (let i = 0; i < 5; i++) await addUser(id, i === 0 ? 'ADMIN' : 'AUDITOR');
      await addUser(id, 'READ_ONLY'); await addUser(id, 'AUDITEE'); await addUser(id, 'AUDITOR', false); // no cuentan
      expect(await entitlements.countBillableUsers(id)).toBe(5);
      await setMode('ENFORCE');
      try {
        expect(await code(entitlements.assertCanAddBillableUser(id, 'AUDITOR'))).toBe('LIMITE_USUARIOS');
        expect(await code(entitlements.assertCanAddBillableUser(id, 'AUDIT_MANAGER'))).toBe('LIMITE_USUARIOS');
        expect(await code(entitlements.assertCanAddBillableUser(id, 'READ_ONLY'))).toBeNull();
        expect(await code(entitlements.assertCanAddBillableUser(id, 'AUDITEE'))).toBeNull();
        await subs.update(id, { extraUsers: 2 }, 'a');
        expect(await code(entitlements.assertCanAddBillableUser(id, 'AUDITOR'))).toBeNull();
        await addUser(id, 'AUDITOR'); await addUser(id, 'AUDITOR');
        expect(await code(entitlements.assertCanAddBillableUser(id, 'AUDITOR'))).toBe('LIMITE_USUARIOS');
      } finally { await setMode('OFF'); }
    });

    it('al cambiar de rol a uno de pago se excluye a la propia persona del conteo', async () => {
      const id = await newOrg();
      await subs.createForNewOrganization(id);
      await subs.assign(id, { planCode: 'PERSONA_INICIAL', months: 1 }, 'a'); // 1 plaza
      const u = await addUser(id, 'AUDITOR');
      await setMode('ENFORCE');
      try {
        expect(await code(entitlements.assertCanAddBillableUser(id, 'SENIOR_AUDITOR', u.id))).toBeNull(); // ya ocupa su plaza
        expect(await code(entitlements.assertCanAddBillableUser(id, 'AUDITOR'))).toBe('LIMITE_USUARIOS'); // uno nuevo no cabe
      } finally { await setMode('OFF'); }
    });

    it('OFF y OBSERVE no bloquean; las organizaciones exentas (Piloto) tampoco en ENFORCE', async () => {
      const id = await newOrg();
      await subs.createForNewOrganization(id);
      await subs.assign(id, { planCode: 'PERSONA_INICIAL', months: 1 }, 'a');
      await addUser(id, 'AUDITOR');
      expect(await code(entitlements.assertCanAddBillableUser(id, 'AUDITOR'))).toBeNull(); // OFF
      await setMode('OBSERVE');
      expect(await code(entitlements.assertCanAddBillableUser(id, 'AUDITOR'))).toBeNull();
      await setMode('ENFORCE');
      try {
        const piloto = await newOrg();
        await subs.createForNewOrganization(piloto, 'PILOTO');
        for (let i = 0; i < 20; i++) await addUser(piloto, 'AUDITOR');
        expect(await code(entitlements.assertCanAddBillableUser(piloto, 'AUDITOR'))).toBeNull(); // exenta
      } finally { await setMode('OFF'); }
    });
  });

  describe('asistentes por plan', () => {
    it('ENFORCE: un asistente fuera del plan devuelve 403 ASISTENTE_NO_INCLUIDO; uno incluido pasa', async () => {
      const id = await newOrg();
      await subs.createForNewOrganization(id);
      await subs.assign(id, { planCode: 'EMPRESA_DESPACHO', months: 1 }, 'a');
      await setMode('ENFORCE');
      try {
        expect(await code(entitlements.assertAssistantAllowed(id, 'fiscus'))).toBeNull();
        expect(await code(entitlements.assertAssistantAllowed(id, 'SHERLOCK'))).toBe('ASISTENTE_NO_INCLUIDO');
      } finally { await setMode('OFF'); }
    });
  });

  describe('catálogo de planes', () => {
    const base = { name: 'Plan de prueba', audience: 'EMPRESA' as const, modules: ['CARTERA'], functions: [], assistants: ['MINERVA'], limits: { users: 2, maxUsers: 4, storageGb: 10, maxFileMb: 50, aiRequests: 100 }, prices: [{ months: 1, priceUsd: 10 }, { months: 12, priceUsd: 100 }] };

    it('crea un plan con precios y valida códigos, claves y límites', async () => {
      const p = await plans.create({ ...base, code: 'test_uno' }, 'test-actor');
      expect(p.code).toBe('TEST_UNO');
      expect(p.prices).toHaveLength(2);
      expect(p.limits).toMatchObject({ users: 2, maxUsers: 4, storageGb: 10, packsAi: true, packsStorage: true }); // lo no indicado toma el valor por defecto
      expect(await code(plans.create({ ...base, code: 'TEST_UNO' }, 'a'))).toMatch(/Ya existe/);
      expect(await code(plans.create({ ...base, code: 'x' }, 'a'))).toMatch(/código del plan/);
      expect(await code(plans.create({ ...base, code: 'TEST_DOS', modules: ['NO_EXISTE'] }, 'a'))).toMatch(/Módulos desconocidos/);
      expect(await code(plans.create({ ...base, code: 'TEST_DOS', assistants: ['ROBOT'] }, 'a'))).toMatch(/Asistentes desconocidos/);
      expect(await code(plans.create({ ...base, code: 'TEST_DOS', limits: { users: 5, maxUsers: 2 } }, 'a'))).toMatch(/máximo de usuarios/);
      expect(await code(plans.create({ ...base, code: 'TEST_DOS', prices: [{ months: 7, priceUsd: 1 }] }, 'a'))).toMatch(/Duración de licencia/);
      expect(await code(plans.create({ ...base, code: 'TEST_DOS', prices: [{ months: 1, priceUsd: 1 }, { months: 1, priceUsd: 2 }] }, 'a'))).toMatch(/repetida/);
    });

    it('cambiar un plan NO toca lo ya contratado; «aplicar a clientes» refresca la copia y respeta los ajustes por cliente', async () => {
      const plan = await plans.create({ ...base, code: 'TEST_TRES' }, 'test-actor');
      const id = await newOrg();
      await subs.createForNewOrganization(id);
      await subs.assign(id, { planCode: 'TEST_TRES', months: 1 }, 'a');
      await subs.update(id, { overrides: { addModules: ['HORAS'] } }, 'a');

      await plans.update(plan.id, { modules: ['CARTERA', 'RIESGOS'], limits: { aiRequests: 999 } }, 'test-actor');
      expect((await entitlements.get(id)).modules.sort()).toEqual(['CARTERA', 'HORAS']); // sin cambios todavía
      expect((await entitlements.get(id)).limits.aiRequests).toBe(100);

      expect(await plans.applyToSubscribers(plan.id, 'test-actor')).toEqual({ updated: 1 });
      const e = await entitlements.get(id);
      expect(e.modules.sort()).toEqual(['CARTERA', 'HORAS', 'RIESGOS']); // el módulo suelto del cliente se conserva
      expect(e.limits.aiRequests).toBe(999);
    });

    it('el código no se puede cambiar y los precios se actualizan por duración', async () => {
      const plan = await plans.create({ ...base, code: 'TEST_CUATRO' }, 'test-actor');
      expect(await code(plans.update(plan.id, { code: 'OTRO_CODIGO' }, 'a'))).toMatch(/no se puede cambiar/);
      const up = await plans.update(plan.id, { prices: [{ months: 1, priceUsd: 12 }, { months: 3, priceUsd: 33 }] }, 'a');
      expect(up.prices.map((p: any) => [p.months, Number(p.priceUsd)])).toEqual([[1, 12], [3, 33], [12, 100]]);
    });
  });

  describe('lo que ve el cliente y el superadmin', () => {
    it('summaryFor trae vigencia, módulos, asistentes, plazas y aviso — y NUNCA costos internos', async () => {
      const id = await newOrg();
      await subs.createForNewOrganization(id);
      await subs.assign(id, { planCode: 'EMPRESA_DESPACHO', months: 1 }, 'a');
      await prisma.billingSubscription.update({ where: { organizationId: id }, data: { currentPeriodEnd: new Date(Date.now() + 3 * DAY) } });
      entitlements.invalidate(id);
      await addUser(id, 'ADMIN');
      const s = await subs.summaryFor(id);
      expect(s).toMatchObject({ plan: { code: 'EMPRESA_DESPACHO' }, status: 'ACTIVE', readOnly: false, exempt: false, seats: { used: 1, allowed: 5 } });
      expect(s.notice).toMatchObject({ level: 'warning', code: 'EXPIRING' });
      expect(s.modules).toContain('CARTERA');
      const json = JSON.stringify(s);
      for (const secreto of ['costPerRequest', 'safetyMultiplier', 'priceUsd', 'agreedPrice', 'costo', 'cost']) expect(json).not.toContain(secreto);
    });

    it('sin aviso para una organización exenta; aviso crítico en solo lectura', async () => {
      const piloto = await newOrg();
      await subs.createForNewOrganization(piloto, 'PILOTO');
      expect((await subs.summaryFor(piloto)).notice).toBeNull();
      const vencida = await newOrg();
      await subs.createForNewOrganization(vencida);
      await subs.assign(vencida, { planCode: 'EMPRESA_DESPACHO', months: 1 }, 'a');
      await prisma.billingSubscription.update({ where: { organizationId: vencida }, data: { currentPeriodEnd: new Date(Date.now() - 20 * DAY) } });
      entitlements.invalidate(vencida);
      expect((await subs.summaryFor(vencida)).notice).toMatchObject({ level: 'critical', code: 'READ_ONLY' });
    });

    it('list() trae todas las suscripciones con su estado vigente y las plazas ocupadas', async () => {
      const id = await newOrg('lista');
      await subs.createForNewOrganization(id);
      await subs.assign(id, { planCode: 'EMPRESA_DESPACHO', months: 1 }, 'a');
      await addUser(id, 'ADMIN'); await addUser(id, 'AUDITOR'); await addUser(id, 'READ_ONLY');
      const row = (await subs.list()).find((r: any) => r.organizationId === id);
      expect(row).toMatchObject({ planCode: 'EMPRESA_DESPACHO', status: 'ACTIVE', seatsUsed: 2, seatsAllowed: 5, exempt: false });
    });
  });

  describe('si faltan las tablas', () => {
    it('los parámetros caen a OFF y los derechos devuelven null en vez de romper', async () => {
      const broken: any = { billingSettings: { findUnique: async () => { throw new Error('relation "billing_settings" does not exist'); } }, billingSubscription: { findUnique: async () => { throw new Error('relation does not exist'); } } };
      const { BillingSettingsService } = await import('./billing-settings.service');
      const { EntitlementsService } = await import('./entitlements.service');
      const s = new BillingSettingsService(broken);
      expect((await s.get()).enforcementMode).toBe('OFF');
      expect(await new EntitlementsService(broken, s).get('cualquiera')).toBeNull();
    });
  });
});
