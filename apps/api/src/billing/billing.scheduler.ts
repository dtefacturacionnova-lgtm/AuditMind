import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { remindersEnabled } from './billing-reminders';
import { BillingRemindersService } from './billing-reminders.service';
import { BillingUsageAlertsService } from './billing-usage-alerts.service';
import { PaymentsService } from './payments.service';

/**
 * Tareas programadas de planes y suscripciones:
 *  · Diaria: avisos de vencimiento y vencimiento de pagos pendientes.
 *  · Cada hora: avisos de uso (80 % y 100 % de las peticiones de IA y del espacio), para que quien llega al límite se entere pronto.
 *
 * Guardias:
 *  · Una sola corrida de cada tarea a la vez (lección #35: un cron sin guardia corrompió datos reales).
 *  · Solo corre en producción, o donde `BILLING_REMINDERS_ENABLED=true`. El desarrollo local comparte la base de datos con producción:
 *    sin esta guardia, un servidor de pruebas reclamaría avisos que producción debía enviar de verdad.
 *  · Los avisos además dependen del interruptor de cumplimiento (OFF no escribe a nadie; OBSERVE solo cuenta).
 */
@Injectable()
export class BillingScheduler {
  private readonly logger = new Logger(BillingScheduler.name);
  private running = false;
  private runningUsage = false;

  constructor(
    private readonly config: ConfigService,
    private readonly reminders: BillingRemindersService,
    private readonly payments: PaymentsService,
    private readonly usageAlerts: BillingUsageAlertsService,
  ) {}

  isEnabled(): boolean {
    return remindersEnabled(this.config.get<string>('BILLING_REMINDERS_ENABLED'), this.config.get<string>('NODE_ENV'));
  }

  /** Todos los días a las 14:20 UTC (8:20 en El Salvador). */
  @Cron('20 14 * * *', { name: 'billing-daily' })
  async run(now: Date = new Date()): Promise<void> {
    if (!this.isEnabled() || this.running) return;
    this.running = true;
    try {
      try {
        const expired = await this.payments.expireOld(now);
        if (expired > 0) this.logger.log(`${expired} pago(s) pendiente(s) pasaron a VENCIDO`);
      } catch (err) {
        this.logger.error(`Vencer pagos pendientes falló: ${(err as Error).message}`);
      }
      try {
        const r = await this.reminders.run(now);
        if (r.mode !== 'OFF') this.logger.log(`Avisos de vencimiento (${r.mode}): ${r.checked} revisadas, ${r.due} tocan, ${r.sent} enviadas (${r.emailed} correos, ${r.emailFailed} sin salir), ${r.duplicates} repetidas, ${r.errors} con error`);
      } catch (err) {
        this.logger.error(`Avisos de vencimiento fallaron: ${(err as Error).message}`);
      }
    } finally {
      this.running = false;
    }
  }

  /** Cada hora, en el minuto 35 (lejos del minuto 0 donde arrancan otras tareas del servidor). */
  @Cron('35 * * * *', { name: 'billing-usage-alerts' })
  async runUsage(now: Date = new Date()): Promise<void> {
    if (!this.isEnabled() || this.runningUsage) return;
    this.runningUsage = true;
    try {
      const r = await this.usageAlerts.run(now);
      // Con OFF no hay nada que contar; con cada hora sin novedades tampoco hace falta llenar el registro.
      if (r.mode !== 'OFF' && (r.due > 0 || r.errors > 0)) {
        this.logger.log(`Avisos de uso (${r.mode}): ${r.checked} revisadas, ${r.due} tocan, ${r.sent} enviadas (${r.emailed} correos, ${r.emailFailed} sin salir), ${r.duplicates} repetidas, ${r.errors} con error`);
      }
    } catch (err) {
      this.logger.error(`Avisos de uso fallaron: ${(err as Error).message}`);
    } finally {
      this.runningUsage = false;
    }
  }
}
