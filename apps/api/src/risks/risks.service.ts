import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/jwt.strategy';
import {
  IsString, IsOptional, IsInt, Min, Max, IsIn, IsArray,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// ─── DTOs ─────────────────────────────────────────────────────────────────────

export class CreateRiskDto {
  @ApiProperty()
  @IsString()
  title: string;

  @ApiProperty()
  @IsString()
  description: string;

  @ApiProperty()
  @IsString()
  @IsIn(['estratégico', 'operacional', 'financiero', 'TI', 'compliance', 'reputacional', 'ESG'])
  category: string;

  @ApiProperty({ minimum: 1, maximum: 5 })
  @IsInt() @Min(1) @Max(5)
  probability: number;

  @ApiProperty({ minimum: 1, maximum: 5 })
  @IsInt() @Min(1) @Max(5)
  impact: number;

  @ApiProperty({ minimum: 0, maximum: 100 })
  @IsInt() @Min(0) @Max(100)
  controlsScore: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  auditEntityId?: string;

  @ApiPropertyOptional({ enum: ['INCREASING', 'STABLE', 'DECREASING'] })
  @IsOptional()
  @IsString()
  @IsIn(['INCREASING', 'STABLE', 'DECREASING'])
  trend?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  kris?: string[];
}

export class UpdateRiskDto {
  @IsOptional() @IsString()             title?: string;
  @IsOptional() @IsString()             description?: string;
  @IsOptional() @IsString()             category?: string;
  @IsOptional() @IsInt() @Min(1) @Max(5) probability?: number;
  @IsOptional() @IsInt() @Min(1) @Max(5) impact?: number;
  @IsOptional() @IsInt() @Min(0) @Max(100) controlsScore?: number;
  @IsOptional() @IsString()             auditEntityId?: string;
  @IsOptional() @IsString()             trend?: string;
  @IsOptional() @IsArray()              kris?: string[];
}

// ─── Service ──────────────────────────────────────────────────────────────────

function calcResidual(inherentScore: number, controlsScore: number): number {
  // residual = inherentScore * (1 - controlsScore/100)
  return Math.round(inherentScore * (1 - controlsScore / 100));
}

@Injectable()
export class RisksService {
  constructor(private prisma: PrismaService) {}

  async findAll(user: AuthUser, auditEntityId?: string) {
    const where: Record<string, unknown> = { organizationId: user.organizationId };
    if (auditEntityId) where['auditEntityId'] = auditEntityId;

    const risks = await this.prisma.riskRegister.findMany({
      where,
      orderBy: [{ inherentScore: 'desc' }, { lastUpdated: 'desc' }],
      include: {
        auditEntity: { select: { id: true, name: true } },
      },
    });
    return risks;
  }

  async findOne(id: string, user: AuthUser) {
    const risk = await this.prisma.riskRegister.findUnique({
      where: { id },
      include: {
        auditEntity: { select: { id: true, name: true } },
      },
    });
    if (!risk) throw new NotFoundException('Riesgo no encontrado');
    if (risk.organizationId !== user.organizationId) throw new ForbiddenException();
    return risk;
  }

  async create(dto: CreateRiskDto, user: AuthUser) {
    const inherentScore = dto.probability * dto.impact;
    const residualScore = calcResidual(inherentScore, dto.controlsScore);

    return this.prisma.riskRegister.create({
      data: {
        organizationId: user.organizationId,
        title:         dto.title,
        description:   dto.description,
        category:      dto.category,
        probability:   dto.probability,
        impact:        dto.impact,
        inherentScore,
        controlsScore: dto.controlsScore,
        residualScore,
        auditEntityId: dto.auditEntityId ?? null,
        trend:         dto.trend ?? 'STABLE',
        kris:          dto.kris ?? [],
        lastUpdated:   new Date(),
      },
      include: {
        auditEntity: { select: { id: true, name: true } },
      },
    });
  }

  async update(id: string, dto: UpdateRiskDto, user: AuthUser) {
    const existing = await this.findOne(id, user);

    const probability = dto.probability ?? existing.probability;
    const impact      = dto.impact      ?? existing.impact;
    const controlsScore = dto.controlsScore ?? existing.controlsScore;
    const inherentScore = probability * impact;
    const residualScore = calcResidual(inherentScore, controlsScore);

    return this.prisma.riskRegister.update({
      where: { id },
      data: {
        ...(dto.title       !== undefined && { title: dto.title }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.category    !== undefined && { category: dto.category }),
        probability,
        impact,
        inherentScore,
        controlsScore,
        residualScore,
        ...(dto.auditEntityId !== undefined && { auditEntityId: dto.auditEntityId }),
        ...(dto.trend         !== undefined && { trend: dto.trend }),
        ...(dto.kris          !== undefined && { kris: dto.kris }),
        lastUpdated: new Date(),
      },
      include: {
        auditEntity: { select: { id: true, name: true } },
      },
    });
  }

  async remove(id: string, user: AuthUser) {
    await this.findOne(id, user);
    return this.prisma.riskRegister.delete({ where: { id } });
  }

  async stats(user: AuthUser) {
    const risks = await this.prisma.riskRegister.findMany({
      where: { organizationId: user.organizationId },
      select: { inherentScore: true, residualScore: true, trend: true },
    });

    const critical = risks.filter(r => r.residualScore >= 20).length;
    const high     = risks.filter(r => r.residualScore >= 15 && r.residualScore < 20).length;
    const medium   = risks.filter(r => r.residualScore >= 8  && r.residualScore < 15).length;
    const low      = risks.filter(r => r.residualScore < 8).length;
    const increasing = risks.filter(r => r.trend === 'INCREASING').length;

    return { total: risks.length, critical, high, medium, low, increasing };
  }
}
