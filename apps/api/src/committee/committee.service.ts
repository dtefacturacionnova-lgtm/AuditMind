import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/jwt.strategy';
import {
  PeriodType, getPeriodKey, getPeriodRange, getPeriodYear, getPeriodLabel,
  lastNPeriods, isPeriodType,
} from './period.util';

// Papel/fase "terminado" para efectos de avance ponderado.
const PROGRESS_DONE = new Set(['REVIEWED', 'SIGNED_OFF', 'CLOSED', 'APPROVED', 'ARCHIVED']);
// Umbral más estricto: el disparador de Informe Final necesita firma real.
const TRIGGER_DONE = new Set(['SIGNED_OFF', 'CLOSED', 'APPROVED', 'ARCHIVED']);
const OPEN_FINDING = { notIn: ['CLOSED', 'ACCEPTED_RISK'] };
const TOLERANCE_PCT = 8; // margen antes de marcar "en riesgo" vs "a tiempo"

type EngagementState =
  | 'DONE_ON_TIME' | 'DONE_LATE'
  | 'IN_PROGRESS_ON_TRACK' | 'IN_PROGRESS_AT_RISK' | 'IN_PROGRESS_OVERDUE'
  | 'NOT_STARTED_ON_TRACK' | 'NOT_STARTED_OVERDUE';

function daysBetween(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / 86_400_000);
}

@Injectable()
export class CommitteeService {
  constructor(private prisma: PrismaService) {}

  // ─── Configuración de frecuencia de corte (Organization.settings) ─────────

