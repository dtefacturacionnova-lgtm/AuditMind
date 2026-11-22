import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { NotificationsService } from '../notifications/notifications.service';
import { BillingSettingsService } from './billing-settings.service';
import { computeEntitlements } from './entitlements';
import { describeNotice, planNotice, type NoticeDecision, type NoticeText } from './billing-reminders';

export interface ReminderCandidate {
  organizationId: string;
  organizationName: string;
  subscriptionId: string;
  planName: string;
  decision: NoticeDecision;
  endsAt: Date;
  text: NoticeText;
}

export interface ReminderRunResult {
  mode: 'OFF' | 'OBSERVE' | 'ENFORCE';
  /** Suscripciones revisadas. */
  checked: number;
  /** Avisos que tocan hoy (con OBSERVE son los que se enviarían). */
  due: number;
  /** Avisos enviados de verdad (solo con ENFORCE). */
  sent: number;
  /** Correos que salieron / que fallaron o no se pudieron enviar. */
  emailed: number;
  emailFailed: number;
  /** Organizaciones donde otra corrida ya había enviado este aviso. */
  duplicates: number;
  errors: number;
}

/** Clave del candado de Postgres que serializa el reclamo de avisos de UNA organización (las pruebas lo toman para comprobar que se respeta). */
export const reminderLockKey = (organizationId: string) => `billing-reminder:${organizationId}`;

/** Roles que reciben los avisos de plan: quien administra la organización; si no hay, la dirección. */
const RECIPIENT_ROLES: Array<'ADMIN' | 'CAE'> = ['ADMIN', 'CAE'];

/**
 * Avisos de vencimiento del plan. Solo actúa con el cumplimiento en ENFORCE (con OBSERVE únicamente cuenta lo que enviaría; con OFF no
 * hace nada). Cada aviso se RECLAMA con un registro en `billing_events` dentro de una transacción con candado por organización, así que
 * un reinicio, una segunda corrida o dos servidores no envían el mismo aviso dos veces. El correo y la notificación van a quienes
 * administran la organización (ADMIN; si no hay, CAE).
 */
