import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ClientInvoiceStatus, ClientPaymentStatus, Prisma, PromiseStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/jwt.strategy';
import {
  TX_OPTIONS, addDays, assertBillingModule, assertManager, dateFromYmd, isDirection, logCollection, todayInSalvador, toJson, ymd,
} from './collections.common';
import { balanceCents, daysOverdue } from './balance.util';
import { fromCents, parseMoneyInput, toCents } from './money.util';
import { assertValidYmd } from './schedule.util';
import { moneyOf } from './invoice-ledger';
import {
  AlertsQueryDto, CreateCollectionNoteDto, ListCollectionNotesQueryDto, SetPromiseStatusDto, UpdateCollectionNoteDto,
} from './dto/collections-3d.dto';

type NoteRow = Prisma.CollectionNoteGetPayload<object>;

/** Una promesa de pago pendiente cuya fecha ya pasó está vencida (no es un estado guardado: se deriva). */
export const promiseIsOverdue = (n: Pick<NoteRow, 'promiseStatus' | 'promiseDate'>, today: string) =>
  n.promiseStatus === PromiseStatus.PENDING && !!n.promiseDate && ymd(n.promiseDate) < today;

/**
 * Gestión de cobro — docs/cobros-honorarios-diseno.md §4.7. Notas de contacto con promesas de pago y seguimientos; las ve y las anota
 * cualquier gerente. Se agregan; el texto lo corrige su autor o la dirección (la versión anterior queda en la bitácora) y se pueden
 * borrar (también con rastro). El sistema NO cambia solo el estado de una promesa: solo sugiere «posible cumplida» y marca las vencidas.
 */
@Injectable()
export class CollectionNotesService {
  constructor(private readonly prisma: PrismaService) {}

