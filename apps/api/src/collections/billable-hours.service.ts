import { BadRequestException, ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { FeeType, Prisma, EngagementStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/jwt.strategy';
import { loadCloseSettings } from '../timesheet/hours-close.util';
import { Db, assertBillingModule, assertManager, isUniqueViolation, ymd } from './collections.common';
import { fromCents, toCents } from './money.util';
import { HourLine, MAX_HOURS_PER_INVOICE, buildHourLine, monthOf, unitsToDecimal } from './billable-hours.util';
import { lockTimeEntryRows } from './invoiced-hours.guard';

/**
 * Horas por facturar de una consultoría por tiempo (Fase 4, docs/cobros-honorarios-diseno.md §15).
 * Una hora se factura si es del encargo, facturable, de un mes CERRADO, con tarifa pactada congelada > 0 y sin línea vigente.
 */

export interface BillableEntryRow { id: string; workDate: string; hours: number; amount: number; description: string | null; afterClose: boolean }
export interface BillableGroup { userId: string; userName: string; month: string; rate: number; hours: number; amount: number; entries: BillableEntryRow[] }
export type BlockedReason = 'NO_FEE' | 'NOT_TIME_BASED' | 'NO_AUDIT' | 'CANCELLED' | 'CLOSE_DISABLED';

const dollars = (cents: number) => cents / 100;
const round2 = (n: number) => Math.round(n * 100) / 100;
const asRateCents = (r: { toString(): string } | null | undefined): number | null => (r === null || r === undefined ? null : toCents(r.toString()));

interface EntryRow { id: string; userId: string; auditId: string | null; category: string; hours: number; workDate: Date; closedAt: Date | null; billRateSnapshot: Prisma.Decimal | null }

/** Valida y arma las líneas de una factura de horas. Se llama DENTRO de la transacción, con el candado del encargo ya tomado. */
export async function prepareHourLines(
  tx: Db, args: { organizationId: string; engagementId: string; auditId: string | null; timeEntryIds: string[] },
): Promise<HourLine[]> {
  const ids = [...new Set(args.timeEntryIds)];
  if (ids.length === 0) throw new BadRequestException('Indica las horas que se facturan.');
  if (ids.length > MAX_HOURS_PER_INVOICE) {
    throw new BadRequestException(`Una factura admite hasta ${MAX_HOURS_PER_INVOICE} horas; divide la selección en dos facturas.`);
  }
  if (!args.auditId) throw new ConflictException('El encargo todavía no tiene su auditoría: no tiene horas registradas.');

  // Las filas se bloquean y se leen ya bloqueadas: si el mes se reabrió o un ajuste las cambió mientras tanto, se ve el estado vigente.
  await lockTimeEntryRows(tx, args.organizationId, ids);
  const rows = await tx.$queryRaw<EntryRow[]>(Prisma.sql`
    SELECT id, "userId", "auditId", category::text AS category, hours, "workDate", "closedAt", "billRateSnapshot"
    FROM time_entries WHERE "organizationId" = ${args.organizationId} AND id IN (${Prisma.join(ids)})`);
  if (rows.length !== ids.length) throw new NotFoundException('Alguna de las horas no existe en esta organización.');

  const lines: HourLine[] = [];
  for (const r of rows) {
    if (r.auditId !== args.auditId) throw new UnprocessableEntityException('Alguna de las horas no es de este encargo.');
    if (r.category !== 'CLIENT_BILLABLE') throw new UnprocessableEntityException('Solo se facturan horas de cliente facturables.');
    if (!r.closedAt) throw new ConflictException('Alguna de las horas es de un mes que no está cerrado: el gerente debe cerrar el mes de esa persona antes de facturarla.');
    const line = buildHourLine(r.id, r.hours, asRateCents(r.billRateSnapshot));
    if (!line) throw new UnprocessableEntityException('Alguna de las horas no tiene tarifa pactada: fíjala en el equipo del encargo y reabre y vuelve a cerrar ese mes.');
    lines.push(line);
  }
  const taken = await tx.clientInvoiceHour.findFirst({ where: { timeEntryId: { in: ids }, releasedAt: null }, select: { id: true } });
  if (taken) throw new ConflictException('Alguna de las horas ya está en una factura vigente; vuelve a cargar la lista.');
  return lines.sort((a, b) => (a.timeEntryId < b.timeEntryId ? -1 : 1));
}

/** Guarda las líneas de una factura de horas (la factura ya existe). */
export async function insertHourLines(tx: Db, args: { organizationId: string; engagementId: string; invoiceId: string; userId: string; lines: HourLine[] }): Promise<void> {
  try {
    await tx.clientInvoiceHour.createMany({
      data: args.lines.map((l) => ({
        organizationId: args.organizationId, invoiceId: args.invoiceId, engagementId: args.engagementId, timeEntryId: l.timeEntryId,
        hours: unitsToDecimal(l.hoursUnits), rate: fromCents(l.rateCents), amount: fromCents(l.amountCents), createdById: args.userId,
      })),
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new ConflictException('Alguien más facturó alguna de esas horas mientras se registraba la factura; vuelve a cargar la lista.');
    throw e;
  }
}

/** Libera las horas de una factura (al anularla): vuelven a quedar por facturar. Devuelve cuántas. */
export async function releaseInvoiceHours(tx: Db, invoiceId: string, userId: string): Promise<number> {
  const res = await tx.clientInvoiceHour.updateMany({ where: { invoiceId, releasedAt: null }, data: { releasedAt: new Date(), releasedById: userId } });
  return res.count;
}

@Injectable()
export class BillableHoursService {
  constructor(private readonly prisma: PrismaService) {}

  /** Horas del encargo por facturar, agrupadas por persona, mes y tarifa. */
  async list(engagementId: string, user: AuthUser) {
    assertManager(user);
    await assertBillingModule(this.prisma, user.organizationId);
    const db: Db = this.prisma;
    const eng = await db.engagement.findFirst({
      where: { id: engagementId, organizationId: user.organizationId },
      select: { id: true, clientId: true, kind: true, title: true, status: true, auditId: true, fiscalYear: true },
    });
    if (!eng) throw new NotFoundException('Encargo no encontrado');
    const [fee, settings] = await Promise.all([
      db.engagementFee.findUnique({ where: { engagementId }, select: { feeType: true } }),
      loadCloseSettings(db, user.organizationId),
    ]);

    let blockedReason: BlockedReason | null = null;
    if (!fee) blockedReason = 'NO_FEE';
    else if (fee.feeType !== FeeType.TIME_BASED) blockedReason = 'NOT_TIME_BASED';
    else if (eng.status === EngagementStatus.CANCELLED) blockedReason = 'CANCELLED';
    else if (!eng.auditId) blockedReason = 'NO_AUDIT';
    else if (!settings.enabled) blockedReason = 'CLOSE_DISABLED';

    const empty = {
      engagement: { id: eng.id, kind: eng.kind, title: eng.title, status: eng.status, clientId: eng.clientId, auditId: eng.auditId },
      feeType: fee?.feeType ?? null, closeEnabled: settings.enabled, canInvoice: false, blockedReason, maxPerInvoice: MAX_HOURS_PER_INVOICE,
      invoiceable: { count: 0, hours: 0, amount: 0 }, groups: [] as BillableGroup[],
      provisional: { count: 0, hours: 0, amount: 0, unratedHours: 0 },
      withoutRate: { count: 0, hours: 0, groups: [] as { userId: string; userName: string; month: string; hours: number; count: number }[] },
      invoiced: { count: 0, hours: 0, amount: 0 },
    };
    if (!eng.auditId || !fee || fee.feeType !== FeeType.TIME_BASED) return empty;

    const [entries, activeLines, team] = await Promise.all([
      db.timeEntry.findMany({
        where: { organizationId: user.organizationId, auditId: eng.auditId, category: 'CLIENT_BILLABLE' },
        select: { id: true, userId: true, workDate: true, hours: true, description: true, closedAt: true, billRateSnapshot: true, afterClose: true },
        orderBy: [{ workDate: 'asc' }, { id: 'asc' }],
      }),
      db.clientInvoiceHour.findMany({ where: { engagementId, releasedAt: null }, select: { timeEntryId: true, hours: true, amount: true } }),
      db.auditTeam.findMany({ where: { auditId: eng.auditId }, select: { userId: true, agreedRatePerHour: true } }),
    ]);
    const invoicedIds = new Set(activeLines.map((l) => l.timeEntryId));
    const liveRate = new Map(team.map((t) => [t.userId, asRateCents(t.agreedRatePerHour)]));
    const users = await db.user.findMany({ where: { id: { in: [...new Set(entries.map((e) => e.userId))] }, organizationId: user.organizationId }, select: { id: true, name: true } });
    const nameOf = new Map(users.map((u) => [u.id, u.name]));

    const groups = new Map<string, BillableGroup>();
    const noRate = new Map<string, { userId: string; userName: string; month: string; hours: number; count: number }>();
    let invoiceableCents = 0; let invoiceableHours = 0; let invoiceableCount = 0;
    const provisional = { count: 0, hours: 0, cents: 0, unratedHours: 0 };

    for (const e of entries) {
      if (invoicedIds.has(e.id)) continue;
      const month = monthOf(e.workDate);
      if (!e.closedAt) {
        provisional.count++; provisional.hours += e.hours;
        const live = buildHourLine(e.id, e.hours, liveRate.get(e.userId) ?? null);
        if (live) provisional.cents += live.amountCents; else provisional.unratedHours += e.hours;
        continue;
      }
      const line = buildHourLine(e.id, e.hours, asRateCents(e.billRateSnapshot));
      if (!line) {
        const k = `${e.userId}|${month}`;
        const g = noRate.get(k) ?? { userId: e.userId, userName: nameOf.get(e.userId) ?? '—', month, hours: 0, count: 0 };
        g.hours += e.hours; g.count++; noRate.set(k, g);
        continue;
      }
      const k = `${e.userId}|${month}|${line.rateCents}`;
      const g = groups.get(k) ?? { userId: e.userId, userName: nameOf.get(e.userId) ?? '—', month, rate: dollars(line.rateCents), hours: 0, amount: 0, entries: [] };
      g.hours += e.hours; g.amount += dollars(line.amountCents);
      g.entries.push({ id: e.id, workDate: ymd(e.workDate), hours: e.hours, amount: dollars(line.amountCents), description: e.description, afterClose: e.afterClose });
      groups.set(k, g);
      invoiceableCents += line.amountCents; invoiceableHours += e.hours; invoiceableCount++;
    }

    const sorted = [...groups.values()].sort((a, b) => (a.month === b.month ? a.userName.localeCompare(b.userName) : a.month < b.month ? -1 : 1));
    for (const g of sorted) { g.hours = round2(g.hours); g.amount = round2(g.amount); }
    return {
      ...empty,
      canInvoice: blockedReason === null && eng.status !== EngagementStatus.CANCELLED,
      groups: sorted,
      invoiceable: { count: invoiceableCount, hours: round2(invoiceableHours), amount: dollars(invoiceableCents) },
      provisional: { count: provisional.count, hours: round2(provisional.hours), amount: dollars(provisional.cents), unratedHours: round2(provisional.unratedHours) },
      withoutRate: { count: [...noRate.values()].reduce((s, g) => s + g.count, 0), hours: round2([...noRate.values()].reduce((s, g) => s + g.hours, 0)), groups: [...noRate.values()].map((g) => ({ ...g, hours: round2(g.hours) })) },
      invoiced: {
        count: activeLines.length, hours: round2(activeLines.reduce((s, l) => s + Number(l.hours), 0)),
        amount: dollars(activeLines.reduce((s, l) => s + toCents(l.amount), 0)),
      },
    };
  }

  /** Consultorías por tiempo con horas listas para facturar (cuadro de «Cobranza»). */
  async readyToInvoice(user: AuthUser) {
    assertManager(user);
    await assertBillingModule(this.prisma, user.organizationId);
    const org = user.organizationId;
    const settings = await loadCloseSettings(this.prisma, org);
    const rows = await this.prisma.$queryRaw<{ engagementId: string; title: string | null; clientName: string; hours: number; rate: Prisma.Decimal }[]>(Prisma.sql`
      SELECT e.id AS "engagementId", e.title, c."legalName" AS "clientName", t.hours, t."billRateSnapshot" AS rate
      FROM engagements e
      JOIN engagement_fees f ON f."engagementId" = e.id AND f."feeType" = 'TIME_BASED'
      JOIN clients c ON c.id = e."clientId"
      JOIN time_entries t ON t."auditId" = e."auditId" AND t."organizationId" = e."organizationId"
      WHERE e."organizationId" = ${org} AND e.status <> 'CANCELLED' AND e."auditId" IS NOT NULL
        AND t.category = 'CLIENT_BILLABLE' AND t."closedAt" IS NOT NULL AND t."billRateSnapshot" > 0
        AND NOT EXISTS (SELECT 1 FROM client_invoice_hours h WHERE h."timeEntryId" = t.id AND h."releasedAt" IS NULL)`);
    const byEng = new Map<string, { engagementId: string; title: string | null; clientName: string; count: number; hours: number; cents: number }>();
    for (const r of rows) {
      const line = buildHourLine('x', r.hours, toCents(r.rate.toString()));
      if (!line) continue;
      const g = byEng.get(r.engagementId) ?? { engagementId: r.engagementId, title: r.title, clientName: r.clientName, count: 0, hours: 0, cents: 0 };
      g.count++; g.hours += r.hours; g.cents += line.amountCents; byEng.set(r.engagementId, g);
    }
    return {
      closeEnabled: settings.enabled,
      items: [...byEng.values()].sort((a, b) => b.cents - a.cents).map((g) => ({ engagementId: g.engagementId, title: g.title, clientName: g.clientName, count: g.count, hours: round2(g.hours), amount: dollars(g.cents) })),
    };
  }
}
