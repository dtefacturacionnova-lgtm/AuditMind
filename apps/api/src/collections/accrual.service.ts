import { Injectable } from '@nestjs/common';
import { ClientInvoiceStatus, CreditNoteStatus, FeeType, Prisma, ScheduleItemStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { Db, dateFromYmd, todayInSalvador } from './collections.common';
import { toCents } from './money.util';
import { salvadorDay } from './cutoff.util';
import { AccrualBasis, AccrualMissing, AccrualResult, computeAccrual } from './accrual.util';

/** Estados de un papel disparador que cuentan como «informe final emitido» (los mismos del Comité y de QAIP). */
const TRIGGER_DONE = new Set(['SIGNED_OFF', 'CLOSED', 'APPROVED', 'ARCHIVED']);

export interface AccrualView {
  asOf: string;
  feeType: FeeType;
  /** Honorario neto vigente al corte (con las adendas hasta esa fecha). */
  feeTotal: number | null;
  method: string;
  /** Facturado neto al corte (facturas vigentes − notas de crédito vigentes). */
  invoicedNet: number;
  billableHours: number;
  budgetHours: number | null;
  completionDone: boolean;
  progressPct: number | null;
  accrued: number | null;
  toInvoice: number | null;
  basis: AccrualBasis;
  missing: AccrualMissing | null;
}

const dollars = (cents: number | null) => (cents === null ? null : cents / 100);

/**
 * Devengado de varios encargos a una fecha de corte, con pocas consultas (no una por encargo). Reconstruye el pasado con las fechas de
 * cada dato: adendas con su fecha, facturas y notas de crédito con la suya (y la de su anulación), horas por `workDate`, hitos por
 * `completedAt`, papel disparador por su firma. El porcentaje MANUAL no tiene historia: se usa el vigente.
 * Solo devuelve entradas para encargos que tienen honorario.
 */
export async function computeAccruals(db: Db | PrismaService, organizationId: string, engagementIds: string[], asOf: string = todayInSalvador()): Promise<Map<string, AccrualView>> {
  const out = new Map<string, AccrualView>();
  const ids = [...new Set(engagementIds)];
  if (ids.length === 0) return out;
  const cutoff = dateFromYmd(asOf);

  const [engagements, fees] = await Promise.all([
    db.engagement.findMany({ where: { id: { in: ids }, organizationId }, select: { id: true, auditId: true } }),
    db.engagementFee.findMany({ where: { engagementId: { in: ids }, organizationId } }),
  ]);
  if (fees.length === 0) return out;
  const feeIds = fees.map((f) => f.id);
  const engIds = fees.map((f) => f.engagementId);
  const auditIdOf = new Map(engagements.map((e) => [e.id, e.auditId]));
  const auditIds = [...new Set(engagements.map((e) => e.auditId).filter((v): v is string => !!v))];

  const [lateAmendments, invoices, creditNotes, milestones, hours, team, triggers] = await Promise.all([
    db.engagementFeeAmendment.findMany({ where: { feeId: { in: feeIds }, date: { gt: cutoff } }, select: { feeId: true, amountDelta: true } }),
    db.clientInvoice.findMany({ where: { engagementId: { in: engIds }, invoiceDate: { lte: cutoff }, organizationId }, select: { engagementId: true, netAmount: true, status: true, voidedAt: true } }),
    db.clientCreditNote.findMany({ where: { engagementId: { in: engIds }, issueDate: { lte: cutoff }, organizationId }, select: { engagementId: true, netAmount: true, status: true, voidedAt: true } }),
    db.billingScheduleItem.findMany({ where: { engagementId: { in: engIds }, completedAt: { not: null }, status: { not: ScheduleItemStatus.CANCELLED } }, select: { engagementId: true, amount: true, completedAt: true } }),
    auditIds.length
      ? db.timeEntry.groupBy({ by: ['auditId', 'userId'], where: { organizationId, auditId: { in: auditIds }, category: 'CLIENT_BILLABLE', workDate: { lte: cutoff } }, _sum: { hours: true } })
      : Promise.resolve([] as Array<{ auditId: string | null; userId: string; _sum: { hours: number | null } }>),
    auditIds.length ? db.auditTeam.findMany({ where: { auditId: { in: auditIds } }, select: { auditId: true, userId: true, budgetedHours: true } }) : Promise.resolve([]),
    auditIds.length
      ? db.workingPaper.findMany({ where: { auditId: { in: auditIds }, isCompletionTrigger: true }, select: { auditId: true, status: true, signedOffAt: true, updatedAt: true } })
      : Promise.resolve([]),
  ]);

  const lateByFee = new Map<string, number>();
  for (const a of lateAmendments) lateByFee.set(a.feeId, (lateByFee.get(a.feeId) ?? 0) + toCents(a.amountDelta));

  const invoicedByEng = new Map<string, number>();
  for (const i of invoices) {
    // al corte la factura estaba vigente si no se anuló, o si se anuló después
    const voidedOn = i.status === ClientInvoiceStatus.VOID && i.voidedAt ? salvadorDay(i.voidedAt) : null;
    if (voidedOn !== null && voidedOn <= asOf) continue;
    invoicedByEng.set(i.engagementId, (invoicedByEng.get(i.engagementId) ?? 0) + toCents(i.netAmount));
  }
  for (const n of creditNotes) {
    const voidedOn = n.status === CreditNoteStatus.VOID && n.voidedAt ? salvadorDay(n.voidedAt) : null;
    if (voidedOn !== null && voidedOn <= asOf) continue;
    invoicedByEng.set(n.engagementId, (invoicedByEng.get(n.engagementId) ?? 0) - toCents(n.netAmount));
  }

  const milestoneByEng = new Map<string, number>();
  for (const m of milestones) {
    if (m.completedAt && salvadorDay(m.completedAt) <= asOf) milestoneByEng.set(m.engagementId, (milestoneByEng.get(m.engagementId) ?? 0) + toCents(m.amount));
  }

  const hoursByAudit = new Map<string, Map<string, number>>();
  for (const h of hours) {
    if (!h.auditId) continue;
    const m = hoursByAudit.get(h.auditId) ?? new Map<string, number>();
    m.set(h.userId, (m.get(h.userId) ?? 0) + (h._sum.hours ?? 0));
    hoursByAudit.set(h.auditId, m);
  }
  const teamByAudit = new Map<string, Array<{ userId: string; budgetedHours: number | null }>>();
  for (const t of team) teamByAudit.set(t.auditId, [...(teamByAudit.get(t.auditId) ?? []), { userId: t.userId, budgetedHours: t.budgetedHours }]);
  const doneAudits = new Set(
    triggers.filter((t) => TRIGGER_DONE.has(t.status) && salvadorDay(t.signedOffAt ?? t.updatedAt) <= asOf).map((t) => t.auditId),
  );

  for (const fee of fees) {
    const engId = fee.engagementId;
    const auditId = auditIdOf.get(engId) ?? null;
    const feeTotalCents = fee.totalAmount === null ? null : toCents(fee.totalAmount) - (lateByFee.get(fee.id) ?? 0);

    // Presupuesto COMPLETO: toda persona con horas facturables tiene presupuesto y el total es mayor que cero; si no, no hay presupuesto.
    let billable = 0;
    let budget: number | null = null;
    if (auditId) {
      const perUser = hoursByAudit.get(auditId) ?? new Map<string, number>();
      billable = [...perUser.values()].reduce((s, v) => s + v, 0);
      const members = teamByAudit.get(auditId) ?? [];
      const budgetOf = new Map(members.map((m) => [m.userId, m.budgetedHours]));
      const complete = [...perUser.keys()].every((u) => budgetOf.get(u) !== null && budgetOf.get(u) !== undefined);
      const total = members.reduce((s, m) => s + (m.budgetedHours ?? 0), 0);
      budget = complete && total > 0 ? total : null;
    }
    const invoicedNetCents = invoicedByEng.get(engId) ?? 0;
    const completionDone = !!auditId && doneAudits.has(auditId);
    const result: AccrualResult = computeAccrual({
      feeType: fee.feeType, feeTotalCents, method: fee.progressMethod, invoicedNetCents, billableHours: billable, budgetHours: budget,
      completionDone, milestoneDoneCents: milestoneByEng.get(engId) ?? 0, manualPct: fee.manualProgressPct,
    });
    out.set(engId, {
      asOf, feeType: fee.feeType, feeTotal: dollars(feeTotalCents), method: fee.progressMethod, invoicedNet: invoicedNetCents / 100,
      billableHours: Math.round(billable * 100) / 100, budgetHours: budget === null ? null : Math.round(budget * 100) / 100, completionDone,
      progressPct: result.progressPct, accrued: dollars(result.accruedCents), toInvoice: dollars(result.toInvoiceCents), basis: result.basis, missing: result.missing,
    });
  }
  return out;
}

@Injectable()
export class AccrualService {
  constructor(private readonly prisma: PrismaService) {}

  forEngagements(organizationId: string, engagementIds: string[], asOf?: string) {
    return computeAccruals(this.prisma, organizationId, engagementIds, asOf);
  }
}

export type { Prisma };
