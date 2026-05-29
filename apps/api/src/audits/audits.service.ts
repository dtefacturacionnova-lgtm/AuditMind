import {
  Injectable, NotFoundException, ForbiddenException, BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAuditDto } from './dto/create-audit.dto';
import { UpdateAuditDto, UpdateAuditStatusDto } from './dto/update-audit.dto';
import { AuthUser } from '../auth/jwt.strategy';
import { AuditStatus, AuditType, UserRole } from '@prisma/client';
import { AuditIndexService } from './audit-index.service';

const AUDIT_RISK_TARGET = 0.05;

@Injectable()
export class AuditsService {
  constructor(
    private prisma: PrismaService,
    private readonly auditIndex: AuditIndexService,
  ) {}

  private computeMateriality(base: number, pct: number) {
    const mg = (base * pct) / 100;
    return {
      materiality: mg,
      materialityExecution: mg * 0.75,
      materialityAccumulation: mg * 0.50,
      materialityBaseAmount: base,
    };
  }

  private computeAuditRisk(inherentRisk: number, controlRisk: number) {
    const detectionRisk = AUDIT_RISK_TARGET / (inherentRisk * controlRisk);
    return {
      inherentRisk,
      controlRisk,
      detectionRisk: Math.min(detectionRisk, 1),
      auditRisk: inherentRisk * controlRisk * Math.min(detectionRisk, 1),
    };
  }

  async create(dto: CreateAuditDto, user: AuthUser) {
    const unit = await this.prisma.auditEntity.findFirst({
      where: { id: dto.auditableUnitId, organizationId: user.organizationId },
    });
    if (!unit) throw new NotFoundException('Unidad auditable no encontrada');

    const materialityData = dto.materiality
      ? this.computeMateriality(dto.materiality.base, dto.materiality.percentage)
      : undefined;

    const riskModelData = dto.auditRiskModel
      ? this.computeAuditRisk(dto.auditRiskModel.inherentRisk, dto.auditRiskModel.controlRisk)
      : undefined;

    const audit = await this.prisma.audit.create({
      data: {
        title:   dto.title,
        type:    dto.type,
        subtype: dto.subtype ?? null,
        auditEntityId: dto.auditableUnitId,
        organizationId: user.organizationId,
        leadAuditorId: user.id,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        estimatedHours: dto.plannedHours ?? 0,
        scope: dto.scope,
        objectives: dto.objectives,
        isInvestigationMode: dto.isInvestigationMode ?? false,
        ...( materialityData && {
          materiality: materialityData.materiality,
          materialityExecution: materialityData.materialityExecution,
          materialityAccumulation: materialityData.materialityAccumulation,
          materialityBase: dto.materiality?.baseDescription,
          materialityBaseAmount: materialityData.materialityBaseAmount,
        }),
        auditRiskModel: riskModelData ?? undefined,
        status: AuditStatus.PLANNING,
      },
    });

    // Add team members if provided
    if (dto.teamMemberIds?.length) {
      await this.prisma.auditTeam.createMany({
        data: dto.teamMemberIds.map((userId) => ({
          auditId: audit.id,
          userId,
          role: 'AUDITOR',
        })),
        skipDuplicates: true,
      });
    }

    // Always add lead auditor to team
    await this.prisma.auditTeam.upsert({
      where: { auditId_userId: { auditId: audit.id, userId: user.id } },
      create: { auditId: audit.id, userId: user.id, role: 'LEAD' },
      update: { role: 'LEAD' },
    });

    // Auto-scaffold working papers based on audit type (fire-and-forget)
    void this.auditIndex.scaffold(audit.id, audit.type as AuditType, user.id);

    return this.findOne(audit.id, user);
  }

