import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { EngagementStatus, FeeType, TimeEntryCategory } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/jwt.strategy';
import { resolveBillRate, resolveCostRate } from '../timesheet/frozen-rates';

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
  /** Costo por hora efectivo de las horas costeadas de ese año (promedio si el año mezcla meses cerrados y abiertos). null = ninguna se pudo costear. */
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
  /** Horas de meses todavía no cerrados: se costean con el perfil vigente y pueden cambiar. */
  provisionalHours: number;
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
  /** Horas de meses sin cerrar (cifra provisional). Con el cierre de horas apagado son todas. */
  provisionalHours: number;
  // Suma de horas × tarifa pactada, y horas de personas SIN tarifa asignada
  // (nunca se asumen a $0 — mismo criterio que uncostedHours).
  totalRevenueByRate: number;
  unratedHours: number;
}

export interface Revenue {
  feeAmount: number | null;
  feeCurrency: string | null;
  /** De dónde sale el ingreso: el honorario del encargo en Cobranza (con sus adendas) o, a falta de él, el de la propuesta. */
  source: 'FEE' | 'PROPOSAL' | null;
  /** Por qué no hay ingreso (o de dónde viene) cuando no es evidente; se muestra junto a la cifra. */
  note: string | null;
}

export interface Margin {
  marginAmount: number | null;
  marginPercent: number | null;
}

const emptySummary = (): AuditCostSummary => ({
  byPerson: [], totalHours: 0, totalCost: 0, uncostedHours: 0, provisionalHours: 0, totalRevenueByRate: 0, unratedHours: 0,
});

/** Acumulador de una persona en un año calendario. */
interface YearAcc {
  hours: number; cost: number; costedHours: number; uncosted: number; provisional: number;
  revenue: number; ratedHours: number; unrated: number;
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