@Injectable()
export class BillingRemindersService {
  private readonly logger = new Logger(BillingRemindersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: BillingSettingsService,
    private readonly email: EmailService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Qué avisos tocan hoy, sin enviar ni escribir nada (la vista previa y el modo OBSERVE usan esto). */
  async preview(now: Date = new Date()): Promise<{ checked: number; items: ReminderCandidate[] }> {
    const settings = await this.settings.get();
    const subs = await this.prisma.billingSubscription.findMany({
      where: { exempt: false, status: { notIn: ['SUSPENDED', 'CANCELLED'] }, organization: { active: true } },
      include: { organization: { select: { id: true, name: true } } },
      take: 2000,
    });
    const items: ReminderCandidate[] = [];
    for (const sub of subs) {
      const ent = computeEntitlements(sub, settings, now);
      if (!ent.endsAt) continue;
      const decision = planNotice({
        status: ent.status, exempt: ent.exempt, endsAt: ent.endsAt, now, reminderDays: settings.reminderDays,
        periodStart: sub.status === 'TRIAL' ? sub.startedAt : (sub.currentPeriodStart ?? sub.startedAt),
      });
      if (!decision) continue;
      items.push({
        organizationId: sub.organizationId, organizationName: sub.organization.name, subscriptionId: sub.id, planName: ent.planName,
        decision, endsAt: ent.endsAt,
        text: describeNotice(decision, {
          orgName: sub.organization.name, planName: ent.planName, storedStatus: sub.status, endsAt: ent.endsAt,
          graceEndsAt: ent.graceEndsAt, readOnlyEndsAt: ent.readOnlyEndsAt, now,
        }),
      });
    }
    return { checked: subs.length, items };
  }

  async run(now: Date = new Date()): Promise<ReminderRunResult> {
    const settings = await this.settings.get();
    const result: ReminderRunResult = { mode: settings.enforcementMode, checked: 0, due: 0, sent: 0, emailed: 0, emailFailed: 0, duplicates: 0, errors: 0 };
    // Con el cumplimiento apagado no se le escribe a nadie: la plataforma se comporta como antes.
    if (settings.enforcementMode === 'OFF') return result;

    const { checked, items } = await this.preview(now);
    result.checked = checked;
    result.due = items.length;
    if (settings.enforcementMode === 'OBSERVE') {
      for (const it of items) this.logger.log(`[OBSERVE] se enviaría «${it.text.subject}» a ${it.organizationName} (${it.decision.kind}${it.decision.days ? ` ${it.decision.days} d` : ''})`);
      return result;
    }

    for (const item of items) {
      try {
        const r = await this.deliver(item, now);
        if (r === 'duplicate') result.duplicates++;
        else { result.sent++; result.emailed += r.emailed; result.emailFailed += r.failed; }
      } catch (err) {
        result.errors++;
        this.logger.error(`Aviso de ${item.organizationName} (${item.decision.kind}) falló: ${(err as Error).message}`);
      }
    }
    return result;
  }

  /** Reclama el aviso (una sola vez) y lo envía por correo y dentro de la aplicación. */
  async deliver(item: ReminderCandidate, now: Date): Promise<'duplicate' | { emailed: number; failed: number; recipients: number }> {
    const endsIso = item.endsAt.toISOString();
    const claim = await this.claim(item.organizationId, item.decision, endsIso);
    if (!claim) return 'duplicate';

    const recipients = await this.recipients(item.organizationId);
    let emailed = 0;
    let failed = 0;
    for (const to of recipients.map((r) => r.email)) {
      const res = await this.email.sendSubscriptionNotice(to, { subject: item.text.subject, heading: item.text.heading, paragraphs: item.text.paragraphs })
        .catch((err: Error) => ({ sent: false, error: err.message }));
      if (res.sent) emailed++; else failed++;
    }
    if (failed > 0) this.logger.warn(`Aviso ${item.decision.kind} de ${item.organizationName}: ${failed} correo(s) no salieron (¿RESEND_API_KEY sin configurar?). Quedó la notificación dentro de la aplicación.`);
    if (recipients.length === 0) this.logger.warn(`Aviso ${item.decision.kind} de ${item.organizationName}: la organización no tiene un ADMIN ni un CAE activo a quien avisar.`);

    await this.notifications.createBulk(recipients.map((r) => ({
      organizationId: item.organizationId, userId: r.id, type: item.text.notificationType, title: item.text.title, body: item.text.body,
      entityType: 'subscription', entityId: item.subscriptionId,
    })));
    await this.prisma.billingEvent.update({
      where: { id: claim.id },
      data: { data: { ...(claim.data as Record<string, unknown>), recipients: recipients.length, emailed, emailFailed: failed, at: now.toISOString() } },
    });
    return { emailed, failed, recipients: recipients.length };
  }

  /**
   * Reclamo atómico: dentro de una transacción con candado por organización, si no existe ya un registro de este aviso, lo crea.
   * (Misma fecha de vencimiento + mismo tipo [+ mismo día configurado] = mismo aviso.)
   */
  private async claim(organizationId: string, decision: NoticeDecision, endsIso: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${reminderLockKey(organizationId)}::text))`;
      const same: Prisma.BillingEventWhereInput[] = [
        { data: { path: ['kind'], equals: decision.kind } },
        { data: { path: ['endsAt'], equals: endsIso } },
        ...(decision.days !== undefined ? [{ data: { path: ['days'], equals: decision.days } }] : []),
      ];
      const existing = await tx.billingEvent.findFirst({ where: { organizationId, type: 'REMINDER_SENT', AND: same }, select: { id: true } });
      if (existing) return null;
      const data: Record<string, unknown> = { kind: decision.kind, endsAt: endsIso, ...(decision.days !== undefined && { days: decision.days }) };
      return tx.billingEvent.create({ data: { organizationId, actorId: null, type: 'REMINDER_SENT', data: data as Prisma.InputJsonValue } });
    }, { timeout: 15_000 });
  }

  /** ADMIN activos de la organización; si no hay ninguno, los CAE activos. */
  private async recipients(organizationId: string): Promise<Array<{ id: string; email: string }>> {
    for (const role of RECIPIENT_ROLES) {
      const users = await this.prisma.user.findMany({ where: { organizationId, role, active: true }, select: { id: true, email: true }, orderBy: { createdAt: 'asc' } });
      if (users.length > 0) return users;
    }
    return [];
  }
}
