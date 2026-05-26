import { Injectable } from '@nestjs/common';
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
          where: { active: true },
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

  async updateObjective(id: string, dto: UpdateObjectiveDto) {
    return this.prisma.strategicObjective.update({ where: { id }, data: dto });
  }

  async deleteObjective(id: string) {
    return this.prisma.strategicObjective.delete({ where: { id } });
  }

  async createLine(dto: CreateLineDto, user: AuthUser) {
    return this.prisma.strategicLine.create({
      data: { ...dto, organizationId: user.organizationId },
    });
  }

  async updateLine(id: string, dto: UpdateLineDto) {
    return this.prisma.strategicLine.update({ where: { id }, data: dto });
  }

  async deleteLine(id: string) {
    return this.prisma.strategicLine.delete({ where: { id } });
  }
}
