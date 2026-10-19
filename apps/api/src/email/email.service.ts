/**
 * EmailService — envío transaccional vía Resend
 *
 * Comportamiento:
 * - Si RESEND_API_KEY no está configurada → modo "no-op" (loguea pero no envía).
 *   Permite que dev funcione sin credenciales y prod sin downtime si Resend cae.
 * - Cualquier error de envío se captura y se loguea — NO interrumpe el flujo del caller.
 * - Templates HTML con estilo consistente AuditMind.
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

export interface SendEmailInput {
  to:       string | string[];
  subject:  string;
  /** HTML completo o body que se envuelve con renderEmailLayout */
  html?:    string;
  /** Plain text fallback (opcional) */
  text?:    string;
  /** Para envoltorio automático: si se pasa, se usa renderEmailLayout */
  body?: {
    heading?:    string;
    paragraphs?: string[];
    ctaLabel?:   string;
    ctaUrl?:     string;
    footer?:     string;
  };
  /** Si se omite, usa EMAIL_FROM default */
  from?:    string;
  /** Reply-To header */
  replyTo?: string;
}

export interface SendEmailResult {
  sent:    boolean;
  emailId: string | null;
  error?:  string;
}

/** Escapa texto que viene de usuarios antes de meterlo en HTML de correo. */
export function escHtml(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly client: Resend | null;
  private readonly defaultFrom: string;
  private readonly enabled: boolean;
  private readonly appUrl:  string;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('RESEND_API_KEY');
    this.defaultFrom = this.config.get<string>('EMAIL_FROM', 'AuditMind <onboarding@resend.dev>');
    // WEB_URL no existe en el env de producción (solo APP_URL, que sí define ecosystem.config.cjs):
    // sin este fallback los links de los correos (CTA) saldrían como http://localhost:3000/...
    this.appUrl      = (this.config.get<string>('WEB_URL')
      ?? this.config.get<string>('APP_URL')
      ?? 'http://localhost:3000').replace(/\/+$/, '');
    this.enabled     = !!apiKey;

    if (this.enabled) {
      this.client = new Resend(apiKey);
      this.logger.log(`[Email] Resend client initialized (from: ${this.defaultFrom})`);
    } else {
      this.client = null;
      this.logger.warn('[Email] RESEND_API_KEY not set — emails will be logged but NOT sent');
    }
  }

  // ─── Public API ──────────────────────────────────────────────────────────

  async send(input: SendEmailInput): Promise<SendEmailResult> {
    const html = input.html ?? this.renderEmailLayout(input.body ?? {});
    const to = Array.isArray(input.to) ? input.to : [input.to];

    // No-op mode (no API key configured)
    if (!this.enabled || !this.client) {
      this.logger.log(`[Email::DRY-RUN] To: ${to.join(', ')} | Subject: "${input.subject}"`);
      return { sent: false, emailId: null, error: 'RESEND_API_KEY not configured' };
    }

    try {
      const res = await this.client.emails.send({
        from:     input.from    ?? this.defaultFrom,
        to,
        subject:  input.subject.replace(/[\r\n]+/g, ' '),
        html,
        text:     input.text,
        replyTo:  input.replyTo,
      });

      if (res.error) {
        this.logger.error(`[Email] Resend error: ${res.error.message}`);
        return { sent: false, emailId: null, error: res.error.message };
      }

      this.logger.log(`[Email] Sent to ${to.join(', ')}: "${input.subject}" (id=${res.data?.id})`);
      return { sent: true, emailId: res.data?.id ?? null };
    } catch (err) {
      const msg = (err as Error).message ?? 'Unknown error';
      this.logger.error(`[Email] Send failed: ${msg}`);
      return { sent: false, emailId: null, error: msg };
    }
  }

  // ─── Layout HTML ─────────────────────────────────────────────────────────

  /** Default email layout — AuditMind branded */
  renderEmailLayout(opts: {
    heading?:    string;
    paragraphs?: string[];
    ctaLabel?:   string;
    ctaUrl?:     string;
    footer?:     string;
  }): string {
    const heading = escHtml(opts.heading ?? '');
    const paragraphs = opts.paragraphs ?? [];
    const footer = escHtml(opts.footer ?? 'AuditMind · Plataforma de Auditoría Inteligente');

    const ctaOk = !!opts.ctaLabel && !!opts.ctaUrl && /^https?:\/\//i.test(opts.ctaUrl);
    const ctaBlock = ctaOk ? `
      <tr>
        <td align="center" style="padding: 24px 0 8px 0;">
          <a href="${escHtml(opts.ctaUrl)}" target="_blank"
             style="display: inline-block; background: #0F2D4A; color: #ffffff;
                    padding: 12px 28px; border-radius: 12px; text-decoration: none;
                    font-weight: 600; font-size: 14px;">
            ${escHtml(opts.ctaLabel)}
          </a>
        </td>
      </tr>` : '';

    const paragraphsHtml = paragraphs.map(p =>
      `<p style="margin: 0 0 14px 0; color: #4a5568; font-size: 14px; line-height: 1.6;">${p}</p>`
    ).join('\n');

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${heading}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #F0F4F8; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #F0F4F8; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table cellpadding="0" cellspacing="0" border="0" width="560"
               style="background-color: #ffffff; border-radius: 16px; box-shadow: 0 4px 16px rgba(15,45,74,0.08); overflow: hidden;">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #0F2D4A 0%, #1a4a7a 100%); padding: 24px 32px;">
              <table cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="color: #ffffff; font-size: 18px; font-weight: 700; letter-spacing: -0.3px;">
                    AuditMind
                  </td>
                  <td align="right" style="color: rgba(255,255,255,0.65); font-size: 11px; font-weight: 500; text-transform: uppercase; letter-spacing: 1px;">
                    Notificación
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding: 32px;">
              ${heading ? `<h1 style="margin: 0 0 16px 0; color: #1a202c; font-size: 20px; font-weight: 700; line-height: 1.3;">${heading}</h1>` : ''}
              ${paragraphsHtml}
            </td>
          </tr>
          ${ctaBlock}
          <!-- Footer -->
          <tr>
            <td style="background-color: #F7FAFC; padding: 20px 32px; border-top: 1px solid #E2E8F0;">
              <p style="margin: 0; color: #718096; font-size: 11px; line-height: 1.5;">
                ${footer}
              </p>
              <p style="margin: 6px 0 0 0; color: #A0AEC0; font-size: 10px;">
                Este mensaje fue enviado automáticamente. Si recibiste este correo por error, simplemente ignóralo.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  }

  // ─── High-level helpers para casos comunes ───────────────────────────────

  /** Notificación de hallazgo asignado a un responsable */
  async sendFindingAssigned(to: string, params: {
    findingTitle: string;
    severity:     string;
    auditTitle:   string;
    dueDate?:     string;
    findingId:    string;
  }) {
    return this.send({
      to,
      subject: `🎯 Hallazgo asignado: ${escHtml(params.findingTitle)}`,
      body: {
        heading: 'Se te asignó un hallazgo nuevo',
        paragraphs: [
          `Has sido designado/a como responsable de remediar un hallazgo en la auditoría <strong>${escHtml(params.auditTitle)}</strong>.`,
          `<strong>Hallazgo:</strong> ${escHtml(params.findingTitle)}<br/><strong>Severidad:</strong> ${escHtml(params.severity)}${params.dueDate ? `<br/><strong>Fecha límite:</strong> ${escHtml(params.dueDate)}` : ''}`,
        ],
        ctaLabel: 'Ver hallazgo',
        ctaUrl:   `${this.appUrl}/dashboard/findings/${params.findingId}`,
      },
    });
  }

  /** Invitación al portal PBC para un auditado externo */
  async sendPbcInvite(to: string, params: {
    auditeeName:   string;
    auditTitle:    string;
    requestCount:  number;
    portalUrl:     string;
  }) {
    return this.send({
      to,
      subject: `📋 ${escHtml(params.auditTitle)}: ${params.requestCount} solicitud(es) de información`,
      body: {
        heading: `Hola ${params.auditeeName}`,
        paragraphs: [
          `Tienes <strong>${params.requestCount} solicitud${params.requestCount > 1 ? 'es' : ''} de información</strong> pendiente${params.requestCount > 1 ? 's' : ''} en la auditoría <strong>${escHtml(params.auditTitle)}</strong>.`,
          `Por favor accede al portal PBC para revisar las solicitudes y cargar los soportes correspondientes. El portal es seguro y no requiere registro adicional.`,
        ],
        ctaLabel: 'Abrir portal',
        ctaUrl:   params.portalUrl,
      },
    });
  }

  /** Notificación de papel listo para sign-off (revisor) */
  async sendPaperReadyForReview(to: string, params: {
    paperCode:  string;
    paperTitle: string;
    auditTitle: string;
    preparedBy: string;
    paperId:    string;
  }) {
    return this.send({
      to,
      subject: `✍ Papel listo para revisión: ${escHtml(params.paperCode)}`,
      body: {
        heading: 'Papel de trabajo enviado a revisión',
        paragraphs: [
          `<strong>${escHtml(params.preparedBy)}</strong> envió a revisión el papel <strong>${escHtml(params.paperCode)} — ${escHtml(params.paperTitle)}</strong> de la auditoría <strong>${escHtml(params.auditTitle)}</strong>.`,
          'Revisa el contenido, deja comentarios donde corresponda, y firma para aprobar.',
        ],
        ctaLabel: 'Revisar papel',
        ctaUrl:   `${this.appUrl}/dashboard/working-papers/${params.paperId}`,
      },
    });
  }

  /** Alerta de Finding generado automáticamente (Benford / COSO / Pruebas IA) */
  async sendAutoFindingAlert(to: string, params: {
    findingTitle: string;
    severity:     string;
    source:       string; // "Análisis Benford" | "Evaluación COSO" | etc.
    auditTitle:   string;
    findingId:    string;
  }) {
    return this.send({
      to,
      subject: `⚠ Hallazgo automático detectado: ${params.findingTitle}`,
      body: {
        heading: 'Pruebas IA detectaron un hallazgo potencial',
        paragraphs: [
          `<strong>Fuente:</strong> ${escHtml(params.source)}<br/><strong>Auditoría:</strong> ${escHtml(params.auditTitle)}<br/><strong>Severidad:</strong> ${escHtml(params.severity)}`,
          `Se ha creado un borrador de hallazgo automáticamente. Por favor revisa, ajusta la narrativa y aprueba para incluirlo en el informe.`,
        ],
        ctaLabel: 'Revisar hallazgo',
        ctaUrl:   `${this.appUrl}/dashboard/findings/${params.findingId}`,
      },
    });
  }

  /** Confirmación externa (NIA 505) enviada al confirmante */
  async sendConfirmationRequest(to: string, params: {
    auditTitle:    string;
    auditedEntity: string;
    confirmType:   string;
    deadline:      string;
    confirmUrl:    string;
  }) {
    return this.send({
      to,
      subject: `🔐 Solicitud de confirmación: ${escHtml(params.auditedEntity)}`,
      body: {
        heading: 'Solicitud de Confirmación Externa (NIA 505)',
        paragraphs: [
          `En el marco de la auditoría de <strong>${escHtml(params.auditedEntity)}</strong>, solicitamos su confirmación sobre <strong>${escHtml(params.confirmType)}</strong>.`,
          `Por favor acceda al enlace seguro y registre su respuesta antes del <strong>${escHtml(params.deadline)}</strong>.`,
          'Esta solicitud cumple con la Norma Internacional de Auditoría 505 sobre Confirmaciones Externas.',
        ],
        ctaLabel: 'Responder confirmación',
        ctaUrl:   params.confirmUrl,
      },
    });
  }

  // ─── Firma electrónica simple por enlace (docs/firma-externa-por-enlace.md §13) ─
  // Todo valor que viene de un usuario o de un tercero se escapa con escHtml. El token va en el
  // FRAGMENTO de la URL (#), nunca en la ruta ni en la query: no llega a logs ni a cabeceras Referer.

  /** Enlace de firma. El token en claro solo existe en el correo y en esta URL. */
  signUrl(token: string): string { return `${this.appUrl}/firmar#${token}`; }
  /** Enlace del portal PBC del auditado. Igual que la firma: el token va en el FRAGMENTO (#), nunca en la ruta. */
  portalUrl(token: string): string { return `${this.appUrl}/portal#${token}`; }
  /** Página pública de verificación de un documento firmado. */
  verifyUrl(): string { return `${this.appUrl}/verificar`; }
  panelUrl(path: string): string { return `${this.appUrl}${path.startsWith('/') ? path : `/${path}`}`; }

  private signatureInvitation(
    to: string,
    p: { orgName: string; documentLabel: string; title: string; senderName: string; deadline: string; token: string; replyTo?: string },
    reminder: boolean,
  ) {
    return this.send({
      to,
      replyTo: p.replyTo,
      subject: `${reminder ? 'Recordatorio: firma pendiente' : 'Firma pendiente'}: ${p.title}`,
      body: {
        heading: reminder ? 'Te recordamos que tienes un documento por firmar' : 'Tienes un documento para firmar',
        paragraphs: [
          `<strong>${escHtml(p.orgName)}</strong> te envió el documento «${escHtml(p.title)}» (${escHtml(p.documentLabel)}) para tu firma electrónica.`,
          `Enviado por: ${escHtml(p.senderName)}<br/>Fecha límite: <strong>${escHtml(p.deadline)}</strong>`,
          'Por seguridad, antes de ver el documento te pediremos un código de verificación que enviaremos a este mismo correo. El enlace es personal: no lo compartas.',
        ],
        ctaLabel: 'Revisar y firmar',
        ctaUrl: this.signUrl(p.token),
      },
    });
  }

  /** Invitación a firmar. */
  sendSignatureRequest(
    to: string,
    p: { orgName: string; documentLabel: string; title: string; senderName: string; deadline: string; token: string; replyTo?: string },
  ) {
    return this.signatureInvitation(to, p, false);
  }

  /** Recordatorio (3 días antes del vencimiento): mismo enlace, no se rota el token. */
  sendSignatureReminder(
    to: string,
    p: { orgName: string; documentLabel: string; title: string; senderName: string; deadline: string; token: string; replyTo?: string },
  ) {
    return this.signatureInvitation(to, p, true);
  }

  /** Código de verificación. El código va en el cuerpo, NUNCA en el asunto. */
  sendSignatureOtp(to: string, p: { orgName: string; code: string }) {
    return this.send({
      to,
      subject: 'Tu código de verificación de AuditMind',
      body: {
        heading: 'Tu código de verificación',
        paragraphs: [
          `Usa este código para continuar con la firma del documento de <strong>${escHtml(p.orgName)}</strong>:`,
          `<span style="display:inline-block;font-size:30px;font-weight:700;letter-spacing:8px;color:#0F2D4A;">${escHtml(p.code)}</span>`,
          'El código vence en 10 minutos. Si no lo pediste, ignora este correo: sin el código nadie puede ver ni firmar el documento.',
        ],
      },
    });
  }

  /** Constancia para el firmante cuando su firma quedó registrada. */
  sendSignatureCompleted(to: string, p: { orgName: string; title: string; verificationCode: string; signedAt: string }) {
    return this.send({
      to,
      subject: `Tu firma quedó registrada: ${p.title}`,
      body: {
        heading: 'Tu firma quedó registrada',
        paragraphs: [
          `Firmaste «${escHtml(p.title)}» de <strong>${escHtml(p.orgName)}</strong> el ${escHtml(p.signedAt)}.`,
          `Código de verificación del documento:<br/><span style="font-size:20px;font-weight:700;letter-spacing:2px;color:#0F2D4A;">${escHtml(p.verificationCode)}</span>`,
          'Puedes descargar una copia firmada desde el mismo enlace que recibiste, durante los próximos 30 días (se te pedirá un código de verificación). Cualquier persona puede comprobar la autenticidad del documento con el código de arriba.',
        ],
        ctaLabel: 'Verificar documento',
        ctaUrl: this.verifyUrl(),
      },
    });
  }

  /** Aviso al equipo cuando el firmante firma o rechaza. */
  sendSignatureOutcome(
    to: string,
    p: { title: string; signerName: string; signerEmail: string; outcome: 'SIGNED' | 'DECLINED'; reason?: string; panelPath: string },
  ) {
    const signed = p.outcome === 'SIGNED';
    return this.send({
      to,
      subject: `${signed ? 'Firma recibida' : 'Firma rechazada'}: ${p.title}`,
      body: {
        heading: signed ? 'Se recibió una firma' : 'El firmante rechazó firmar',
        paragraphs: [
          `<strong>${escHtml(p.signerName)}</strong> (${escHtml(p.signerEmail)}) ${signed ? 'firmó' : 'no firmó'} «${escHtml(p.title)}».`,
          ...(!signed && p.reason ? [`<strong>Motivo:</strong> ${escHtml(p.reason)}`] : []),
          ...(signed ? ['El documento se está sellando; en unos minutos tendrás la copia firmada disponible.'] : []),
        ],
        ctaLabel: 'Ver en AuditMind',
        ctaUrl: this.panelUrl(p.panelPath),
      },
    });
  }

  /** El sellado falló tras todos los reintentos. */
  sendSignatureSealFailed(to: string, p: { title: string; panelPath: string }) {
    return this.send({
      to,
      subject: `Acción requerida: sellado pendiente de «${p.title}»`,
      body: {
        heading: 'No se pudo sellar el documento firmado',
        paragraphs: [
          `La firma de «${escHtml(p.title)}» quedó registrada, pero no se pudo generar el PDF sellado después de varios intentos.`,
          'Abre el documento en AuditMind y usa «Reintentar sellado». Si el problema persiste, avisa al administrador.',
        ],
        ctaLabel: 'Abrir en AuditMind',
        ctaUrl: this.panelUrl(p.panelPath),
      },
    });
  }

  /** El PDF original cambió después de enviarse: la firma se detuvo. */
  sendSignatureIntegrityAlert(to: string, p: { title: string; panelPath: string }) {
    return this.send({
      to,
      subject: `Alerta de integridad: «${p.title}»`,
      body: {
        heading: 'El documento no pudo verificarse',
        paragraphs: [
          `Alguien intentó firmar «${escHtml(p.title)}», pero la huella del PDF guardado no coincide con la que se calculó al enviarlo, así que la firma no se aceptó.`,
          'Revisa el documento y la bitácora en AuditMind; revoca la solicitud y envía una nueva.',
        ],
        ctaLabel: 'Abrir en AuditMind',
        ctaUrl: this.panelUrl(p.panelPath),
      },
    });
  }

  /** El enlace quedó bloqueado por demasiados códigos incorrectos (posible intento de adivinarlo). */
  sendSignatureLockedAlert(to: string, p: { title: string; signerEmail: string; panelPath: string }) {
    return this.send({
      to,
      subject: `Enlace de firma bloqueado: «${p.title}»`,
      body: {
        heading: 'El enlace de firma se bloqueó',
        paragraphs: [
          `El enlace que enviaste a ${escHtml(p.signerEmail)} para firmar «${escHtml(p.title)}» recibió demasiados códigos de verificación incorrectos y quedó bloqueado.`,
          'Puede ser un error de la persona o un intento de adivinar el código. Confirma con ella antes de usar «Reenviar», que genera un enlace nuevo.',
        ],
        ctaLabel: 'Abrir en AuditMind',
        ctaUrl: this.panelUrl(p.panelPath),
      },
    });
  }

  /** Email de prueba — útil para verificar configuración */
  async sendTestEmail(to: string) {
    return this.send({
      to,
      subject: '✅ Test de email AuditMind',
      body: {
        heading: 'Tu configuración Resend funciona',
        paragraphs: [
          'Este es un email de prueba enviado desde AuditMind.',
          `Si lo recibiste, tu integración con Resend está correctamente configurada.`,
        ],
      },
    });
  }
}
