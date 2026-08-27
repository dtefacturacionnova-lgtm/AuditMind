import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/jwt.strategy';

/**
 * Tablero de KPIs de desempeño (IIA Std. 12.2 / NIGC 1 monitoreo) — a
 * propósito, no pide NINGÚN dato nuevo al usuario: todo se calcula a partir
 * de datos que ya existen en Papeles de Trabajo, Cartera y los hallazgos de
 * calidad de QAIP V2.
 */
@Injectable()
export class PerformanceService {
  constructor(private readonly prisma: PrismaService) {}

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
    };
  }
}
