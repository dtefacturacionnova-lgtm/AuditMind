import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ASSISTANT_KEYS, BILLABLE_ROLES, EXEMPT_PLAN_CODES, FUNCTION_KEYS, LICENSE_MONTHS, MODULE_KEYS } from './billing.constants';
import { BillingSettingsService } from './billing-settings.service';
import { addMonths, computeEntitlements } from './entitlements';
import { EntitlementsService } from './entitlements.service';
import { planSnapshotOf } from './plans.service';

const DAY_MS = 24 * 60 * 60 * 1000;
const daysBetween = (to: Date, from: Date) => Math.ceil((to.getTime() - from.getTime()) / DAY_MS);

export interface SubscriptionPatch {
  agreedPriceUsd?: number | null;
  extraUsers?: number;
  exempt?: boolean;
  notes?: string | null;
  overrides?: Record<string, unknown>;
  status?: 'ACTIVE' | 'SUSPENDED' | 'CANCELLED';
}

export type NoticeLevel = 'info' | 'warning' | 'critical';

@Injectable()
export class SubscriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: BillingSettingsService,
    private readonly entitlements: EntitlementsService,
  ) {}

  private async log(organizationId: string | null, actorId: string | null, type: string, data: Record<string, unknown> = {}) {
    await this.prisma.billingEvent.create({ data: { organizationId, actorId, type, data: data as Prisma.InputJsonValue } });
  }

  private async activePlan(code: string) {
    const plan = await this.prisma.billingPlan.findUnique({ where: { code }, include: { prices: true } });
    if (!plan || !plan.active) throw new NotFoundException(`El plan ${code} no existe o está inactivo.`);
    return plan;
  }

  /** Suscripción de una organización recién creada: prueba del plan indicado (o del plan por defecto); Piloto/Interno nacen exentos y sin vencimiento. */
  async createForNewOrganization(organizationId: string, planCode?: string | null) {
    const { defaultPlanCode } = await this.settings.get();
    const wanted = (planCode ?? '').trim().toUpperCase();
    let plan = wanted ? await this.prisma.billingPlan.findUnique({ where: { code: wanted } }) : null;
    if (!plan || !plan.active) plan = await this.prisma.billingPlan.findUnique({ where: { code: defaultPlanCode } });
    if (!plan) return null; // las tablas aún no tienen planes (SQL sin aplicar): no se crea nada
    const now = new Date();
    const exempt = EXEMPT_PLAN_CODES.includes(plan.code);
    const sub = await this.prisma.billingSubscription.upsert({
      where: { organizationId },
      update: {},
      create: {
        organizationId, planId: plan.id, planSnapshot: planSnapshotOf(plan) as unknown as Prisma.InputJsonValue,
        status: exempt ? 'ACTIVE' : 'TRIAL', months: 0, exempt,
        trialEndsAt: exempt ? null : new Date(now.getTime() + plan.trialDays * DAY_MS),
      },
    });
    await this.prisma.organization.update({ where: { id: organizationId }, data: { plan: plan.code.toLowerCase(), trialEndsAt: sub.trialEndsAt } });
    await this.log(organizationId, null, 'SUBSCRIPTION_CREATED', { plan: plan.code, trialEndsAt: sub.trialEndsAt });
    this.entitlements.invalidate(organizationId);
    return sub;
  }

  /** Contrata o cambia el plan: queda ACTIVA con la instantánea nueva y el periodo que corresponde a la duración elegida. */
  async assign(organizationId: string, input: { planCode: string; months: number; agreedPriceUsd?: number | null }, actorId: string) {
    if (!(LICENSE_MONTHS as readonly number[]).includes(input.months)) throw new BadRequestException('Duración no válida (usa 0, 1, 3, 6 o 12 meses).');
    const org = await this.prisma.organization.findUnique({ where: { id: organizationId }, select: { id: true } });
    if (!org) throw new NotFoundException('Organización no encontrada');
    const plan = await this.activePlan(input.planCode.trim().toUpperCase());
    const price = plan.prices.find((p) => p.months === input.months && p.active);
    const exempt = EXEMPT_PLAN_CODES.includes(plan.code);
    if (!price && !(exempt && input.months === 0)) {
      throw new BadRequestException(`El plan ${plan.code} no tiene precio activo para ${input.months === 0 ? 'licencia sin vencimiento' : input.months + ' mes(es)'}.`);
    }
    const now = new Date();
    const existing = await this.prisma.billingSubscription.findUnique({ where: { organizationId } });
    const data = {
      planId: plan.id, planSnapshot: planSnapshotOf(plan) as unknown as Prisma.InputJsonValue, status: 'ACTIVE' as const, months: input.months,
      priceUsd: price ? price.priceUsd : null, agreedPriceUsd: input.agreedPriceUsd ?? null, currentPeriodStart: now,
      currentPeriodEnd: input.months > 0 ? addMonths(now, input.months) : null, trialEndsAt: null, cancelRequestedAt: null, exempt,
      extraUsers: existing && existing.planId === plan.id ? existing.extraUsers : 0,
    };
    const sub = await this.prisma.billingSubscription.upsert({ where: { organizationId }, update: data, create: { organizationId, ...data } });
    await this.prisma.organization.update({ where: { id: organizationId }, data: { plan: plan.code.toLowerCase(), trialEndsAt: null } });
    await this.log(organizationId, actorId, 'PLAN_ASSIGNED', { plan: plan.code, months: input.months, agreedPriceUsd: input.agreedPriceUsd ?? null, previousPlanId: existing?.planId ?? null });
    this.entitlements.invalidate(organizationId);
    return sub;
  }

  /** Renueva sumando meses a partir del fin vigente (o de hoy si ya venció). Reactiva una cuenta en gracia o solo lectura. */
  async renew(organizationId: string, months: number | undefined, actorId: string, extra: Record<string, unknown> = {}) {
    const sub = await this.prisma.billingSubscription.findUnique({ where: { organizationId } });
    if (!sub) throw new NotFoundException('La organización no tiene suscripción.');
    const m = months ?? sub.months;
    if (!m || !(LICENSE_MONTHS as readonly number[]).includes(m) || m === 0) {
      throw new ConflictException('Esta licencia no vence o no tiene duración: indica 1, 3, 6 o 12 meses para renovar.');
    }
    const now = new Date();
    const base = sub.status === 'TRIAL' ? now : sub.currentPeriodEnd && sub.currentPeriodEnd > now ? sub.currentPeriodEnd : now;
    const updated = await this.prisma.billingSubscription.update({
      where: { organizationId },
      data: {
        status: 'ACTIVE', months: m, currentPeriodStart: base === now ? now : sub.currentPeriodStart ?? now, currentPeriodEnd: addMonths(base, m),
        trialEndsAt: null, cancelRequestedAt: null,
      },
    });
    await this.log(organizationId, actorId, 'RENEWED', { months: m, until: updated.currentPeriodEnd, ...extra });
    this.entitlements.invalidate(organizationId);
    return updated;
  }

  async extendTrial(organizationId: string, days: number, actorId: string) {
    if (!Number.isInteger(days) || days < 1 || days > 365) throw new BadRequestException('Los días deben estar entre 1 y 365.');
    const sub = await this.prisma.billingSubscription.findUnique({ where: { organizationId } });
    if (!sub) throw new NotFoundException('La organización no tiene suscripción.');
    const now = new Date();
    const base = sub.status === 'TRIAL' && sub.trialEndsAt && sub.trialEndsAt > now ? sub.trialEndsAt : now;
    const updated = await this.prisma.billingSubscription.update({
      where: { organizationId }, data: { status: 'TRIAL', trialEndsAt: new Date(base.getTime() + days * DAY_MS) },
    });
    await this.prisma.organization.update({ where: { id: organizationId }, data: { trialEndsAt: updated.trialEndsAt } });
    await this.log(organizationId, actorId, 'TRIAL_EXTENDED', { days, until: updated.trialEndsAt });
    this.entitlements.invalidate(organizationId);
    return updated;
  }

  private validateOverrides(o: Record<string, unknown>): Record<string, unknown> {
    const allowed = ['addModules', 'removeModules', 'addFunctions', 'removeFunctions', 'addAssistants', 'removeAssistants', 'limits'];
    const unknown = Object.keys(o).filter((k) => !allowed.includes(k));
    if (unknown.length) throw new BadRequestException(`Ajustes desconocidos: ${unknown.join(', ')}`);
    const check = (key: string, universe: readonly string[]) => {
      const v = o[key];
      if (v === undefined) return;
      if (!Array.isArray(v) || v.some((x) => typeof x !== 'string' || !universe.includes(x))) throw new BadRequestException(`«${key}» tiene valores no válidos.`);
    };
    check('addModules', MODULE_KEYS); check('removeModules', MODULE_KEYS);
    check('addFunctions', FUNCTION_KEYS); check('removeFunctions', FUNCTION_KEYS);
    check('addAssistants', ASSISTANT_KEYS); check('removeAssistants', ASSISTANT_KEYS);
    if (o.limits !== undefined && (typeof o.limits !== 'object' || o.limits === null || Array.isArray(o.limits))) throw new BadRequestException('«limits» debe ser un objeto.');
    return o;
  }

  /** Ajustes por cliente: precio pactado, usuarios extra, módulos/asistentes sueltos, exención y suspensión manual. */
  async update(organizationId: string, patch: SubscriptionPatch, actorId: string) {
    const sub = await this.prisma.billingSubscription.findUnique({ where: { organizationId } });
    if (!sub) throw new NotFoundException('La organización no tiene suscripción.');
    if (patch.extraUsers !== undefined && (!Number.isInteger(patch.extraUsers) || patch.extraUsers < 0)) throw new BadRequestException('Los usuarios extra deben ser un entero ≥ 0.');
    if (patch.agreedPriceUsd !== undefined && patch.agreedPriceUsd !== null && (!Number.isFinite(patch.agreedPriceUsd) || patch.agreedPriceUsd < 0)) throw new BadRequestException('El precio pactado no puede ser negativo.');
    const data: Prisma.BillingSubscriptionUpdateInput = {
      ...(patch.agreedPriceUsd !== undefined && { agreedPriceUsd: patch.agreedPriceUsd }),
      ...(patch.extraUsers !== undefined && { extraUsers: patch.extraUsers }),
      ...(patch.exempt !== undefined && { exempt: patch.exempt }),
      ...(patch.notes !== undefined && { notes: patch.notes }),
      ...(patch.overrides !== undefined && { overrides: this.validateOverrides(patch.overrides) as Prisma.InputJsonValue }),
      ...(patch.status !== undefined && { status: patch.status }),
    };
    const updated = await this.prisma.billingSubscription.update({ where: { organizationId }, data });
    await this.log(organizationId, actorId, 'SUBSCRIPTION_UPDATED', { fields: Object.keys(patch), ...(patch.status && { status: patch.status }) });
    this.entitlements.invalidate(organizationId);
    return updated;
  }

  async list() {
    const [subs, seatCounts, settings] = await Promise.all([
      this.prisma.billingSubscription.findMany({ include: { organization: { select: { id: true, name: true, active: true } } }, orderBy: { organization: { name: 'asc' } } }),
      this.prisma.user.groupBy({ by: ['organizationId'], where: { active: true, role: { in: [...BILLABLE_ROLES] as never[] } }, _count: { _all: true } }),
      this.settings.get(),
    ]);
    const seats = new Map(seatCounts.map((c) => [c.organizationId, c._count._all]));
    const now = new Date();
    return subs.map((s) => {
      const ent = computeEntitlements(
        { status: s.status, months: s.months, currentPeriodEnd: s.currentPeriodEnd, trialEndsAt: s.trialEndsAt, planSnapshot: s.planSnapshot, overrides: s.overrides, extraUsers: s.extraUsers, exempt: s.exempt },
        settings, now,
      );
      return {
        organizationId: s.organizationId, organizationName: s.organization.name, organizationActive: s.organization.active,
        planCode: ent.planCode, planName: ent.planName, audience: ent.audience, status: ent.status, storedStatus: s.status, months: s.months,
        endsAt: ent.endsAt, graceEndsAt: ent.graceEndsAt, trialEndsAt: s.trialEndsAt, priceUsd: s.priceUsd, agreedPriceUsd: s.agreedPriceUsd,
        extraUsers: s.extraUsers, exempt: s.exempt, notes: s.notes, overrides: s.overrides,
        seatsUsed: seats.get(s.organizationId) ?? 0, seatsAllowed: Number.isFinite(ent.seatsAllowed) ? ent.seatsAllowed : null,
        limits: ent.limits, modules: ent.modules, functions: ent.functions, assistants: ent.assistants,
      };
    });
  }

  async events(organizationId?: string, limit = 50) {
    return this.prisma.billingEvent.findMany({
      where: organizationId ? { organizationId } : {}, orderBy: { createdAt: 'desc' }, take: Math.min(Math.max(limit, 1), 200),
    });
  }

  /** Lo que ve el cliente en «Mi plan» y lo que usa el menú para mostrar u ocultar módulos. NUNCA incluye costos internos. */
  async summaryFor(organizationId: string) {
    const [org, settings, ent, sub] = await Promise.all([
      this.prisma.organization.findUnique({ where: { id: organizationId }, select: { id: true, name: true } }),
      this.settings.get(),
      this.entitlements.get(organizationId),
      this.prisma.billingSubscription.findUnique({ where: { organizationId }, select: { months: true, priceUsd: true, agreedPriceUsd: true, extraUsers: true, currentPeriodStart: true } }),
    ]);
    if (!org) throw new NotFoundException('Organización no encontrada');
    const used = await this.entitlements.countBillableUsers(organizationId);
    const now = new Date();
    const daysLeft = ent?.endsAt ? daysBetween(ent.endsAt, now) : null;
    let notice: { level: NoticeLevel; code: string; message: string } | null = null;
    if (ent && !ent.exempt) {
      if (ent.status === 'TRIAL' && daysLeft !== null && daysLeft <= 3) notice = { level: 'warning', code: 'TRIAL_ENDING', message: `Tu prueba termina en ${Math.max(daysLeft, 0)} día(s).` };
      else if (ent.status === 'ACTIVE' && daysLeft !== null && daysLeft <= 7) notice = { level: 'warning', code: 'EXPIRING', message: `Tu licencia vence en ${Math.max(daysLeft, 0)} día(s). Renueva para no pasar a solo lectura.` };
      else if (ent.status === 'GRACE') notice = { level: 'warning', code: 'GRACE', message: 'Tu licencia venció. Estás en periodo de gracia: renueva para evitar el solo lectura.' };
      else if (ent.status === 'READ_ONLY') notice = { level: 'critical', code: 'READ_ONLY', message: 'Tu licencia venció: la cuenta está en solo lectura. Puedes consultar y exportar; no se borró nada.' };
      else if (ent.status === 'SUSPENDED' || ent.status === 'CANCELLED') notice = { level: 'critical', code: ent.status, message: 'Tu cuenta está suspendida. Contacta a la plataforma para reactivarla.' };
    }
    return {
      organization: org,
      enforcementMode: settings.enforcementMode,
      hasSubscription: !!ent,
      plan: ent ? { code: ent.planCode, name: ent.planName, audience: ent.audience } : null,
      status: ent?.status ?? null,
      readOnly: ent?.readOnly ?? false,
      exempt: ent?.exempt ?? true,
      months: sub?.months ?? 0,
      endsAt: ent?.endsAt ?? null,
      graceEndsAt: ent?.graceEndsAt ?? null,
      daysLeft,
      modules: ent?.modules ?? [...MODULE_KEYS],
      functions: ent?.functions ?? [...FUNCTION_KEYS],
      assistants: ent?.assistants ?? [...ASSISTANT_KEYS],
      limits: ent?.limits ?? null,
      seats: { used, allowed: ent && Number.isFinite(ent.seatsAllowed) ? ent.seatsAllowed : null },
      notice,
    };
  }
}
