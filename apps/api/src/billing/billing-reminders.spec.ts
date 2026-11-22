/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  MIN_AGE_FOR_EXPIRING_MS, daysUntil, describeNotice, normalizeReminderDays, planNotice, remindersEnabled, type PlanNoticeInput,
} from './billing-reminders';
import { BillingScheduler } from './billing.scheduler';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-11-21T14:20:00Z');
const at = (days: number) => new Date(NOW.getTime() + days * DAY);

const base = (over: Partial<PlanNoticeInput> = {}): PlanNoticeInput => ({
  status: 'ACTIVE', exempt: false, endsAt: at(5), periodStart: at(-60), now: NOW, reminderDays: [7, 1], ...over,
});

describe('daysUntil', () => {
  it('redondea hacia arriba: con 3 horas de margen todavía «falta 1 día»', () => {
    expect(daysUntil(new Date(NOW.getTime() + 3 * 3600_000), NOW)).toBe(1);
    expect(daysUntil(at(1), NOW)).toBe(1);
    expect(daysUntil(new Date(at(1).getTime() + 1), NOW)).toBe(2);
    expect(daysUntil(at(7), NOW)).toBe(7);
  });
  it('nunca es negativo', () => {
    expect(daysUntil(at(-3), NOW)).toBe(0);
    expect(daysUntil(NOW, NOW)).toBe(0);
  });
});

describe('normalizeReminderDays', () => {
  it('deja enteros ≥ 1, sin repetir y de menor a mayor', () => {
    expect(normalizeReminderDays([7, 1, 7, 3])).toEqual([1, 3, 7]);
  });
  it('descarta 0, negativos, decimales y lo que no es número', () => {
    expect(normalizeReminderDays([0, -2, 1.5, '3', null, undefined, NaN, 2])).toEqual([2]);
  });
  it('lo que no es una lista da vacío', () => {
    expect(normalizeReminderDays(null)).toEqual([]);
    expect(normalizeReminderDays('7,1')).toEqual([]);
    expect(normalizeReminderDays(undefined)).toEqual([]);
  });
});

describe('planNotice — avisos previos al vencimiento (7 y 1 días)', () => {
  it('lejos del vencimiento no avisa', () => {
    expect(planNotice(base({ endsAt: at(8) }))).toBeNull();
    expect(planNotice(base({ endsAt: at(30) }))).toBeNull();
  });
  it('a 7 días (justo) toca el aviso de 7', () => {
    expect(planNotice(base({ endsAt: at(7) }))).toEqual({ kind: 'EXPIRING', days: 7 });
  });
  it('entre 7 y 1 días sigue siendo el de 7', () => {
    expect(planNotice(base({ endsAt: at(6.5) }))).toEqual({ kind: 'EXPIRING', days: 7 });
    expect(planNotice(base({ endsAt: at(1.01) }))).toEqual({ kind: 'EXPIRING', days: 7 });
  });
  it('a 1 día o menos toca el de 1', () => {
    expect(planNotice(base({ endsAt: at(1) }))).toEqual({ kind: 'EXPIRING', days: 1 });
    expect(planNotice(base({ endsAt: at(0.2) }))).toEqual({ kind: 'EXPIRING', days: 1 });
  });
  it('si el servidor no corrió, sale UN solo aviso: el más inmediato de los que ya tocan', () => {
    expect(planNotice(base({ endsAt: at(0.5), reminderDays: [7, 3, 1] }))).toEqual({ kind: 'EXPIRING', days: 1 });
    expect(planNotice(base({ endsAt: at(2), reminderDays: [7, 3, 1] }))).toEqual({ kind: 'EXPIRING', days: 3 });
  });
  it('usa los días configurados, en cualquier orden y con basura', () => {
    expect(planNotice(base({ endsAt: at(14), reminderDays: [30, 14] }))).toEqual({ kind: 'EXPIRING', days: 14 });
    expect(planNotice(base({ endsAt: at(20), reminderDays: [14, 30, 0, -1] }))).toEqual({ kind: 'EXPIRING', days: 30 });
    expect(planNotice(base({ endsAt: at(3), reminderDays: [] }))).toBeNull();
  });
  it('una prueba avisa igual que una licencia', () => {
    expect(planNotice(base({ status: 'TRIAL', endsAt: at(2) }))).toEqual({ kind: 'EXPIRING', days: 7 });
  });
  it('en el mismo instante del vencimiento todavía es un aviso previo; un instante después ya no', () => {
    expect(planNotice(base({ endsAt: NOW }))).toEqual({ kind: 'EXPIRING', days: 1 });
    expect(planNotice(base({ endsAt: new Date(NOW.getTime() - 1) }))).toBeNull();
  });
  it('no avisa a una suscripción recién creada (menos de 24 horas), pero sí pasado ese tiempo', () => {
    expect(planNotice(base({ endsAt: at(2), periodStart: new Date(NOW.getTime() - MIN_AGE_FOR_EXPIRING_MS + 1) }))).toBeNull();
    expect(planNotice(base({ endsAt: at(2), periodStart: new Date(NOW.getTime() - MIN_AGE_FOR_EXPIRING_MS) }))).toEqual({ kind: 'EXPIRING', days: 7 });
  });
});

