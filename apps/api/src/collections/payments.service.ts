import { createHash } from 'crypto';
import { BadRequestException, ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { ClientInvoiceStatus, ClientPaymentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/jwt.strategy';
import {
  Db, TX_OPTIONS, assertBillingModule, assertDirection, assertManager, assertReason, dateFromYmd, isDirection, isUniqueViolation,
  lockInvoices, lockPayment, logCollection, todayInSalvador, toJson, ymd,
} from './collections.common';
import { balanceCents, isCollectable } from './balance.util';
import { fromCents, parseMoneyInput, toCents } from './money.util';
import { assertValidYmd } from './schedule.util';
import {
  ApplicationInput, allocateOldestFirst, assertWithinBalance, checkApplications, parseApplications,
} from './allocation.util';
import { LedgerDelta, applyInvoiceDelta, moneyOf } from './invoice-ledger';
import { ApplyPaymentDto, ListPaymentsQueryDto, PaymentWithholdingDto, ReasonDto, RegisterPaymentDto, UpdatePaymentDto } from './dto/collections.dto';

type PaymentRow = Prisma.ClientPaymentGetPayload<object>;
interface WithholdingInput { invoiceId: string; taxType: PaymentWithholdingDto['taxType']; cents: number; certificateNumber: string | null }

export function paymentRow(p: PaymentRow) {
  const unapplied = p.status === 'VOID' ? 0 : toCents(p.amount) - toCents(p.appliedAmount); // un cobro anulado no deja saldo a favor
  return {
    id: p.id, clientId: p.clientId, paymentDate: ymd(p.paymentDate), amount: Number(p.amount), appliedAmount: Number(p.appliedAmount),
    unappliedAmount: unapplied / 100, method: p.method, reference: p.reference, notes: p.notes, status: p.status,
    voidedAt: p.voidedAt, voidReason: p.voidReason, createdAt: p.createdAt,
  };
}

function parseWithholdings(raw: PaymentWithholdingDto[] | undefined): WithholdingInput[] {
  return (raw ?? []).map((w) => ({
    invoiceId: w.invoiceId, taxType: w.taxType, cents: parseMoneyInput(w.amount, 'La retención'), certificateNumber: w.certificateNumber?.trim() || null,
  }));
}

/** Huella del contenido pedido en un envío: dos envíos con el mismo identificador solo son «el mismo» si la huella coincide. */
export function requestFingerprint(x: {
  clientId: string; paymentDate: string; amountCents: number; method: string; reference: string | null; notes: string | null;
  autoAllocate: boolean; applications: ApplicationInput[]; withholdings: WithholdingInput[];
}): string {
  const apps = x.applications.map((a) => `${a.invoiceId}:${a.amountCents}`).sort();
  const whs = x.withholdings.map((w) => `${w.invoiceId}:${w.taxType}:${w.cents}:${w.certificateNumber ?? ''}`).sort();
  return createHash('sha256')
    .update(JSON.stringify([x.clientId, x.paymentDate, x.amountCents, x.method, x.reference, x.notes, x.autoAllocate, apps, whs]))
    .digest('hex');
}

@Injectable()
export class PaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Registrar ──────────────────────────────────────────────────────────────
  async register(dto: RegisterPaymentDto, user: AuthUser) {
    assertManager(user);
    await assertBillingModule(this.prisma, user.organizationId);

    const paymentDate = assertValidYmd(dto.paymentDate, 'La fecha del cobro');
    if (paymentDate > todayInSalvador()) throw new BadRequestException('La fecha del cobro no puede ser futura.');
    const amountCents = parseMoneyInput(dto.amount, 'El monto del cobro');
    const applications = parseApplications(dto.applications);
    const withholdings = parseWithholdings(dto.withholdings);
    if (dto.autoAllocate && applications.length > 0) throw new BadRequestException('Indica las aplicaciones o pide el reparto automático, no las dos cosas.');
    const reference = dto.reference?.trim() || null;
    const notes = dto.notes?.trim() || null;

    const fingerprint = requestFingerprint({
      clientId: dto.clientId, paymentDate, amountCents, method: dto.method, reference, notes, autoAllocate: !!dto.autoAllocate, applications, withholdings,
    });
    const existing = dto.clientRequestId ? await this.findByRequest(user.organizationId, dto.clientRequestId) : null;
    if (existing) return this.replayOrConflict(existing, fingerprint, user);

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const client = await tx.client.findFirst({ where: { id: dto.clientId, organizationId: user.organizationId }, select: { id: true } });
        if (!client) throw new NotFoundException('Cliente no encontrado');

        let payment = await tx.clientPayment.create({
          data: {
            organizationId: user.organizationId, clientId: dto.clientId, paymentDate: dateFromYmd(paymentDate), amount: fromCents(amountCents),
            method: dto.method, reference, notes, clientRequestId: dto.clientRequestId ?? null, createdById: user.id,
          },
        });
        await logCollection(tx, {
          organizationId: user.organizationId, entityType: 'PAYMENT', entityId: payment.id, action: 'PAYMENT_REGISTERED', actorId: user.id,
          before: null, after: toJson(payment), note: `fp:${fingerprint}`,
        });

        let apps = applications;
        if (dto.autoAllocate) {
          // Candidatas sin candado → se bloquean → se vuelven a leer con saldos vigentes → recién ahí se reparte.
          const candidateIds = (await tx.clientInvoice.findMany({
            where: { organizationId: user.organizationId, clientId: dto.clientId, status: { in: [ClientInvoiceStatus.OPEN, ClientInvoiceStatus.PARTIAL] } }, select: { id: true },
          })).map((r) => r.id);
          // Un solo bloqueo ordenado por id con las candidatas Y las facturas de las retenciones: dos bloqueos sueltos romperían el orden global.
          await lockInvoices(tx, [...candidateIds, ...withholdings.map((w) => w.invoiceId)]);
          const fresh = candidateIds.length
            ? await tx.clientInvoice.findMany({ where: { id: { in: candidateIds }, status: { in: [ClientInvoiceStatus.OPEN, ClientInvoiceStatus.PARTIAL] } } })
            : [];
          const whOf = new Map<string, number>();
          for (const w of withholdings) whOf.set(w.invoiceId, (whOf.get(w.invoiceId) ?? 0) + w.cents);
          apps = allocateOldestFirst(amountCents, fresh.map((i) => ({
            id: i.id, invoiceNumber: i.invoiceNumber, dueDate: ymd(i.dueDate), balanceCents: Math.max(0, balanceCents(moneyOf(i)) - (whOf.get(i.id) ?? 0)),
          }))).applications;
        }
        if (apps.length > 0 || withholdings.length > 0) {
          payment = await this.applyToInvoices(tx, payment, apps, withholdings, user, paymentDate);
        }
        return payment;
      }, TX_OPTIONS);
      return this.get(created.id, user);
    } catch (e) {
      // Dos envíos simultáneos con el mismo identificador: gana uno y el otro recibe el cobro ya creado.
      if (dto.clientRequestId && isUniqueViolation(e)) {
        const again = await this.findByRequest(user.organizationId, dto.clientRequestId);
        if (again) return this.replayOrConflict(again, fingerprint, user);
      }
      throw e;
    }
  }

  private findByRequest(organizationId: string, clientRequestId: string) {
    return this.prisma.clientPayment.findFirst({ where: { organizationId, clientRequestId } });
  }

  private async replayOrConflict(existing: PaymentRow, fingerprint: string, user: AuthUser) {
    const registered = await this.prisma.collectionLog.findFirst({
      where: { organizationId: user.organizationId, entityType: 'PAYMENT', entityId: existing.id, action: 'PAYMENT_REGISTERED' },
      orderBy: { createdAt: 'asc' }, select: { note: true },
    });
    const stored = registered?.note?.startsWith('fp:') ? registered.note.slice(3) : null;
    if (stored !== fingerprint) {
      throw new ConflictException(
        'Ese identificador de envío ya se registró con otro contenido (monto, aplicaciones o retenciones). ' +
        'Revisa el cobro que ya existe antes de volver a enviar: si lo corriges aquí, quedaría duplicado.',
      );
    }
    return { ...paymentRow(existing), replayed: true };
  }

  // ── Aplicar (compartido por registrar y aplicar) ───────────────────────────
  /**
   * Aplica dinero y retenciones de un cobro a facturas. Debe llamarse con la transacción abierta y el cobro bloqueado (o recién
   * creado en esta misma transacción). Bloquea las facturas, relee sus saldos y valida TODO antes de escribir: o se aplica todo o nada.
   */
  private async applyToInvoices(tx: Db, payment: PaymentRow, apps: ApplicationInput[], whs: WithholdingInput[], user: AuthUser, appliedOn: string): Promise<PaymentRow> {
    const invoiceIds = [...new Set([...apps.map((a) => a.invoiceId), ...whs.map((w) => w.invoiceId)])];
    if (invoiceIds.length === 0) return payment;
    await lockInvoices(tx, invoiceIds);
    const invoices = await tx.clientInvoice.findMany({ where: { id: { in: invoiceIds }, organizationId: user.organizationId } });
    const byId = new Map(invoices.map((i) => [i.id, i]));

    const unappliedCents = toCents(payment.amount) - toCents(payment.appliedAmount);
    const moneyTotal = checkApplications({
      unappliedCents, clientId: payment.clientId, applications: apps,
      invoices: invoices.map((i) => ({ id: i.id, invoiceNumber: i.invoiceNumber, clientId: i.clientId, status: i.status, balanceCents: balanceCents(moneyOf(i)) })),
    });
    for (const w of whs) {
      const inv = byId.get(w.invoiceId);
      if (!inv) throw new NotFoundException('Una de las facturas de las retenciones no existe en esta organización.');
      if (inv.clientId !== payment.clientId) throw new UnprocessableEntityException(`La factura ${inv.invoiceNumber} pertenece a otro cliente.`);
      if (!isCollectable(inv.status)) throw new ConflictException(`La factura ${inv.invoiceNumber} está en estado ${inv.status}: ya no admite retenciones.`);
    }

    const perInvoice = new Map<string, { money: number; wh: number }>();
    for (const a of apps) perInvoice.set(a.invoiceId, { money: a.amountCents, wh: 0 });
    for (const w of whs) {
      const cur = perInvoice.get(w.invoiceId) ?? { money: 0, wh: 0 };
      cur.wh += w.cents;
      perInvoice.set(w.invoiceId, cur);
    }
    for (const [invoiceId, v] of perInvoice) {
      const inv = byId.get(invoiceId)!;
      assertWithinBalance({ invoiceNumber: inv.invoiceNumber, balanceCents: balanceCents(moneyOf(inv)), moneyCents: v.money, withholdingCents: v.wh });
    }

    // ── escrituras ──
    for (const invoiceId of [...perInvoice.keys()].sort()) {
      const v = perInvoice.get(invoiceId)!;
      const delta: LedgerDelta = { paidCents: v.money, withheldCents: v.wh };
      await applyInvoiceDelta(tx, byId.get(invoiceId)!, delta);
    }
    for (const a of apps) {
      const row = await tx.paymentApplication.create({
        data: {
          organizationId: user.organizationId, clientId: payment.clientId, paymentId: payment.id, invoiceId: a.invoiceId,
          amount: fromCents(a.amountCents), appliedOn: dateFromYmd(appliedOn), createdById: user.id,
        },
      });
      await logCollection(tx, { organizationId: user.organizationId, entityType: 'APPLICATION', entityId: row.id, action: 'PAYMENT_APPLIED', actorId: user.id, before: null, after: toJson(row) });
    }
    for (const w of whs) {
      const row = await tx.invoiceWithholding.create({
        data: {
          organizationId: user.organizationId, clientId: payment.clientId, invoiceId: w.invoiceId, paymentId: payment.id, taxType: w.taxType,
          amount: fromCents(w.cents), appliedOn: dateFromYmd(appliedOn), certificateNumber: w.certificateNumber, createdById: user.id,
        },
      });
      await logCollection(tx, { organizationId: user.organizationId, entityType: 'WITHHOLDING', entityId: row.id, action: 'WITHHOLDING_ADDED', actorId: user.id, before: null, after: toJson(row), note: 'Retención practicada en el pago' });
    }
    if (moneyTotal > 0) {
      const res = await tx.clientPayment.updateMany({
        where: { id: payment.id, status: ClientPaymentStatus.ACTIVE, appliedAmount: payment.appliedAmount },
        data: { appliedAmount: fromCents(toCents(payment.appliedAmount) + moneyTotal) },
      });
      if (res.count !== 1) throw new ConflictException('El cobro cambió mientras se aplicaba; vuelve a intentarlo.');
    }
    return tx.clientPayment.findUniqueOrThrow({ where: { id: payment.id } });
  }

  async apply(paymentId: string, dto: ApplyPaymentDto, user: AuthUser) {
    assertManager(user);
    await assertBillingModule(this.prisma, user.organizationId);
    const apps = parseApplications(dto.applications);
    const whs = parseWithholdings(dto.withholdings);
    if (apps.length === 0 && whs.length === 0) throw new BadRequestException('Indica al menos una aplicación o una retención.');
    await this.prisma.$transaction(async (tx) => {
      const found = await lockPayment(tx, paymentId);
      const payment = found ? await tx.clientPayment.findFirst({ where: { id: paymentId, organizationId: user.organizationId } }) : null;
      if (!payment) throw new NotFoundException('Cobro no encontrado');
      if (payment.status !== ClientPaymentStatus.ACTIVE) throw new ConflictException('El cobro está anulado: no admite aplicaciones.');
      await this.applyToInvoices(tx, payment, apps, whs, user, todayInSalvador());
    }, TX_OPTIONS);
    return this.get(paymentId, user);
  }

  // ── Quitar una aplicación ──────────────────────────────────────────────────
  async unapply(paymentId: string, applicationId: string, dto: ReasonDto, user: AuthUser) {
    assertDirection(user);
    await assertBillingModule(this.prisma, user.organizationId);
    const reason = assertReason(dto.reason, 'El motivo');
    await this.prisma.$transaction(async (tx) => {
      const probe = await tx.paymentApplication.findFirst({ where: { id: applicationId, paymentId, organizationId: user.organizationId }, select: { invoiceId: true } });
      if (!probe) throw new NotFoundException('Aplicación no encontrada');
      await lockPayment(tx, paymentId);
      await lockInvoices(tx, [probe.invoiceId]);
      const app = await tx.paymentApplication.findFirst({ where: { id: applicationId, paymentId, organizationId: user.organizationId } });
      if (!app) throw new NotFoundException('Aplicación no encontrada');
      if (app.reversedAt) throw new ConflictException('Esa aplicación ya fue quitada.');
      const payment = await tx.clientPayment.findFirstOrThrow({ where: { id: paymentId } });
      const invoice = await tx.clientInvoice.findFirstOrThrow({ where: { id: app.invoiceId } });
      const claim = await tx.paymentApplication.updateMany({ where: { id: applicationId, reversedAt: null }, data: { reversedAt: new Date(), reversedById: user.id, reverseReason: reason } });
      if (claim.count !== 1) throw new ConflictException('La aplicación cambió mientras se quitaba; vuelve a intentarlo.');
      const cents = toCents(app.amount);
      await applyInvoiceDelta(tx, invoice, { paidCents: -cents });
      const res = await tx.clientPayment.updateMany({ where: { id: paymentId, appliedAmount: payment.appliedAmount }, data: { appliedAmount: fromCents(toCents(payment.appliedAmount) - cents) } });
      if (res.count !== 1) throw new ConflictException('El cobro cambió mientras se quitaba la aplicación; vuelve a intentarlo.');
      await logCollection(tx, { organizationId: user.organizationId, entityType: 'APPLICATION', entityId: applicationId, action: 'APPLICATION_REVERSED', actorId: user.id, before: toJson(app), after: null, note: reason });
    }, TX_OPTIONS);
    return this.get(paymentId, user);
  }

  // ── Anular el cobro ────────────────────────────────────────────────────────
  async void(paymentId: string, dto: ReasonDto, user: AuthUser) {
    assertDirection(user);
    await assertBillingModule(this.prisma, user.organizationId);
    const reason = assertReason(dto.reason, 'El motivo de la anulación');
    await this.prisma.$transaction(async (tx) => {
      const found = await lockPayment(tx, paymentId);
      const payment = found ? await tx.clientPayment.findFirst({ where: { id: paymentId, organizationId: user.organizationId } }) : null;
      if (!payment) throw new NotFoundException('Cobro no encontrado');
      if (payment.status === ClientPaymentStatus.VOID) throw new ConflictException('El cobro ya está anulado.');

      // Se leen las aplicaciones y retenciones vigentes DESPUÉS del candado del cobro.
      const [apps, whs] = await Promise.all([
        tx.paymentApplication.findMany({ where: { paymentId, reversedAt: null } }),
        tx.invoiceWithholding.findMany({ where: { paymentId, reversedAt: null } }),
      ]);
      const invoiceIds = [...new Set([...apps.map((a) => a.invoiceId), ...whs.map((w) => w.invoiceId)])];
      await lockInvoices(tx, invoiceIds);
      const now = new Date();
      for (const a of apps) {
        const r = await tx.paymentApplication.updateMany({ where: { id: a.id, reversedAt: null }, data: { reversedAt: now, reversedById: user.id, reverseReason: reason } });
        if (r.count !== 1) throw new ConflictException('Una aplicación cambió mientras se anulaba el cobro; vuelve a intentarlo.');
        await logCollection(tx, { organizationId: user.organizationId, entityType: 'APPLICATION', entityId: a.id, action: 'APPLICATION_REVERSED', actorId: user.id, before: toJson(a), after: null, note: reason });
      }
      for (const w of whs) {
        const r = await tx.invoiceWithholding.updateMany({ where: { id: w.id, reversedAt: null }, data: { reversedAt: now, reversedById: user.id, reverseReason: reason } });
        if (r.count !== 1) throw new ConflictException('Una retención cambió mientras se anulaba el cobro; vuelve a intentarlo.');
        await logCollection(tx, { organizationId: user.organizationId, entityType: 'WITHHOLDING', entityId: w.id, action: 'WITHHOLDING_REVERSED', actorId: user.id, before: toJson(w), after: null, note: reason });
      }
      // Un solo ajuste por factura: el efecto combinado de todas sus aplicaciones y retenciones.
      const byInvoice = new Map<string, LedgerDelta>();
      for (const a of apps) byInvoice.set(a.invoiceId, { ...(byInvoice.get(a.invoiceId) ?? {}), paidCents: (byInvoice.get(a.invoiceId)?.paidCents ?? 0) - toCents(a.amount) });
      for (const w of whs) byInvoice.set(w.invoiceId, { ...(byInvoice.get(w.invoiceId) ?? {}), withheldCents: (byInvoice.get(w.invoiceId)?.withheldCents ?? 0) - toCents(w.amount) });
      for (const invoiceId of [...byInvoice.keys()].sort()) {
        const inv = await tx.clientInvoice.findFirstOrThrow({ where: { id: invoiceId } });
        await applyInvoiceDelta(tx, inv, byInvoice.get(invoiceId)!);
      }
      const res = await tx.clientPayment.updateMany({
        where: { id: paymentId, status: ClientPaymentStatus.ACTIVE },
        data: { status: ClientPaymentStatus.VOID, appliedAmount: 0, voidedAt: now, voidedById: user.id, voidReason: reason },
      });
      if (res.count !== 1) throw new ConflictException('El cobro cambió mientras se anulaba; vuelve a intentarlo.');
      await logCollection(tx, { organizationId: user.organizationId, entityType: 'PAYMENT', entityId: paymentId, action: 'PAYMENT_VOIDED', actorId: user.id, before: toJson(payment), after: null, note: reason });
    }, TX_OPTIONS);
    return this.get(paymentId, user);
  }

  // ── Editar ─────────────────────────────────────────────────────────────────
  async update(paymentId: string, dto: UpdatePaymentDto, user: AuthUser) {
    assertManager(user);
    await assertBillingModule(this.prisma, user.organizationId);
    await this.prisma.$transaction(async (tx) => {
      const found = await lockPayment(tx, paymentId);
      const payment = found ? await tx.clientPayment.findFirst({ where: { id: paymentId, organizationId: user.organizationId } }) : null;
      if (!payment) throw new NotFoundException('Cobro no encontrado');
      if (payment.status !== ClientPaymentStatus.ACTIVE) throw new ConflictException('Un cobro anulado no se edita.');
      const data: Prisma.ClientPaymentUpdateInput = {};
      if (dto.paymentDate !== undefined) {
        const d = assertValidYmd(dto.paymentDate, 'La fecha del cobro');
        if (d > todayInSalvador()) throw new BadRequestException('La fecha del cobro no puede ser futura.');
        data.paymentDate = dateFromYmd(d);
      }
      if (dto.method !== undefined) data.method = dto.method;
      if (dto.reference !== undefined) data.reference = dto.reference.trim() || null;
      if (dto.notes !== undefined) data.notes = dto.notes.trim() || null;
      if (dto.amount !== undefined) {
        const cents = parseMoneyInput(dto.amount, 'El monto del cobro');
        const [apps, whs] = await Promise.all([
          tx.paymentApplication.count({ where: { paymentId, reversedAt: null } }),
          tx.invoiceWithholding.count({ where: { paymentId, reversedAt: null } }),
        ]);
        if (cents !== toCents(payment.amount) && (apps > 0 || whs > 0)) {
          throw new ConflictException('El cobro ya tiene aplicaciones o retenciones: quítalas antes de cambiar el monto.');
        }
        data.amount = fromCents(cents);
      }
      if (Object.keys(data).length === 0) return;
      const updated = await tx.clientPayment.update({ where: { id: paymentId }, data });
      await logCollection(tx, { organizationId: user.organizationId, entityType: 'PAYMENT', entityId: paymentId, action: 'PAYMENT_UPDATED', actorId: user.id, before: toJson(payment), after: toJson(updated) });
    }, TX_OPTIONS);
    return this.get(paymentId, user);
  }

  // ── Consultar ──────────────────────────────────────────────────────────────
  async list(q: ListPaymentsQueryDto, user: AuthUser) {
    assertManager(user);
    await assertBillingModule(this.prisma, user.organizationId);
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 50;
    let rows: PaymentRow[];
    let total: number;
    if (q.unapplied === 'true') {
      // «Con saldo a favor» compara dos columnas, que el filtro de Prisma no expresa: se resuelve en SQL (paginado y con total exacto).
      const conds: Prisma.Sql[] = [Prisma.sql`"organizationId" = ${user.organizationId}`, Prisma.sql`status = 'ACTIVE'`, Prisma.sql`amount > "appliedAmount"`];
      if (q.clientId) conds.push(Prisma.sql`"clientId" = ${q.clientId}`);
      if (q.from) conds.push(Prisma.sql`"paymentDate" >= ${dateFromYmd(q.from)}`);
      if (q.to) conds.push(Prisma.sql`"paymentDate" <= ${dateFromYmd(q.to)}`);
      const whereSql = Prisma.join(conds, ' AND ');
      const idRows = await this.prisma.$queryRaw<{ id: string }[]>(
        Prisma.sql`SELECT id FROM client_payments WHERE ${whereSql} ORDER BY "paymentDate" DESC, "createdAt" DESC, id LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
      );
      const [{ count }] = await this.prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`SELECT COUNT(*)::bigint AS count FROM client_payments WHERE ${whereSql}`);
      total = Number(count);
      const found = await this.prisma.clientPayment.findMany({ where: { id: { in: idRows.map((r) => r.id) } } });
      const byId = new Map(found.map((r) => [r.id, r]));
      rows = idRows.map((r) => byId.get(r.id)).filter((r): r is PaymentRow => !!r);
    } else {
      const where: Prisma.ClientPaymentWhereInput = {
        organizationId: user.organizationId,
        ...(q.clientId && { clientId: q.clientId }),
        ...(q.status && { status: q.status }),
        ...((q.from || q.to) && { paymentDate: { ...(q.from && { gte: dateFromYmd(q.from) }), ...(q.to && { lte: dateFromYmd(q.to) }) } }),
      };
      [rows, total] = await Promise.all([
        this.prisma.clientPayment.findMany({ where, orderBy: [{ paymentDate: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }], take: pageSize, skip: (page - 1) * pageSize }),
        this.prisma.clientPayment.count({ where }),
      ]);
    }
    const clients = await this.prisma.client.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.clientId))] } }, select: { id: true, legalName: true, tradeName: true } });
    const clientBy = new Map(clients.map((c) => [c.id, c]));
    return { page, pageSize, total, items: rows.map((r) => ({ ...paymentRow(r), client: clientBy.get(r.clientId) ?? null })) };
  }

  async get(id: string, user: AuthUser) {
    assertManager(user);
    await assertBillingModule(this.prisma, user.organizationId);
    const p = await this.prisma.clientPayment.findFirst({ where: { id, organizationId: user.organizationId } });
    if (!p) throw new NotFoundException('Cobro no encontrado');
    const [client, applications, withholdings] = await Promise.all([
      this.prisma.client.findUnique({ where: { id: p.clientId }, select: { id: true, legalName: true, tradeName: true } }),
      this.prisma.paymentApplication.findMany({ where: { paymentId: id }, orderBy: { createdAt: 'asc' } }),
      this.prisma.invoiceWithholding.findMany({ where: { paymentId: id }, orderBy: { createdAt: 'asc' } }),
    ]);
    const log = await this.prisma.collectionLog.findMany({
      where: {
        organizationId: user.organizationId,
        OR: [
          { entityType: 'PAYMENT', entityId: id },
          { entityType: 'APPLICATION', entityId: { in: applications.map((a) => a.id) } },
          { entityType: 'WITHHOLDING', entityId: { in: withholdings.map((w) => w.id) } },
        ],
      },
      orderBy: { createdAt: 'desc' }, take: 100,
    });
    const invoiceIds = [...new Set([...applications.map((a) => a.invoiceId), ...withholdings.map((w) => w.invoiceId)])];
    const invoices = invoiceIds.length
      ? await this.prisma.clientInvoice.findMany({ where: { id: { in: invoiceIds } }, select: { id: true, invoiceNumber: true, status: true, totalAmount: true } })
      : [];
    const invBy = new Map(invoices.map((i) => [i.id, { id: i.id, invoiceNumber: i.invoiceNumber, status: i.status, totalAmount: Number(i.totalAmount) }]));
    return {
      ...paymentRow(p), client,
      applications: applications.map((a) => ({ id: a.id, invoiceId: a.invoiceId, invoice: invBy.get(a.invoiceId) ?? null, amount: Number(a.amount), appliedOn: ymd(a.appliedOn), reversedAt: a.reversedAt, reverseReason: a.reverseReason })),
      withholdings: withholdings.map((w) => ({ id: w.id, invoiceId: w.invoiceId, invoice: invBy.get(w.invoiceId) ?? null, taxType: w.taxType, amount: Number(w.amount), certificateNumber: w.certificateNumber, reversedAt: w.reversedAt, reverseReason: w.reverseReason })),
      log: log.map((l) => ({ id: l.id, action: l.action, actorId: l.actorId, note: l.note, createdAt: l.createdAt })),
      permissions: { canVoid: isDirection(user) && p.status === 'ACTIVE', canUnapply: isDirection(user) && p.status === 'ACTIVE' },
    };
  }
}
