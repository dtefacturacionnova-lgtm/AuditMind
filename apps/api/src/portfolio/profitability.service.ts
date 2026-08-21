import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { TimeEntryCategory } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/jwt.strategy';

// Mismas categorías que TimesheetService considera "ligadas a un encargo" —
// las únicas que representan horas del equipo trabajadas para el cliente
// (facturables o no) y que por tanto cuentan como costo del encargo.
const BILLABLE_CATEGORIES: TimeEntryCategory[] = [
  TimeEntryCategory.CLIENT_BILLABLE,
  TimeEntryCategory.CLIENT_NON_BILLABLE,
];

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export interface HourYearBreakdown {
  year: number;
  hours: number;
  costRatePerHour: number | null;
  cost: number | null;
}

export interface PersonBreakdown {
  userId: string;
  userName: string;
  hoursByYear: HourYearBreakdown[];
  totalHours: number;
  totalCost: number;
  uncostedHours: number;
  // Tarifa pactada con el cliente (AuditTeam.billingRateType/agreedRatePerHour,
  // congelada al momento de la asignación — ver AuditsService.updateTeamMemberRate).
  // null = esta persona no tiene una tarifa asignada en el equipo del encargo.
  billingRateType: string | null;
  agreedRatePerHour: number | null;
  revenueByRate: number | null;
}

export interface AuditCostSummary {
  byPerson: PersonBreakdown[];
  totalHours: number;
  totalCost: number;
  uncostedHours: number;
  // Suma de horas × tarifa pactada, y horas de personas SIN tarifa asignada
  // (nunca se asumen a $0 — mismo criterio que uncostedHours).
  totalRevenueByRate: number;
  unratedHours: number;
}

export interface Revenue {
  feeAmount: number | null;
  feeCurrency: string | null;
}

export interface Margin {
  marginAmount: number | null;
  marginPercent: number | null;
}

@Injectable()
export class ProfitabilityService {
  constructor(private readonly prisma: PrismaService) {}

  // ── GET /portfolio/engagements/:id/profitability ────────────────────────────
  async getEngagementProfitability(id: string, user: AuthUser) {
    const engagement = await this.prisma.engagement.findUnique({
      where: { id },
      select: {
        id: true,
        organizationId: true,
        fiscalYear: true,
        auditId: true,
        client: { select: { legalName: true } },
        engagementLetter: { select: { proposalId: true } },
      },
    });
    if (!engagement || engagement.organizationId !== user.organizationId) {
      throw new NotFoundException('Encargo no encontrado');
    }

    const revenue = await this.resolveRevenue(engagement.engagementLetter?.proposalId ?? null);
    const ingreso = revenue.feeAmount !== null
      ? { feeAmount: revenue.feeAmount, feeCurrency: revenue.feeCurrency as string }
      : null;
    const base = {
      clientName: engagement.client.legalName,
      fiscalYear: engagement.fiscalYear,
      ingreso,
      auditId: engagement.auditId,
    };

    // Encargo aún no aprobado: no existe Audit real, por lo tanto no puede
    // haber TimeEntry ligada a él. Estado válido, no un error — el frontend
    // distingue este caso mirando `auditId === null`, no un campo aparte.
    if (!engagement.auditId) {
      return {
        ...base,
        porPersona: [],
        totales: {
          horasTotales: 0, costoTotal: 0, horasSinCostear: 0, margenAbsoluto: null, margenPct: null,
          ingresoPorTarifa: 0, horasSinTarifa: 0, margenPorTarifaAbsoluto: null, margenPorTarifaPct: null,
        },
      };
    }

    const summary = await this.computeAuditCostSummary(engagement.auditId, user.organizationId);
    const margin = this.computeMargin(revenue.feeAmount, summary.totalCost);
    const marginByRate = this.computeMarginByRate(summary);

    return {
      ...base,
      porPersona: summary.byPerson.map((p) => ({
        userId: p.userId,
        userName: p.userName,
        horasTotales: p.totalHours,
        // null solo cuando NINGUNA de las horas de esta persona pudo costearse
        // (sin UserCostProfile para ningún año trabajado) — si es parcial, se
        // muestra el costo de la porción sí costeada y las horas sin costear
        // quedan visibles aparte, nunca mezcladas como si fueran $0.
        costoCalculado: p.totalHours > 0 && p.uncostedHours === p.totalHours ? null : p.totalCost,
        horasSinCostear: p.uncostedHours,
        // Tarifa pactada con el cliente (Equipo del Encargo) — null si esta
        // persona no tiene una tarifa asignada todavía.
        tarifaTipo: p.billingRateType,
        tarifaPorHora: p.agreedRatePerHour,
        ingresoPorTarifa: p.revenueByRate,
      })),
      totales: {
        horasTotales: summary.totalHours,
        costoTotal: summary.totalCost,
        horasSinCostear: summary.uncostedHours,
        margenAbsoluto: margin.marginAmount,
        margenPct: margin.marginPercent,
        ingresoPorTarifa: summary.totalRevenueByRate,
        horasSinTarifa: summary.unratedHours,
        margenPorTarifaAbsoluto: marginByRate.marginAmount,
        margenPorTarifaPct: marginByRate.marginPercent,
      },
    };
  }

