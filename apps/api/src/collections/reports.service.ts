import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ClientPaymentStatus, CreditNoteStatus, Prisma, WriteOffStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/jwt.strategy';
import { assertBillingModule, assertManager, todayInSalvador, ymd } from './collections.common';
import { toCents } from './money.util';
import { assertValidYmd } from './schedule.util';
import {
  CutoffInvoice, CutoffMovement, StatementEvent, agingAt, balanceAt, buildStatement, movementActiveAt, salvadorDay,
} from './cutoff.util';
import { AgingQueryDto, StatementQueryDto } from './dto/collections-3d.dto';

type InvoiceRow = Prisma.ClientInvoiceGetPayload<object>;

/** Facturas y movimientos de una organización (o de un cliente) en el formato que usa la reconstrucción a una fecha de corte. */
async function loadLedger(prisma: PrismaService, organizationId: string, asOf: string, clientId?: string) {
  const where = { organizationId, ...(clientId ? { clientId } : {}) };
  const invoiceRows: InvoiceRow[] = await prisma.clientInvoice.findMany({ where: { ...where, invoiceDate: { lte: new Date(`${asOf}T00:00:00.000Z`) } } });
  const ids = invoiceRows.map((i) => i.id);
  const [apps, whs, notes, offs] = ids.length
    ? await Promise.all([
        prisma.paymentApplication.findMany({ where: { invoiceId: { in: ids } } }),
        prisma.invoiceWithholding.findMany({ where: { invoiceId: { in: ids } } }),
        prisma.clientCreditNote.findMany({ where: { invoiceId: { in: ids } } }),
        prisma.clientWriteOff.findMany({ where: { invoiceId: { in: ids } } }),
      ])
    : [[], [], [], []];

  const invoices: CutoffInvoice[] = invoiceRows.map((i) => ({
    id: i.id, clientId: i.clientId, invoiceNumber: i.invoiceNumber, invoiceDate: ymd(i.invoiceDate), dueDate: ymd(i.dueDate),
    totalCents: toCents(i.totalAmount), voidedOn: i.status === 'VOID' && i.voidedAt ? salvadorDay(i.voidedAt) : null,
  }));
  const moves: CutoffMovement[] = [
    ...apps.map((a): CutoffMovement => ({ invoiceId: a.invoiceId, kind: 'APPLICATION', cents: toCents(a.amount), effectiveOn: ymd(a.appliedOn), undoneOn: a.reversedAt ? salvadorDay(a.reversedAt) : null })),
    ...whs.map((w): CutoffMovement => ({ invoiceId: w.invoiceId, kind: 'WITHHOLDING', cents: toCents(w.amount), effectiveOn: ymd(w.appliedOn), undoneOn: w.reversedAt ? salvadorDay(w.reversedAt) : null })),
    ...notes.map((n): CutoffMovement => ({ invoiceId: n.invoiceId, kind: 'CREDIT_NOTE', cents: toCents(n.totalAmount), effectiveOn: ymd(n.issueDate), undoneOn: n.status === CreditNoteStatus.VOID && n.voidedAt ? salvadorDay(n.voidedAt) : null })),
    ...offs.map((w): CutoffMovement => ({ invoiceId: w.invoiceId, kind: 'WRITE_OFF', cents: toCents(w.amount), effectiveOn: ymd(w.writtenOffOn), undoneOn: w.status === WriteOffStatus.REVERSED && w.reversedAt ? salvadorDay(w.reversedAt) : null })),
  ];
  return { invoiceRows, invoices, moves, apps, whs, notes, offs };
}

/** Saldo a favor al corte: lo recibido y no aplicado de los cobros que existían entonces. */
async function unappliedCreditByClient(prisma: PrismaService, organizationId: string, asOf: string, apps: Array<{ paymentId: string; amount: Prisma.Decimal; appliedOn: Date; reversedAt: Date | null }>, clientId?: string) {
  const payments = await prisma.clientPayment.findMany({ where: { organizationId, ...(clientId ? { clientId } : {}), paymentDate: { lte: new Date(`${asOf}T00:00:00.000Z`) } } });
  const appliedBy = new Map<string, number>();
  for (const a of apps) {
    const m: CutoffMovement = { invoiceId: a.paymentId, kind: 'APPLICATION', cents: toCents(a.amount), effectiveOn: ymd(a.appliedOn), undoneOn: a.reversedAt ? salvadorDay(a.reversedAt) : null };
    if (movementActiveAt(m, asOf)) appliedBy.set(a.paymentId, (appliedBy.get(a.paymentId) ?? 0) + m.cents);
  }
  const byClient = new Map<string, number>();
  for (const p of payments) {
    const voidedOn = p.status === ClientPaymentStatus.VOID && p.voidedAt ? salvadorDay(p.voidedAt) : null;
    if (voidedOn !== null && voidedOn <= asOf) continue; // anulado antes del corte: no existe
    const free = toCents(p.amount) - (appliedBy.get(p.id) ?? 0);
    if (free > 0) byClient.set(p.clientId, (byClient.get(p.clientId) ?? 0) + free);
  }
  return byClient;
}

