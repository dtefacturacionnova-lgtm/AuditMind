import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditVisitKind, AuditVisitStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../../auth/jwt.strategy';
import { ROLE_HIERARCHY } from '../../common/guards/roles.guard';
import { AUDIT_ACCESS_SELECT, assertInvestigationAccess } from '../../common/utils/investigation-scope.util';
import {
  BalanceAccount, VISIT_KINDS, VisitKind, compareBalances, currentBalance, defaultAnalysisBase, fromCents, normalizeAccounts, toCents, validateVisitCutoffs,
} from './visit-rules';
import {
  VISIT_AUDIT_TYPES, VISIT_KIND_LABEL, VisitStatusName, balanceWarnings, canChangeVisitStatus, defaultPeriodLabel, isVisitKind, parseDateOnly,
} from './visit-workflow';
import { EnableVisitsDto, ImportVisitBalanceDto, UpdateVisitDto } from './dto/visits.dto';

const BALANCE_SUMMARY = {
  id: true, filename: true, periodLabel: true, importedAt: true, asOfDate: true, totalDebit: true, totalCredit: true, isBalanced: true,
} as const;

const dayStr = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
const isManager = (user: AuthUser) => (ROLE_HIERARCHY[user.role] ?? 0) >= ROLE_HIERARCHY.AUDIT_MANAGER;

/**
 * Visitas de una auditoría financiera externa (planificación, interina y final) y el balance de cada una.
 * Reglas de cálculo: ./visit-rules.ts · reglas de estado y fechas: ./visit-workflow.ts · diseño: docs/visitas-auditoria-financiera-propuesta.md §8.
 * Todo está acotado a la organización del usuario y respeta el modo investigación; los roles los fija el controlador.
 */
