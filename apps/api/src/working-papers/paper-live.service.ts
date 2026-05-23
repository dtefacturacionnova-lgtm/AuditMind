import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/jwt.strategy';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LiveStats {
  auditId:   string;
  auditTitle: string;
  papers: {
    total:           number;
    draft:           number;
    inReview:        number;
    approved:        number;
    archived:        number;
    coveragePercent: number;   // % of papers that are APPROVED or IN_REVIEW
    bySection:       Record<string, { total: number; approved: number }>;
  };
  findings: {
    total:       number;
    open:        number;
    closed:      number;
    critical:    number;
    high:        number;
    medium:      number;
    low:         number;
    informational: number;
    closureRate: number;       // % closed
  };
  budget: {
    estimatedHours:  number;
    actualHours:     number;
    usagePercent:    number;
    onTrack:         boolean;
  };
  team: {
    total:   number;
    members: Array<{ name: string; role: string; avatarUrl?: string | null }>;
  };
  intelligentPapers: {
    smart:        number;    // SMART papers
    master:       number;    // MASTER papers
    synced:       number;    // Papers with syncStatus = SYNCED
    stale:        number;    // Papers with syncStatus = STALE
    avgQuality:   number;    // Average quality score
  };
  recentActivity: Array<{
    type:        string;
    description: string;
    date:        string;
  }>;
  updatedAt: string;
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class PaperLiveService {
  constructor(private readonly prisma: PrismaService) {}

  async getLiveStats(paperId: string, user: AuthUser): Promise<LiveStats> {
    // Look up the paper to get auditId
    const paper = await this.prisma.workingPaper.findUnique({
      where:   { id: paperId },
      include: { audit: { select: { organizationId: true, title: true } } },
    });
    if (!paper) throw new NotFoundException('Papel de trabajo no encontrado');
    if (paper.audit.organizationId !== user.organizationId) throw new ForbiddenException();

    return this.getStatsByAuditId(paper.auditId, paper.audit.title);
  }

  async getLiveStatsByAuditId(auditId: string, user: AuthUser): Promise<LiveStats> {
    const audit = await this.prisma.audit.findUnique({
      where:   { id: auditId },
      select:  { organizationId: true, title: true },
    });
    if (!audit) throw new NotFoundException('Auditoría no encontrada');
    if (audit.organizationId !== user.organizationId) throw new ForbiddenException();
    return this.getStatsByAuditId(auditId, audit.title);
  }

  // ─── Core aggregation ─────────────────────────────────────────────────────

  private async getStatsByAuditId(auditId: string, auditTitle: string): Promise<LiveStats> {
    const [papers, findings, audit, team] = await Promise.all([
      this.prisma.workingPaper.findMany({
        where:  { auditId },
        select: {
          id: true, status: true, indexSection: true, wpKind: true,
          syncStatus: true, qualityScore: true,
          updatedAt: true, title: true, code: true,
        },
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.finding.findMany({
        where:  { auditId },
        select: { id: true, severity: true, status: true, title: true, createdAt: true, updatedAt: true },
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.audit.findUnique({
        where:  { id: auditId },
        select: { estimatedHours: true, actualHours: true },
      }),
      this.prisma.auditTeam.findMany({
        where:   { auditId },
        include: { user: { select: { name: true, role: true, avatarUrl: true } } },
      }),
    ]);

    // ─── Papers ───────────────────────────────────────────────────────────
    const papersBySection: Record<string, { total: number; approved: number }> = {};
    let draft = 0, inReview = 0, approved = 0, archived = 0;
    let smart = 0, master = 0, synced = 0, stale = 0;
    const qualityScores: number[] = [];

    for (const p of papers) {
      if (p.status === 'DRAFT')     draft++;
      if (p.status === 'IN_REVIEW') inReview++;
      if (p.status === 'APPROVED')  approved++;
      if (p.status === 'ARCHIVED')  archived++;
      if (p.wpKind === 'SMART')  smart++;
      if (p.wpKind === 'MASTER') master++;
      if (p.syncStatus === 'SYNCED') synced++;
      if (p.syncStatus === 'STALE')  stale++;
      if (p.qualityScore !== null && p.qualityScore !== undefined) qualityScores.push(p.qualityScore);

      const sec = p.indexSection;
      if (!papersBySection[sec]) papersBySection[sec] = { total: 0, approved: 0 };
      papersBySection[sec].total++;
      if (p.status === 'APPROVED') papersBySection[sec].approved++;
    }

    const totalPapers      = papers.length;
    const coveragePercent  = totalPapers > 0
      ? Math.round(((approved + inReview) / totalPapers) * 100)
      : 0;
    const avgQuality = qualityScores.length > 0
      ? Math.round(qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length)
      : 0;

    // ─── Findings ─────────────────────────────────────────────────────────
    const CLOSED_STATUSES = new Set(['CLOSED', 'ACCEPTED_RISK']);
    let critical = 0, high = 0, medium = 0, low = 0, informational = 0;
    let closedCount = 0;

    for (const f of findings) {
      if (f.severity === 'CRITICAL')     critical++;
      if (f.severity === 'HIGH')         high++;
      if (f.severity === 'MEDIUM')       medium++;
      if (f.severity === 'LOW')          low++;
      if (f.severity === 'INFORMATIONAL') informational++;
      if (CLOSED_STATUSES.has(f.status)) closedCount++;
    }

    const totalFindings = findings.length;
    const closureRate   = totalFindings > 0
      ? Math.round((closedCount / totalFindings) * 100)
      : 0;

    // ─── Budget ───────────────────────────────────────────────────────────
    const estimatedHours = Number(audit?.estimatedHours ?? 0);
    const actualHours    = Number(audit?.actualHours    ?? 0);
    const usagePercent   = estimatedHours > 0
      ? Math.round((actualHours / estimatedHours) * 100)
      : 0;
    const onTrack = usagePercent <= 90; // Flag if >90% budget consumed

    // ─── Recent activity ──────────────────────────────────────────────────
    const recentPapers   = papers.slice(0, 3).map(p => ({
      type:        'PAPER_UPDATED',
      description: `Papel ${p.code} — ${p.title} actualizado`,
      date:        p.updatedAt.toISOString(),
    }));
    const recentFindings = findings.slice(0, 2).map(f => ({
      type:        'FINDING_UPDATED',
      description: `Hallazgo: ${f.title}`,
      date:        f.updatedAt.toISOString(),
    }));
    const recentActivity = [...recentPapers, ...recentFindings]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 5);

    return {
      auditId,
      auditTitle,
      papers: {
        total: totalPapers, draft, inReview, approved, archived,
        coveragePercent,
        bySection: papersBySection,
      },
      findings: {
        total: totalFindings,
        open:  totalFindings - closedCount,
        closed: closedCount,
        critical, high, medium, low, informational,
        closureRate,
      },
      budget: {
        estimatedHours, actualHours, usagePercent, onTrack,
      },
      team: {
        total:   team.length,
        members: team.map(m => ({
          name:      m.user.name,
          role:      m.role,
          avatarUrl: m.user.avatarUrl,
        })),
      },
      intelligentPapers: {
        smart, master, synced, stale, avgQuality,
      },
      recentActivity,
      updatedAt: new Date().toISOString(),
    };
  }
}