function assertCutoff(raw: string | undefined, label = 'La fecha de corte'): string {
  const today = todayInSalvador();
  const asOf = raw ? assertValidYmd(raw, label) : today;
  if (asOf > today) throw new BadRequestException(`${label} no puede ser futura.`);
  return asOf;
}

/**
 * Reportes de cobranza (fase 3c): antigüedad de saldos y estado de cuenta, ambos RECONSTRUIBLES a una fecha de corte a partir de los
 * movimientos con fecha (una anulación o reversión posterior no reescribe el pasado). Los ve cualquier gerente.
 */
@Injectable()
export class CollectionReportsService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Antigüedad de saldos por cliente ───────────────────────────────────────
  async aging(q: AgingQueryDto, user: AuthUser) {
    assertManager(user);
    await assertBillingModule(this.prisma, user.organizationId);
    const asOf = assertCutoff(q.asOf);
    const { invoices, moves, apps } = await loadLedger(this.prisma, user.organizationId, asOf, q.clientId);
    const aging = agingAt(invoices, moves, asOf);
    const credit = await unappliedCreditByClient(this.prisma, user.organizationId, asOf, apps, q.clientId);
    const clientIds = [...new Set([...aging.clients.map((c) => c.clientId), ...credit.keys()])];
    const names = await this.prisma.client.findMany({ where: { id: { in: clientIds }, organizationId: user.organizationId }, select: { id: true, legalName: true, tradeName: true } });
    const nameBy = new Map(names.map((n) => [n.id, n]));
    const detail = q.detail === 'true';
    const cents = (n: number) => n / 100;
    const toRow = (totals: Record<string, number>) => Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, cents(v)]));
    return {
      asOf,
      buckets: toRow(aging.totals), total: cents(aging.totalCents),
      unappliedCredit: cents([...credit.values()].reduce((s, v) => s + v, 0)),
      // facturas cuyo saldo a esa fecha sale negativo (datos incoherentes): se avisan, no se esconden
      anomalies: aging.anomalies.map((a) => ({ invoiceId: a.invoiceId, invoiceNumber: a.invoiceNumber, balance: cents(a.balanceCents) })),
      clients: aging.clients.map((c) => ({
        clientId: c.clientId, client: nameBy.get(c.clientId) ?? null, buckets: toRow(c.totals), total: cents(c.totalCents),
        unappliedCredit: cents(credit.get(c.clientId) ?? 0), invoiceCount: c.invoices.length,
        ...(detail && { invoices: c.invoices.map((i) => ({ ...i, balance: cents(i.balanceCents), balanceCents: undefined })) }),
      })),
      // clientes sin saldo pero con saldo a favor: se listan aparte para no perderlos
      creditOnly: [...credit.entries()].filter(([id]) => !aging.clients.some((c) => c.clientId === id)).map(([id, v]) => ({ clientId: id, client: nameBy.get(id) ?? null, unappliedCredit: cents(v) })),
    };
  }

  // ── Estado de cuenta de un cliente ─────────────────────────────────────────
  async statement(clientId: string, q: StatementQueryDto, user: AuthUser) {
    assertManager(user);
    await assertBillingModule(this.prisma, user.organizationId);
    const client = await this.prisma.client.findFirst({ where: { id: clientId, organizationId: user.organizationId }, select: { id: true, legalName: true, tradeName: true, taxId: true } });
    if (!client) throw new NotFoundException('Cliente no encontrado');
    const asOf = assertCutoff(q.asOf);
    const from = q.from ? assertValidYmd(q.from, 'La fecha inicial') : null;
    if (from && from > asOf) throw new BadRequestException('La fecha inicial no puede ser posterior a la de corte.');

    const { invoiceRows, invoices, moves, apps, whs, notes, offs } = await loadLedger(this.prisma, user.organizationId, asOf, clientId);
    const numberOf = new Map(invoiceRows.map((i) => [i.id, i.invoiceNumber]));
    const payIds = [...new Set(apps.map((a) => a.paymentId))];
    const pays = payIds.length ? await this.prisma.clientPayment.findMany({ where: { id: { in: payIds } }, select: { id: true, method: true, reference: true } }) : [];
    const payBy = new Map(pays.map((p) => [p.id, p]));

    const events: StatementEvent[] = [];
    const push = (e: Omit<StatementEvent, 'debitCents' | 'creditCents'> & { debitCents?: number; creditCents?: number }) =>
      events.push({ debitCents: 0, creditCents: 0, ...e });
    for (const inv of invoiceRows) {
      const total = toCents(inv.totalAmount);
      push({ date: ymd(inv.invoiceDate), kind: 'INVOICE', order: 0, reference: inv.invoiceNumber, description: inv.description ? `Factura — ${inv.description}` : 'Factura', debitCents: total });
      if (inv.status === 'VOID' && inv.voidedAt) push({ date: salvadorDay(inv.voidedAt), kind: 'INVOICE_VOIDED', order: 9, reference: inv.invoiceNumber, description: 'Factura anulada', creditCents: total });
    }
    const undo = (kind: StatementEvent['kind'], order: number, ref: string, desc: string, cents: number, at: Date | null) => {
      if (at) push({ date: salvadorDay(at), kind, order, reference: ref, description: desc, debitCents: cents });
    };
    for (const a of apps) {
      const p = payBy.get(a.paymentId);
      const label = `Cobro${p ? ` (${p.method}${p.reference ? ` ${p.reference}` : ''})` : ''}`;
      push({ date: ymd(a.appliedOn), kind: 'APPLICATION', order: 3, reference: numberOf.get(a.invoiceId) ?? a.invoiceId, description: label, creditCents: toCents(a.amount) });
      undo('APPLICATION_REVERSED', 4, numberOf.get(a.invoiceId) ?? a.invoiceId, `${label} — aplicación quitada`, toCents(a.amount), a.reversedAt);
    }
    for (const w of whs) {
      const label = `Retención de ${w.taxType === 'IVA' ? 'IVA' : w.taxType === 'RENTA' ? 'renta' : 'otro impuesto'}${w.certificateNumber ? ` (${w.certificateNumber})` : ''}`;
      push({ date: ymd(w.appliedOn), kind: 'WITHHOLDING', order: 1, reference: numberOf.get(w.invoiceId) ?? w.invoiceId, description: label, creditCents: toCents(w.amount) });
      undo('WITHHOLDING_REVERSED', 2, numberOf.get(w.invoiceId) ?? w.invoiceId, `${label} — revertida`, toCents(w.amount), w.reversedAt);
    }
    for (const n of notes) {
      const total = toCents(n.totalAmount);
      push({ date: ymd(n.issueDate), kind: 'CREDIT_NOTE', order: 5, reference: n.creditNoteNumber, description: `Nota de crédito sobre ${numberOf.get(n.invoiceId) ?? ''}`.trim(), creditCents: total });
      if (n.status === CreditNoteStatus.VOID) undo('CREDIT_NOTE_VOIDED', 6, n.creditNoteNumber, 'Nota de crédito anulada', total, n.voidedAt);
    }
    for (const w of offs) {
      push({ date: ymd(w.writtenOffOn), kind: 'WRITE_OFF', order: 7, reference: numberOf.get(w.invoiceId) ?? w.invoiceId, description: 'Castigo por incobrable', creditCents: toCents(w.amount) });
      if (w.status === WriteOffStatus.REVERSED) undo('WRITE_OFF_REVERSED', 8, numberOf.get(w.invoiceId) ?? w.invoiceId, 'Castigo revertido', toCents(w.amount), w.reversedAt);
    }

    const built = buildStatement(events, { asOf, from });
    const credit = await unappliedCreditByClient(this.prisma, user.organizationId, asOf, apps, clientId);
    const aging = agingAt(invoices, moves, asOf);
    const own = aging.clients[0];
    const cents = (n: number) => n / 100;
    return {
      asOf, from, client,
      openingBalance: cents(built.openingCents), closingBalance: cents(built.closingCents),
      lines: built.lines.map((l) => ({
        date: l.date, kind: l.kind, reference: l.reference, description: l.description, debit: cents(l.debitCents), credit: cents(l.creditCents), balance: cents(l.balanceCents),
      })),
      unappliedCredit: cents(credit.get(clientId) ?? 0),
      // facturas con saldo al corte (la antigüedad del propio cliente)
      openInvoices: (own?.invoices ?? []).map((i) => ({ invoiceNumber: i.invoiceNumber, invoiceDate: i.invoiceDate, dueDate: i.dueDate, overdueDays: i.overdueDays, balance: cents(i.balanceCents), bucket: i.bucket })),
      buckets: Object.fromEntries(Object.entries(own?.totals ?? {}).map(([k, v]) => [k, cents(v as number)])),
      // control: el saldo corrido debe coincidir con la suma de saldos de las facturas al corte
      reconciles: built.closingCents === invoices.reduce((s, inv) => s + (balanceAt(inv, moves, asOf)?.balanceCents ?? 0), 0),
    };
  }
}
