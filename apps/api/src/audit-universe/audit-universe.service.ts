import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAuditableUnitDto } from './dto/create-auditable-unit.dto';
import { UpdateAuditableUnitDto } from './dto/update-auditable-unit.dto';
import { AuthUser } from '../auth/jwt.strategy';

@Injectable()
export class AuditUniverseService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateAuditableUnitDto, user: AuthUser) {
    return this.prisma.auditEntity.create({
      data: {
        organizationId: user.organizationId,
        name: dto.name,
        description: dto.description,
        category: dto.division ?? 'Proceso',
        location: dto.location,
        responsible: dto.responsibleId,
        inherentRiskScore: dto.riskScore ?? 50,
        active: dto.isActive ?? true,
      },
    });
  }

  async findAll(
    user: AuthUser,
    page = 1,
    limit = 20,
    search?: string,
  ) {
    const skip = (page - 1) * limit;
    const where = {
      organizationId: user.organizationId,
      active: true,
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' as const } },
          { description: { contains: search, mode: 'insensitive' as const } },
          { category: { contains: search, mode: 'insensitive' as const } },
        ],
      }),
    };

    const [units, total] = await Promise.all([
      this.prisma.auditEntity.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ inherentRiskScore: 'desc' }, { name: 'asc' }],
        include: {
          _count: { select: { audits: true } },
        },
      }),
      this.prisma.auditEntity.count({ where }),
    ]);

    return {
      data: units,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    };
  }

  async findOne(id: string, user: AuthUser) {
    const unit = await this.prisma.auditEntity.findFirst({
      where: { id, organizationId: user.organizationId },
      include: {
        audits: {
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: {
            id: true, title: true, status: true,
            startDate: true, endDate: true,
          },
        },
      },
    });
    if (!unit) throw new NotFoundException('Unidad auditable no encontrada');
    return unit;
  }

  async update(id: string, dto: UpdateAuditableUnitDto, user: AuthUser) {
    await this.findOne(id, user);
    return this.prisma.auditEntity.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        category: dto.division,
        location: dto.location,
        responsible: dto.responsibleId,
        inherentRiskScore: dto.riskScore,
        active: dto.isActive,
      },
    });
  }

  async remove(id: string, user: AuthUser) {
    await this.findOne(id, user);
    return this.prisma.auditEntity.update({
      where: { id },
      data: { active: false },
    });
  }

  async getRiskSummary(user: AuthUser) {
    const byRange = await Promise.all([
      this.prisma.auditEntity.count({ where: { organizationId: user.organizationId, active: true, inherentRiskScore: { gte: 80 } } }),
      this.prisma.auditEntity.count({ where: { organizationId: user.organizationId, active: true, inherentRiskScore: { gte: 60, lt: 80 } } }),
      this.prisma.auditEntity.count({ where: { organizationId: user.organizationId, active: true, inherentRiskScore: { gte: 40, lt: 60 } } }),
      this.prisma.auditEntity.count({ where: { organizationId: user.organizationId, active: true, inherentRiskScore: { lt: 40 } } }),
    ]);

    return {
      CRITICAL: byRange[0],
      HIGH: byRange[1],
      MEDIUM: byRange[2],
      LOW: byRange[3],
    };
  }
}
