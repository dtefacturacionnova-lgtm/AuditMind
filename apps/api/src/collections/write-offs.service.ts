import { BadRequestException, ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { ClientInvoiceStatus, Prisma, WriteOffStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/jwt.strategy';
import {
  TX_OPTIONS, assertBillingModule, assertDirection, assertManager, assertReason, dateFromYmd, lockInvoices, logCollection, todayInSalvador, toJson, ymd,
} from './collections.common';
import { balanceCents } from './balance.util';
import { formatMoney, fromCents, parseMoneyInput, toCents } from './money.util';
import { assertValidYmd } from './schedule.util';
import { writeOffRow } from './collection-rows';
import { applyInvoiceDelta, moneyOf } from './invoice-ledger';
import { ListWriteOffsQueryDto, RegisterWriteOffDto } from './dto/collections-3d.dto';
import { ReasonDto } from './dto/collections.dto';

/**
 * Castigo de incobrables — docs/cobros-honorarios-diseno.md §4.6. Solo la dirección castiga y reversa.
 * Es un castigo PARCIAL de verdad: baja el saldo de la factura por el monto castigado y lo demás sigue vivo en la antigüedad. No toca lo
 * cobrado. Es reversible. Orden de candados: la factura (no cambia lo facturado del encargo, así que no pide el candado del encargo).
 */
@Injectable()
export class WriteOffsService {
  constructor(private readonly prisma: PrismaService) {}

  async register(invoiceId: string, dto: RegisterWriteOffDto, user: AuthUser) {
    assertDirection(user);
    await assertBillingModule(this.prisma, user.organizationId);
    const cents = parseMoneyInput(dto.amount, 'El monto del castigo');
    const writtenOffOn = dto.writtenOffOn ? assertValidYmd(dto.writtenOffOn, 'La fecha del castigo') : todayInSalvador();
    if (writtenOffOn > todayInSalvador()) throw new BadRequestException('La fecha del castigo no puede ser futura.');
    const reason = assertReason(dto.reason, 'El motivo del castigo');

    return this.prisma.$transaction(async (tx) => {
      await lockInvoices(tx, [invoiceId]);
      const inv = await tx.clientInvoice.findFirst({ where: { id: invoiceId, organizationId: user.organizationId } });
      if (!inv) throw new NotFoundException('Factura no encontrada');
      if (inv.status !== ClientInvoiceStatus.OPEN && inv.status !== ClientInvoiceStatus.PARTIAL) {
        throw new ConflictException(`La factura ${inv.invoiceNumber} está ${inv.status === 'SETTLED' ? 'saldada' : 'anulada'}: solo se castiga una factura con saldo pendiente.`);
      }
      if (writtenOffOn < ymd(inv.invoiceDate)) throw new BadRequestException('El castigo no puede ser anterior a la factura.');
      const balance = balanceCents(moneyOf(inv));
      if (cents > balance) {
        throw new UnprocessableEntityException(`El castigo (${formatMoney(cents)}) supera el saldo de la factura ${inv.invoiceNumber} (${formatMoney(balance)}).`);
      }
      await applyInvoiceDelta(tx, inv, { writtenOffCents: cents });
      const row = await tx.clientWriteOff.create({
        data: { organizationId: user.organizationId, clientId: inv.clientId, invoiceId, amount: fromCents(cents), writtenOffOn: dateFromYmd(writtenOffOn), reason, createdById: user.id },
      });
      await logCollection(tx, { organizationId: user.organizationId, entityType: 'WRITE_OFF', entityId: row.id, action: 'WRITE_OFF_REGISTERED', actorId: user.id, before: null, after: toJson(row) });
      return writeOffRow(row);
    }, TX_OPTIONS);
  }

  async reverse(id: string, dto: ReasonDto, user: AuthUser) {
    assertDirection(user);
    await assertBillingModule(this.prisma, user.organizationId);
    const reason = assertReason(dto.reason, 'El motivo de la reversión');
    return this.prisma.$transaction(async (tx) => {
      const probe = await tx.clientWriteOff.findFirst({ where: { id, organizationId: user.organizationId }, select: { invoiceId: true } });
      if (!probe) throw new NotFoundException('Castigo no encontrado');
      await lockInvoices(tx, [probe.invoiceId]);
      const row = await tx.clientWriteOff.findFirst({ where: { id, organizationId: user.organizationId } });
      if (!row) throw new NotFoundException('Castigo no encontrado');
      if (row.status === WriteOffStatus.REVERSED) throw new ConflictException('Ese castigo ya fue revertido.');
      const inv = await tx.clientInvoice.findFirstOrThrow({ where: { id: row.invoiceId } });
      const claim = await tx.clientWriteOff.updateMany({
        where: { id, status: WriteOffStatus.ACTIVE }, data: { status: WriteOffStatus.REVERSED, reversedAt: new Date(), reversedById: user.id, reverseReason: reason },
      });
      if (claim.count !== 1) throw new ConflictException('El castigo cambió mientras se revertía; vuelve a intentarlo.');
      await applyInvoiceDelta(tx, inv, { writtenOffCents: -toCents(row.amount) });
      await logCollection(tx, { organizationId: user.organizationId, entityType: 'WRITE_OFF', entityId: id, action: 'WRITE_OFF_REVERSED', actorId: user.id, before: toJson(row), after: null, note: reason });
      return writeOffRow(await tx.clientWriteOff.findUniqueOrThrow({ where: { id } }));
    }, TX_OPTIONS);
  }

  async list(q: ListWriteOffsQueryDto, user: AuthUser) {
    assertManager(user);
    await assertBillingModule(this.prisma, user.organizationId);
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 100;
    const where: Prisma.ClientWriteOffWhereInput = {
      organizationId: user.organizationId,
      ...(q.clientId && { clientId: q.clientId }), ...(q.invoiceId && { invoiceId: q.invoiceId }), ...(q.status && { status: q.status }),
    };
    const [rows, total, sum] = await Promise.all([
      this.prisma.clientWriteOff.findMany({ where, orderBy: [{ writtenOffOn: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }], skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.clientWriteOff.count({ where }),
      this.prisma.clientWriteOff.aggregate({ where: { ...where, status: WriteOffStatus.ACTIVE }, _sum: { amount: true } }),
    ]);
    const invoices = await this.prisma.clientInvoice.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.invoiceId))] } }, select: { id: true, invoiceNumber: true } });
    const numBy = new Map(invoices.map((i) => [i.id, i.invoiceNumber]));
    return {
      page, pageSize, total, activeTotal: sum._sum.amount ? Number(sum._sum.amount) : 0,
      items: rows.map((w) => ({ ...writeOffRow(w), invoiceNumber: numBy.get(w.invoiceId) ?? null })),
    };
  }
}
