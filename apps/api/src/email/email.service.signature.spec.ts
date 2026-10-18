import { EmailService } from './email.service';

const MAL = '<img src=x onerror=alert(1)>"\'';
const TOKEN = 'T'.repeat(43);

function service() {
  const svc = new EmailService({ get: (k: string, d?: string) => (k === 'APP_URL' ? 'https://auditoria.ianovatechsystems.com' : d) } as never);
  const sent: Array<{ to: string; subject: string; replyTo?: string; html: string }> = [];
  jest.spyOn(svc, 'send').mockImplementation(async (input) => {
    sent.push({ to: String(input.to), subject: input.subject, replyTo: input.replyTo, html: svc.renderEmailLayout(input.body ?? {}) });
    return { sent: true, emailId: 'x' };
  });
  return { svc, sent };
}

describe('correos de firma por enlace', () => {
  it('la invitación lleva el token en el fragmento, nunca en la ruta ni en la query', async () => {
    const { svc, sent } = service();
    await svc.sendSignatureRequest('a@b.co', { orgName: 'Org', documentLabel: 'Carta', title: 'T', senderName: 'S', deadline: '1 nov', token: TOKEN, replyTo: 'auditor@org.com' });
    expect(sent[0].html).toContain(`https://auditoria.ianovatechsystems.com/firmar#${TOKEN}`);
    expect(sent[0].html).not.toMatch(/firmar\?/);
    expect(sent[0].html).not.toMatch(/firmar\/T{5}/);
    expect(sent[0].replyTo).toBe('auditor@org.com');
  });

  it('escapa todo lo que viene de usuarios en todas las plantillas', async () => {
    const { svc, sent } = service();
    await svc.sendSignatureRequest('a@b.co', { orgName: MAL, documentLabel: MAL, title: MAL, senderName: MAL, deadline: MAL, token: TOKEN });
    await svc.sendSignatureReminder('a@b.co', { orgName: MAL, documentLabel: MAL, title: MAL, senderName: MAL, deadline: MAL, token: TOKEN });
    await svc.sendSignatureCompleted('a@b.co', { orgName: MAL, title: MAL, verificationCode: MAL, signedAt: MAL });
    await svc.sendSignatureOutcome('a@b.co', { title: MAL, signerName: MAL, signerEmail: MAL, outcome: 'DECLINED', reason: MAL, panelPath: '/dashboard' });
    await svc.sendSignatureSealFailed('a@b.co', { title: MAL, panelPath: '/dashboard' });
    await svc.sendSignatureIntegrityAlert('a@b.co', { title: MAL, panelPath: '/dashboard' });
    await svc.sendSignatureOtp('a@b.co', { orgName: MAL, code: '123456' });
    expect(sent).toHaveLength(7);
    for (const m of sent) {
      expect(m.html).not.toContain('<img src=x');
      expect(m.html).not.toContain('onerror=alert(1)>');
    }
  });

  it('el código de verificación va en el cuerpo y NO en el asunto', async () => {
    const { svc, sent } = service();
    await svc.sendSignatureOtp('a@b.co', { orgName: 'Org', code: '482913' });
    expect(sent[0].html).toContain('482913');
    expect(sent[0].subject).not.toContain('482913');
    expect(sent[0].subject).not.toMatch(/\d{6}/);
  });

  it('el recordatorio reutiliza el mismo enlace y se distingue en el asunto', async () => {
    const { svc, sent } = service();
    await svc.sendSignatureReminder('a@b.co', { orgName: 'Org', documentLabel: 'Carta', title: 'T', senderName: 'S', deadline: '1 nov', token: TOKEN });
    expect(sent[0].subject).toMatch(/^Recordatorio/);
    expect(sent[0].html).toContain(`/firmar#${TOKEN}`);
  });

  it('el aviso al equipo apunta a una página interna y muestra el motivo del rechazo', async () => {
    const { svc, sent } = service();
    await svc.sendSignatureOutcome('a@b.co', { title: 'T', signerName: 'Ana', signerEmail: 'ana@x.com', outcome: 'DECLINED', reason: 'No estoy de acuerdo', panelPath: '/dashboard/confirmations/abc' });
    expect(sent[0].html).toContain('No estoy de acuerdo');
    expect(sent[0].html).toContain('https://auditoria.ianovatechsystems.com/dashboard/confirmations/abc');
    expect(sent[0].subject).toMatch(/^Firma rechazada/);
  });
});
