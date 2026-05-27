import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/jwt.strategy';
import { CreateAuditProjectDto, UpdateAuditProjectDto } from './dto/audit-project.dto';
import { AuditStatus } from '@prisma/client';

const INCLUDE = {
  strategicObjective: { select: { id: true, code: true, name: true, color: true, icon: true } },
  strategicLine:      { select: { id: true, code: true, name: true } },
  responsibleEntity:  { select: { id: true, name: true, entityType: true } },
  supportEntity:      { select: { id: true, name: true, entityType: true } },
};

@Injectable()
export class AuditProjectsService {
  constructor(private prisma: PrismaService) {}

  async findAll(user: AuthUser, year?: number, riskLevel?: string, search?: string) {
    const projects = await this.prisma.auditProject.findMany({
      where: {
        organizationId: user.organizationId,
        active: true,
        ...(year       && { planYear:        year }),
        ...(riskLevel  && { finalRiskLevel:  riskLevel }),
        ...(search     && { name: { contains: search, mode: 'insensitive' } }),
      },
      include: INCLUDE,
      orderBy: [{ planYear: 'desc' }, { correlative: 'asc' }],
    });
    return this.enrichWithCoverage(projects, user.organizationId);
  }

  async findOne(id: string) {
    const project = await this.prisma.auditProject.findUnique({ where: { id }, include: INCLUDE });
    if (!project) return null;
    const [enriched] = await this.enrichWithCoverage([project], project.organizationId);
    return enriched;
  }

  async create(dto: CreateAuditProjectDto, user: AuthUser) {
    return this.prisma.auditProject.create({
      data: { ...dto, organizationId: user.organizationId },
      include: INCLUDE,
    });
  }

  async update(id: string, dto: UpdateAuditProjectDto) {
    return this.prisma.auditProject.update({ where: { id }, data: dto, include: INCLUDE });
  }

  async remove(id: string) {
    return this.prisma.auditProject.delete({ where: { id } });
  }

  async getStats(user: AuthUser) {
    const projects = await this.prisma.auditProject.findMany({
      where: { organizationId: user.organizationId, active: true },
      select: {
        finalRiskLevel: true, includeInPlan: true, planYear: true,
        totalBudget: true, responsibleEntityId: true,
      },
    });
    const years = [...new Set(projects.map(p => p.planYear))].sort((a, b) => b - a);

    // Coverage: projects that have a responsibleEntity assigned
    const withEntity = projects.filter(p => p.responsibleEntityId).length;

    return {
      total:       projects.length,
      inPlan:      projects.filter(p => p.includeInPlan).length,
      critico:     projects.filter(p => p.finalRiskLevel === 'CRITICO').length,
      alto:        projects.filter(p => p.finalRiskLevel === 'ALTO').length,
      medio:       projects.filter(p => p.finalRiskLevel === 'MEDIO').length,
      bajo:        projects.filter(p => p.finalRiskLevel === 'BAJO').length,
      withEntity,
      years,
      totalBudget: projects.reduce((s, p) => s + (p.totalBudget ?? 0), 0),
    };
  }

  // Actualiza coverageHistoryScore (1-5) en todos los proyectos usando el historial real
  // de auditorías cerradas. Mayor score = más tiempo sin auditar = mayor riesgo.
  // Banda → score: <365d→1, 365-730d→2, 730-1095d→3, 1095-1460d→4, >1460d/nunca→5
  async syncCoverage(user: AuthUser) {
    const projects = await this.prisma.auditProject.findMany({
      where: {
        organizationId: user.organizationId,
        active: true,
        responsibleEntityId: { not: null },
      },
      select: { id: true, name: true, correlative: true, responsibleEntityId: true, coverageHistoryScore: true },
    });

    const entityIds = [...new Set(projects.map(p => p.responsibleEntityId!))];
    const closedAudits = await this.prisma.audit.findMany({
      where: {
        organizationId: user.organizationId,
        auditEntityId: { in: entityIds },
        status: AuditStatus.CLOSED,
      },
      select: { auditEntityId: true, endDate: true, updatedAt: true },
      orderBy: { endDate: 'desc' },
    });

    const lastAuditMap = new Map<string, Date>();
    for (const audit of closedAudits) {
      if (!audit.auditEntityId) continue;
      if (!lastAuditMap.has(audit.auditEntityId)) {
        lastAuditMap.set(audit.auditEntityId, audit.endDate ?? audit.updatedAt);
      }
    }

    const now = new Date();
    const updates: Array<{ id: string; correlative: string; name: string; oldValue: number | null; newValue: number }> = [];

    for (const p of projects) {
      const lastDate = lastAuditMap.get(p.responsibleEntityId!);
      // No audit found: maximum risk score (5)
      const newScore = !lastDate ? 5 : (() => {
        const days = Math.floor((now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
        if (days < 365)  return 1;
        if (days < 730)  return 2;
        if (days < 1095) return 3;
        if (days < 1460) return 4;
        return 5;
      })();
      if (p.coverageHistoryScore !== newScore) {
        updates.push({ id: p.id, correlative: p.correlative, name: p.name, oldValue: p.coverageHistoryScore, newValue: newScore });
      }
    }

    if (updates.length > 0) {
      await Promise.all(
        updates.map(u => this.prisma.auditProject.update({
          where: { id: u.id },
          data: { coverageHistoryScore: u.newValue },
        }))
      );
    }

    return { updated: updates.length, changes: updates };
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  private async enrichWithCoverage(projects: any[], organizationId: string) {
    const entityIds = [
      ...new Set(projects.map(p => p.responsibleEntityId).filter(Boolean) as string[]),
    ];

    if (entityIds.length === 0) {
      return projects.map(p => ({
        ...p, coverageGapDays: null, lastAuditDate: null, lastAuditAgeDynamic: null,
      }));
    }

    // Single query: most recent CLOSED audit per entity (ordered desc → first seen = latest)
    const closedAudits = await this.prisma.audit.findMany({
      where: {
        organizationId,
        auditEntityId: { in: entityIds },
        status: AuditStatus.CLOSED,
      },
      select: { auditEntityId: true, endDate: true, updatedAt: true },
      orderBy: { endDate: 'desc' },
    });

    const lastAuditMap = new Map<string, Date>();
    for (const audit of closedAudits) {
      if (!audit.auditEntityId) continue;
      if (!lastAuditMap.has(audit.auditEntityId)) {
        lastAuditMap.set(audit.auditEntityId, audit.endDate ?? audit.updatedAt);
      }
    }

    const now = new Date();
    return projects.map(p => {
      const lastDate = p.responsibleEntityId ? lastAuditMap.get(p.responsibleEntityId) : undefined;
      if (!lastDate) {
        return { ...p, coverageGapDays: null, lastAuditDate: null, lastAuditAgeDynamic: null };
      }
      const days = Math.floor((now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
      // Bands: 1=<365d, 2=365-730d, 3=730-1095d, 4=>1095d/Nunca
      const band = days < 365 ? 1 : days < 730 ? 2 : days < 1095 ? 3 : 4;
      return { ...p, coverageGapDays: days, lastAuditDate: lastDate, lastAuditAgeDynamic: band };
    });
  }
}
