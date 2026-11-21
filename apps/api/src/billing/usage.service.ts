import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { getRequestContext } from '../common/request-context';
import { BillingSettingsService } from './billing-settings.service';
import { EntitlementsService } from './entitlements.service';

export const periodKeyOf = (d: Date = new Date()): string => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;

export interface AiStatus {
  periodKey: string;
  included: number | null; // peticiones mensuales del plan; null = sin tope
  usedFromPlan: number;
  usedTotal: number;
  packRemaining: number;
  available: number | null; // null = sin tope
  costUsd: number; // costo real acumulado del mes (solo lo ve el superadmin)
  costCapUsd: number | null; // tope de seguridad en dinero
}

export interface MeterOptions<T> {
  agent: string;
  weight: number;
  tokens?: (result: T) => { in?: number; out?: number; model?: string } | undefined;
}

/**
 * Medición de la IA en PETICIONES (lo que entiende el cliente) y en dinero (lo que ve el superadmin).
 * Cada petición cuenta su peso (1 / 5 / 10); primero se gasta lo incluido en el plan y después los paquetes comprados. Siempre se MIDE (aunque el
 * interruptor esté en OFF); solo se BLOQUEA en ENFORCE: al agotar las peticiones (402 LIMITE_IA) o al superar el tope de seguridad en dinero
 * (402 TOPE_IA), que protege contra un peso mal calculado o un uso anómalo.
 */
