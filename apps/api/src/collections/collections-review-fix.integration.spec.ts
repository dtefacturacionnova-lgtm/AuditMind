/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { FeesService } from './fees.service';
import { InvoicesService } from './invoices.service';
import { PaymentsService } from './payments.service';
import { CreditNotesService } from './credit-notes.service';
import { CollectionNotesService } from './collection-notes.service';
import { CollectionReportsService } from './reports.service';
import { computeAccruals } from './accrual.service';
import { checkCollectionInvariants } from './invariants';
import { todayInSalvador, addDays, ymd } from './collections.common';

/**
 * Regresiones de la revisión independiente de 3c/3d (2026-10-25): cada prueba reproduce un defecto real y falla sin su arreglo.
 *
 *   COLLECTIONS_TEST_DATABASE_URL=postgresql://postgres:test@localhost:54329/cobros_test npx jest collections-review-fix
 */
const URL = process.env.COLLECTIONS_TEST_DATABASE_URL;
const suite = URL ? describe : describe.skip;
jest.setTimeout(120_000);

suite('revisión 3c/3d contra Postgres real', () => {
  let prisma: PrismaClient;
  let fees: FeesService; let invoices: InvoicesService; let payments: PaymentsService;
  let credits: CreditNotesService; let notes: CollectionNotesService; let reports: CollectionReportsService;

  beforeAll(async () => {
    const sep = (URL as string).includes('?') ? '&' : '?';
    prisma = new PrismaClient({ datasourceUrl: `${URL}${sep}connection_limit=12&pool_timeout=30` });
    await prisma.$connect();
    fees = new FeesService(prisma as any); invoices = new InvoicesService(prisma as any); payments = new PaymentsService(prisma as any);
    credits = new CreditNotesService(prisma as any); notes = new CollectionNotesService(prisma as any); reports = new CollectionReportsService(prisma as any);
  });
  afterAll(async () => { await prisma?.$disconnect(); });

  const today = () => todayInSalvador();
  let seq = 0;

  async function seed() {
    const tag = `${Date.now().toString(36)}${(seq++).toString(36)}${randomUUID().slice(0, 6)}`;
    const org = await prisma.organization.create({ data: { name: `Org ${tag}`, slug: `org-${tag}`, auditModality: 'EXTERNAL' } });
    const mk = (role: any, n: string) => prisma.user.create({ data: { organizationId: org.id, supabaseUserId: randomUUID(), email: `${n}-${tag}@t.test`, name: n, role } });
    const [cae, manager, auditor, staff] = await Promise.all([mk('CAE', 'cae'), mk('AUDIT_MANAGER', 'manager'), mk('AUDITOR', 'auditor'), mk('SENIOR_AUDITOR', 'staff')]);
    const au = (u: any) => ({ id: u.id, supabaseUserId: u.supabaseUserId, email: u.email, name: u.name, role: u.role, organizationId: org.id, aiAssistantPersonality: 'ATHENA' });
    const client = (n: string) => prisma.client.create({ data: { organizationId: org.id, legalName: `Cliente ${n} ${tag}`, status: 'ACTIVE', createdById: cae.id } });
    const [clientA, clientB] = [await client('A'), await client('B')];
    const eng = (c: any, fiscalYear = 2026) => prisma.engagement.create({ data: { organizationId: org.id, clientId: c.id, fiscalYear, fiscalYearEndDate: new Date(`${fiscalYear}-12-31`), createdById: cae.id } });
    const [engA, engB] = [await eng(clientA), await eng(clientB)];
    return { org, cae: au(cae), manager: au(manager), auditor: au(auditor), staff, clientA, clientB, engA, engB, tag, newEngagement: eng };
  }
  type Ctx = Awaited<ReturnType<typeof seed>>;

  let nSeq = 0;
  const num = (kind = '03') => `DTE-${kind}-M001P001-${String(++nSeq).padStart(15, '0')}`;
  const setFee = (c: Ctx, total: number, o: any = {}, eng = c.engA) => fees.setFee(eng.id, { feeType: 'FIXED', totalAmount: total, ...o } as any, c.cae);
  const invoice = (c: Ctx, net: number, o: any = {}, eng = c.engA) =>
    invoices.register({ engagementId: eng.id, invoiceNumber: num(), documentType: '03', invoiceDate: today(), netAmount: net, taxAmount: Math.round(net * 13) / 100, ...o } as any, c.manager) as Promise<any>;
  const credit = (c: Ctx, invoiceId: string, net: number, o: any = {}) =>
    credits.register(invoiceId, { creditNoteNumber: num('05'), netAmount: net, taxAmount: 0, reason: 'Ajuste acordado con el cliente por horas no trabajadas.', ...o } as any, c.cae) as Promise<any>;
  const expectClean = async (c: Ctx) => expect(await checkCollectionInvariants(prisma, c.org.id)).toEqual([]);

  // ═══ Notas de crédito: IVA y fechas retroactivas ═══════════════════════════════════════════════
  describe('notas de crédito', () => {
    it('el IVA acreditado no puede pasar del IVA de la factura (neto 1 + IVA 112 ya no salda 100 + 13)', async () => {
      const c = await seed();
      await setFee(c, 1000);
      const a = await invoice(c, 100); // 100 + 13
      await expect(credit(c, a.id, 1, { taxAmount: 112 })).rejects.toThrow(/IVA/);
      expect(Number((await prisma.clientInvoice.findUniqueOrThrow({ where: { id: a.id } })).creditedAmount)).toBe(0);

      // el IVA se acumula entre notas: 6 + 8 = 14 > 13 (el neto y el saldo sí alcanzarían)
      await credit(c, a.id, 50, { taxAmount: 6 });
      await expect(credit(c, a.id, 40, { taxAmount: 8 })).rejects.toThrow(/IVA/);
      await expect(credit(c, a.id, 40, { taxAmount: 7 })).resolves.toBeDefined();
      await expectClean(c);
    });

    it('la comprobación de invariantes detecta una nota con IVA de más aunque se haya metido saltándose el servicio', async () => {
      const c = await seed();
      await setFee(c, 1000);
      const a = await invoice(c, 100);
      await prisma.clientCreditNote.create({
        data: {
          organizationId: c.org.id, clientId: c.clientA.id, engagementId: c.engA.id, invoiceId: a.id, creditNoteNumber: num('05'), issueDate: new Date(),
          reason: 'Ajuste acordado con el cliente.', netAmount: 1, taxAmount: 112, totalAmount: 113, createdById: c.cae.id,
        },
      });
      const found = await checkCollectionInvariants(prisma, c.org.id);
      expect(found.some((v) => /más IVA/.test(v.rule) && v.ids.includes(a.id))).toBe(true);
    });

    it('una nota con fecha pasada no puede dejar la factura con saldo negativo en el pasado (cobro aplicado y luego quitado)', async () => {
      const c = await seed();
      await setFee(c, 1000);
      const T = today();
      const a = await invoice(c, 100, { invoiceDate: addDays(T, -20), dueDate: addDays(T, 10) }); // 113
      const p = await payments.register({ clientId: c.clientA.id, paymentDate: addDays(T, -15), amount: 113, method: 'TRANSFER', applications: [{ invoiceId: a.id, amount: 113 }] } as any, c.manager) as any;
      const app = await prisma.paymentApplication.findFirstOrThrow({ where: { paymentId: p.id } });
      await payments.unapply(p.id, app.id, { reason: 'El cheque rebotó en el banco' } as any, c.cae);
      // hoy la factura vuelve a deber 113, pero entre T−15 y hoy estuvo saldada: una nota fechada T−12 la dejaría en −113 en ese lapso
      await expect(credit(c, a.id, 100, { taxAmount: 13, issueDate: addDays(T, -12) })).rejects.toThrow(/saldo negativo/);
      // con la fecha de hoy sí cabe
      await expect(credit(c, a.id, 100, { taxAmount: 13 })).resolves.toBeDefined();
      await expectClean(c);
    });

    it('la antigüedad no esconde un saldo negativo del pasado: lo reporta como anomalía', async () => {
      const c = await seed();
      await setFee(c, 1000);
      const T = today();
      const a = await invoice(c, 100, { invoiceDate: addDays(T, -20), dueDate: addDays(T, 10) });
      await payments.register({ clientId: c.clientA.id, paymentDate: addDays(T, -15), amount: 113, method: 'TRANSFER', applications: [{ invoiceId: a.id, amount: 113 }] } as any, c.manager);
      // se mete a la fuerza (saltándose el servicio) una nota que la deja en −113 desde T−12
      await prisma.clientCreditNote.create({
        data: {
          organizationId: c.org.id, clientId: c.clientA.id, engagementId: c.engA.id, invoiceId: a.id, creditNoteNumber: num('05'), issueDate: new Date(`${addDays(T, -12)}T00:00:00Z`),
          reason: 'Ajuste acordado con el cliente.', netAmount: 100, taxAmount: 13, totalAmount: 113, createdById: c.cae.id,
        },
      });
      const r: any = await reports.aging({ asOf: addDays(T, -5) } as any, c.manager);
      expect(r.anomalies).toEqual([{ invoiceId: a.id, invoiceNumber: a.invoiceNumber, balance: -113 }]);
      expect(r.clients).toEqual([]); // el saldo positivo sigue siendo cero
      // antes de la nota todo estaba normal
      expect(((await reports.aging({ asOf: addDays(T, -13) } as any, c.manager)) as any).anomalies).toEqual([]);
    });
  });

  // ═══ Fechas de cobros, retenciones y facturas ══════════════════════════════════════════════════
  describe('fechas que mueven el pasado', () => {
    it('un cobro anterior a la factura la aplica con la fecha de la factura, no con la suya', async () => {
      const c = await seed();
      await setFee(c, 1000);
      const T = today();
      const a = await invoice(c, 100, { invoiceDate: addDays(T, -5), dueDate: addDays(T, 25) });
      const p = await payments.register({ clientId: c.clientA.id, paymentDate: addDays(T, -10), amount: 113, method: 'TRANSFER', applications: [{ invoiceId: a.id, amount: 113 }] } as any, c.manager) as any;
      const app = await prisma.paymentApplication.findFirstOrThrow({ where: { paymentId: p.id } });
      expect(ymd(app.appliedOn)).toBe(addDays(T, -5));
      // el estado de cuenta cuadra a cualquier fecha: antes de la factura no había nada, después ya estaba saldada
      const st: any = await reports.statement(c.clientA.id, { asOf: addDays(T, -7) } as any, c.manager);
      expect(st.closingBalance).toBe(0);
      expect((await reports.statement(c.clientA.id, {} as any, c.manager) as any).reconciles).toBe(true);
      await expectClean(c);
    });

    it('la retención no puede ser anterior a la factura', async () => {
      const c = await seed();
      await setFee(c, 1000);
      const T = today();
      const a = await invoice(c, 100, { invoiceDate: addDays(T, -10), dueDate: addDays(T, 20) });
      await expect(invoices.addWithholding(a.id, { taxType: 'IVA', amount: 1, appliedOn: addDays(T, -30) } as any, c.manager)).rejects.toThrow(/anterior a la factura/);
      await expect(invoices.addWithholding(a.id, { taxType: 'IVA', amount: 1, appliedOn: addDays(T, -10) } as any, c.manager)).resolves.toBeDefined();
    });

    it('la fecha de la factura no se mueve después de su primer movimiento, pero sí hacia atrás', async () => {
      const c = await seed();
      await setFee(c, 1000);
      const T = today();
      const a = await invoice(c, 100, { invoiceDate: addDays(T, -10), dueDate: addDays(T, 20) });
      await payments.register({ clientId: c.clientA.id, paymentDate: addDays(T, -5), amount: 50, method: 'TRANSFER', applications: [{ invoiceId: a.id, amount: 50 }] } as any, c.manager);
      await expect(invoices.update(a.id, { invoiceDate: addDays(T, -2) } as any, c.manager)).rejects.toThrow(/primer movimiento/);
      await expect(invoices.update(a.id, { invoiceDate: addDays(T, -12) } as any, c.manager)).resolves.toBeDefined();
      await expectClean(c);
    });

    it('la fecha de un cobro con aplicaciones (vigentes o quitadas) no se cambia; sin ellas sí', async () => {
      const c = await seed();
      await setFee(c, 1000);
      const T = today();
      const a = await invoice(c, 100, { invoiceDate: addDays(T, -10), dueDate: addDays(T, 20) });
      const p = await payments.register({ clientId: c.clientA.id, paymentDate: addDays(T, -5), amount: 50, method: 'TRANSFER', applications: [{ invoiceId: a.id, amount: 50 }] } as any, c.manager) as any;
      await expect(payments.update(p.id, { paymentDate: addDays(T, -2) } as any, c.manager)).rejects.toThrow(/fecha no se cambia/);
      const app = await prisma.paymentApplication.findFirstOrThrow({ where: { paymentId: p.id } });
      await payments.unapply(p.id, app.id, { reason: 'El cheque rebotó en el banco' } as any, c.cae);
      await expect(payments.update(p.id, { paymentDate: addDays(T, -2) } as any, c.manager)).rejects.toThrow(/fecha no se cambia/); // «tuvo» aplicaciones

      const free = await payments.register({ clientId: c.clientA.id, paymentDate: addDays(T, -5), amount: 30, method: 'TRANSFER' } as any, c.manager) as any;
      await expect(payments.update(free.id, { paymentDate: addDays(T, -2) } as any, c.manager)).resolves.toBeDefined();
      await expectClean(c);
    });
  });

  // ═══ Honorario: adendas y calendario ═══════════════════════════════════════════════════════════
  describe('honorario y calendario', () => {
    it('una adenda no puede tener fecha futura (descuadraría el devengado de hoy)', async () => {
      const c = await seed();
      await setFee(c, 1000);
      await expect(fees.amendFee(c.engA.id, { date: addDays(today(), 3), reason: 'Alcance ampliado', amountDelta: 100 } as any, c.cae)).rejects.toThrow(/futura/);
      await expect(fees.amendFee(c.engA.id, { date: today(), reason: 'Alcance ampliado', amountDelta: 100 } as any, c.cae)).resolves.toBeDefined();
    });

    it('regenerar el calendario no borra hitos ya cumplidos: avisa y deja el calendario intacto', async () => {
      const c = await seed();
      await setFee(c, 1000, { progressMethod: 'MILESTONES' });
      const h1: any = await fees.createItem(c.engA.id, { label: 'Planificación', kind: 'MILESTONE', dueDate: addDays(today(), 10), amount: 300 } as any, c.cae);
      await fees.createItem(c.engA.id, { label: 'Informe', kind: 'MILESTONE', dueDate: addDays(today(), 60), amount: 700 } as any, c.cae);
      await fees.setItemCompletion(h1.id, today(), c.manager);

      await expect(fees.generateSchedule(c.engA.id, { mode: 'EQUAL', count: 2, firstDate: addDays(today(), 30), everyMonths: 1 } as any, c.cae)).rejects.toThrow(/hito\(s\) cumplido/);
      expect((await prisma.billingScheduleItem.findUniqueOrThrow({ where: { id: h1.id } })).completedAt).not.toBeNull();

      // desmarcado, ya se puede regenerar
      await fees.setItemCompletion(h1.id, null, c.manager);
      await expect(fees.generateSchedule(c.engA.id, { mode: 'EQUAL', count: 2, firstDate: addDays(today(), 30), everyMonths: 1 } as any, c.cae)).resolves.toBeDefined();
    });
  });

  // ═══ Devengado ═════════════════════════════════════════════════════════════════════════════════
  describe('devengado', () => {
    async function withAudit(c: Ctx, budget: Array<{ userId: string; hours: number | null }>) {
      const audit = await prisma.audit.create({ data: { organizationId: c.org.id, title: 'Auditoría EEFF', type: 'EXTERNAL_FINANCIAL', leadAuditorId: c.manager.id } });
      await prisma.engagement.update({ where: { id: c.engA.id }, data: { auditId: audit.id, status: 'APPROVED' } });
      for (const b of budget) await prisma.auditTeam.create({ data: { auditId: audit.id, userId: b.userId, role: 'AUDITOR', budgetedHours: b.hours } });
      return audit;
    }
    const hours = (c: Ctx, auditId: string, userId: string, h: number, workDate: string) =>
      prisma.timeEntry.create({ data: { organizationId: c.org.id, userId, auditId, workDate: new Date(`${workDate}T00:00:00Z`), hours: h, category: 'CLIENT_BILLABLE', description: 'trabajo' } });

    it('una persona con horas facturables y presupuesto en CERO no completa el presupuesto: el avance es nulo', async () => {
      const c = await seed();
      await setFee(c, 1000);
      const audit = await withAudit(c, [{ userId: c.auditor.id, hours: 0 }, { userId: c.staff.id, hours: 100 }]);
      await hours(c, audit.id, c.auditor.id, 5, addDays(today(), -1));
      const v: any = (await fees.getFee(c.engA.id, c.manager) as any).accrual;
      expect(v).toMatchObject({ progressPct: null, accrued: null, missing: 'NO_BUDGET' });
    });

    it('un encargo cancelado no devenga', async () => {
      const c = await seed();
      await setFee(c, 1000, { progressMethod: 'MANUAL', manualProgressPct: 50 });
      expect((await computeAccruals(prisma as any, c.org.id, [c.engA.id])).get(c.engA.id)).toMatchObject({ accrued: 500 });
      await prisma.engagement.update({ where: { id: c.engA.id }, data: { status: 'CANCELLED' } });
      expect((await computeAccruals(prisma as any, c.org.id, [c.engA.id])).has(c.engA.id)).toBe(false);
    });
  });

  // ═══ Gestión de cobro ══════════════════════════════════════════════════════════════════════════
  describe('gestión de cobro', () => {
    it('una nota ligada a una factura toma el encargo de la factura; un encargo distinto se rechaza', async () => {
      const c = await seed();
      await setFee(c, 1000);
      const a = await invoice(c, 100);
      const n: any = await notes.create({ clientId: c.clientA.id, invoiceId: a.id, method: 'CALL', note: 'Se llamó por la factura' } as any, c.manager);
      expect(n.engagementId).toBe(c.engA.id);
      expect((await prisma.collectionNote.findUniqueOrThrow({ where: { id: n.id } })).engagementId).toBe(c.engA.id);

      const other = await c.newEngagement(c.clientA, 2027); // otro encargo del MISMO cliente
      await expect(notes.create({ clientId: c.clientA.id, invoiceId: a.id, engagementId: other.id, method: 'CALL', note: 'encargo que no es el de la factura' } as any, c.manager)).rejects.toThrow(/no pertenece al encargo/);
      await expect(notes.create({ clientId: c.clientA.id, invoiceId: a.id, engagementId: c.engA.id, method: 'CALL', note: 'encargo correcto, indicado' } as any, c.manager)).resolves.toBeDefined();
    });

    it('la base amarra el encargo de la nota a la organización y a la factura', async () => {
      const c = await seed();
      await setFee(c, 1000);
      const a = await invoice(c, 100);
      const names = (await prisma.$queryRaw<{ conname: string }[]>`SELECT conname FROM pg_constraint WHERE conrelid = 'collection_notes'::regclass AND contype = 'f'`).map((r) => r.conname);
      expect(names).toEqual(expect.arrayContaining(['collection_notes_engagement_org_fkey', 'collection_notes_invoice_engagement_fkey']));

      const other = await c.newEngagement(c.clientA, 2027);
      const base = { organizationId: c.org.id, clientId: c.clientA.id, contactedOn: new Date(), method: 'CALL' as const, note: 'nota de prueba', createdById: c.cae.id };
      await expect(prisma.collectionNote.create({ data: { ...base, invoiceId: a.id, engagementId: other.id } })).rejects.toThrow();            // la factura no es de ese encargo
      await expect(prisma.collectionNote.create({ data: { ...base, invoiceId: a.id, engagementId: c.engA.id } })).resolves.toBeDefined();         // coincide
      const foreign = await seed();
      await expect(prisma.collectionNote.create({ data: { ...base, engagementId: foreign.engA.id } })).rejects.toThrow();                        // encargo de otra organización
    });

    it('las alertas cuentan en la base: con cientos de notas viejas el seguimiento de hoy sale y los conteos son exactos', async () => {
      const c = await seed();
      await setFee(c, 1000, {}, c.engA);
      await setFee(c, 1000, {}, c.engB);
      const T = today();
      const old = new Date(Date.now() - 90 * 86_400_000);
      // 520 notas viejas del cliente A, 205 de ellas con promesa vencida (más que el tope de 200 de la lista)
      await prisma.collectionNote.createMany({
        data: Array.from({ length: 520 }, (_, i) => ({
          organizationId: c.org.id, clientId: c.clientA.id, contactedOn: new Date(`${addDays(T, -60)}T00:00:00Z`), method: 'CALL' as const, note: `nota vieja ${i}`, createdById: c.cae.id, createdAt: old,
          ...(i < 205 ? { promiseDate: new Date(`${addDays(T, -30)}T00:00:00Z`), promiseStatus: 'PENDING' as const, promiseAmount: 10 } : {}),
        })),
      });
      // el cliente B tiene UNA nota reciente que pide seguimiento hoy
      await notes.create({ clientId: c.clientB.id, method: 'EMAIL', note: 'Se envió el estado de cuenta', nextFollowUpOn: T } as any, c.manager);

      const al: any = await notes.alerts({} as any, c.manager);
      expect(al.counts.followUps).toBe(1);
      expect(al.followUps).toHaveLength(1);
      expect(al.followUps[0].clientId).toBe(c.clientB.id);
      expect(al.counts.overduePromises).toBe(205);       // el conteo es exacto…
      expect(al.overduePromises).toHaveLength(200);      // …y la lista llega al tope
    });
  });
});
