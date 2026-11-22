import { EmailService } from './email.service';

const MAL = '<img src=x onerror=alert(1)>"\'';

function service() {
  const svc = new EmailService({ get: (k: string, d?: string) => (k === 'APP_URL' ? 'https://auditoria.ianovatechsystems.com' : d) } as never);
  const sent: Array<{ to: string; subject: string; html: string }> = [];
  jest.spyOn(svc, 'send').mockImplementation(async (input) => {
    sent.push({ to: String(input.to), subject: input.subject, html: svc.renderEmailLayout(input.body ?? {}) });
    return { sent: true, emailId: 'x' };
  });
  return { svc, sent };
}

describe('correo de aviso de vencimiento del plan', () => {
  it('el botón lleva a «Mi plan» de la aplicación', async () => {
    const { svc, sent } = service();
    await svc.sendSubscriptionNotice('admin@despacho.test', { subject: 'Tu licencia vence mañana', heading: 'Tu licencia vence mañana', paragraphs: ['Texto.'] });
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe('admin@despacho.test');
    expect(sent[0].html).toContain('href="https://auditoria.ianovatechsystems.com/dashboard/billing"');
    expect(sent[0].html).toContain('Ver mi plan');
  });

  it('escapa los párrafos y el título: lo que viene del cliente (nombre de la organización o del plan) nunca llega como HTML', async () => {
    const { svc, sent } = service();
    await svc.sendSubscriptionNotice('admin@despacho.test', { subject: 'x', heading: MAL, paragraphs: [`Organización: ${MAL}`, `Plan: ${MAL}`] });
    expect(sent[0].html).not.toContain('<img src=x');
    expect(sent[0].html).not.toContain('onerror=alert(1)>');
    expect(sent[0].html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });
});