  private async enrich(rows: NoteRow[], today: string) {
    const users = await this.prisma.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.createdById))] } }, select: { id: true, name: true } });
    const clients = await this.prisma.client.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.clientId))] } }, select: { id: true, legalName: true, tradeName: true } });
    const invoices = await this.prisma.clientInvoice.findMany({ where: { id: { in: rows.map((r) => r.invoiceId).filter((v): v is string => !!v) } }, select: { id: true, invoiceNumber: true } });
    // «Posible cumplida»: los cobros del cliente posteriores a la nota cubren lo prometido.
    const pending = rows.filter((r) => r.promiseStatus === PromiseStatus.PENDING && r.promiseAmount);
    const paid = new Map<string, { date: string; amount: number }[]>();
    if (pending.length) {
      const payments = await this.prisma.clientPayment.findMany({
        where: { organizationId: rows[0].organizationId, clientId: { in: [...new Set(pending.map((r) => r.clientId))] }, status: ClientPaymentStatus.ACTIVE },
        select: { clientId: true, paymentDate: true, amount: true },
      });
      for (const p of payments) paid.set(p.clientId, [...(paid.get(p.clientId) ?? []), { date: ymd(p.paymentDate), amount: toCents(p.amount) }]);
    }
    const userBy = new Map(users.map((u) => [u.id, u.name]));
    const clientBy = new Map(clients.map((c) => [c.id, c]));
    const invBy = new Map(invoices.map((i) => [i.id, i.invoiceNumber]));
    return rows.map((r) => {
      const received = (paid.get(r.clientId) ?? []).filter((p) => p.date >= ymd(r.contactedOn)).reduce((s, p) => s + p.amount, 0);
      return {
        id: r.id, clientId: r.clientId, invoiceId: r.invoiceId, engagementId: r.engagementId,
        contactedOn: ymd(r.contactedOn), method: r.method, contactName: r.contactName, note: r.note,
        promiseDate: r.promiseDate ? ymd(r.promiseDate) : null, promiseAmount: r.promiseAmount ? Number(r.promiseAmount) : null,
        promiseStatus: r.promiseStatus, promiseOverdue: promiseIsOverdue(r, today),
        possiblyKept: r.promiseStatus === PromiseStatus.PENDING && !!r.promiseAmount && received >= toCents(r.promiseAmount as Prisma.Decimal),
        nextFollowUpOn: r.nextFollowUpOn ? ymd(r.nextFollowUpOn) : null,
        createdById: r.createdById, createdByName: userBy.get(r.createdById) ?? null, createdAt: r.createdAt, updatedAt: r.updatedAt,
        client: clientBy.get(r.clientId) ?? null, invoiceNumber: r.invoiceId ? invBy.get(r.invoiceId) ?? null : null,
      };
    });
  }

  // ── Agregar ────────────────────────────────────────────────────────────────
  async create(dto: CreateCollectionNoteDto, user: AuthUser) {
    assertManager(user);
    await assertBillingModule(this.prisma, user.organizationId);
    const today = todayInSalvador();
    const contactedOn = dto.contactedOn ? assertValidYmd(dto.contactedOn, 'La fecha del contacto') : today;
    if (contactedOn > today) throw new BadRequestException('La fecha del contacto no puede ser futura.');
    const promiseDate = dto.promiseDate ? assertValidYmd(dto.promiseDate, 'La fecha de la promesa') : null;
    if (promiseDate && promiseDate < contactedOn) throw new BadRequestException('La fecha de la promesa no puede ser anterior al contacto.');
    if (dto.promiseAmount !== undefined && !promiseDate) throw new BadRequestException('Para anotar un monto prometido indica también la fecha de la promesa.');
    const promiseCents = dto.promiseAmount !== undefined ? parseMoneyInput(dto.promiseAmount, 'El monto prometido') : null;
    const nextFollowUpOn = dto.nextFollowUpOn ? assertValidYmd(dto.nextFollowUpOn, 'La fecha de seguimiento') : null;
    if (nextFollowUpOn && nextFollowUpOn < contactedOn) throw new BadRequestException('El seguimiento no puede ser anterior al contacto.');

    const client = await this.prisma.client.findFirst({ where: { id: dto.clientId, organizationId: user.organizationId }, select: { id: true } });
    if (!client) throw new NotFoundException('Cliente no encontrado');
    if (dto.invoiceId) {
      const inv = await this.prisma.clientInvoice.findFirst({ where: { id: dto.invoiceId, organizationId: user.organizationId, clientId: dto.clientId }, select: { id: true } });
      if (!inv) throw new NotFoundException('Esa factura no es de este cliente.');
    }
    if (dto.engagementId) {
      const eng = await this.prisma.engagement.findFirst({ where: { id: dto.engagementId, organizationId: user.organizationId, clientId: dto.clientId }, select: { id: true } });
      if (!eng) throw new NotFoundException('Ese encargo no es de este cliente.');
    }

    return this.prisma.$transaction(async (tx) => {
      const row = await tx.collectionNote.create({
        data: {
          organizationId: user.organizationId, clientId: dto.clientId, invoiceId: dto.invoiceId ?? null, engagementId: dto.engagementId ?? null,
          contactedOn: dateFromYmd(contactedOn), method: dto.method, contactName: dto.contactName?.trim() || null, note: dto.note.trim(),
          promiseDate: promiseDate ? dateFromYmd(promiseDate) : null, promiseAmount: promiseCents === null ? null : fromCents(promiseCents),
          promiseStatus: promiseDate ? PromiseStatus.PENDING : null, nextFollowUpOn: nextFollowUpOn ? dateFromYmd(nextFollowUpOn) : null,
          createdById: user.id,
        },
      });
      await logCollection(tx, { organizationId: user.organizationId, entityType: 'COLLECTION_NOTE', entityId: row.id, action: 'COLLECTION_NOTE_ADDED', actorId: user.id, before: null, after: toJson(row) });
      return (await this.enrich([row], today))[0];
    }, TX_OPTIONS);
  }

  // ── Editar el texto (su autor o la dirección) ──────────────────────────────
  async update(id: string, dto: UpdateCollectionNoteDto, user: AuthUser) {
    assertManager(user);
    await assertBillingModule(this.prisma, user.organizationId);
    const today = todayInSalvador();
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.collectionNote.findFirst({ where: { id, organizationId: user.organizationId } });
      if (!row) throw new NotFoundException('Nota de gestión no encontrada');
      if (row.createdById !== user.id && !isDirection(user)) throw new ForbiddenException('Solo su autor o la dirección pueden editar esta nota.');

      const data: Prisma.CollectionNoteUpdateInput = {};
      const contactedOn = dto.contactedOn ? assertValidYmd(dto.contactedOn, 'La fecha del contacto') : ymd(row.contactedOn);
      if (contactedOn > today) throw new BadRequestException('La fecha del contacto no puede ser futura.');
      if (dto.contactedOn) data.contactedOn = dateFromYmd(contactedOn);
      if (dto.method) data.method = dto.method;
      if (dto.contactName !== undefined) data.contactName = dto.contactName.trim() || null;
      if (dto.note !== undefined) data.note = dto.note.trim();

      let promiseDate = row.promiseDate ? ymd(row.promiseDate) : null;
      if (dto.promiseDate !== undefined) {
        promiseDate = assertValidYmd(dto.promiseDate, 'La fecha de la promesa');
        data.promiseDate = dateFromYmd(promiseDate);
        if (!row.promiseStatus) data.promiseStatus = PromiseStatus.PENDING; // se agrega una promesa a una nota que no la tenía
      }
      if (promiseDate && promiseDate < contactedOn) throw new BadRequestException('La fecha de la promesa no puede ser anterior al contacto.');
      if (dto.promiseAmount !== undefined) {
        if (!promiseDate) throw new BadRequestException('Para anotar un monto prometido indica también la fecha de la promesa.');
        data.promiseAmount = fromCents(parseMoneyInput(dto.promiseAmount, 'El monto prometido'));
      }
      if (dto.nextFollowUpOn !== undefined) {
        if (dto.nextFollowUpOn === '') data.nextFollowUpOn = null;
        else {
          const next = assertValidYmd(dto.nextFollowUpOn, 'La fecha de seguimiento');
          if (next < contactedOn) throw new BadRequestException('El seguimiento no puede ser anterior al contacto.');
          data.nextFollowUpOn = dateFromYmd(next);
        }
      } else if (row.nextFollowUpOn && ymd(row.nextFollowUpOn) < contactedOn) {
        throw new BadRequestException('El seguimiento ya anotado quedaría anterior al contacto; corrige también esa fecha.');
      }
      if (Object.keys(data).length === 0) return (await this.enrich([row], today))[0];

      const updated = await tx.collectionNote.update({ where: { id }, data });
      await logCollection(tx, { organizationId: user.organizationId, entityType: 'COLLECTION_NOTE', entityId: id, action: 'COLLECTION_NOTE_UPDATED', actorId: user.id, before: toJson(row), after: toJson(updated) });
      return (await this.enrich([updated], today))[0];
    }, TX_OPTIONS);
  }

  // ── Estado de la promesa (lo cambia el gerente; el sistema solo sugiere) ───
  async setPromiseStatus(id: string, dto: SetPromiseStatusDto, user: AuthUser) {
    assertManager(user);
    await assertBillingModule(this.prisma, user.organizationId);
    const today = todayInSalvador();
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.collectionNote.findFirst({ where: { id, organizationId: user.organizationId } });
      if (!row) throw new NotFoundException('Nota de gestión no encontrada');
      if (!row.promiseStatus) throw new ConflictException('Esta nota no tiene una promesa de pago.');
      if (row.promiseStatus === dto.status) return (await this.enrich([row], today))[0];
      const claim = await tx.collectionNote.updateMany({ where: { id, promiseStatus: row.promiseStatus }, data: { promiseStatus: dto.status } });
      if (claim.count !== 1) throw new ConflictException('La promesa cambió mientras la actualizabas; vuelve a intentarlo.');
      await logCollection(tx, {
        organizationId: user.organizationId, entityType: 'COLLECTION_NOTE', entityId: id, action: 'PROMISE_STATUS_CHANGED', actorId: user.id,
        before: { promiseStatus: row.promiseStatus }, after: { promiseStatus: dto.status },
      });
      return (await this.enrich([await tx.collectionNote.findUniqueOrThrow({ where: { id } })], today))[0];
    }, TX_OPTIONS);
  }

  // ── Borrar (su autor o la dirección; deja rastro) ──────────────────────────
  async remove(id: string, user: AuthUser) {
    assertManager(user);
    await assertBillingModule(this.prisma, user.organizationId);
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.collectionNote.findFirst({ where: { id, organizationId: user.organizationId } });
      if (!row) throw new NotFoundException('Nota de gestión no encontrada');
      if (row.createdById !== user.id && !isDirection(user)) throw new ForbiddenException('Solo su autor o la dirección pueden borrar esta nota.');
      const res = await tx.collectionNote.deleteMany({ where: { id } });
      if (res.count !== 1) throw new ConflictException('La nota ya no existe.');
      await logCollection(tx, { organizationId: user.organizationId, entityType: 'COLLECTION_NOTE', entityId: id, action: 'COLLECTION_NOTE_DELETED', actorId: user.id, before: toJson(row), after: null });
      return { deleted: true };
    }, TX_OPTIONS);
  }

  // ── Consultar ──────────────────────────────────────────────────────────────
  async list(q: ListCollectionNotesQueryDto, user: AuthUser) {
    assertManager(user);
    await assertBillingModule(this.prisma, user.organizationId);
    const today = todayInSalvador();
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 100;
    const where: Prisma.CollectionNoteWhereInput = {
      organizationId: user.organizationId,
      ...(q.clientId && { clientId: q.clientId }), ...(q.invoiceId && { invoiceId: q.invoiceId }),
      ...(q.engagementId && { engagementId: q.engagementId }), ...(q.promiseStatus && { promiseStatus: q.promiseStatus }),
    };
    const [rows, total] = await Promise.all([
      this.prisma.collectionNote.findMany({ where, orderBy: [{ contactedOn: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }], skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.collectionNote.count({ where }),
    ]);
    return { page, pageSize, total, items: rows.length ? await this.enrich(rows, today) : [] };
  }

  // ── Alertas (derivadas; sin tareas programadas) ────────────────────────────
  async alerts(q: AlertsQueryDto, user: AuthUser) {
    assertManager(user);
    await assertBillingModule(this.prisma, user.organizationId);
    const today = todayInSalvador();
    const staleDays = q.staleDays ?? 15;
    const org = user.organizationId;

    // 1. Promesas pendientes cuya fecha ya pasó.
    const overdueRows = await this.prisma.collectionNote.findMany({
      where: { organizationId: org, promiseStatus: PromiseStatus.PENDING, promiseDate: { lt: dateFromYmd(today) } },
      orderBy: { promiseDate: 'asc' }, take: 200,
    });

    // 2. Seguimientos de hoy o atrasados: la última nota del cliente (la más reciente) pide volver a contactarlo.
    const followCandidates = await this.prisma.collectionNote.findMany({
      where: { organizationId: org, nextFollowUpOn: { lte: dateFromYmd(today) } }, orderBy: { nextFollowUpOn: 'asc' }, take: 500,
    });
    const latestPerClient = followCandidates.length
      ? await this.prisma.collectionNote.groupBy({ by: ['clientId'], where: { organizationId: org, clientId: { in: [...new Set(followCandidates.map((n) => n.clientId))] } }, _max: { createdAt: true } })
      : [];
    const latestBy = new Map(latestPerClient.map((g) => [g.clientId, g._max.createdAt as Date]));
    const followRows = followCandidates.filter((n) => (latestBy.get(n.clientId)?.getTime() ?? 0) <= n.createdAt.getTime()).slice(0, 200);

    // 3. Facturas vencidas con saldo y sin gestión registrada en los últimos `staleDays` días (por la factura o por el cliente en general).
    const overdueInvoices = await this.prisma.clientInvoice.findMany({
      where: { organizationId: org, status: { in: [ClientInvoiceStatus.OPEN, ClientInvoiceStatus.PARTIAL] }, dueDate: { lt: dateFromYmd(today) } },
      orderBy: { dueDate: 'asc' }, take: 500,
    });
    const since = dateFromYmd(addDays(today, -staleDays));
    const recent = overdueInvoices.length
      ? await this.prisma.collectionNote.findMany({
          where: { organizationId: org, clientId: { in: [...new Set(overdueInvoices.map((i) => i.clientId))] }, contactedOn: { gte: since } },
          select: { clientId: true, invoiceId: true },
        })
      : [];
    const touchedInvoice = new Set(recent.filter((n) => n.invoiceId).map((n) => n.invoiceId as string));
    const touchedClientWide = new Set(recent.filter((n) => !n.invoiceId).map((n) => n.clientId));
    const unattended = overdueInvoices.filter((i) => !touchedInvoice.has(i.id) && !touchedClientWide.has(i.clientId)).slice(0, 200);

    const clientIds = [...new Set([...overdueRows, ...followRows].map((n) => n.clientId).concat(unattended.map((i) => i.clientId)))];
    const clients = await this.prisma.client.findMany({ where: { id: { in: clientIds } }, select: { id: true, legalName: true, tradeName: true } });
    const clientBy = new Map(clients.map((c) => [c.id, c]));

    return {
      asOf: today, staleDays,
      overduePromises: overdueRows.length ? await this.enrich(overdueRows, today) : [],
      followUps: followRows.length ? await this.enrich(followRows, today) : [],
      unattendedInvoices: unattended.map((i) => ({
        id: i.id, invoiceNumber: i.invoiceNumber, clientId: i.clientId, client: clientBy.get(i.clientId) ?? null,
        dueDate: ymd(i.dueDate), overdueDays: daysOverdue(ymd(i.dueDate), today), balance: balanceCents(moneyOf(i)) / 100,
      })),
      counts: { overduePromises: overdueRows.length, followUps: followRows.length, unattendedInvoices: unattended.length },
    };
  }
}