  async findAll(
    user: AuthUser,
    page = 1,
    limit = 20,
    search?: string,
    status?: string,
    type?: string,
    subtype?: string,
  ) {
    const skip = (page - 1) * limit;
    const where = {
      organizationId: user.organizationId,
      ...(search && {
        OR: [
          { title: { contains: search, mode: 'insensitive' as const } },
        ],
      }),
      ...(status  && { status:  status  as AuditStatus }),
      ...(type    && { type:    type    as any }),
      ...(subtype && { subtype }),
    };

    const [audits, total] = await Promise.all([
      this.prisma.audit.findMany({
        where,
        skip,
        take: limit,
        orderBy: { updatedAt: 'desc' },
        include: {
          auditEntity: { select: { id: true, name: true, category: true } },
          team: {
            where: { role: 'LEAD' },
            include: { user: { select: { id: true, name: true, avatarUrl: true } } },
            take: 1,
          },
          _count: {
            select: {
              workingPapers: true,
              findings: true,
              pbcRequests: true,
            },
          },
        },
      }),
      this.prisma.audit.count({ where }),
    ]);

    return {
      data: audits,
      meta: {
        total, page, limit,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    };
  }

  async findOne(id: string, user: AuthUser) {
    const audit = await this.prisma.audit.findFirst({
      where: { id, organizationId: user.organizationId },
      include: {
        auditEntity: true,
        team: {
          include: { user: { select: { id: true, name: true, role: true, avatarUrl: true } } },
        },
        _count: {
          select: {
            workingPapers: true,
            findings: true,
            pbcRequests: true,
            externalConfirmations: true,
          },
        },
      },
    });
    if (!audit) throw new NotFoundException('Auditoría no encontrada');

    // Investigation mode: restrict to team members + CAE+
    if (audit.isInvestigationMode) {
      const isTeamMember = audit.team.some((m) => m.userId === user.id);
      const privilegedRoles: string[] = [UserRole.CAE, UserRole.ADMIN, UserRole.SUPER_ADMIN];
      const isPrivileged = privilegedRoles.includes(user.role);
      if (!isTeamMember && !isPrivileged) {
        throw new ForbiddenException('Acceso restringido — modo investigación');
      }
    }

    return audit;
  }

  async update(id: string, dto: UpdateAuditDto, user: AuthUser) {
    await this.findOne(id, user);

    const materialityData = dto.materiality
      ? this.computeMateriality(dto.materiality.base, dto.materiality.percentage)
      : undefined;

    const riskModelData = dto.auditRiskModel
      ? this.computeAuditRisk(dto.auditRiskModel.inherentRisk, dto.auditRiskModel.controlRisk)
      : undefined;

    return this.prisma.audit.update({
      where: { id },
      data: {
        title:              dto.title,
        subtype:            dto.subtype,
        scope:              dto.scope,
        objectives:         dto.objectives,
        estimatedHours:     dto.plannedHours,
        isInvestigationMode: dto.isInvestigationMode,
        ...(dto.startDate && { startDate: new Date(dto.startDate) }),
        ...(dto.endDate && { endDate: new Date(dto.endDate) }),
        ...(materialityData && {
          materiality: materialityData.materiality,
          materialityExecution: materialityData.materialityExecution,
          materialityAccumulation: materialityData.materialityAccumulation,
          materialityBase: dto.materiality?.baseDescription,
          materialityBaseAmount: materialityData.materialityBaseAmount,
        }),
        ...(riskModelData && { auditRiskModel: riskModelData }),
      },
    });
  }

  async updateStatus(id: string, dto: UpdateAuditStatusDto, user: AuthUser) {
    const audit = await this.findOne(id, user);

    const allowedTransitions: Partial<Record<AuditStatus, AuditStatus[]>> = {
      [AuditStatus.PLANNING]:   [AuditStatus.IN_PROGRESS, AuditStatus.CANCELLED],
      [AuditStatus.IN_PROGRESS]:[AuditStatus.REVIEW, AuditStatus.CANCELLED],
      [AuditStatus.REVIEW]:     [AuditStatus.CLOSED, AuditStatus.IN_PROGRESS],
    };

    const allowed = allowedTransitions[audit.status as AuditStatus] ?? [];
    if (!allowed.includes(dto.status)) {
      throw new BadRequestException(
        `Transición no permitida: ${audit.status} → ${dto.status}`,
      );
    }

    return this.prisma.audit.update({
      where: { id },
      data: { status: dto.status },
    });
  }

  // ─── F6.1 Roll-forward ───────────────────────────────────────────────────────
  async rollForward(
    id: string,
    dto: {
      title: string;
      startDate?: string;
      endDate?: string;
      carryOpenFindings?: boolean;
    },
    user: AuthUser,
  ) {
    const source = await this.findOne(id, user);

    // Create new audit copying key attributes
    const newAudit = await this.prisma.audit.create({
      data: {
        title:              dto.title,
        type:               source.type,
        subtype:            (source as any).subtype ?? null,
        auditEntityId:      source.auditEntityId ?? undefined,
        organizationId:     user.organizationId,
        leadAuditorId:      user.id,
        startDate:          dto.startDate ? new Date(dto.startDate) : null,
        endDate:            dto.endDate   ? new Date(dto.endDate)   : null,
        estimatedHours:     source.estimatedHours ?? 0,
        scope:              source.scope ?? null,
        objectives:         source.objectives ?? null,
        materiality:        source.materiality ?? null,
        materialityExecution:    source.materialityExecution ?? null,
        materialityAccumulation: source.materialityAccumulation ?? null,
        materialityBase:    source.materialityBase ?? null,
        materialityBaseAmount:   source.materialityBaseAmount ?? null,
        status:             AuditStatus.PLANNING,
      },
    });

    // Add lead auditor to team
    await this.prisma.auditTeam.upsert({
      where:  { auditId_userId: { auditId: newAudit.id, userId: user.id } },
      create: { auditId: newAudit.id, userId: user.id, role: 'LEAD' },
      update: { role: 'LEAD' },
    });

    // Copy working paper structure (shell only — no content, reset status)
    const sourcePapers = await this.prisma.workingPaper.findMany({
      where: { auditId: id },
      orderBy: [{ indexSection: 'asc' }, { code: 'asc' }],
    });

    for (const wp of sourcePapers) {
      await this.prisma.workingPaper.create({
        data: {
          auditId:      newAudit.id,
          code:         wp.code,
          indexSection: wp.indexSection,
          title:        wp.title,
          type:         wp.type,
          wpKind:       wp.wpKind,
          paperCode:    wp.paperCode ?? null,
          preparedById: user.id,
          content:      {} as any,
          tickMarks:    [] as any,
          crossReferences: [] as any,
          status:       'IN_PROGRESS' as any,
          version:      1,
          carryForward: true,  // marks these as rolled-forward
          notesToReviewer: `Roll-forward desde auditoría anterior (${source.title})`,
        },
      });
    }

    // Optionally carry open/in-progress findings
    if (dto.carryOpenFindings) {
      const openFindings = await this.prisma.finding.findMany({
        where: { auditId: id, status: { in: ['DRAFT', 'IN_REVIEW', 'APPROVED', 'REOPENED'] as any } },
      });
      for (const f of openFindings) {
        await this.prisma.finding.create({
          data: {
            auditId:        newAudit.id,
            organizationId: user.organizationId,
            title:          `[CF] ${f.title}`,
            severity:       f.severity,
            status:         'DRAFT' as any,
            condition:      f.condition || '(Carry-forward — completar)',
            criteria:       f.criteria  || '(Carry-forward — completar)',
            cause:          f.cause     || '(Carry-forward — completar)',
            effect:         f.effect    || '(Carry-forward — completar)',
            risk:           f.risk      || '(Carry-forward — completar)',
            recommendation: f.recommendation || '(Carry-forward — completar)',
            isRecurring:    true,
            previousFindingId: f.id,
          },
        });
      }
    }

    return this.findOne(newAudit.id, user);
  }

  async getProgress(id: string, user: AuthUser) {
    const audit = await this.findOne(id, user);
    const [wpStats, findingStats, pbcStats] = await Promise.all([
      this.prisma.workingPaper.groupBy({
        by: ['status'],
        where: { auditId: id },
        _count: { id: true },
      }),
      this.prisma.finding.groupBy({
        by: ['status'],
        where: { auditId: id },
        _count: { id: true },
      }),
      this.prisma.pbcRequest.groupBy({
        by: ['status'],
        where: { auditId: id },
        _count: { id: true },
      }),
    ]);
    return { audit, wpStats, findingStats, pbcStats };
  }
}
