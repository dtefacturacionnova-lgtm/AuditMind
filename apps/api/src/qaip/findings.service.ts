import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/jwt.strategy';
import {
  CreateQaipFindingDto, UpdateQaipFindingStatusDto,
  CreateQaipRootCauseDto, CreateQaipRemediationActionDto, UpdateQaipRemediationActionDto,
} from './dto/finding.dto';

const FINDING_INCLUDE = {
  createdBy: { select: { id: true, name: true } },
  assessmentItem: { include: { standard: true } },
  rootCauses: { orderBy: { createdAt: 'asc' as const } },
  remediationActions: {
    include: { owner: { select: { id: true, name: true } } },
    orderBy: { dueDate: 'asc' as const },
  },
} satisfies Prisma.QaipFindingInclude;

@Injectable()
export class FindingsService {
  constructor(private readonly prisma: PrismaService) {}

  private async getFindingOrThrow(id: string, user: AuthUser) {
    const f = await this.prisma.qaipFinding.findUnique({ where: { id } });
    if (!f) throw new NotFoundException('Hallazgo de calidad no encontrado');
    if (f.organizationId !== user.organizationId) throw new ForbiddenException();
    return f;
  }

  async list(user: AuthUser, track?: string, status?: string) {
    return this.prisma.qaipFinding.findMany({
      where: {
        organizationId: user.organizationId,
        ...(track && { track: track as any }),
        ...(status && { status: status as any }),
      },
      include: FINDING_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(dto: CreateQaipFindingDto, user: AuthUser) {
    if (dto.assessmentItemId) {
      const item = await this.prisma.qaipAssessmentItem.findUnique({
        where: { id: dto.assessmentItemId },
        include: { assessment: true },
      });
      if (!item || item.assessment.organizationId !== user.organizationId) {
        throw new BadRequestException('assessmentItemId inválido para esta organización');
      }
    }
    return this.prisma.qaipFinding.create({
      data: {
        organizationId: user.organizationId,
        track: dto.track,
        source: dto.source,
        assessmentItemId: dto.assessmentItemId,
        engagementId: dto.engagementId,
        severity: dto.severity,
        description: dto.description,
        createdById: user.id,
      },
      include: FINDING_INCLUDE,
    });
  }

  async updateStatus(id: string, dto: UpdateQaipFindingStatusDto, user: AuthUser) {
    await this.getFindingOrThrow(id, user);
    return this.prisma.qaipFinding.update({
      where: { id },
      data: { status: dto.status },
      include: FINDING_INCLUDE,
    });
  }

  /** NIGC 1 componente 8: análisis de causa raíz obligatorio para toda deficiencia. */
  async addRootCause(findingId: string, dto: CreateQaipRootCauseDto, user: AuthUser) {
    await this.getFindingOrThrow(findingId, user);
    await this.prisma.qaipRootCause.create({
      data: { findingId, category: dto.category, analysis: dto.analysis },
    });
    return this.prisma.qaipFinding.findUnique({ where: { id: findingId }, include: FINDING_INCLUDE });
  }

  async addRemediationAction(findingId: string, dto: CreateQaipRemediationActionDto, user: AuthUser) {
    await this.getFindingOrThrow(findingId, user);
    await this.prisma.qaipRemediationAction.create({
      data: {
        findingId, description: dto.description, ownerId: dto.ownerId,
        dueDate: new Date(dto.dueDate),
      },
    });
    return this.prisma.qaipFinding.findUnique({ where: { id: findingId }, include: FINDING_INCLUDE });
  }

  async updateRemediationAction(actionId: string, dto: UpdateQaipRemediationActionDto, user: AuthUser) {
    const action = await this.prisma.qaipRemediationAction.findUnique({
      where: { id: actionId },
      include: { finding: true },
    });
    if (!action) throw new NotFoundException('Plan de acción no encontrado');
    if (action.finding.organizationId !== user.organizationId) throw new ForbiddenException();

    const updated = await this.prisma.qaipRemediationAction.update({
      where: { id: actionId },
      data: {
        ...(dto.status != null && { status: dto.status }),
        ...(dto.closureEvidence != null && { closureEvidence: dto.closureEvidence }),
        ...(dto.status === 'DONE' && { closedAt: new Date() }),
      },
    });

    // Si todas las acciones de remediación de un hallazgo quedan DONE, el
    // hallazgo pasa automáticamente a REMEDIATED — evita que el auditor tenga
    // que recordar cerrar dos entidades por separado.
    const siblings = await this.prisma.qaipRemediationAction.findMany({ where: { findingId: action.findingId } });
    if (siblings.length > 0 && siblings.every(a => a.status === 'DONE')) {
      await this.prisma.qaipFinding.update({
        where: { id: action.findingId },
        data: { status: 'REMEDIATED' },
      });
    }

    return updated;
  }
}