@Injectable()
export class AuditVisitsService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Acceso ────────────────────────────────────────────────────────────────

  /** El encargo debe ser de la organización (404) y visible para el usuario (403 si es una investigación ajena). */
  private async loadAudit(auditId: string, user: AuthUser) {
    const audit = await this.prisma.audit.findFirst({
      where: { id: auditId, organizationId: user.organizationId },
      select: { id: true, type: true, ...AUDIT_ACCESS_SELECT },
    });
    if (!audit) throw new NotFoundException('Auditoría no encontrada');
    assertInvestigationAccess(audit, user);
    return audit;
  }

  private async loadVisit(visitId: string, user: AuthUser) {
    const visit = await this.prisma.auditVisit.findUnique({
      where: { id: visitId },
      include: { audit: { select: { id: true, type: true, ...AUDIT_ACCESS_SELECT } } },
    });
    if (!visit || visit.organizationId !== user.organizationId || visit.audit.organizationId !== user.organizationId) {
      throw new NotFoundException('Visita no encontrada');
    }
    assertInvestigationAccess(visit.audit, user);
    return visit;
  }

  // ─── Lectura ───────────────────────────────────────────────────────────────

  /** Las visitas del encargo con un resumen del balance vigente de cada una (sin las cuentas). */
  async list(auditId: string, user: AuthUser) {
    const audit = await this.loadAudit(auditId, user);
    const visits = await this.prisma.auditVisit.findMany({ where: { auditId, organizationId: user.organizationId } });
    const ordered = [...visits].sort((a, b) => VISIT_KINDS.indexOf(a.kind) - VISIT_KINDS.indexOf(b.kind));

    const balances = ordered.length === 0 ? [] : await this.prisma.trialBalance.findMany({
      where: { auditId, orgId: user.organizationId, visitId: { in: ordered.map((v) => v.id) } },
      select: { ...BALANCE_SUMMARY, visitId: true },
      orderBy: { importedAt: 'desc' },
    });

    const rows = await Promise.all(ordered.map(async (v) => {
      const mine = balances.filter((b) => b.visitId === v.id);
      const cur = currentBalance(mine.map((b) => ({ importedAt: b.importedAt, data: b })))?.data ?? null;
      let balance: Record<string, unknown> | null = null;
      if (cur) {
        const full = await this.prisma.trialBalance.findUnique({ where: { id: cur.id }, select: { accounts: true } });
        const { visitId: _omit, ...resto } = cur;
        balance = { ...resto, asOfDate: dayStr(cur.asOfDate), accountCount: Array.isArray(full?.accounts) ? (full!.accounts as unknown[]).length : 0 };
      }
      return {
        id: v.id, kind: v.kind, cutoffDate: dayStr(v.cutoffDate), status: v.status, isAnalysisBase: v.isAnalysisBase, notes: v.notes,
        closedAt: v.closedAt, closedById: v.closedById,
        balance,
        balanceVersions: mine.length,
      };
    }));

    const suggested = defaultAnalysisBase(rows.map((r) => ({ kind: r.kind, cutoffDate: r.cutoffDate as string, hasBalance: r.balance !== null })));
    return {
      auditId,
      enabled: rows.length > 0,
      /** El tipo de encargo admite visitas. */
      supported: VISIT_AUDIT_TYPES.includes(audit.type),
      visits: rows,
      analysisBase: rows.find((r) => r.isAnalysisBase)?.kind ?? null,
      suggestedAnalysisBase: suggested,
    };
  }

  // ─── Activar visitas ───────────────────────────────────────────────────────

  /** Crea las tres visitas del encargo con sus fechas de corte. Solo una vez por encargo. */
  async enable(auditId: string, dto: EnableVisitsDto, user: AuthUser) {
    const audit = await this.loadAudit(auditId, user);
    if (!VISIT_AUDIT_TYPES.includes(audit.type)) {
      throw new BadRequestException('Las visitas solo aplican a auditorías financieras externas.');
    }
    const dates: Record<VisitKind, Date | null> = { PLANNING: parseDateOnly(dto.planning), INTERIM: parseDateOnly(dto.interim), FINAL: parseDateOnly(dto.final) };
    const issues = validateVisitCutoffs(VISIT_KINDS.map((kind) => ({ kind, cutoffDate: dates[kind] ?? 'invalida' })));
    if (issues.length > 0) throw new BadRequestException(issues.map((i) => i.message).join(' '));

    const existing = await this.prisma.auditVisit.count({ where: { auditId } });
    if (existing > 0) throw new ConflictException('Este encargo ya tiene visitas.');
    try {
      await this.prisma.auditVisit.createMany({
        data: VISIT_KINDS.map((kind) => ({ auditId, organizationId: user.organizationId, kind: kind as AuditVisitKind, cutoffDate: dates[kind] as Date })),
      });
    } catch (e) {
      // Dos personas activando a la vez: la restricción única (auditId, kind) deja pasar solo a una.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('Este encargo ya tiene visitas.');
      throw e;
    }
    return this.list(auditId, user);
  }

  // ─── Cambiar una visita ────────────────────────────────────────────────────

  async update(visitId: string, dto: UpdateVisitDto, user: AuthUser) {
    const visit = await this.loadVisit(visitId, user);
    const data: Prisma.AuditVisitUpdateInput = {};

    if (dto.cutoffDate !== undefined) {
      if (visit.status === AuditVisitStatus.CLOSED) throw new BadRequestException('Una visita cerrada no puede cambiar su fecha de corte: reábrela primero.');
      const date = parseDateOnly(dto.cutoffDate);
      if (!date) throw new BadRequestException('La fecha de corte no es válida.');
      const all = await this.prisma.auditVisit.findMany({ where: { auditId: visit.auditId }, select: { kind: true, cutoffDate: true } });
      const issues = validateVisitCutoffs(all.map((v) => ({ kind: v.kind, cutoffDate: v.kind === visit.kind ? date : v.cutoffDate })));
      if (issues.length > 0) throw new BadRequestException(issues.map((i) => i.message).join(' '));
      data.cutoffDate = date;
    }

    if (dto.status !== undefined && dto.status !== visit.status) {
      if (!canChangeVisitStatus(visit.status as VisitStatusName, dto.status)) {
        throw new BadRequestException(`No se puede pasar una visita de ${visit.status} a ${dto.status}.`);
      }
      data.status = dto.status as AuditVisitStatus;
      if (dto.status === 'CLOSED') { data.closedAt = new Date(); data.closedById = user.id; }
      else { data.closedAt = null; data.closedById = null; }
    }

    if (dto.notes !== undefined) data.notes = dto.notes.trim() === '' ? null : dto.notes.trim();

    if (dto.isAnalysisBase === true && !visit.isAnalysisBase) {
      const hasBalance = await this.prisma.trialBalance.count({ where: { visitId: visit.id, orgId: user.organizationId } });
      if (hasBalance === 0) throw new BadRequestException('La visita aún no tiene balance cargado: no puede ser la base de análisis.');
    }

    // La base de análisis es única por encargo: se quita a las demás y se pone a esta en un solo paso.
    if (dto.isAnalysisBase !== undefined && dto.isAnalysisBase !== visit.isAnalysisBase) {
      await this.prisma.$transaction(async (tx) => {
        if (dto.isAnalysisBase) await tx.auditVisit.updateMany({ where: { auditId: visit.auditId, isAnalysisBase: true }, data: { isAnalysisBase: false } });
        await tx.auditVisit.update({ where: { id: visit.id }, data: { ...data, isAnalysisBase: dto.isAnalysisBase } });
      });
    } else if (Object.keys(data).length > 0) {
      await this.prisma.auditVisit.update({ where: { id: visit.id }, data });
    }
    return this.list(visit.auditId, user);
  }

  // ─── Balance de una visita ─────────────────────────────────────────────────

  /**
   * Carga un balance a la visita. Nunca pisa uno anterior: corregir un balance crea OTRA carga en la misma visita y la más reciente es la
   * vigente (la anterior queda como historia). En una visita cerrada solo lo puede hacer un Gerente o superior.
   */
  async importBalance(visitId: string, dto: ImportVisitBalanceDto, user: AuthUser) {
    const visit = await this.loadVisit(visitId, user);
    if (visit.status === AuditVisitStatus.CLOSED && !isManager(user)) {
      throw new ForbiddenException('La visita está cerrada: solo un Gerente de Auditoría o superior puede cargar una corrección.');
    }

    const totalDebit = round2(dto.accounts.reduce((s, a) => s + a.debit, 0));
    const totalCredit = round2(dto.accounts.reduce((s, a) => s + a.credit, 0));
    // En centavos enteros: 1000.01 − 1000 da 0.00999… y una diferencia de un centavo pasaría por cuadrada.
    const isBalanced = toCents(totalDebit) === toCents(totalCredit);
    const previous = await this.prisma.trialBalance.findMany({ where: { visitId: visit.id, orgId: user.organizationId }, select: { id: true, importedAt: true } });
    const supersedes = currentBalance(previous.map((p) => ({ importedAt: p.importedAt, data: p.id })))?.data ?? null;

    const created = await this.prisma.trialBalance.create({
      data: {
        auditId: visit.auditId,
        orgId: user.organizationId,
        visitId: visit.id,
        asOfDate: visit.cutoffDate,
        filename: dto.filename.trim(),
        periodLabel: dto.periodLabel?.trim() || defaultPeriodLabel(visit.kind as VisitKind, visit.cutoffDate),
        accounts: dto.accounts as unknown as Prisma.InputJsonValue,
        totalDebit,
        totalCredit,
        isBalanced,
        importedById: user.id,
      },
      select: BALANCE_SUMMARY,
    });
    return {
      ...created,
      visitId: visit.id,
      asOfDate: dayStr(created.asOfDate),
      accountCount: dto.accounts.length,
      supersedes,
      warnings: balanceWarnings({ accounts: dto.accounts, totalDebit, totalCredit }),
    };
  }

  /**
   * Las cuentas del balance vigente de una visita, ya normalizadas (una fila por código, saldo = débito − crédito). Es lo que usa la
   * pantalla para copiar la visita elegida al `saldo_actual` de B-00. Solo lee.
   */
  async balanceOf(visitId: string, user: AuthUser) {
    const visit = await this.loadVisit(visitId, user);
    const tbs = await this.prisma.trialBalance.findMany({
      where: { visitId: visit.id, orgId: user.organizationId },
      select: { ...BALANCE_SUMMARY, accounts: true },
    });
    const cur = currentBalance(tbs.map((t) => ({ importedAt: t.importedAt, data: t })))?.data;
    if (!cur) throw new BadRequestException(`La visita ${VISIT_KIND_LABEL[visit.kind as VisitKind]} aún no tiene balance cargado.`);
    const accounts = [...normalizeAccounts(cur.accounts as unknown as BalanceAccount[]).values()].map((a) => ({
      code: a.code, name: a.name, balance: fromCents(a.balanceCents),
    }));
    const { accounts: _raw, ...summary } = cur;
    return {
      visitId: visit.id,
      kind: visit.kind,
      cutoffDate: dayStr(visit.cutoffDate),
      balance: { ...summary, asOfDate: dayStr(cur.asOfDate), versions: tbs.length },
      accounts,
    };
  }

  // ─── Comparación entre visitas ─────────────────────────────────────────────

  /** Balance vigente de la visita de un tipo, con sus cuentas. Lanza un mensaje claro si falta la visita o su balance. */
  private async currentOf(auditId: string, kind: VisitKind, user: AuthUser) {
    const visit = await this.prisma.auditVisit.findFirst({ where: { auditId, kind, organizationId: user.organizationId } });
    if (!visit) throw new NotFoundException(`El encargo no tiene visita ${VISIT_KIND_LABEL[kind]}.`);
    const tbs = await this.prisma.trialBalance.findMany({
      where: { visitId: visit.id, orgId: user.organizationId },
      select: { ...BALANCE_SUMMARY, accounts: true },
    });
    const cur = currentBalance(tbs.map((t) => ({ importedAt: t.importedAt, data: t })))?.data;
    if (!cur) throw new BadRequestException(`La visita ${VISIT_KIND_LABEL[kind]} aún no tiene balance cargado.`);
    return { visit, tb: cur };
  }

  async compare(auditId: string, from: string, to: string, user: AuthUser) {
    await this.loadAudit(auditId, user);
    if (!isVisitKind(from) || !isVisitKind(to)) throw new BadRequestException('Indica las visitas a comparar: PLANNING, INTERIM o FINAL.');
    if (from === to) throw new BadRequestException('Elige dos visitas distintas para comparar.');
    // En orden (no a la vez): si faltan los dos balances, el mensaje habla siempre del de origen primero.
    const a = await this.currentOf(auditId, from, user);
    const b = await this.currentOf(auditId, to, user);
    const result = compareBalances(a.tb.accounts as unknown as BalanceAccount[], b.tb.accounts as unknown as BalanceAccount[]);
    const meta = (x: typeof a) => ({
      kind: x.visit.kind, cutoffDate: dayStr(x.visit.cutoffDate), balanceId: x.tb.id, periodLabel: x.tb.periodLabel, importedAt: x.tb.importedAt, isBalanced: x.tb.isBalanced,
    });
    const warnings: string[] = [];
    if (!a.tb.isBalanced) warnings.push(`El balance de la visita ${VISIT_KIND_LABEL[from]} no cuadra.`);
    if (!b.tb.isBalanced) warnings.push(`El balance de la visita ${VISIT_KIND_LABEL[to]} no cuadra.`);
    return { auditId, from: meta(a), to: meta(b), summary: result.summary, rows: result.rows, warnings };
  }
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
