/* eslint-disable @typescript-eslint/no-explicit-any */
import { BillingAdminController } from './billing-admin.controller';

const GB = 1024 ** 3;

describe('GET billing-admin/reminders/preview', () => {
  const build = () => {
    const reminders = {
      preview: jest.fn(async () => ({
        checked: 4,
        items: [{
          organizationId: 'org1', organizationName: 'Despacho Norte', subscriptionId: 'sub1', planName: 'Despacho',
          decision: { kind: 'EXPIRING', days: 7 }, endsAt: new Date('2026-12-01T00:00:00Z'),
          text: { subject: 'Tu licencia de Nova Criterio vence en 5 días', paragraphs: ['texto privado'], heading: 'h', title: 't', body: 'b', level: 'warning', notificationType: 'X' },
        }],
      })),
    };
    const usageAlerts = {
      preview: jest.fn(async () => ({
        checked: 4,
        items: [{
          organizationId: 'org2', organizationName: 'Auditores Sur', subscriptionId: 'sub2', planName: 'Plus',
          decision: { kind: 'STORAGE_80', percent: 85, used: 8.5 * GB, capacity: 10 * GB, remaining: 1.5 * GB },
          key: { kind: 'STORAGE_80', capacityGb: 10 }, since: new Date(),
          text: { subject: 'Usaste el 85 % de tu espacio en Nova Criterio', paragraphs: ['texto privado'], heading: 'h', title: 't', body: 'b', level: 'warning', notificationType: 'Y' },
        }],
      })),
    };
    const settings = { get: jest.fn(async () => ({ enforcementMode: 'OBSERVE', reminderDays: [7, 1] })) };
    const controller = new BillingAdminController({} as any, {} as any, settings as any, {} as any, {} as any, reminders as any, usageAlerts as any);
    return { controller, reminders, usageAlerts, settings };
  };

  it('junta los avisos de vencimiento y los de uso, con el modo y los días configurados', async () => {
    const { controller } = build();
    const r = await controller.remindersPreview();
    expect(r.mode).toBe('OBSERVE');
    expect(r.reminderDays).toEqual([7, 1]);
    expect(r.checked).toBe(4);
    expect(r.items).toEqual([{
      organizationId: 'org1', organizationName: 'Despacho Norte', planName: 'Despacho', kind: 'EXPIRING', days: 7,
      endsAt: new Date('2026-12-01T00:00:00Z'), subject: 'Tu licencia de Nova Criterio vence en 5 días',
    }]);
    expect(r.usage).toEqual({
      checked: 4,
      items: [{ organizationId: 'org2', organizationName: 'Auditores Sur', planName: 'Plus', kind: 'STORAGE_80', percent: 85, subject: 'Usaste el 85 % de tu espacio en Nova Criterio' }],
    });
  });

  it('no filtra el texto completo de los correos ni datos internos del reclamo', async () => {
    const { controller } = build();
    const json = JSON.stringify(await controller.remindersPreview());
    expect(json).not.toContain('texto privado');
    expect(json).not.toContain('subscriptionId');
    expect(json).not.toContain('capacityGb');
  });

  it('un aviso sin día configurado (gracia, solo lectura) sale con days null', async () => {
    const { controller, reminders } = build();
    reminders.preview.mockResolvedValueOnce({
      checked: 1,
      items: [{ organizationId: 'o', organizationName: 'N', subscriptionId: 's', planName: 'P', decision: { kind: 'GRACE' }, endsAt: new Date(), text: { subject: 'x' } }],
    } as any);
    expect((await controller.remindersPreview()).items[0]).toMatchObject({ kind: 'GRACE', days: null });
  });

  it('solo lee: no envía ni escribe (llama únicamente a las vistas previas)', async () => {
    const { controller, reminders, usageAlerts } = build();
    await controller.remindersPreview();
    expect(reminders.preview).toHaveBeenCalledTimes(1);
    expect(usageAlerts.preview).toHaveBeenCalledTimes(1);
    expect(Object.keys(reminders)).toEqual(['preview']);
    expect(Object.keys(usageAlerts)).toEqual(['preview']);
  });
});
