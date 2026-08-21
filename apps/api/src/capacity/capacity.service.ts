import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma, TimeEntryCategory } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/jwt.strategy';
import {
  CreateHolidayDto, UpdateHolidayDto,
  CreateAvailabilityProfileDto, UpdateAvailabilityProfileDto,
  CreateCostProfileDto, UpdateCostProfileDto,
} from './dto/capacity.dto';

interface AvailabilityComputation {
  grossWorkingDays: number;
  netAvailableDays: number;
  netAvailableHours: number;
}

interface CostComputation {
  totalAnnualCost: number;
  costRatePerHour: number;
  breakEvenBillableRate: number;
  suggestedBillingRate: number;
}

interface SaleTierInput {
  label?: string | null;
  percent?: number | null;
  amount?: number | null;
}

interface SaleTierExisting {
  label: string | null;
  percent: number | null;
  amount: number | null;
}

interface SaleTiersComputation {
  saleTier1Label: string | null; saleTier1Percent: number | null; saleTier1Amount: number | null;
  saleTier2Label: string | null; saleTier2Percent: number | null; saleTier2Amount: number | null;
  saleTier3Label: string | null; saleTier3Percent: number | null; saleTier3Amount: number | null;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const DEFAULT_TIER_LABELS = ['Tarifa de Venta 1', 'Tarifa de Venta 2', 'Tarifa de Venta 3'];

@Injectable()
export class CapacityService {
  constructor(private prisma: PrismaService) {}

  // ─── HolidayConfig ─────────────────────────────────────────────────────────

  async getHolidays(year: number | undefined, user: AuthUser) {
    const where: Prisma.HolidayConfigWhereInput = {
      organizationId: user.organizationId,
      active: true,
    };
    if (year) {
      where.date = {
        gte: new Date(Date.UTC(year, 0, 1)),
        lt: new Date(Date.UTC(year + 1, 0, 1)),
      };
    }
    return this.prisma.holidayConfig.findMany({ where, orderBy: { date: 'asc' } });
  }

  async createHoliday(dto: CreateHolidayDto, user: AuthUser) {
    return this.prisma.holidayConfig.create({
      data: {
        organizationId: user.organizationId,
        date: new Date(dto.date),
        label: dto.label,
        recurring: dto.recurring ?? false,
      },
    });
  }

  async updateHoliday(id: string, dto: UpdateHolidayDto, user: AuthUser) {
    const existing = await this.prisma.holidayConfig.findFirst({
      where: { id, organizationId: user.organizationId },
    });
    if (!existing) throw new NotFoundException('Festivo no encontrado');

    return this.prisma.holidayConfig.update({
      where: { id },
      data: {
        ...(dto.date !== undefined && { date: new Date(dto.date) }),
        ...(dto.label !== undefined && { label: dto.label }),
        ...(dto.recurring !== undefined && { recurring: dto.recurring }),
        ...(dto.active !== undefined && { active: dto.active }),
      },
    });
  }

  async deleteHoliday(id: string, user: AuthUser) {
    const existing = await this.prisma.holidayConfig.findFirst({
      where: { id, organizationId: user.organizationId },
    });
    if (!existing) throw new NotFoundException('Festivo no encontrado');
    return this.prisma.holidayConfig.delete({ where: { id } });
  }

  // ─── UserAvailabilityProfile ───────────────────────────────────────────────

  async getMyAvailabilityProfile(year: number | undefined, user: AuthUser) {
    return this.getAvailabilityProfileForUser(user.id, year, user);
  }

  async getAvailabilityProfileForUser(targetUserId: string, year: number | undefined, user: AuthUser) {
    if (year) {
      return this.prisma.userAvailabilityProfile.findFirst({
        where: { organizationId: user.organizationId, userId: targetUserId, year },
      });
    }
    return this.prisma.userAvailabilityProfile.findMany({
      where: { organizationId: user.organizationId, userId: targetUserId },
      orderBy: { year: 'desc' },
    });
  }

  async getTeamAvailabilityProfiles(year: number | undefined, user: AuthUser) {
    if (!year) throw new BadRequestException('El parámetro "year" es requerido');
    return this.prisma.userAvailabilityProfile.findMany({
      where: { organizationId: user.organizationId, year },
      include: { user: { select: { id: true, name: true } } },
      orderBy: { user: { name: 'asc' } },
    });
  }

