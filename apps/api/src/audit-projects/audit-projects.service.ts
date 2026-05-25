import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/jwt.strategy';
import { CreateAuditProjectDto, UpdateAuditProjectDto } from './dto/audit-project.dto';

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
    return this.prisma.auditProject.findMany({
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
  }

  async findOne(id: string) {
    return this.prisma.auditProject.findUnique({ where: { id }, include: INCLUDE });
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
      select: { finalRiskLevel: true, includeInPlan: true, planYear: true, totalBudget: true },
    });
    const years = [...new Set(projects.map(p => p.planYear))].sort((a, b) => b - a);
    return {
      total:       projects.length,
      inPlan:      projects.filter(p => p.includeInPlan).length,
      critico:     projects.filter(p => p.finalRiskLevel === 'CRITICO').length,
      alto:        projects.filter(p => p.finalRiskLevel === 'ALTO').length,
      medio:       projects.filter(p => p.finalRiskLevel === 'MEDIO').length,
      bajo:        projects.filter(p => p.finalRiskLevel === 'BAJO').length,
      years,
      totalBudget: projects.reduce((s, p) => s + (p.totalBudget ?? 0), 0),
    };
  }
}
