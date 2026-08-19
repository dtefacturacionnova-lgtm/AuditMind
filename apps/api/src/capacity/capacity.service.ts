import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

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
    const availabilityProfile = await this.prisma.userAvailabilityProfile.findUnique({
      where: {
        organizationId_userId_year: {
          organizationId: user.organizationId, userId: dto.userId, year: dto.year,
        },
      },
    });

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

    const data = {
      annualBaseSalary, annualBonuses, payrollTaxRatePct, indirectCostRatePct, otherAnnualCosts,
      targetMultiplier, targetUtilizationPct,
      ...(dto.effectiveOverrideRate !== undefined && { effectiveOverrideRate: dto.effectiveOverrideRate }),
      ...(dto.netAvailableHoursOverride !== undefined && { netAvailableHoursOverride: dto.netAvailableHoursOverride }),
      availabilityProfileId: availabilityProfile?.id,
      ...computed,
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

    return this.prisma.userCostProfile.update({
      where: { id },
      data: {
        annualBaseSalary, annualBonuses, payrollTaxRatePct, indirectCostRatePct, otherAnnualCosts,
        targetMultiplier, targetUtilizationPct,
        ...(dto.effectiveOverrideRate !== undefined && { effectiveOverrideRate: dto.effectiveOverrideRate }),
        ...(dto.netAvailableHoursOverride !== undefined && { netAvailableHoursOverride: dto.netAvailableHoursOverride }),
        ...computed,
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

    return this.prisma.userCostProfile.update({ where: { id: costProfileId }, data: computed });
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
}
