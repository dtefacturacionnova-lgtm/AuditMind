import {
  Injectable, NotFoundException, ForbiddenException, BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAuditDto } from './dto/create-audit.dto';
import { UpdateAuditDto, UpdateAuditStatusDto } from './dto/update-audit.dto';
import { AuthUser } from '../auth/jwt.strategy';
import { AuditStatus, AuditType, Prisma, UserRole } from '@prisma/client';
import { AuditIndexService } from './audit-index.service';
import { AiService } from '../ai/ai.service';

const AUDIT_RISK_TARGET = 0.05;

@Injectable()
export class AuditsService {
  constructor(
    private prisma: PrismaService,
    private readonly auditIndex: AuditIndexService,
    private readonly aiService: AiService,
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
        templateId: dto.templateId ?? null,
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
    void this.auditIndex.scaffold(audit.id, audit.type as AuditType, user.id, dto.templateId, dto.scaffoldMode);

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
        template: { select: { id: true, name: true } },
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

  // ─── F6.7 Trial Balance ──────────────────────────────────────────────────────

  async importTrialBalance(
    auditId: string,
    dto: {
      filename: string;
      periodLabel: string;
      accounts: Array<{ code: string; name: string; debit: number; credit: number; balance: number }>;
    },
    user: AuthUser,
  ) {
    await this.findOne(auditId, user); // validates access + org

    const totalDebit  = dto.accounts.reduce((s, a) => s + (a.debit  ?? 0), 0);
    const totalCredit = dto.accounts.reduce((s, a) => s + (a.credit ?? 0), 0);
    const isBalanced  = Math.abs(totalDebit - totalCredit) < 0.01;

    return this.prisma.trialBalance.create({
      data: {
        auditId,
        orgId:       user.organizationId,
        filename:    dto.filename,
        periodLabel: dto.periodLabel,
        accounts:    dto.accounts as any,
        totalDebit,
        totalCredit,
        isBalanced,
        importedById: user.id,
      },
    });
  }

  async listTrialBalances(auditId: string, user: AuthUser) {
    await this.findOne(auditId, user);
    return this.prisma.trialBalance.findMany({
      where:   { auditId },
      orderBy: { importedAt: 'desc' },
      select: {
        id: true, filename: true, periodLabel: true, importedAt: true,
        totalDebit: true, totalCredit: true, isBalanced: true,
        _count: { select: { paperLinks: true } },
      },
    });
  }

  async getTrialBalance(tbId: string, user: AuthUser) {
    const tb = await this.prisma.trialBalance.findUnique({
      where: { id: tbId },
      include: {
        paperLinks: {
          include: {
            paper: { select: { id: true, code: true, title: true, indexSection: true } },
          },
        },
      },
    });
    if (!tb) throw new NotFoundException('Balance no encontrado');
    if (tb.orgId !== user.organizationId) throw new ForbiddenException();
    return tb;
  }

  async linkTrialBalanceToPaper(
    tbId: string,
    paperId: string,
    accountCodes: string[],
    note: string | undefined,
    user: AuthUser,
  ) {
    const tb = await this.prisma.trialBalance.findUnique({ where: { id: tbId } });
    if (!tb) throw new NotFoundException('Balance no encontrado');
    if (tb.orgId !== user.organizationId) throw new ForbiddenException();

    return this.prisma.trialBalancePaperLink.upsert({
      where:  { trialBalanceId_paperId: { trialBalanceId: tbId, paperId } },
      create: { trialBalanceId: tbId, paperId, accountCodes, note, createdById: user.id },
      update: { accountCodes, note },
    });
  }

  async deleteTrialBalance(tbId: string, user: AuthUser) {
    const tb = await this.prisma.trialBalance.findUnique({ where: { id: tbId } });
    if (!tb) throw new NotFoundException();
    if (tb.orgId !== user.organizationId) throw new ForbiddenException();
    await this.prisma.trialBalance.delete({ where: { id: tbId } });
    return { deleted: true };
  }

  // ─── PI.7b — Benford analysis on Trial Balance ────────────────────────────
  /**
   * Run the Benford analysis on a Trial Balance.
   * - Extracts amounts from accounts[].balance | debit | credit (whichever is non-zero)
   * - Calls ai-service /analytics/benford
   * - Persists result on TrialBalance.benfordResult
   * - If conformity is SUSPECT or NON_CONFORMING: auto-creates a Finding draft
   */
  async runBenfordOnTrialBalance(tbId: string, user: AuthUser) {
    const tb = await this.prisma.trialBalance.findUnique({ where: { id: tbId } });
    if (!tb) throw new NotFoundException('Balance no encontrado');
    if (tb.orgId !== user.organizationId) throw new ForbiddenException();

    // Extract monetary amounts from accounts
    interface TBAccount { code: string; name: string; balance?: number | string; debit?: number | string; credit?: number | string }
    const accounts = (tb.accounts as unknown as TBAccount[]) ?? [];
    const records: Array<{ code: string; name: string; amount: number }> = [];
    const amounts: number[] = [];
    for (const acc of accounts) {
      const raw = acc.balance ?? acc.debit ?? acc.credit ?? 0;
      const n = typeof raw === 'string' ? parseFloat(raw) : Number(raw);
      if (Number.isFinite(n) && n !== 0) {
        amounts.push(Math.abs(n));
        records.push({ code: acc.code, name: acc.name, amount: n });
      }
    }

    if (amounts.length < 50) {
      throw new BadRequestException(
        `Benford requiere mínimo 50 cuentas con saldo. El balance tiene ${amounts.length}.`,
      );
    }

    // Call AI service via shared AiService
    const result = await this.aiService.runCaats('benford', { amounts, records }) as {
      total_records: number;
      valid_records: number;
      chi2_statistic: number;
      chi2_pvalue: number;
      mad: number;
      conformity: 'CLOSE' | 'ACCEPTABLE' | 'SUSPECT' | 'NON_CONFORMING';
      risk_score: number;
      digits: Array<{ digit: number; observed_pct: number; expected_pct: number; deviation_pct: number; is_anomalous: boolean }>;
      top_anomalous_amounts: Array<{ code: string; name: string; amount: number }>;
      interpretation: string;
    };

    const now = new Date();
    let findingId: string | null = null;

    // Auto-create Finding draft if risk is significant
    if (result.conformity === 'SUSPECT' || result.conformity === 'NON_CONFORMING') {
      // Avoid duplicates: if previous benfordFindingId exists and is still DRAFT, update it; else create new
      if (tb.benfordFindingId) {
        const existing = await this.prisma.finding.findUnique({ where: { id: tb.benfordFindingId } });
        if (existing && existing.status === 'DRAFT') {
          findingId = existing.id;
          await this.prisma.finding.update({
            where: { id: existing.id },
            data: this.buildBenfordFindingPayload(tb, result, user.organizationId),
          });
        }
      }
      if (!findingId) {
        const f = await this.prisma.finding.create({
          data: {
            auditId:        tb.auditId,
            organizationId: user.organizationId,
            ...this.buildBenfordFindingPayload(tb, result, user.organizationId),
          },
        });
        findingId = f.id;
      }
    }

    await this.prisma.trialBalance.update({
      where: { id: tbId },
      data: {
        benfordResult:    result as unknown as Prisma.InputJsonValue,
        benfordRunAt:     now,
        benfordFindingId: findingId,
      },
    });

    return { result, findingId, runAt: now.toISOString() };
  }

  async getBenfordResult(tbId: string, user: AuthUser) {
    const tb = await this.prisma.trialBalance.findUnique({
      where: { id: tbId },
      select: { orgId: true, benfordResult: true, benfordRunAt: true, benfordFindingId: true },
    });
    if (!tb) throw new NotFoundException('Balance no encontrado');
    if (tb.orgId !== user.organizationId) throw new ForbiddenException();
    return {
      result:    tb.benfordResult,
      runAt:     tb.benfordRunAt?.toISOString() ?? null,
      findingId: tb.benfordFindingId,
    };
  }

  private buildBenfordFindingPayload(
    tb: { id: string; periodLabel: string; filename: string; auditId: string },
    result: {
      conformity: string;
      risk_score: number;
      mad: number;
      chi2_pvalue: number;
      valid_records: number;
      interpretation: string;
      top_anomalous_amounts: Array<{ code: string; name: string; amount: number }>;
    },
    _organizationId: string,
  ): Omit<Prisma.FindingUncheckedCreateInput, 'auditId' | 'organizationId'> {
    const severity = result.conformity === 'NON_CONFORMING' ? 'HIGH' : 'MEDIUM';
    const topAcc = result.top_anomalous_amounts.slice(0, 5)
      .map(a => `  - ${a.code} ${a.name}: ${Number(a.amount).toLocaleString('es-CL')}`)
      .join('\n');

    return {
      title:          `Análisis Benford — ${tb.periodLabel}: distribución ${result.conformity === 'NON_CONFORMING' ? 'NO CONFORME' : 'sospechosa'}`,
      condition:      `El análisis de Ley de Benford aplicado a las cuentas del Balance "${tb.filename}" (período ${tb.periodLabel}) presenta una distribución del primer dígito ${result.conformity === 'NON_CONFORMING' ? 'NO conforme' : 'con desviaciones moderadas'} respecto a la distribución teórica esperada.\n\nMétricas:\n- Conformidad (escala Nigrini): ${result.conformity}\n- Score de riesgo: ${result.risk_score}/100\n- MAD (Mean Absolute Deviation): ${result.mad}\n- p-valor Chi²: ${result.chi2_pvalue}\n- Cuentas analizadas: ${result.valid_records}\n\nCuentas con mayor desviación:\n${topAcc}`,
      criteria:       'Ley de Benford (1938) — los datos contables genuinos sin manipulación siguen una distribución logarítmica del primer dígito: 1 aparece ~30.1%, 2 ~17.6%, ..., 9 ~4.6%. NIA 240 — Responsabilidad del auditor frente al fraude. Metodología Nigrini para análisis forense de cifras contables.',
      cause:          'A determinar mediante procedimientos de auditoría adicionales. Posibles causas: (a) datos generados artificialmente, (b) errores sistemáticos de captura, (c) límites de aprobación que distorsionan la distribución natural, (d) manipulación deliberada.',
      effect:         result.conformity === 'NON_CONFORMING'
        ? 'Alta probabilidad de manipulación de cifras contables o datos contaminados. Riesgo significativo de incorrección material por fraude (NIA 240). El dictamen sobre los estados financieros podría verse afectado si no se resuelve.'
        : 'Riesgo moderado de manipulación o errores sistemáticos en las cifras contables. Requiere procedimientos sustantivos adicionales sobre las cuentas con mayor desviación.',
      risk:           severity === 'HIGH' ? 'Alto — Riesgo de fraude potencial. Escalar al Comité de Auditoría.' : 'Moderado — Requiere procedimientos sustantivos adicionales.',
      recommendation: `1. Realizar procedimientos sustantivos detallados sobre las cuentas con mayor desviación del primer dígito (ver lista).\n2. Indagar con la administración sobre el proceso de generación y aprobación de asientos contables.\n3. ${result.conformity === 'NON_CONFORMING' ? 'Considerar la ampliación del alcance a otros períodos y la posible necesidad de involucrar a especialistas forenses (ACFE).' : 'Aplicar muestreo dirigido a las cuentas anómalas y revisar evidencia de soporte.'}\n4. Documentar las conclusiones en un papel de trabajo dedicado.`,
      severity:       severity as 'HIGH' | 'MEDIUM',
      status:         'DRAFT',
      aiDraftUsed:    true,
      normativeReference: 'NIA 240 — Responsabilidades del auditor en la auditoría de estados financieros frente al fraude',
      normativeArticle:   'NIA 240, párrafos 16-27 (factores de riesgo de fraude) y A24-A27 (técnicas analíticas)',
      qualityScore:   60,
    };
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

  // ─── Papeles disponibles desde plantilla ─────────────────────────────────────

  async getAvailableTemplatePapers(auditId: string, user: AuthUser) {
    return this.auditIndex.getAvailableTemplatePapers(auditId, user.organizationId);
  }

  async addPaperFromTemplate(auditId: string, code: string, user: AuthUser) {
    // Verify audit belongs to org
    await this.findOne(auditId, user);
    return this.auditIndex.addPaperFromTemplate(auditId, code, user.id, user.organizationId);
  }
}
