import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { BillingAudience, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ASSISTANT_KEYS, FILE_TYPE_KEYS, FUNCTION_KEYS, LICENSE_MONTHS, MODULE_KEYS } from './billing.constants';
import { EntitlementsService } from './entitlements.service';
import { DEFAULT_LIMITS, PlanLimits } from './entitlements';
import { toPublicCatalog, type PublicCatalog } from './public-catalog';

export interface PlanInput {
  code?: string;
  name?: string;
  audience?: BillingAudience;
  description?: string;
  isPublic?: boolean;
  featured?: boolean;
  active?: boolean;
  sortOrder?: number;
  trialDays?: number;
  limits?: Partial<PlanLimits>;
  modules?: string[];
  functions?: string[];
  assistants?: string[];
  prices?: Array<{ months: number; priceUsd: number; active?: boolean }>;
}

const subset = (label: string, items: string[] | undefined, allowed: readonly string[]) => {
  if (items === undefined) return undefined;
  const bad = items.filter((i) => !allowed.includes(i));
  if (bad.length) throw new BadRequestException(`${label} desconocidos: ${bad.join(', ')}`);
  return [...new Set(items)];
};

export function planSnapshotOf(plan: {
  code: string; name: string; audience: string; trialDays: number; limits: unknown; modules: string[]; functions: string[]; assistants: string[];
}) {
  return {
    code: plan.code, name: plan.name, audience: plan.audience, trialDays: plan.trialDays, limits: plan.limits,
    modules: plan.modules, functions: plan.functions, assistants: plan.assistants,
  };
}

