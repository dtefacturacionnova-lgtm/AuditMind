import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/jwt.strategy';
import { ProfitabilityService } from '../portfolio/profitability.service';
import { DEFAULT_MIN_CPE_HOURS_YEAR } from './competencies.service';

// Mismo umbral que classifyPlanItem() de CommitteeService — un papel de
// disparo de informe final se considera "terminado" con estos estados.
const TRIGGER_DONE = new Set(['SIGNED_OFF', 'CLOSED', 'APPROVED', 'ARCHIVED']);
const OPEN_FINDING = { notIn: ['CLOSED', 'ACCEPTED_RISK'] };

/**
 * Tablero de KPIs de desempeño (IIA Std. 12.2 / NIGC 1 monitoreo) — a
 * propósito, no pide NINGÚN dato nuevo al usuario: todo se calcula a partir
 * de datos que ya existen en Papeles de Trabajo, Cartera, Capacidad y los
 * hallazgos de calidad de QAIP V2. Extendido con 4 indicadores pedidos
 * explícitamente por el usuario (cumplimiento CPE, cumplimiento del plan de
 * trabajo, rentabilidad en horas y dinero, indicadores de recomendaciones) +
 * un 5º hallazgo de la investigación de NIGC 1 (inspección cíclica de socios,
 * Art. 38) — reportado como brecha documentada, no fabricado, porque el
 * producto no rastrea todavía qué encargos se inspeccionaron post-hoc.
 */
