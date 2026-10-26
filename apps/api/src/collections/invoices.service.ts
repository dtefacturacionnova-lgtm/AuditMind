import { BadRequestException, ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { ClientInvoiceStatus, FeeType, Prisma, ScheduleItemStatus, WithholdingTaxType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/jwt.strategy';
import {
  Db, TX_OPTIONS, addDays, assertBillingModule, assertDirection, assertManager, assertReason, dateFromYmd, isDirection, isUniqueViolation,
  lockEngagement, lockInvoices, lockPayment, logCollection, todayInSalvador, toJson, ymd,
} from './collections.common';
import { balanceCents, daysOverdue } from './balance.util';
import { formatMoney, fromCents, parseMoneyInput, parseNonNegativeMoneyInput, toCents } from './money.util';
import { assertValidYmd } from './schedule.util';
import { LedgerInvoice, applyInvoiceDelta, moneyOf } from './invoice-ledger';
import { assertWithinBalance } from './allocation.util';
import { computeCommitments } from './fees.service';
import { creditNoteRow, writeOffRow } from './collection-rows';
import { assertNoNegativePast, firstMovementDate } from './retro.util';
import {
  AddWithholdingDto, ListInvoicesQueryDto, ListWithholdingsQueryDto, ReasonDto, RegisterInvoiceDto, UpdateInvoiceDto, WithholdingInputDto,
} from './dto/collections.dto';

const UUID_RE = /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/;

/** Identificadores del DTE: número de control y código de generación. */
export function normalizeDteIdentifiers(args: { invoiceNumber: string; generationCode?: string | null; documentType: string }) {
  const invoiceNumber = args.invoiceNumber.trim().toUpperCase(); // el índice único distingue mayúsculas: se normaliza
  if (invoiceNumber.length < 3 || /\s/.test(invoiceNumber)) {
    throw new BadRequestException('El número de control no debe llevar espacios.');
  }
  const m = /^DTE-(\d{2})-/i.exec(invoiceNumber);
  if (m && m[1] !== args.documentType) {
    throw new UnprocessableEntityException(`El número de control indica el tipo ${m[1]} pero se eligió el tipo ${args.documentType}.`);
  }
  let generationCode: string | null = null;
  if (args.generationCode !== undefined && args.generationCode !== null && args.generationCode.trim() !== '') {
    generationCode = args.generationCode.trim().toUpperCase();
    if (!UUID_RE.test(generationCode)) throw new BadRequestException('El código de generación debe ser un UUID (8-4-4-4-12).');
  }
  return { invoiceNumber, generationCode };
}

export function invoiceListRow(inv: Prisma.ClientInvoiceGetPayload<object>, today: string) {
  const open = inv.status === 'OPEN' || inv.status === 'PARTIAL';
  const balance = inv.status === 'VOID' ? 0 : balanceCents(moneyOf(inv)) / 100; // una anulada no se debe: su saldo es 0
  const overdueDays = open ? daysOverdue(ymd(inv.dueDate), today) : 0;
  return {
    id: inv.id, clientId: inv.clientId, engagementId: inv.engagementId, scheduleItemId: inv.scheduleItemId,
    invoiceNumber: inv.invoiceNumber, generationCode: inv.generationCode, documentType: inv.documentType,
    invoiceDate: ymd(inv.invoiceDate), dueDate: ymd(inv.dueDate), description: inv.description,
    netAmount: Number(inv.netAmount), taxAmount: Number(inv.taxAmount), totalAmount: Number(inv.totalAmount),
    paidAmount: Number(inv.paidAmount), withheldAmount: Number(inv.withheldAmount),
    creditedAmount: Number(inv.creditedAmount), writtenOffAmount: Number(inv.writtenOffAmount),
    balance, status: inv.status, overdueDays, overdue: overdueDays > 0,
    voidedAt: inv.voidedAt, voidReason: inv.voidReason, createdAt: inv.createdAt,
  };
}

@Injectable()
export class InvoicesService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Registrar ──────────────────────────────────────────────────────────────
  async register(dto: RegisterInvoiceDto, user: AuthUser) {
    assertManager(user);
    await assertBillingModule(this.prisma, user.organizationId);

    const { invoiceNumber, generationCode } = normalizeDteIdentifiers({ invoiceNumber: dto.invoiceNumber, generationCode: dto.generationCode, documentType: dto.documentType });
    const invoiceDate = assertValidYmd(dto.invoiceDate, 'La fecha de la factura');
    if (invoiceDate > todayInSalvador()) throw new BadRequestException('La fecha de la factura no puede ser futura.');
    const dueExplicit = dto.dueDate ? assertValidYmd(dto.dueDate, 'La fecha de vencimiento') : null;
    if (dueExplicit && dueExplicit < invoiceDate) throw new BadRequestException('El vencimiento no puede ser anterior a la fecha de la factura.');
    const netCents = parseMoneyInput(dto.netAmount, 'El monto neto');
    const taxCents = dto.taxAmount === undefined ? 0 : parseNonNegativeMoneyInput(dto.taxAmount, 'El IVA');
    const totalCents = netCents + taxCents;
    const withholdings = (dto.withholdings ?? []).map((w) => ({ taxType: w.taxType, cents: parseMoneyInput(w.amount, 'La retención'), certificateNumber: w.certificateNumber?.trim() || null }));
    const withheldCents = withholdings.reduce((s, w) => s + w.cents, 0);
    if (withheldCents > totalCents) throw new UnprocessableEntityException('Las retenciones no pueden superar el total de la factura.');

    return this.prisma.$transaction(async (tx) => {
      await lockEngagement(tx, dto.engagementId);
      const eng = await tx.engagement.findFirst({
        where: { id: dto.engagementId, organizationId: user.organizationId }, select: { id: true, clientId: true, status: true },
      });
      if (!eng) throw new NotFoundException('Encargo no encontrado');
      if (eng.status === 'CANCELLED') throw new ConflictException('El encargo está cancelado: no se le pueden registrar facturas.');
      const fee = await tx.engagementFee.findUnique({ where: { engagementId: eng.id } });
      if (!fee) throw new ConflictException('Primero define el honorario del encargo.');

      let item: Prisma.BillingScheduleItemGetPayload<object> | null = null;
      if (dto.scheduleItemId) {
        item = await tx.billingScheduleItem.findFirst({ where: { id: dto.scheduleItemId, organizationId: user.organizationId, engagementId: eng.id } });
        if (!item) throw new NotFoundException('La cuota no existe en este encargo.');
        if (item.status !== ScheduleItemStatus.PLANNED) throw new ConflictException('Esa cuota ya fue facturada o está cancelada.');
      }

      if (fee.feeType === FeeType.FIXED && fee.totalAmount) {
        const c = await computeCommitments(tx, eng.id, fee.totalAmount);
        const after = c.invoicedNetCents + netCents + c.plannedCents - (item ? toCents(item.amount) : 0);
        if (after > (c.feeTotalCents as number)) {
          const room = (c.feeTotalCents as number) - c.invoicedNetCents - c.plannedCents + (item ? toCents(item.amount) : 0);
          throw new UnprocessableEntityException(
            `La factura (${formatMoney(netCents)} netos) supera lo que queda del honorario para facturar${item ? ' con esta cuota' : ' sin programar'}: ${formatMoney(Math.max(0, room))}. ` +
            'Si el alcance creció, registra primero una adenda.',
          );
        }
      }

      const dueDate = dueExplicit ?? addDays(invoiceDate, fee.paymentTermDays);
      let invoice: Prisma.ClientInvoiceGetPayload<object>;
      try {
        const status = withheldCents === 0 ? 'OPEN' : (withheldCents === totalCents ? 'SETTLED' : 'PARTIAL');
        invoice = await tx.clientInvoice.create({
          data: {
            organizationId: user.organizationId, clientId: eng.clientId, engagementId: eng.id, scheduleItemId: item?.id ?? null,
            invoiceNumber, generationCode, documentType: dto.documentType, invoiceDate: dateFromYmd(invoiceDate), dueDate: dateFromYmd(dueDate),
            description: dto.description?.trim() || item?.label || null,
            netAmount: fromCents(netCents), taxAmount: fromCents(taxCents), totalAmount: fromCents(totalCents),
            withheldAmount: fromCents(withheldCents), status, createdById: user.id,
          },
        });
      } catch (e) {
        if (isUniqueViolation(e)) throw this.uniqueMessage(e);
        throw e;
      }
      for (const w of withholdings) {
        const row = await tx.invoiceWithholding.create({
          data: {
            organizationId: user.organizationId, clientId: eng.clientId, invoiceId: invoice.id, paymentId: null, taxType: w.taxType,
            amount: fromCents(w.cents), appliedOn: dateFromYmd(invoiceDate), certificateNumber: w.certificateNumber, createdById: user.id,
          },
        });
        await logCollection(tx, {
          organizationId: user.organizationId, entityType: 'WITHHOLDING', entityId: row.id, action: 'WITHHOLDING_ADDED', actorId: user.id,
          before: null, after: toJson(row), note: 'Retención que trae el DTE',
        });
      }
      if (item) {
        const res = await tx.billingScheduleItem.updateMany({
          where: { id: item.id, status: ScheduleItemStatus.PLANNED }, data: { status: ScheduleItemStatus.INVOICED },
        });
        if (res.count !== 1) throw new ConflictException('La cuota cambió mientras se registraba la factura; vuelve a intentarlo.');
        await logCollection(tx, {
          organizationId: user.organizationId, entityType: 'SCHEDULE_ITEM', entityId: item.id, action: 'SCHEDULE_ITEM_UPDATED', actorId: user.id,
          before: { status: 'PLANNED' }, after: { status: 'INVOICED', invoiceId: invoice.id }, note: 'Cuota facturada',
        });
      }
      await logCollection(tx, {
        organizationId: user.organizationId, entityType: 'INVOICE', entityId: invoice.id, action: 'INVOICE_REGISTERED', actorId: user.id,
        before: null, after: toJson(invoice),
      });
      return invoiceListRow(invoice, todayInSalvador());
    }, TX_OPTIONS);
  }

  private uniqueMessage(e: Prisma.PrismaClientKnownRequestError) {
    const target = JSON.stringify(e.meta?.target ?? '');
    if (target.includes('invoiceNumber')) return new ConflictException('Ya hay una factura vigente con ese número de control.');
    if (target.includes('generationCode')) return new ConflictException('Ya hay una factura vigente con ese código de generación.');
    if (target.includes('scheduleItemId')) return new ConflictException('Esa cuota ya tiene una factura vigente.');
    return new ConflictException('Ya existe un registro igual.');
  }

  // ── Consultar ──────────────────────────────────────────────────────────────
  async list(q: ListInvoicesQueryDto, user: AuthUser) {
    assertManager(user);
    await assertBillingModule(this.prisma, user.organizationId);
    const today = todayInSalvador();
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 50;
    const where: Prisma.ClientInvoiceWhereInput = {
      organizationId: user.organizationId,
      ...(q.clientId && { clientId: q.clientId }),
      ...(q.engagementId && { engagementId: q.engagementId }),
      ...(q.status && { status: q.status }),
      ...(q.open === 'true' && { status: { in: [ClientInvoiceStatus.OPEN, ClientInvoiceStatus.PARTIAL] } }),
      ...(q.overdue === 'true' && { status: { in: [ClientInvoiceStatus.OPEN, ClientInvoiceStatus.PARTIAL] }, dueDate: { lt: dateFromYmd(today) } }),
      ...((q.from || q.to) && { invoiceDate: { ...(q.from && { gte: dateFromYmd(q.from) }), ...(q.to && { lte: dateFromYmd(q.to) }) } }),
      ...(q.search && { OR: [{ invoiceNumber: { contains: q.search, mode: 'insensitive' } }, { description: { contains: q.search, mode: 'insensitive' } }] }),
    };
    const [rows, total] = await Promise.all([
      this.prisma.clientInvoice.findMany({ where, orderBy: [{ invoiceDate: 'desc' }, { createdAt: 'desc' }], skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.clientInvoice.count({ where }),
    ]);
    const clients = await this.prisma.client.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.clientId))] } }, select: { id: true, legalName: true, tradeName: true } });
    const engagements = await this.prisma.engagement.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.engagementId))] } }, select: { id: true, kind: true, title: true, fiscalYear: true } });
    const clientBy = new Map(clients.map((c) => [c.id, c]));
    const engBy = new Map(engagements.map((e) => [e.id, e]));
    return {
      page, pageSize, total,
      items: rows.map((r) => ({ ...invoiceListRow(r, today), client: clientBy.get(r.clientId) ?? null, engagement: engBy.get(r.engagementId) ?? null })),
    };
  }

  async get(id: string, user: AuthUser) {
    assertManager(user);
    await assertBillingModule(this.prisma, user.organizationId);
    const inv = await this.prisma.clientInvoice.findFirst({ where: { id, organizationId: user.organizationId } });
    if (!inv) throw new NotFoundException('Factura no encontrada');
    const [client, engagement, item, applications, withholdings, creditNotes, writeOffs] = await Promise.all([
      this.prisma.client.findUnique({ where: { id: inv.clientId }, select: { id: true, legalName: true, tradeName: true } }),
      this.prisma.engagement.findUnique({ where: { id: inv.engagementId }, select: { id: true, kind: true, title: true, fiscalYear: true, status: true } }),
      inv.scheduleItemId ? this.prisma.billingScheduleItem.findUnique({ where: { id: inv.scheduleItemId }, select: { id: true, label: true, sequence: true } }) : null,
      this.prisma.paymentApplication.findMany({ where: { invoiceId: id }, orderBy: { createdAt: 'asc' } }),
      this.prisma.invoiceWithholding.findMany({ where: { invoiceId: id }, orderBy: { createdAt: 'asc' } }),
      this.prisma.clientCreditNote.findMany({ where: { invoiceId: id }, orderBy: { createdAt: 'asc' } }),
      this.prisma.clientWriteOff.findMany({ where: { invoiceId: id }, orderBy: { createdAt: 'asc' } }),
    ]);
    const log = await this.prisma.collectionLog.findMany({
      where: {
        organizationId: user.organizationId,
        OR: [
          { entityType: 'INVOICE', entityId: id },
          { entityType: 'APPLICATION', entityId: { in: applications.map((a) => a.id) } },
          { entityType: 'WITHHOLDING', entityId: { in: withholdings.map((w) => w.id) } },
          { entityType: 'CREDIT_NOTE', entityId: { in: creditNotes.map((n) => n.id) } },
          { entityType: 'WRITE_OFF', entityId: { in: writeOffs.map((w) => w.id) } },
          ...(inv.scheduleItemId ? [{ entityType: 'SCHEDULE_ITEM', entityId: inv.scheduleItemId }] : []),
        ],
      },
      orderBy: { createdAt: 'desc' }, take: 100,
    });
    const payments = applications.length
      ? await this.prisma.clientPayment.findMany({ where: { id: { in: [...new Set(applications.map((a) => a.paymentId))] } }, select: { id: true, paymentDate: true, method: true, reference: true, status: true } })
      : [];
    const payBy = new Map(payments.map((p) => [p.id, p]));
    const today = todayInSalvador();
    const moves = applications.some((a) => !a.reversedAt) || withholdings.some((w) => !w.reversedAt) || toCents(inv.creditedAmount) > 0 || toCents(inv.writtenOffAmount) > 0;
    return {
      ...invoiceListRow(inv, today), client, engagement, scheduleItem: item,
      applications: applications.map((a) => ({
        id: a.id, paymentId: a.paymentId, amount: Number(a.amount), appliedOn: ymd(a.appliedOn), reversedAt: a.reversedAt, reverseReason: a.reverseReason,
        payment: payBy.get(a.paymentId) ? { ...payBy.get(a.paymentId)!, paymentDate: ymd(payBy.get(a.paymentId)!.paymentDate) } : null,
      })),
      withholdings: withholdings.map((w) => ({
        id: w.id, taxType: w.taxType, amount: Number(w.amount), appliedOn: ymd(w.appliedOn), certificateNumber: w.certificateNumber, paymentId: w.paymentId,
        reversedAt: w.reversedAt, reverseReason: w.reverseReason,
      })),
      creditNotes: creditNotes.map(creditNoteRow),
      writeOffs: writeOffs.map(writeOffRow),
      log: log.map((l) => ({ id: l.id, action: l.action, actorId: l.actorId, note: l.note, createdAt: l.createdAt })),
      permissions: {
        canEditAll: !moves && inv.status !== 'VOID',
        canEditBasics: inv.status !== 'VOID',
        canVoid: isDirection(user) && inv.status !== 'VOID',
        canReverseWithholding: isDirection(user),
        canCredit: isDirection(user) && (inv.status === 'OPEN' || inv.status === 'PARTIAL'),
        canWriteOff: isDirection(user) && (inv.status === 'OPEN' || inv.status === 'PARTIAL'),
        canVoidCreditNote: isDirection(user),
        canReverseWriteOff: isDirection(user),
      },
    };
  }

  // ── Editar ─────────────────────────────────────────────────────────────────
  async update(id: string, dto: UpdateInvoiceDto, user: AuthUser) {
    assertManager(user);
    await assertBillingModule(this.prisma, user.organizationId);
    return this.prisma.$transaction(async (tx) => {
      const probe = await tx.clientInvoice.findFirst({ where: { id, organizationId: user.organizationId }, select: { engagementId: true } });
      if (!probe) throw new NotFoundException('Factura no encontrada');
      await lockEngagement(tx, probe.engagementId);
      await lockInvoices(tx, [id]);
      const inv = await tx.clientInvoice.findFirst({ where: { id, organizationId: user.organizationId } });
      if (!inv) throw new NotFoundException('Factura no encontrada');
      if (inv.status === ClientInvoiceStatus.VOID) throw new ConflictException('Una factura anulada no se edita.');

      const [activeApps, activeWh] = await Promise.all([
        tx.paymentApplication.count({ where: { invoiceId: id, reversedAt: null } }),
        tx.invoiceWithholding.count({ where: { invoiceId: id, reversedAt: null } }),
      ]);
      const moves = activeApps > 0 || activeWh > 0 || toCents(inv.paidAmount) + toCents(inv.creditedAmount) + toCents(inv.writtenOffAmount) > 0;
      const touchesCore = dto.invoiceNumber !== undefined || dto.generationCode !== undefined || dto.documentType !== undefined || dto.netAmount !== undefined || dto.taxAmount !== undefined;
      if (moves && touchesCore) {
        throw new ConflictException('La factura ya tiene cobros, retenciones, notas de crédito o castigos: solo se pueden editar las fechas y la descripción. Corrige los movimientos con sus propias reversiones.');
      }

      const data: Prisma.ClientInvoiceUpdateInput = {};
      if (dto.invoiceNumber !== undefined || dto.generationCode !== undefined || dto.documentType !== undefined) {
        const ids = normalizeDteIdentifiers({
          invoiceNumber: dto.invoiceNumber ?? inv.invoiceNumber,
          generationCode: dto.generationCode !== undefined ? dto.generationCode : inv.generationCode,
          documentType: dto.documentType ?? inv.documentType,
        });
        data.invoiceNumber = ids.invoiceNumber;
        data.generationCode = ids.generationCode;
        if (dto.documentType !== undefined) data.documentType = dto.documentType;
      }
      const invoiceDate = dto.invoiceDate ? assertValidYmd(dto.invoiceDate, 'La fecha de la factura') : ymd(inv.invoiceDate);
      if (dto.invoiceDate) {
        // La factura no puede quedar fechada después de su primer cobro, retención, nota o castigo: el pasado se reconstruye con esas fechas.
        const first = await firstMovementDate(tx, id);
        if (first && invoiceDate > first) throw new ConflictException(`La fecha de la factura no puede ser posterior a su primer movimiento (${first}).`);
      }
      const dueDate = dto.dueDate ? assertValidYmd(dto.dueDate, 'La fecha de vencimiento') : ymd(inv.dueDate);
      if (invoiceDate > todayInSalvador()) throw new BadRequestException('La fecha de la factura no puede ser futura.');
      if (dueDate < invoiceDate) throw new BadRequestException('El vencimiento no puede ser anterior a la fecha de la factura.');
      if (dto.invoiceDate) data.invoiceDate = dateFromYmd(invoiceDate);
      if (dto.dueDate) data.dueDate = dateFromYmd(dueDate);
      if (dto.description !== undefined) data.description = dto.description.trim() || null;

      if (dto.netAmount !== undefined || dto.taxAmount !== undefined) {
        const netCents = dto.netAmount !== undefined ? parseMoneyInput(dto.netAmount, 'El monto neto') : toCents(inv.netAmount);
        const taxCents = dto.taxAmount !== undefined ? parseNonNegativeMoneyInput(dto.taxAmount, 'El IVA') : toCents(inv.taxAmount);
        const fee = await tx.engagementFee.findUnique({ where: { engagementId: inv.engagementId } });
        if (fee?.feeType === FeeType.FIXED && fee.totalAmount) {
          const c = await computeCommitments(tx, inv.engagementId, fee.totalAmount);
          const after = c.invoicedNetCents - toCents(inv.netAmount) + netCents + c.plannedCents;
          if (after > (c.feeTotalCents as number)) {
            throw new UnprocessableEntityException('Con ese monto la facturación supera el honorario del encargo. Si el alcance creció, registra primero una adenda.');
          }
        }
        data.netAmount = fromCents(netCents);
        data.taxAmount = fromCents(taxCents);
        data.totalAmount = fromCents(netCents + taxCents);
      }
      if (Object.keys(data).length === 0) return invoiceListRow(inv, todayInSalvador());

      try {
        const updated = await tx.clientInvoice.update({ where: { id }, data });
        await logCollection(tx, { organizationId: user.organizationId, entityType: 'INVOICE', entityId: id, action: 'INVOICE_UPDATED', actorId: user.id, before: toJson(inv), after: toJson(updated) });
        return invoiceListRow(updated, todayInSalvador());
      } catch (e) {
        if (isUniqueViolation(e)) throw this.uniqueMessage(e);
        throw e;
      }
    }, TX_OPTIONS);
  }

  // ── Anular ─────────────────────────────────────────────────────────────────
  async void(id: string, dto: ReasonDto, user: AuthUser) {
    assertDirection(user);
    await assertBillingModule(this.prisma, user.organizationId);
    const reason = assertReason(dto.reason, 'El motivo de la anulación');
    return this.prisma.$transaction(async (tx) => {
      const probe = await tx.clientInvoice.findFirst({ where: { id, organizationId: user.organizationId }, select: { engagementId: true } });
      if (!probe) throw new NotFoundException('Factura no encontrada');
      await lockEngagement(tx, probe.engagementId);
      await lockInvoices(tx, [id]);
      const inv = await tx.clientInvoice.findFirst({ where: { id, organizationId: user.organizationId } });
      if (!inv) throw new NotFoundException('Factura no encontrada');
      if (inv.status === ClientInvoiceStatus.VOID) throw new ConflictException('La factura ya está anulada.');

      const [apps, whs] = await Promise.all([
        tx.paymentApplication.count({ where: { invoiceId: id, reversedAt: null } }),
        tx.invoiceWithholding.findMany({ where: { invoiceId: id, reversedAt: null } }),
      ]);
      if (apps > 0 || toCents(inv.paidAmount) > 0) throw new ConflictException('La factura tiene cobros aplicados: quita primero esas aplicaciones.');
      if (toCents(inv.creditedAmount) > 0) throw new ConflictException('La factura tiene notas de crédito vigentes: anúlalas primero.');
      if (toCents(inv.writtenOffAmount) > 0) throw new ConflictException('La factura tiene castigos vigentes: reviértelos primero.');
      if (whs.some((w) => w.paymentId)) throw new ConflictException('La factura tiene retenciones practicadas en un pago: revierte o anula ese pago primero.');

      // Las retenciones que solo se anotaron en la factura (las del DTE o las que llegaron después) se revierten con ella.
      const now = new Date();
      for (const w of whs) {
        const r = await tx.invoiceWithholding.updateMany({
          where: { id: w.id, reversedAt: null }, data: { reversedAt: now, reversedById: user.id, reverseReason: 'Anulación de la factura' },
        });
        if (r.count !== 1) throw new ConflictException('Una retención cambió mientras se anulaba la factura; vuelve a intentarlo.');
        await logCollection(tx, { organizationId: user.organizationId, entityType: 'WITHHOLDING', entityId: w.id, action: 'WITHHOLDING_REVERSED', actorId: user.id, before: toJson(w), after: null, note: 'Anulación de la factura' });
      }
      const res = await tx.clientInvoice.updateMany({
        where: { id, status: inv.status, paidAmount: 0, creditedAmount: 0, writtenOffAmount: 0 },
        data: { status: ClientInvoiceStatus.VOID, withheldAmount: 0, voidedAt: now, voidedById: user.id, voidReason: reason },
      });
      if (res.count !== 1) throw new ConflictException('La factura cambió mientras se anulaba; vuelve a intentarlo.');
      if (inv.scheduleItemId) await this.releaseScheduleItem(tx, inv, user);
      await logCollection(tx, { organizationId: user.organizationId, entityType: 'INVOICE', entityId: id, action: 'INVOICE_VOIDED', actorId: user.id, before: toJson(inv), after: null, note: reason });
      const after = await tx.clientInvoice.findUniqueOrThrow({ where: { id } });
      return invoiceListRow(after, todayInSalvador());
    }, TX_OPTIONS);
  }

  /**
   * La cuota de una factura anulada vuelve a quedar programada, pero solo por lo que cabe: si la factura era por menos que la
   * cuota y el resto ya se reprogramó, devolverla entera comprometería más que el honorario. Entonces vuelve con el monto que
   * cabe, o se cancela si no cabe nada. Se llama con el candado del encargo y con la factura ya marcada como anulada.
   */
  private async releaseScheduleItem(tx: Db, inv: Prisma.ClientInvoiceGetPayload<object>, user: AuthUser) {
    const item = await tx.billingScheduleItem.findUnique({ where: { id: inv.scheduleItemId as string } });
    if (!item || item.status !== ScheduleItemStatus.INVOICED) return;
    let status: ScheduleItemStatus = ScheduleItemStatus.PLANNED;
    let amountCents = toCents(item.amount);
    const fee = await tx.engagementFee.findUnique({ where: { engagementId: inv.engagementId } });
    if (fee?.feeType === FeeType.FIXED && fee.totalAmount) {
      const c = await computeCommitments(tx, inv.engagementId, fee.totalAmount);
      const room = (c.feeTotalCents as number) - c.invoicedNetCents - c.plannedCents;
      if (room < amountCents) {
        if (room > 0) amountCents = room;
        else status = ScheduleItemStatus.CANCELLED;
      }
    }
    const res = await tx.billingScheduleItem.updateMany({
      where: { id: item.id, status: ScheduleItemStatus.INVOICED }, data: { status, amount: fromCents(amountCents) },
    });
    if (res.count !== 1) throw new ConflictException('La cuota cambió mientras se anulaba la factura; vuelve a intentarlo.');
    await logCollection(tx, {
      organizationId: user.organizationId, entityType: 'SCHEDULE_ITEM', entityId: item.id, action: 'SCHEDULE_ITEM_UPDATED', actorId: user.id,
      before: { status: 'INVOICED', amount: item.amount.toString() }, after: { status, amount: fromCents(amountCents).toString() },
      note: amountCents === toCents(item.amount) && status === ScheduleItemStatus.PLANNED
        ? 'Factura anulada: la cuota vuelve a quedar programada'
        : 'Factura anulada: la cuota vuelve con menos monto (o se cancela) porque el honorario ya está comprometido',
    });
  }

  // ── Retenciones ────────────────────────────────────────────────────────────
  async addWithholding(invoiceId: string, dto: AddWithholdingDto, user: AuthUser) {
    assertManager(user);
    await assertBillingModule(this.prisma, user.organizationId);
    const cents = parseMoneyInput(dto.amount, 'La retención');
    const appliedOn = dto.appliedOn ? assertValidYmd(dto.appliedOn, 'La fecha de la retención') : todayInSalvador();
    if (appliedOn > todayInSalvador()) throw new BadRequestException('La fecha de la retención no puede ser futura.');
    return this.prisma.$transaction(async (tx) => {
      await lockInvoices(tx, [invoiceId]);
      const inv = await tx.clientInvoice.findFirst({ where: { id: invoiceId, organizationId: user.organizationId } });
      if (!inv) throw new NotFoundException('Factura no encontrada');
      if (appliedOn < ymd(inv.invoiceDate)) throw new BadRequestException('La retención no puede ser anterior a la factura.');
      assertWithinBalance({ invoiceNumber: inv.invoiceNumber, balanceCents: balanceCents(moneyOf(inv)), moneyCents: 0, withholdingCents: cents });
      await assertNoNegativePast(tx, inv, [{ invoiceId, kind: 'WITHHOLDING', cents, effectiveOn: appliedOn, undoneOn: null }]);
      await applyInvoiceDelta(tx, inv, { withheldCents: cents });
      const row = await tx.invoiceWithholding.create({
        data: {
          organizationId: user.organizationId, clientId: inv.clientId, invoiceId, paymentId: null, taxType: dto.taxType, amount: fromCents(cents),
          appliedOn: dateFromYmd(appliedOn), certificateNumber: dto.certificateNumber?.trim() || null, createdById: user.id,
        },
      });
      await logCollection(tx, { organizationId: user.organizationId, entityType: 'WITHHOLDING', entityId: row.id, action: 'WITHHOLDING_ADDED', actorId: user.id, before: null, after: toJson(row) });
      return this.withholdingRow(row);
    }, TX_OPTIONS);
  }

  async reverseWithholding(id: string, dto: ReasonDto, user: AuthUser) {
    assertDirection(user);
    await assertBillingModule(this.prisma, user.organizationId);
    const reason = assertReason(dto.reason, 'El motivo de la reversión');
    return this.prisma.$transaction(async (tx) => {
      const probe = await tx.invoiceWithholding.findFirst({ where: { id, organizationId: user.organizationId }, select: { invoiceId: true, paymentId: true } });
      if (!probe) throw new NotFoundException('Retención no encontrada');
      if (probe.paymentId) await lockPayment(tx, probe.paymentId); // orden de candados: cobro antes que facturas
      await lockInvoices(tx, [probe.invoiceId]);
      const row = await tx.invoiceWithholding.findFirst({ where: { id, organizationId: user.organizationId } });
      if (!row) throw new NotFoundException('Retención no encontrada');
      if (row.reversedAt) throw new ConflictException('Esa retención ya fue revertida.');
      const inv = await tx.clientInvoice.findFirstOrThrow({ where: { id: row.invoiceId } });
      const claim = await tx.invoiceWithholding.updateMany({
        where: { id, reversedAt: null }, data: { reversedAt: new Date(), reversedById: user.id, reverseReason: reason },
      });
      if (claim.count !== 1) throw new ConflictException('La retención cambió mientras se revertía; vuelve a intentarlo.');
      await applyInvoiceDelta(tx, inv, { withheldCents: -toCents(row.amount) });
      await logCollection(tx, { organizationId: user.organizationId, entityType: 'WITHHOLDING', entityId: id, action: 'WITHHOLDING_REVERSED', actorId: user.id, before: toJson(row), after: null, note: reason });
      return { reversed: true };
    }, TX_OPTIONS);
  }

  private withholdingRow(w: Prisma.InvoiceWithholdingGetPayload<object>) {
    return {
      id: w.id, invoiceId: w.invoiceId, paymentId: w.paymentId, clientId: w.clientId, taxType: w.taxType as WithholdingTaxType,
      amount: Number(w.amount), appliedOn: ymd(w.appliedOn), certificateNumber: w.certificateNumber, reversedAt: w.reversedAt, reverseReason: w.reverseReason,
    };
  }

  async listWithholdings(q: ListWithholdingsQueryDto, user: AuthUser) {
    assertManager(user);
    await assertBillingModule(this.prisma, user.organizationId);
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 200;
    const where: Prisma.InvoiceWithholdingWhereInput = {
      organizationId: user.organizationId,
      ...(q.clientId && { clientId: q.clientId }),
      ...(q.invoiceId && { invoiceId: q.invoiceId }),
      ...(q.taxType && { taxType: q.taxType }),
      ...(q.includeReversed === 'true' ? {} : { reversedAt: null }),
      ...((q.from || q.to) && { appliedOn: { ...(q.from && { gte: dateFromYmd(q.from) }), ...(q.to && { lte: dateFromYmd(q.to) }) } }),
    };
    const [rows, total, sum] = await Promise.all([
      this.prisma.invoiceWithholding.findMany({ where, orderBy: [{ appliedOn: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }], skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.invoiceWithholding.count({ where }),
      this.prisma.invoiceWithholding.aggregate({ where, _sum: { amount: true } }),
    ]);
    const invoices = await this.prisma.clientInvoice.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.invoiceId))] } }, select: { id: true, invoiceNumber: true } });
    const numBy = new Map(invoices.map((i) => [i.id, i.invoiceNumber]));
    return {
      page, pageSize, total, totalAmount: sum._sum.amount ? Number(sum._sum.amount) : 0,
      items: rows.map((w) => ({ ...this.withholdingRow(w), invoiceNumber: numBy.get(w.invoiceId) ?? null })),
    };
  }
}

export type { WithholdingInputDto, LedgerInvoice };
