import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/jwt.strategy';
import { AuditStatus, FindingStatus, PbcRequestStatus, EscalationLevel } from '@prisma/client';
import { canSeeAudit, visibleAuditWhere } from '../common/utils/investigation-scope.util';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async getKpis(user: AuthUser) {
    const orgId = user.organizationId;
    // Modo investigación (2026-10-25): todo el panel cuenta y lista solo lo que este usuario puede ver (las investigaciones
    // ajenas a su equipo no suman ni aparecen). CAE, ADMIN y SUPER_ADMIN ven todo.
    const scope = visibleAuditWhere(user);
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      auditsInProgress,
      auditsClosed,
      openFindings,
      criticalFindings,
      overduePbc,
      totalAudits,
      closedThisYear,
      aiInteractions,
    ] = await Promise.all([
      this.prisma.audit.count({
        where: {
          ...scope,
          status: { in: [AuditStatus.IN_PROGRESS, AuditStatus.REVIEW] },
        },
      }),
      this.prisma.audit.count({
        where: { ...scope, status: AuditStatus.CLOSED },
      }),
      this.prisma.finding.count({
        where: {
          organizationId: orgId, audit: scope,
          status: { notIn: [FindingStatus.CLOSED] },
        },
      }),
      this.prisma.finding.count({
        where: {
          organizationId: orgId, audit: scope,
          severity: 'CRITICAL',
          status: { notIn: [FindingStatus.CLOSED] },
        },
      }),
      this.prisma.pbcRequest.count({
        where: {
          organizationId: orgId, audit: scope,
          dueDate: { lt: now },
          status: { notIn: [PbcRequestStatus.ACCEPTED, PbcRequestStatus.REJECTED] },
        },
      }),
      this.prisma.audit.count({
        where: { ...scope, status: { not: AuditStatus.CANCELLED } },
      }),
      this.prisma.audit.count({
        where: {
          ...scope,
          status: AuditStatus.CLOSED,
          updatedAt: { gte: new Date(now.getFullYear(), 0, 1) },
        },
      }),
      this.prisma.aIInteraction.count({
        where: {
          organizationId: orgId,
          createdAt: { gte: monthStart },
        },
      }),
    ]);

    const planComplianceRate = totalAudits > 0
      ? Math.round((closedThisYear / totalAudits) * 100)
      : 0;

    return {
      auditsInProgress,
      auditsCompleted: auditsClosed,
      openFindings,
      criticalFindings,
      overduePbcRequests: overduePbc,
      planComplianceRate,
      aiInteractionsThisMonth: aiInteractions,
    };
  }

  async getAuditTimeline(user: AuthUser) {
    const now = new Date();
    const threeMonthsLater = new Date();
    threeMonthsLater.setMonth(threeMonthsLater.getMonth() + 3);

    return this.prisma.audit.findMany({
      where: {
        ...visibleAuditWhere(user),
        status: { notIn: [AuditStatus.CLOSED, AuditStatus.CANCELLED] },
        startDate: { lte: threeMonthsLater },
      },
      orderBy: { startDate: 'asc' },
      select: {
        id: true,
        title: true,
        type: true,
        status: true,
        startDate: true,
        endDate: true,
        estimatedHours: true,
        actualHours: true,
        team: {
          where: { role: 'LEAD' },
          include: { user: { select: { id: true, name: true, avatarUrl: true } } },
          take: 1,
        },
        auditEntity: { select: { name: true } },
      },
    });
  }

  async getRecentFindings(user: AuthUser, limit = 10) {
    return this.prisma.finding.findMany({
      where: {
        organizationId: user.organizationId, audit: visibleAuditWhere(user),
        status: { notIn: [FindingStatus.CLOSED] },
      },
      orderBy: [{ severity: 'asc' }, { createdAt: 'desc' }],
      take: limit,
      select: {
        id: true, title: true,
        severity: true, status: true, isMaterial: true,
        audit: { select: { id: true, title: true } },
        createdAt: true,
      },
    });
  }

  async getUpcomingDeadlines(user: AuthUser) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + 14);

    const [pbcDue, auditsEnding] = await Promise.all([
      this.prisma.pbcRequest.findMany({
        where: {
          organizationId: user.organizationId, audit: visibleAuditWhere(user),
          dueDate: { lte: cutoff, gte: new Date() },
          status: { notIn: [PbcRequestStatus.ACCEPTED] },
        },
        orderBy: { dueDate: 'asc' },
        take: 5,
        select: {
          id: true, title: true, dueDate: true, requestedToName: true,
          audit: { select: { title: true } },
        },
      }),
      this.prisma.audit.findMany({
        where: {
          ...visibleAuditWhere(user),
          endDate: { lte: cutoff, gte: new Date() },
          status: { notIn: [AuditStatus.CLOSED, AuditStatus.CANCELLED] },
        },
        orderBy: { endDate: 'asc' },
        take: 5,
        select: { id: true, title: true, endDate: true, status: true },
      }),
    ]);

    return { pbcDue, auditsEnding };
  }

  // ─── VISTA CAE / AUDIT_MANAGER ──────────────────────────────────────────────
  async getManagerDashboard(user: AuthUser) {
    const orgId = user.organizationId;
    const scope = visibleAuditWhere(user); // modo investigación (2026-10-25)
    const now   = new Date();
    const yearStart = new Date(now.getFullYear(), 0, 1);

    // Carga del equipo: auditorías activas por auditor. Cuenta TODAS las de la organización (también investigaciones): es una
    // medida de carga de trabajo por persona, no dice cuál es la auditoría; sacar las reservadas la subestimaría.
    const teamLoad = await this.prisma.auditTeam.groupBy({
      by: ['userId'],
      where: {
        audit: {
          organizationId: orgId,
          status: { in: [AuditStatus.IN_PROGRESS, AuditStatus.REVIEW] },
        },
      },
      _count: { auditId: true },
    });

    const userIds = teamLoad.map(t => t.userId);
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, role: true, avatarUrl: true },
    });
    const userMap = Object.fromEntries(users.map(u => [u.id, u]));

    const teamWorkload = teamLoad
      .map(t => ({ ...userMap[t.userId], activeAudits: t._count.auditId }))
      .sort((a, b) => b.activeAudits - a.activeAudits);

    // Hallazgos pendientes de aprobación (IN_REVIEW)
    const pendingApproval = await this.prisma.finding.findMany({
      where: { organizationId: orgId, audit: scope, status: FindingStatus.IN_REVIEW },
      orderBy: [{ severity: 'asc' }, { createdAt: 'asc' }],
      take: 10,
      select: {
        id: true, title: true, severity: true, qualityScore: true,
        audit: { select: { id: true, title: true } },
        createdAt: true,
      },
    });

    // Hallazgos escalados (nivel > NONE)
    const escalated = await this.prisma.finding.findMany({
      where: {
        organizationId: orgId, audit: scope,
        status: { notIn: [FindingStatus.CLOSED] },
        escalationLevel: { not: EscalationLevel.NONE },
      },
      orderBy: { createdAt: 'asc' },
      take: 8,
      select: {
        id: true, title: true, severity: true, status: true, escalationLevel: true,
        audit: { select: { id: true, title: true } },
      },
    });

    // Tendencia hallazgos mes a mes (últimos 6 meses)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    // Se agrupa en memoria (y no con SQL a mano) para reutilizar el mismo filtro de visibilidad que el resto del panel.
    const trendRows = await this.prisma.finding.findMany({
      where: { organizationId: orgId, audit: scope, createdAt: { gte: sixMonthsAgo } },
      select: { createdAt: true, status: true },
    });
    const trendByMonth = new Map<string, { total: number; closed: number }>();
    for (const f of trendRows) {
      const month = f.createdAt.toISOString().slice(0, 7);
      const bucket = trendByMonth.get(month) ?? { total: 0, closed: 0 };
      bucket.total += 1;
      if (f.status === FindingStatus.CLOSED) bucket.closed += 1;
      trendByMonth.set(month, bucket);
    }
    const findingsTrend = [...trendByMonth.entries()].sort(([x], [y]) => x.localeCompare(y)).map(([month, v]) => ({ month, ...v }));

    const [closedYear, totalYear, totalFindings, closedFindings, activePlans] = await Promise.all([
      this.prisma.audit.count({ where: { ...scope, status: AuditStatus.CLOSED, updatedAt: { gte: yearStart } } }),
      this.prisma.audit.count({ where: { ...scope, createdAt: { gte: yearStart } } }),
      this.prisma.finding.count({ where: { organizationId: orgId, audit: scope, createdAt: { gte: yearStart } } }),
      this.prisma.finding.count({ where: { organizationId: orgId, audit: scope, status: FindingStatus.CLOSED, updatedAt: { gte: yearStart } } }),
      this.prisma.auditPlan.count({ where: { organizationId: orgId, status: { in: ['ACTIVE', 'APPROVED'] as any } } }),
    ]);

    return {
      teamWorkload,
      pendingApproval,
      escalated,
      findingsTrend,
      kpis: {
        auditsClosedThisYear: closedYear,
        auditsTotalThisYear:  totalYear,
        findingsThisYear:     totalFindings,
        findingsClosedThisYear: closedFindings,
        findingResolutionRate: totalFindings > 0
          ? Math.round((closedFindings / totalFindings) * 100)
          : 0,
        activePlans,
        pendingApprovalCount: pendingApproval.length,
        escalatedCount:       escalated.length,
      },
    };
  }

  // ─── VISTA COMITÉ DE AUDITORÍA ──────────────────────────────────────────────
  async getCommitteeDashboard(user: AuthUser) {
    const orgId = user.organizationId;
    const scope = visibleAuditWhere(user); // modo investigación (2026-10-25)
    const now   = new Date();
    const yearStart = new Date(now.getFullYear(), 0, 1);

    const [
      openBySeverity,
      allByStatus,
      overdueActions,
      auditsByStatus,
      activePlan,
      escalatedFindings,
      totalFindingsYear,
      closedFindingsYear,
      materialOpen,
    ] = await Promise.all([
      this.prisma.finding.groupBy({
        by: ['severity'],
        where: { organizationId: orgId, audit: scope, status: { notIn: ['CLOSED', 'ACCEPTED_RISK'] as any } },
        _count: { id: true },
      }),
      this.prisma.finding.groupBy({
        by: ['status'],
        where: { organizationId: orgId, audit: scope },
        _count: { id: true },
      }),
      this.prisma.findingAction.findMany({
        where: { organizationId: orgId, finding: { audit: scope }, status: { not: 'COMPLETED' }, dueDate: { lt: now } },
        include: {
          finding: { select: { id: true, title: true, severity: true, status: true } },
        },
        orderBy: { dueDate: 'asc' },
        take: 30,
      }),
      this.prisma.audit.groupBy({
        by: ['status'],
        where: { ...scope, status: { not: AuditStatus.CANCELLED } },
        _count: { id: true },
      }),
      this.prisma.auditPlan.findFirst({
        where: { organizationId: orgId, status: { in: ['ACTIVE', 'APPROVED'] as any } },
        orderBy: { year: 'desc' },
        select: {
          id: true, name: true, year: true, status: true, totalHours: true,
          items: { select: { id: true, estimatedHours: true, audit: { select: { status: true, isInvestigationMode: true, team: { select: { userId: true } } } } } },
        },
      }),
      this.prisma.finding.findMany({
        where: {
          organizationId: orgId, audit: scope,
          status: { notIn: ['CLOSED', 'ACCEPTED_RISK'] as any },
          escalationLevel: { not: EscalationLevel.NONE },
        },
        orderBy: [{ severity: 'asc' }, { createdAt: 'asc' }],
        take: 15,
        select: {
          id: true, title: true, severity: true, escalationLevel: true, dueDate: true,
          audit: { select: { id: true, title: true } },
          responsible: { select: { name: true } },
        },
      }),
      this.prisma.finding.count({ where: { organizationId: orgId, audit: scope, createdAt: { gte: yearStart } } }),
      this.prisma.finding.count({ where: { organizationId: orgId, audit: scope, status: 'CLOSED' as any, updatedAt: { gte: yearStart } } }),
      this.prisma.finding.count({ where: { organizationId: orgId, audit: scope, isMaterial: true, status: { notIn: ['CLOSED', 'ACCEPTED_RISK'] as any } } }),
    ]);

    // Postura de riesgo
    const openSevSet = new Set(openBySeverity.map((f: any) => f.severity));
    const riskPosture = openSevSet.has('CRITICAL') ? 'CRITICAL'
      : openSevSet.has('HIGH')   ? 'HIGH'
      : openSevSet.has('MEDIUM') ? 'MEDIUM'
      : openSevSet.size > 0      ? 'LOW' : 'NONE';

    // Resumen plan activo
    let planSummary: Record<string, unknown> | null = null;
    if (activePlan) {
      // Modo investigación (2026-10-25): los ítems vinculados a una investigación ajena no cuentan (el avance delataría si está cerrada).
      const visibleItems   = activePlan.items.filter((i: any) => !i.audit || canSeeAudit(i.audit, user));
      const totalItems     = visibleItems.length;
      const completedItems = visibleItems.filter((i: any) => i.audit?.status === 'CLOSED').length;
      const allocatedHours = visibleItems.reduce((s: number, i: any) => s + (i.estimatedHours || 0), 0);
      planSummary = {
        id: activePlan.id, name: activePlan.name, year: activePlan.year, status: activePlan.status,
        totalItems, completedItems,
        completionPct:  totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0,
        totalHours:     activePlan.totalHours,
        allocatedHours,
        utilizationPct: activePlan.totalHours > 0
          ? Math.round((allocatedHours / activePlan.totalHours) * 100) : 0,
      };
    }

    const openFindingsTotal = allByStatus
      .filter((f: any) => !['CLOSED', 'ACCEPTED_RISK'].includes(f.status))
      .reduce((s: number, f: any) => s + f._count.id, 0);
    const criticalOpen = openBySeverity.find((f: any) => f.severity === 'CRITICAL')?._count.id ?? 0;

    return {
      riskPosture,
      kpis: {
        openFindings: openFindingsTotal,
        criticalOpen,
        materialOpen,
        overdueActionsCount: overdueActions.length,
        resolutionRateYtd: totalFindingsYear > 0
          ? Math.round((closedFindingsYear / totalFindingsYear) * 100) : 0,
      },
      openBySeverity:    Object.fromEntries(openBySeverity.map((f: any) => [f.severity, f._count.id])),
      allByStatus:       Object.fromEntries(allByStatus.map((f: any)    => [f.status, f._count.id])),
      auditsByStatus:    Object.fromEntries(auditsByStatus.map((a: any) => [a.status, a._count.id])),
      overdueActions,
      escalatedFindings,
      planSummary,
    };
  }

  // ─── VISTA AUDITOR / SENIOR_AUDITOR ─────────────────────────────────────────
  async getMyWorkload(user: AuthUser) {
    const userId = user.id;
    const orgId  = user.organizationId;
    const now    = new Date();

    // Mis auditorías activas
    const myAudits = await this.prisma.audit.findMany({
      where: {
        organizationId: orgId,
        status: { notIn: [AuditStatus.CLOSED, AuditStatus.CANCELLED] },
        team: { some: { userId } },
      },
      orderBy: { endDate: 'asc' },
      select: {
        id: true, title: true, status: true, type: true,
        startDate: true, endDate: true, estimatedHours: true, actualHours: true,
        auditEntity: { select: { name: true } },
        team: { where: { userId }, select: { role: true } },
        _count: { select: { findings: true, workingPapers: true } },
      },
    });

    // Mis hallazgos asignados abiertos
    const myFindings = await this.prisma.finding.findMany({
      where: {
        organizationId: orgId,
        audit: visibleAuditWhere(user), // si lo sacaron del equipo de una investigación, deja de ver sus hallazgos aquí
        status: { notIn: [FindingStatus.CLOSED] },
        responsibleId: userId,
      },
      orderBy: [{ severity: 'asc' }, { dueDate: 'asc' }],
      take: 15,
      select: {
        id: true, title: true, severity: true, status: true, dueDate: true,
        audit: { select: { id: true, title: true } },
      },
    });

    const overdueFindings = myFindings.filter(
      f => f.dueDate && new Date(f.dueDate) < now,
    );

    // Mis papeles de trabajo pendientes/en revisión
    const myPapers = await this.prisma.workingPaper.findMany({
      where: {
        audit: { organizationId: orgId, team: { some: { userId } } },
        status: { in: ['DRAFT', 'IN_REVIEW'] as any },
      },
      orderBy: { updatedAt: 'asc' },
      take: 10,
      select: {
        id: true, title: true, type: true, status: true, code: true,
        audit: { select: { id: true, title: true } },
      },
    });

    // Solicitudes PBC pendientes
    const myPbc = await this.prisma.pbcRequest.findMany({
      where: {
        organizationId: orgId,
        status: { notIn: [PbcRequestStatus.ACCEPTED, PbcRequestStatus.REJECTED] },
        audit: { team: { some: { userId } } },
      },
      orderBy: { dueDate: 'asc' },
      take: 10,
      select: {
        id: true, title: true, status: true, dueDate: true, requestedToName: true,
        audit: { select: { id: true, title: true } },
      },
    });

    const totalPlanned = myAudits.reduce((s, a) => s + (a.estimatedHours ?? 0), 0);
    const totalActual  = myAudits.reduce((s, a) => s + (a.actualHours  ?? 0), 0);

    return {
      myAudits: myAudits.map(a => ({
        ...a,
        myRole: a.team[0]?.role ?? 'MEMBER',
        team: undefined,
      })),
      myFindings,
      overdueFindings,
      myWorkingPapers: myPapers,
      myPbc,
      kpis: {
        activeAudits:       myAudits.length,
        openFindings:       myFindings.length,
        overdueFindings:    overdueFindings.length,
        pendingPapers:      myPapers.length,
        pendingPbc:         myPbc.length,
        hoursPlanned:       totalPlanned,
        hoursActual:        totalActual,
        hoursVariancePct:   totalPlanned > 0
          ? Math.round(((totalActual - totalPlanned) / totalPlanned) * 100)
          : 0,
      },
    };
  }
}
