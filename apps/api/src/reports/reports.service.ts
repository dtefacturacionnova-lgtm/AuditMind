import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/jwt.strategy';
import { AuditStatus } from '@prisma/client';
import { PdfService } from '../pdf/pdf.service';
import { renderAuditReportBody, renderFindingBody } from '../pdf/pdf-templates';

@Injectable()
export class ReportsService {
  constructor(
    private prisma: PrismaService,
    private pdf: PdfService,
  ) {}

  // ─── PDF — Audit report ─────────────────────────────────────────────────────
  async generateAuditPdf(auditId: string, user: AuthUser): Promise<Buffer> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await this.getAuditReport(auditId, user);

    const body = renderAuditReportBody({
      audit: data,
      findings: data.findings ?? [],
      workingPapers: data.workingPapers ?? [],
    });

    return this.pdf.generateBranded({
      title:    `Informe de Auditoría — ${data.code ?? data.id?.slice(0, 8) ?? ''}`,
      subtitle: data.title,
      body,
      options:  {
        printPageNumbers: true,
        format: 'A4',
        footerNote: [data.code ?? data.id?.slice(0, 8), data.title].filter(Boolean).join(' — '),
      },
    });
  }

  async generateFindingPdf(findingId: string, user: AuthUser): Promise<Buffer> {
    const finding = await this.prisma.finding.findFirst({
      where:   { id: findingId, organizationId: user.organizationId },
      include: { audit: { select: { id: true, title: true } } },
    });
    if (!finding) throw new NotFoundException('Hallazgo no encontrado');

    const auditMeta = {
      title: (finding as unknown as { audit: { title: string } }).audit.title,
      code:  (finding as unknown as { audit: { id: string } }).audit.id.slice(0, 8),
    };

    const body = renderFindingBody({
      finding: {
        id:                 finding.id,
        title:              finding.title,
        severity:           finding.severity,
        status:             finding.status,
        condition:          finding.condition,
        criteria:           finding.criteria,
        cause:              finding.cause,
        effect:             finding.effect,
        risk:               finding.risk,
        recommendation:     finding.recommendation,
        managementResponse: finding.managementResponse,
        isMaterial:         finding.isMaterial,
        normativeReference: finding.normativeReference,
        normativeArticle:   finding.normativeArticle,
        effectAmount:       finding.effectAmount?.toString() ?? null,
        dueDate:            finding.dueDate?.toISOString() ?? null,
        audit:              auditMeta,
      },
    });

    return this.pdf.generateBranded({
      title:    finding.title,
      subtitle: `Hallazgo · ${auditMeta.code} — ${auditMeta.title}`,
      body,
      options:  {
        printPageNumbers: true,
        format: 'A4',
        footerNote: `${auditMeta.code} — ${auditMeta.title}`,
      },
    });
  }

  // ─── Reporte completo de una auditoría ───────────────────────────────────────
  async getAuditReport(auditId: string, user: AuthUser) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const audit: any = await this.prisma.audit.findFirst({
      where: { id: auditId, organizationId: user.organizationId },
      include: {
        auditEntity: { select: { name: true, category: true, responsible: true } },
        organization: { select: { name: true, logoUrl: true } },
        team: {
          include: {
            user: { select: { id: true, name: true, role: true, email: true } },
          },
        },
        findings: {
          orderBy: [{ severity: 'asc' }, { createdAt: 'desc' }],
          select: {
            id: true, title: true, severity: true, status: true,
            condition: true, criteria: true, cause: true, effect: true,
            risk: true, recommendation: true, managementResponse: true,
            effectAmount: true, isMaterial: true, qualityScore: true,
            dueDate: true, closedAt: true, escalationLevel: true,
            normativeReference: true, normativeArticle: true,
            responsible: { select: { name: true } },
            actions: {
              select: {
                id: true, description: true, status: true,
                progressPct: true, dueDate: true, completionDate: true, comments: true,
              },
              orderBy: { createdAt: 'asc' },
            },
          },
        },
        workingPapers: {
          orderBy: { code: 'asc' },
          select: {
            id: true, title: true, type: true, status: true,
            code: true, indexSection: true, conclusion: true,
            createdAt: true, updatedAt: true,
          },
        },
        pbcRequests: {
          select: {
            id: true, title: true, status: true, requestedToName: true,
            dueDate: true, submittedAt: true,
          },
        },
        externalConfirmations: {
          select: {
            id: true, type: true, status: true, respondentName: true,
            respondentEmail: true, amount: true, responseAmount: true,
            difference: true, sentAt: true, responseReceivedAt: true,
          },
        },
      },
    });

    if (!audit) throw new NotFoundException('Auditoría no encontrada');

    // ─── KPIs ────────────────────────────────────────────────────────────────
    const findings       = audit.findings as any[];
    const workingPapers  = audit.workingPapers as any[];
    const pbcRequests    = audit.pbcRequests as any[];
    const confirmations  = audit.externalConfirmations as any[];

    const findingsBySeverity = this.countBy(findings, 'severity');
    const findingsByStatus   = this.countBy(findings, 'status');
    const totalFindings      = findings.length;
    const closedFindings     = findings.filter((f: any) => f.status === 'CLOSED').length;
    const criticalFindings   = findings.filter((f: any) => f.severity === 'CRITICAL').length;
    const materialFindings   = findings.filter((f: any) => f.isMaterial).length;

    const wpByStatus  = this.countBy(workingPapers, 'status');
    const wpBySection = this.countBy(workingPapers, 'indexSection');

    const pbcAccepted      = pbcRequests.filter((p: any) => p.status === 'ACCEPTED').length;
    const confirmsReconciled = confirmations.filter((c: any) => c.status === 'RECONCILED').length;

    const lead = (audit.team as any[]).find((t: any) => t.role === 'LEAD')?.user;
    const hoursPlanned  = Number(audit.estimatedHours ?? 0);
    const hoursActual   = Number(audit.actualHours ?? 0);
    const hoursVariance = hoursPlanned > 0
      ? Math.round(((hoursActual - hoursPlanned) / hoursPlanned) * 100)
      : 0;

    return {
      generatedAt: new Date().toISOString(),
      overallOpinion: this.computeOpinion(audit.auditOpinion, findings),
      audit: {
        id:                 audit.id,
        title:              audit.title,
        type:               audit.type,
        status:             audit.status,
        auditOpinion:       audit.auditOpinion ?? null,
        methodology:        audit.methodology ?? null,
        materiality:        audit.materiality ? Number(audit.materiality) : null,
        materialityExecution: audit.materialityExecution ? Number(audit.materialityExecution) : null,
        startDate:          audit.startDate,
        endDate:            audit.endDate,
        auditPeriodStart:   audit.auditPeriodStart ?? null,
        auditPeriodEnd:     audit.auditPeriodEnd ?? null,
        reportIssuanceDate: audit.reportIssuanceDate ?? null,
        objectives:         audit.objectives,
        scope:              audit.scope,
        overallConclusion:  audit.overallConclusion ?? null,
        organization:       audit.organization,
        auditEntity:        audit.auditEntity,
        lead,
        team: (audit.team as any[]).map((t: any) => ({ ...t.user, teamRole: t.role })),
        estimatedHours:     hoursPlanned,
        actualHours:        hoursActual,
        hoursVariancePct:   hoursVariance,
      },
      summary: {
        findings: {
          total:      totalFindings,
          closed:     closedFindings,
          open:       totalFindings - closedFindings,
          critical:   criticalFindings,
          material:   materialFindings,
          bySeverity: findingsBySeverity,
          byStatus:   findingsByStatus,
        },
        workingPapers: {
          total:     workingPapers.length,
          approved:  wpByStatus['APPROVED'] ?? 0,
          byStatus:  wpByStatus,
          bySection: wpBySection,
        },
        pbc: {
          total:    pbcRequests.length,
          accepted: pbcAccepted,
          pending:  pbcRequests.length - pbcAccepted,
        },
        confirmations: {
          total:      confirmations.length,
          reconciled: confirmsReconciled,
          pending:    confirmations.length - confirmsReconciled,
        },
      },
      findings:      findings.map((f: any) => ({
        ...f,
        effectAmount: f.effectAmount ? Number(f.effectAmount) : null,
      })),
      workingPapers,
      pbcRequests,
      confirmations: confirmations.map((c: any) => ({
        ...c,
        amount:         c.amount ? Number(c.amount) : null,
        responseAmount: c.responseAmount ? Number(c.responseAmount) : null,
        difference:     c.difference ? Number(c.difference) : null,
      })),
    };
  }

  // ─── Lista de reportes disponibles para la org ───────────────────────────────
  async listAvailableReports(user: AuthUser) {
    const audits = await this.prisma.audit.findMany({
      where: {
        organizationId: user.organizationId,
        status: { in: [AuditStatus.IN_PROGRESS, AuditStatus.REVIEW, AuditStatus.CLOSED] },
      },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        title: true,
        status: true,
        type: true,
        startDate: true,
        endDate: true,
        auditEntity: { select: { name: true, category: true } },
        _count: {
          select: { findings: true, workingPapers: true },
        },
      },
    });

    return { items: audits, total: audits.length };
  }

  // ─── Util ─────────────────────────────────────────────────────────────────
  private computeOpinion(auditOpinion: string | null, findings: any[]): string {
    if (auditOpinion) return auditOpinion;
    const open = findings.filter((f: any) => !['CLOSED', 'ACCEPTED_RISK'].includes(f.status));
    if (open.some((f: any) => f.severity === 'CRITICAL')) return 'CRITICAL';
    if (open.some((f: any) => f.severity === 'HIGH'))     return 'UNSATISFACTORY';
    if (open.some((f: any) => f.severity === 'MEDIUM'))   return 'NEEDS_IMPROVEMENT';
    return 'SATISFACTORY';
  }

  private countBy<T extends Record<string, any>>(arr: T[], key: string): Record<string, number> {
    return arr.reduce((acc, item) => {
      const val = item[key] ?? 'UNKNOWN';
      acc[val] = (acc[val] ?? 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }
}
