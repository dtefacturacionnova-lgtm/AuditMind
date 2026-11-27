import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditVisitKind, AuditVisitStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../../auth/jwt.strategy';
import { ROLE_HIERARCHY } from '../../common/guards/roles.guard';
import { AUDIT_ACCESS_SELECT, assertInvestigationAccess } from '../../common/utils/investigation-scope.util';
import {
  BalanceAccount, BridgeRow, DEFAULT_BRIDGE_PCT, VISIT_KINDS, VisitKind, buildBridge, compareBalances, currentBalance, defaultAnalysisBase, fromCents,
  normalizeAccounts, toCents, validateVisitCutoffs,
} from './visit-rules';
import {
  VISIT_AUDIT_TYPES, VISIT_KIND_LABEL, VisitStatusName, balanceWarnings, canChangeVisitStatus, defaultPeriodLabel, isVisitKind, parseDateOnly,
} from './visit-workflow';
import { CreateBridgeStepsDto, EnableVisitsDto, ImportVisitBalanceDto, UpdateVisitDto } from './dto/visits.dto';

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
      select: { id: true, type: true, auditPeriodStart: true, auditPeriodEnd: true, materialityExecution: true, ...AUDIT_ACCESS_SELECT },
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

  // ─── Puente interina → final ───────────────────────────────────────────────

  /** La materialidad de ejecución vigente: la del papel A-06 PT-A4 (S4) si es un número válido; si no, la guardada en el encargo. */
  private async executionMateriality(audit: { id: string; materialityExecution: Prisma.Decimal | null }) {
    const paper = await this.prisma.workingPaper.findFirst({
      where: { auditId: audit.id, paperCode: 'PT-A4' },
      select: { sections: { where: { sectionKey: 'S4' }, select: { value: true } } },
    });
    const fromPaper = paper?.sections[0]?.value;
    const n = fromPaper === null || fromPaper === undefined || fromPaper === '' ? NaN : Number(fromPaper);
    if (Number.isFinite(n) && n > 0) return { value: n, source: 'PT-A4' as const };
    const own = audit.materialityExecution === null ? NaN : Number(audit.materialityExecution);
    if (Number.isFinite(own) && own > 0) return { value: own, source: 'ENCARGO' as const };
    return { value: null, source: null };
  }

  private parsePct(raw: string | undefined): number {
    if (raw === undefined || raw === '') return DEFAULT_BRIDGE_PCT;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0 || n > 1000) throw new BadRequestException('El umbral de variación debe ser un porcentaje entre 0 y 1000.');
    return n;
  }

  /** El puente completo del encargo (filas, avisos, de dónde salieron la materialidad y el ejercicio) y los pasos ya creados. */
  private async buildBridgeFor(auditId: string, pctRaw: string | undefined, user: AuthUser) {
    const audit = await this.loadAudit(auditId, user);
    const pct = this.parsePct(pctRaw);
    const interim = await this.currentOf(auditId, 'INTERIM', user);
    const final = await this.currentOf(auditId, 'FINAL', user);
    const me = await this.executionMateriality(audit);

    const result = buildBridge({
      interim: interim.tb.accounts as unknown as BalanceAccount[],
      final: final.tb.accounts as unknown as BalanceAccount[],
      interimCutoff: interim.visit.cutoffDate,
      periodStart: audit.auditPeriodStart,
      periodEnd: audit.auditPeriodEnd,
      executionMateriality: me.value,
      pctThreshold: pct,
    });

    const warnings: string[] = [];
    if (!interim.tb.isBalanced) warnings.push('El balance de la visita interina no cuadra.');
    if (!final.tb.isBalanced) warnings.push('El balance de la visita final no cuadra.');
    if (result.warnings.includes('SIN_MATERIALIDAD')) {
      warnings.push('El encargo no tiene materialidad de ejecución (A-06 PT-A4): el puente se calcula completo pero no marca alertas por monto.');
    }
    if (result.warnings.includes('PERIODO_INVALIDO')) {
      warnings.push('La fecha de corte de la interina cae fuera del ejercicio auditado (o el ejercicio es inválido): no se pudo proyectar el saldo esperado de las cuentas de resultados.');
    }

    const existing = await this.prisma.auditStep.findMany({
      where: { timing: 'ROLLFORWARD', refNumber: { startsWith: STEP_REF_PREFIX }, procedure: { section: { paper: { auditId, audit: { organizationId: user.organizationId } } } } },
      select: { id: true, refNumber: true },
    });
    const stepByCode = new Map(existing.map((s) => [s.refNumber.slice(STEP_REF_PREFIX.length), s.id]));

    const meta = (x: typeof interim) => ({ kind: x.visit.kind, cutoffDate: dayStr(x.visit.cutoffDate), balanceId: x.tb.id, periodLabel: x.tb.periodLabel, importedAt: x.tb.importedAt, isBalanced: x.tb.isBalanced });
    return {
      result,
      payload: {
        auditId,
        interim: meta(interim),
        final: meta(final),
        period: {
          start: dayStr(audit.auditPeriodStart),
          end: dayStr(audit.auditPeriodEnd),
          /** `ENCARGO` = el ejercicio auditado del encargo; `ANO_CALENDARIO` = no está definido y se asumió el año de la fecha de corte. */
          source: audit.auditPeriodStart && audit.auditPeriodEnd ? ('ENCARGO' as const) : ('ANO_CALENDARIO' as const),
        },
        materiality: { execution: me.value, source: me.source },
        pctThreshold: pct,
        annualizationFactor: result.annualizationFactor,
        alerts: result.alerts,
        warnings,
        rows: result.rows.map((r) => ({ ...r, stepId: stepByCode.get(r.code) ?? null })),
      },
    };
  }

  async bridge(auditId: string, pct: string | undefined, user: AuthUser) {
    return (await this.buildBridgeFor(auditId, pct, user)).payload;
  }

  /** Cuadrículas de procedimientos del encargo donde se pueden crear los pasos sugeridos. */
  async bridgeTargets(auditId: string, user: AuthUser) {
    await this.loadAudit(auditId, user);
    const sections = await this.prisma.paperSection.findMany({
      where: { fieldType: 'PROCEDURE_GRID', paper: { auditId, audit: { organizationId: user.organizationId } } },
      select: { id: true, label: true, paper: { select: { code: true, title: true } }, _count: { select: { procedures: true } } },
    });
    return sections
      .map((s) => ({ sectionId: s.id, paperCode: s.paper.code, paperTitle: s.paper.title, sectionLabel: s.label, procedureCount: s._count.procedures }))
      .sort((x, y) => String(x.paperCode).localeCompare(String(y.paperCode), 'es', { numeric: true }));
  }

  /**
   * Crea los pasos `ROLLFORWARD` de las cuentas elegidas. El texto se arma aquí con el puente recalculado (nunca se acepta del cliente) y
   * solo para cuentas que hoy tienen alerta. Un paso por cuenta: si ya existe uno de esa cuenta en el encargo, no se repite.
   */
  async createBridgeSteps(auditId: string, dto: CreateBridgeStepsDto, user: AuthUser) {
    const { result } = await this.buildBridgeFor(auditId, undefined, user);
    const section = await this.prisma.paperSection.findFirst({
      where: { id: dto.sectionId, fieldType: 'PROCEDURE_GRID', paper: { auditId, audit: { organizationId: user.organizationId } } },
      select: { id: true },
    });
    if (!section) throw new NotFoundException('La sección de procedimientos no pertenece a este encargo.');

    const wanted = [...new Set(dto.codes.map((c) => c.trim()).filter((c) => c !== ''))];
    const byCode = new Map(result.rows.map((r) => [r.code, r]));
    const skipped: Array<{ code: string; reason: string }> = [];
    const todo: BridgeRow[] = [];
    for (const code of wanted) {
      const row = byCode.get(code);
      if (!row) skipped.push({ code, reason: 'La cuenta no figura en el puente.' });
      else if (!row.alert || !row.suggestedStep) skipped.push({ code, reason: 'La cuenta no tiene alerta: no hay paso sugerido.' });
      else todo.push(row);
    }

    const created = await this.prisma.$transaction(async (tx) => {
      // Dos personas aceptando a la vez no duplican pasos: se serializa por encargo.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`rollforward:${auditId}`}::text))`;
      const have = new Set(
        (await tx.auditStep.findMany({
          where: { timing: 'ROLLFORWARD', refNumber: { startsWith: STEP_REF_PREFIX }, procedure: { section: { paper: { auditId } } } },
          select: { refNumber: true },
        })).map((s) => s.refNumber.slice(STEP_REF_PREFIX.length)),
      );
      const fresh = todo.filter((r) => {
        if (have.has(r.code)) { skipped.push({ code: r.code, reason: 'Ya tiene un paso de período restante en este encargo.' }); return false; }
        return true;
      });
      if (fresh.length === 0) return { procedureId: null as string | null, steps: [] as Array<{ id: string; code: string }> };

      let proc = await tx.auditProcedure.findFirst({ where: { sectionId: section.id, refNumber: PROCEDURE_REF } });
      if (!proc) {
        const count = await tx.auditProcedure.count({ where: { sectionId: section.id } });
        proc = await tx.auditProcedure.create({ data: { sectionId: section.id, refNumber: PROCEDURE_REF, description: PROCEDURE_TEXT, sortOrder: count } });
      }
      const base = await tx.auditStep.count({ where: { procedureId: proc.id } });
      const steps: Array<{ id: string; code: string }> = [];
      for (const [i, r] of fresh.entries()) {
        const s = await tx.auditStep.create({
          data: {
            procedureId: proc.id,
            refNumber: `${STEP_REF_PREFIX}${r.code}`,
            description: r.suggestedStep as string,
            timing: 'ROLLFORWARD',
            population: `Cuenta ${r.code}: saldo interina ${fmtMoney(r.interimBalance)} → saldo final ${fmtMoney(r.finalBalance)} (movimiento ${fmtMoney(r.movement)})`,
            sortOrder: base + i,
          },
          select: { id: true },
        });
        steps.push({ id: s.id, code: r.code });
      }
      return { procedureId: proc.id, steps };
    });

    return { created: created.steps.length, steps: created.steps, procedureId: created.procedureId, sectionId: section.id, skipped };
  }
}

const STEP_REF_PREFIX = 'RF-';
const PROCEDURE_REF = 'RF-NIA330';
const PROCEDURE_TEXT = 'Período restante: extender al cierre las conclusiones de la visita interina (NIA 330)';
const fmtMoney = (n: number | null): string => (n === null ? 'sin saldo' : n.toFixed(2));

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
