/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';

/**
 * Avisos de vencimiento contra un Postgres REAL (SQL de las etapas 1 y 2 aplicado): qué se envía, a quién, una sola vez, y qué NO se envía.
 *
 *   COLLECTIONS_TEST_DATABASE_URL=postgresql://postgres:test@localhost:54329/cobros_test npx jest billing-reminders.integration
 */
const URL = process.env.COLLECTIONS_TEST_DATABASE_URL;
const suite = URL ? describe : describe.skip;
jest.setTimeout(120_000);

suite('avisos de vencimiento contra Postgres real', () => {
  let prisma: PrismaClient;
  let settings: any; let entitlements: any; let plans: any; let subs: any; let reminders: any;
  let releaseLock: () => Promise<void>;
  const orgs: string[] = [];
  const DAY = 24 * 60 * 60 * 1000;
  const NOW = new Date();
  const at = (days: number) => new Date(NOW.getTime() + days * DAY);
  const ACTOR = 'test-actor-3';

  // Correo falso: guarda a quién se le escribió. Cada prueba lo reinicia.
  const sent: Array<{ to: string; subject: string; heading: string; paragraphs: string[] }> = [];
  let emailMode: 'ok' | 'fail' | 'throw' = 'ok';
  const email = {
    sendSubscriptionNotice: jest.fn(async (to: string, p: { subject: string; heading: string; paragraphs: string[] }) => {
      if (emailMode === 'throw') throw new Error('Resend caído');
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
    const { NotificationsService } = await import('../notifications/notifications.service');
    const { BillingRemindersService } = await import('./billing-reminders.service');
    settings = new BillingSettingsService(prisma as any);
    entitlements = new EntitlementsService(prisma as any, settings);
    plans = new PlansService(prisma as any, entitlements);
    subs = new SubscriptionsService(prisma as any, settings, entitlements);
    reminders = new BillingRemindersService(prisma as any, settings, email as any, new NotificationsService(prisma as any));
  });

  afterAll(async () => {
    await prisma.billingSettings.update({ where: { id: 'default' }, data: { enforcementMode: 'OFF', reminderDays: [7, 1] } });
    await prisma.billingEvent.deleteMany({ where: { OR: [{ organizationId: { in: orgs } }, { actorId: ACTOR }] } });
    await prisma.notification.deleteMany({ where: { organizationId: { in: orgs } } });
    await prisma.organization.deleteMany({ where: { id: { in: orgs } } }); // suscripciones y usuarios caen en cascada
    await prisma.billingPlan.deleteMany({ where: { code: { startsWith: 'T3_' } } });
    await releaseLock();
    await prisma.$disconnect();
  });

  beforeEach(() => { sent.length = 0; emailMode = 'ok'; email.sendSubscriptionNotice.mockClear(); });

  const setMode = async (mode: 'OFF' | 'OBSERVE' | 'ENFORCE') => { await settings.update({ enforcementMode: mode }, ACTOR); entitlements.invalidate(); };
  const setReminderDays = async (days: number[]) => { await settings.update({ reminderDays: days }, ACTOR); };

  const newOrg = async (active = true) => {
    const id = randomUUID();
    const org = await prisma.organization.create({ data: { name: `Prueba avisos ${id}`, slug: `t3-${id}`, active } });
    orgs.push(org.id);
    return org.id;
  };
  const addUser = async (organizationId: string, role: string, active = true) => {
    const id = randomUUID();
    return prisma.user.create({ data: { organizationId, supabaseUserId: id, email: `${id}@t3.test`, name: `Usuario ${role}`, role: role as any, active } });
  };
  const testPlan = async () => {
    const code = `T3_${randomUUID().slice(0, 8).toUpperCase()}`;
    await plans.create({
      code, name: `Plan ${code}`, audience: 'EMPRESA', modules: ['CARTERA'], functions: [], assistants: ['MINERVA'],
      limits: { users: 5, maxUsers: 5, storageGb: 10, maxFileMb: 100, aiRequests: 10 }, prices: [{ months: 1, priceUsd: 50 }, { months: 12, priceUsd: 500 }],
    }, ACTOR);
    return code;
  };

  /**
   * Organización con un ADMIN, un AUDITOR y un ADMIN inactivo, con licencia que vence en `endsInDays` (negativo = ya venció).
   * La licencia «empezó» hace `startedDaysAgo` días, para que no cuente como recién creada.
   */
  const orgEnding = async (endsInDays: number, opts: { startedDaysAgo?: number; exempt?: boolean; status?: string } = {}) => {
    const id = await newOrg();
    const admin = await addUser(id, 'ADMIN');
    const auditor = await addUser(id, 'AUDITOR');
    const retired = await addUser(id, 'ADMIN', false);
    await subs.createForNewOrganization(id);
    await subs.assign(id, { planCode: await testPlan(), months: 1 }, ACTOR);
    const start = at(-(opts.startedDaysAgo ?? 60));
    await prisma.billingSubscription.update({
      where: { organizationId: id },
      data: { currentPeriodStart: start, startedAt: start, currentPeriodEnd: at(endsInDays), exempt: opts.exempt ?? false, ...(opts.status && { status: opts.status as any }) },
    });
    return { id, admin, auditor, retired };
  };

  const eventsOf = (organizationId: string) => prisma.billingEvent.findMany({ where: { organizationId, type: 'REMINDER_SENT' }, orderBy: { createdAt: 'asc' } });
  const emailsTo = (...users: Array<{ email: string }>) => sent.filter((s) => users.some((u) => u.email === s.to));
  const notificationsOf = (organizationId: string) => prisma.notification.findMany({ where: { organizationId }, orderBy: { createdAt: 'asc' } });

  describe('según el interruptor de cumplimiento', () => {
    it('OFF no escribe a nadie ni deja rastro', async () => {
      const o = await orgEnding(3);
      await setMode('OFF');
      const r = await reminders.run(NOW);
      expect(r).toMatchObject({ mode: 'OFF', due: 0, sent: 0 });
      expect(emailsTo(o.admin)).toHaveLength(0);
      expect(await eventsOf(o.id)).toHaveLength(0);
      expect(await notificationsOf(o.id)).toHaveLength(0);
    });

    it('OBSERVE cuenta lo que enviaría, pero no envía, no notifica ni registra nada', async () => {
      const o = await orgEnding(3);
      await setMode('OBSERVE');
      try {
        const r = await reminders.run(NOW);
        expect(r.mode).toBe('OBSERVE');
        expect(r.due).toBeGreaterThanOrEqual(1);
        expect(r.sent).toBe(0);
        expect(emailsTo(o.admin)).toHaveLength(0);
        expect(await eventsOf(o.id)).toHaveLength(0);
        expect(await notificationsOf(o.id)).toHaveLength(0);
      } finally { await setMode('OFF'); }
    });

    it('la vista previa muestra qué tocaría hoy y no escribe nada, ni siquiera con ENFORCE', async () => {
      const o = await orgEnding(3);
      await setMode('ENFORCE');
      try {
        const p = await reminders.preview(NOW);
        const mine = p.items.filter((i: any) => i.organizationId === o.id);
        expect(mine).toHaveLength(1);
        expect(mine[0]).toMatchObject({ organizationName: expect.stringContaining('Prueba avisos'), decision: { kind: 'EXPIRING', days: 7 } });
        expect(mine[0].text.subject).toContain('vence en 3 días');
        expect(emailsTo(o.admin)).toHaveLength(0);
        expect(await eventsOf(o.id)).toHaveLength(0);
        expect(await notificationsOf(o.id)).toHaveLength(0);
      } finally { await setMode('OFF'); }
    });
  });

  describe('ENFORCE: a quién, qué y cuántas veces', () => {
    beforeEach(() => setMode('ENFORCE'));
    afterEach(() => setMode('OFF'));

    it('avisa solo al ADMIN activo (no al auditor ni al administrador dado de baja), por correo y dentro de la aplicación', async () => {
      const o = await orgEnding(5);
      const r = await reminders.run(NOW);
      expect(r.sent).toBeGreaterThanOrEqual(1);
      expect(emailsTo(o.admin)).toHaveLength(1);
      expect(emailsTo(o.auditor, o.retired)).toHaveLength(0);
      const mail = emailsTo(o.admin)[0];
      expect(mail.subject).toBe('Tu licencia de AuditMind vence en 5 días');
      expect(mail.paragraphs.join(' ')).toContain('Prueba avisos');

      const notes = await notificationsOf(o.id);
      expect(notes).toHaveLength(1);
      expect(notes[0]).toMatchObject({ userId: o.admin.id, type: 'SUBSCRIPTION_EXPIRING', entityType: 'subscription', read: false });

      const events = await eventsOf(o.id);
      expect(events).toHaveLength(1);
      expect(events[0].data).toMatchObject({ kind: 'EXPIRING', days: 7, recipients: 1, emailed: 1, emailFailed: 0 });
    });

    it('es idempotente: otra corrida el mismo día no repite el correo ni la notificación', async () => {
      const o = await orgEnding(5);
      await reminders.run(NOW);
      const again = await reminders.run(NOW);
      expect(again.duplicates).toBeGreaterThanOrEqual(1);
      expect(emailsTo(o.admin)).toHaveLength(1);
      expect(await notificationsOf(o.id)).toHaveLength(1);
      expect(await eventsOf(o.id)).toHaveLength(1);
    });

    it('con ADMIN y CAE en la organización, el aviso va solo al ADMIN', async () => {
      const o = await orgEnding(4);
      const cae = await addUser(o.id, 'CAE');
      await reminders.run(NOW);
      expect(emailsTo(o.admin)).toHaveLength(1);
      expect(emailsTo(cae)).toHaveLength(0);
      expect((await notificationsOf(o.id)).map((n: any) => n.userId)).toEqual([o.admin.id]);
    });

    it('una licencia recién asignada no avisa aunque la organización sea antigua', async () => {
      const o = await orgEnding(2);
      await prisma.billingSubscription.update({ where: { organizationId: o.id }, data: { currentPeriodStart: at(-1 / 24) } }); // startedAt sigue siendo de hace 60 días
      await reminders.run(NOW);
      expect(emailsTo(o.admin)).toHaveLength(0);
    });

    it('un mismo vencimiento pasa por los tres avisos: por vencer, gracia y solo lectura (cada uno una sola vez)', async () => {
      const o = await orgEnding(0.5);
      await reminders.run(NOW); // queda medio día
      await reminders.run(at(1)); // ya venció: gracia
      await reminders.run(at(1.2)); // el mismo día: nada nuevo
      await reminders.run(at(10)); // pasó la gracia de 7 días: solo lectura
      await reminders.run(at(11));
      expect(emailsTo(o.admin).map((m) => m.subject)).toEqual([
        'Tu licencia de AuditMind vence mañana', 'Tu licencia de AuditMind venció', 'Tu cuenta de AuditMind está en solo lectura',
      ]);
      expect((await eventsOf(o.id)).map((e: any) => e.data.kind)).toEqual(['EXPIRING', 'GRACE', 'READ_ONLY']);
    });

    it('avisa a 7 días y luego a 1 día; entre medias no repite', async () => {
      const o = await orgEnding(5);
      await reminders.run(NOW); // quedan 5: toca el de 7
      await reminders.run(new Date(NOW.getTime() + 2 * DAY)); // quedan 3: ya salió el de 7
      expect(emailsTo(o.admin)).toHaveLength(1);
      await reminders.run(new Date(NOW.getTime() + 4.5 * DAY)); // queda medio día: toca el de 1
      expect(emailsTo(o.admin)).toHaveLength(2);
      expect(emailsTo(o.admin)[1].subject).toBe('Tu licencia de AuditMind vence mañana');
      await reminders.run(new Date(NOW.getTime() + 4.8 * DAY));
      expect(emailsTo(o.admin)).toHaveLength(2);
      expect((await eventsOf(o.id)).map((e: any) => e.data.days)).toEqual([7, 1]);
    });

    it('si el servidor no corrió antes, sale UN solo aviso (el de 1 día), no uno por cada día atrasado', async () => {
      const o = await orgEnding(0.5);
      await reminders.run(NOW);
      expect(emailsTo(o.admin)).toHaveLength(1);
      expect((await eventsOf(o.id)).map((e: any) => e.data.days)).toEqual([1]);
    });

    it('no avisa a una suscripción recién creada (menos de 24 horas), pero sí cuando ya pasó ese tiempo', async () => {
      const fresh = await orgEnding(2, { startedDaysAgo: 1 / 24 });
      await reminders.run(NOW);
      expect(emailsTo(fresh.admin)).toHaveLength(0);
      await reminders.run(new Date(NOW.getTime() + 2 * 3600_000 + DAY)); // pasó más de un día desde que empezó
      expect(emailsTo(fresh.admin)).toHaveLength(1);
    });

    it('al renovar cambia la fecha de vencimiento y los avisos vuelven a ser posibles', async () => {
      const o = await orgEnding(5);
      await reminders.run(NOW);
      expect(emailsTo(o.admin)).toHaveLength(1);
      await subs.renew(o.id, 1, ACTOR);
      await reminders.run(NOW); // recién renovada: vence en ~1 mes, no toca nada
      expect(emailsTo(o.admin)).toHaveLength(1);
      await prisma.billingSubscription.update({ where: { organizationId: o.id }, data: { currentPeriodEnd: at(4) } }); // otro vencimiento
      await reminders.run(NOW);
      expect(emailsTo(o.admin)).toHaveLength(2);
      expect(await eventsOf(o.id)).toHaveLength(2);
    });

    it('respeta los días configurados en los parámetros', async () => {
      const far = await orgEnding(5);
      const near = await orgEnding(2);
      await setReminderDays([3]);
      try {
        await reminders.run(NOW);
        expect(emailsTo(far.admin)).toHaveLength(0);
        expect(emailsTo(near.admin)).toHaveLength(1);
        expect((await eventsOf(near.id))[0].data).toMatchObject({ days: 3 });
      } finally { await setReminderDays([7, 1]); }
    });

    it('una prueba que termina dice «prueba»', async () => {
      const id = await newOrg();
      const admin = await addUser(id, 'ADMIN');
      await subs.createForNewOrganization(id);
      await prisma.billingSubscription.update({ where: { organizationId: id }, data: { status: 'TRIAL', startedAt: at(-12), trialEndsAt: at(2) } });
      await reminders.run(NOW);
      expect(emailsTo(admin)[0].subject).toBe('Tu prueba de AuditMind termina en 2 días');
    });

    it('avisa una sola vez al entrar en gracia y una sola vez al pasar a solo lectura; suspendida ya no', async () => {
      const grace = await orgEnding(-2);
      const readOnly = await orgEnding(-20);
      const suspended = await orgEnding(-100);
      await reminders.run(NOW);
      await reminders.run(NOW);
      expect(emailsTo(grace.admin)).toHaveLength(1);
      expect(emailsTo(grace.admin)[0].subject).toBe('Tu licencia de AuditMind venció');
      expect(emailsTo(readOnly.admin)).toHaveLength(1);
      expect(emailsTo(readOnly.admin)[0].subject).toBe('Tu cuenta de AuditMind está en solo lectura');
      expect(emailsTo(suspended.admin)).toHaveLength(0);
      expect((await notificationsOf(readOnly.id))[0].type).toBe('SUBSCRIPTION_READ_ONLY');
    });
  });

  describe('lo que NUNCA recibe aviso', () => {
    beforeEach(() => setMode('ENFORCE'));
    afterEach(() => setMode('OFF'));

    it('organizaciones exentas (Piloto/Interno), suspendidas o canceladas a mano, y organizaciones desactivadas', async () => {
      const exempt = await orgEnding(1, { exempt: true });
      const suspended = await orgEnding(1, { status: 'SUSPENDED' });
      const cancelled = await orgEnding(1, { status: 'CANCELLED' });
      const inactive = await orgEnding(1);
      await prisma.organization.update({ where: { id: inactive.id }, data: { active: false } });
      const normal = await orgEnding(1); // control: esta sí
      await reminders.run(NOW);
      for (const o of [exempt, suspended, cancelled, inactive]) {
        expect(emailsTo(o.admin)).toHaveLength(0);
        expect(await eventsOf(o.id)).toHaveLength(0);
      }
      expect(emailsTo(normal.admin)).toHaveLength(1);
    });

    it('una licencia sin vencimiento no avisa', async () => {
      const o = await orgEnding(1);
      await prisma.billingSubscription.update({ where: { organizationId: o.id }, data: { months: 0, currentPeriodEnd: null } });
      await reminders.run(NOW);
      expect(emailsTo(o.admin)).toHaveLength(0);
    });

    it('cada organización recibe solo lo suyo', async () => {
      const a = await orgEnding(5);
      const b = await orgEnding(60);
      await reminders.run(NOW);
      expect(emailsTo(a.admin)).toHaveLength(1);
      expect(emailsTo(b.admin)).toHaveLength(0);
      expect(await notificationsOf(b.id)).toHaveLength(0);
      expect((await notificationsOf(a.id)).every((n: any) => n.organizationId === a.id)).toBe(true);
    });
  });

  describe('destinatarios y fallos', () => {
    beforeEach(() => setMode('ENFORCE'));
    afterEach(() => setMode('OFF'));

    it('sin ADMIN activo, avisa a la dirección (CAE)', async () => {
      const o = await orgEnding(3);
      await prisma.user.update({ where: { id: o.admin.id }, data: { active: false } });
      const cae = await addUser(o.id, 'CAE');
      await reminders.run(NOW);
      expect(emailsTo(cae)).toHaveLength(1);
      expect(emailsTo(o.admin, o.auditor)).toHaveLength(0);
    });

    it('sin ADMIN ni CAE no revienta: deja el registro con 0 destinatarios y avisa en el registro de errores', async () => {
      const o = await orgEnding(3);
      await prisma.user.update({ where: { id: o.admin.id }, data: { active: false } });
      const r = await reminders.run(NOW);
      expect(r.errors).toBe(0);
      expect(sent.filter((s) => s.to.endsWith('@t3.test') && s.subject.includes('3 días'))).toHaveLength(0);
      const events = await eventsOf(o.id);
      expect(events).toHaveLength(1);
      expect(events[0].data).toMatchObject({ recipients: 0, emailed: 0 });
      expect(await notificationsOf(o.id)).toHaveLength(0);
    });

    it('si el correo no sale (sin configurar o caído), igual queda la notificación dentro de la aplicación y no se reintenta cada día', async () => {
      const o = await orgEnding(3);
      emailMode = 'fail';
      const r = await reminders.run(NOW);
      expect(r.errors).toBe(0);
      expect(r.emailFailed).toBeGreaterThanOrEqual(1);
      expect((await eventsOf(o.id))[0].data).toMatchObject({ recipients: 1, emailed: 0, emailFailed: 1 });
      expect(await notificationsOf(o.id)).toHaveLength(1);
      emailMode = 'ok';
      await reminders.run(NOW);
      expect(emailsTo(o.admin)).toHaveLength(0); // no se vuelve a intentar
    });

    it('si el envío lanza una excepción, tampoco rompe la corrida ni a las demás organizaciones', async () => {
      const o = await orgEnding(3);
      emailMode = 'throw';
      const r = await reminders.run(NOW);
      expect(r.errors).toBe(0);
      expect((await eventsOf(o.id))[0].data).toMatchObject({ emailed: 0, emailFailed: 1 });
      emailMode = 'ok';
      const other = await orgEnding(3);
      await reminders.run(NOW);
      expect(emailsTo(other.admin)).toHaveLength(1);
    });

    it('el reclamo toma el candado de la organización: mientras otra transacción lo tiene, el aviso espera y después sale una sola vez', async () => {
      const { reminderLockKey } = await import('./billing-reminders.service');
      const o = await orgEnding(3);
      const { items } = await reminders.preview(NOW);
      const item = items.find((i: any) => i.organizationId === o.id);

      let letGo!: () => void;
      const hold = new Promise<void>((resolve) => { letGo = resolve; });
      let gotLock!: () => void;
      const locked = new Promise<void>((resolve) => { gotLock = resolve; });
      const holder = prisma.$transaction(async (tx: any) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${reminderLockKey(o.id)}::text))`;
        gotLock();
        await hold;
      }, { timeout: 30_000, maxWait: 30_000 });
      await locked;

      let finished = false;
      const delivering = reminders.deliver(item, NOW).then((r: unknown) => { finished = true; return r; });
      await new Promise((resolve) => setTimeout(resolve, 800));
      expect(finished).toBe(false); // sigue esperando el candado
      expect(emailsTo(o.admin)).toHaveLength(0);
      expect(await eventsOf(o.id)).toHaveLength(0);

      letGo();
      await holder;
      expect(await delivering).not.toBe('duplicate');
      expect(emailsTo(o.admin)).toHaveLength(1);
      expect(await eventsOf(o.id)).toHaveLength(1);
    });

    it('muchas corridas a la vez sobre el mismo aviso envían UNA sola vez', async () => {
      const o = await orgEnding(3);
      const { items } = await reminders.preview(NOW);
      const item = items.find((i: any) => i.organizationId === o.id);
      const results = await Promise.all(Array.from({ length: 8 }, () => reminders.deliver(item, NOW)));
      expect(results.filter((r) => r === 'duplicate')).toHaveLength(7);
      expect(emailsTo(o.admin)).toHaveLength(1);
      expect(await eventsOf(o.id)).toHaveLength(1);
      expect(await notificationsOf(o.id)).toHaveLength(1);
    });

    it('dos corridas a la vez (dos servidores o un reinicio) envían el aviso UNA sola vez', async () => {
      const o = await orgEnding(3);
      const { items } = await reminders.preview(NOW);
      const item = items.find((i: any) => i.organizationId === o.id);
      const results = await Promise.all([reminders.deliver(item, NOW), reminders.deliver(item, NOW), reminders.deliver(item, NOW)]);
      expect(results.filter((r) => r === 'duplicate')).toHaveLength(2);
      expect(emailsTo(o.admin)).toHaveLength(1);
      expect(await eventsOf(o.id)).toHaveLength(1);
      expect(await notificationsOf(o.id)).toHaveLength(1);
    });
  });
});
