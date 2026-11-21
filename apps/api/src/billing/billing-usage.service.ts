import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BillingSettingsService } from './billing-settings.service';
import { EntitlementsService } from './entitlements.service';
import { totalStorageGb } from './entitlements';
import { StorageUsageService, BYTES_PER_GB } from './storage-usage.service';
import { UsageService, periodKeyOf } from './usage.service';

/** Costos unitarios de referencia del almacenamiento (verificados 2026-11-21 en las páginas oficiales; el superadmin los usa para comparar proveedores). */
export const STORAGE_RATES_USD_PER_GB_MONTH = { supabase: 0.0213, cloudflareR2: 0.015 } as const;

/**
 * Lo que se muestra del consumo. Para el CLIENTE: solo peticiones y bytes (nunca dinero). Para el SUPERADMIN: peticiones Y dinero por organización,
 * asistente y tipo de archivo, con el ingreso mensual y el margen sobre el costo variable (sin costos fijos).
 */
@Injectable()
export class BillingUsageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: BillingSettingsService,
    private readonly entitlements: EntitlementsService,
    private readonly usage: UsageService,
    private readonly storage: StorageUsageService,
  ) {}

  /** «Mi plan»: consumo de la organización. Sin dinero. */
  async clientSummary(organizationId: string) {
    const [ent, ai, byAgent, space] = await Promise.all([
      this.entitlements.get(organizationId),
      this.usage.aiStatus(organizationId),
      this.usage.byAgent(organizationId),
      this.storage.usage(organizationId),
    ]);
    const limitGb = ent ? totalStorageGb(ent) : null;
    return {
      periodKey: ai.periodKey,
      ai: {
        included: ai.included, used: ai.usedTotal, usedFromPlan: ai.usedFromPlan, packRemaining: ai.packRemaining, available: ai.available,
        byAgent: byAgent.map((a) => ({ agent: a.agent, requests: a.requests })),
      },
      storage: {
        usedBytes: space.totalBytes, limitGb, includedGb: ent && ent.limits.storageGb >= 0 ? ent.limits.storageGb : null, extraGb: ent?.extra.storageGb ?? 0,
        byType: space.byType, maxFileMb: ent && ent.limits.maxFileMb >= 0 ? ent.limits.maxFileMb : null, fileTypes: ent?.limits.fileTypes ?? [],
      },
    };
  }

  /** Pantalla «Consumo y costos» del superadmin. */
  async adminConsumption(periodKey: string = periodKeyOf()) {
    const [settings, consumption, space, subs] = await Promise.all([
      this.settings.get(), this.usage.consumption(periodKey), this.storage.usageAll(),
      this.prisma.billingSubscription.findMany({ include: { organization: { select: { id: true, name: true } } } }),
    ]);
    const ai = new Map(consumption.organizations.map((o) => [o.organizationId, o]));
    const rows = [];
    for (const s of subs) {
      const ent = await this.entitlements.get(s.organizationId);
      const u = ai.get(s.organizationId);
      const st = space.get(s.organizationId);
      const gb = (st?.totalBytes ?? 0) / BYTES_PER_GB;
      const aiCost = u?.costUsd ?? 0;
      const price = s.agreedPriceUsd ?? s.priceUsd;
      const income = price && s.months > 0 ? Number(price) / s.months : 0;
      const stSupabase = gb * STORAGE_RATES_USD_PER_GB_MONTH.supabase;
      rows.push({
        organizationId: s.organizationId, organizationName: s.organization.name, planCode: ent?.planCode ?? null, planName: ent?.planName ?? null, status: ent?.status ?? null, exempt: s.exempt,
        requests: u?.requests ?? 0, requestsIncluded: ent && ent.limits.aiRequests >= 0 ? ent.limits.aiRequests : null, packRequests: u?.packRequests ?? 0, aiCostUsd: aiCost,
        storageGb: gb, storageLimitGb: ent ? totalStorageGb(ent) : null, storageByType: st?.byType ?? null,
        storageCostSupabaseUsd: stSupabase, storageCostR2Usd: gb * STORAGE_RATES_USD_PER_GB_MONTH.cloudflareR2,
        monthlyIncomeUsd: income, variableCostUsd: aiCost + stSupabase, marginUsd: income - aiCost - stSupabase,
      });
    }
    return {
      periodKey, costPerRequestUsd: settings.costPerRequestUsd, safetyMultiplier: settings.safetyMultiplier, rates: STORAGE_RATES_USD_PER_GB_MONTH,
      organizations: rows.sort((a, b) => b.variableCostUsd - a.variableCostUsd), agents: consumption.agents,
    };
  }
}