  async upsertAvailabilityProfile(dto: CreateAvailabilityProfileDto, user: AuthUser) {
    const workingDaysPerWeek = dto.workingDaysPerWeek ?? 5;
    const standardDailyHours = dto.standardDailyHours ?? 8;
    const annualVacationDays = dto.annualVacationDays ?? 15;
    const estimatedSickDays = dto.estimatedSickDays ?? 5;
    const estimatedLeaveDays = dto.estimatedLeaveDays ?? 3;

    const computed = await this.computeAvailability(
      user.organizationId, dto.year, workingDaysPerWeek, standardDailyHours,
      annualVacationDays, estimatedSickDays, estimatedLeaveDays,
    );

    const profile = await this.prisma.userAvailabilityProfile.upsert({
      where: {
        organizationId_userId_year: {
          organizationId: user.organizationId, userId: dto.userId, year: dto.year,
        },
      },
      create: {
        organizationId: user.organizationId,
        userId: dto.userId,
        year: dto.year,
        workingDaysPerWeek, standardDailyHours, annualVacationDays, estimatedSickDays, estimatedLeaveDays,
        ...computed,
      },
      update: {
        workingDaysPerWeek, standardDailyHours, annualVacationDays, estimatedSickDays, estimatedLeaveDays,
        ...computed,
      },
      include: { costProfile: true },
    });

    if (profile.costProfile) {
      await this.recalculateCostProfile(profile.costProfile.id);
    }

    return profile;
  }

  async updateAvailabilityProfile(id: string, dto: UpdateAvailabilityProfileDto, user: AuthUser) {
    const existing = await this.prisma.userAvailabilityProfile.findFirst({
      where: { id, organizationId: user.organizationId },
    });
    if (!existing) throw new NotFoundException('Perfil de disponibilidad no encontrado');

    const workingDaysPerWeek = dto.workingDaysPerWeek ?? existing.workingDaysPerWeek;
    const standardDailyHours = dto.standardDailyHours ?? existing.standardDailyHours;
    const annualVacationDays = dto.annualVacationDays ?? existing.annualVacationDays;
    const estimatedSickDays = dto.estimatedSickDays ?? existing.estimatedSickDays;
    const estimatedLeaveDays = dto.estimatedLeaveDays ?? existing.estimatedLeaveDays;

    const computed = await this.computeAvailability(
      user.organizationId, existing.year, workingDaysPerWeek, standardDailyHours,
      annualVacationDays, estimatedSickDays, estimatedLeaveDays,
    );

    const profile = await this.prisma.userAvailabilityProfile.update({
      where: { id },
      data: {
        workingDaysPerWeek, standardDailyHours, annualVacationDays, estimatedSickDays, estimatedLeaveDays,
        ...computed,
      },
      include: { costProfile: true },
    });

    if (profile.costProfile) {
      await this.recalculateCostProfile(profile.costProfile.id);
    }

    return profile;
  }

