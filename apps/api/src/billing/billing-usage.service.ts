import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BillingSettingsService } from './billing-settings.service';
import { EntitlementsService } from './entitlements.service';
import { totalStorageGb } from './entitlements';
import { EGRESS_RATES, egressCosts } from './storage-egress';
import { StorageEgressService } from './storage-egress.service';
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
    private readonly egress: StorageEgressService,
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
    const [settings, consumption, space, subs, downloads] = await Promise.all([
      this.settings.get(), this.usage.consumption(periodKey), this.storage.usageAll(),
      this.prisma.billingSubscription.findMany({ include: { organization: { select: { id: true, name: true } } } }),
      this.egress.month(periodKey),
    ]);
    const ai = new Map(consumption.organizations.map((o) => [o.organizationId, o]));
    const egressGb = new Map([...downloads.byOrg].map(([org, e]) => [org, e.bytes / BYTES_PER_GB]));
    const egressCost = egressCosts(egressGb, EGRESS_RATES.supabaseIncludedGb, EGRESS_RATES.supabaseUsdPerGb);
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
      const dl = downloads.byOrg.get(s.organizationId);
      const dlCostSupabase = egressCost.byOrg.get(s.organizationId) ?? 0;
      rows.push({
        organizationId: s.organizationId, organizationName: s.organization.name, planCode: ent?.planCode ?? null, planName: ent?.planName ?? null, status: ent?.status ?? null, exempt: s.exempt,
        requests: u?.requests ?? 0, requestsIncluded: ent && ent.limits.aiRequests >= 0 ? ent.limits.aiRequests : null, packRequests: u?.packRequests ?? 0, aiCostUsd: aiCost,
        storageGb: gb, storageLimitGb: ent ? totalStorageGb(ent) : null, storageByType: st?.byType ?? null,
        storageCostSupabaseUsd: stSupabase, storageCostR2Usd: gb * STORAGE_RATES_USD_PER_GB_MONTH.cloudflareR2,
        // Descargas del mes: enlaces emitidos, un archivo una vez por día (ver storage-egress.ts). Con R2 no hay costo de descargas.
        egressFiles: dl?.files ?? 0, egressBytes: dl?.bytes ?? 0, egressByType: dl?.byType ?? null,
        egressCostSupabaseUsd: dlCostSupabase, egressCostR2Usd: 0,
        monthlyIncomeUsd: income, variableCostUsd: aiCost + stSupabase + dlCostSupabase, marginUsd: income - aiCost - stSupabase - dlCostSupabase,
      });
    }
    return {
      periodKey, costPerRequestUsd: settings.costPerRequestUsd, safetyMultiplier: settings.safetyMultiplier, rates: STORAGE_RATES_USD_PER_GB_MONTH,
      egress: {
        measured: downloads.available, includedGb: EGRESS_RATES.supabaseIncludedGb, supabaseUsdPerGb: EGRESS_RATES.supabaseUsdPerGb, r2UsdPerGb: EGRESS_RATES.r2UsdPerGb,
        totalGb: egressCost.totalGb, overageGb: egressCost.overageGb, overageCostSupabaseUsd: egressCost.overageCostUsd,
      },
      organizations: rows.sort((a, b) => b.variableCostUsd - a.variableCostUsd), agents: consumption.agents,
    };
  }
}
