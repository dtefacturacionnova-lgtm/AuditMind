import { Injectable, NotFoundException } from '@nestjs/common';
import { assertInOrg } from '../common/utils/tenant.util';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/jwt.strategy';
import { CreateObjectiveDto, UpdateObjectiveDto, CreateLineDto, UpdateLineDto } from './dto/strategic.dto';

@Injectable()
export class StrategicService {
  constructor(private prisma: PrismaService) {}

  async getObjectives(user: AuthUser) {
    return this.prisma.strategicObjective.findMany({
      where: { organizationId: user.organizationId, active: true },
      include: {
        lines: {
          where: { active: true, organizationId: user.organizationId },
          orderBy: { sortOrder: 'asc' },
        },
      },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async createObjective(dto: CreateObjectiveDto, user: AuthUser) {
    return this.prisma.strategicObjective.create({
      data: { ...dto, organizationId: user.organizationId },
      include: { lines: true },
    });
  }

  async updateObjective(id: string, dto: UpdateObjectiveDto, user: AuthUser) {
    await this.assertObjective(id, user);
    return this.prisma.strategicObjective.update({ where: { id }, data: dto });
  }

  async deleteObjective(id: string, user: AuthUser) {
    await this.assertObjective(id, user);
    return this.prisma.strategicObjective.delete({ where: { id } });
  }

  async createLine(dto: CreateLineDto, user: AuthUser) {
    await assertInOrg(this.prisma.strategicObjective, dto.objectiveId, { organizationId: user.organizationId }, 'El objetivo estratégico');
    return this.prisma.strategicLine.create({
      data: { ...dto, organizationId: user.organizationId },
    });
  }

  async updateLine(id: string, dto: UpdateLineDto, user: AuthUser) {
    await this.assertLine(id, user);
    return this.prisma.strategicLine.update({ where: { id }, data: dto });
  }

  async deleteLine(id: string, user: AuthUser) {
    await this.assertLine(id, user);
    return this.prisma.strategicLine.delete({ where: { id } });
  }

  // Aislamiento multi-organización (auditoría de seguridad 2026-10-18).
  private async assertObjective(id: string, user: AuthUser) {
    const found = await this.prisma.strategicObjective.findFirst({
      where: { id, organizationId: user.organizationId }, select: { id: true },
    });
    if (!found) throw new NotFoundException('Objetivo estratégico no encontrado');
  }

  private async assertLine(id: string, user: AuthUser) {
    const found = await this.prisma.strategicLine.findFirst({
      where: { id, organizationId: user.organizationId }, select: { id: true },
    });
    if (!found) throw new NotFoundException('Línea estratégica no encontrada');
  }
}
