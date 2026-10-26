/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { ForbiddenException } from '@nestjs/common';
import { FeesService } from './fees.service';
import { InvoicesService } from './invoices.service';
import { CreditNotesService } from './credit-notes.service';
import { BillableHoursService } from './billable-hours.service';
import { checkCollectionInvariants } from './invariants';
import { todayInSalvador, addDays } from './collections.common';
import { HoursCloseService } from '../timesheet/hours-close.service';

/**
 * Cobranza fase 4 — facturar las horas cerradas de una consultoría por tiempo — contra un Postgres REAL (el mismo SQL de
 * infrastructure/db-migrations, incluido 2026-10-cobros-4.sql).
 *
 *   COLLECTIONS_TEST_DATABASE_URL=postgresql://postgres:test@localhost:54329/cobros_test npx jest collections-4
 */
const URL = process.env.COLLECTIONS_TEST_DATABASE_URL;
const suite = URL ? describe : describe.skip;
jest.setTimeout(120_000);

suite('cobranza fase 4 (horas por facturar) contra Postgres real', () => {
  let prisma: PrismaClient;
  let fees: FeesService; let invoices: InvoicesService; let credits: CreditNotesService; let billable: BillableHoursService; let hoursClose: HoursCloseService;

  beforeAll(async () => {
    const sep = (URL as string).includes('?') ? '&' : '?';
    prisma = new PrismaClient({ datasourceUrl: `${URL}${sep}connection_limit=12&pool_timeout=30` });
    await prisma.$connect();
    fees = new FeesService(prisma as any); invoices = new InvoicesService(prisma as any); credits = new CreditNotesService(prisma as any);
    billable = new BillableHoursService(prisma as any); hoursClose = new HoursCloseService(prisma as any, {} as any);
  });
  afterAll(async () => { await prisma?.$disconnect(); });

  const T = () => todayInSalvador();
  // Mes anterior al de hoy: es el que se cierra (solo se cierran meses terminados).
  const prev = () => { const d = new Date(`${T()}T00:00:00Z`); const p = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)); return { year: p.getUTCFullYear(), month: p.getUTCMonth() + 1 }; };
  const day = (n: number) => { const { year, month } = prev(); return `${year}-${String(month).padStart(2, '0')}-${String(n).padStart(2, '0')}`; };
  let seq = 0;

  /** Una consultoría por tiempo con su auditoría, equipo con tarifa pactada (auditor $50, senior $80) y el cierre de horas activado. */
  async function seed(o: { seniorRate?: number | null; closeEnabled?: boolean; feeType?: 'TIME_BASED' | 'FIXED' } = {}) {
    const tag = `${Date.now().toString(36)}${(seq++).toString(36)}${randomUUID().slice(0, 6)}`;
    const org = await prisma.organization.create({ data: { name: `Org ${tag}`, slug: `org-${tag}`, auditModality: 'EXTERNAL' } });
    const mk = (role: any, n: string) => prisma.user.create({ data: { organizationId: org.id, supabaseUserId: randomUUID(), email: `${n}-${tag}@t.test`, name: n, role } });
    const [cae, manager, auditor, senior] = await Promise.all([mk('CAE', 'cae'), mk('AUDIT_MANAGER', 'manager'), mk('AUDITOR', 'auditor'), mk('SENIOR_AUDITOR', 'senior')]);
    const au = (u: any) => ({ id: u.id, supabaseUserId: u.supabaseUserId, email: u.email, name: u.name, role: u.role, organizationId: org.id, aiAssistantPersonality: 'ATHENA' });
    const client = await prisma.client.create({ data: { organizationId: org.id, legalName: `Cliente ${tag}`, status: 'ACTIVE', createdById: cae.id } });
    const audit = await prisma.audit.create({ data: { organizationId: org.id, title: 'Asesoría tributaria', type: 'EXTERNAL_FINANCIAL', leadAuditorId: manager.id } });
    const eng = await prisma.engagement.create({
      data: { organizationId: org.id, clientId: client.id, kind: 'CONSULTING', title: 'Asesoría', fiscalYear: 2026, fiscalYearEndDate: new Date('2026-12-31'), status: 'APPROVED', auditId: audit.id, createdById: cae.id },
    });
    await prisma.auditTeam.create({ data: { auditId: audit.id, userId: auditor.id, role: 'AUDITOR', agreedRatePerHour: 50 } });
    await prisma.auditTeam.create({ data: { auditId: audit.id, userId: senior.id, role: 'AUDITOR', agreedRatePerHour: o.seniorRate === undefined ? 80 : o.seniorRate } });
    if (o.closeEnabled !== false) await prisma.hoursCloseSettings.create({ data: { organizationId: org.id, enabled: true } });
    const c = { org, cae: au(cae), manager: au(manager), auditor: au(auditor), senior: au(senior), client, audit, eng, tag };
    await fees.setFee(eng.id, o.feeType === 'FIXED' ? ({ feeType: 'FIXED', totalAmount: 10000 } as any) : ({ feeType: 'TIME_BASED' } as any), c.cae);
    return c;
  }
  type Ctx = Awaited<ReturnType<typeof seed>>;

  const hour = (c: Ctx, userId: string, hours: number, workDate: string, o: any = {}) =>
    prisma.timeEntry.create({ data: { organizationId: c.org.id, userId, auditId: c.audit.id, workDate: new Date(`${workDate}T00:00:00Z`), hours, category: 'CLIENT_BILLABLE', description: 'trabajo', ...o } });
  const closeMonth = (c: Ctx, userId: string) => hoursClose.closePeriod({ userId, year: prev().year, month: prev().month } as any, c.manager);

  /** Horas estándar: auditor 8 h + 4 h (a $50 = $600), senior 5 h (a $80 = $400), todas cerradas; y 2 h del auditor en el mes abierto (provisionales). */
  async function standard(c: Ctx) {
    const a1 = await hour(c, c.auditor.id, 8, day(1)); const a2 = await hour(c, c.auditor.id, 4, day(2)); const s1 = await hour(c, c.senior.id, 5, day(3));
    await closeMonth(c, c.auditor.id); await closeMonth(c, c.senior.id);
    const open = await hour(c, c.auditor.id, 2, T());
    return { a1, a2, s1, open };
  }

  let nSeq = 0;
  const num = () => `DTE-03-M001P001-${String(++nSeq).padStart(15, '0')}`;
  const invoiceHours = (c: Ctx, ids: string[], net: number, o: any = {}, who: any = c.manager) =>
    invoices.register({ engagementId: c.eng.id, invoiceNumber: num(), documentType: '03', invoiceDate: T(), netAmount: net, taxAmount: Math.round(net * 13) / 100, timeEntryIds: ids, ...o } as any, who) as Promise<any>;
  const expectClean = async (c: Ctx) => expect(await checkCollectionInvariants(prisma, c.org.id)).toEqual([]);
  const settle = async (ps: Promise<unknown>[]) => Promise.allSettled(ps);
  const ok = (rs: PromiseSettledResult<unknown>[]) => rs.filter((r) => r.status === 'fulfilled').length;

  // ═══ La lista de horas por facturar ═════════════════════════════════════════════════════════════
  describe('horas por facturar', () => {
    it('agrupa por persona y mes con la tarifa congelada, separa las provisionales y avisa si falta la tarifa o el cierre', async () => {
      const c = await seed({ seniorRate: null });
      const { open } = await standard(c);
      void open;
      const v: any = await billable.list(c.eng.id, c.manager);
      expect(v).toMatchObject({ feeType: 'TIME_BASED', closeEnabled: true, canInvoice: true, blockedReason: null, maxPerInvoice: 500 });
      expect(v.groups).toHaveLength(1);                                       // solo el auditor: el senior no tiene tarifa
      expect(v.groups[0]).toMatchObject({ userId: c.auditor.id, rate: 50, hours: 12, amount: 600 });
      expect(v.groups[0].entries).toHaveLength(2);
      expect(v.invoiceable).toMatchObject({ count: 2, hours: 12, amount: 600 });
      expect(v.withoutRate).toMatchObject({ count: 1, hours: 5 });
      expect(v.withoutRate.groups[0]).toMatchObject({ userId: c.senior.id, hours: 5 });
      expect(v.provisional).toMatchObject({ count: 1, hours: 2, amount: 100 });  // mes abierto, a la tarifa vigente
      await expect(billable.list(c.eng.id, c.auditor)).rejects.toBeInstanceOf(ForbiddenException);

      const off = await seed({ closeEnabled: false });
      await hour(off, off.auditor.id, 8, day(1));
      expect(await billable.list(off.eng.id, off.manager)).toMatchObject({ closeEnabled: false, canInvoice: false, blockedReason: 'CLOSE_DISABLED' });
      const fixed = await seed({ feeType: 'FIXED' });
      expect(await billable.list(fixed.eng.id, fixed.manager)).toMatchObject({ canInvoice: false, blockedReason: 'NOT_TIME_BASED', groups: [] });
    });

    it('«Cobranza»: lista las consultorías con horas listas para facturar', async () => {
      const c = await seed();
      await standard(c);
      const r: any = await billable.readyToInvoice(c.manager);
      expect(r.closeEnabled).toBe(true);
      expect(r.items).toHaveLength(1);
      expect(r.items[0]).toMatchObject({ engagementId: c.eng.id, count: 3, hours: 17, amount: 1000 });
      const other = await seed();
      expect(((await billable.readyToInvoice(other.manager)) as any).items).toEqual([]);   // otra organización no ve nada de esta
    });
  });

  // ═══ Registrar la factura de horas ══════════════════════════════════════════════════════════════
  describe('factura de horas', () => {
    it('el neto es la suma exacta de las horas, deja líneas, saca las horas de la lista y el devengado no cambia', async () => {
      const c = await seed();
      const { a1, a2, s1 } = await standard(c);
      const before: any = (await fees.getFee(c.eng.id, c.manager) as any).accrual;
      expect(before).toMatchObject({ feeType: 'TIME_BASED', basis: 'TIME', invoicedNet: 0, accrued: 1100, toInvoice: 1100 });   // 600 + 400 + 100 provisional
      expect(before.time).toMatchObject({ invoiceableHours: 17, invoiceableAmount: 1000, provisionalHours: 2, provisionalAmount: 100, unratedHours: 0 });

      const inv = await invoiceHours(c, [a1.id, a2.id], 600);
      expect(inv).toMatchObject({ netAmount: 600, status: 'OPEN' });
      const lines = await prisma.clientInvoiceHour.findMany({ where: { invoiceId: inv.id }, orderBy: { amount: 'asc' } });
      expect(lines.map((l) => [Number(l.hours), Number(l.rate), Number(l.amount)])).toEqual([[4, 50, 200], [8, 50, 400]]);

      const v: any = await billable.list(c.eng.id, c.manager);
      expect(v.invoiceable).toMatchObject({ count: 1, hours: 5, amount: 400 });      // solo queda el senior
      expect(v.invoiced).toMatchObject({ count: 2, hours: 12, amount: 600 });
      const after: any = (await fees.getFee(c.eng.id, c.manager) as any).accrual;
      expect(after).toMatchObject({ invoicedNet: 600, accrued: 1100, toInvoice: 500 });   // facturar no cambia lo ganado; baja lo que falta facturar
      expect(after.time).toMatchObject({ invoiceableHours: 5, invoiceableAmount: 400, provisionalAmount: 100 });

      const detail: any = await invoices.get(inv.id, c.manager);
      expect(detail.hours).toHaveLength(2);
      expect(detail.hours.every((h: any) => h.userName === 'auditor' && h.rate === 50)).toBe(true);
      void s1;
      await expectClean(c);
    });

    it('rechaza lo que no se puede facturar: neto distinto, horas ajenas, abiertas, sin tarifa, no facturables, repetidas, y honorario fijo', async () => {
      const c = await seed({ seniorRate: null });
      const { a1, a2, s1, open } = await standard(c);
      await expect(invoiceHours(c, [a1.id, a2.id], 601)).rejects.toThrow(/no coincide con las horas elegidas/);
      await expect(invoiceHours(c, [s1.id], 400)).rejects.toThrow(/sin tarifa|no tiene tarifa/);
      await expect(invoiceHours(c, [open.id], 100)).rejects.toThrow(/no está cerrado/);

      const nonBillable = await hour(c, c.auditor.id, 1, day(4), { category: 'CLIENT_NON_BILLABLE', nonBillableReason: 'COURTESY', closedAt: new Date(), billRateSnapshot: 50 });
      const other = await seed();
      const foreign = await hour(other, other.auditor.id, 2, day(1));
      await closeMonth(other, other.auditor.id);
      await expect(invoiceHours(c, [foreign.id], 100)).rejects.toThrow(/no existe en esta organización/);
      const sameOrgOtherAudit = await prisma.audit.create({ data: { organizationId: c.org.id, title: 'Otra', type: 'EXTERNAL_FINANCIAL', leadAuditorId: c.manager.id } });
      const elsewhere = await prisma.timeEntry.create({ data: { organizationId: c.org.id, userId: c.auditor.id, auditId: sameOrgOtherAudit.id, workDate: new Date(`${day(5)}T00:00:00Z`), hours: 1, category: 'CLIENT_BILLABLE', closedAt: new Date(), billRateSnapshot: 50 } });
      await expect(invoiceHours(c, [elsewhere.id], 50)).rejects.toThrow(/no es de este encargo/);
      await expect(invoiceHours(c, ['inexistente-0001'], 50)).rejects.toThrow(/no existe/);
      await expect(invoiceHours(c, [nonBillable.id], 50)).rejects.toThrow(/facturables/);

      const first = await invoiceHours(c, [a1.id], 400);
      await expect(invoiceHours(c, [a1.id], 400)).rejects.toThrow(/ya está en una factura vigente/);
      expect(first.netAmount).toBe(400);

      const fixed = await seed({ feeType: 'FIXED' });
      const fe = await hour(fixed, fixed.auditor.id, 2, day(1));
      await closeMonth(fixed, fixed.auditor.id);
      await expect(invoiceHours(fixed, [fe.id], 100)).rejects.toThrow(/honorario por tiempo/);
      const tooMany = Array.from({ length: 501 }, (_, i) => `x${String(i).padStart(10, '0')}`);
      await expect(invoiceHours(c, tooMany, 1)).rejects.toThrow();   // lo frena el DTO en la API; el servicio también lo acota
      await expectClean(c);
    });

    it('dos gerentes facturando las mismas horas a la vez: gana uno, y las horas quedan en una sola factura', async () => {
      for (let n = 0; n < 3; n++) {
        const c = await seed();
        const { a1, a2 } = await standard(c);
        const rs = await settle([invoiceHours(c, [a1.id, a2.id], 600), invoiceHours(c, [a2.id, a1.id], 600)]);
        expect(ok(rs)).toBe(1);
        expect(await prisma.clientInvoiceHour.count({ where: { engagementId: c.eng.id, releasedAt: null } })).toBe(2);
        await expectClean(c);
      }
    });

    it('anular la factura libera las horas y se pueden facturar otra vez; una nota de crédito NO las libera', async () => {
      const c = await seed();
      const { a1, a2 } = await standard(c);
      const inv = await invoiceHours(c, [a1.id, a2.id], 600);

      // la nota de crédito baja lo facturado pero las horas siguen facturadas
      await credits.register(inv.id, { creditNoteNumber: 'DTE-05-M001P001-000000000000321', netAmount: 100, taxAmount: 13, reason: 'Descuento acordado con el cliente por retraso.' } as any, c.cae);
      let v: any = await billable.list(c.eng.id, c.manager);
      expect(v.invoiced.count).toBe(2);
      let acc: any = (await fees.getFee(c.eng.id, c.manager) as any).accrual;
      expect(acc).toMatchObject({ invoicedNet: 500, accrued: 1000, toInvoice: 500 });     // 600 − 100 de rebaja + 400 + 100 sin facturar
      await expect(invoices.void(inv.id, { reason: 'Se emitió con horas equivocadas' } as any, c.cae)).rejects.toThrow(/notas de crédito vigentes/);

      const c2 = await seed();
      const e2 = await standard(c2);
      const inv2 = await invoiceHours(c2, [e2.a1.id, e2.a2.id], 600);
      await expect(invoices.void(inv2.id, { reason: 'Se emitió con horas equivocadas' } as any, c2.manager)).rejects.toBeInstanceOf(ForbiddenException);   // anular es de la dirección
      await invoices.void(inv2.id, { reason: 'Se emitió con horas equivocadas' } as any, c2.cae);
      expect(await prisma.clientInvoiceHour.count({ where: { invoiceId: inv2.id, releasedAt: null } })).toBe(0);
      v = await billable.list(c2.eng.id, c2.manager);
      expect(v.invoiceable).toMatchObject({ count: 3, amount: 1000 });                   // las horas volvieron a la lista
      await expect(invoiceHours(c2, [e2.a1.id, e2.a2.id], 600)).resolves.toBeDefined();  // y se pueden facturar de nuevo
      acc = (await fees.getFee(c2.eng.id, c2.manager) as any).accrual;
      expect(acc.invoicedNet).toBe(600);
      await expectClean(c2);
    });

    it('el neto de una factura de horas no se edita; el IVA y las fechas sí', async () => {
      const c = await seed();
      const { a1, a2 } = await standard(c);
      const inv = await invoiceHours(c, [a1.id, a2.id], 600);
      await expect(invoices.update(inv.id, { netAmount: 650 } as any, c.manager)).rejects.toThrow(/factura es de horas/);
      await expect(invoices.update(inv.id, { taxAmount: 0 } as any, c.manager)).resolves.toBeDefined();
      await expect(invoices.update(inv.id, { description: 'Asesoría de septiembre' } as any, c.manager)).resolves.toBeDefined();
      await expectClean(c);
    });
  });

  // ═══ Lo facturado no se mueve ═══════════════════════════════════════════════════════════════════
  describe('horas ya facturadas', () => {
    it('no se reabre el mes de una persona con horas facturadas; tras anular la factura sí', async () => {
      const c = await seed();
      const { a1, a2 } = await standard(c);
      const inv = await invoiceHours(c, [a1.id, a2.id], 600);
      await expect(hoursClose.reopenPeriod({ userId: c.auditor.id, year: prev().year, month: prev().month, reason: 'Corregir horas del mes' } as any, c.manager))
        .rejects.toThrow(/ya facturadas/);
      // el senior no tiene horas facturadas: su mes sí se reabre
      await expect(hoursClose.reopenPeriod({ userId: c.senior.id, year: prev().year, month: prev().month, reason: 'Corregir horas del mes' } as any, c.manager)).resolves.toMatchObject({ reopened: true });
      await invoices.void(inv.id, { reason: 'Se emitió con horas equivocadas' } as any, c.cae);
      await expect(hoursClose.reopenPeriod({ userId: c.auditor.id, year: prev().year, month: prev().month, reason: 'Corregir horas del mes' } as any, c.manager)).resolves.toMatchObject({ reopened: true });
      await expectClean(c);
    });

    it('un ajuste que edita o borra una hora facturada se rechaza; agregar horas sí, y aparecen como nuevas por facturar', async () => {
      const c = await seed();
      const { a1, a2 } = await standard(c);
      // pedidos hechos ANTES de facturar
      const edit: any = await hoursClose.createAdjustment({ action: 'EDIT', timeEntryId: a1.id, changes: { hours: 9 }, reason: 'Se me olvidó una hora de trabajo' } as any, c.auditor);
      const del: any = await hoursClose.createAdjustment({ action: 'DELETE', timeEntryId: a2.id, reason: 'Esa hora estaba duplicada' } as any, c.auditor);
      const add: any = await hoursClose.createAdjustment({ action: 'ADD', entry: { workDate: day(6), hours: 3, category: 'CLIENT_BILLABLE', description: 'trabajo olvidado', auditId: c.audit.id }, reason: 'Hora no registrada' } as any, c.auditor);
      const inv = await invoiceHours(c, [a1.id, a2.id], 600);

      await expect(hoursClose.decideAdjustment(edit.id, { approve: true } as any, c.manager)).rejects.toThrow(new RegExp(inv.invoiceNumber));
      await expect(hoursClose.decideAdjustment(del.id, { approve: true } as any, c.manager)).rejects.toThrow(/ya se facturó/);
      expect((await prisma.timeAdjustmentRequest.findUniqueOrThrow({ where: { id: edit.id } })).status).toBe('PENDING');   // el rechazo deshizo el reclamo
      expect(await prisma.timeEntry.findUniqueOrThrow({ where: { id: a1.id } })).toMatchObject({ hours: 8 });
      // nuevo pedido sobre una hora ya facturada: se frena desde que se pide, sin revelar la factura
      await expect(hoursClose.createAdjustment({ action: 'DELETE', timeEntryId: a2.id, reason: 'Esa hora estaba duplicada otra vez' } as any, c.auditor)).rejects.toThrow(/ya se facturó al cliente/);
      // el gerente puede rechazar el pedido
      await expect(hoursClose.decideAdjustment(edit.id, { approve: false, note: 'Ya se facturó' } as any, c.manager)).resolves.toBeDefined();

      // agregar horas no toca lo facturado
      await expect(hoursClose.decideAdjustment(add.id, { approve: true } as any, c.manager)).resolves.toBeDefined();
      const v: any = await billable.list(c.eng.id, c.manager);
      const added = v.groups.flatMap((g: any) => g.entries).find((e: any) => e.afterClose);
      expect(added).toMatchObject({ hours: 3, amount: 150 });
      await expectClean(c);
    });
  });

  // ═══ La base impone lo importante ═══════════════════════════════════════════════════════════════
  describe('la base de datos', () => {
    it('una sola línea vigente por hora, monto = horas × tarifa, y separación entre organizaciones y encargos', async () => {
      const c = await seed();
      const { a1, a2 } = await standard(c);
      const inv = await invoiceHours(c, [a1.id], 400);
      const base = { organizationId: c.org.id, invoiceId: inv.id, engagementId: c.eng.id, createdById: c.manager.id };
      // la misma hora otra vez, vigente
      await expect(prisma.clientInvoiceHour.create({ data: { ...base, timeEntryId: a1.id, hours: 8, rate: 50, amount: 400 } })).rejects.toThrow();
      // monto que no es horas × tarifa
      await expect(prisma.clientInvoiceHour.create({ data: { ...base, timeEntryId: a2.id, hours: 4, rate: 50, amount: 199.99 } })).rejects.toThrow();
      // horas o tarifa en cero
      await expect(prisma.clientInvoiceHour.create({ data: { ...base, timeEntryId: a2.id, hours: 4, rate: 0, amount: 0 } })).rejects.toThrow();
      // una hora de OTRA organización
      const other = await seed();
      const foreign = await hour(other, other.auditor.id, 2, day(1));
      await expect(prisma.clientInvoiceHour.create({ data: { ...base, timeEntryId: foreign.id, hours: 2, rate: 50, amount: 100 } })).rejects.toThrow();
      // la factura no es de ese encargo
      const otherEng = await prisma.engagement.create({ data: { organizationId: c.org.id, clientId: c.client.id, kind: 'CONSULTING', title: 'Otra', fiscalYear: 2026, fiscalYearEndDate: new Date('2026-12-31'), createdById: c.cae.id } });
      await expect(prisma.clientInvoiceHour.create({ data: { ...base, engagementId: otherEng.id, timeEntryId: a2.id, hours: 4, rate: 50, amount: 200 } })).rejects.toThrow();
      // una correcta (hora distinta y liberada la anterior): entra
      await expect(prisma.clientInvoiceHour.create({ data: { ...base, timeEntryId: a2.id, hours: 4, rate: 50, amount: 200 } })).resolves.toBeDefined();
    });

    it('el redondeo por hora coincide con el CHECK de la base (0,3333 h a $10,55 y 1,5 h a $10,55)', async () => {
      const c = await seed();
      await prisma.auditTeam.updateMany({ where: { auditId: c.audit.id, userId: c.auditor.id }, data: { agreedRatePerHour: 10.55 } });
      const e1 = await hour(c, c.auditor.id, 0.3333, day(1)); const e2 = await hour(c, c.auditor.id, 1.5, day(2)); const e3 = await hour(c, c.auditor.id, 0.3333, day(3));
      await closeMonth(c, c.auditor.id);
      const v: any = await billable.list(c.eng.id, c.manager);
      const amounts = v.groups[0].entries.map((e: any) => e.amount).sort((a: number, b: number) => a - b);
      expect(amounts).toEqual([3.52, 3.52, 15.83]);
      const total = 3.52 + 3.52 + 15.83;
      const inv = await invoiceHours(c, [e1.id, e2.id, e3.id], Math.round(total * 100) / 100);
      expect(inv.netAmount).toBe(22.87);
      await expect(invoiceHours(c, [e1.id], 3.51)).rejects.toThrow();    // ya facturada (y además el neto no cuadra)
      await expectClean(c);
    });

    it('la comprobación de integridad detecta una hora facturada que cambió por fuera del servicio', async () => {
      const c = await seed();
      const { a1, a2 } = await standard(c);
      await invoiceHours(c, [a1.id, a2.id], 600);
      await expectClean(c);
      await prisma.timeEntry.update({ where: { id: a1.id }, data: { billRateSnapshot: 99 } });
      let found = await checkCollectionInvariants(prisma, c.org.id);
      expect(found.some((v) => /ya no coincide con su registro/.test(v.rule))).toBe(true);
      await prisma.timeEntry.update({ where: { id: a1.id }, data: { billRateSnapshot: 50, closedAt: null } });   // mes "reabierto" a mano
      found = await checkCollectionInvariants(prisma, c.org.id);
      expect(found.some((v) => /ya no coincide con su registro/.test(v.rule))).toBe(true);
    });
  });

  // ═══ El devengado a una fecha de corte ══════════════════════════════════════════════════════════
  describe('devengado por tiempo a una fecha de corte', () => {
    it('una hora cuenta como facturada solo desde la fecha de su factura, y una anulación posterior no cambia el pasado', async () => {
      const c = await seed();
      const { a1, a2 } = await standard(c);
      const invDate = addDays(T(), -5);
      const inv = await invoiceHours(c, [a1.id, a2.id], 600, { invoiceDate: invDate });

      const at = async (asOf: string) => (await fees.accrualAt(c.eng.id, asOf, c.manager)) as any;
      // un día antes de la factura: todo sin facturar (las horas de septiembre ya existían)
      expect(await at(addDays(invDate, -1))).toMatchObject({ invoicedNet: 0, toInvoice: 1000, time: { invoiceableHours: 17, invoiceableAmount: 1000 } });
      // el día de la factura y hoy: las 12 horas del auditor ya están facturadas
      expect(await at(invDate)).toMatchObject({ invoicedNet: 600, accrued: 1000, toInvoice: 400 });
      expect(await at(T())).toMatchObject({ invoicedNet: 600, toInvoice: 500 });          // hoy suma además las 2 h provisionales

      // se anula hoy: ayer seguía facturada; hoy vuelve a estar por facturar
      await invoices.void(inv.id, { reason: 'Se emitió con horas equivocadas' } as any, c.cae);
      expect(await at(addDays(T(), -1))).toMatchObject({ invoicedNet: 600, toInvoice: 400 });
      expect(await at(T())).toMatchObject({ invoicedNet: 0, toInvoice: 1100 });
      await expectClean(c);
    });
  });
});