  async getCutFrequency(orgId: string): Promise<PeriodType> {
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { settings: true },
    });
    const raw = (org?.settings as Record<string, unknown> | null)?.committeeCutFrequency;
    return isPeriodType(raw) ? raw : 'QUARTERLY';
  }

  async setCutFrequency(orgId: string, periodType: PeriodType): Promise<void> {
    const org = await this.prisma.organization.findUnique({ where: { id: orgId }, select: { settings: true } });
    const settings = { ...(org?.settings as Record<string, unknown> | null ?? {}), committeeCutFrequency: periodType };
    await this.prisma.organization.update({ where: { id: orgId }, data: { settings } });
  }

  // ─── Ponderación de avance de un encargo (peso por sección raíz) ──────────

  private async computeEngagementProgress(auditId: string): Promise<{
    pct: number;
    currentPhaseLabel: string | null;
    breakdown: Array<{ ref: string; name: string; weight: number; pct: number }>;
  }> {
    const [rootFolders, allFolders, papers] = await Promise.all([
      this.prisma.auditFolder.findMany({
        where: { auditId, parentId: null },
        select: { id: true, ref: true, name: true, weight: true, sortOrder: true },
        orderBy: { sortOrder: 'asc' },
      }),
      this.prisma.auditFolder.findMany({
        where: { auditId },
        select: { id: true, parentId: true },
      }),
      this.prisma.workingPaper.findMany({
        where: { auditId },
        select: { id: true, status: true, folderId: true },
      }),
    ]);

    const parentOf = new Map(allFolders.map(f => [f.id, f.parentId]));
    const topOf = (folderId: string | null): string | null => {
      let cur = folderId;
      let hops = 0;
      while (cur && parentOf.has(cur) && parentOf.get(cur) !== null && hops < 4) {
        cur = parentOf.get(cur) ?? null;
        hops++;
      }
      return cur;
    };

    const buckets = new Map<string, { done: number; total: number }>();
    rootFolders.forEach(f => buckets.set(f.id, { done: 0, total: 0 }));
    for (const p of papers) {
      const top = topOf(p.folderId);
      if (!top || !buckets.has(top)) continue;
      const b = buckets.get(top)!;
      b.total++;
      if (PROGRESS_DONE.has(p.status)) b.done++;
    }

    const weighted = rootFolders.map(f => {
      const b = buckets.get(f.id)!;
      const pct = b.total > 0 ? (b.done / b.total) * 100 : 0;
      const weight = f.weight ?? (100 / Math.max(rootFolders.length, 1));
      return { ref: f.ref, name: f.name, weight, pct, hasWork: b.total > 0 };
    });

    const totalWeight = weighted.reduce((s, w) => s + w.weight, 0);
    const overallPct = totalWeight > 0
      ? Math.round(weighted.reduce((s, w) => s + w.pct * w.weight, 0) / totalWeight)
      : 0;

    // Fase actual = la sección con peso > 0 de menor progreso que ya tiene papeles
    // tocados, o si ninguna tiene trabajo, la primera con peso > 0.
    const inFlight = weighted.filter(w => w.weight > 0);
    const current = inFlight.find(w => w.pct < 100 && w.hasWork)
      ?? inFlight.find(w => w.pct < 100)
      ?? inFlight[inFlight.length - 1];

    return {
      pct: overallPct,
      currentPhaseLabel: current ? `${current.ref} — ${current.name}` : null,
      breakdown: weighted.map(w => ({ ref: w.ref, name: w.name, weight: w.weight, pct: Math.round(w.pct) })),
    };
  }

  // ─── Clasificación de un ítem del plan (encargo) para el comité ───────────

  private async classifyPlanItem(item: any, periodEnd: Date, today: Date) {
    const start: Date | null = item.tentativeStartDate;
    const end: Date | null = item.tentativeEndDate;

    if (!item.audit) {
      const notStarted = !start || today < start;
      return {
        state: (notStarted ? 'NOT_STARTED_ON_TRACK' : 'NOT_STARTED_OVERDUE') as EngagementState,
        pct: 0,
        currentPhaseLabel: null,
        hoursReal: 0,
        hoursPlanned: item.estimatedHours ?? 0,
        dateNote: notStarted
          ? (start ? `Inicio previsto ${start.toLocaleDateString('es')}` : 'Sin fecha planificada')
          : `Planificado desde hace ${daysBetween(today, start!)} días, sin iniciar`,
        findings: { total: 0, bySeverity: {}, highest: null as string | null },
      };
    }

    const auditId = item.audit.id as string;
    const [progress, triggerPaper, findings, hoursAgg] = await Promise.all([
      this.computeEngagementProgress(auditId),
      this.prisma.workingPaper.findFirst({
        where: { auditId, isCompletionTrigger: true },
        select: { status: true, signedOffAt: true, updatedAt: true },
      }),
      this.prisma.finding.groupBy({
        by: ['severity'],
        where: { auditId, status: OPEN_FINDING as any },
        _count: { id: true },
      }),
      this.prisma.timeEntry.aggregate({
        where: {
          auditId,
          category: { in: ['CLIENT_BILLABLE', 'CLIENT_NON_BILLABLE'] as any },
          workDate: { lte: periodEnd },
        },
        _sum: { hours: true },
      }),
    ]);

    const bySeverity = Object.fromEntries(findings.map(f => [f.severity, f._count.id]));
    const severityOrder = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFORMATIONAL'];
    const highest = severityOrder.find(s => bySeverity[s] > 0) ?? null;
    const findingsTotal = findings.reduce((s, f) => s + f._count.id, 0);

    const isDone = !!triggerPaper && TRIGGER_DONE.has(triggerPaper.status);
    const hoursReal = hoursAgg._sum.hours ?? 0;
    const hoursPlanned = item.estimatedHours || item.audit.estimatedHours || 0;

    if (isDone) {
      const signOffDate: Date = triggerPaper!.signedOffAt ?? triggerPaper!.updatedAt;
      const onTime = !end || signOffDate <= end;
      return {
        state: (onTime ? 'DONE_ON_TIME' : 'DONE_LATE') as EngagementState,
        pct: 100,
        currentPhaseLabel: null,
        hoursReal, hoursPlanned,
        dateNote: onTime
          ? `Informe final firmado ${signOffDate.toLocaleDateString('es')}`
          : `Firmado con ${daysBetween(signOffDate, end!)} días de atraso`,
        findings: { total: findingsTotal, bySeverity, highest },
      };
    }

    let expectedPct = 100;
    if (start && end) {
      const totalDays = Math.max(daysBetween(end, start), 1);
      const elapsed = Math.min(Math.max(daysBetween(today, start), 0), totalDays);
      expectedPct = (elapsed / totalDays) * 100;
    }
    const pastDeadline = !!end && today > end;

    let state: EngagementState;
    let dateNote: string;
    if (pastDeadline) {
      state = 'IN_PROGRESS_OVERDUE';
      dateNote = `${daysBetween(today, end!)} días vencido sin informe firmado`;
    } else if (progress.pct + TOLERANCE_PCT >= expectedPct) {
      state = 'IN_PROGRESS_ON_TRACK';
      dateNote = `A tiempo — ${Math.round(expectedPct)}% del período planificado transcurrido`;
    } else {
      state = 'IN_PROGRESS_AT_RISK';
      dateNote = `En riesgo — avance ${progress.pct}% vs. ${Math.round(expectedPct)}% esperado a la fecha`;
    }

    return {
      state, pct: progress.pct, currentPhaseLabel: progress.currentPhaseLabel,
      hoursReal, hoursPlanned, dateNote,
      findings: { total: findingsTotal, bySeverity, highest },
    };
  }

  // ─── Períodos disponibles para el selector ─────────────────────────────────

  async listPeriods(user: AuthUser, periodType: PeriodType) {
    const orgId = user.organizationId;
    const currentKey = getPeriodKey(new Date(), periodType);
    const keys = lastNPeriods(currentKey, periodType, 8);
    const reports = await this.prisma.committeeReport.findMany({
      where: { organizationId: orgId, type: periodType, period: { in: keys } },
      select: { period: true, approvedAt: true, createdAt: true },
    });
    const frozenByKey = new Map(reports.map(r => [r.period, r]));
    return keys.map(key => ({
      key,
      label: getPeriodLabel(key, periodType),
      isCurrent: key === currentKey,
      frozen: frozenByKey.has(key),
      publishedAt: frozenByKey.get(key)?.createdAt ?? null,
    })).reverse();
  }

  // ─── Dashboard principal ───────────────────────────────────────────────────

  async getDashboard(user: AuthUser, periodTypeRaw: string, periodKeyRaw?: string) {
    const orgId = user.organizationId;
    const periodType: PeriodType = isPeriodType(periodTypeRaw) ? periodTypeRaw : await this.getCutFrequency(orgId);
    const today = new Date();
    const currentKey = getPeriodKey(today, periodType);
    const periodKey = periodKeyRaw || currentKey;
    const isCurrent = periodKey === currentKey;

    // Snapshot congelado: si ya se presentó este corte al comité, servir esa foto.
    const existing = await this.prisma.committeeReport.findUnique({
      where: { organizationId_period_type: { organizationId: orgId, period: periodKey, type: periodType } },
    });

    if (existing) {
      const preparer = await this.prisma.user.findUnique({
        where: { id: existing.preparedById },
        select: { name: true },
      });
      return {
        ...(existing.content as Record<string, unknown>),
        meta: {
          frozen: true, isCurrent, periodKey, periodType,
          publishedAt: existing.createdAt,
          preparedByName: preparer?.name ?? null,
        },
      };
    }

    const payload = await this.computeDashboard(orgId, periodType, periodKey, today);
    return { ...payload, meta: { frozen: false, isCurrent, periodKey, periodType, publishedAt: null, preparedByName: null } };
  }

  private async computeDashboard(orgId: string, periodType: PeriodType, periodKey: string, today: Date) {
    const { end: periodEnd } = getPeriodRange(periodKey, periodType);
    const year = getPeriodYear(periodKey, periodType);

    const plan = await this.prisma.auditPlan.findFirst({
      where: { organizationId: orgId, year, status: { not: 'DRAFT' } },
      select: {
        id: true, name: true, year: true, status: true, totalHours: true,
        items: {
          select: {
            id: true, estimatedHours: true, tentativeStartDate: true, tentativeEndDate: true,
            auditEntity: { select: { name: true } },
            auditProject: { select: { name: true } },
            auditableUnit: { select: { name: true } },
            audit: { select: { id: true, title: true, status: true, estimatedHours: true } },
          },
        },
      },
    });

    const itemsInPeriod = (plan?.items ?? []).filter(i => {
      const anchor = i.tentativeEndDate ?? i.tentativeStartDate;
      if (!anchor) return false;
      return getPeriodKey(anchor, periodType) === periodKey;
    });

    const planExecution = await Promise.all(itemsInPeriod.map(async item => {
      const cls = await this.classifyPlanItem(item, periodEnd, today);
      const name = item.audit?.title ?? item.auditProject?.name ?? item.auditEntity?.name
        ?? item.auditableUnit?.name ?? 'Encargo sin nombre';
      return {
        planItemId: item.id,
        name,
        tentativeStartDate: item.tentativeStartDate,
        tentativeEndDate: item.tentativeEndDate,
        auditId: item.audit?.id ?? null,
        ...cls,
      };
    }));

    const doneOnTime = planExecution.filter(i => i.state === 'DONE_ON_TIME' || i.state === 'DONE_LATE').length;
    const delayed = planExecution.filter(i => i.state === 'IN_PROGRESS_OVERDUE' || i.state === 'NOT_STARTED_OVERDUE').length;
    const atRisk = planExecution.filter(i => i.state === 'IN_PROGRESS_AT_RISK').length;
    const onTrack = planExecution.filter(i => i.state === 'IN_PROGRESS_ON_TRACK').length;
    const notStarted = planExecution.filter(i => i.state === 'NOT_STARTED_ON_TRACK').length;
    const completionPct = planExecution.length > 0
      ? Math.round(planExecution.reduce((s, i) => s + i.pct, 0) / planExecution.length)
      : 0;
    const hoursReal = planExecution.reduce((s, i) => s + i.hoursReal, 0);
    const hoursPlanned = planExecution.reduce((s, i) => s + i.hoursPlanned, 0);

    // Cobertura del universo anual (todo el plan del año, no solo el período)
    const yearTotal = plan?.items.length ?? 0;
    const yearDone = plan
      ? (await Promise.all(plan.items.map(async i => {
          if (!i.audit) return false;
          const trigger = await this.prisma.workingPaper.findFirst({
            where: { auditId: i.audit.id, isCompletionTrigger: true },
            select: { status: true },
          });
          return !!trigger && TRIGGER_DONE.has(trigger.status);
        }))).filter(Boolean).length
      : 0;

    // KPIs de gobierno (org-wide, punto en el tiempo — no filtrados por período)
    const [openBySeverity, overdueActions, escalatedFindings, totalFindingsYear, closedFindingsYear, materialOpen, recurring] =
      await Promise.all([
        this.prisma.finding.groupBy({ by: ['severity'], where: { organizationId: orgId, status: OPEN_FINDING as any }, _count: { id: true } }),
        this.prisma.findingAction.findMany({
          where: { organizationId: orgId, status: { not: 'COMPLETED' as any }, dueDate: { lt: today } },
          include: { finding: { select: { id: true, title: true, severity: true, status: true } } },
          orderBy: { dueDate: 'asc' }, take: 30,
        }),
        this.prisma.finding.findMany({
          where: { organizationId: orgId, status: OPEN_FINDING as any, escalationLevel: { not: 'NONE' as any } },
          orderBy: [{ severity: 'asc' }, { createdAt: 'asc' }], take: 15,
          select: { id: true, title: true, severity: true, escalationLevel: true, dueDate: true, createdAt: true,
            audit: { select: { id: true, title: true } }, responsible: { select: { name: true } } },
        }),
        this.prisma.finding.count({ where: { organizationId: orgId, createdAt: { gte: new Date(today.getFullYear(), 0, 1) } } }),
        this.prisma.finding.count({ where: { organizationId: orgId, status: 'CLOSED' as any, updatedAt: { gte: new Date(today.getFullYear(), 0, 1) } } }),
        this.prisma.finding.count({ where: { organizationId: orgId, isMaterial: true, status: OPEN_FINDING as any } }),
        this.prisma.finding.findMany({
          where: { organizationId: orgId, isRecurring: true, status: OPEN_FINDING as any },
          take: 5, orderBy: { createdAt: 'desc' },
          select: { id: true, title: true, audit: { select: { title: true } } },
        }),
      ]);

    const openSevSet = new Set(openBySeverity.map((f: any) => f.severity));
    const riskPosture = openSevSet.has('CRITICAL') ? 'CRITICAL'
      : openSevSet.has('HIGH') ? 'HIGH'
      : openSevSet.has('MEDIUM') ? 'MEDIUM'
      : openSevSet.size > 0 ? 'LOW' : 'NONE';
    const openFindingsTotal = openBySeverity.reduce((s: number, f: any) => s + f._count.id, 0);
    const criticalOpen = openBySeverity.find((f: any) => f.severity === 'CRITICAL')?._count.id ?? 0;

    // Tendencia — cumplimiento del plan en los últimos 4 cortes
    const trendKeys = lastNPeriods(periodKey, periodType, 4);
    const trend = await Promise.all(trendKeys.map(async key => {
      if (key === periodKey) {
        return { period: key, label: getPeriodLabel(key, periodType), completionPct, isCurrent: true, hasData: planExecution.length > 0 };
      }
      const snap = await this.prisma.committeeReport.findUnique({
        where: { organizationId_period_type: { organizationId: orgId, period: key, type: periodType } },
        select: { content: true },
      });
      if (snap) {
        const c = snap.content as any;
        return { period: key, label: getPeriodLabel(key, periodType), completionPct: c?.summary?.completionPct ?? 0, isCurrent: false, hasData: true };
      }
      // Corte pasado sin snapshot (anterior a esta funcionalidad) — no inventar dato.
      return { period: key, label: getPeriodLabel(key, periodType), completionPct: 0, isCurrent: false, hasData: false };
    }));

    return {
      riskPosture,
      period: { key: periodKey, type: periodType, label: getPeriodLabel(periodKey, periodType) },
      plan: plan ? { id: plan.id, name: plan.name, year: plan.year, status: plan.status } : null,
      summary: {
        completionPct,
        doneOnTime, delayed, atRisk, onTrack, notStarted,
        totalItemsInPeriod: planExecution.length,
        hoursReal, hoursPlanned,
        universeCoveragePct: yearTotal > 0 ? Math.round((yearDone / yearTotal) * 100) : 0,
        universeDone: yearDone, universeTotal: yearTotal,
      },
      kpis: {
        openFindings: openFindingsTotal,
        criticalOpen,
        materialOpen,
        overdueActionsCount: overdueActions.length,
        resolutionRateYtd: totalFindingsYear > 0 ? Math.round((closedFindingsYear / totalFindingsYear) * 100) : 0,
      },
      openBySeverity: Object.fromEntries(openBySeverity.map((f: any) => [f.severity, f._count.id])),
      planExecution,
      trend,
      overdueActions,
      escalatedFindings,
      recurringFindings: recurring,
    };
  }

  // ─── Cerrar corte del comité (congelar snapshot) ───────────────────────────

  async publishSnapshot(user: AuthUser, periodTypeRaw: string, periodKeyRaw: string) {
    if (!isPeriodType(periodTypeRaw)) throw new BadRequestException('periodType inválido');
    const orgId = user.organizationId;
    const today = new Date();
    const payload = await this.computeDashboard(orgId, periodTypeRaw, periodKeyRaw, today);

    const report = await this.prisma.committeeReport.upsert({
      where: { organizationId_period_type: { organizationId: orgId, period: periodKeyRaw, type: periodTypeRaw } },
      create: {
        organizationId: orgId, period: periodKeyRaw, type: periodTypeRaw,
        content: payload as any, preparedById: user.id,
      },
      update: {
        content: payload as any, preparedById: user.id,
      },
    });
    return { id: report.id, period: report.period, publishedAt: report.createdAt };
  }
}
