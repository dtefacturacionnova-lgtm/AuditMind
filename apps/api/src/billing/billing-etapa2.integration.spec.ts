/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';

/**
 * Etapa 2 contra un Postgres REAL (SQL 2026-11-suscripciones-2-medicion-pagos.sql aplicado): medición de IA en peticiones, espacio por tipo de
 * archivo, paquetes y pagos con aprobación manual.
 *
 *   COLLECTIONS_TEST_DATABASE_URL=postgresql://postgres:test@localhost:54329/cobros_test npx jest billing-etapa2.integration
 */
const URL = process.env.COLLECTIONS_TEST_DATABASE_URL;
const suite = URL ? describe : describe.skip;
jest.setTimeout(120_000);

suite('etapa 2 de planes: IA en peticiones, espacio y pagos contra Postgres real', () => {
  let prisma: PrismaClient;
  let settings: any; let entitlements: any; let plans: any; let subs: any; let usage: any; let storage: any; let payments: any; let consumption: any;
  let runWithRequestContext: any;
  let releaseLock: () => Promise<void>;
  const orgs: string[] = [];
  const DAY = 24 * 60 * 60 * 1000;

  beforeAll(async () => {
    process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
    process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-key';
    prisma = new PrismaClient({ datasourceUrl: URL });
    await prisma.$connect();
    releaseLock = await (await import('./billing-test-lock')).acquireBillingTestLock(prisma);
    const { BillingSettingsService } = await import('./billing-settings.service');
    const { EntitlementsService } = await import('./entitlements.service');
    const { PlansService } = await import('./plans.service');
    const { SubscriptionsService } = await import('./subscriptions.service');
    const { UsageService } = await import('./usage.service');
    const { StorageUsageService } = await import('./storage-usage.service');
    const { PaymentsService } = await import('./payments.service');
    const { BillingUsageService } = await import('./billing-usage.service');
    ({ runWithRequestContext } = await import('../common/request-context'));
    settings = new BillingSettingsService(prisma as any);
    entitlements = new EntitlementsService(prisma as any, settings);
    plans = new PlansService(prisma as any, entitlements);
    subs = new SubscriptionsService(prisma as any, settings, entitlements);
    usage = new UsageService(prisma as any, settings, entitlements);
    storage = new StorageUsageService(prisma as any, settings, entitlements);
    payments = new PaymentsService(prisma as any, entitlements, subs);
    const { StorageEgressService } = await import('./storage-egress.service');
    const egress = new StorageEgressService(prisma as any, { get: () => ({ addIssuedListener: () => undefined }) } as any, { get: () => undefined } as any);
    consumption = new BillingUsageService(prisma as any, settings, entitlements, usage, storage, egress);
  });

  afterAll(async () => {
    await prisma.billingSettings.update({ where: { id: 'default' }, data: { enforcementMode: 'OFF', costPerRequestUsd: 0.0012 } });
    await prisma.billingEvent.deleteMany({ where: { OR: [{ organizationId: { in: orgs } }, { actorId: 'test-actor-2' }] } });
    // La evidencia y los documentos de prueba apuntan a usuarios sin cascada: se borran primero (con sus auditorías).
    await prisma.fieldEvidence.deleteMany({ where: { audit: { organizationId: { in: orgs } } } });
    await prisma.auditRequestDocument.deleteMany({ where: { audit: { organizationId: { in: orgs } } } });
    await prisma.audit.deleteMany({ where: { organizationId: { in: orgs } } });
    await prisma.organization.deleteMany({ where: { id: { in: orgs } } }); // suscripciones, libro, paquetes, pagos y usuarios caen en cascada
    await prisma.billingPlan.deleteMany({ where: { code: { startsWith: 'T2_' } } });
    await releaseLock();
    await prisma.$disconnect();
  });

  const newOrg = async () => {
    const id = randomUUID();
    const org = await prisma.organization.create({ data: { name: `Prueba etapa2 ${id}`, slug: `t2-${id}` } });
    orgs.push(org.id);
    return org.id;
  };
  const addUser = (organizationId: string, role = 'AUDITOR') => {
    const id = randomUUID();
    return prisma.user.create({ data: { organizationId, supabaseUserId: id, email: `${id}@t.test`, name: 'Usuario de prueba', role: role as any } });
  };
  const setMode = async (mode: 'OFF' | 'OBSERVE' | 'ENFORCE') => { await settings.update({ enforcementMode: mode }, 'test-actor-2'); entitlements.invalidate(); };
  const code = async (p: Promise<unknown>) => { try { await p; return null; } catch (e: any) { return e?.getResponse?.()?.code ?? e?.message ?? 'ERROR'; } };
  const status = async (p: Promise<unknown>) => { try { await p; return 200; } catch (e: any) { return e?.getStatus?.() ?? 500; } };

  /** Plan de prueba con límites chicos para poder agotarlos. */
  const testPlan = async (suffix: string, limits: Record<string, unknown>, extra: Record<string, unknown> = {}) => {
    const c = `T2_${suffix}_${randomUUID().slice(0, 6).toUpperCase()}`;
    await plans.create({
      code: c, name: `Plan ${c}`, audience: 'EMPRESA', modules: ['CARTERA'], functions: [], assistants: ['MINERVA'],
      limits: { users: 5, maxUsers: 5, storageGb: 10, maxFileMb: 100, aiRequests: 10, ...limits }, prices: [{ months: 1, priceUsd: 50 }, { months: 12, priceUsd: 500 }], ...extra,
    }, 'test-actor-2');
    return c;
  };
  const orgOnPlan = async (planCode: string, months = 1) => {
    const id = await newOrg();
    await subs.createForNewOrganization(id);
    await subs.assign(id, { planCode, months }, 'test-actor-2');
    return id;
  };
  const addPack = (organizationId: string, packCode: string, remaining?: number, over: any = {}) =>
    prisma.addonPack.findUniqueOrThrow({ where: { code: packCode } }).then((p) => prisma.addonPurchase.create({
      data: { organizationId, packId: p.id, kind: p.kind, quantity: p.quantity, remaining: remaining ?? p.quantity, priceUsd: p.priceUsd, expiresAt: new Date(Date.now() + 300 * DAY), ...over },
    }));

  describe('SQL: datos semilla, seguridad y restricciones', () => {
    it('trae los 7 paquetes semilla, con el espacio como cobro mensual y la IA como pago único', async () => {
      const packs = await prisma.addonPack.findMany({ orderBy: { sortOrder: 'asc' } });
      expect(packs.map((p) => [p.code, p.quantity, Number(p.priceUsd), p.recurring])).toEqual([
        ['AI_1000', 1000, 5, false], ['AI_5000', 5000, 20, false], ['AI_20000', 20000, 60, false],
        ['STORAGE_10', 10, 3, true], ['STORAGE_50', 50, 12, true], ['STORAGE_200', 200, 40, true], ['STORAGE_1000', 1000, 150, true],
      ]);
    });

    it('las 4 tablas nuevas tienen RLS y no dan nada a anon ni authenticated', async () => {
      const tables = ['usage_ledger', 'addon_packs', 'addon_purchases', 'billing_payments'];
      const rls: any[] = await prisma.$queryRawUnsafe('SELECT relname, relrowsecurity FROM pg_class WHERE relname = ANY($1::text[])', tables);
      expect(rls.every((r) => r.relrowsecurity)).toBe(true);
      expect(rls).toHaveLength(4);
      for (const t of tables) {
        const p: any[] = await prisma.$queryRawUnsafe(`SELECT has_table_privilege('anon', $1, 'SELECT') AS a, has_table_privilege('authenticated', $1, 'INSERT') AS b`, `public.${t}`);
        expect(p[0]).toEqual({ a: false, b: false });
      }
    });

    it('el libro rechaza pesos negativos, más peso de paquete que peso total y periodos mal escritos', async () => {
      const id = await newOrg();
      const base = { organizationId: id, periodKey: '2026-11', weight: 1, packWeight: 0 };
      await expect(prisma.usageLedger.create({ data: { ...base, weight: -1 } })).rejects.toThrow();
      await expect(prisma.usageLedger.create({ data: { ...base, weight: 1, packWeight: 2 } })).rejects.toThrow();
      await expect(prisma.usageLedger.create({ data: { ...base, periodKey: '2026-13' } })).rejects.toThrow();
      await expect(prisma.usageLedger.create({ data: { ...base, periodKey: 'noviembre' } })).rejects.toThrow();
      await expect(prisma.usageLedger.create({ data: base })).resolves.toBeDefined();
    });

    it('un paquete no puede tener más «quedan» que «cantidad», y un pago solo acredita UN paquete', async () => {
      const id = await newOrg();
      await expect(addPack(id, 'AI_1000', 5000)).rejects.toThrow();
      const pay = await prisma.billingPayment.create({ data: { organizationId: id, kind: 'PACK', packCode: 'AI_1000', concept: 'x', amountUsd: 5, method: 'QR', reference: `AUD-T${randomUUID().slice(0, 5)}`, expiresAt: new Date(Date.now() + DAY) } });
      await addPack(id, 'AI_1000', undefined, { paymentId: pay.id });
      await expect(addPack(id, 'AI_1000', undefined, { paymentId: pay.id })).rejects.toThrow();
    });

    it('un pago de licencia debe traer plan y duración; uno de paquete, el paquete (CHECK)', async () => {
      const id = await newOrg();
      const base = { organizationId: id, concept: 'x', amountUsd: 1, method: 'QR' as const, expiresAt: new Date(Date.now() + DAY) };
      await expect(prisma.billingPayment.create({ data: { ...base, kind: 'LICENSE', reference: 'AUD-CHK001' } })).rejects.toThrow();
      await expect(prisma.billingPayment.create({ data: { ...base, kind: 'PACK', reference: 'AUD-CHK002' } })).rejects.toThrow();
      await expect(prisma.billingPayment.create({ data: { ...base, kind: 'PACK', packCode: 'AI_1000', planCode: 'X', reference: 'AUD-CHK003' } })).rejects.toThrow();
    });
  });

  describe('IA en peticiones', () => {
    it('lo incluido se gasta primero; luego los paquetes (los más antiguos primero); al agotar todo, ENFORCE bloquea con 402 LIMITE_IA', async () => {
      const plan = await testPlan('IA', { aiRequests: 10 });
      const id = await orgOnPlan(plan);
      await addPack(id, 'AI_1000', 5); // quedan 5
      expect((await usage.aiStatus(id)).available).toBe(15);

      await usage.record({ organizationId: id, agent: 'MINERVA', weight: 8 });
      let s = await usage.aiStatus(id);
      expect(s).toMatchObject({ included: 10, usedTotal: 8, usedFromPlan: 8, packRemaining: 5, available: 7 });

      await usage.record({ organizationId: id, agent: 'MINERVA', weight: 4 }); // 2 del plan + 2 del paquete
      s = await usage.aiStatus(id);
      expect(s).toMatchObject({ usedTotal: 12, usedFromPlan: 10, packRemaining: 3, available: 3 });
      const last = await prisma.usageLedger.findFirst({ where: { organizationId: id }, orderBy: { createdAt: 'desc' } });
      expect([last!.weight, last!.packWeight]).toEqual([4, 2]);

      await usage.record({ organizationId: id, agent: 'MINERVA', weight: 3 }); // agota el paquete
      expect((await prisma.addonPurchase.findFirst({ where: { organizationId: id } }))).toMatchObject({ remaining: 0, status: 'CONSUMED' });
      expect((await usage.aiStatus(id)).available).toBe(0);

      await setMode('ENFORCE');
      try {
        expect(await code(usage.assertCanUseAi(id, 1))).toBe('LIMITE_IA');
        expect(await status(usage.assertCanUseAi(id, 1))).toBe(402);
      } finally { await setMode('OFF'); }
    });

    it('el límite es exacto: se puede pedir justo lo que queda (aunque sea la última); pedir una más, no', async () => {
      const plan = await testPlan('IA5', { aiRequests: 10 });
      const id = await orgOnPlan(plan);
      await usage.record({ organizationId: id, agent: 'MINERVA', weight: 6 }); // quedan exactamente 4
      expect((await usage.aiStatus(id)).available).toBe(4);
      await setMode('ENFORCE');
      try {
        expect(await code(usage.assertCanUseAi(id, 5))).toBe('LIMITE_IA'); // una más de lo que queda
        expect(await code(usage.assertCanUseAi(id, 4))).toBeNull(); // justo lo que queda
        await usage.record({ organizationId: id, agent: 'MINERVA', weight: 3 }); // queda exactamente 1
        expect(await code(usage.assertCanUseAi(id, 1))).toBeNull(); // la última petición sí pasa
        await usage.record({ organizationId: id, agent: 'MINERVA', weight: 1 });
        expect((await usage.aiStatus(id)).available).toBe(0);
        expect(await code(usage.assertCanUseAi(id, 1))).toBe('LIMITE_IA'); // y la siguiente ya no
      } finally { await setMode('OFF'); }
    });

    it('al comprar más, vuelve a haber peticiones; OFF y OBSERVE no bloquean; las organizaciones exentas tampoco', async () => {
      const plan = await testPlan('IA2', { aiRequests: 2 });
      const id = await orgOnPlan(plan);
      await usage.record({ organizationId: id, weight: 2 });
      await setMode('ENFORCE');
      try {
        expect(await code(usage.assertCanUseAi(id, 1))).toBe('LIMITE_IA');
        await addPack(id, 'AI_1000');
        entitlements.invalidate(id);
        expect(await code(usage.assertCanUseAi(id, 1))).toBeNull();
        const piloto = await newOrg();
        await subs.createForNewOrganization(piloto, 'PILOTO');
        await usage.record({ organizationId: piloto, weight: 999999 });
        expect(await code(usage.assertCanUseAi(piloto, 1))).toBeNull();
      } finally { await setMode('OFF'); }
      await usage.record({ organizationId: id, weight: 5000 });
      expect(await code(usage.assertCanUseAi(id, 1))).toBeNull(); // OFF
      await setMode('OBSERVE');
      expect(await code(usage.assertCanUseAi(id, 1))).toBeNull();
      await setMode('OFF');
    });

    it('el tope de seguridad en dinero pausa la IA aunque queden peticiones (TOPE_IA)', async () => {
      const plan = await testPlan('IA3', { aiRequests: 10 });
      const id = await orgOnPlan(plan);
      // tope = 10 × $0.0012 × 3 = $0.036; el gasto real ya lo superó (un peso mal calculado, por ejemplo)
      await prisma.usageLedger.create({ data: { organizationId: id, weight: 1, packWeight: 0, costUsd: 0.05, periodKey: new Date().toISOString().slice(0, 7) } });
      await setMode('ENFORCE');
      try {
        const s = await usage.aiStatus(id);
        expect(s.costCapUsd).toBeCloseTo(0.036, 6);
        expect(s.available).toBe(9);
        expect(await code(usage.assertCanUseAi(id, 1))).toBe('TOPE_IA');
      } finally { await setMode('OFF'); }
    });

    it('dos peticiones a la vez no gastan dos veces el mismo paquete (nunca queda en negativo)', async () => {
      const plan = await testPlan('IA4', { aiRequests: 0 });
      const id = await orgOnPlan(plan);
      await addPack(id, 'AI_1000', 5);
      await Promise.all([usage.record({ organizationId: id, weight: 4 }), usage.record({ organizationId: id, weight: 4 })]);
      const pack = await prisma.addonPurchase.findFirstOrThrow({ where: { organizationId: id } });
      expect(pack.remaining).toBeGreaterThanOrEqual(0);
      const sum = await prisma.usageLedger.aggregate({ where: { organizationId: id }, _sum: { packWeight: true } });
      expect(sum._sum.packWeight! + pack.remaining).toBe(5); // lo gastado de paquete + lo que queda = lo comprado
    });

    it('meter(): usa el contexto de la petición, registra el consumo con su peso y devuelve el resultado', async () => {
      const plan = await testPlan('IA5', { aiRequests: 100 });
      const id = await orgOnPlan(plan);
      const user = await addUser(id);
      const r = await runWithRequestContext({ organizationId: id, userId: user.id, role: 'AUDITOR' }, () => usage.meter({ agent: 'FISCUS', weight: 5 }, async () => 'respuesta'));
      expect(r).toBe('respuesta');
      const row = await prisma.usageLedger.findFirstOrThrow({ where: { organizationId: id } });
      expect(row).toMatchObject({ agent: 'FISCUS', weight: 5, userId: user.id, kind: 'AI' });
      expect(Number(row.costUsd)).toBeCloseTo(0.006, 6);
      expect(row.periodKey).toMatch(/^\d{4}-\d{2}$/);
    });

    it('meter(): sin contexto, para el SUPER_ADMIN, o si la acción falla, no registra nada; si el límite bloquea, la acción no corre', async () => {
      const plan = await testPlan('IA6', { aiRequests: 1 });
      const id = await orgOnPlan(plan);
      const user = await addUser(id);
      const count = () => prisma.usageLedger.count({ where: { organizationId: id } });
      await usage.meter({ agent: 'X', weight: 1 }, async () => 'sin contexto');
      await runWithRequestContext({ organizationId: id, userId: user.id, role: 'SUPER_ADMIN' }, () => usage.meter({ agent: 'X', weight: 1 }, async () => 'admin'));
      await expect(runWithRequestContext({ organizationId: id, userId: user.id, role: 'AUDITOR' }, () => usage.meter({ agent: 'X', weight: 1 }, async () => { throw new Error('falló'); }))).rejects.toThrow('falló');
      expect(await count()).toBe(0);

      await usage.record({ organizationId: id, weight: 1 });
      await setMode('ENFORCE');
      try {
        const corrio = jest.fn(async () => 'x');
        const r = await code(runWithRequestContext({ organizationId: id, userId: user.id, role: 'AUDITOR' }, () => usage.meter({ agent: 'X', weight: 1 }, corrio)));
        expect(r).toBe('LIMITE_IA');
        expect(corrio).not.toHaveBeenCalled();
      } finally { await setMode('OFF'); }
    });

    it('byAgent y consumption: peticiones por asistente y por organización, con dinero', async () => {
      const plan = await testPlan('IA7', { aiRequests: 100 });
      const id = await orgOnPlan(plan);
      await usage.record({ organizationId: id, agent: 'MINERVA', weight: 1 });
      await usage.record({ organizationId: id, agent: 'MINERVA', weight: 1 });
      await usage.record({ organizationId: id, agent: 'SHERLOCK', weight: 10 });
      expect(await usage.byAgent(id)).toEqual([{ agent: 'SHERLOCK', requests: 10, costUsd: expect.closeTo(0.012, 6) }, { agent: 'MINERVA', requests: 2, costUsd: expect.closeTo(0.0024, 6) }]);
      const c = await usage.consumption();
      expect(c.organizations.find((o: any) => o.organizationId === id)).toMatchObject({ requests: 12 });
    });
  });

  describe('espacio: uso por tipo y cuotas al subir', () => {
    const mkAudit = async (organizationId: string) => {
      const lead = await addUser(organizationId, 'AUDIT_MANAGER');
      const audit = await prisma.audit.create({ data: { organizationId, title: 'Auditoría de prueba', type: 'OPERATIONAL', leadAuditorId: lead.id } });
      return { audit, lead };
    };
    const MB = 1024 * 1024;
    const ev = (auditId: string, leadId: string, kind: any, mime: string, name: string, size: number) =>
      prisma.fieldEvidence.create({ data: { auditId, sectionKey: 's1', kind, sha256: randomUUID(), capturedById: leadId, capturedByName: 'x', capturedAt: new Date(), storageKey: `evidence/${randomUUID()}`, filename: name, mimeType: mime, size } });

    it('suma por tipo (evidencia de campo + documentos de solicitud) y por organización, sin mezclar organizaciones', async () => {
      const a = await newOrg(); const b = await newOrg();
      const { audit, lead } = await mkAudit(a);
      const other = await mkAudit(b);
      await ev(audit.id, lead.id, 'SHORT_VIDEO', 'video/mp4', 'visita.mp4', 300 * MB);
      await ev(audit.id, lead.id, 'INTERVIEW_AUDIO', 'audio/mpeg', 'entrevista.mp3', 20 * MB);
      await ev(audit.id, lead.id, 'PDF_DOCUMENT', 'application/pdf', 'contrato.pdf', 5 * MB);
      await ev(audit.id, lead.id, 'ANNOTATED_PHOTO', 'image/jpeg', 'foto.jpg', 2 * MB);
      await ev(audit.id, lead.id, 'TEXT_NOTE', 'text/plain', 'nota.txt', 1 * MB); // sin storageKey real: no cuenta si es null; aquí sí trae → OTROS
      await prisma.auditRequestDocument.create({ data: { auditId: audit.id, uploadedById: lead.id, filename: 'a.xlsx', originalName: 'Mayor.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', fileSize: 8 * MB, fileUrl: 'x' } });
      await prisma.auditRequestDocument.create({ data: { auditId: audit.id, uploadedById: lead.id, filename: 'b.pptx', originalName: 'Informe.pptx', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', fileSize: 4 * MB, fileUrl: 'x' } });
      await ev(other.audit.id, other.lead.id, 'SHORT_VIDEO', 'video/mp4', 'otra.mp4', 999 * MB);

      const u = await storage.usage(a);
      expect(u.byType).toMatchObject({ VIDEO: 300 * MB, AUDIO: 20 * MB, PDF: 5 * MB, FOTO: 2 * MB, XLS: 8 * MB, PPT: 4 * MB, OTROS: 1 * MB });
      expect(u.totalBytes).toBe(340 * MB);
      const all = await storage.usageAll();
      expect(all.get(a).totalBytes).toBe(340 * MB);
      expect(all.get(b).totalBytes).toBe(999 * MB);
      expect((await storage.usage(await newOrg())).totalBytes).toBe(0);
    });

    it('ENFORCE: tipo no permitido (415), archivo muy grande (413) y espacio agotado (402); un paquete de espacio abre lugar', async () => {
      const plan = await testPlan('ESP', { storageGb: 0, maxFileMb: 10, fileTypes: ['PDF', 'FOTO'] });
      const id = await orgOnPlan(plan);
      await setMode('ENFORCE');
      try {
        const up = (f: any) => storage.assertCanUpload(id, f);
        expect(await code(up({ sizeBytes: MB, mimeType: 'video/mp4', filename: 'v.mp4' }))).toBe('TIPO_NO_PERMITIDO');
        expect(await status(up({ sizeBytes: MB, mimeType: 'video/mp4', filename: 'v.mp4' }))).toBe(415);
        expect(await code(up({ sizeBytes: 11 * MB, mimeType: 'application/pdf', filename: 'g.pdf' }))).toBe('ARCHIVO_MUY_GRANDE');
        expect(await status(up({ sizeBytes: 11 * MB, mimeType: 'application/pdf', filename: 'g.pdf' }))).toBe(413);
        expect(await code(up({ sizeBytes: MB, mimeType: 'application/pdf', filename: 'ok.pdf' }))).toBe('ESPACIO_AGOTADO');
        expect(await status(up({ sizeBytes: MB, mimeType: 'application/pdf', filename: 'ok.pdf' }))).toBe(402);

        await addPack(id, 'STORAGE_10');
        entitlements.invalidate(id);
        expect(await code(up({ sizeBytes: MB, mimeType: 'application/pdf', filename: 'ok.pdf' }))).toBeNull();
      } finally { await setMode('OFF'); }
    });

    it('lo ya guardado cuenta: con el espacio casi lleno no cabe un archivo que lo desborda', async () => {
      const plan = await testPlan('ESP2', { storageGb: 1, maxFileMb: 2000 });
      const id = await orgOnPlan(plan);
      const { audit, lead } = await mkAudit(id);
      await ev(audit.id, lead.id, 'PDF_DOCUMENT', 'application/pdf', 'grande.pdf', 900 * MB);
      await setMode('ENFORCE');
      try {
        expect(await code(storage.assertCanUpload(id, { sizeBytes: 50 * MB, mimeType: 'application/pdf', filename: 'a.pdf' }))).toBeNull();
        expect(await code(storage.assertCanUpload(id, { sizeBytes: 200 * MB, mimeType: 'application/pdf', filename: 'b.pdf' }))).toBe('ESPACIO_AGOTADO');
      } finally { await setMode('OFF'); }
    });

    it('OFF y OBSERVE no bloquean; las organizaciones exentas (Piloto) suben sin límite', async () => {
      const plan = await testPlan('ESP3', { storageGb: 0, maxFileMb: 1, fileTypes: ['PDF'] });
      const id = await orgOnPlan(plan);
      const file = { sizeBytes: 500 * MB, mimeType: 'video/mp4', filename: 'v.mp4' };
      expect(await code(storage.assertCanUpload(id, file))).toBeNull(); // OFF
      await setMode('OBSERVE');
      expect(await code(storage.assertCanUpload(id, file))).toBeNull();
      await setMode('ENFORCE');
      try {
        const piloto = await newOrg();
        await subs.createForNewOrganization(piloto, 'PILOTO');
        expect(await code(storage.assertCanUpload(piloto, { sizeBytes: 5 * 1024 * MB, mimeType: 'video/mp4', filename: 'enorme.mp4' }))).toBeNull();
      } finally { await setMode('OFF'); }
    });
  });

  describe('pagos con aprobación manual', () => {
    const admin = (organizationId: string) => ({ id: 'admin-test', organizationId });

    it('licencia: el monto sale del precio de lista, o del precio pactado si es el mismo plan y la misma duración', async () => {
      const id = await newOrg();
      await subs.createForNewOrganization(id);
      await subs.assign(id, { planCode: 'EMPRESA_DESPACHO', months: 12 }, 'test-actor-2');
      let p = await payments.createRequest(admin(id), { kind: 'LICENSE', planCode: 'EMPRESA_DESPACHO', months: 12, method: 'QR' });
      expect(p).toMatchObject({ amountUsd: 1490, status: 'PENDING', method: 'QR', kind: 'LICENSE', hasProof: false });
      expect(p.reference).toMatch(/^AUD-[A-HJ-NP-Z2-9]{6}$/);
      expect(p.concept).toContain('Empresa Despacho');
      expect(new Date(p.expiresAt).getTime() - Date.now()).toBeGreaterThan(13 * DAY);

      await subs.update(id, { agreedPriceUsd: 1200 }, 'test-actor-2');
      p = await payments.createRequest(admin(id), { kind: 'LICENSE', planCode: 'EMPRESA_DESPACHO', months: 12, method: 'TRANSFER' });
      expect(p.amountUsd).toBe(1200); // mismo contrato → precio pactado
      p = await payments.createRequest(admin(id), { kind: 'LICENSE', planCode: 'EMPRESA_DESPACHO', months: 6, method: 'TRANSFER' });
      expect(p.amountUsd).toBe(805); // otra duración → precio de lista
    });

    it('rechaza planes sin precio, duraciones inválidas, planes de Piloto e inexistentes', async () => {
      const id = await newOrg();
      await subs.createForNewOrganization(id);
      const req = (input: any) => code(payments.createRequest(admin(id), { method: 'QR', ...input }));
      expect(await req({ kind: 'LICENSE', planCode: 'EMPRESA_DESPACHO', months: 5 })).toMatch(/duración/);
      expect(await req({ kind: 'LICENSE', planCode: 'PILOTO', months: 12 })).toMatch(/no se contrata/);
      expect(await req({ kind: 'LICENSE', planCode: 'INSTITUCIONAL', months: 12 })).toMatch(/no está disponible/);
      expect(await req({ kind: 'LICENSE', planCode: 'NO_EXISTE', months: 12 })).toMatch(/no está disponible/);
      expect(await req({ kind: 'PACK', packCode: 'NO_EXISTE' })).toMatch(/no está disponible/);
      expect(await req({ kind: 'LICENSE' })).toMatch(/plan y la duración/);
    });

    it('paquetes: IA = pago único; espacio = precio mensual × meses hasta el vencimiento; el plan decide si admite paquetes', async () => {
      const id = await newOrg();
      await subs.createForNewOrganization(id);
      await subs.assign(id, { planCode: 'EMPRESA_DESPACHO', months: 3 }, 'test-actor-2'); // vence en ~3 meses
      expect((await payments.createRequest(admin(id), { kind: 'PACK', packCode: 'AI_5000', method: 'QR' })).amountUsd).toBe(20);
      const st = await payments.createRequest(admin(id), { kind: 'PACK', packCode: 'STORAGE_50', method: 'QR' });
      expect(st.amountUsd).toBe(36); // $12 × 3 meses
      expect(st.concept).toContain('3 mes');

      const sinIa = await orgOnPlan(await testPlan('SINIA', { packsAi: false }));
      expect(await status(payments.createRequest(admin(sinIa), { kind: 'PACK', packCode: 'AI_1000', method: 'QR' }))).toBe(403);
      expect((await payments.createRequest(admin(sinIa), { kind: 'PACK', packCode: 'STORAGE_10', method: 'QR' })).amountUsd).toBeGreaterThan(0);
      expect((await payments.packsFor(sinIa)).map((p: any) => p.kind)).not.toContain('AI');
      expect((await payments.packsFor(id)).map((p: any) => p.code)).toContain('AI_1000');
    });

    it('no más de 5 pagos pendientes a la vez; cancelar uno libera lugar', async () => {
      const id = await orgOnPlan(await testPlan('PEND', {}));
      const made = [];
      for (let i = 0; i < 5; i++) made.push(await payments.createRequest(admin(id), { kind: 'PACK', packCode: 'AI_1000', method: 'QR' }));
      expect(await status(payments.createRequest(admin(id), { kind: 'PACK', packCode: 'AI_1000', method: 'QR' }))).toBe(409);
      await payments.cancel(id, made[0].id);
      expect(await status(payments.createRequest(admin(id), { kind: 'PACK', packCode: 'AI_1000', method: 'QR' }))).toBe(200);
      expect(await status(payments.cancel(id, made[0].id))).toBe(409); // ya cancelado
    });

    it('aprobar un pago de licencia del MISMO plan renueva desde el fin vigente; de OTRO plan, asigna el plan nuevo', async () => {
      const id = await newOrg();
      await subs.createForNewOrganization(id);
      const a = await subs.assign(id, { planCode: 'EMPRESA_DESPACHO', months: 1 }, 'test-actor-2');
      const same = await payments.createRequest(admin(id), { kind: 'LICENSE', planCode: 'EMPRESA_DESPACHO', months: 3, method: 'QR' });
      const ok = await payments.approve(same.id, 'test-actor-2');
      expect(ok.status).toBe('APPROVED');
      const renewed = await prisma.billingSubscription.findUniqueOrThrow({ where: { organizationId: id } });
      expect(Math.round((renewed.currentPeriodEnd!.getTime() - a.currentPeriodEnd.getTime()) / DAY)).toBeGreaterThanOrEqual(89);

      const other = await payments.createRequest(admin(id), { kind: 'LICENSE', planCode: 'EMPRESA_PLUS', months: 12, method: 'QR' });
      await payments.approve(other.id, 'test-actor-2');
      const assigned = await prisma.billingSubscription.findUniqueOrThrow({ where: { organizationId: id } });
      expect((assigned.planSnapshot as any).code).toBe('EMPRESA_PLUS');
      expect(assigned.months).toBe(12);
      expect(Number(assigned.priceUsd)).toBe(2990);
    });

    it('aprobar reactiva una cuenta en solo lectura', async () => {
      const id = await newOrg();
      await subs.createForNewOrganization(id);
      await subs.assign(id, { planCode: 'EMPRESA_DESPACHO', months: 1 }, 'test-actor-2');
      await prisma.billingSubscription.update({ where: { organizationId: id }, data: { currentPeriodEnd: new Date(Date.now() - 30 * DAY) } });
      entitlements.invalidate(id);
      expect((await entitlements.get(id)).status).toBe('READ_ONLY');
      const p = await payments.createRequest(admin(id), { kind: 'LICENSE', planCode: 'EMPRESA_DESPACHO', months: 1, method: 'QR' });
      await payments.approve(p.id, 'test-actor-2');
      expect((await entitlements.get(id)).status).toBe('ACTIVE');
    });

    it('aprobar un paquete de IA acredita sus peticiones (12 meses); uno de espacio suma GB mientras dure la licencia', async () => {
      const id = await orgOnPlan(await testPlan('PK', { aiRequests: 10, storageGb: 5 }), 12);
      const ai = await payments.createRequest(admin(id), { kind: 'PACK', packCode: 'AI_1000', method: 'QR' });
      const sp = await payments.createRequest(admin(id), { kind: 'PACK', packCode: 'STORAGE_10', method: 'QR' });
      await payments.approve(ai.id, 'test-actor-2');
      await payments.approve(sp.id, 'test-actor-2');
      const purchases = await prisma.addonPurchase.findMany({ where: { organizationId: id }, orderBy: { kind: 'asc' } });
      expect(purchases.map((p) => [p.kind, p.quantity, p.remaining, p.status])).toEqual([['AI', 1000, 1000, 'ACTIVE'], ['STORAGE', 10, 10, 'ACTIVE']]);
      const aiPack = purchases.find((p) => p.kind === 'AI')!;
      expect(Math.round((aiPack.expiresAt!.getTime() - Date.now()) / DAY)).toBeGreaterThanOrEqual(364);
      const e = await entitlements.get(id);
      expect(e.extra).toEqual({ storageGb: 10, aiPackRemaining: 1000 });
      expect((await usage.aiStatus(id)).available).toBe(1010);
    });

    it('un paquete vencido o agotado ya no cuenta', async () => {
      const id = await orgOnPlan(await testPlan('PK2', { storageGb: 5 }));
      await addPack(id, 'STORAGE_10', undefined, { expiresAt: new Date(Date.now() - DAY) });
      await addPack(id, 'AI_1000', 0, { status: 'CONSUMED' });
      entitlements.invalidate(id);
      expect((await entitlements.get(id)).extra).toEqual({ storageGb: 0, aiPackRemaining: 0 });
    });

    it('DOS aprobaciones a la vez acreditan UNA sola vez (la aprobación es condicional)', async () => {
      const id = await orgOnPlan(await testPlan('DUP', { aiRequests: 10 }));
      const p = await payments.createRequest(admin(id), { kind: 'PACK', packCode: 'AI_5000', method: 'QR' });
      const results = await Promise.allSettled([payments.approve(p.id, 'test-actor-2'), payments.approve(p.id, 'test-actor-2'), payments.approve(p.id, 'test-actor-2')]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(await prisma.addonPurchase.count({ where: { organizationId: id } })).toBe(1);
      expect(await status(payments.approve(p.id, 'test-actor-2'))).toBe(409);
    });

    it('DOS aprobaciones a la vez de una LICENCIA renuevan UNA sola vez (no hay clave única que lo salve: lo impide la aprobación condicional)', async () => {
      const id = await newOrg();
      await subs.createForNewOrganization(id);
      await subs.assign(id, { planCode: 'EMPRESA_DESPACHO', months: 1 }, 'test-actor-2');
      const before = (await prisma.billingSubscription.findUniqueOrThrow({ where: { organizationId: id } })).currentPeriodEnd!;
      const p = await payments.createRequest(admin(id), { kind: 'LICENSE', planCode: 'EMPRESA_DESPACHO', months: 3, method: 'QR' });
      const results = await Promise.allSettled([payments.approve(p.id, 'test-actor-2'), payments.approve(p.id, 'test-actor-2'), payments.approve(p.id, 'test-actor-2')]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const after = (await prisma.billingSubscription.findUniqueOrThrow({ where: { organizationId: id } })).currentPeriodEnd!;
      const dias = Math.round((after.getTime() - before.getTime()) / DAY);
      expect(dias).toBeGreaterThanOrEqual(89);
      expect(dias).toBeLessThanOrEqual(93); // 3 meses, no 6 ni 9
    });

    it('si el efecto falla, el pago NO queda aprobado (todo o nada)', async () => {
      const plan = await testPlan('ATOM', {});
      const id = await newOrg();
      await subs.createForNewOrganization(id);
      await subs.assign(id, { planCode: 'EMPRESA_DESPACHO', months: 1 }, 'test-actor-2');
      const p = await payments.createRequest(admin(id), { kind: 'LICENSE', planCode: plan, months: 12, method: 'QR' });
      await prisma.billingPlan.update({ where: { code: plan }, data: { active: false } }); // el plan se desactiva antes de aprobar
      expect(await status(payments.approve(p.id, 'test-actor-2'))).toBe(404);
      expect((await prisma.billingPayment.findUniqueOrThrow({ where: { id: p.id } })).status).toBe('PENDING');
      expect((await prisma.billingSubscription.findUniqueOrThrow({ where: { organizationId: id } })).planSnapshot).toMatchObject({ code: 'EMPRESA_DESPACHO' });
    });

    it('rechazar exige un motivo y solo vale para un pago pendiente; un pago procesado no vuelve a aprobarse', async () => {
      const id = await orgOnPlan(await testPlan('REJ', {}));
      const p = await payments.createRequest(admin(id), { kind: 'PACK', packCode: 'AI_1000', method: 'QR' });
      expect(await code(payments.reject(p.id, 'test-actor-2', ' '))).toMatch(/motivo/);
      const r = await payments.reject(p.id, 'test-actor-2', 'Comprobante ilegible');
      expect(r).toMatchObject({ status: 'REJECTED', rejectedReason: 'Comprobante ilegible' });
      expect(await status(payments.approve(p.id, 'test-actor-2'))).toBe(409);
      expect(await status(payments.reject(p.id, 'test-actor-2', 'otra vez'))).toBe(409);
      expect(await prisma.addonPurchase.count({ where: { organizationId: id } })).toBe(0);
    });

    it('los pagos pendientes con plazo vencido pasan a VENCIDO; los vigentes no', async () => {
      const id = await orgOnPlan(await testPlan('EXP', {}));
      const viejo = await payments.createRequest(admin(id), { kind: 'PACK', packCode: 'AI_1000', method: 'QR' });
      const nuevo = await payments.createRequest(admin(id), { kind: 'PACK', packCode: 'AI_1000', method: 'QR' });
      await prisma.billingPayment.update({ where: { id: viejo.id }, data: { expiresAt: new Date(Date.now() - DAY) } });
      expect(await payments.expireOld()).toBeGreaterThanOrEqual(1);
      expect((await prisma.billingPayment.findUniqueOrThrow({ where: { id: viejo.id } })).status).toBe('EXPIRED');
      expect((await prisma.billingPayment.findUniqueOrThrow({ where: { id: nuevo.id } })).status).toBe('PENDING');
    });

    it('cada organización ve solo sus pagos, y no puede cancelar ni subir comprobante a pagos ajenos; el superadmin ve todos', async () => {
      const a = await orgOnPlan(await testPlan('AISL', {})); const b = await orgOnPlan(await testPlan('AISL2', {}));
      const pa = await payments.createRequest(admin(a), { kind: 'PACK', packCode: 'AI_1000', method: 'QR' });
      expect((await payments.listMine(b)).map((p: any) => p.id)).not.toContain(pa.id);
      expect((await payments.listMine(a)).map((p: any) => p.id)).toContain(pa.id);
      expect(await status(payments.cancel(b, pa.id))).toBe(409);
      expect(await status(payments.attachProof(b, pa.id, { originalname: 'x.pdf', buffer: Buffer.from('%PDF-1.4 x') }))).toBe(404);
      const all = await payments.listAll({ status: 'PENDING' });
      expect(all.find((p: any) => p.id === pa.id)).toMatchObject({ organizationId: a, organizationName: expect.stringContaining('Prueba etapa2') });
    });

    it('«Mis pagos» vuelve a mostrar cómo pagar mientras el pago está pendiente (no solo al pedirlo); ya no en los demás estados', async () => {
      const before = (await settings.get()).paymentInstructions;
      await settings.update({ paymentInstructions: { QR: 'Banco Cuscatlán · QR 365 · concepto: tu referencia', TRANSFER: 'Cuenta 123 del banco X' } }, 'test-actor-2');
      try {
        const id = await orgOnPlan(await testPlan('INST', {}));
        const qr = await payments.createRequest(admin(id), { kind: 'PACK', packCode: 'AI_1000', method: 'QR' });
        const transfer = await payments.createRequest(admin(id), { kind: 'PACK', packCode: 'AI_5000', method: 'TRANSFER' });
        const cash = await payments.createRequest(admin(id), { kind: 'PACK', packCode: 'AI_1000', method: 'CASH' }); // sin texto cargado
        const cancelled = await payments.createRequest(admin(id), { kind: 'PACK', packCode: 'AI_1000', method: 'QR' });
        await payments.cancel(id, cancelled.id);

        const mine = await payments.listMine(id);
        const by = (pid: string) => mine.find((p: any) => p.id === pid);
        expect(by(qr.id).instructions).toBe('Banco Cuscatlán · QR 365 · concepto: tu referencia');
        expect(by(transfer.id).instructions).toBe('Cuenta 123 del banco X');
        expect(by(cash.id).instructions).toBeNull();
        expect(by(cancelled.id)).toMatchObject({ status: 'CANCELLED', instructions: null });
        // y al pedirlo se ve lo mismo, según el método elegido
        expect(qr.instructions).toBe('Banco Cuscatlán · QR 365 · concepto: tu referencia');
        expect(transfer.instructions).toBe('Cuenta 123 del banco X');
        expect(cash.instructions).toBeNull();
      } finally {
        await settings.update({ paymentInstructions: before }, 'test-actor-2');
      }
    });

    it('el comprobante se valida ANTES de tocar el almacenamiento: vacío, muy grande o de tipo falso', async () => {
      const id = await orgOnPlan(await testPlan('PRF', {}));
      const p = await payments.createRequest(admin(id), { kind: 'PACK', packCode: 'AI_1000', method: 'QR' });
      expect(await status(payments.attachProof(id, p.id, undefined))).toBe(400);
      expect(await status(payments.attachProof(id, p.id, { originalname: 'a.pdf', buffer: Buffer.alloc(0) }))).toBe(400);
      expect(await status(payments.attachProof(id, p.id, { originalname: 'a.pdf', buffer: Buffer.concat([Buffer.from('%PDF-'), Buffer.alloc(5 * 1024 * 1024)]) }))).toBe(400);
      expect(await status(payments.attachProof(id, p.id, { originalname: 'virus.pdf', buffer: Buffer.from('MZ\x90\x00 programa') }))).toBe(400);
      expect((await prisma.billingPayment.findUniqueOrThrow({ where: { id: p.id } })).proofPath).toBeNull();
    });

    it('cada paso deja un registro de actividad', async () => {
      const id = await orgOnPlan(await testPlan('EVT', {}));
      const p = await payments.createRequest(admin(id), { kind: 'PACK', packCode: 'AI_1000', method: 'QR' });
      await payments.approve(p.id, 'test-actor-2');
      const types = (await subs.events(id)).map((e: any) => e.type);
      expect(types).toEqual(expect.arrayContaining(['PAYMENT_REQUESTED', 'PACK_CREDITED', 'PAYMENT_APPROVED']));
    });

    it('catálogo de paquetes: crear, editar, validar y desactivar (un paquete inactivo ya no se ofrece)', async () => {
      const c = `TEST_PACK_${randomUUID().slice(0, 5).toUpperCase()}`;
      const pack = await payments.createPack({ code: c, kind: 'AI', name: 'Paquete de prueba', quantity: 100, priceUsd: 1 }, 'test-actor-2');
      expect(pack.recurring).toBe(false);
      expect(await code(payments.createPack({ code: c, kind: 'AI', name: 'x', quantity: 1, priceUsd: 1 }, 'a'))).toMatch(/Ya existe/);
      expect(await code(payments.createPack({ code: 'x', kind: 'AI', name: 'x', quantity: 1, priceUsd: 1 }, 'a'))).toMatch(/código del paquete/);
      expect(await code(payments.createPack({ code: 'TEST_PACK_SIN', kind: 'AI' }, 'a'))).toMatch(/Faltan datos/);
      const id = await orgOnPlan(await testPlan('CAT', {}));
      expect((await payments.packsFor(id)).map((p: any) => p.code)).toContain(c);
      await payments.updatePack(pack.id, { active: false, priceUsd: 2 }, 'test-actor-2');
      expect((await payments.packsFor(id)).map((p: any) => p.code)).not.toContain(c);
      await prisma.addonPack.deleteMany({ where: { code: { startsWith: 'TEST_PACK_' } } });
    });

    it('la cantidad de un paquete NO se puede cambiar con pagos pendientes (se acredita la cantidad vigente al aprobar); el precio, el nombre y desactivarlo sí', async () => {
      const c = `TEST_PACK_${randomUUID().slice(0, 5).toUpperCase()}`;
      const pack = await payments.createPack({ code: c, kind: 'AI', name: 'Paquete con pagos', quantity: 100, priceUsd: 1 }, 'test-actor-2');
      const org = await orgOnPlan(await testPlan('PQP', {}));
      const p1 = await payments.createRequest(admin(org), { kind: 'PACK', packCode: c, method: 'QR' });
      await payments.createRequest(admin(org), { kind: 'PACK', packCode: c, method: 'TRANSFER' });
      try {
        const e = await code(payments.updatePack(pack.id, { quantity: 500 }, 'test-actor-2'));
        expect(e).toMatch(/2 pagos pendientes de este paquete/);
        expect(await status(payments.updatePack(pack.id, { quantity: 500 }, 'test-actor-2'))).toBe(409);
        expect((await prisma.addonPack.findUniqueOrThrow({ where: { id: pack.id } })).quantity).toBe(100); // no cambió

        // singular con un solo pendiente
        await payments.cancel(org, p1.id);
        expect(await code(payments.updatePack(pack.id, { quantity: 500 }, 'test-actor-2'))).toMatch(/1 pago pendiente de este paquete/);

        // lo que no cambia lo que se acredita sí se puede editar; y mandar la MISMA cantidad no cuenta como cambio
        await payments.updatePack(pack.id, { priceUsd: 3, name: 'Nuevo nombre', active: false, sortOrder: 99, quantity: 100 }, 'test-actor-2');
        expect(await prisma.addonPack.findUniqueOrThrow({ where: { id: pack.id } })).toMatchObject({ quantity: 100, name: 'Nuevo nombre', active: false, sortOrder: 99 });

        // sin pagos pendientes de ese paquete, la cantidad se cambia; los pendientes de OTRO paquete no estorban
        const other = await payments.createPack({ code: `${c}_B`, kind: 'AI', name: 'Otro', quantity: 10, priceUsd: 1 }, 'test-actor-2');
        await payments.updatePack(other.id, { quantity: 20 }, 'test-actor-2');
        expect((await prisma.addonPack.findUniqueOrThrow({ where: { id: other.id } })).quantity).toBe(20);
      } finally {
        await prisma.billingPayment.deleteMany({ where: { organizationId: org, packCode: c } });
        await prisma.addonPack.deleteMany({ where: { code: { startsWith: 'TEST_PACK_' } } });
      }
    });

    it('al aprobar, los pagos resueltos (aprobados, rechazados o cancelados) ya no impiden cambiar la cantidad', async () => {
      const c = `TEST_PACK_${randomUUID().slice(0, 5).toUpperCase()}`;
      const pack = await payments.createPack({ code: c, kind: 'AI', name: 'Paquete resuelto', quantity: 100, priceUsd: 1 }, 'test-actor-2');
      const org = await orgOnPlan(await testPlan('PQR', {}));
      const pay = await payments.createRequest(admin(org), { kind: 'PACK', packCode: c, method: 'QR' });
      try {
        expect(await status(payments.updatePack(pack.id, { quantity: 7 }, 'test-actor-2'))).toBe(409);
        await payments.reject(pay.id, 'test-actor-2', 'Comprobante ilegible');
        await payments.updatePack(pack.id, { quantity: 7 }, 'test-actor-2');
        expect((await prisma.addonPack.findUniqueOrThrow({ where: { id: pack.id } })).quantity).toBe(7);
      } finally {
        await prisma.billingPayment.deleteMany({ where: { organizationId: org, packCode: c } });
        await prisma.addonPack.deleteMany({ where: { code: { startsWith: 'TEST_PACK_' } } });
      }
    });

    it('el nombre de un paquete no puede quedar vacío al editarlo', async () => {
      const c = `TEST_PACK_${randomUUID().slice(0, 5).toUpperCase()}`;
      const pack = await payments.createPack({ code: c, kind: 'STORAGE', name: 'Con nombre', quantity: 5, priceUsd: 1 }, 'test-actor-2');
      try {
        expect(await status(payments.updatePack(pack.id, { name: '   ' }, 'test-actor-2'))).toBe(400);
        expect(await code(payments.updatePack(pack.id, { name: '' }, 'test-actor-2'))).toMatch(/no puede quedar vacío/);
        expect((await prisma.addonPack.findUniqueOrThrow({ where: { id: pack.id } })).name).toBe('Con nombre');
        await payments.updatePack(pack.id, { name: '  Nombre recortado  ' }, 'test-actor-2');
        expect((await prisma.addonPack.findUniqueOrThrow({ where: { id: pack.id } })).name).toBe('Nombre recortado');
      } finally {
        await prisma.addonPack.deleteMany({ where: { code: { startsWith: 'TEST_PACK_' } } });
      }
    });
  });

  describe('lo que se ve del consumo', () => {
    it('el cliente ve peticiones y espacio SIN dinero; el superadmin ve dinero, peticiones y margen', async () => {
      const id = await orgOnPlan(await testPlan('VER', { aiRequests: 100, storageGb: 5 }));
      await subs.update(id, { agreedPriceUsd: 50 }, 'test-actor-2');
      await usage.record({ organizationId: id, agent: 'MINERVA', weight: 10 });
      const mine = await consumption.clientSummary(id);
      expect(mine.ai).toMatchObject({ included: 100, used: 10, available: 90, byAgent: [{ agent: 'MINERVA', requests: 10 }] });
      expect(mine.storage).toMatchObject({ limitGb: 5, usedBytes: 0 });
      const json = JSON.stringify(mine);
      for (const secreto of ['cost', 'costo', 'priceUsd', 'USD', 'usd', 'margin']) expect(json).not.toContain(secreto);

      const admin = await consumption.adminConsumption();
      const row = admin.organizations.find((o: any) => o.organizationId === id);
      expect(row).toMatchObject({ requests: 10, requestsIncluded: 100, status: 'ACTIVE' });
      expect(row.aiCostUsd).toBeCloseTo(0.012, 6);
      expect(row.monthlyIncomeUsd).toBeCloseTo(50, 2);
      expect(row.marginUsd).toBeCloseTo(50 - 0.012, 2);
      expect(admin).toMatchObject({ costPerRequestUsd: 0.0012, safetyMultiplier: 3 });
      expect(admin.agents.find((a: any) => a.agent === 'MINERVA')).toBeDefined();
    });
  });
});