@Injectable()
export class UsageService {
  private readonly logger = new Logger('Usage');

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: BillingSettingsService,
    private readonly entitlements: EntitlementsService,
  ) {}

  async aiStatus(organizationId: string, periodKey: string = periodKeyOf()): Promise<AiStatus> {
    const [ent, settings, agg] = await Promise.all([
      this.entitlements.get(organizationId),
      this.settings.get(),
      this.prisma.usageLedger.aggregate({
        where: { organizationId, periodKey, kind: 'AI' }, _sum: { weight: true, packWeight: true, costUsd: true },
      }),
    ]);
    let packRemaining = 0;
    try {
      packRemaining = (await this.entitlements.packTotals(organizationId)).aiPackRemaining;
    } catch {
      packRemaining = 0; // etapa 2 del SQL sin aplicar
    }
    const usedTotal = agg._sum.weight ?? 0;
    const fromPack = agg._sum.packWeight ?? 0;
    const usedFromPlan = usedTotal - fromPack;
    const included = ent && ent.limits.aiRequests >= 0 ? ent.limits.aiRequests : null;
    const available = included === null ? null : Math.max(included - usedFromPlan, 0) + packRemaining;
    return {
      periodKey, included, usedFromPlan, usedTotal, packRemaining, available,
      costUsd: Number(agg._sum.costUsd ?? 0),
      costCapUsd: included === null ? null : (included + packRemaining + fromPack) * settings.costPerRequestUsd * settings.safetyMultiplier,
    };
  }

  /** Antes de gastar `weight` peticiones: ¿quedan, y no se pasó el tope de seguridad? (solo bloquea en ENFORCE). */
  async assertCanUseAi(organizationId: string, weight: number): Promise<void> {
    const { enforcementMode } = await this.settings.get();
    if (enforcementMode === 'OFF') return;
    const ent = await this.entitlements.get(organizationId);
    if (!ent || ent.exempt) return;
    let s: AiStatus;
    try {
      s = await this.aiStatus(organizationId);
    } catch (e) {
      // Etapa 2 del SQL sin aplicar o base con problemas: se deja pasar, pero con ALARMA en el registro (nunca en silencio).
      this.logger.error(`No se pudo leer el consumo de IA de ${organizationId}: ${(e as Error).message}`);
      return;
    }
    if (s.available !== null && s.available < weight) {
      this.entitlements.violate(
        enforcementMode, organizationId, 402, 'LIMITE_IA',
        `Llegaste al límite de peticiones de IA de este mes (${s.usedTotal.toLocaleString('en-US')} usadas). Compra más peticiones o espera al próximo mes.`,
        { used: s.usedTotal, available: s.available },
      );
    }
    if (s.costCapUsd !== null && s.costUsd >= s.costCapUsd) {
      this.entitlements.violate(
        enforcementMode, organizationId, 402, 'TOPE_IA',
        'La IA se pausó por un uso inusual este mes. Contacta a la plataforma para revisarlo.', {},
      );
    }
  }

  /** Registra el consumo: reparte entre lo incluido en el plan y los paquetes (los más antiguos primero) y guarda la fila del libro. */
  async record(p: { organizationId: string; userId?: string | null; agent?: string; weight: number; tokensIn?: number; tokensOut?: number; model?: string }): Promise<void> {
    if (!Number.isInteger(p.weight) || p.weight < 0) return;
    const { costPerRequestUsd } = await this.settings.get();
    const ent = await this.entitlements.get(p.organizationId);
    const planRemaining = await this.planRemaining(p.organizationId, ent && ent.limits.aiRequests >= 0 ? ent.limits.aiRequests : null);
    const fromPlan = planRemaining === null ? p.weight : Math.min(p.weight, planRemaining);
    let need = p.weight - fromPlan;
    let packWeight = 0;
    await this.prisma.$transaction(async (tx) => {
      if (need > 0) {
        const packs = await tx.addonPurchase.findMany({
          where: { organizationId: p.organizationId, kind: 'AI', status: 'ACTIVE', remaining: { gt: 0 }, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
          orderBy: { createdAt: 'asc' }, select: { id: true, remaining: true },
        });
        for (const pack of packs) {
          if (need <= 0) break;
          const take = Math.min(pack.remaining, need);
          // Condicional: dos peticiones a la vez no pueden gastar dos veces lo mismo.
          const r = await tx.addonPurchase.updateMany({ where: { id: pack.id, remaining: { gte: take } }, data: { remaining: { decrement: take } } });
          if (r.count === 1) {
            need -= take;
            packWeight += take;
            await tx.addonPurchase.updateMany({ where: { id: pack.id, remaining: 0, status: 'ACTIVE' }, data: { status: 'CONSUMED' } });
          }
        }
      }
      await tx.usageLedger.create({
        data: {
          organizationId: p.organizationId, userId: p.userId ?? null, kind: 'AI', agent: p.agent ?? null, weight: p.weight, packWeight,
          tokensIn: Math.max(0, Math.round(p.tokensIn ?? 0)), tokensOut: Math.max(0, Math.round(p.tokensOut ?? 0)),
          costUsd: p.weight * costPerRequestUsd, model: p.model ?? null, periodKey: periodKeyOf(),
        },
      });
    });
  }

  private async planRemaining(organizationId: string, included: number | null): Promise<number | null> {
    if (included === null) return null;
    const agg = await this.prisma.usageLedger.aggregate({
      where: { organizationId, periodKey: periodKeyOf(), kind: 'AI' }, _sum: { weight: true, packWeight: true },
    });
    return Math.max(included - ((agg._sum.weight ?? 0) - (agg._sum.packWeight ?? 0)), 0);
  }

  /**
   * Envuelve una acción de IA: verifica el límite ANTES y registra el consumo DESPUÉS (un fallo al registrar nunca rompe la respuesta ya
   * calculada). Sin contexto de petición (tareas internas, pruebas) o para el SUPER_ADMIN no mide.
   */
  async meter<T>(opts: MeterOptions<T>, fn: () => Promise<T>): Promise<T> {
    const ctx = getRequestContext();
    if (!ctx || ctx.role === 'SUPER_ADMIN') return fn();
    await this.assertCanUseAi(ctx.organizationId, opts.weight);
    const result = await fn();
    try {
      const t = opts.tokens?.(result);
      await this.record({ organizationId: ctx.organizationId, userId: ctx.userId, agent: opts.agent, weight: opts.weight, tokensIn: t?.in, tokensOut: t?.out, model: t?.model });
    } catch (e) {
      this.logger.error(`No se pudo registrar el consumo de IA de ${ctx.organizationId}: ${(e as Error).message}`);
    }
    return result;
  }

  /** Peticiones del mes por asistente (lo que ve el cliente: solo peticiones). */
  async byAgent(organizationId: string, periodKey: string = periodKeyOf()) {
    const rows = await this.prisma.usageLedger.groupBy({
      by: ['agent'], where: { organizationId, periodKey, kind: 'AI' }, _sum: { weight: true, costUsd: true }, orderBy: { _sum: { weight: 'desc' } },
    });
    return rows.map((r) => ({ agent: r.agent ?? 'OTROS', requests: r._sum.weight ?? 0, costUsd: Number(r._sum.costUsd ?? 0) }));
  }

  /** Consumo de toda la plataforma en un mes (solo superadmin): peticiones Y dinero por organización. */
  async consumption(periodKey: string = periodKeyOf()) {
    const [byOrg, byAgent] = await Promise.all([
      this.prisma.usageLedger.groupBy({ by: ['organizationId'], where: { periodKey, kind: 'AI' }, _sum: { weight: true, packWeight: true, costUsd: true } }),
      this.prisma.usageLedger.groupBy({ by: ['agent'], where: { periodKey, kind: 'AI' }, _sum: { weight: true, costUsd: true }, orderBy: { _sum: { weight: 'desc' } } }),
    ]);
    return {
      periodKey,
      organizations: byOrg.map((r) => ({
        organizationId: r.organizationId, requests: r._sum.weight ?? 0, packRequests: r._sum.packWeight ?? 0, costUsd: Number(r._sum.costUsd ?? 0),
      })),
      agents: byAgent.map((r) => ({ agent: r.agent ?? 'OTROS', requests: r._sum.weight ?? 0, costUsd: Number(r._sum.costUsd ?? 0) })),
    };
  }
}
