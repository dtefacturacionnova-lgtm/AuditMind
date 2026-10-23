import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { HoursCloseService } from './hours-close.service';
import { businessDaysOf, previousPeriod, reminderAlreadySent, reminderKey, todayInSalvador } from './hours-close.calendar';
import { loadHolidaySet, periodKeyOf, periodRange } from './hours-close.util';

/** Días hábiles de margen para enviar una etapa que se perdió porque el servidor no corrió a la hora. */
const CATCH_UP_DAYS = 3;

/**
 * Recordatorios del cierre de horas por correo. Solo actúa en las organizaciones que activaron el cierre.
 *  · Etapa 1: el primer día hábil del mes, a quienes tienen días sin horas del mes anterior.
 *  · Etapa 2: el día del plazo del auditor, a quienes todavía no completan.
 * Si el servidor no corrió ese día, la etapa sale en los siguientes días hábiles (hasta CATCH_UP_DAYS).
 * `lastReminderPeriod` guarda la última etapa enviada ('AAAA-MM#etapa'), así que un reinicio o una segunda
 * ejecución no repite el correo. Guardia contra ejecuciones superpuestas (lección #35).
 */
@Injectable()
export class HoursCloseScheduler {
  private readonly logger = new Logger(HoursCloseScheduler.name);
  private running = false;

  constructor(private readonly prisma: PrismaService, private readonly service: HoursCloseService) {}

  /** Todos los días a las 14:00 UTC (8:00 en El Salvador). */
  @Cron('0 14 * * *', { name: 'hours-close-reminders' })
  async run(now: Date = new Date()): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const orgs = await this.prisma.hoursCloseSettings.findMany({ where: { enabled: true } });
      for (const settings of orgs) {
        try { await this.remindOrganization(settings, now); }
        catch (err) { this.logger.error(`Recordatorios de ${settings.organizationId} fallaron: ${(err as Error).message}`); }
      }
    } finally { this.running = false; }
  }

  async remindOrganization(
    settings: { organizationId: string; entryDeadlineDay: number; lastReminderPeriod: string | null }, now: Date,
  ): Promise<'sent' | 'skipped'> {
    const today = todayInSalvador(now);
    const current = periodKeyOf(today);
    const previous = previousPeriod(current);
    // Con los feriados recurrentes aplicados, igual que Capacidad.
    const holidaySet = await loadHolidaySet(this.prisma, settings.organizationId, periodRange(current));
    const days = businessDaysOf(current, holidaySet);
    const todayIdx = days.indexOf(today);
    if (todayIdx < 0) return 'skipped'; // fin de semana o feriado

    // Cada etapa sale en su día hábil o, si ese día el servidor estaba caído, en los CATCH_UP_DAYS días hábiles siguientes.
    // La del plazo manda sobre la del primer día (con plazo = día 1, la etapa 2 no puede quedar tapada).
    const dueOn = (idx: number) => todayIdx >= idx && todayIdx <= idx + CATCH_UP_DAYS;
    const deadlineIdx = Math.min(Math.max(settings.entryDeadlineDay, 1), days.length) - 1;
    const stage: 1 | 2 | null = dueOn(deadlineIdx) ? 2 : dueOn(0) ? 1 : null;
    if (!stage) return 'skipped';
    const key = reminderKey(previous, stage);
    if (reminderAlreadySent(settings.lastReminderPeriod, key)) return 'skipped';

    // Los recordatorios los dispara el sistema, no una persona: se actúa con rol de dirección sobre la organización.
    await this.service.sendReminders({ id: 'system', role: 'CAE', organizationId: settings.organizationId }, previous, stage);
    await this.prisma.hoursCloseSettings.update({
      where: { organizationId: settings.organizationId }, data: { lastReminderPeriod: key },
    });
    return 'sent';
  }
}
