import {
  Injectable, NotFoundException, ForbiddenException, BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAuditDto } from './dto/create-audit.dto';
import { UpdateAuditDto, UpdateAuditStatusDto } from './dto/update-audit.dto';
import { UpdateTeamMemberRateDto } from './dto/team-rate.dto';
import { AddTeamMemberDto, UpdateTeamMemberDto } from './dto/team.dto';
import { AuthUser } from '../auth/jwt.strategy';
import { AuditStatus, AuditType, Prisma, UserRole } from '@prisma/client';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { AuditIndexService } from './audit-index.service';
import { AiService } from '../ai/ai.service';
import { AuditFoldersService } from '../audit-folders/audit-folders.service';

const AUDIT_RISK_TARGET = 0.05;
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

@Injectable()
export class AuditsService {
  private readonly supabaseAdmin: SupabaseClient;

  constructor(
    private prisma: PrismaService,
    private readonly auditIndex: AuditIndexService,
    private readonly aiService: AiService,
    private readonly auditFolders: AuditFoldersService,
  ) {
    this.supabaseAdmin = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
  }

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
        originType: dto.originType,
        requestedByName: dto.requestedByName ?? null,
        requestedByRole: dto.requestedByRole ?? null,
        requestDate:     dto.requestDate ? new Date(dto.requestDate) : null,
        requestReason:   dto.requestReason ?? null,
        requestAntecedents: dto.requestAntecedents ?? null,
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

