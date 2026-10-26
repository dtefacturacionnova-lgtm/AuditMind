import { BadRequestException, ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { ClientInvoiceStatus, CreditNoteStatus, EngagementStatus, FeeProgressMethod, FeeSource, FeeType, Prisma, ScheduleItemKind, ScheduleItemStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/jwt.strategy';
import {
  Db, TX_OPTIONS, assertBillingModule, assertDirection, assertManager, assertReason, dateFromYmd, isDirection, lockEngagement, logCollection,
  todayInSalvador, toJson, ymd,
} from './collections.common';
import { formatMoney, fromCents, parseMoneyInput, parseSignedMoneyInput, toCents } from './money.util';
import { computeAccruals } from './accrual.service';
import { equalInstallments, milestoneItems, PlannedItem, singlePayment, assertValidYmd } from './schedule.util';
import { AmendFeeDto, CreateScheduleItemDto, GenerateScheduleDto, SetFeeDto, UpdateScheduleItemDto } from './dto/collections.dto';

const num = (d: Prisma.Decimal | null | undefined) => (d === null || d === undefined ? null : Number(d));

export interface EngagementCommitments {
  feeTotalCents: number | null;
  invoicedNetCents: number;
  plannedCents: number;
  unscheduledCents: number | null;
  invoicedTotalCents: number;
  paidCents: number;
  withheldCents: number;
  creditedCents: number;
  writtenOffCents: number;
  receivableCents: number;
}

/**
 * Lo comprometido de un encargo, calculado SIEMPRE dentro de la transacción y bajo el candado del encargo:
 *   facturado neto + Σ cuotas PLANNED ≤ honorario            (invariante único del calendario, §4.1)
 *   por cobrar = Σ saldos de las facturas vigentes           (nunca «facturado − cobrado»)
 */
export async function computeCommitments(db: Db, engagementId: string, feeTotal: Prisma.Decimal | null): Promise<EngagementCommitments> {
  const [inv, planned, credits] = await Promise.all([
    db.clientInvoice.aggregate({
      where: { engagementId, status: { not: ClientInvoiceStatus.VOID } },
      _sum: { netAmount: true, totalAmount: true, paidAmount: true, withheldAmount: true, creditedAmount: true, writtenOffAmount: true },
    }),
    db.billingScheduleItem.aggregate({ where: { engagementId, status: ScheduleItemStatus.PLANNED }, _sum: { amount: true } }),
    db.clientCreditNote.aggregate({ where: { engagementId, status: CreditNoteStatus.ACTIVE }, _sum: { netAmount: true } }),
  ]);
  const c = (d: Prisma.Decimal | null | undefined) => (d ? toCents(d) : 0);
  // facturado neto = neto de las facturas vigentes − neto de las notas de crédito vigentes (una nota libera espacio del honorario)
  const invoicedNetCents = c(inv._sum.netAmount) - c(credits._sum.netAmount);
  const plannedCents = c(planned._sum.amount);
  const invoicedTotalCents = c(inv._sum.totalAmount);
  const paidCents = c(inv._sum.paidAmount);
  const withheldCents = c(inv._sum.withheldAmount);
  const creditedCents = c(inv._sum.creditedAmount);
  const writtenOffCents = c(inv._sum.writtenOffAmount);
  const feeTotalCents = feeTotal ? toCents(feeTotal) : null;
  return {
    feeTotalCents, invoicedNetCents, plannedCents,
    unscheduledCents: feeTotalCents === null ? null : feeTotalCents - invoicedNetCents - plannedCents,
    invoicedTotalCents, paidCents, withheldCents, creditedCents, writtenOffCents,
    receivableCents: invoicedTotalCents - paidCents - withheldCents - creditedCents - writtenOffCents,
  };
}

const commitmentsView = (c: EngagementCommitments) => ({
  feeTotal: c.feeTotalCents === null ? null : c.feeTotalCents / 100,
  invoicedNet: c.invoicedNetCents / 100,
  scheduled: c.plannedCents / 100,
  unscheduled: c.unscheduledCents === null ? null : c.unscheduledCents / 100,
  invoicedTotal: c.invoicedTotalCents / 100,
  collected: c.paidCents / 100,
  withheld: c.withheldCents / 100,
  credited: c.creditedCents / 100,
  writtenOff: c.writtenOffCents / 100,
  receivable: c.receivableCents / 100,
});

@Injectable()
export class FeesService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Utilidades ─────────────────────────────────────────────────────────────
  private async loadEngagement(db: Db, engagementId: string, user: AuthUser) {
    const eng = await db.engagement.findFirst({
      where: { id: engagementId, organizationId: user.organizationId },
      select: {
        id: true, clientId: true, kind: true, title: true, status: true, fiscalYear: true,
        client: { select: { legalName: true } },
        engagementLetter: { select: { proposal: { select: { id: true, feeAmount: true, feeCurrency: true } } } },
      },
    });
    if (!eng) throw new NotFoundException('Encargo no encontrado');
    return eng;
  }

  private assertEngagementOpen(status: EngagementStatus) {
    if (status === EngagementStatus.CANCELLED) throw new ConflictException('El encargo está cancelado: no admite cambios de honorario ni de calendario.');
  }

  private async requireFixedFee(db: Db, engagementId: string) {
    const fee = await db.engagementFee.findUnique({ where: { engagementId } });
    if (!fee) throw new ConflictException('Primero define el honorario del encargo.');
    if (fee.feeType !== FeeType.FIXED || !fee.totalAmount) {
      throw new ConflictException('Un honorario por tiempo no tiene calendario ni monto fijo: se factura libremente.');
    }
    return { ...fee, totalAmount: fee.totalAmount };
  }

  // ── Honorario ──────────────────────────────────────────────────────────────
  async getFee(engagementId: string, user: AuthUser) {
    assertManager(user);
    await assertBillingModule(this.prisma, user.organizationId);
    return this.feeView(this.prisma, engagementId, user);
  }

  /** Devengado del encargo a una fecha de corte (por defecto hoy); la fecha no puede ser futura. */
  async accrualAt(engagementId: string, asOf: string | undefined, user: AuthUser) {
    assertManager(user);
    await assertBillingModule(this.prisma, user.organizationId);
    await this.loadEngagement(this.prisma, engagementId, user);
    const today = todayInSalvador();
    const cutoff = asOf ? assertValidYmd(asOf, 'La fecha de corte') : today;
    if (cutoff > today) throw new BadRequestException('La fecha de corte no puede ser futura.');
    return (await computeAccruals(this.prisma, user.organizationId, [engagementId], cutoff)).get(engagementId) ?? null;
  }

  private async feeView(db: Db, engagementId: string, user: AuthUser) {
    const eng = await this.loadEngagement(db, engagementId, user);
    const fee = await db.engagementFee.findUnique({ where: { engagementId } });
    const [amendments, schedule, commitments] = await Promise.all([
      fee ? db.engagementFeeAmendment.findMany({ where: { feeId: fee.id }, orderBy: [{ date: 'asc' }, { createdAt: 'asc' }] }) : [],
      this.scheduleView(db, engagementId),
      computeCommitments(db, engagementId, fee?.totalAmount ?? null),
    ]);
    const amended = amendments.reduce((s, a) => s + toCents(a.amountDelta), 0);
    // Devengado al día de hoy (avance, devengado y por facturar); null si aún no hay honorario.
    const accrual = fee ? (await computeAccruals(db, user.organizationId, [engagementId])).get(engagementId) ?? null : null;
    return {
      engagement: { id: eng.id, kind: eng.kind, title: eng.title, status: eng.status, fiscalYear: eng.fiscalYear, clientId: eng.clientId, clientName: eng.client.legalName },
      fee: fee && {
        id: fee.id, feeType: fee.feeType, totalAmount: num(fee.totalAmount),
        originalAmount: fee.totalAmount ? (toCents(fee.totalAmount) - amended) / 100 : null,
        source: fee.source, proposalId: fee.proposalId, paymentTermDays: fee.paymentTermDays, progressMethod: fee.progressMethod,
        manualProgressPct: fee.manualProgressPct, notes: fee.notes, createdAt: fee.createdAt, updatedAt: fee.updatedAt,
      },
      amendments: amendments.map((a) => ({ id: a.id, date: ymd(a.date), reason: a.reason, amountDelta: Number(a.amountDelta), createdAt: a.createdAt })),
      schedule,
      summary: commitmentsView(commitments),
      accrual,
      permissions: { canEdit: isDirection(user) },
    };
  }

  async setFee(engagementId: string, dto: SetFeeDto, user: AuthUser) {
    assertDirection(user);
    await assertBillingModule(this.prisma, user.organizationId);
    await this.prisma.$transaction(async (tx) => {
      await lockEngagement(tx, engagementId);
      const eng = await this.loadEngagement(tx, engagementId, user);
      this.assertEngagementOpen(eng.status);
      const existing = await tx.engagementFee.findUnique({ where: { engagementId } });

      // ── monto ──
      let totalCents: number | null = null;
      let source: FeeSource = FeeSource.MANUAL;
      let proposalId: string | null = existing?.proposalId ?? null;
      if (dto.feeType === FeeType.FIXED) {
        if (dto.importFromProposal) {
          const proposal = eng.engagementLetter?.proposal;
          if (!proposal || proposal.feeAmount === null) throw new BadRequestException('El encargo no tiene una propuesta con honorario para importar.');
          if (proposal.feeCurrency !== 'USD') throw new BadRequestException(`La propuesta está en ${proposal.feeCurrency}: el honorario se captura a mano en USD.`);
          totalCents = toCents(proposal.feeAmount);
          if (totalCents <= 0) throw new BadRequestException('El honorario de la propuesta no es mayor que cero.');
          source = FeeSource.PROPOSAL;
          proposalId = proposal.id;
        } else {
          if (dto.totalAmount === undefined) throw new BadRequestException('Indica el honorario neto (USD) o importa el de la propuesta.');
          totalCents = parseMoneyInput(dto.totalAmount, 'El honorario');
          // Si el monto no cambia, el honorario sigue siendo el de la propuesta: soltar el vínculo dejaría que otro encargo con la misma carta la importe otra vez.
          const unchanged = !!existing && existing.feeType === FeeType.FIXED && !!existing.totalAmount && toCents(existing.totalAmount) === totalCents;
          if (unchanged && existing) { source = existing.source; proposalId = existing.proposalId; } else proposalId = null;
        }
      } else {
        if (dto.totalAmount !== undefined || dto.importFromProposal) throw new BadRequestException('Un honorario por tiempo no lleva monto fijo.');
        proposalId = null;
      }

      // ── cambios que exigen que aún no haya movimientos ──
      const changesAmount = existing
        && (existing.feeType !== dto.feeType || (existing.totalAmount ? toCents(existing.totalAmount) : null) !== totalCents);
      if (existing && changesAmount) {
        const [amendments, items, invoices] = await Promise.all([
          tx.engagementFeeAmendment.count({ where: { feeId: existing.id } }),
          tx.billingScheduleItem.count({ where: { engagementId, status: { not: ScheduleItemStatus.CANCELLED } } }),
          tx.clientInvoice.count({ where: { engagementId, status: { not: ClientInvoiceStatus.VOID } } }),
        ]);
        if (amendments > 0 || items > 0 || invoices > 0) {
          throw new ConflictException('El honorario ya tiene adendas, cuotas o facturas: cámbialo con una adenda en lugar de editar el monto.');
        }
      }

      // ── resto de campos ──
      const progressMethod = dto.progressMethod ?? existing?.progressMethod ?? FeeProgressMethod.HOURS;
      let manual: number | null = dto.manualProgressPct ?? existing?.manualProgressPct ?? null;
      if (progressMethod !== FeeProgressMethod.MANUAL) {
        if (dto.manualProgressPct !== undefined) throw new BadRequestException('El avance manual solo se usa con el método de avance «manual».');
        manual = null;
      }
      const data = {
        feeType: dto.feeType,
        totalAmount: totalCents === null ? null : fromCents(totalCents),
        source, proposalId,
        paymentTermDays: dto.paymentTermDays ?? existing?.paymentTermDays ?? 30,
        progressMethod, manualProgressPct: manual,
        notes: dto.notes !== undefined ? (dto.notes.trim() || null) : (existing?.notes ?? null),
      };
      try {
        const fee = existing
          ? await tx.engagementFee.update({ where: { id: existing.id }, data })
          : await tx.engagementFee.create({ data: { ...data, organizationId: user.organizationId, engagementId, createdById: user.id } });
        await logCollection(tx, {
          organizationId: user.organizationId, entityType: 'ENGAGEMENT_FEE', entityId: fee.id, action: 'FEE_SET', actorId: user.id,
          before: existing ? toJson(existing) : null, after: toJson(fee),
        });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          throw new ConflictException('Esa propuesta ya se usó como honorario de otro encargo.');
        }
        throw e;
      }
    }, TX_OPTIONS);
    return this.feeView(this.prisma, engagementId, user);
  }

  async deleteFee(engagementId: string, user: AuthUser) {
    assertDirection(user);
    await assertBillingModule(this.prisma, user.organizationId);
    await this.prisma.$transaction(async (tx) => {
      await lockEngagement(tx, engagementId);
      await this.loadEngagement(tx, engagementId, user);
      const fee = await tx.engagementFee.findUnique({ where: { engagementId } });
      if (!fee) throw new NotFoundException('El encargo no tiene honorario definido.');
      const [amendments, items, invoices] = await Promise.all([
        tx.engagementFeeAmendment.count({ where: { feeId: fee.id } }),
        tx.billingScheduleItem.count({ where: { engagementId } }),
        tx.clientInvoice.count({ where: { engagementId } }),
      ]);
      if (amendments > 0 || items > 0 || invoices > 0) {
        throw new ConflictException('El honorario ya tiene adendas, cuotas o facturas registradas y no se puede borrar.');
      }
      await tx.engagementFee.delete({ where: { id: fee.id } });
      await logCollection(tx, {
        organizationId: user.organizationId, entityType: 'ENGAGEMENT_FEE', entityId: fee.id, action: 'FEE_DELETED', actorId: user.id,
        before: toJson(fee), after: null,
      });
    }, TX_OPTIONS);
    return { deleted: true };
  }

  // ── Adendas ────────────────────────────────────────────────────────────────
  async amendFee(engagementId: string, dto: AmendFeeDto, user: AuthUser) {
    assertDirection(user);
    await assertBillingModule(this.prisma, user.organizationId);
    const date = assertValidYmd(dto.date, 'La fecha de la adenda');
    const reason = assertReason(dto.reason, 'El motivo de la adenda', 5);
    const deltaCents = parseSignedMoneyInput(dto.amountDelta, 'El cambio de honorario');
    await this.prisma.$transaction(async (tx) => {
      await lockEngagement(tx, engagementId);
      const eng = await this.loadEngagement(tx, engagementId, user);
      this.assertEngagementOpen(eng.status);
      const fee = await this.requireFixedFee(tx, engagementId);
      const newTotal = toCents(fee.totalAmount) + deltaCents;
      if (newTotal <= 0) throw new UnprocessableEntityException('El honorario resultante debe ser mayor que cero.');
      const c = await computeCommitments(tx, engagementId, fee.totalAmount);
      if (deltaCents < 0 && c.invoicedNetCents + c.plannedCents > newTotal) {
        const overflow = c.invoicedNetCents + c.plannedCents - newTotal;
        if (c.invoicedNetCents > newTotal) {
          throw new UnprocessableEntityException(
            `Ya se facturó ${formatMoney(c.invoicedNetCents)} netos: el honorario no puede bajar de ese monto.`,
          );
        }
        throw new UnprocessableEntityException(
          `Para bajar el honorario a ${formatMoney(newTotal)} hay que recortar ${formatMoney(overflow)} de las cuotas programadas ` +
          `(hoy: facturado ${formatMoney(c.invoicedNetCents)} + programado ${formatMoney(c.plannedCents)}).`,
        );
      }
      const amendment = await tx.engagementFeeAmendment.create({
        data: { organizationId: user.organizationId, feeId: fee.id, date: dateFromYmd(date), reason, amountDelta: fromCents(deltaCents), createdById: user.id },
      });
      await tx.engagementFee.update({ where: { id: fee.id }, data: { totalAmount: fromCents(newTotal) } });
      await logCollection(tx, {
        organizationId: user.organizationId, entityType: 'ENGAGEMENT_FEE', entityId: fee.id, action: 'FEE_AMENDED', actorId: user.id,
        before: { totalAmount: fee.totalAmount.toString() },
        after: { totalAmount: fromCents(newTotal).toString(), amountDelta: fromCents(deltaCents).toString(), amendmentId: amendment.id }, note: reason,
      });
    }, TX_OPTIONS);
    return this.feeView(this.prisma, engagementId, user);
  }

  async listAmendments(engagementId: string, user: AuthUser) {
    assertManager(user);
    await assertBillingModule(this.prisma, user.organizationId);
    await this.loadEngagement(this.prisma, engagementId, user);
    const fee = await this.prisma.engagementFee.findUnique({ where: { engagementId } });
    if (!fee) return [];
    const rows = await this.prisma.engagementFeeAmendment.findMany({ where: { feeId: fee.id }, orderBy: [{ date: 'asc' }, { createdAt: 'asc' }] });
    return rows.map((a) => ({ id: a.id, date: ymd(a.date), reason: a.reason, amountDelta: Number(a.amountDelta), createdAt: a.createdAt }));
  }

  // ── Calendario ─────────────────────────────────────────────────────────────
  private async maxSequence(db: Db, engagementId: string): Promise<number> {
    const r = await db.billingScheduleItem.aggregate({ where: { engagementId }, _max: { sequence: true } });
    return r._max.sequence ?? 0;
  }

  /** Cuotas con la factura vigente que las cubre (si hay) y un estado de pantalla derivado. */
  async scheduleView(db: Db, engagementId: string) {
    const items = await db.billingScheduleItem.findMany({ where: { engagementId }, orderBy: { sequence: 'asc' } });
    const invoices = items.length
      ? await db.clientInvoice.findMany({
        where: { scheduleItemId: { in: items.map((i) => i.id) }, status: { not: ClientInvoiceStatus.VOID } },
        select: { id: true, scheduleItemId: true, invoiceNumber: true, status: true, totalAmount: true, paidAmount: true, withheldAmount: true, creditedAmount: true, writtenOffAmount: true, dueDate: true },
      })
      : [];
    const byItem = new Map(invoices.map((i) => [i.scheduleItemId as string, i]));
    const today = todayInSalvador();
    return items.map((it) => {
      const inv = byItem.get(it.id);
      let state: 'CANCELLED' | 'PLANNED' | 'PLANNED_LATE' | 'INVOICED' | 'INVOICED_PARTIAL' | 'INVOICED_OVERDUE' | 'PAID' = 'PLANNED';
      if (it.status === ScheduleItemStatus.CANCELLED) state = 'CANCELLED';
      else if (it.status === ScheduleItemStatus.PLANNED) state = ymd(it.dueDate) < today ? 'PLANNED_LATE' : 'PLANNED';
      else if (inv) {
        if (inv.status === 'SETTLED') state = 'PAID';
        else if (ymd(inv.dueDate) < today) state = 'INVOICED_OVERDUE';
        else state = inv.status === 'PARTIAL' ? 'INVOICED_PARTIAL' : 'INVOICED';
      } else state = 'INVOICED';
      return {
        id: it.id, sequence: it.sequence, label: it.label, kind: it.kind, dueDate: ymd(it.dueDate), amount: Number(it.amount), status: it.status,
        completedAt: it.completedAt, state,
        invoice: inv ? {
          id: inv.id, invoiceNumber: inv.invoiceNumber, status: inv.status, total: Number(inv.totalAmount),
          balance: (toCents(inv.totalAmount) - toCents(inv.paidAmount) - toCents(inv.withheldAmount) - toCents(inv.creditedAmount) - toCents(inv.writtenOffAmount)) / 100,
        } : null,
      };
    });
  }

  async listSchedule(engagementId: string, user: AuthUser) {
    assertManager(user);
    await assertBillingModule(this.prisma, user.organizationId);
    await this.loadEngagement(this.prisma, engagementId, user);
    return this.scheduleView(this.prisma, engagementId);
  }

  async generateSchedule(engagementId: string, dto: GenerateScheduleDto, user: AuthUser) {
    assertDirection(user);
    await assertBillingModule(this.prisma, user.organizationId);
    await this.prisma.$transaction(async (tx) => {
      await lockEngagement(tx, engagementId);
      const eng = await this.loadEngagement(tx, engagementId, user);
      this.assertEngagementOpen(eng.status);
      const fee = await this.requireFixedFee(tx, engagementId);
      const replace = dto.replacePlanned ?? true;

      const c = await computeCommitments(tx, engagementId, fee.totalAmount);
      const baseCents = (c.feeTotalCents as number) - c.invoicedNetCents - (replace ? 0 : c.plannedCents);

      // Las cuotas aún sin facturar se reemplazan: se borran las que nunca tuvieron factura y se CANCELAN las que sí la tuvieron
      // (una factura anulada sigue apuntando a su cuota, y esa historia no se borra).
      let removed: { id: string; sequence: number; label: string; amount: string }[] = [];
      if (replace) {
        const planned = await tx.billingScheduleItem.findMany({ where: { engagementId, status: ScheduleItemStatus.PLANNED } });
        if (planned.length) {
          const referenced = new Set((await tx.clientInvoice.findMany({
            where: { scheduleItemId: { in: planned.map((p) => p.id) } }, select: { scheduleItemId: true },
          })).map((r) => r.scheduleItemId as string));
          const toDelete = planned.filter((p) => !referenced.has(p.id)).map((p) => p.id);
          const toCancel = planned.filter((p) => referenced.has(p.id)).map((p) => p.id);
          if (toDelete.length) await tx.billingScheduleItem.deleteMany({ where: { id: { in: toDelete } } });
          if (toCancel.length) await tx.billingScheduleItem.updateMany({ where: { id: { in: toCancel } }, data: { status: ScheduleItemStatus.CANCELLED } });
          removed = planned.map((p) => ({ id: p.id, sequence: p.sequence, label: p.label, amount: p.amount.toString() }));
        }
      }

      const startSequence = (await this.maxSequence(tx, engagementId)) + 1;
      let items: PlannedItem[];
      if (dto.mode === 'EQUAL') {
        if (!dto.count || !dto.firstDate || !dto.everyMonths) throw new BadRequestException('Indica cantidad de cuotas, fecha de la primera y cada cuántos meses.');
        items = equalInstallments({ baseCents, count: dto.count, firstDate: dto.firstDate, everyMonths: dto.everyMonths, startSequence });
      } else if (dto.mode === 'MILESTONES') {
        if (!dto.milestones?.length) throw new BadRequestException('Indica los hitos del calendario.');
        items = milestoneItems({
          baseCents, startSequence,
          milestones: dto.milestones.map((m) => ({ label: m.label, date: m.date, percent: m.percent ?? undefined, amountCents: m.amount == null ? undefined : parseMoneyInput(m.amount, 'El monto del hito') })),
        });
      } else {
        if (!dto.firstDate) throw new BadRequestException('Indica la fecha del pago.');
        items = singlePayment({ baseCents, date: dto.firstDate, label: dto.label, startSequence });
      }

      const sum = items.reduce((s, i) => s + i.amountCents, 0);
      if (sum !== baseCents) throw new Error(`El calendario generado suma ${sum} y debía sumar ${baseCents}`); // no debería ocurrir: las utilidades lo garantizan
      await tx.billingScheduleItem.createMany({
        data: items.map((i) => ({
          organizationId: user.organizationId, engagementId, sequence: i.sequence, label: i.label, kind: i.kind as ScheduleItemKind,
          dueDate: dateFromYmd(i.dueDate), amount: fromCents(i.amountCents), createdById: user.id,
        })),
      });
      await logCollection(tx, {
        organizationId: user.organizationId, entityType: 'ENGAGEMENT_FEE', entityId: fee.id, action: 'SCHEDULE_GENERATED', actorId: user.id,
        before: removed.length ? toJson({ replaced: removed }) : null,
        after: toJson({ mode: dto.mode, baseCents, items: items.map((i) => ({ sequence: i.sequence, label: i.label, dueDate: i.dueDate, amount: i.amountCents / 100 })) }),
      });
    }, TX_OPTIONS);
    return this.feeView(this.prisma, engagementId, user);
  }

  async createItem(engagementId: string, dto: CreateScheduleItemDto, user: AuthUser) {
    assertDirection(user);
    await assertBillingModule(this.prisma, user.organizationId);
    const dueDate = assertValidYmd(dto.dueDate, 'La fecha de la cuota');
    const amountCents = parseMoneyInput(dto.amount, 'El monto de la cuota');
    const label = dto.label.trim();
    if (!label) throw new BadRequestException('La cuota necesita una etiqueta.');
    return this.prisma.$transaction(async (tx) => {
      await lockEngagement(tx, engagementId);
      const eng = await this.loadEngagement(tx, engagementId, user);
      this.assertEngagementOpen(eng.status);
      const fee = await this.requireFixedFee(tx, engagementId);
      const c = await computeCommitments(tx, engagementId, fee.totalAmount);
      if (amountCents > (c.unscheduledCents as number)) {
        throw new UnprocessableEntityException(`Solo quedan ${formatMoney(Math.max(0, c.unscheduledCents as number))} sin programar del honorario.`);
      }
      const item = await tx.billingScheduleItem.create({
        data: {
          organizationId: user.organizationId, engagementId, sequence: (await this.maxSequence(tx, engagementId)) + 1, label,
          kind: dto.kind ?? ScheduleItemKind.INSTALLMENT, dueDate: dateFromYmd(dueDate), amount: fromCents(amountCents), createdById: user.id,
        },
      });
      await logCollection(tx, {
        organizationId: user.organizationId, entityType: 'SCHEDULE_ITEM', entityId: item.id, action: 'SCHEDULE_ITEM_CREATED', actorId: user.id,
        before: null, after: toJson(item),
      });
      return item;
    }, TX_OPTIONS);
  }

  private async lockedItem(tx: Db, itemId: string, user: AuthUser) {
    // El encargo se conoce por la cuota; se toma el candado y SOLO ENTONCES se relee para decidir.
    const probe = await tx.billingScheduleItem.findFirst({ where: { id: itemId, organizationId: user.organizationId }, select: { engagementId: true } });
    if (!probe) throw new NotFoundException('Cuota no encontrada');
    await lockEngagement(tx, probe.engagementId);
    const item = await tx.billingScheduleItem.findFirst({ where: { id: itemId, organizationId: user.organizationId } });
    if (!item) throw new NotFoundException('Cuota no encontrada');
    return item;
  }

  async getItem(itemId: string, user: AuthUser) {
    assertManager(user);
    await assertBillingModule(this.prisma, user.organizationId);
    const item = await this.prisma.billingScheduleItem.findFirst({ where: { id: itemId, organizationId: user.organizationId } });
    if (!item) throw new NotFoundException('Cuota no encontrada');
    const view = (await this.scheduleView(this.prisma, item.engagementId)).find((i) => i.id === itemId);
    return { engagementId: item.engagementId, ...view };
  }

  async updateItem(itemId: string, dto: UpdateScheduleItemDto, user: AuthUser) {
    assertDirection(user);
    await assertBillingModule(this.prisma, user.organizationId);
    return this.prisma.$transaction(async (tx) => {
      const item = await this.lockedItem(tx, itemId, user);
      if (item.status !== ScheduleItemStatus.PLANNED) throw new ConflictException('Solo se edita una cuota que aún está programada (sin factura).');
      const fee = await this.requireFixedFee(tx, item.engagementId);
      const data: Prisma.BillingScheduleItemUpdateInput = {};
      if (dto.label !== undefined) {
        if (!dto.label.trim()) throw new BadRequestException('La cuota necesita una etiqueta.');
        data.label = dto.label.trim();
      }
      if (dto.kind !== undefined) data.kind = dto.kind;
      if (dto.dueDate !== undefined) data.dueDate = dateFromYmd(assertValidYmd(dto.dueDate, 'La fecha de la cuota'));
      if (dto.amount !== undefined) {
        const newCents = parseMoneyInput(dto.amount, 'El monto de la cuota');
        const c = await computeCommitments(tx, item.engagementId, fee.totalAmount);
        const slack = (c.unscheduledCents as number) + toCents(item.amount);
        if (newCents > slack) throw new UnprocessableEntityException(`La cuota puede llegar a ${formatMoney(slack)} como máximo: es lo que queda sin programar más lo que ya tiene.`);
        data.amount = fromCents(newCents);
      }
      const updated = await tx.billingScheduleItem.update({ where: { id: itemId }, data });
      await logCollection(tx, {
        organizationId: user.organizationId, entityType: 'SCHEDULE_ITEM', entityId: itemId, action: 'SCHEDULE_ITEM_UPDATED', actorId: user.id,
        before: toJson(item), after: toJson(updated),
      });
      return updated;
    }, TX_OPTIONS);
  }

  /**
   * Marcar (o desmarcar) una cuota como CUMPLIDA: el devengado por hitos suma las cuotas cumplidas (§4.8). Hasta ahora ningún camino
   * llenaba `completedAt`, así que ese método de avance nunca habría devengado nada. Lo puede hacer un gerente; queda en la bitácora.
   */
  async setItemCompletion(itemId: string, completedOn: string | null | undefined, user: AuthUser) {
    assertManager(user);
    await assertBillingModule(this.prisma, user.organizationId);
    return this.prisma.$transaction(async (tx) => {
      const item = await this.lockedItem(tx, itemId, user);
      if (item.status === ScheduleItemStatus.CANCELLED) throw new ConflictException('Una cuota cancelada no se marca como cumplida.');
      await this.requireFixedFee(tx, item.engagementId);
      let completedAt: Date | null = null;
      if (completedOn) {
        const day = assertValidYmd(completedOn, 'La fecha de cumplimiento');
        if (day > todayInSalvador()) throw new BadRequestException('La fecha de cumplimiento no puede ser futura.');
        completedAt = new Date(`${day}T12:00:00.000Z`); // mediodía UTC = el mismo día en El Salvador (UTC−6)
      }
      const updated = await tx.billingScheduleItem.update({ where: { id: itemId }, data: { completedAt } });
      await logCollection(tx, {
        organizationId: user.organizationId, entityType: 'SCHEDULE_ITEM', entityId: itemId, action: 'SCHEDULE_ITEM_UPDATED', actorId: user.id,
        before: { completedAt: item.completedAt }, after: { completedAt: updated.completedAt }, note: completedAt ? 'Hito marcado como cumplido' : 'Hito marcado como no cumplido',
      });
      return updated;
    }, TX_OPTIONS);
  }

  async cancelItem(itemId: string, user: AuthUser) {
    assertDirection(user);
    await assertBillingModule(this.prisma, user.organizationId);
    return this.prisma.$transaction(async (tx) => {
      const item = await this.lockedItem(tx, itemId, user);
      if (item.status !== ScheduleItemStatus.PLANNED) throw new ConflictException('Solo se cancela una cuota que aún está programada (sin factura).');
      const updated = await tx.billingScheduleItem.update({ where: { id: itemId }, data: { status: ScheduleItemStatus.CANCELLED } });
      await logCollection(tx, {
        organizationId: user.organizationId, entityType: 'SCHEDULE_ITEM', entityId: itemId, action: 'SCHEDULE_ITEM_CANCELLED', actorId: user.id,
        before: toJson(item), after: toJson(updated),
      });
      return updated;
    }, TX_OPTIONS);
  }

  /** Borrar de verdad solo una cuota que nunca tuvo una factura (ni anulada) y no está facturada. */
  async deleteItem(itemId: string, user: AuthUser) {
    assertDirection(user);
    await assertBillingModule(this.prisma, user.organizationId);
    await this.prisma.$transaction(async (tx) => {
      const item = await this.lockedItem(tx, itemId, user);
      if (item.status === ScheduleItemStatus.INVOICED) throw new ConflictException('La cuota está facturada: anula la factura antes.');
      const history = await tx.clientInvoice.count({ where: { scheduleItemId: itemId } });
      if (history > 0) throw new ConflictException('La cuota tiene facturas (aunque anuladas) en su historial: cancélala en lugar de borrarla.');
      await tx.billingScheduleItem.delete({ where: { id: itemId } });
      await logCollection(tx, {
        organizationId: user.organizationId, entityType: 'SCHEDULE_ITEM', entityId: itemId, action: 'SCHEDULE_ITEM_DELETED', actorId: user.id,
        before: toJson(item), after: null,
      });
    }, TX_OPTIONS);
    return { deleted: true };
  }
}