  // ── GET /portfolio/profitability?year= ───────────────────────────────────────
  async listProfitability(year: number | undefined, user: AuthUser) {
    if (!year) throw new BadRequestException('El parámetro "year" es requerido');

    const engagements = await this.prisma.engagement.findMany({
      where: {
        organizationId: user.organizationId,
        fiscalYear: year,
        auditId: { not: null },
      },
      select: {
        id: true,
        clientId: true,
        fiscalYear: true,
        auditId: true,
        client: { select: { legalName: true } },
        engagementLetter: { select: { proposalId: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const rows = await Promise.all(
      engagements.map(async (e) => {
        const [revenue, summary] = await Promise.all([
          this.resolveRevenue(e.engagementLetter?.proposalId ?? null),
          // auditId no puede ser null acá — filtrado arriba con { not: null }
          this.computeAuditCostSummary(e.auditId as string, user.organizationId),
        ]);
        const margin = this.computeMargin(revenue.feeAmount, summary.totalCost);
        const marginByRate = this.computeMarginByRate(summary);

        return {
          engagementId: e.id,
          clientId: e.clientId,
          clientName: e.client.legalName,
          fiscalYear: e.fiscalYear,
          ingreso: revenue.feeAmount !== null
            ? { feeAmount: revenue.feeAmount, feeCurrency: revenue.feeCurrency as string }
            : null,
          auditId: e.auditId,
          totales: {
            horasTotales: summary.totalHours,
            costoTotal: summary.totalCost,
            horasSinCostear: summary.uncostedHours,
            margenAbsoluto: margin.marginAmount,
            margenPct: margin.marginPercent,
            ingresoPorTarifa: summary.totalRevenueByRate,
            horasSinTarifa: summary.unratedHours,
            margenPorTarifaAbsoluto: marginByRate.marginAmount,
            margenPorTarifaPct: marginByRate.marginPercent,
          },
        };
      }),
    );

    // Orden por margen % descendente. Los casos sin base confiable para
    // comparar (sin ingreso conocido, o con horas sin costear que dejarían el
    // costo — y por tanto el margen — subestimado) se empujan al final, en
    // vez de intercalarse engañosamente entre márgenes completos.
    return rows.sort((a, b) => {
      const aUnorderable = a.totales.margenPct === null || a.totales.horasSinCostear > 0;
      const bUnorderable = b.totales.margenPct === null || b.totales.horasSinCostear > 0;
      if (aUnorderable && bUnorderable) return 0;
      if (aUnorderable) return 1;
      if (bUnorderable) return -1;
      return (b.totales.margenPct as number) - (a.totales.margenPct as number);
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  /** Ingreso conocido del encargo, resuelto vía EngagementLetter → Proposal. null si no hay honorario definido. */
  private async resolveRevenue(proposalId: string | null): Promise<Revenue> {
    if (!proposalId) return { feeAmount: null, feeCurrency: null };
    const proposal = await this.prisma.proposal.findUnique({
      where: { id: proposalId },
      select: { feeAmount: true, feeCurrency: true },
    });
    if (!proposal || proposal.feeAmount === null) return { feeAmount: null, feeCurrency: null };
    return { feeAmount: round2(Number(proposal.feeAmount)), feeCurrency: proposal.feeCurrency };
  }

  private computeMargin(feeAmount: number | null, cost: number): Margin {
    if (feeAmount === null) return { marginAmount: null, marginPercent: null };
    const marginAmount = round2(feeAmount - cost);
    // feeAmount === 0 dejaría un % indefinido (división por cero) — mismo
    // criterio que "sin ingreso": no se puede expresar de forma significativa.
    const marginPercent = feeAmount !== 0 ? round2((marginAmount / feeAmount) * 100) : null;
    return { marginAmount, marginPercent };
  }

  /**
   * Margen basado en horas reales × tarifa pactada por persona (Equipo del
   * Encargo) — vista distinta y complementaria a `computeMargin` (que usa el
   * honorario fijo de la Propuesta). null si NADIE del equipo tiene tarifa
   * asignada todavía — no se asume ingreso $0 solo porque nadie la configuró.
   */
  private computeMarginByRate(summary: AuditCostSummary): Margin {
    const everyoneUnrated = summary.totalHours > 0 && summary.unratedHours === summary.totalHours;
    if (everyoneUnrated) return { marginAmount: null, marginPercent: null };
    return this.computeMargin(summary.totalRevenueByRate, summary.totalCost);
  }

  /**
   * Costo real del encargo a partir de las TimeEntry facturables/no facturables
   * de cliente ligadas a su Audit, agrupadas por persona y por año calendario
   * de `workDate` (un encargo puede cruzar el fin de año, y el costo por hora
   * de una persona depende del UserCostProfile del año en que trabajó, no de
   * un valor fijo). Horas de una persona+año sin UserCostProfile cargado
   * quedan explícitamente en `uncostedHours` — NUNCA se asumen a costo $0.
   */
  private async computeAuditCostSummary(auditId: string, organizationId: string): Promise<AuditCostSummary> {
    const entries = await this.prisma.timeEntry.findMany({
      where: { organizationId, auditId, category: { in: BILLABLE_CATEGORIES } },
      select: { userId: true, workDate: true, hours: true },
    });

    if (entries.length === 0) {
      return { byPerson: [], totalHours: 0, totalCost: 0, uncostedHours: 0, totalRevenueByRate: 0, unratedHours: 0 };
    }

    // userId -> año -> horas acumuladas
    const byUser = new Map<string, Map<number, number>>();
    for (const e of entries) {
      const year = e.workDate.getUTCFullYear();
      if (!byUser.has(e.userId)) byUser.set(e.userId, new Map());
      const yearMap = byUser.get(e.userId)!;
      yearMap.set(year, (yearMap.get(year) ?? 0) + e.hours);
    }

    const userIds = [...byUser.keys()];
    const years = [...new Set(entries.map((e) => e.workDate.getUTCFullYear()))];

    const [users, costProfiles, teamRates] = await Promise.all([
      this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }),
      this.prisma.userCostProfile.findMany({
        where: { organizationId, userId: { in: userIds }, year: { in: years } },
        select: { userId: true, year: true, costRatePerHour: true },
      }),
      this.prisma.auditTeam.findMany({
        where: { auditId, userId: { in: userIds } },
        select: { userId: true, billingRateType: true, agreedRatePerHour: true },
      }),
    ]);

    const userNameMap = new Map(users.map((u) => [u.id, u.name]));
    const costMap = new Map(costProfiles.map((cp) => [`${cp.userId}:${cp.year}`, Number(cp.costRatePerHour)]));
    const rateMap = new Map(teamRates.map((t) => [t.userId, t]));

    let totalHours = 0;
    let totalCost = 0;
    let uncostedHours = 0;
    let totalRevenueByRate = 0;
    let unratedHours = 0;

    const byPerson: PersonBreakdown[] = [...byUser.entries()].map(([userId, yearMap]) => {
      let personHours = 0;
      let personCost = 0;
      let personUncosted = 0;

      const hoursByYear: HourYearBreakdown[] = [...yearMap.entries()]
        .sort(([yearA], [yearB]) => yearA - yearB)
        .map(([year, hours]) => {
          const rate = costMap.get(`${userId}:${year}`);
          const cost = rate !== undefined ? round2(hours * rate) : null;
          personHours += hours;
          if (cost !== null) personCost += cost;
          else personUncosted += hours;
          return { year, hours: round2(hours), costRatePerHour: rate ?? null, cost };
        });

      totalHours += personHours;
      totalCost += personCost;
      uncostedHours += personUncosted;

      const agreedRate = rateMap.get(userId);
      const agreedRatePerHour = agreedRate?.agreedRatePerHour != null ? Number(agreedRate.agreedRatePerHour) : null;
      const revenueByRate = agreedRatePerHour !== null ? round2(personHours * agreedRatePerHour) : null;
      if (revenueByRate !== null) totalRevenueByRate += revenueByRate;
      else unratedHours += personHours;

      return {
        userId,
        userName: userNameMap.get(userId) ?? userId,
        hoursByYear,
        totalHours: round2(personHours),
        totalCost: round2(personCost),
        uncostedHours: round2(personUncosted),
        billingRateType: agreedRate?.billingRateType ?? null,
        agreedRatePerHour,
        revenueByRate,
      };
    });

    return {
      byPerson,
      totalHours: round2(totalHours),
      totalCost: round2(totalCost),
      uncostedHours: round2(uncostedHours),
      totalRevenueByRate: round2(totalRevenueByRate),
      unratedHours: round2(unratedHours),
    };
  }
}
