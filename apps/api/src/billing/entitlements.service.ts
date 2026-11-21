import { HttpException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BILLABLE_ROLES, isBillableRole } from './billing.constants';
import { BillingSettingsService } from './billing-settings.service';
import { Entitlements, PackTotals, computeEntitlements } from './entitlements';

const TTL_MS = 60_000;

/**
 * Un solo punto que responde «¿puede esta organización hacer X?». Todo chequeo de plan pasa por aquí (así no hay huecos como «reactivar
 * usuarios evita el tope»). Con el interruptor en OFF no se consulta nada; en OBSERVE solo se registra «habría bloqueado».
 */
@Injectable()
export class EntitlementsService {
  private readonly logger = new Logger('Entitlements');
  private cache = new Map<string, { ent: Entitlements | null; at: number }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: BillingSettingsService,
  ) {}

  invalidate(organizationId?: string): void {
    if (organizationId) this.cache.delete(organizationId);
    else this.cache.clear();
  }

  /** Derechos de la organización, o null si no tiene suscripción (se trata como sin restricciones y se avisa en el registro). */
  async get(organizationId: string): Promise<Entitlements | null> {
    const hit = this.cache.get(organizationId);
    if (hit && Date.now() - hit.at < TTL_MS) return hit.ent;
    let sub = null;
    let packs: PackTotals = { storageGb: 0, aiPackRemaining: 0 };
    try {
      sub = await this.prisma.billingSubscription.findUnique({ where: { organizationId } });
      if (sub) {
        try {
          packs = await this.packTotals(organizationId);
        } catch (e) {
          // La etapa 2 del SQL (paquetes) puede no estar aplicada todavía: se trabaja sin paquetes.
          this.logger.warn(`No se pudieron leer los paquetes de ${organizationId}: ${(e as Error).message}`);
        }
      }
    } catch (e) {
      // Tablas aún sin crear (SQL sin aplicar) o base con problemas: se deja pasar, pero con ALARMA en el registro (nunca en silencio).
      this.logger.error(`No se pudo leer la suscripción de ${organizationId}: ${(e as Error).message}`);
    }
    const ent = sub
      ? computeEntitlements(
          {
            status: sub.status, months: sub.months, currentPeriodEnd: sub.currentPeriodEnd, trialEndsAt: sub.trialEndsAt,
            planSnapshot: sub.planSnapshot, overrides: sub.overrides, extraUsers: sub.extraUsers, exempt: sub.exempt,
          },
          await this.settings.get(),
          new Date(),
          packs,
        )
      : null;
    if (!ent) this.logger.warn(`La organización ${organizationId} no tiene suscripción: se deja pasar sin restricciones.`);
    this.cache.set(organizationId, { ent, at: Date.now() });
    return ent;
  }

  /**
   * Aplica una infracción según el modo: ENFORCE bloquea con el código y estado indicados; OBSERVE solo lo registra (para ver qué se
   * bloquearía antes de encender el cumplimiento). El modo OFF no llega aquí.
   */
  violate(mode: string, organizationId: string, status: number, code: string, message: string, extra: Record<string, unknown> = {}): void {
    if (mode !== 'ENFORCE') {
      this.logger.warn(`[observar] ${organizationId}: habría bloqueado con ${code} — ${message}`);
      return;
    }
    throw new HttpException({ statusCode: status, code, message, ...extra }, status);
  }

  /** Paquetes comprados que siguen vigentes (no vencidos ni agotados): espacio extra y peticiones de IA que quedan. */
  async packTotals(organizationId: string): Promise<PackTotals> {
    const rows = await this.prisma.addonPurchase.findMany({
      where: { organizationId, status: 'ACTIVE', OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
      select: { kind: true, quantity: true, remaining: true },
    });
    return {
      storageGb: rows.filter((r) => r.kind === 'STORAGE').reduce((s, r) => s + r.quantity, 0),
      aiPackRemaining: rows.filter((r) => r.kind === 'AI').reduce((s, r) => s + r.remaining, 0),
    };
  }

  async countBillableUsers(organizationId: string, excludeUserId?: string): Promise<number> {
    return this.prisma.user.count({
      where: { organizationId, active: true, role: { in: [...BILLABLE_ROLES] as never[] }, ...(excludeUserId && { id: { not: excludeUserId } }) },
    });
  }

  /** Antes de invitar o ascender a alguien a un rol de pago: ¿hay plaza libre? */
  async assertCanAddBillableUser(organizationId: string, role: string, excludeUserId?: string): Promise<void> {
    if (!isBillableRole(role)) return;
    const { enforcementMode } = await this.settings.get();
    if (enforcementMode === 'OFF') return;
    const ent = await this.get(organizationId);
    if (!ent || ent.exempt) return;
    const used = await this.countBillableUsers(organizationId, excludeUserId);
    if (used >= ent.seatsAllowed) {
      this.violate(
        enforcementMode, organizationId, 402, 'LIMITE_USUARIOS',
        `Tu plan ${ent.planName} permite ${ent.seatsAllowed} usuarios y ya tienes ${used}. Amplía tu plan o agrega usuarios extra para invitar a más personas.`,
        { used, allowed: ent.seatsAllowed },
      );
    }
  }

  /** ¿Incluye el plan este asistente de IA? */
  async assertAssistantAllowed(organizationId: string, agentType: string): Promise<void> {
    const { enforcementMode } = await this.settings.get();
    if (enforcementMode === 'OFF') return;
    const ent = await this.get(organizationId);
    if (!ent || ent.exempt) return;
    const agent = (agentType || '').toUpperCase();
    if (!ent.assistants.includes(agent)) {
      this.violate(
        enforcementMode, organizationId, 403, 'ASISTENTE_NO_INCLUIDO',
        `El asistente ${agent} no está incluido en tu plan ${ent.planName}.`, { assistant: agent },
      );
    }
  }
}