  /**
   * Calcula días laborales brutos del año calendario, descontando fines de
   * semana (según workingDaysPerWeek) y festivos configurados (exactos del
   * año o recurrentes de cualquier año, aplicados por mes/día).
   */
  private async computeGrossWorkingDays(
    organizationId: string, year: number, workingDaysPerWeek: number,
  ): Promise<number> {
    const holidays = await this.prisma.holidayConfig.findMany({
      where: { organizationId, active: true },
      select: { date: true, recurring: true },
    });

    const exactDates = new Set<string>();
    const recurringMonthDays = new Set<string>();
    for (const h of holidays) {
      const y = h.date.getUTCFullYear();
      const m = h.date.getUTCMonth();
      const d = h.date.getUTCDate();
      if (h.recurring) {
        recurringMonthDays.add(`${m}-${d}`);
      } else if (y === year) {
        exactDates.add(`${y}-${m}-${d}`);
      }
    }

    let grossWorkingDays = 0;
    const cursor = new Date(Date.UTC(year, 0, 1));
    const endExclusive = new Date(Date.UTC(year + 1, 0, 1));
    while (cursor < endExclusive) {
      const dow = cursor.getUTCDay(); // 0=domingo ... 6=sábado
      const isWorkingWeekday = workingDaysPerWeek >= 6 ? dow !== 0 : dow !== 0 && dow !== 6;
      if (isWorkingWeekday) {
        const y = cursor.getUTCFullYear();
        const m = cursor.getUTCMonth();
        const d = cursor.getUTCDate();
        const isHoliday = exactDates.has(`${y}-${m}-${d}`) || recurringMonthDays.has(`${m}-${d}`);
        if (!isHoliday) grossWorkingDays++;
      }
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return grossWorkingDays;
  }

  private async computeAvailability(
    organizationId: string,
    year: number,
    workingDaysPerWeek: number,
    standardDailyHours: number,
    annualVacationDays: number,
    estimatedSickDays: number,
    estimatedLeaveDays: number,
  ): Promise<AvailabilityComputation> {
    const grossWorkingDays = await this.computeGrossWorkingDays(organizationId, year, workingDaysPerWeek);
    const netAvailableDays = Math.max(
      0, grossWorkingDays - annualVacationDays - estimatedSickDays - estimatedLeaveDays,
    );
    const netAvailableHours = netAvailableDays * standardDailyHours;
    return { grossWorkingDays, netAvailableDays, netAvailableHours };
  }

  // ─── UserCostProfile ────────────────────────────────────────────────────────

  async getBillingRate(userId: string, year: number | undefined, user: AuthUser) {
    const profile = await this.prisma.userCostProfile.findFirst({
      where: { organizationId: user.organizationId, userId, ...(year ? { year } : {}) },
      orderBy: { year: 'desc' },
      select: { userId: true, year: true, suggestedBillingRate: true, effectiveOverrideRate: true },
    });
    if (!profile) throw new NotFoundException('Perfil de costo no encontrado para este usuario');
    return profile;
  }

  async getCostProfile(userId: string, year: number | undefined, user: AuthUser) {
    const profile = await this.prisma.userCostProfile.findFirst({
      where: { organizationId: user.organizationId, userId, ...(year ? { year } : {}) },
      orderBy: { year: 'desc' },
    });
    if (!profile) throw new NotFoundException('Perfil de costo no encontrado para este usuario');
    return profile;
  }

  async getCostProfiles(year: number | undefined, user: AuthUser) {
    if (!year) throw new BadRequestException('El parámetro "year" es requerido');
    return this.prisma.userCostProfile.findMany({
      where: { organizationId: user.organizationId, year },
      include: { user: { select: { id: true, name: true } } },
      orderBy: { user: { name: 'asc' } },
    });
  }

  async createCostProfile(dto: CreateCostProfileDto, user: AuthUser) {
    const [availabilityProfile, existingCostProfile] = await Promise.all([
      this.prisma.userAvailabilityProfile.findUnique({
        where: {
          organizationId_userId_year: {
            organizationId: user.organizationId, userId: dto.userId, year: dto.year,
          },
        },
      }),
      this.prisma.userCostProfile.findUnique({
        where: {
          organizationId_userId_year: {
            organizationId: user.organizationId, userId: dto.userId, year: dto.year,
          },
        },
      }),
    ]);

    const annualBaseSalary = dto.annualBaseSalary;
    const annualBonuses = dto.annualBonuses ?? 0;
    const payrollTaxRatePct = dto.payrollTaxRatePct ?? 0;
    const indirectCostRatePct = dto.indirectCostRatePct ?? 0;
    const otherAnnualCosts = dto.otherAnnualCosts ?? 0;
    const targetMultiplier = dto.targetMultiplier ?? 3.0;
    const targetUtilizationPct = dto.targetUtilizationPct ?? 75;
    const netHours = availabilityProfile?.netAvailableHours ?? dto.netAvailableHoursOverride ?? 0;

    const computed = this.computeCostFields({
      annualBaseSalary, annualBonuses, payrollTaxRatePct, indirectCostRatePct, otherAnnualCosts,
      targetMultiplier, targetUtilizationPct, netHours,
    });

    const effectiveOverrideRate = dto.effectiveOverrideRate ?? existingCostProfile?.effectiveOverrideRate ?? undefined;
    const baseRate = Number(effectiveOverrideRate ?? computed.suggestedBillingRate);
    const tiers = this.computeSaleTiers(
      baseRate,
      [
        { label: dto.saleTier1Label, percent: dto.saleTier1Percent, amount: dto.saleTier1Amount },
        { label: dto.saleTier2Label, percent: dto.saleTier2Percent, amount: dto.saleTier2Amount },
        { label: dto.saleTier3Label, percent: dto.saleTier3Percent, amount: dto.saleTier3Amount },
      ],
      existingCostProfile ? [
        { label: existingCostProfile.saleTier1Label, percent: existingCostProfile.saleTier1Percent, amount: existingCostProfile.saleTier1Amount != null ? Number(existingCostProfile.saleTier1Amount) : null },
        { label: existingCostProfile.saleTier2Label, percent: existingCostProfile.saleTier2Percent, amount: existingCostProfile.saleTier2Amount != null ? Number(existingCostProfile.saleTier2Amount) : null },
        { label: existingCostProfile.saleTier3Label, percent: existingCostProfile.saleTier3Percent, amount: existingCostProfile.saleTier3Amount != null ? Number(existingCostProfile.saleTier3Amount) : null },
      ] : undefined,
    );

    const data = {
      annualBaseSalary, annualBonuses, payrollTaxRatePct, indirectCostRatePct, otherAnnualCosts,
      targetMultiplier, targetUtilizationPct,
      ...(dto.effectiveOverrideRate !== undefined && { effectiveOverrideRate: dto.effectiveOverrideRate }),
      ...(dto.netAvailableHoursOverride !== undefined && { netAvailableHoursOverride: dto.netAvailableHoursOverride }),
      availabilityProfileId: availabilityProfile?.id,
      ...computed,
      ...tiers,
    };

    return this.prisma.userCostProfile.upsert({
      where: {
        organizationId_userId_year: {
          organizationId: user.organizationId, userId: dto.userId, year: dto.year,
        },
      },
      create: {
        organizationId: user.organizationId,
        userId: dto.userId,
        year: dto.year,
        ...data,
      },
      update: data,
    });
  }

  async updateCostProfile(id: string, dto: UpdateCostProfileDto, user: AuthUser) {
    const existing = await this.prisma.userCostProfile.findFirst({
      where: { id, organizationId: user.organizationId },
    });
    if (!existing) throw new NotFoundException('Perfil de costo no encontrado');

    const annualBaseSalary = dto.annualBaseSalary ?? Number(existing.annualBaseSalary);
    const annualBonuses = dto.annualBonuses ?? Number(existing.annualBonuses);
    const payrollTaxRatePct = dto.payrollTaxRatePct ?? existing.payrollTaxRatePct;
    const indirectCostRatePct = dto.indirectCostRatePct ?? existing.indirectCostRatePct;
    const otherAnnualCosts = dto.otherAnnualCosts ?? Number(existing.otherAnnualCosts);
    const targetMultiplier = dto.targetMultiplier ?? existing.targetMultiplier;
    const targetUtilizationPct = dto.targetUtilizationPct ?? existing.targetUtilizationPct;
    const netAvailableHoursOverride = dto.netAvailableHoursOverride ?? existing.netAvailableHoursOverride ?? undefined;

    let netHours = netAvailableHoursOverride ?? 0;
    if (existing.availabilityProfileId) {
      const avail = await this.prisma.userAvailabilityProfile.findUnique({
        where: { id: existing.availabilityProfileId },
      });
      netHours = avail?.netAvailableHours ?? netAvailableHoursOverride ?? 0;
    }

    const computed = this.computeCostFields({
      annualBaseSalary, annualBonuses, payrollTaxRatePct, indirectCostRatePct, otherAnnualCosts,
      targetMultiplier, targetUtilizationPct, netHours,
    });

    const effectiveOverrideRate = dto.effectiveOverrideRate ?? existing.effectiveOverrideRate ?? undefined;
    const baseRate = Number(effectiveOverrideRate ?? computed.suggestedBillingRate);
    const tiers = this.computeSaleTiers(
      baseRate,
      [
        { label: dto.saleTier1Label, percent: dto.saleTier1Percent, amount: dto.saleTier1Amount },
        { label: dto.saleTier2Label, percent: dto.saleTier2Percent, amount: dto.saleTier2Amount },
        { label: dto.saleTier3Label, percent: dto.saleTier3Percent, amount: dto.saleTier3Amount },
      ],
      [
        { label: existing.saleTier1Label, percent: existing.saleTier1Percent, amount: existing.saleTier1Amount != null ? Number(existing.saleTier1Amount) : null },
        { label: existing.saleTier2Label, percent: existing.saleTier2Percent, amount: existing.saleTier2Amount != null ? Number(existing.saleTier2Amount) : null },
        { label: existing.saleTier3Label, percent: existing.saleTier3Percent, amount: existing.saleTier3Amount != null ? Number(existing.saleTier3Amount) : null },
      ],
    );

    return this.prisma.userCostProfile.update({
      where: { id },
      data: {
        annualBaseSalary, annualBonuses, payrollTaxRatePct, indirectCostRatePct, otherAnnualCosts,
        targetMultiplier, targetUtilizationPct,
        ...(dto.effectiveOverrideRate !== undefined && { effectiveOverrideRate: dto.effectiveOverrideRate }),
        ...(dto.netAvailableHoursOverride !== undefined && { netAvailableHoursOverride: dto.netAvailableHoursOverride }),
        ...computed,
        ...tiers,
      },
    });
  }

  /**
   * Recalcula tasas de costo/facturación de un UserCostProfile a partir de sus
   * propios campos y de su UserAvailabilityProfile vinculado (si existe).
   * Se invoca cada vez que cambia la disponibilidad anual del usuario, porque
   * netAvailableHours es el denominador de costRatePerHour/breakEvenBillableRate.
   */
  async recalculateCostProfile(costProfileId: string) {
    const existing = await this.prisma.userCostProfile.findUnique({
      where: { id: costProfileId },
      include: { availabilityProfile: true },
    });
    if (!existing) return null;

    const netHours = existing.availabilityProfile?.netAvailableHours
      ?? existing.netAvailableHoursOverride
      ?? 0;

    const computed = this.computeCostFields({
      annualBaseSalary: Number(existing.annualBaseSalary),
      annualBonuses: Number(existing.annualBonuses),
      payrollTaxRatePct: existing.payrollTaxRatePct,
      indirectCostRatePct: existing.indirectCostRatePct,
      otherAnnualCosts: Number(existing.otherAnnualCosts),
      targetMultiplier: existing.targetMultiplier,
      targetUtilizationPct: existing.targetUtilizationPct,
      netHours,
    });

    // La Tarifa de Costo (base de las 3 tarifas de venta) pudo haber cambiado
    // — recalcular los 3 montos manteniendo los % ya guardados (fuente de verdad).
    const baseRate = Number(existing.effectiveOverrideRate ?? computed.suggestedBillingRate);
    const tiers = this.computeSaleTiers(
      baseRate,
      [{}, {}, {}],
      [
        { label: existing.saleTier1Label, percent: existing.saleTier1Percent, amount: null },
        { label: existing.saleTier2Label, percent: existing.saleTier2Percent, amount: null },
        { label: existing.saleTier3Label, percent: existing.saleTier3Percent, amount: null },
      ],
    );

    return this.prisma.userCostProfile.update({ where: { id: costProfileId }, data: { ...computed, ...tiers } });
  }

  private computeCostFields(input: {
    annualBaseSalary: number;
    annualBonuses: number;
    payrollTaxRatePct: number;
    indirectCostRatePct: number;
    otherAnnualCosts: number;
    targetMultiplier: number;
    targetUtilizationPct: number;
    netHours: number;
  }): CostComputation {
    const totalAnnualCost =
      input.annualBaseSalary +
      input.annualBonuses +
      (input.annualBaseSalary * input.payrollTaxRatePct) / 100 +
      (input.annualBaseSalary * input.indirectCostRatePct) / 100 +
      input.otherAnnualCosts;

    const netHours = input.netHours;
    const costRatePerHour = netHours > 0 ? totalAnnualCost / netHours : 0;
    const breakEvenBillableRate =
      netHours > 0 && input.targetUtilizationPct > 0
        ? totalAnnualCost / (netHours * (input.targetUtilizationPct / 100))
        : 0;
    const suggestedBillingRate = breakEvenBillableRate * input.targetMultiplier;

    return {
      totalAnnualCost: round2(totalAnnualCost),
      costRatePerHour: round2(costRatePerHour),
      breakEvenBillableRate: round2(breakEvenBillableRate),
      suggestedBillingRate: round2(suggestedBillingRate),
    };
  }

  /**
   * Calcula los 3 niveles de "Tarifa de Venta" a partir de la Tarifa de Costo
   * vigente (effectiveOverrideRate si está definida, si no suggestedBillingRate
   * recién calculada). Percent es la fuente de verdad: Amount SIEMPRE se
   * recalcula desde `baseRate * (1 + percent/100)`, incluso cuando nada cambió
   * en este tier — así, si la Tarifa de Costo se mueve (cambia salario,
   * disponibilidad, multiplicador...), los 3 montos de venta seguros
   * automáticamente sin que el usuario tenga que retocarlos.
   * Si en este request llega `amount` (el usuario tecleó el monto en vez del
   * %), se resuelve primero el % equivalente contra la baseRate ACTUAL y ese %
   * pasa a ser el nuevo valor persistido — nunca se guardan ambos de forma
   * independiente ni se deja que diverjan.
   */
  private computeSaleTiers(
    baseRate: number,
    input: [SaleTierInput, SaleTierInput, SaleTierInput],
    existing?: [SaleTierExisting, SaleTierExisting, SaleTierExisting],
  ): SaleTiersComputation {
    const tiers = input.map((t, i) => {
      const prev = existing?.[i];
      const label = t.label !== undefined ? t.label : prev?.label ?? DEFAULT_TIER_LABELS[i];

      let percent = t.percent !== undefined ? t.percent : prev?.percent ?? null;
      if (t.amount !== undefined && t.amount !== null) {
        percent = baseRate > 0 ? round2((t.amount / baseRate - 1) * 100) : 0;
      }

      const amount = percent !== null ? round2(baseRate * (1 + percent / 100)) : null;
      return { label, percent, amount };
    });

    return {
      saleTier1Label: tiers[0].label, saleTier1Percent: tiers[0].percent, saleTier1Amount: tiers[0].amount,
      saleTier2Label: tiers[1].label, saleTier2Percent: tiers[1].percent, saleTier2Amount: tiers[1].amount,
      saleTier3Label: tiers[2].label, saleTier3Percent: tiers[2].percent, saleTier3Amount: tiers[2].amount,
    };
  }

  // ─── Dashboard de la Firma ──────────────────────────────────────────────────
  /**
   * Vista agregada firm-wide, para ambos perfiles (Interna + Externa): utilización
   * real por persona, WIP aproximado, y ranking de encargos por variación de
   * presupuesto. Rol CAE+ (misma sensibilidad que Costeo y Tarifas — expone
   * agregados de costo/horas de toda la firma).
   *
   * "WIP aproximado" es una aproximación explícita — no existe todavía un modelo
   * de Facturación (ver docs del análisis "Horas y Rentabilidad", Fase 5, futura
   * y deliberadamente no diseñada). Se calcula como horas reales × tarifa pactada
   * (AuditTeam.agreedRatePerHour) de encargos con tarifa asignada — es el monto
   * de trabajo ya realizado que, en teoría, está pendiente de facturar.
   */
  async getFirmDashboard(year: number | undefined, user: AuthUser) {
    if (!year) throw new BadRequestException('El parámetro "year" es requerido');
    const yearStart = new Date(Date.UTC(year, 0, 1));
    const yearEnd = new Date(Date.UTC(year + 1, 0, 1));

    const [availabilityProfiles, entries, teamRates, openAudits] = await Promise.all([
      this.prisma.userAvailabilityProfile.findMany({
        where: { organizationId: user.organizationId, year },
        select: { userId: true, netAvailableHours: true, user: { select: { name: true } } },
      }),
      this.prisma.timeEntry.findMany({
        where: {
          organizationId: user.organizationId,
          workDate: { gte: yearStart, lt: yearEnd },
          category: { in: [TimeEntryCategory.CLIENT_BILLABLE, TimeEntryCategory.CLIENT_NON_BILLABLE] },
        },
        select: { userId: true, hours: true, auditId: true },
      }),
      this.prisma.auditTeam.findMany({
        where: { agreedRatePerHour: { not: null }, audit: { organizationId: user.organizationId } },
        select: { auditId: true, userId: true, agreedRatePerHour: true },
      }),
      this.prisma.audit.findMany({
        where: { organizationId: user.organizationId, status: { not: 'CLOSED' } },
        select: { id: true, title: true },
      }),
    ]);

    // ── Utilización por persona (horas ligadas a encargo ÷ horas netas disponibles) ──
    const hoursByUser = new Map<string, number>();
    for (const e of entries) hoursByUser.set(e.userId, (hoursByUser.get(e.userId) ?? 0) + e.hours);

    const utilizacionPorPersona = availabilityProfiles
      .map((p) => {
        const horasReales = round2(hoursByUser.get(p.userId) ?? 0);
        const utilizacionPct = p.netAvailableHours > 0 ? round2((horasReales / p.netAvailableHours) * 100) : null;
        return {
          userId: p.userId,
          userName: p.user.name,
          horasDisponibles: round2(p.netAvailableHours),
          horasReales,
          utilizacionPct,
        };
      })
      .sort((a, b) => (b.utilizacionPct ?? -1) - (a.utilizacionPct ?? -1));

    const conUtilizacion = utilizacionPorPersona.filter((p) => p.utilizacionPct !== null);
    const utilizacionPromedio = conUtilizacion.length > 0
      ? round2(conUtilizacion.reduce((s, p) => s + (p.utilizacionPct as number), 0) / conUtilizacion.length)
      : null;

    // ── WIP aproximado ──
    const rateMap = new Map(teamRates.map((t) => [`${t.auditId}:${t.userId}`, Number(t.agreedRatePerHour)]));
    let wipAproximado = 0;
    let horasConTarifa = 0;
    for (const e of entries) {
      if (!e.auditId) continue;
      const rate = rateMap.get(`${e.auditId}:${e.userId}`);
      if (rate !== undefined) { wipAproximado += e.hours * rate; horasConTarifa += e.hours; }
    }

    // ── Ranking de encargos abiertos por variación de presupuesto ──
    const [budgetByAudit, actualByAudit] = await Promise.all([
      this.prisma.auditTeam.groupBy({
        by: ['auditId'],
        where: { budgetedHours: { not: null }, audit: { organizationId: user.organizationId } },
        _sum: { budgetedHours: true },
      }),
      this.prisma.timeEntry.groupBy({
        by: ['auditId'],
        where: { organizationId: user.organizationId, auditId: { not: null } },
        _sum: { hours: true },
      }),
    ]);
    const budgetMap = new Map(budgetByAudit.map((b) => [b.auditId, b._sum.budgetedHours ?? 0]));
    const actualMap = new Map(actualByAudit.filter((a) => a.auditId).map((a) => [a.auditId as string, a._sum.hours ?? 0]));
    const auditInfoMap = new Map(openAudits.map((a) => [a.id, a]));

    const rankingEncargos = [...budgetMap.entries()]
      .map(([auditId, presupuestado]) => {
        const info = auditInfoMap.get(auditId);
        if (!info) return null; // encargo cerrado — no compite en el ranking de atención activa
        const real = round2(actualMap.get(auditId) ?? 0);
        const variacionPct = presupuestado > 0 ? round2(((real - presupuestado) / presupuestado) * 100) : null;
        return {
          auditId, auditTitle: info.title,
          horasPresupuestadas: round2(presupuestado), horasReales: real, variacionPct,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .sort((a, b) => (b.variacionPct ?? -Infinity) - (a.variacionPct ?? -Infinity));

    return {
      year,
      utilizacionPorPersona,
      utilizacionPromedio,
      wipAproximado: round2(wipAproximado),
      horasConTarifa: round2(horasConTarifa),
      rankingEncargos,
    };
  }
}