describe('planNotice — después del vencimiento y casos que no avisan', () => {
  it('en gracia: un aviso de gracia', () => {
    expect(planNotice(base({ status: 'GRACE', endsAt: at(-2) }))).toEqual({ kind: 'GRACE' });
  });
  it('en solo lectura: un aviso de solo lectura', () => {
    expect(planNotice(base({ status: 'READ_ONLY', endsAt: at(-20) }))).toEqual({ kind: 'READ_ONLY' });
  });
  it('suspendida o cancelada: nada (lo maneja el superadmin), aunque su fecha de vencimiento esté por llegar', () => {
    expect(planNotice(base({ status: 'SUSPENDED', endsAt: at(-90) }))).toBeNull();
    expect(planNotice(base({ status: 'CANCELLED', endsAt: at(-90) }))).toBeNull();
    expect(planNotice(base({ status: 'SUSPENDED', endsAt: at(2) }))).toBeNull();
    expect(planNotice(base({ status: 'CANCELLED', endsAt: at(2) }))).toBeNull();
  });
  it('exenta (Piloto/Interno): nunca avisa, ni vencida', () => {
    expect(planNotice(base({ exempt: true, endsAt: at(1) }))).toBeNull();
    expect(planNotice(base({ exempt: true, status: 'GRACE', endsAt: at(-2) }))).toBeNull();
    expect(planNotice(base({ exempt: true, status: 'READ_ONLY', endsAt: at(-20) }))).toBeNull();
  });
  it('sin fecha de vencimiento: nada', () => {
    expect(planNotice(base({ endsAt: null }))).toBeNull();
    expect(planNotice(base({ endsAt: null, status: 'GRACE' }))).toBeNull();
  });
});