@Injectable()
export class PerformanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly profitability: ProfitabilityService,
  ) {}

  async getDashboard(user: AuthUser, year: number) {
    const orgId = user.organizationId;
    const yearStart = new Date(year, 0, 1);
    const yearEnd = new Date(year, 11, 31, 23, 59, 59, 999);
    const today = new Date();

    const [
      signedOffPapers,
      openFindings,
      remediatedFindings,
      closedFindings,
      rootCausesByCategory,
      overdueActions,
      activeClients,
      acceptedClients,
    ] = await Promise.all([
      this.prisma.workingPaper.findMany({
        where: { audit: { organizationId: orgId }, signedOffAt: { gte: yearStart, lte: yearEnd } },
        select: { reviewedAt: true, signedOffAt: true },
      }),
      this.prisma.qaipFinding.count({ where: { organizationId: orgId, status: 'OPEN' } }),
      this.prisma.qaipFinding.count({ where: { organizationId: orgId, status: 'REMEDIATED' } }),
      this.prisma.qaipFinding.count({ where: { organizationId: orgId, status: 'CLOSED' } }),
      this.prisma.qaipRootCause.groupBy({
        by: ['category'],
        where: { finding: { organizationId: orgId } },
        _count: { id: true },
      }),
      this.prisma.qaipRemediationAction.count({
        where: { status: 'OPEN', dueDate: { lt: today }, finding: { organizationId: orgId } },
      }),
      this.prisma.client.count({ where: { organizationId: orgId, status: 'ACTIVE' } }),
      this.prisma.client.count({
        where: {
          organizationId: orgId, status: 'ACTIVE',
          acceptanceChecks: { some: { year, decidedAt: { not: null } } },
        },
      }),
    ]);

    const reviewedCount = signedOffPapers.filter(p => p.reviewedAt !== null).length;
    const reviewedPct = signedOffPapers.length > 0 ? Math.round((reviewedCount / signedOffPapers.length) * 100) : null;

    const withBothDates = signedOffPapers.filter(p => p.reviewedAt && p.signedOffAt);
    const avgDaysReviewToSignOff = withBothDates.length > 0
      ? Math.round(
          withBothDates.reduce((sum, p) => sum + (p.signedOffAt!.getTime() - p.reviewedAt!.getTime()) / 86_400_000, 0)
          / withBothDates.length * 10,
        ) / 10
      : null;

    const [cpeCompliance, workPlanCompliance, profitabilityCompliance, recommendations] = await Promise.all([
      this.computeCpeCompliance(orgId, year),
      this.computeWorkPlanCompliance(orgId, year, today),
      this.computeProfitabilityCompliance(orgId, year, yearEnd),
      this.computeRecommendationsIndicators(orgId, year, today),
    ]);

    return {
      year,
      engagementPerformance: {
        totalSignedOff: signedOffPapers.length,
        reviewedPct,
        avgDaysReviewToSignOff,
      },
      qualityFindings: {
        open: openFindings,
        remediated: remediatedFindings,
        closed: closedFindings,
        overdueRemediationActions: overdueActions,
        byRootCauseCategory: Object.fromEntries(rootCausesByCategory.map(r => [r.category, r._count.id])),
      },
      clientAcceptanceCoverage: {
        activeClients,
        withDecidedAcceptance: acceptedClients,
        coveragePct: activeClients > 0 ? Math.round((acceptedClients / activeClients) * 100) : null,
      },
      cpeCompliance,
      workPlanCompliance,
      profitabilityCompliance,
      recommendations,
      // NIGC 1 Art. 38/A151-A153 — inspección de encargos finalizados por socio
      // sobre una base cíclica. El producto no rastrea aún qué encargo se
      // inspeccionó ni cuándo (es distinto de la EQR de V3, que es previa a la
      // firma, no una revisión posterior de archivo) — se reporta la brecha en
      // vez de fabricar un porcentaje sin datos reales detrás.
      partnerCyclicalInspection: {
        tracked: false,
        note: 'NIGC 1 Art. 38 exige inspección cíclica de encargos finalizados por cada socio. Aún no hay un registro de inspecciones de archivo en el producto — pendiente de diseño si se activa esta ronda de trabajo.',
      },
    };
  }

  // ─── Cumplimiento de horas de estudio continuada (CPE) + cobertura de
  // certificaciones — Norma 3.2 (CPE) y Norma 12.2, que lista explícitamente
  // "miembros del personal que cuenten con al menos una certificación
  // profesional reconocida y relevante" como medida de desempeño de ejemplo,
  // separada de las horas CPE (texto verbatim de las Normas Globales de
  // Auditoría Interna 2024, IIA, leído completo esta sesión).
  private async computeCpeCompliance(orgId: string, year: number) {
    const staff = await this.prisma.user.findMany({
      where: { organizationId: orgId, active: true },
      select: {
        id: true, name: true,
        cpeRecords: { where: { year }, select: { hours: true } },
        certifications: { where: { isActive: true }, select: { id: true } },
      },
    });
    const byUser = staff.map(u => ({
      id: u.id,
      name: u.name,
      hours: Math.round(u.cpeRecords.reduce((s, r) => s + r.hours, 0) * 10) / 10,
      hasCertification: u.certifications.length > 0,
    }));
    const compliantCount = byUser.filter(u => u.hours >= DEFAULT_MIN_CPE_HOURS_YEAR).length;
    const certifiedCount = byUser.filter(u => u.hasCertification).length;

    return {
      year,
      minRequiredHours: DEFAULT_MIN_CPE_HOURS_YEAR,
      staffTotal: byUser.length,
      staffCompliant: compliantCount,
      compliancePct: byUser.length > 0 ? Math.round((compliantCount / byUser.length) * 100) : null,
      belowMinimum: byUser.filter(u => u.hours < DEFAULT_MIN_CPE_HOURS_YEAR).map(u => ({ id: u.id, name: u.name, hours: u.hours, missingHours: Math.round((DEFAULT_MIN_CPE_HOURS_YEAR - u.hours) * 10) / 10 })),
      certificationCoverage: {
        staffCertified: certifiedCount,
        coveragePct: byUser.length > 0 ? Math.round((certifiedCount / byUser.length) * 100) : null,
      },
    };
  }

  // ─── Cumplimiento del plan de trabajo anual (Std. 2000 / plan aprobado) ────
  private async computeWorkPlanCompliance(orgId: string, year: number, today: Date) {
    const plan = await this.prisma.auditPlan.findUnique({
      where: { organizationId_year: { organizationId: orgId, year } },
      select: {
        id: true, name: true, status: true,
        items: {
          select: {
            id: true, tentativeEndDate: true,
            audit: { select: { id: true } },
          },
        },
      },
    });
    if (!plan) {
      return { year, planExists: false, totalItems: 0, completedItems: 0, completedOnTimeItems: 0, completionPct: null };
    }

    const withAudit = plan.items.filter(i => i.audit);
    const triggerStatuses = await Promise.all(withAudit.map(i => this.prisma.workingPaper.findFirst({
      where: { auditId: i.audit!.id, isCompletionTrigger: true },
      select: { status: true, signedOffAt: true, updatedAt: true },
    })));

    let completed = 0;
    let completedOnTime = 0;
    withAudit.forEach((item, idx) => {
      const trigger = triggerStatuses[idx];
      const isDone = !!trigger && TRIGGER_DONE.has(trigger.status);
      if (!isDone) return;
      completed++;
      const signOffDate = trigger!.signedOffAt ?? trigger!.updatedAt;
      if (!item.tentativeEndDate || signOffDate <= item.tentativeEndDate) completedOnTime++;
    });

    return {
      year,
      planExists: true,
      planId: plan.id,
      planName: plan.name,
      planStatus: plan.status,
      totalItems: plan.items.length,
      startedItems: withAudit.length,
      completedItems: completed,
      completedOnTimeItems: completedOnTime,
      completionPct: plan.items.length > 0 ? Math.round((completed / plan.items.length) * 100) : null,
      onTimePct: completed > 0 ? Math.round((completedOnTime / completed) * 100) : null,
    };
  }

  // ─── Cumplimiento de rentabilidad en horas y dinero ────────────────────────
  private async computeProfitabilityCompliance(orgId: string, year: number, yearEnd: Date) {
    const plan = await this.prisma.auditPlan.findUnique({
      where: { organizationId_year: { organizationId: orgId, year } },
      select: { items: { select: { estimatedHours: true, audit: { select: { id: true, estimatedHours: true } } } } },
    });

    const auditIds = (plan?.items ?? []).map(i => i.audit?.id).filter((id): id is string => !!id);
    const hoursPlanned = (plan?.items ?? []).reduce((s, i) => s + (i.estimatedHours || i.audit?.estimatedHours || 0), 0);

    const hoursRealAgg = auditIds.length > 0
      ? await this.prisma.timeEntry.aggregate({
          where: {
            auditId: { in: auditIds },
            category: { in: ['CLIENT_BILLABLE', 'CLIENT_NON_BILLABLE'] as any },
            workDate: { gte: new Date(year, 0, 1), lte: yearEnd },
          },
          _sum: { hours: true },
        })
      : { _sum: { hours: 0 } };
    const hoursReal = hoursRealAgg._sum.hours ?? 0;

    const money = await this.profitability.getOrgWideProfitability(orgId, yearEnd);

    return {
      year,
      hours: {
        planned: Math.round(hoursPlanned * 10) / 10,
        real: Math.round(hoursReal * 10) / 10,
        compliancePct: hoursPlanned > 0 ? Math.round((hoursReal / hoursPlanned) * 100) : null,
      },
      money,
    };
  }

  // ─── Indicadores asociados a las recomendaciones (hallazgos y acciones) ───
  private async computeRecommendationsIndicators(orgId: string, year: number, today: Date) {
    const yearStart = new Date(year, 0, 1);
    const [totalYear, closedYear, overdueActionsCount, totalActions, completedActions, recurringYear] = await Promise.all([
      this.prisma.finding.count({ where: { organizationId: orgId, createdAt: { gte: yearStart } } }),
      this.prisma.finding.count({ where: { organizationId: orgId, status: 'CLOSED' as any, updatedAt: { gte: yearStart } } }),
      this.prisma.findingAction.count({ where: { organizationId: orgId, status: { not: 'COMPLETED' as any }, dueDate: { lt: today } } }),
      this.prisma.findingAction.count({ where: { organizationId: orgId, createdAt: { gte: yearStart } } }),
      this.prisma.findingAction.count({ where: { organizationId: orgId, status: 'COMPLETED' as any, createdAt: { gte: yearStart } } }),
      this.prisma.finding.count({ where: { organizationId: orgId, isRecurring: true, createdAt: { gte: yearStart } } }),
    ]);

    return {
      year,
      findingsCreatedYtd: totalYear,
      findingsClosedYtd: closedYear,
      resolutionRateYtd: totalYear > 0 ? Math.round((closedYear / totalYear) * 100) : null,
      recurringFindingsYtd: recurringYear,
      recurrenceRateYtd: totalYear > 0 ? Math.round((recurringYear / totalYear) * 100) : null,
      actionsCreatedYtd: totalActions,
      actionsCompletedYtd: completedActions,
      implementationRateYtd: totalActions > 0 ? Math.round((completedActions / totalActions) * 100) : null,
      overdueActionsNow: overdueActionsCount,
    };
  }
}