    // Auto-scaffold working papers + folder structure (fire-and-forget, sequential)
    if (dto.templateId) {
      // When a template is selected: create papers first, then phases+folders so
      // linkOrphanPapersToFolders can assign every paper to its folder immediately.
      void (async () => {
        await this.auditIndex.scaffold(audit.id, audit.type as AuditType, user.id, dto.templateId, dto.scaffoldMode);
        await this.auditFolders.initializeFromAuditTemplateSections(audit.id, user);
      })();
    } else {
      void this.auditIndex.scaffold(audit.id, audit.type as AuditType, user.id, undefined, dto.scaffoldMode);
    }

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
              // Excluye hallazgos de seguimiento de informes anteriores (isRecurring)
              // para no inflar el conteo "propio" del encargo — ver AuditsService.findOne.
              findings: { where: { isRecurring: false } },
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
            // "Hallazgos" del dashboard = solo los propios del encargo. Los de
            // seguimiento de informes anteriores (isRecurring, ej. un PT-HALL
            // "Reabierto") se cuentan aparte en recurringFindingsCount, para no
            // inflar el total con hallazgos que ya deberían existir en el Finding
            // del encargo ANTERIOR donde se identificaron originalmente.
            findings: { where: { isRecurring: false } },
            pbcRequests: true,
            externalConfirmations: true,
          },
        },
      },
    });
    if (!audit) throw new NotFoundException('Auditoría no encontrada');

    const recurringFindingsCount = await this.prisma.finding.count({
      where: { auditId: id, isRecurring: true },
    });

    // Investigation mode: restrict to team members + CAE+
    if (audit.isInvestigationMode) {
      const isTeamMember = audit.team.some((m) => m.userId === user.id);
      const privilegedRoles: string[] = [UserRole.CAE, UserRole.ADMIN, UserRole.SUPER_ADMIN];
      const isPrivileged = privilegedRoles.includes(user.role);
      if (!isTeamMember && !isPrivileged) {
        throw new ForbiddenException('Acceso restringido — modo investigación');
      }
    }

    return { ...audit, recurringFindingsCount };
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

  // ─── PI.7d — Orchestrator: run all available AI tests on an audit ────────
  /**
   * Iterates all data sources of the audit and runs every applicable AI test,
   * persisting a consolidated report on Audit.lastAiTestSummary.
   *
   * Tests currently orchestrated:
   *   - BENFORD on every Trial Balance with ≥50 accounts (PI.7b)
   *   - COSO assessment on the first paperCode=PT-COSO paper if present (PI.7c)
   *
   * Each test is best-effort: failures are caught per-test so a single error
   * does NOT block the rest. Returns the same summary that gets persisted.
   */
  async runAiTests(auditId: string, user: AuthUser) {
    const audit = await this.findOne(auditId, user);

    const ranAt = new Date();
    const startMs = Date.now();
    const tests: Array<{
      kind:     'BENFORD' | 'COSO';
      target:   string;            // tbId or paperId
      label:    string;            // human-readable target
      status:   'SUCCESS' | 'FAILED' | 'SKIPPED';
      message:  string;
      findingId?: string | null;
      meta?:    Record<string, unknown>;
    }> = [];
    const findingIds: string[] = [];

    // ── BENFORD on each Trial Balance ─────────────────────────────────────
    const tbs = await this.prisma.trialBalance.findMany({
      where:   { auditId },
      select:  { id: true, filename: true, periodLabel: true, accounts: true },
      orderBy: { importedAt: 'desc' },
    });

    for (const tb of tbs) {
      const accountsCount = Array.isArray(tb.accounts) ? (tb.accounts as unknown[]).length : 0;
      const label = `${tb.filename} (${tb.periodLabel})`;

      if (accountsCount < 50) {
        tests.push({
          kind: 'BENFORD', target: tb.id, label, status: 'SKIPPED',
          message: `Saltado: ${accountsCount} cuentas (mínimo 50 para Benford)`,
        });
        continue;
      }

      try {
        const res = await this.runBenfordOnTrialBalance(tb.id, user);
        if (res.findingId) findingIds.push(res.findingId);
        tests.push({
          kind: 'BENFORD', target: tb.id, label, status: 'SUCCESS',
          message: `${res.result.conformity} · score ${res.result.risk_score}/100`,
          findingId: res.findingId,
          meta: {
            conformity: res.result.conformity,
            riskScore:  res.result.risk_score,
            mad:        res.result.mad,
          },
        });
      } catch (e) {
        tests.push({
          kind: 'BENFORD', target: tb.id, label, status: 'FAILED',
          message: (e as Error).message?.slice(0, 200) ?? 'Error desconocido',
        });
      }
    }

    // ── COSO on first COSO paper ──────────────────────────────────────────
    const cosoPaper = await this.prisma.workingPaper.findFirst({
      where: {
        auditId,
        OR: [
          { paperCode: 'PT-COSO' },
          { code: { startsWith: 'A-06' } },
          { title: { contains: 'COSO', mode: 'insensitive' } },
        ],
      },
      select: { id: true, code: true, title: true },
      orderBy: { createdAt: 'asc' },
    });

    if (cosoPaper) {
      const label = `${cosoPaper.code} — ${cosoPaper.title}`;
      try {
        const res = await this.aiService.cosoAssess({
          auditTitle: audit.title,
          auditType:  audit.type,
          scope:      audit.scope ?? undefined,
          entityContext:     await this.summarizePeerPaper(auditId, 'PT-A1'),
          riskAssessment:    await this.summarizePeerPaper(auditId, 'PT-A2'),
          controlEvaluation: await this.summarizePeerPaper(auditId, 'PT-A3'),
          currentCosoNotes:  await this.summarizePeerPaper(auditId, undefined, cosoPaper.id),
          findingsSummary:   await this.summarizeFindings(auditId),
        }) as {
          assessment: { overallScore: number; overallMaturity: string };
          model: string; tokens_used: number;
        };
        tests.push({
          kind: 'COSO', target: cosoPaper.id, label, status: 'SUCCESS',
          message: `${res.assessment.overallMaturity} · score ${res.assessment.overallScore}/100`,
          meta: {
            overallScore:    res.assessment.overallScore,
            overallMaturity: res.assessment.overallMaturity,
            model:           res.model,
            tokensUsed:      res.tokens_used,
          },
        });
      } catch (e) {
        tests.push({
          kind: 'COSO', target: cosoPaper.id, label, status: 'FAILED',
          message: (e as Error).message?.slice(0, 200) ?? 'Error desconocido',
        });
      }
    } else {
      tests.push({
        kind: 'COSO', target: '', label: 'PT-COSO no encontrado', status: 'SKIPPED',
        message: 'No hay papel COSO (A-06 / PT-COSO) en el expediente',
      });
    }

    // ── Build summary ─────────────────────────────────────────────────────
    const durationMs = Date.now() - startMs;
    const summary = {
      ranAt:        ranAt.toISOString(),
      durationMs,
      ranById:      user.id,
      tests,
      findingIds,
      counts: {
        total:     tests.length,
        success:   tests.filter(t => t.status === 'SUCCESS').length,
        failed:    tests.filter(t => t.status === 'FAILED').length,
        skipped:   tests.filter(t => t.status === 'SKIPPED').length,
        findingsCreated: findingIds.length,
      },
    };

    await this.prisma.audit.update({
      where: { id: auditId },
      data: {
        lastAiTestRunAt:   ranAt,
        lastAiTestSummary: summary as unknown as Prisma.InputJsonValue,
      },
    });

    return summary;
  }

  async getAiTestsReport(auditId: string, user: AuthUser) {
    const audit = await this.findOne(auditId, user);
    return {
      ranAt:   audit.lastAiTestRunAt?.toISOString() ?? null,
      summary: audit.lastAiTestSummary,
    };
  }

  private async summarizePeerPaper(
    auditId: string,
    paperCode?: string,
    paperId?: string,
  ): Promise<string> {
    const wp = await this.prisma.workingPaper.findFirst({
      where:  paperId ? { id: paperId } : { auditId, paperCode },
      include: { sections: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!wp) return '';
    const sectionsText = wp.sections
      .filter(s => s.value != null && String(s.value).trim().length > 0)
      .slice(0, 10)
      .map(s => `  • ${s.label}: ${String(s.value).slice(0, 350)}`)
      .join('\n');
    return [
      `Papel: ${wp.code} — ${wp.title}`,
      wp.narrative ? `Narrativa: ${wp.narrative.slice(0, 500)}` : '',
      sectionsText ? `Secciones:\n${sectionsText}` : '',
    ].filter(Boolean).join('\n');
  }

  private async summarizeFindings(auditId: string): Promise<string> {
    const findings = await this.prisma.finding.findMany({
      where:   { auditId },
      orderBy: { createdAt: 'desc' },
      take:    10,
      select:  { title: true, severity: true, condition: true, status: true },
    });
    if (findings.length === 0) return '';
    return findings
      .map(f => `[${f.severity}] ${f.title} (${f.status}) — ${f.condition.slice(0, 200)}`)
      .join('\n');
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

  // ─── Documentos de soporte — Auditorías Imprevistas ──────────────────────────

  async listRequestDocuments(auditId: string, user: AuthUser) {
    await this.findOne(auditId, user); // verifica acceso
    return this.prisma.auditRequestDocument.findMany({
      where: { auditId },
      orderBy: { createdAt: 'desc' },
      include: { uploadedBy: { select: { id: true, name: true, avatarUrl: true } } },
    });
  }

  async addRequestDocument(
    auditId: string,
    file: Express.Multer.File,
    description: string | undefined,
    user: AuthUser,
  ) {
    await this.findOne(auditId, user); // verifica acceso

    const safeName = file.originalname.replace(/[^\w.\-]/g, '_');
    const path = `request-docs/${auditId}/${Date.now()}_${safeName}`;

    const { error: upErr } = await this.supabaseAdmin.storage
      .from('audit-files')
      .upload(path, file.buffer, {
        contentType: file.mimetype || 'application/octet-stream',
        cacheControl: '3600',
        upsert: false,
      });
    if (upErr) throw new BadRequestException(`Error al subir archivo: ${upErr.message}`);

    const { data: urlData } = this.supabaseAdmin.storage
      .from('audit-files')
      .getPublicUrl(path);

    return this.prisma.auditRequestDocument.create({
      data: {
        auditId,
        uploadedById: user.id,
        filename:     path.split('/').pop()!,
        originalName: file.originalname,
        mimeType:     file.mimetype,
        fileSize:     file.size,
        fileUrl:      urlData.publicUrl,
        description:  description ?? null,
      },
      include: { uploadedBy: { select: { id: true, name: true, avatarUrl: true } } },
    });
  }

  async removeRequestDocument(auditId: string, docId: string, user: AuthUser) {
    await this.findOne(auditId, user);
    const doc = await this.prisma.auditRequestDocument.findFirst({
      where: { id: docId, auditId },
    });
    if (!doc) throw new NotFoundException('Documento no encontrado');

    // Intentar eliminar de Storage (no fatal si falla)
    const storagePath = `request-docs/${auditId}/${doc.filename}`;
    await this.supabaseAdmin.storage.from('audit-files').remove([storagePath]).catch(() => null);

    await this.prisma.auditRequestDocument.delete({ where: { id: docId } });
    return { removed: true };
  }

  // ─── Equipo del encargo — alta, baja y cambio de rol ───────────────────────
  // Antes de esto, AuditTeam solo se poblaba una vez al crear el encargo
  // (dto.teamMemberIds) o al aprobar un Engagement de Cartera — no existía
  // ninguna forma de agregar/quitar gente ni cambiar su rol después.

  async addTeamMember(auditId: string, dto: AddTeamMemberDto, user: AuthUser) {
    await this.findOne(auditId, user);

    const targetUser = await this.prisma.user.findFirst({
      where: { id: dto.userId, organizationId: user.organizationId },
      select: { id: true },
    });
    if (!targetUser) throw new NotFoundException('Usuario no encontrado en esta organización');

    const existing = await this.prisma.auditTeam.findUnique({
      where: { auditId_userId: { auditId, userId: dto.userId } },
    });
    if (existing) throw new BadRequestException('Este usuario ya es parte del equipo del encargo');

    return this.prisma.auditTeam.create({
      data: { auditId, userId: dto.userId, role: dto.role ?? 'AUDITOR' },
      include: { user: { select: { id: true, name: true, role: true, avatarUrl: true } } },
    });
  }

  /** Bloquea quitar/degradar al único LEAD del equipo — un encargo sin líder es un estado roto. */
  private async assertNotLastLead(auditId: string, memberId: string) {
    const otherLeads = await this.prisma.auditTeam.count({
      where: { auditId, role: 'LEAD', id: { not: memberId } },
    });
    if (otherLeads === 0) {
      throw new BadRequestException(
        'No se puede quitar al único Auditor Líder del encargo — asigna otro líder primero',
      );
    }
  }

  async removeTeamMember(auditId: string, memberId: string, user: AuthUser) {
    await this.findOne(auditId, user);
    const member = await this.prisma.auditTeam.findFirst({ where: { id: memberId, auditId } });
    if (!member) throw new NotFoundException('Miembro del equipo no encontrado en este encargo');

    if (member.role === 'LEAD') await this.assertNotLastLead(auditId, memberId);

    await this.prisma.auditTeam.delete({ where: { id: memberId } });
    return { removed: true };
  }

  async updateTeamMember(auditId: string, memberId: string, dto: UpdateTeamMemberDto, user: AuthUser) {
    await this.findOne(auditId, user);
    const member = await this.prisma.auditTeam.findFirst({ where: { id: memberId, auditId } });
    if (!member) throw new NotFoundException('Miembro del equipo no encontrado en este encargo');

    if (member.role === 'LEAD' && dto.role !== undefined && dto.role !== 'LEAD') {
      await this.assertNotLastLead(auditId, memberId);
    }

    return this.prisma.auditTeam.update({
      where: { id: memberId },
      data: {
        ...(dto.role !== undefined && { role: dto.role }),
        ...(dto.budgetedHours !== undefined && { budgetedHours: dto.budgetedHours }),
      },
      include: { user: { select: { id: true, name: true, role: true, avatarUrl: true } } },
    });
  }

  // ─── Presupuesto vs. Real ───────────────────────────────────────────────────
  /**
   * Cruza `AuditTeam.budgetedHours` (presupuesto real por persona, editable en
   * la pestaña Equipo) contra `SUM(TimeEntry.hours)` real de cada persona en
   * este encargo. Reemplaza la pestaña "Horas" anterior, que leía
   * `Audit.estimatedHours` — un total suelto nunca desglosado por persona.
   * Mismo criterio que el resto del sistema: si NADIE del equipo tiene
   * presupuesto asignado, el total no se muestra como "0" sino como
   * `null` — nunca se inventa un presupuesto que nadie definió.
   */
  async getBudgetReport(auditId: string, user: AuthUser) {
    const audit = await this.prisma.audit.findFirst({
      where: { id: auditId, organizationId: user.organizationId },
      select: { id: true },
    });
    if (!audit) throw new NotFoundException('Auditoría no encontrada');

    const [team, entries] = await Promise.all([
      this.prisma.auditTeam.findMany({
        where: { auditId },
        select: {
          id: true, userId: true, role: true, budgetedHours: true,
          user: { select: { id: true, name: true } },
        },
        orderBy: { assignedAt: 'asc' },
      }),
      this.prisma.timeEntry.findMany({
        where: { auditId },
        select: { userId: true, workDate: true, hours: true },
      }),
    ]);

    // Horas reales por persona, Y por persona+año (el costo por hora depende del
    // UserCostProfile del año en que se trabajó — mismo criterio que ProfitabilityService).
    const actualByUser = new Map<string, number>();
    const actualByUserYear = new Map<string, number>(); // key `${userId}:${year}`
    for (const e of entries) {
      const year = e.workDate.getUTCFullYear();
      actualByUser.set(e.userId, (actualByUser.get(e.userId) ?? 0) + e.hours);
      const key = `${e.userId}:${year}`;
      actualByUserYear.set(key, (actualByUserYear.get(key) ?? 0) + e.hours);
    }

    // Horas cargadas por alguien que ya no está (o nunca estuvo) en AuditTeam —
    // no se descartan, aparecen aparte para que no "desaparezcan" del reporte.
    const teamUserIds = new Set(team.map((m) => m.userId));
    const orphanUserIds = [...actualByUser.keys()].filter((id) => !teamUserIds.has(id));
    const orphanUsers = orphanUserIds.length > 0
      ? await this.prisma.user.findMany({ where: { id: { in: orphanUserIds } }, select: { id: true, name: true } })
      : [];
    const orphanNameMap = new Map(orphanUsers.map((u) => [u.id, u.name]));

    // Costo real en $ — para el criterio de Interna ("costo vs. presupuesto", sin
    // tarifas de venta) y como dato complementario para Externa. Mismo criterio
    // "nunca inventar": una persona+año sin UserCostProfile queda en costoSinCalcular,
    // nunca se asume $0.
    const allUserIds = [...new Set(entries.map((e) => e.userId))];
    const years = [...new Set(entries.map((e) => e.workDate.getUTCFullYear()))];
    const costProfiles = allUserIds.length > 0 && years.length > 0
      ? await this.prisma.userCostProfile.findMany({
          where: { organizationId: user.organizationId, userId: { in: allUserIds }, year: { in: years } },
          select: { userId: true, year: true, costRatePerHour: true },
        })
      : [];
    const costRateMap = new Map(costProfiles.map((cp) => [`${cp.userId}:${cp.year}`, Number(cp.costRatePerHour)]));

    const costoPorPersona = (userId: string): { costoReal: number | null; horasSinCostear: number } => {
      let costo = 0;
      let sinCostear = 0;
      let algunoCosteado = false;
      for (const [key, hours] of actualByUserYear.entries()) {
        if (!key.startsWith(`${userId}:`)) continue;
        const year = Number(key.split(':')[1]);
        const rate = costRateMap.get(`${userId}:${year}`);
        if (rate !== undefined) { costo += hours * rate; algunoCosteado = true; }
        else sinCostear += hours;
      }
      return { costoReal: algunoCosteado ? round2(costo) : null, horasSinCostear: round2(sinCostear) };
    };

    const porPersona = [
      ...team.map((m) => {
        const { costoReal, horasSinCostear } = costoPorPersona(m.userId);
        return {
          memberId: m.id,
          userId: m.userId,
          userName: m.user.name,
          role: m.role,
          horasPresupuestadas: m.budgetedHours ?? null,
          horasReales: round2(actualByUser.get(m.userId) ?? 0),
          costoReal,
          horasSinCostear,
          enEquipo: true,
        };
      }),
      ...orphanUserIds.map((id) => {
        const { costoReal, horasSinCostear } = costoPorPersona(id);
        return {
          memberId: null,
          userId: id,
          userName: orphanNameMap.get(id) ?? id,
          role: null,
          horasPresupuestadas: null,
          horasReales: round2(actualByUser.get(id) ?? 0),
          costoReal,
          horasSinCostear,
          enEquipo: false,
        };
      }),
    ];

    const conPresupuesto = team.filter((m) => m.budgetedHours != null);
    const totalPresupuestado = conPresupuesto.length > 0
      ? round2(conPresupuesto.reduce((sum, m) => sum + (m.budgetedHours ?? 0), 0))
      : null;
    const totalReal = round2(porPersona.reduce((sum, p) => sum + p.horasReales, 0));
    const sinPresupuesto = team.filter((m) => m.budgetedHours == null).length + orphanUserIds.length;

    const conCosto = porPersona.filter((p) => p.costoReal !== null);
    const costoTotal = conCosto.length > 0 ? round2(conCosto.reduce((sum, p) => sum + (p.costoReal ?? 0), 0)) : null;

    const variacionHoras = totalPresupuestado !== null ? round2(totalReal - totalPresupuestado) : null;
    const variacionPct = totalPresupuestado !== null && totalPresupuestado !== 0
      ? round2((variacionHoras! / totalPresupuestado) * 100)
      : null;

    return {
      totalPresupuestado,
      totalReal,
      variacionHoras,
      variacionPct,
      sinPresupuesto,
      costoTotal,
      porPersona,
    };
  }

  // ─── Equipo del encargo — tarifa pactada con el cliente ────────────────────
  /**
   * Las 4 tarifas seleccionables para un miembro del equipo, resueltas contra
   * su UserCostProfile del año EN CURSO (el año en que se pacta la tarifa con
   * el cliente, no el período fiscal auditado — un encargo de un ejercicio ya
   * cerrado igual se factibiliza con la estructura de costos vigente hoy).
   * "Tarifa de Costo" = effectiveOverrideRate ?? suggestedBillingRate del perfil
   * — la Tarifa Sugerida se trata como la base sobre la que se calculan las 3
   * tarifas de venta (ver CapacityService.computeSaleTiers).
   */
  async getTeamMemberRateOptions(auditId: string, memberId: string, user: AuthUser) {
    const audit = await this.prisma.audit.findFirst({
      where: { id: auditId, organizationId: user.organizationId },
      select: { id: true },
    });
    if (!audit) throw new NotFoundException('Auditoría no encontrada');

    const member = await this.prisma.auditTeam.findFirst({
      where: { id: memberId, auditId },
      select: { userId: true },
    });
    if (!member) throw new NotFoundException('Miembro del equipo no encontrado en este encargo');

    const year = new Date().getUTCFullYear();
    const profile = await this.prisma.userCostProfile.findFirst({
      where: { organizationId: user.organizationId, userId: member.userId, year },
    });

    const costRate = profile ? Number(profile.effectiveOverrideRate ?? profile.suggestedBillingRate) : null;
    const tierAmount = (v: Prisma.Decimal | null | undefined) => (v != null ? Number(v) : null);

    return {
      year,
      hasCostProfile: !!profile,
      options: [
        { type: 'COST' as const, label: 'Tarifa de Costo', amount: costRate },
        { type: 'TIER1' as const, label: profile?.saleTier1Label ?? 'Tarifa de Venta 1', amount: tierAmount(profile?.saleTier1Amount) },
        { type: 'TIER2' as const, label: profile?.saleTier2Label ?? 'Tarifa de Venta 2', amount: tierAmount(profile?.saleTier2Amount) },
        { type: 'TIER3' as const, label: profile?.saleTier3Label ?? 'Tarifa de Venta 3', amount: tierAmount(profile?.saleTier3Amount) },
      ],
    };
  }

  /** Asigna qué tarifa se pactó con el cliente para este miembro y congela su
   *  monto en $ (`agreedRatePerHour`) — para que la rentabilidad ya calculada
   *  no se mueva si el perfil de costeo cambia después. */
  async updateTeamMemberRate(auditId: string, memberId: string, dto: UpdateTeamMemberRateDto, user: AuthUser) {
    const options = await this.getTeamMemberRateOptions(auditId, memberId, user);
    const chosen = options.options.find((o) => o.type === dto.billingRateType);
    if (!chosen || chosen.amount === null) {
      throw new BadRequestException(
        `No se puede asignar "${dto.billingRateType}" — el perfil de costeo de este usuario para ${options.year} no tiene esa tarifa configurada.`,
      );
    }

    return this.prisma.auditTeam.update({
      where: { id: memberId },
      data: { billingRateType: dto.billingRateType, agreedRatePerHour: chosen.amount },
      include: { user: { select: { id: true, name: true, role: true, avatarUrl: true } } },
    });
  }
}
