import {
  Injectable, NotFoundException, ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/jwt.strategy';
import {
  ProcStatus, StepStatus, StepConclusion, TestType, AuditNature, AuditTiming,
} from '@prisma/client';

export interface CreateProcedureDto {
  refNumber:      string;
  description:    string;
  assertions?:    string[];
  significantRisk?: boolean;
  rmmLevel?:      string;
  rmmRiskRef?:    string;
  sortOrder?:     number;
}

export interface UpdateProcedureDto {
  refNumber?:     string;
  description?:   string;
  assertions?:    string[];
  significantRisk?: boolean;
  rmmLevel?:      string;
  rmmRiskRef?:    string;
  conclusionText?: string;
  status?:        ProcStatus;
  sortOrder?:     number;
}

export interface CreateStepDto {
  refNumber:        string;
  description:      string;
  assertions?:      string[];
  testType?:        TestType;
  nature?:          AuditNature;
  timing?:          AuditTiming;
  extent?:          string;
  population?:      string;
  performedByName?: string;
  performedById?:   string;
  datePerformed?:   string;
  reviewedByName?:  string;
  reviewedById?:    string;
  dateReviewed?:    string;
  wpRef?:           string;
  resultDescription?: string;
  conclusion?:      StepConclusion;
  exceptionText?:   string;
  exceptionAmount?: number;
  difRef?:          string;
  hoursPlanned?:    number;
  hoursActual?:     number;
  status?:          StepStatus;
  sortOrder?:       number;
}

export interface UpdateStepDto extends Partial<CreateStepDto> {}

@Injectable()
export class AuditProceduresService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Access guard ──────────────────────────────────────────────────────────

  private async assertSectionAccess(sectionId: string, user: AuthUser) {
    const section = await this.prisma.paperSection.findUnique({
      where:   { id: sectionId },
      include: { paper: { include: { audit: { select: { organizationId: true } } } } },
    });
    if (!section) throw new NotFoundException('Sección no encontrada');
    if (section.paper.audit.organizationId !== user.organizationId)
      throw new ForbiddenException();
    return section;
  }

  private async assertProcedureAccess(procedureId: string, user: AuthUser) {
    const proc = await this.prisma.auditProcedure.findUnique({
      where:   { id: procedureId },
      include: {
        section: {
          include: { paper: { include: { audit: { select: { organizationId: true } } } } },
        },
      },
    });
    if (!proc) throw new NotFoundException('Procedimiento no encontrado');
    if (proc.section.paper.audit.organizationId !== user.organizationId)
      throw new ForbiddenException();
    return proc;
  }

  private async assertStepAccess(stepId: string, user: AuthUser) {
    const step = await this.prisma.auditStep.findUnique({
      where:   { id: stepId },
      include: {
        procedure: {
          include: {
            section: {
              include: { paper: { include: { audit: { select: { organizationId: true } } } } },
            },
          },
        },
      },
    });
    if (!step) throw new NotFoundException('Actividad no encontrada');
    if (step.procedure.section.paper.audit.organizationId !== user.organizationId)
      throw new ForbiddenException();
    return step;
  }

  // ─── Procedures CRUD ───────────────────────────────────────────────────────

  async getProcedures(sectionId: string, user: AuthUser) {
    await this.assertSectionAccess(sectionId, user);
    return this.prisma.auditProcedure.findMany({
      where:   { sectionId },
      orderBy: { sortOrder: 'asc' },
      include: {
        steps: { orderBy: { sortOrder: 'asc' }, include: { evidences: true } },
      },
    });
  }

  async createProcedure(sectionId: string, dto: CreateProcedureDto, user: AuthUser) {
    await this.assertSectionAccess(sectionId, user);
    const count = await this.prisma.auditProcedure.count({ where: { sectionId } });
    return this.prisma.auditProcedure.create({
      data: {
        sectionId,
        refNumber:      dto.refNumber,
        description:    dto.description,
        assertions:     dto.assertions  ?? [],
        significantRisk: dto.significantRisk ?? false,
        rmmLevel:       dto.rmmLevel    ?? null,
        rmmRiskRef:     dto.rmmRiskRef  ?? null,
        sortOrder:      dto.sortOrder   ?? count,
      },
      include: { steps: true },
    });
  }

  async updateProcedure(id: string, dto: UpdateProcedureDto, user: AuthUser) {
    await this.assertProcedureAccess(id, user);
    return this.prisma.auditProcedure.update({
      where: { id },
      data:  {
        ...(dto.refNumber      !== undefined && { refNumber:      dto.refNumber }),
        ...(dto.description    !== undefined && { description:    dto.description }),
        ...(dto.assertions     !== undefined && { assertions:     dto.assertions }),
        ...(dto.significantRisk !== undefined && { significantRisk: dto.significantRisk }),
        ...(dto.rmmLevel       !== undefined && { rmmLevel:       dto.rmmLevel }),
        ...(dto.rmmRiskRef     !== undefined && { rmmRiskRef:     dto.rmmRiskRef }),
        ...(dto.conclusionText !== undefined && { conclusionText: dto.conclusionText }),
        ...(dto.status         !== undefined && { status:         dto.status }),
        ...(dto.sortOrder      !== undefined && { sortOrder:      dto.sortOrder }),
      },
      include: { steps: { orderBy: { sortOrder: 'asc' } } },
    });
  }

  async deleteProcedure(id: string, user: AuthUser) {
    await this.assertProcedureAccess(id, user);
    return this.prisma.auditProcedure.delete({ where: { id } });
  }

  // ─── Steps CRUD ────────────────────────────────────────────────────────────

  async createStep(procedureId: string, dto: CreateStepDto, user: AuthUser) {
    await this.assertProcedureAccess(procedureId, user);
    const count = await this.prisma.auditStep.count({ where: { procedureId } });
    return this.prisma.auditStep.create({
      data: {
        procedureId,
        refNumber:        dto.refNumber,
        description:      dto.description,
        assertions:       dto.assertions     ?? [],
        testType:         dto.testType       ?? TestType.DETAIL,
        nature:           dto.nature         ?? AuditNature.INSPECTION,
        timing:           dto.timing         ?? AuditTiming.YEAR_END,
        extent:           dto.extent         ?? null,
        population:       dto.population     ?? null,
        performedByName:  dto.performedByName ?? null,
        performedById:    dto.performedById   ?? null,
        datePerformed:    dto.datePerformed   ? new Date(dto.datePerformed) : null,
        reviewedByName:   dto.reviewedByName  ?? null,
        reviewedById:     dto.reviewedById    ?? null,
        dateReviewed:     dto.dateReviewed    ? new Date(dto.dateReviewed) : null,
        wpRef:            dto.wpRef           ?? null,
        resultDescription: dto.resultDescription ?? null,
        conclusion:       dto.conclusion      ?? StepConclusion.PENDING,
        exceptionText:    dto.exceptionText   ?? null,
        exceptionAmount:  dto.exceptionAmount ?? null,
        difRef:           dto.difRef          ?? null,
        hoursPlanned:     dto.hoursPlanned    ?? null,
        hoursActual:      dto.hoursActual     ?? null,
        status:           dto.status          ?? StepStatus.DRAFT,
        sortOrder:        dto.sortOrder       ?? count,
      },
      include: { evidences: true },
    });
  }

  async updateStep(id: string, dto: UpdateStepDto, user: AuthUser) {
    await this.assertStepAccess(id, user);
    return this.prisma.auditStep.update({
      where: { id },
      data:  {
        ...(dto.refNumber        !== undefined && { refNumber:        dto.refNumber }),
        ...(dto.description      !== undefined && { description:      dto.description }),
        ...(dto.assertions       !== undefined && { assertions:       dto.assertions }),
        ...(dto.testType         !== undefined && { testType:         dto.testType }),
        ...(dto.nature           !== undefined && { nature:           dto.nature }),
        ...(dto.timing           !== undefined && { timing:           dto.timing }),
        ...(dto.extent           !== undefined && { extent:           dto.extent }),
        ...(dto.population       !== undefined && { population:       dto.population }),
        ...(dto.performedByName  !== undefined && { performedByName:  dto.performedByName }),
        ...(dto.performedById    !== undefined && { performedById:    dto.performedById }),
        ...(dto.datePerformed    !== undefined && { datePerformed:    dto.datePerformed ? new Date(dto.datePerformed) : null }),
        ...(dto.reviewedByName   !== undefined && { reviewedByName:   dto.reviewedByName }),
        ...(dto.reviewedById     !== undefined && { reviewedById:     dto.reviewedById }),
        ...(dto.dateReviewed     !== undefined && { dateReviewed:     dto.dateReviewed ? new Date(dto.dateReviewed) : null }),
        ...(dto.wpRef            !== undefined && { wpRef:            dto.wpRef }),
        ...(dto.resultDescription !== undefined && { resultDescription: dto.resultDescription }),
        ...(dto.conclusion       !== undefined && { conclusion:       dto.conclusion }),
        ...(dto.exceptionText    !== undefined && { exceptionText:    dto.exceptionText }),
        ...(dto.exceptionAmount  !== undefined && { exceptionAmount:  dto.exceptionAmount }),
        ...(dto.difRef           !== undefined && { difRef:           dto.difRef }),
        ...(dto.hoursPlanned     !== undefined && { hoursPlanned:     dto.hoursPlanned }),
        ...(dto.hoursActual      !== undefined && { hoursActual:      dto.hoursActual }),
        ...(dto.status           !== undefined && { status:           dto.status }),
        ...(dto.sortOrder        !== undefined && { sortOrder:        dto.sortOrder }),
      },
      include: { evidences: true },
    });
  }

  async deleteStep(id: string, user: AuthUser) {
    await this.assertStepAccess(id, user);
    return this.prisma.auditStep.delete({ where: { id } });
  }
}
