import { BadRequestException, ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { ClientInvoiceStatus, CreditNoteStatus, FeeType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/jwt.strategy';
import {
  Db, TX_OPTIONS, assertBillingModule, assertDirection, assertManager, assertReason, dateFromYmd, isUniqueViolation, lockEngagement, lockInvoices,
  logCollection, todayInSalvador, toJson, ymd,
} from './collections.common';
import { balanceCents } from './balance.util';
import { formatMoney, fromCents, parseMoneyInput, parseNonNegativeMoneyInput, toCents } from './money.util';
import { assertValidYmd } from './schedule.util';
import { creditNoteRow } from './collection-rows';
import { applyInvoiceDelta, moneyOf } from './invoice-ledger';
import { computeCommitments } from './fees.service';
import { normalizeDteIdentifiers } from './invoices.service';
import { ListCreditNotesQueryDto, RegisterCreditNoteDto } from './dto/collections-3d.dto';
import { ReasonDto } from './dto/collections.dto';

/**
 * Notas de crédito (DTE 05) — docs/cobros-honorarios-diseno.md §4.5. Solo la dirección las registra y las anula.
 *
 * Efectos sobre la factura: sube su `creditedAmount` por el TOTAL de la nota (el saldo baja) y baja lo facturado NETO del encargo
 * (libera espacio del honorario). No reabre la cuota. Orden de candados: encargo → factura.
 */
@Injectable()
export class CreditNotesService {
  constructor(private readonly prisma: PrismaService) {}

  async register(invoiceId: string, dto: RegisterCreditNoteDto, user: AuthUser) {
    assertDirection(user);
    await assertBillingModule(this.prisma, user.organizationId);

    // Mismas reglas de identificadores que la factura: el número de control del DTE 05 va en mayúsculas y sin espacios.
    const { invoiceNumber: creditNoteNumber, generationCode } = normalizeDteIdentifiers({ invoiceNumber: dto.creditNoteNumber, generationCode: dto.generationCode, documentType: '05' });
    const issueDate = dto.issueDate ? assertValidYmd(dto.issueDate, 'La fecha de la nota de crédito') : todayInSalvador();
    if (issueDate > todayInSalvador()) throw new BadRequestException('La fecha de la nota de crédito no puede ser futura.');
    const netCents = parseMoneyInput(dto.netAmount, 'El monto neto');
    const taxCents = dto.taxAmount === undefined ? 0 : parseNonNegativeMoneyInput(dto.taxAmount, 'El IVA');
    const totalCents = netCents + taxCents;
    const reason = assertReason(dto.reason, 'El motivo de la nota de crédito');

    return this.prisma.$transaction(async (tx) => {
      const probe = await tx.clientInvoice.findFirst({ where: { id: invoiceId, organizationId: user.organizationId }, select: { engagementId: true } });
      if (!probe) throw new NotFoundException('Factura no encontrada');
      await lockEngagement(tx, probe.engagementId);
      await lockInvoices(tx, [invoiceId]);
      const inv = await tx.clientInvoice.findFirst({ where: { id: invoiceId, organizationId: user.organizationId } });
      if (!inv) throw new NotFoundException('Factura no encontrada');
      if (inv.status !== ClientInvoiceStatus.OPEN && inv.status !== ClientInvoiceStatus.PARTIAL) {
        throw new ConflictException(`La factura ${inv.invoiceNumber} está ${inv.status === 'SETTLED' ? 'saldada' : 'anulada'}: solo se acredita una factura con saldo pendiente.`);
      }
      if (issueDate < ymd(inv.invoiceDate)) throw new BadRequestException('La nota de crédito no puede ser anterior a la factura que acredita.');

      const balance = balanceCents(moneyOf(inv));
      if (totalCents > balance) {
        throw new UnprocessableEntityException(
          `La nota de crédito (${formatMoney(totalCents)} con IVA) supera el saldo de la factura ${inv.invoiceNumber} (${formatMoney(balance)}). ` +
          'Si el cliente ya pagó, quita primero la aplicación del cobro: queda como saldo a favor y luego se registra la nota.',
        );
      }
      const prior = await tx.clientCreditNote.aggregate({ where: { invoiceId, status: CreditNoteStatus.ACTIVE }, _sum: { netAmount: true } });
      const priorNet = prior._sum.netAmount ? toCents(prior._sum.netAmount) : 0;
      if (priorNet + netCents > toCents(inv.netAmount)) {
        throw new UnprocessableEntityException(
          `Las notas de crédito de la factura ${inv.invoiceNumber} acreditarían ${formatMoney(priorNet + netCents)} netos y la factura es por ${formatMoney(toCents(inv.netAmount))}.`,
        );
      }

      let note: Prisma.ClientCreditNoteGetPayload<object>;
      try {
        note = await tx.clientCreditNote.create({
          data: {
            organizationId: user.organizationId, clientId: inv.clientId, engagementId: inv.engagementId, invoiceId,
            creditNoteNumber, generationCode, issueDate: dateFromYmd(issueDate),
            netAmount: fromCents(netCents), taxAmount: fromCents(taxCents), totalAmount: fromCents(totalCents), reason, createdById: user.id,
          },
        });
      } catch (e) {
        if (isUniqueViolation(e)) {
          const target = JSON.stringify(e.meta?.target ?? '');
          throw new ConflictException(target.includes('generationCode')
            ? 'Ya hay una nota de crédito vigente con ese código de generación.'
            : 'Ya hay una nota de crédito vigente con ese número de control.');
        }
        throw e;
      }
      await applyInvoiceDelta(tx, inv, { creditedCents: totalCents });
      await logCollection(tx, { organizationId: user.organizationId, entityType: 'CREDIT_NOTE', entityId: note.id, action: 'CREDIT_NOTE_REGISTERED', actorId: user.id, before: null, after: toJson(note) });
      return creditNoteRow(note);
    }, TX_OPTIONS);
  }

  async void(id: string, dto: ReasonDto, user: AuthUser) {
    assertDirection(user);
    await assertBillingModule(this.prisma, user.organizationId);
    const reason = assertReason(dto.reason, 'El motivo de la anulación');
    return this.prisma.$transaction(async (tx) => {
      const probe = await tx.clientCreditNote.findFirst({ where: { id, organizationId: user.organizationId }, select: { engagementId: true, invoiceId: true } });
      if (!probe) throw new NotFoundException('Nota de crédito no encontrada');
      await lockEngagement(tx, probe.engagementId);
      await lockInvoices(tx, [probe.invoiceId]);
      const note = await tx.clientCreditNote.findFirst({ where: { id, organizationId: user.organizationId } });
      if (!note) throw new NotFoundException('Nota de crédito no encontrada');
      if (note.status === CreditNoteStatus.VOID) throw new ConflictException('La nota de crédito ya está anulada.');
      const inv = await tx.clientInvoice.findFirstOrThrow({ where: { id: note.invoiceId } });

      const claim = await tx.clientCreditNote.updateMany({
        where: { id, status: CreditNoteStatus.ACTIVE }, data: { status: CreditNoteStatus.VOID, voidedAt: new Date(), voidedById: user.id, voidReason: reason },
      });
      if (claim.count !== 1) throw new ConflictException('La nota de crédito cambió mientras se anulaba; vuelve a intentarlo.');

      // Anular la nota devuelve su neto a lo facturado: no puede dejar facturado + programado por encima del honorario.
      const fee = await tx.engagementFee.findUnique({ where: { engagementId: note.engagementId } });
      if (fee?.feeType === FeeType.FIXED && fee.totalAmount) {
        const c = await computeCommitments(tx, note.engagementId, fee.totalAmount);
        const over = c.invoicedNetCents + c.plannedCents - (c.feeTotalCents as number);
        if (over > 0) {
          throw new UnprocessableEntityException(
            `Anular esta nota de crédito dejaría lo facturado más lo programado ${formatMoney(over)} por encima del honorario. ` +
            'Reduce o cancela cuotas programadas del calendario y vuelve a intentarlo.',
          );
        }
      }
      await applyInvoiceDelta(tx, inv, { creditedCents: -toCents(note.totalAmount) });
      await logCollection(tx, { organizationId: user.organizationId, entityType: 'CREDIT_NOTE', entityId: id, action: 'CREDIT_NOTE_VOIDED', actorId: user.id, before: toJson(note), after: null, note: reason });
      return creditNoteRow(await tx.clientCreditNote.findUniqueOrThrow({ where: { id } }));
    }, TX_OPTIONS);
  }

  async list(q: ListCreditNotesQueryDto, user: AuthUser) {
    assertManager(user);
    await assertBillingModule(this.prisma, user.organizationId);
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 100;
    const where: Prisma.ClientCreditNoteWhereInput = {
      organizationId: user.organizationId,
      ...(q.clientId && { clientId: q.clientId }), ...(q.invoiceId && { invoiceId: q.invoiceId }),
      ...(q.engagementId && { engagementId: q.engagementId }), ...(q.status && { status: q.status }),
    };
    const [rows, total, sum] = await Promise.all([
      this.prisma.clientCreditNote.findMany({ where, orderBy: [{ issueDate: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }], skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.clientCreditNote.count({ where }),
      this.prisma.clientCreditNote.aggregate({ where: { ...where, status: CreditNoteStatus.ACTIVE }, _sum: { totalAmount: true } }),
    ]);
    const invoices = await this.prisma.clientInvoice.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.invoiceId))] } }, select: { id: true, invoiceNumber: true } });
    const numBy = new Map(invoices.map((i) => [i.id, i.invoiceNumber]));
    return {
      page, pageSize, total, activeTotal: sum._sum.totalAmount ? Number(sum._sum.totalAmount) : 0,
      items: rows.map((n) => ({ ...creditNoteRow(n), invoiceNumber: numBy.get(n.invoiceId) ?? null })),
    };
  }
}

export type { Db };
