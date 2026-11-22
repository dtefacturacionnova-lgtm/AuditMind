/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';

/**
 * Avisos de uso (80 % y 100 % de peticiones de IA y de espacio) contra un Postgres REAL (SQL de las etapas 1 y 2 aplicado).
 *
 *   COLLECTIONS_TEST_DATABASE_URL=postgresql://postgres:test@localhost:54329/cobros_test npx jest billing-usage-alerts.integration
 */
const URL = process.env.COLLECTIONS_TEST_DATABASE_URL;
const suite = URL ? describe : describe.skip;
jest.setTimeout(120_000);

suite('avisos de uso contra Postgres real', () => {
  let prisma: PrismaClient;
  let settings: any; let entitlements: any; let plans: any; let subs: any; let usage: any; let storage: any; let reminders: any; let alerts: any;
  let periodKeyOf: (d?: Date) => string;
  let releaseLock: () => Promise<void>;
  const orgs: string[] = [];
  const DAY = 24 * 60 * 60 * 1000;
  const MB = 1024 * 1024;
  const NOW = new Date();
  const ACTOR = 'test-actor-4';

  const sent: Array<{ to: string; subject: string; heading: string; paragraphs: string[] }> = [];
  let emailMode: 'ok' | 'fail' = 'ok';
  const email = {
    sendSubscriptionNotice: jest.fn(async (to: string, p: { subject: string; heading: string; paragraphs: string[] }) => {
      if (emailMode === 'fail') return { sent: false, emailId: null, error: 'RESEND_API_KEY not configured' };
      sent.push({ to, ...p });
      return { sent: true, emailId: 'x' };
    }),
  };

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
    const { UsageService, periodKeyOf: pk } = await import('./usage.service');
    const { StorageUsageService } = await import('./storage-usage.service');
    const { NotificationsService } = await import('../notifications/notifications.service');
    const { BillingRemindersService } = await import('./billing-reminders.service');
    const { BillingUsageAlertsService } = await import('./billing-usage-alerts.service');
    periodKeyOf = pk;
    settings = new BillingSettingsService(prisma as any);
    entitlements = new EntitlementsService(prisma as any, settings);
    plans = new PlansService(prisma as any, entitlements);
    subs = new SubscriptionsService(prisma as any, settings, entitlements);
    usage = new UsageService(prisma as any, settings, entitlements);
    storage = new StorageUsageService(prisma as any, settings, entitlements);
    reminders = new BillingRemindersService(prisma as any, settings, email as any, new NotificationsService(prisma as any));
    alerts = new BillingUsageAlertsService(prisma as any, settings, entitlements, usage, storage, reminders);
  });

  afterAll(async () => {
    await prisma.billingSettings.update({ where: { id: 'default' }, data: { enforcementMode: 'OFF', reminderDays: [7, 1] } });
    await prisma.billingEvent.deleteMany({ where: { OR: [{ organizationId: { in: orgs } }, { actorId: ACTOR }] } });
    await prisma.notification.deleteMany({ where: { organizationId: { in: orgs } } });
    await prisma.fieldEvidence.deleteMany({ where: { audit: { organizationId: { in: orgs } } } });
    await prisma.audit.deleteMany({ where: { organizationId: { in: orgs } } });
    await prisma.organization.deleteMany({ where: { id: { in: orgs } } }); // suscripciones, libro, paquetes y usuarios caen en cascada
    await prisma.billingPlan.deleteMany({ where: { code: { startsWith: 'T4_' } } });
    await releaseLock();
    await prisma.$disconnect();
  });

  beforeEach(() => { sent.length = 0; emailMode = 'ok'; email.sendSubscriptionNotice.mockClear(); });

  const setMode = async (mode: 'OFF' | 'OBSERVE' | 'ENFORCE') => { await settings.update({ enforcementMode: mode }, ACTOR); entitlements.invalidate(); };

  const newOrg = async (active = true) => {
    const id = randomUUID();
    const org = await prisma.organization.create({ data: { name: `Prueba uso ${id}`, slug: `t4-${id}`, active } });
    orgs.push(org.id);
    return org.id;
  };
  const addUser = (organizationId: string, role: string, active = true) => {
    const id = randomUUID();
    return prisma.user.create({ data: { organizationId, supabaseUserId: id, email: `${id}@t4.test`, name: `Usuario ${role}`, role: role as any, active } });
  };
  const testPlan = async (limits: Record<string, unknown>) => {
    const code = `T4_${randomUUID().slice(0, 8).toUpperCase()}`;
    await plans.create({
      code, name: `Plan ${code}`, audience: 'EMPRESA', modules: ['CARTERA'], functions: [], assistants: ['MINERVA'],
      limits: { users: 5, maxUsers: 5, storageGb: 100, maxFileMb: 100, aiRequests: 100, ...limits }, prices: [{ months: 1, priceUsd: 50 }],
    }, ACTOR);
    return code;
  };
  /** Organización con ADMIN y AUDITOR, en un plan con los límites dados (licencia vigente de 1 mes). */
  const orgOn = async (limits: Record<string, unknown>) => {
    const id = await newOrg();
    const admin = await addUser(id, 'ADMIN');
    const auditor = await addUser(id, 'AUDITOR');
    await subs.createForNewOrganization(id);
    await subs.assign(id, { planCode: await testPlan(limits), months: 1 }, ACTOR);
    entitlements.invalidate(id);
    return { id, admin, auditor };
  };
  const addPack = (organizationId: string, packCode: string) =>
    prisma.addonPack.findUniqueOrThrow({ where: { code: packCode } }).then((p) => prisma.addonPurchase.create({
      data: { organizationId, packId: p.id, kind: p.kind, quantity: p.quantity, remaining: p.quantity, priceUsd: p.priceUsd, expiresAt: new Date(Date.now() + 300 * DAY) },
    }));
  const mkAudit = async (organizationId: string) => {
    const lead = await addUser(organizationId, 'AUDIT_MANAGER');
    const audit = await prisma.audit.create({ data: { organizationId, title: 'Auditoría de prueba', type: 'OPERATIONAL', leadAuditorId: lead.id } });
    return { audit, lead };
  };
  /** Agrega `mb` MB de PDF a la evidencia. La columna `size` es de 32 bits (máx. ≈ 2 GB por archivo): se reparte en archivos de hasta 1,500 MB. */
  const addFile = async (auditId: string, leadId: string, mb: number) => {
    for (let left = mb; left > 0; left -= 1500) {
      await prisma.fieldEvidence.create({ data: { auditId, sectionKey: 's1', kind: 'PDF_DOCUMENT', sha256: randomUUID(), capturedById: leadId, capturedByName: 'x', capturedAt: new Date(), storageKey: `evidence/${randomUUID()}`, filename: 'a.pdf', mimeType: 'application/pdf', size: Math.min(left, 1500) * MB } });
    }
  };

  const aiUse = (organizationId: string, weight: number) => usage.record({ organizationId, agent: 'MINERVA', weight });
  const eventsOf = (organizationId: string, type = 'USAGE_ALERT_SENT') => prisma.billingEvent.findMany({ where: { organizationId, type }, orderBy: { createdAt: 'asc' } });
  const emailsTo = (...users: Array<{ email: string }>) => sent.filter((s) => users.some((u) => u.email === s.to));
  const notificationsOf = (organizationId: string) => prisma.notification.findMany({ where: { organizationId }, orderBy: { createdAt: 'asc' } });
  const kinds = async (organizationId: string) => (await eventsOf(organizationId)).map((e: any) => e.data.kind);

  describe('según el interruptor de cumplimiento', () => {
    it('OFF no escribe a nadie ni deja rastro, aunque estén al 100 %', async () => {
      const o = await orgOn({ aiRequests: 100 });
      await aiUse(o.id, 100);
      await setMode('OFF');
      const r = await alerts.run(NOW);
      expect(r).toMatchObject({ mode: 'OFF', due: 0, sent: 0 });
      expect(emailsTo(o.admin)).toHaveLength(0);
      expect(await eventsOf(o.id)).toHaveLength(0);
    });

    it('OBSERVE cuenta lo que enviaría, pero no envía, no notifica ni registra nada', async () => {
      const o = await orgOn({ aiRequests: 100 });
      await aiUse(o.id, 85);
      await setMode('OBSERVE');
      try {
        const r = await alerts.run(NOW);
        expect(r.mode).toBe('OBSERVE');
        expect(r.due).toBeGreaterThanOrEqual(1);
        expect(r.sent).toBe(0);
        expect(emailsTo(o.admin)).toHaveLength(0);
        expect(await eventsOf(o.id)).toHaveLength(0);
        expect(await notificationsOf(o.id)).toHaveLength(0);
      } finally { await setMode('OFF'); }
    });

    it('la vista previa muestra qué tocaría y no escribe nada, ni siquiera con ENFORCE', async () => {
      const o = await orgOn({ aiRequests: 100 });
      await aiUse(o.id, 90);
      await setMode('ENFORCE');
      try {
        const p = await alerts.preview(NOW);
        const mine = p.items.filter((i: any) => i.organizationId === o.id);
        expect(mine).toHaveLength(1);
        expect(mine[0].decision).toMatchObject({ kind: 'AI_80', percent: 90 });
        expect(emailsTo(o.admin)).toHaveLength(0);
        expect(await eventsOf(o.id)).toHaveLength(0);
        expect(await notificationsOf(o.id)).toHaveLength(0);
      } finally { await setMode('OFF'); }
    });
  });

  describe('ENFORCE: peticiones de IA', () => {
    beforeEach(() => setMode('ENFORCE'));
    afterEach(() => setMode('OFF'));

    it('al 80 % avisa una sola vez, al ADMIN (no al auditor), por correo y dentro de la aplicación', async () => {
      const o = await orgOn({ aiRequests: 100 });
      await aiUse(o.id, 80);
      const r = await alerts.run(NOW);
      expect(r.sent).toBeGreaterThanOrEqual(1);
      expect(emailsTo(o.admin)).toHaveLength(1);
      expect(emailsTo(o.auditor)).toHaveLength(0);
      expect(emailsTo(o.admin)[0].subject).toBe('Llevas el 80 % de tus peticiones de IA de este mes');
      expect(emailsTo(o.admin)[0].paragraphs[0]).toContain('80 de 100 peticiones');

      const notes = await notificationsOf(o.id);
      expect(notes).toHaveLength(1);
      expect(notes[0]).toMatchObject({ userId: o.admin.id, type: 'USAGE_AI_80', entityType: 'subscription' });
      const events = await eventsOf(o.id);
      expect(events).toHaveLength(1);
      expect(events[0].data).toMatchObject({ kind: 'AI_80', period: periodKeyOf(NOW), capacity: 100, recipients: 1, emailed: 1, emailFailed: 0 });

      const again = await alerts.run(NOW); // otra corrida de la hora siguiente
      expect(again.duplicates).toBeGreaterThanOrEqual(1);
      expect(again.sent).toBe(0);
      expect(emailsTo(o.admin)).toHaveLength(1);
      expect(await eventsOf(o.id)).toHaveLength(1);
    });

    it('por debajo del 80 % no avisa', async () => {
      const o = await orgOn({ aiRequests: 100 });
      await aiUse(o.id, 79);
      await alerts.run(NOW);
      expect(emailsTo(o.admin)).toHaveLength(0);
    });

    it('del 80 % al 100 %: dos avisos distintos, cada uno una sola vez', async () => {
      const o = await orgOn({ aiRequests: 100 });
      await aiUse(o.id, 80);
      await alerts.run(NOW);
      await aiUse(o.id, 20);
      await alerts.run(NOW);
      await alerts.run(NOW);
      expect(await kinds(o.id)).toEqual(['AI_80', 'AI_100']);
      expect(emailsTo(o.admin).map((m) => m.subject)).toEqual([
        'Llevas el 80 % de tus peticiones de IA de este mes', 'Llegaste al límite de peticiones de IA de este mes',
      ]);
      expect((await notificationsOf(o.id)).map((n: any) => n.type)).toEqual(['USAGE_AI_80', 'USAGE_AI_100']);
    });

    it('si salta directo al 100 %, avisa solo el de 100 (no uno de 80 atrasado)', async () => {
      const o = await orgOn({ aiRequests: 100 });
      await aiUse(o.id, 100);
      await alerts.run(NOW);
      expect(await kinds(o.id)).toEqual(['AI_100']);
    });

    it('un paquete comprado amplía la capacidad: no avisa de «lleno» mientras queden peticiones, y vuelve a avisar al agotarlas', async () => {
      const o = await orgOn({ aiRequests: 100 });
      await aiUse(o.id, 100);
      await alerts.run(NOW);
      expect(await kinds(o.id)).toEqual(['AI_100']);
      await addPack(o.id, 'AI_1000');
      entitlements.invalidate(o.id);
      await alerts.run(NOW);
      expect(await kinds(o.id)).toEqual(['AI_100']); // 100 de 1,100: no toca nada
      await aiUse(o.id, 1000); // agota también el paquete
      await alerts.run(NOW);
      expect(await kinds(o.id)).toEqual(['AI_100', 'AI_100']);
      expect(((await eventsOf(o.id))[1].data as any).capacity).toBe(1100);
      expect(emailsTo(o.admin)).toHaveLength(2);
    });

    it('cada mes cuenta aparte: lo gastado el mes pasado no cuenta y el aviso vuelve a salir al mes siguiente', async () => {
      const o = await orgOn({ aiRequests: 100 });
      const prev = new Date(Date.UTC(NOW.getUTCFullYear(), NOW.getUTCMonth() - 1, 15));
      await prisma.usageLedger.create({ data: { organizationId: o.id, weight: 100, packWeight: 0, costUsd: 0.1, periodKey: periodKeyOf(prev) } });
      await alerts.run(NOW);
      expect(emailsTo(o.admin)).toHaveLength(0); // el mes pasado no cuenta

      await aiUse(o.id, 85);
      await alerts.run(NOW);
      expect(await kinds(o.id)).toEqual(['AI_80']);

      const next = new Date(Date.UTC(NOW.getUTCFullYear(), NOW.getUTCMonth() + 1, 15));
      await prisma.usageLedger.create({ data: { organizationId: o.id, weight: 90, packWeight: 0, costUsd: 0.1, periodKey: periodKeyOf(next) } });
      await alerts.run(next);
      expect(await kinds(o.id)).toEqual(['AI_80', 'AI_80']);
      expect(((await eventsOf(o.id))[1].data as any).period).toBe(periodKeyOf(next));
    });

    it('un plan con IA ilimitada no recibe avisos de IA', async () => {
      const o = await orgOn({ aiRequests: -1 });
      await aiUse(o.id, 5000);
      await alerts.run(NOW);
      expect(emailsTo(o.admin)).toHaveLength(0);
    });
  });

  describe('ENFORCE: espacio', () => {
    beforeEach(() => setMode('ENFORCE'));
    afterEach(() => setMode('OFF'));

    it('al 80 % avisa con los GB usados y lo que queda; después lleno; cada uno una sola vez', async () => {
      const o = await orgOn({ storageGb: 1, aiRequests: -1 });
      const { audit, lead } = await mkAudit(o.id);
      await addFile(audit.id, lead.id, 900); // 900 de 1,024 MB = 87 %
      await alerts.run(NOW);
      await alerts.run(NOW);
      expect(await kinds(o.id)).toEqual(['STORAGE_80']);
      expect(emailsTo(o.admin)).toHaveLength(1);
      expect(emailsTo(o.admin)[0].subject).toBe('Usaste el 87 % de tu espacio en AuditMind');
      expect(emailsTo(o.admin)[0].paragraphs[0]).toContain('0.9 GB de 1 GB');

      await addFile(audit.id, lead.id, 200); // 1,100 MB: lleno
      await alerts.run(NOW);
      await alerts.run(NOW);
      expect(await kinds(o.id)).toEqual(['STORAGE_80', 'STORAGE_100']);
      expect(emailsTo(o.admin)[1].subject).toBe('Tu espacio en AuditMind está lleno');
      expect((await notificationsOf(o.id)).map((n: any) => n.type)).toEqual(['USAGE_STORAGE_80', 'USAGE_STORAGE_100']);
    });

    it('comprar espacio cambia la capacidad: deja de estar lleno y, si se vuelve a llenar, avisa de nuevo', async () => {
      const o = await orgOn({ storageGb: 1, aiRequests: -1 });
      const { audit, lead } = await mkAudit(o.id);
      await addFile(audit.id, lead.id, 1100);
      await alerts.run(NOW);
      expect(await kinds(o.id)).toEqual(['STORAGE_100']);
      await addPack(o.id, 'STORAGE_10'); // 11 GB
      entitlements.invalidate(o.id);
      await alerts.run(NOW);
      expect(await kinds(o.id)).toEqual(['STORAGE_100']); // 1,100 MB de 11 GB: no toca
      await addFile(audit.id, lead.id, 9800); // ~10.6 GB de 11: 96 %
      await alerts.run(NOW);
      expect(await kinds(o.id)).toEqual(['STORAGE_100', 'STORAGE_80']);
    });

    it('el MISMO nivel vuelve a avisar si cambia la capacidad: lleno con 1 GB, se compra espacio, y se vuelve a llenar', async () => {
      const o = await orgOn({ storageGb: 1, aiRequests: -1 });
      const { audit, lead } = await mkAudit(o.id);
      await addFile(audit.id, lead.id, 1100);
      await alerts.run(NOW);
      await addPack(o.id, 'STORAGE_10'); // 11 GB
      entitlements.invalidate(o.id);
      await addFile(audit.id, lead.id, 10200); // 11,300 MB (11.03 GB) en total: otra vez lleno, ahora con 11 GB de capacidad (11,264 MB)
      await alerts.run(NOW);
      expect(await kinds(o.id)).toEqual(['STORAGE_100', 'STORAGE_100']);
      expect(((await eventsOf(o.id))[1].data as any).capacityGb).toBe(11);
      expect(emailsTo(o.admin)).toHaveLength(2);
    });

    it('si sigue lleno, el aviso no se repite cada hora; sí pasados 30 días', async () => {
      const o = await orgOn({ storageGb: 1, aiRequests: -1 });
      const { audit, lead } = await mkAudit(o.id);
      await addFile(audit.id, lead.id, 1100);
      await alerts.run(NOW);
      await alerts.run(new Date(NOW.getTime() + 10 * DAY));
      await alerts.run(new Date(NOW.getTime() + 29 * DAY));
      expect(emailsTo(o.admin)).toHaveLength(1);
      await alerts.run(new Date(NOW.getTime() + 31 * DAY));
      expect(emailsTo(o.admin)).toHaveLength(2);
      expect(await kinds(o.id)).toEqual(['STORAGE_100', 'STORAGE_100']);
    });

    it('un plan con espacio ilimitado no recibe avisos de espacio', async () => {
      const o = await orgOn({ storageGb: -1, aiRequests: -1 });
      const { audit, lead } = await mkAudit(o.id);
      await addFile(audit.id, lead.id, 5000);
      await alerts.run(NOW);
      expect(emailsTo(o.admin)).toHaveLength(0);
    });

    it('los archivos de otra organización no cuentan', async () => {
      const a = await orgOn({ storageGb: 1, aiRequests: -1 });
      const b = await orgOn({ storageGb: 1, aiRequests: -1 });
      const other = await mkAudit(b.id);
      await addFile(other.audit.id, other.lead.id, 1100);
      await alerts.run(NOW);
      expect(emailsTo(a.admin)).toHaveLength(0);
      expect(emailsTo(b.admin)).toHaveLength(1);
    });
  });

  describe('a quién NO se avisa y qué pasa si algo falla', () => {
    beforeEach(() => setMode('ENFORCE'));
    afterEach(() => setMode('OFF'));

    it('exentas, suspendidas o canceladas a mano y organizaciones desactivadas no reciben avisos de uso', async () => {
      const exempt = await orgOn({ aiRequests: 100 });
      const suspended = await orgOn({ aiRequests: 100 });
      const cancelled = await orgOn({ aiRequests: 100 });
      const inactive = await orgOn({ aiRequests: 100 });
      const normal = await orgOn({ aiRequests: 100 });
      for (const o of [exempt, suspended, cancelled, inactive, normal]) await aiUse(o.id, 100);
      await prisma.billingSubscription.update({ where: { organizationId: exempt.id }, data: { exempt: true } });
      await prisma.billingSubscription.update({ where: { organizationId: suspended.id }, data: { status: 'SUSPENDED' } });
      await prisma.billingSubscription.update({ where: { organizationId: cancelled.id }, data: { status: 'CANCELLED' } });
      await prisma.organization.update({ where: { id: inactive.id }, data: { active: false } });
      entitlements.invalidate();
      await alerts.run(NOW);
      for (const o of [exempt, suspended, cancelled, inactive]) {
        expect(emailsTo(o.admin)).toHaveLength(0);
        expect(await eventsOf(o.id)).toHaveLength(0);
      }
      expect(emailsTo(normal.admin)).toHaveLength(1);
    });

    it('con la licencia vencida: en gracia sí avisa; en solo lectura ya no (el aviso que importa es el de vencimiento)', async () => {
      const grace = await orgOn({ aiRequests: 100 });
      const readOnly = await orgOn({ aiRequests: 100 });
      await aiUse(grace.id, 100);
      await aiUse(readOnly.id, 100);
      await prisma.billingSubscription.update({ where: { organizationId: grace.id }, data: { currentPeriodEnd: new Date(NOW.getTime() - 2 * DAY) } });
      await prisma.billingSubscription.update({ where: { organizationId: readOnly.id }, data: { currentPeriodEnd: new Date(NOW.getTime() - 20 * DAY) } });
      entitlements.invalidate();
      await alerts.run(NOW);
      expect(emailsTo(grace.admin)).toHaveLength(1);
      expect(emailsTo(readOnly.admin)).toHaveLength(0);
    });

    it('cada organización recibe solo lo suyo', async () => {
      const a = await orgOn({ aiRequests: 100 });
      const b = await orgOn({ aiRequests: 100 });
      await aiUse(a.id, 90);
      await aiUse(b.id, 10);
      await alerts.run(NOW);
      expect(emailsTo(a.admin)).toHaveLength(1);
      expect(emailsTo(b.admin)).toHaveLength(0);
      expect(await notificationsOf(b.id)).toHaveLength(0);
    });

    it('sin ADMIN ni CAE no revienta: deja el registro con 0 destinatarios', async () => {
      const o = await orgOn({ aiRequests: 100 });
      await prisma.user.update({ where: { id: o.admin.id }, data: { active: false } });
      await aiUse(o.id, 90);
      const r = await alerts.run(NOW);
      expect(r.errors).toBe(0);
      const events = await eventsOf(o.id);
      expect(events).toHaveLength(1);
      expect(events[0].data).toMatchObject({ recipients: 0, emailed: 0 });
      expect(await notificationsOf(o.id)).toHaveLength(0);
    });

    it('si el correo no sale, igual queda la notificación dentro de la aplicación y no se reintenta cada hora', async () => {
      const o = await orgOn({ aiRequests: 100 });
      await aiUse(o.id, 90);
      emailMode = 'fail';
      const r = await alerts.run(NOW);
      expect(r.errors).toBe(0);
      expect(r.emailFailed).toBeGreaterThanOrEqual(1);
      expect((await eventsOf(o.id))[0].data).toMatchObject({ recipients: 1, emailed: 0, emailFailed: 1 });
      expect(await notificationsOf(o.id)).toHaveLength(1);
      emailMode = 'ok';
      await alerts.run(NOW);
      expect(emailsTo(o.admin)).toHaveLength(0);
    });

    it('dos corridas a la vez envían cada aviso UNA sola vez', async () => {
      const o = await orgOn({ aiRequests: 100 });
      await aiUse(o.id, 90);
      await Promise.all([alerts.run(NOW), alerts.run(NOW), alerts.run(NOW)]);
      expect(emailsTo(o.admin)).toHaveLength(1);
      expect(await eventsOf(o.id)).toHaveLength(1);
      expect(await notificationsOf(o.id)).toHaveLength(1);
    });

    it('el aviso de uso y el de vencimiento de una misma organización son independientes (no se tapan entre sí)', async () => {
      const o = await orgOn({ aiRequests: 100 });
      await aiUse(o.id, 90);
      await prisma.billingSubscription.update({
        where: { organizationId: o.id },
        data: { currentPeriodEnd: new Date(NOW.getTime() + 3 * DAY), currentPeriodStart: new Date(NOW.getTime() - 60 * DAY), startedAt: new Date(NOW.getTime() - 60 * DAY) },
      });
      entitlements.invalidate();
      await reminders.run(NOW);
      await alerts.run(NOW);
      await reminders.run(NOW);
      await alerts.run(NOW);
      expect(emailsTo(o.admin).map((m) => m.subject).sort()).toEqual(['Llevas el 90 % de tus peticiones de IA de este mes', 'Tu licencia de AuditMind vence en 3 días']);
      expect(await eventsOf(o.id, 'REMINDER_SENT')).toHaveLength(1);
      expect(await eventsOf(o.id, 'USAGE_ALERT_SENT')).toHaveLength(1);
    });
  });
});
