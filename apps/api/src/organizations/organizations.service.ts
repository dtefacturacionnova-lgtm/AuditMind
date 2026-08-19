import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { AuthUser } from '../auth/jwt.strategy';
import { UserRole } from '@prisma/client';

@Injectable()
export class OrganizationsService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateOrganizationDto) {
    const slug = dto.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    return this.prisma.organization.create({
      data: {
        name: dto.name,
        slug: `${slug}-${Date.now()}`,
        plan: dto.subscriptionTier?.toLowerCase() ?? 'starter',
        primaryColor: dto.primaryColor ?? '#0F2D4A',
        settings: {},
      },
    });
  }

  async findAll() {
    return this.prisma.organization.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { users: true, audits: true } },
      },
    });
  }

  async findOne(id: string, user: AuthUser) {
    if (user.role !== UserRole.SUPER_ADMIN && user.organizationId !== id) {
      throw new ForbiddenException('No autorizado para ver esta organización');
    }
    const org = await this.prisma.organization.findUnique({
      where: { id },
      include: {
        _count: { select: { users: true, audits: true } },
      },
    });
    if (!org) throw new NotFoundException('Organización no encontrada');
    return org;
  }

  async update(id: string, dto: UpdateOrganizationDto, user: AuthUser) {
    if (user.role !== UserRole.SUPER_ADMIN && user.organizationId !== id) {
      throw new ForbiddenException('No autorizado para modificar esta organización');
    }
    await this.findOne(id, user);
    return this.prisma.organization.update({
      where: { id },
      data: {
        name: dto.name,
        primaryColor: dto.primaryColor,
        plan: dto.subscriptionTier?.toLowerCase(),
        active: true,
        ...(dto.auditModality !== undefined && { auditModality: dto.auditModality }),
      },
    });
  }

  async findMine(organizationId: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        id: true,
        name: true,
        auditModality: true,
        logoUrl: true,
        primaryColor: true,
      },
    });
    if (!org) throw new NotFoundException('Organización no encontrada');
    return org;
  }

  async getStats(id: string, user: AuthUser) {
    await this.findOne(id, user);
    const [totalAudits, activeAudits, totalFindings, openFindings, totalUsers, totalWorkingPapers] =
      await Promise.all([
        this.prisma.audit.count({ where: { organizationId: id } }),
        this.prisma.audit.count({
          where: { organizationId: id, status: { in: ['PLANNING', 'IN_PROGRESS', 'REVIEW'] } },
        }),
        this.prisma.finding.count({ where: { organizationId: id } }),
        this.prisma.finding.count({
          where: { organizationId: id, status: { notIn: ['CLOSED'] } },
        }),
        this.prisma.user.count({ where: { organizationId: id, active: true } }),
        this.prisma.workingPaper.count({ where: { audit: { organizationId: id } } }),
      ]);
    return { totalAudits, activeAudits, totalFindings, openFindings, totalUsers, totalWorkingPapers };
  }
}