describe('describeNotice — el texto', () => {
  const ctx = (over: Record<string, unknown> = {}) => ({
    orgName: 'Despacho Pérez', planName: 'Despacho', storedStatus: 'ACTIVE', endsAt: at(5), graceEndsAt: at(12), readOnlyEndsAt: at(72), now: NOW, ...over,
  });

  it('licencia por vencer: dice los días que REALMENTE faltan, no el número configurado', () => {
    const t = describeNotice({ kind: 'EXPIRING', days: 7 }, ctx({ endsAt: at(5) }));
    expect(t.heading).toBe('Tu licencia vence en 5 días');
    expect(t.subject).toBe('Tu licencia de AuditMind vence en 5 días');
    expect(t.paragraphs.join(' ')).toContain('Despacho Pérez');
    expect(t.paragraphs.join(' ')).toContain('Plan: Despacho');
    expect(t.paragraphs.join(' ')).toMatch(/7 días de gracia/);
    expect(t.level).toBe('warning');
    expect(t.notificationType).toBe('SUBSCRIPTION_EXPIRING');
  });
  it('mañana y hoy', () => {
    expect(describeNotice({ kind: 'EXPIRING', days: 1 }, ctx({ endsAt: at(1) })).heading).toBe('Tu licencia vence mañana');
    expect(describeNotice({ kind: 'EXPIRING', days: 1 }, ctx({ endsAt: NOW })).heading).toBe('Tu licencia vence hoy');
  });
  it('una prueba dice «prueba», no «licencia»', () => {
    const t = describeNotice({ kind: 'EXPIRING', days: 7 }, ctx({ storedStatus: 'TRIAL', endsAt: at(3) }));
    expect(t.heading).toBe('Tu prueba termina en 3 días');
    expect(t.subject).toBe('Tu prueba de AuditMind termina en 3 días');
    expect(describeNotice({ kind: 'EXPIRING', days: 1 }, ctx({ storedStatus: 'TRIAL', endsAt: at(1) })).heading).toBe('Tu prueba termina mañana');
  });
  it('promete que nada se borra y no inventa un precio ni un enlace de pago', () => {
    const t = describeNotice({ kind: 'EXPIRING', days: 7 }, ctx());
    expect(t.paragraphs.join(' ')).toContain('Nada de lo que guardaste se borra');
    expect(t.paragraphs.join(' ')).not.toMatch(/\$|https?:\/\//);
  });
  it('gracia: cuenta los días de gracia que quedan', () => {
    const t = describeNotice({ kind: 'GRACE' }, ctx({ endsAt: at(-2), graceEndsAt: at(5) }));
    expect(t.heading).toBe('Tu licencia venció');
    expect(t.paragraphs.join(' ')).toContain('te quedan 5 días');
    expect(t.notificationType).toBe('SUBSCRIPTION_GRACE');
    expect(describeNotice({ kind: 'GRACE' }, ctx({ storedStatus: 'TRIAL', endsAt: at(-2), graceEndsAt: at(5) })).heading).toBe('Tu prueba terminó');
  });
  it('gracia con 1 día: singular; y nunca dice «0 días»', () => {
    expect(describeNotice({ kind: 'GRACE' }, ctx({ endsAt: at(-6), graceEndsAt: at(1) })).paragraphs.join(' ')).toContain('te queda 1 día con todo');
    expect(describeNotice({ kind: 'GRACE' }, ctx({ endsAt: at(-6), graceEndsAt: at(1) })).body).toContain('te queda 1 día.');
    const lastDay = describeNotice({ kind: 'GRACE' }, ctx({ endsAt: at(-6), graceEndsAt: NOW }));
    expect(lastDay.paragraphs.join(' ')).toContain('te queda 1 día con todo'); // nunca «0 días»
    expect(lastDay.paragraphs.join(' ')).not.toMatch(/\b0 d/);
    expect(describeNotice({ kind: 'GRACE' }, ctx({ endsAt: at(-2), graceEndsAt: at(5) })).body).toContain('te quedan 5 días.');
  });
  it('solo lectura: crítico, con la fecha límite antes de suspender', () => {
    const t = describeNotice({ kind: 'READ_ONLY' }, ctx({ endsAt: at(-20), readOnlyEndsAt: at(40) }));
    expect(t.level).toBe('critical');
    expect(t.heading).toBe('Tu cuenta está en solo lectura');
    expect(t.paragraphs.join(' ')).toContain('se suspenderá');
    expect(t.notificationType).toBe('SUBSCRIPTION_READ_ONLY');
    expect(describeNotice({ kind: 'READ_ONLY' }, ctx({ endsAt: at(-20), readOnlyEndsAt: null })).paragraphs.join(' ')).not.toContain('se suspenderá');
  });
  it('los datos del cliente llegan como texto plano (el correo los escapa); el asunto no lleva saltos de línea', () => {
    const t = describeNotice({ kind: 'EXPIRING', days: 7 }, ctx({ orgName: '<script>x</script>\nOtra línea' }));
    expect(t.subject).not.toMatch(/[\r\n]/);
    expect(t.paragraphs.join(' ')).toContain('<script>x</script>'); // sin escapar aquí: lo escapa EmailService.sendSubscriptionNotice
  });
});

describe('remindersEnabled — el cron solo corre donde debe', () => {
  it('el interruptor explícito manda', () => {
    expect(remindersEnabled('true', 'development')).toBe(true);
    expect(remindersEnabled('false', 'production')).toBe(false);
  });
  it('sin interruptor, solo en producción', () => {
    expect(remindersEnabled(undefined, 'production')).toBe(true);
    expect(remindersEnabled(undefined, 'development')).toBe(false);
    expect(remindersEnabled(undefined, undefined)).toBe(false);
    expect(remindersEnabled('', 'test')).toBe(false);
  });
  it('cualquier otro valor del interruptor se ignora (no es «true»)', () => {
    expect(remindersEnabled('yes', 'development')).toBe(false);
    expect(remindersEnabled('1', 'development')).toBe(false);
    expect(remindersEnabled('TRUE', 'development')).toBe(false);
  });
});

describe('BillingScheduler', () => {
  const build = (env: Record<string, string> = {}) => {
    const config = { get: (k: string) => env[k] } as any;
    const reminders = { run: jest.fn(async () => ({ mode: 'ENFORCE', checked: 3, due: 1, sent: 1, emailed: 2, emailFailed: 0, duplicates: 0, errors: 0 })) };
    const payments = { expireOld: jest.fn(async () => 2) };
    return { scheduler: new BillingScheduler(config, reminders as any, payments as any), reminders, payments };
  };

  it('fuera de producción y sin interruptor no hace nada (la base local es la de producción)', async () => {
    const { scheduler, reminders, payments } = build({ NODE_ENV: 'development' });
    await scheduler.run(NOW);
    expect(reminders.run).not.toHaveBeenCalled();
    expect(payments.expireOld).not.toHaveBeenCalled();
  });
  it('en producción vence los pagos pendientes y envía los avisos, con la hora recibida', async () => {
    const { scheduler, reminders, payments } = build({ NODE_ENV: 'production' });
    await scheduler.run(NOW);
    expect(payments.expireOld).toHaveBeenCalledWith(NOW);
    expect(reminders.run).toHaveBeenCalledWith(NOW);
  });
  it('con BILLING_REMINDERS_ENABLED=false no corre ni en producción', async () => {
    const { scheduler, reminders } = build({ NODE_ENV: 'production', BILLING_REMINDERS_ENABLED: 'false' });
    await scheduler.run(NOW);
    expect(reminders.run).not.toHaveBeenCalled();
  });
  it('dos corridas superpuestas: la segunda no hace nada', async () => {
    const { scheduler, reminders } = build({ NODE_ENV: 'production' });
    let release!: () => void;
    reminders.run.mockImplementationOnce(() => new Promise((resolve) => { release = () => resolve({ mode: 'ENFORCE', checked: 0, due: 0, sent: 0, emailed: 0, emailFailed: 0, duplicates: 0, errors: 0 }); }));
    const first = scheduler.run(NOW);
    await new Promise((r) => setImmediate(r));
    await scheduler.run(NOW);
    expect(reminders.run).toHaveBeenCalledTimes(1);
    release();
    await first;
    await scheduler.run(NOW); // ya terminó: vuelve a poder correr
    expect(reminders.run).toHaveBeenCalledTimes(2);
  });
  it('si vencer pagos falla, igual se envían los avisos; si los avisos fallan, no revienta el cron', async () => {
    const a = build({ NODE_ENV: 'production' });
    a.payments.expireOld.mockRejectedValueOnce(new Error('base caída'));
    await expect(a.scheduler.run(NOW)).resolves.toBeUndefined();
    expect(a.reminders.run).toHaveBeenCalled();
    const b = build({ NODE_ENV: 'production' });
    b.reminders.run.mockRejectedValueOnce(new Error('correo caído'));
    await expect(b.scheduler.run(NOW)).resolves.toBeUndefined();
    await b.scheduler.run(NOW); // y la guardia se liberó
    expect(b.reminders.run).toHaveBeenCalledTimes(2);
  });
});