/** Catálogo de planes y precios (datos editables por el superadmin). Cambiar un plan NO toca lo ya contratado: cada suscripción guarda su copia. */
@Injectable()
export class PlansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
  ) {}

  private normalizeLimits(input: Partial<PlanLimits> | undefined, base: PlanLimits): PlanLimits {
    const l = { ...base, ...(input ?? {}) };
    const nums: Array<keyof PlanLimits> = ['users', 'maxUsers', 'storageGb', 'maxFileMb', 'aiRequests'];
    for (const k of nums) {
      const v = l[k] as number;
      if (!Number.isFinite(v) || v < -1) throw new BadRequestException(`El límite «${k}» debe ser un número ≥ 0 (o -1 = sin tope).`);
    }
    if (!Number.isFinite(l.extraUserPriceUsd) || l.extraUserPriceUsd < 0) throw new BadRequestException('El precio del usuario extra no puede ser negativo.');
    if (l.users >= 0 && l.maxUsers >= 0 && l.maxUsers < l.users) throw new BadRequestException('El máximo de usuarios no puede ser menor que los usuarios incluidos.');
    const types = subset('Tipos de archivo', l.fileTypes, FILE_TYPE_KEYS) ?? [];
    return { ...l, fileTypes: types, packsAi: !!l.packsAi, packsStorage: !!l.packsStorage };
  }

  private normalizePrices(prices: PlanInput['prices']) {
    if (!prices) return undefined;
    const seen = new Set<number>();
    for (const p of prices) {
      if (!(LICENSE_MONTHS as readonly number[]).includes(p.months)) throw new BadRequestException(`Duración de licencia no válida: ${p.months} (usa 0, 1, 3, 6 o 12).`);
      if (!Number.isFinite(p.priceUsd) || p.priceUsd < 0) throw new BadRequestException('El precio no puede ser negativo.');
      if (seen.has(p.months)) throw new BadRequestException(`Duración repetida: ${p.months}.`);
      seen.add(p.months);
    }
    return prices;
  }

  async list() {
    const [plans, counts] = await Promise.all([
      this.prisma.billingPlan.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }], include: { prices: { orderBy: { months: 'asc' } } } }),
      this.prisma.billingSubscription.groupBy({ by: ['planId'], _count: { _all: true } }),
    ]);
    const bySubscribers = new Map(counts.map((c) => [c.planId, c._count._all]));
    return plans.map((p) => ({ ...p, subscribers: bySubscribers.get(p.id) ?? 0 }));
  }

  /**
   * Catálogo para la página pública de precios: solo planes públicos y activos (nunca Piloto ni Interno), precios activos, paquetes activos y
   * el contacto de ventas que el superadmin configuró. Es una proyección de lista blanca (ver public-catalog.ts): no sale ningún costo interno.
   */
  async publicCatalog(contact: { email?: unknown; whatsapp?: unknown }): Promise<PublicCatalog> {
    const plans = await this.prisma.billingPlan.findMany({
      where: { isPublic: true, active: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { prices: { where: { active: true }, orderBy: { months: 'asc' } } },
    });
    let packs: Awaited<ReturnType<typeof this.prisma.addonPack.findMany>> = [];
    try {
      packs = await this.prisma.addonPack.findMany({ where: { active: true }, orderBy: [{ sortOrder: 'asc' }, { quantity: 'asc' }] });
    } catch {
      packs = []; // etapa 2 del SQL sin aplicar: el catálogo de planes se publica igual, sin paquetes
    }
    return toPublicCatalog(plans, packs, contact);
  }

  async get(id: string) {
    const plan = await this.prisma.billingPlan.findUnique({ where: { id }, include: { prices: { orderBy: { months: 'asc' } } } });
    if (!plan) throw new NotFoundException('Plan no encontrado');
    return plan;
  }

  async create(input: PlanInput, actorId: string) {
    const code = (input.code ?? '').trim().toUpperCase();
    if (!/^[A-Z0-9_]{3,40}$/.test(code)) throw new BadRequestException('El código del plan debe tener 3 a 40 letras mayúsculas, números o guion bajo.');
    if (!input.name?.trim()) throw new BadRequestException('El plan necesita un nombre.');
    if (!input.audience) throw new BadRequestException('Indica la audiencia: PERSONA o EMPRESA.');
    if (await this.prisma.billingPlan.findUnique({ where: { code }, select: { id: true } })) throw new ConflictException(`Ya existe el plan ${code}.`);
    const limits = this.normalizeLimits(input.limits, DEFAULT_LIMITS);
    const prices = this.normalizePrices(input.prices) ?? [];
    const plan = await this.prisma.billingPlan.create({
      data: {
        code, name: input.name.trim(), audience: input.audience, description: input.description ?? '',
        isPublic: input.isPublic ?? true, featured: input.featured ?? false, active: input.active ?? true, sortOrder: input.sortOrder ?? 0,
        trialDays: input.trialDays ?? 14, limits: limits as unknown as Prisma.InputJsonValue,
        modules: subset('Módulos', input.modules, MODULE_KEYS) ?? [], functions: subset('Funciones', input.functions, FUNCTION_KEYS) ?? [],
        assistants: subset('Asistentes', input.assistants, ASSISTANT_KEYS) ?? [],
        prices: { create: prices.map((p) => ({ months: p.months, priceUsd: p.priceUsd, active: p.active ?? true })) },
      },
      include: { prices: true },
    });
    await this.prisma.billingEvent.create({ data: { actorId, type: 'PLAN_CREATED', data: { code, id: plan.id } } });
    return plan;
  }

  async update(id: string, input: PlanInput, actorId: string) {
    const current = await this.get(id);
    if (input.code !== undefined && input.code.trim().toUpperCase() !== current.code) throw new BadRequestException('El código del plan no se puede cambiar.');
    const limits = input.limits !== undefined ? this.normalizeLimits(input.limits, { ...DEFAULT_LIMITS, ...(current.limits as object) } as PlanLimits) : undefined;
    const prices = this.normalizePrices(input.prices);
    const data: Prisma.BillingPlanUpdateInput = {
      ...(input.name !== undefined && { name: input.name.trim() }),
      ...(input.audience !== undefined && { audience: input.audience }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.isPublic !== undefined && { isPublic: input.isPublic }),
      ...(input.featured !== undefined && { featured: input.featured }),
      ...(input.active !== undefined && { active: input.active }),
      ...(input.sortOrder !== undefined && { sortOrder: input.sortOrder }),
      ...(input.trialDays !== undefined && { trialDays: input.trialDays }),
      ...(limits && { limits: limits as unknown as Prisma.InputJsonValue }),
      ...(input.modules !== undefined && { modules: subset('Módulos', input.modules, MODULE_KEYS) }),
      ...(input.functions !== undefined && { functions: subset('Funciones', input.functions, FUNCTION_KEYS) }),
      ...(input.assistants !== undefined && { assistants: subset('Asistentes', input.assistants, ASSISTANT_KEYS) }),
    };
    await this.prisma.$transaction(async (tx) => {
      await tx.billingPlan.update({ where: { id }, data });
      for (const p of prices ?? []) {
        await tx.billingPlanPrice.upsert({
          where: { planId_months: { planId: id, months: p.months } },
          update: { priceUsd: p.priceUsd, ...(p.active !== undefined && { active: p.active }) },
          create: { planId: id, months: p.months, priceUsd: p.priceUsd, active: p.active ?? true },
        });
      }
      await tx.billingEvent.create({ data: { actorId, type: 'PLAN_UPDATED', data: { code: current.code, fields: Object.keys(input) } as Prisma.InputJsonValue } });
    });
    return this.get(id);
  }

  /** «Aplicar a N clientes»: refresca la instantánea de los suscriptores del plan (conserva sus ajustes por cliente y su precio pactado). */
  async applyToSubscribers(id: string, actorId: string): Promise<{ updated: number }> {
    const plan = await this.get(id);
    const snapshot = planSnapshotOf(plan) as unknown as Prisma.InputJsonValue;
    const res = await this.prisma.billingSubscription.updateMany({ where: { planId: id }, data: { planSnapshot: snapshot } });
    await this.prisma.billingEvent.create({ data: { actorId, type: 'PLAN_APPLIED', data: { code: plan.code, updated: res.count } } });
    this.entitlements.invalidate();
    return { updated: res.count };
  }
}
