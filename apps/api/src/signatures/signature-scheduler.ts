import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { decryptSecret } from '../common/utils/signing-key.util';
import { SignatureAdapterRegistry } from './signature-documents';
import { SignatureEventsService, TX_OPTIONS } from './signature-events.service';
import { SignaturePolicyService } from './signature-policy.service';
import { SignatureSealingService } from './signature-sealing.service';
import { SignatureAttachmentsService } from './signature-attachments.service';

const ACTIVE = ['PENDING', 'VIEWED'] as const;
const REMINDER_BEFORE_MS = 3 * 24 * 3600 * 1000;
const fmtDeadline = (d: Date) => new Intl.DateTimeFormat('es-SV', { timeZone: 'America/El_Salvador', dateStyle: 'long' }).format(d);

/**
 * Tareas programadas de la firma por enlace (§10, §13). Cada tarea tiene su guardia contra ejecuciones
 * superpuestas (lección #35: un cron sin guardia corrompió datos reales). Con la firma apagada no hacen nada.
 */
@Injectable()
export class SignatureScheduler {
  private readonly logger = new Logger(SignatureScheduler.name);
  private readonly running = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: SignatureEventsService,
    private readonly sealing: SignatureSealingService,
    private readonly attachments: SignatureAttachmentsService,
    private readonly policy: SignaturePolicyService,
    private readonly email: EmailService,
    private readonly registry: SignatureAdapterRegistry,
  ) {}

  private async once(name: string, fn: () => Promise<void>): Promise<void> {
    if (!this.policy.isEnabled() || this.running.has(name)) return;
    this.running.add(name);
    try { await fn(); }
    catch (err) { this.logger.error(`Tarea «${name}» falló: ${(err as Error).message}`); }
    finally { this.running.delete(name); }
  }

  /** Sellado pendiente y sello de tiempo pendiente. */
  @Cron('*/10 * * * *', { name: 'signatures-seal' })
  sealPending() {
    return this.once('seal', async () => { await this.sealing.runPending(); });
  }

  /** Marca como vencidas las solicitudes activas cuya fecha pasó. */
  @Cron('5 * * * *', { name: 'signatures-expire' })
  expire() { return this.once('expire', () => this.expireDue().then(() => undefined)); }

  async expireDue(now = new Date()): Promise<number> {
    const due = await this.prisma.signatureRequest.findMany({
      where: { status: { in: [...ACTIVE] }, expiresAt: { lte: now } }, take: 100,
    });
    let n = 0;
    for (const r of due) {
      const closed = await this.prisma.$transaction(async (tx) => {
        await this.events.lock(tx, r.id);
        const res = await tx.signatureRequest.updateMany({ where: { id: r.id, status: { in: [...ACTIVE] }, expiresAt: { lte: now } }, data: { status: 'EXPIRED', otpHash: null, otpExpiresAt: null } });
        if (res.count === 0) return false;
        await tx.signatureSession.updateMany({ where: { requestId: r.id, revokedAt: null }, data: { revokedAt: now } });
        await this.events.append(tx, r.id, { type: 'EXPIRED', detail: { expiresAt: r.expiresAt.toISOString() } });
        return true;
      }, TX_OPTIONS);
      if (closed) { n++; await this.attachments.purgeUnsubmitted(r.id).catch(() => undefined); }
    }
    return n;
  }

  /** Recordatorio único, 3 días antes del vencimiento (con el MISMO enlace; el token se descifra del registro). */
  @Cron('15 * * * *', { name: 'signatures-reminders' })
  reminders() { return this.once('reminders', () => this.sendReminders().then(() => undefined)); }

  async sendReminders(now = new Date()): Promise<number> {
    const rows = await this.prisma.signatureRequest.findMany({
      where: {
        status: { in: [...ACTIVE] }, reminderEnabled: true, reminderSentAt: null,
        expiresAt: { gt: now, lte: new Date(now.getTime() + REMINDER_BEFORE_MS) },
        // No recordar de inmediato una solicitud corta recién creada.
        createdAt: { lte: new Date(now.getTime() - 24 * 3600 * 1000) },
      },
      take: 50,
    });
    let sent = 0;
    for (const r of rows) {
      try {
        await this.policy.assertDailyEmailCap(r.organizationId);
        const token = decryptSecret(r.tokenEncrypted, this.policy.encryptionKey());
        const [org, creator] = await Promise.all([
          this.prisma.organization.findUniqueOrThrow({ where: { id: r.organizationId }, select: { name: true } }),
          this.prisma.user.findUnique({ where: { id: r.createdById }, select: { name: true, email: true } }),
        ]);
        const res = await this.email.sendSignatureReminder(r.signerEmail, {
          orgName: org.name, documentLabel: this.registry.find(r.documentType)?.label ?? 'Documento', title: r.title,
          senderName: creator?.name ?? org.name, deadline: fmtDeadline(r.expiresAt), token, replyTo: creator?.email,
        });
        if (!res.sent) continue;
        await this.prisma.$transaction(async (tx) => {
          await tx.signatureRequest.update({ where: { id: r.id }, data: { reminderSentAt: now } });
          await this.events.append(tx, r.id, { type: 'REMINDER_SENT' });
        }, TX_OPTIONS);
        sent++;
      } catch (err) {
        this.logger.warn(`Recordatorio de ${r.id} no enviado: ${(err as Error).message}`);
      }
    }
    return sent;
  }

  /** Limpieza diaria: sesiones vencidas y adjuntos que nunca se enviaron. */
  @Cron('30 3 * * *', { name: 'signatures-purge' })
  purge() { return this.once('purge', () => this.purgeStale().then(() => undefined)); }

  async purgeStale(now = new Date()): Promise<{ sessions: number; attachments: number }> {
    const dayAgo = new Date(now.getTime() - 24 * 3600 * 1000);
    const sessions = await this.prisma.signatureSession.deleteMany({ where: { expiresAt: { lt: dayAgo } } });
    // Solo de solicitudes ya cerradas: en una activa, el firmante puede haber subido un archivo y volver mañana.
    const stale = await this.prisma.signatureAttachment.findMany({
      where: { submitted: false, createdAt: { lt: dayAgo }, request: { status: { notIn: [...ACTIVE] } } },
      select: { requestId: true },
    });
    let attachments = 0;
    for (const requestId of new Set(stale.map((s) => s.requestId))) attachments += await this.attachments.purgeUnsubmitted(requestId);
    return { sessions: sessions.count, attachments };
  }
}
