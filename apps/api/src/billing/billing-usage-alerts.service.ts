import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BillingSettingsService } from './billing-settings.service';
import { totalStorageGb } from './entitlements';
import { EntitlementsService } from './entitlements.service';
import { BillingRemindersService, billableSubscriptions } from './billing-reminders.service';
import type { NoticeText } from './billing-reminders';
import { describeUsageAlert, planAiAlert, planStorageAlert, type UsageAlertDecision } from './billing-usage-alerts';
import { BYTES_PER_GB, StorageUsageService, type StorageUsage } from './storage-usage.service';
import { UsageService, periodKeyOf } from './usage.service';

export interface UsageAlertCandidate {
  organizationId: string;
  organizationName: string;
  subscriptionId: string;
  planName: string;
  decision: UsageAlertDecision;
  text: NoticeText;
  /** Identifica el aviso para no repetirlo. */
  key: Record<string, string | number>;
  /** Solo el espacio: pasado este plazo el aviso puede volver a salir (se liberó espacio y se volvió a llenar). */
  since?: Date;
}

export interface UsageAlertRunResult {
  mode: 'OFF' | 'OBSERVE' | 'ENFORCE';
  checked: number;
  due: number;
  sent: number;
  emailed: number;
  emailFailed: number;
  duplicates: number;
  errors: number;
}

/** Días que deben pasar para volver a avisar el mismo nivel de espacio con la misma capacidad. */
export const STORAGE_REARM_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Mientras la cuenta puede usar la plataforma: con licencia vencida y en solo lectura el aviso que importa es el de vencimiento. */
const ALERTABLE_STATUSES = ['TRIAL', 'ACTIVE', 'GRACE'];

/**
 * Avisos de uso al 80 % y al 100 % de las peticiones de IA del mes y del espacio. Mismas reglas que los avisos de vencimiento: solo con el
 * cumplimiento en ENFORCE se envía (OBSERVE cuenta, OFF no hace nada), a quienes administran la organización, una sola vez por aviso.
 *
 *  · IA: una vez por mes, nivel y capacidad (al comprar más peticiones la capacidad cambia y vuelve a ser posible avisar).
 *  · Espacio: una vez por nivel y capacidad, y de nuevo pasados {@link STORAGE_REARM_DAYS} días si sigue o vuelve a estar en ese nivel.
 */
@Injectable()
export class BillingUsageAlertsService {
  private readonly logger = new Logger(BillingUsageAlertsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: BillingSettingsService,
    private readonly entitlements: EntitlementsService,
    private readonly usage: UsageService,
    private readonly storage: StorageUsageService,
    private readonly reminders: BillingRemindersService,
  ) {}

  /** Qué avisos de uso tocan ahora, sin enviar ni escribir nada. */
  async preview(now: Date = new Date()): Promise<{ checked: number; items: UsageAlertCandidate[] }> {
    const subs = await billableSubscriptions(this.prisma);
    let storageByOrg: Map<string, StorageUsage> | null = null;
    try {
      storageByOrg = await this.storage.usageAll();
    } catch (err) {
      this.logger.error(`No se pudo medir el espacio de las organizaciones: ${(err as Error).message}`);
    }
    const period = periodKeyOf(now);
    const items: UsageAlertCandidate[] = [];

    for (const sub of subs) {
      const ent = await this.entitlements.get(sub.organizationId);
      if (!ent || ent.exempt || !ALERTABLE_STATUSES.includes(ent.status)) continue;
      const base = { organizationId: sub.organizationId, organizationName: sub.organization.name, subscriptionId: sub.id, planName: ent.planName };
      const add = (decision: UsageAlertDecision, key: Record<string, string | number>, since?: Date) => items.push({
        ...base, decision, key, since, text: describeUsageAlert(decision, { orgName: sub.organization.name, planName: ent.planName }),
      });

      try {
        const ai = await this.usage.aiStatus(sub.organizationId, period);
        const d = planAiAlert(ai);
        if (d) add(d, { kind: d.kind, period: ai.periodKey, capacity: d.capacity });
      } catch (err) {
        this.logger.error(`No se pudo leer el consumo de IA de ${sub.organization.name}: ${(err as Error).message}`);
      }

      if (storageByOrg) {
        const gb = totalStorageGb(ent);
        const d = planStorageAlert(storageByOrg.get(sub.organizationId)?.totalBytes ?? 0, gb === null ? null : gb * BYTES_PER_GB);
        if (d && gb !== null) add(d, { kind: d.kind, capacityGb: gb }, new Date(now.getTime() - STORAGE_REARM_DAYS * DAY_MS));
      }
    }
    return { checked: subs.length, items };
  }

  async run(now: Date = new Date()): Promise<UsageAlertRunResult> {
    const settings = await this.settings.get();
    const result: UsageAlertRunResult = { mode: settings.enforcementMode, checked: 0, due: 0, sent: 0, emailed: 0, emailFailed: 0, duplicates: 0, errors: 0 };
    // Con el cumplimiento apagado no se le escribe a nadie: la plataforma se comporta como antes.
    if (settings.enforcementMode === 'OFF') return result;

    const { checked, items } = await this.preview(now);
    result.checked = checked;
    result.due = items.length;
    if (settings.enforcementMode === 'OBSERVE') {
      for (const it of items) this.logger.log(`[OBSERVE] se enviaría «${it.text.subject}» a ${it.organizationName} (${it.decision.kind})`);
      return result;
    }

    for (const item of items) {
      try {
        const r = await this.reminders.deliverNotice({
          organizationId: item.organizationId, organizationName: item.organizationName, subscriptionId: item.subscriptionId,
          eventType: 'USAGE_ALERT_SENT', label: item.decision.kind, key: item.key, since: item.since, text: item.text, now,
        });
        if (r === 'duplicate') result.duplicates++;
        else { result.sent++; result.emailed += r.emailed; result.emailFailed += r.failed; }
      } catch (err) {
        result.errors++;
        this.logger.error(`Aviso de uso de ${item.organizationName} (${item.decision.kind}) falló: ${(err as Error).message}`);
      }
    }
    return result;
  }
}