    const revenue = (await this.resolveRevenues(user.organizationId, [engagement])).get(engagement.id) ?? NO_REVENUE;
    const ingreso = revenue.feeAmount !== null
      ? { feeAmount: revenue.feeAmount, feeCurrency: revenue.feeCurrency as string }
      : null;
    const base = {
      clientName: engagement.client.legalName,
      fiscalYear: engagement.fiscalYear,
      ingreso,
      ingresoOrigen: revenue.source,
      ingresoAviso: revenue.note,
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
          horasTotales: 0, costoTotal: 0, horasSinCostear: 0, horasProvisionales: 0, margenAbsoluto: null, margenPct: null,
          ingresoPorTarifa: 0, horasSinTarifa: 0, margenPorTarifaAbsoluto: null, margenPorTarifaPct: null,
        },
      };
    }

    const summary = (await this.computeAuditCostSummaries([engagement.auditId], user.organizationId)).get(engagement.auditId)
      ?? emptySummary();
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
        horasProvisionales: p.provisionalHours,
        // Tarifa pactada con el cliente (Equipo del Encargo) — null si esta
        // persona no tiene una tarifa asignada todavía.
        tarifaTipo: p.billingRateType,
        tarifaPorHora: p.agreedRatePerHour,
        ingresoPorTarifa: p.revenueByRate,
      })),
      totales: this.totalsOf(summary, margin, marginByRate),
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

    // Una consulta por tipo de dato para TODOS los encargos (antes eran ~5 consultas por encargo).
    const [revenues, summaries] = await Promise.all([
      this.resolveRevenues(user.organizationId, engagements),
      // auditId no puede ser null acá — filtrado arriba con { not: null }
      this.computeAuditCostSummaries(engagements.map((e) => e.auditId as string), user.organizationId),
    ]);

    const rows = engagements.map((e) => {
      const revenue = revenues.get(e.id) ?? NO_REVENUE;
      const summary = summaries.get(e.auditId as string) ?? emptySummary();
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
        ingresoOrigen: revenue.source,
        ingresoAviso: revenue.note,
        auditId: e.auditId,
        totales: this.totalsOf(summary, margin, marginByRate),
      };
    });

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

  // ── Resumen financiero de un encargo, para consumo de otros módulos (Comité) ──
  // Combina costo + ingreso + margen en un solo objeto liviano — a diferencia de
  // `getEngagementProfitability` (que expone el desglose completo por persona
  // para la pantalla de Cartera), esto es lo mínimo que un consumidor externo
  // necesita para una tabla de "horas/costo/utilidad por auditoría". `asOf`
  // permite cortar las horas a una fecha (ej. el cierre del período del
  // Comité) — sin él, se comportan igual que los métodos existentes (todo el
  // historial de TimeEntry del encargo).
  async getAuditFinancialSummary(auditId: string, organizationId: string, asOf?: Date): Promise<AuditFinancialSummary> {
    const engagement = await this.prisma.engagement.findFirst({
      where: { auditId, organizationId },
      select: { id: true, engagementLetter: { select: { proposalId: true } } },
    });
    const [revenues, summaries] = await Promise.all([
      this.resolveRevenues(organizationId, engagement ? [engagement] : []),
      this.computeAuditCostSummaries([auditId], organizationId, asOf),
    ]);
    return this.financialSummaryOf((engagement && revenues.get(engagement.id)) || NO_REVENUE, summaries.get(auditId) ?? emptySummary());
  }

  // ── Rentabilidad agregada de TODA la organización, para el dashboard de
  // Comité (extensión del roadmap pendiente desde PT-B4/Comité, 2026-08-23).
  // Usa el MISMO cálculo de costo que cada encargo (computeAuditCostSummaries) —
  // NO reimplementa el costo en SQL crudo — para preservar la regla de negocio de
  // que las horas sin costear NUNCA se asumen $0. Desde la Fase 2 del cierre de
  // horas lo hace con consultas agrupadas (6 en total, no ~6 por encargo).
  async getOrgWideProfitability(organizationId: string, asOf?: Date) {
    const engagements = await this.prisma.engagement.findMany({
      where: { organizationId, auditId: { not: null } },
      select: { id: true, auditId: true, engagementLetter: { select: { proposalId: true } } },
    });

    const [revenues, costs] = await Promise.all([
      this.resolveRevenues(organizationId, engagements),
      this.computeAuditCostSummaries(engagements.map((e) => e.auditId as string), organizationId, asOf),
    ]);
    const summaries = engagements.map((e) => this.financialSummaryOf(
      revenues.get(e.id) ?? NO_REVENUE,
      costs.get(e.auditId as string) ?? emptySummary(),
    ));

    let totalIncome = 0;
    let totalCost = 0;
    let totalMargin = 0;
    let provisionalHours = 0;
    let engagementsWithRevenue = 0;
    let engagementsWithMargin = 0;

    for (const s of summaries) {
      totalCost += s.cost;
      provisionalHours += s.provisionalHours;
      if (s.revenue !== null) {
        totalIncome += s.revenue;
        engagementsWithRevenue++;
      }
      if (s.margin !== null) {
        totalMargin += s.margin;
        engagementsWithMargin++;
      }
    }

    return {
      engagementsTotal: summaries.length,
      engagementsWithRevenue,
      engagementsWithMargin,
      totalIncome: round2(totalIncome),
      totalCost: round2(totalCost),
      totalMargin: round2(totalMargin),
      totalMarginPct: totalIncome !== 0 ? round2((totalMargin / totalIncome) * 100) : null,
      provisionalHours: round2(provisionalHours),
    };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private totalsOf(summary: AuditCostSummary, margin: Margin, marginByRate: Margin) {
    return {
      horasTotales: summary.totalHours,
      costoTotal: summary.totalCost,
      horasSinCostear: summary.uncostedHours,
      horasProvisionales: summary.provisionalHours,
      margenAbsoluto: margin.marginAmount,
      margenPct: margin.marginPercent,
      ingresoPorTarifa: summary.totalRevenueByRate,
      horasSinTarifa: summary.unratedHours,
      margenPorTarifaAbsoluto: marginByRate.marginAmount,
      margenPorTarifaPct: marginByRate.marginPercent,
    };
  }

  private financialSummaryOf(revenue: Revenue, summary: AuditCostSummary): AuditFinancialSummary {
    const margin = this.computeMargin(revenue.feeAmount, summary.totalCost);
    return {
      hoursTotal: summary.totalHours,
      cost: summary.totalCost,
      uncostedHours: summary.uncostedHours,
      provisionalHours: summary.provisionalHours,
      revenue: revenue.feeAmount,
      feeCurrency: revenue.feeCurrency,
      margin: margin.marginAmount,
      marginPct: margin.marginPercent,
    };
  }

  /**
   * Ingreso de cada encargo, por id de encargo y en pocas consultas (no una por encargo).
   *  1. Si el encargo tiene honorario en Cobranza, ese manda: es el vigente, con sus adendas, en USD neto. Uno por tiempo no tiene
   *     monto fijo y queda sin ingreso (con aviso).
   *  2. Si no, el de la propuesta de su carta, SOLO cuando esa propuesta respalda un único encargo vigente. Una carta puede
   *     servir a varios ejercicios o consultorías: dar a cada uno el monto completo contaría el mismo honorario varias veces,
   *     así que ahí queda sin ingreso y se pide registrarlo en Cobranza.
   * Nunca se asume $0: lo desconocido es null.
   */
  private async resolveRevenues(
    organizationId: string,
    engagements: Array<{ id: string; engagementLetter?: { proposalId: string | null } | null }>,
  ): Promise<Map<string, Revenue>> {
    const out = new Map<string, Revenue>();
    if (engagements.length === 0) return out;

    const fees = await this.prisma.engagementFee.findMany({
      where: { organizationId, engagementId: { in: engagements.map((e) => e.id) } },
      select: { engagementId: true, feeType: true, totalAmount: true },
    });
    const feeByEngagement = new Map(fees.map((f) => [f.engagementId, f]));

    const proposalIds = [...new Set(
      engagements.filter((e) => !feeByEngagement.has(e.id)).map((e) => e.engagementLetter?.proposalId).filter((v): v is string => !!v),
    )];
    const proposals = new Map<string, { feeAmount: number | null; feeCurrency: string }>();
    const livingEngagements = new Map<string, number>();
    if (proposalIds.length > 0) {
      const [rows, backed] = await Promise.all([
        this.prisma.proposal.findMany({ where: { id: { in: proposalIds } }, select: { id: true, feeAmount: true, feeCurrency: true } }),
        this.prisma.engagement.findMany({
          where: { organizationId, status: { not: EngagementStatus.CANCELLED }, engagementLetter: { proposalId: { in: proposalIds } } },
          select: { engagementLetter: { select: { proposalId: true } } },
        }),
      ]);
      for (const p of rows) proposals.set(p.id, { feeAmount: p.feeAmount === null ? null : round2(Number(p.feeAmount)), feeCurrency: p.feeCurrency });
      for (const b of backed) {
        const pid = b.engagementLetter?.proposalId;
        if (pid) livingEngagements.set(pid, (livingEngagements.get(pid) ?? 0) + 1);
      }
    }

    for (const e of engagements) {
      const fee = feeByEngagement.get(e.id);
      if (fee) {
        if (fee.feeType === FeeType.FIXED && fee.totalAmount !== null) {
          out.set(e.id, { feeAmount: round2(Number(fee.totalAmount)), feeCurrency: 'USD', source: 'FEE', note: null });
        } else {
          out.set(e.id, { feeAmount: null, feeCurrency: null, source: 'FEE', note: 'Honorario por tiempo: no tiene un monto fijo con el cual calcular el margen.' });
        }
        continue;
      }
      const pid = e.engagementLetter?.proposalId;
      const proposal = pid ? proposals.get(pid) : undefined;
      if (!pid || !proposal || proposal.feeAmount === null) continue;
      if ((livingEngagements.get(pid) ?? 0) > 1) {
        out.set(e.id, {
          feeAmount: null, feeCurrency: null, source: 'PROPOSAL',
          note: 'La carta de compromiso respalda varios encargos vigentes: registra el honorario de este encargo en Cobranza.',
        });
      } else {
        out.set(e.id, { feeAmount: proposal.feeAmount, feeCurrency: proposal.feeCurrency, source: 'PROPOSAL', note: null });
      }
    }
    return out;
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
   * Costo real de VARIOS encargos a la vez a partir de las TimeEntry facturables/no facturables de cliente, con una sola
   * consulta por tipo de dato (horas, personas, perfiles de costeo, tarifas del equipo).
   *
   * Cada hora se costea una por una (ver `frozen-rates.ts`): si su mes está CERRADO vale el costo y la tarifa congelados al
   * cerrar; si no, el perfil de costeo del año de `workDate` y la tarifa pactada vigentes, y cuenta como provisional.
   * Horas sin costo (persona+año sin UserCostProfile, o mes cerrado sin costo congelado) quedan en `uncostedHours` — NUNCA
   * se asumen a $0. Lo mismo con la tarifa: horas sin tarifa quedan en `unratedHours`.
   */
  private async computeAuditCostSummaries(
    auditIds: string[], organizationId: string, asOf?: Date,
  ): Promise<Map<string, AuditCostSummary>> {
    const ids = [...new Set(auditIds)];
    const result = new Map<string, AuditCostSummary>(ids.map((id) => [id, emptySummary()]));
    if (ids.length === 0) return result;

    const entries = await this.prisma.timeEntry.findMany({
      where: {
        organizationId, auditId: { in: ids }, category: { in: BILLABLE_CATEGORIES },
        ...(asOf ? { workDate: { lte: asOf } } : {}),
      },
      select: {
        auditId: true, userId: true, workDate: true, hours: true,
        closedAt: true, costRateSnapshot: true, billRateSnapshot: true,
      },
    });
    if (entries.length === 0) return result;

    const userIds = [...new Set(entries.map((e) => e.userId))];
    const years = [...new Set(entries.map((e) => e.workDate.getUTCFullYear()))];

    const [users, costProfiles, teamRates] = await Promise.all([
      this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }),
      this.prisma.userCostProfile.findMany({
        where: { organizationId, userId: { in: userIds }, year: { in: years } },
        select: { userId: true, year: true, costRatePerHour: true },
      }),
      this.prisma.auditTeam.findMany({
        where: { auditId: { in: ids }, userId: { in: userIds } },
        select: { auditId: true, userId: true, billingRateType: true, agreedRatePerHour: true },
      }),
    ]);

    const userNameMap = new Map(users.map((u) => [u.id, u.name]));
    const costMap = new Map(costProfiles.map((cp) => [`${cp.userId}:${cp.year}`, Number(cp.costRatePerHour)]));
    const rateMap = new Map(teamRates.map((t) => [`${t.auditId}:${t.userId}`, t]));

    // auditId -> userId -> año -> acumulado
    const acc = new Map<string, Map<string, Map<number, YearAcc>>>();
    for (const e of entries) {
      const auditId = e.auditId as string;
      const year = e.workDate.getUTCFullYear();
      const byUser = acc.get(auditId) ?? acc.set(auditId, new Map()).get(auditId)!;
      const byYear = byUser.get(e.userId) ?? byUser.set(e.userId, new Map()).get(e.userId)!;
      const a = byYear.get(year) ?? byYear.set(year, {
        hours: 0, cost: 0, costedHours: 0, uncosted: 0, provisional: 0, revenue: 0, ratedHours: 0, unrated: 0,
      }).get(year)!;

      const team = rateMap.get(`${auditId}:${e.userId}`);
      const liveBill = team?.agreedRatePerHour != null ? Number(team.agreedRatePerHour) : null;
      const cost = resolveCostRate(e, costMap.get(`${e.userId}:${year}`));
      const bill = resolveBillRate(e, liveBill);

      a.hours += e.hours;
      if (cost.rate !== null) { a.cost += e.hours * cost.rate; a.costedHours += e.hours; } else { a.uncosted += e.hours; }
      if (bill.rate !== null) { a.revenue += e.hours * bill.rate; a.ratedHours += e.hours; } else { a.unrated += e.hours; }
      if (!cost.frozen) a.provisional += e.hours;
    }

    for (const [auditId, byUser] of acc) {
      let totalHours = 0, totalCost = 0, uncostedHours = 0, provisionalHours = 0, totalRevenueByRate = 0, unratedHours = 0;

      const byPerson: PersonBreakdown[] = [...byUser.entries()].map(([userId, byYear]) => {
        let personHours = 0, personCost = 0, personUncosted = 0, personProvisional = 0, personRevenue = 0, personRated = 0, personUnrated = 0;

        const hoursByYear: HourYearBreakdown[] = [...byYear.entries()]
          .sort(([a], [b]) => a - b)
          .map(([year, a]) => {
            const cost = a.costedHours > 0 ? round2(a.cost) : null;
            personHours += a.hours;
            if (cost !== null) personCost += cost;
            personUncosted += a.uncosted;
            personProvisional += a.provisional;
            personRevenue += a.revenue;
            personRated += a.ratedHours;
            personUnrated += a.unrated;
            return {
              year, hours: round2(a.hours),
              costRatePerHour: a.costedHours > 0 ? round2(a.cost / a.costedHours) : null,
              cost,
            };
          });

        const team = rateMap.get(`${auditId}:${userId}`);
        const revenueByRate = personRated > 0 ? round2(personRevenue) : null;
        totalHours += personHours;
        totalCost += personCost;
        uncostedHours += personUncosted;
        provisionalHours += personProvisional;
        if (revenueByRate !== null) totalRevenueByRate += revenueByRate;
        unratedHours += personUnrated;

        return {
          userId,
          userName: userNameMap.get(userId) ?? userId,
          hoursByYear,
          totalHours: round2(personHours),
          totalCost: round2(personCost),
          uncostedHours: round2(personUncosted),
          provisionalHours: round2(personProvisional),
          billingRateType: team?.billingRateType ?? null,
          agreedRatePerHour: team?.agreedRatePerHour != null ? Number(team.agreedRatePerHour) : null,
          revenueByRate,
        };
      });

      result.set(auditId, {
        byPerson,
        totalHours: round2(totalHours),
        totalCost: round2(totalCost),
        uncostedHours: round2(uncostedHours),
        provisionalHours: round2(provisionalHours),
        totalRevenueByRate: round2(totalRevenueByRate),
        unratedHours: round2(unratedHours),
      });
    }
    return result;
  }
}

export interface AuditFinancialSummary {
  hoursTotal: number; cost: number; uncostedHours: number; provisionalHours: number;
  revenue: number | null; feeCurrency: string | null;
  margin: number | null; marginPct: number | null;
}

const NO_REVENUE: Revenue = { feeAmount: null, feeCurrency: null, source: null, note: null };
