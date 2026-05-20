import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/jwt.strategy';
import { AuditStatus, FindingStatus, PbcRequestStatus, EscalationLevel } from '@prisma/client';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async getKpis(user: AuthUser) {
    const orgId = user.organizationId;
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
          organizationId: orgId,
          status: { in: [AuditStatus.IN_PROGRESS, AuditStatus.REVIEW] },
        },
      }),
      this.prisma.audit.count({
        where: { organizationId: orgId, status: AuditStatus.CLOSED },
      }),
      this.prisma.finding.count({
        where: {
          organizationId: orgId,
          status: { notIn: [FindingStatus.CLOSED] },
        },
      }),
      this.prisma.finding.count({
        where: {
          organizationId: orgId,
          severity: 'CRITICAL',
          status: { notIn: [FindingStatus.CLOSED] },
        },
      }),
      this.prisma.pbcRequest.count({
        where: {
          organizationId: orgId,
          dueDate: { lt: now },
          status: { notIn: [PbcRequestStatus.ACCEPTED, PbcRequestStatus.REJECTED] },
        },
      }),
      this.prisma.audit.count({
        where: { organizationId: orgId, status: { not: AuditStatus.CANCELLED } },
      }),
      this.prisma.audit.count({
        where: {
          organizationId: orgId,
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
        organizationId: user.organizationId,
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
        organizationId: user.organizationId,
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
          organizationId: user.organizationId,
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
          organizationId: user.organizationId,
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
    const now   = new Date();
    const yearStart = new Date(now.getFullYear(), 0, 1);

    // Carga del equipo: auditorías activas por auditor
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
      where: { organizationId: orgId, status: FindingStatus.IN_REVIEW },
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
        organizationId: orgId,
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

    const findingsTrend = await this.prisma.$queryRaw<{ month: string; total: bigint; closed: bigint }[]>`
      SELECT
        TO_CHAR(DATE_TRUNC('month', "createdAt"), 'YYYY-MM') AS month,
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE status = 'CLOSED') AS closed
      FROM findings
      WHERE "organizationId" = ${orgId}
        AND "createdAt" >= ${sixMonthsAgo}
      GROUP BY DATE_TRUNC('month', "createdAt")
      ORDER BY DATE_TRUNC('month', "createdAt")
    `;

    const [closedYear, totalYear, totalFindings, closedFindings, activePlans] = await Promise.all([
      this.prisma.audit.count({ where: { organizationId: orgId, status: AuditStatus.CLOSED, updatedAt: { gte: yearStart } } }),
      this.prisma.audit.count({ where: { organizationId: orgId, createdAt: { gte: yearStart } } }),
      this.prisma.finding.count({ where: { organizationId: orgId, createdAt: { gte: yearStart } } }),
      this.prisma.finding.count({ where: { organizationId: orgId, status: FindingStatus.CLOSED, updatedAt: { gte: yearStart } } }),
      this.prisma.auditPlan.count({ where: { organizationId: orgId, status: { in: ['ACTIVE', 'APPROVED'] as any } } }),
    ]);

    return {
      teamWorkload,
      pendingApproval,
      escalated,
      findingsTrend: findingsTrend.map(r => ({
        month:  r.month,
        total:  Number(r.total),
        closed: Number(r.closed),
      })),
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
