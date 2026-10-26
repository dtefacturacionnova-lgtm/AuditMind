/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { ForbiddenException } from '@nestjs/common';
import { FeesService } from './fees.service';
import { InvoicesService } from './invoices.service';
import { PaymentsService } from './payments.service';
import { CreditNotesService } from './credit-notes.service';
import { WriteOffsService } from './write-offs.service';
import { CollectionReportsService } from './reports.service';
import { checkCollectionInvariants } from './invariants';
import { todayInSalvador, addDays } from './collections.common';
import { ProfitabilityService } from '../portfolio/profitability.service';

/**
 * Cobranza fase 3c — antigüedad y estado de cuenta a una fecha de corte, y devengado — contra un Postgres REAL.
 *
 *   COLLECTIONS_TEST_DATABASE_URL=postgresql://postgres:test@localhost:54329/cobros_test npx jest collections-3c.integration
 */
const URL = process.env.COLLECTIONS_TEST_DATABASE_URL;
const suite = URL ? describe : describe.skip;
jest.setTimeout(120_000);

suite('cobranza 3c contra Postgres real', () => {
  let prisma: PrismaClient;
  let fees: FeesService; let invoices: InvoicesService; let payments: PaymentsService;
  let credits: CreditNotesService; let writeOffs: WriteOffsService; let reports: CollectionReportsService; let profit: ProfitabilityService;

  beforeAll(async () => {
    const sep = (URL as string).includes('?') ? '&' : '?';
    prisma = new PrismaClient({ datasourceUrl: `${URL}${sep}connection_limit=12&pool_timeout=30` });
    await prisma.$connect();
    fees = new FeesService(prisma as any); invoices = new InvoicesService(prisma as any); payments = new PaymentsService(prisma as any);
    credits = new CreditNotesService(prisma as any); writeOffs = new WriteOffsService(prisma as any); reports = new CollectionReportsService(prisma as any);
    profit = new ProfitabilityService(prisma as any);
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
    const eng = (c: any) => prisma.engagement.create({ data: { organizationId: org.id, clientId: c.id, fiscalYear: 2026, fiscalYearEndDate: new Date('2026-12-31'), createdById: cae.id } });
    const [engA, engB] = [await eng(clientA), await eng(clientB)];
    return { org, cae: au(cae), manager: au(manager), auditor: au(auditor), staff, clientA, clientB, engA, engB, tag };
  }
  type Ctx = Awaited<ReturnType<typeof seed>>;

  let nSeq = 0;
  const num = (kind = '03') => `DTE-${kind}-M001P001-${String(++nSeq).padStart(15, '0')}`;
  const invoice = (c: Ctx, net: number, o: any = {}, eng = c.engA) =>
    invoices.register({ engagementId: eng.id, invoiceNumber: num(), documentType: '03', invoiceDate: today(), netAmount: net, taxAmount: Math.round(net * 13) / 100, ...o } as any, c.manager) as Promise<any>;
  const expectClean = async (c: Ctx) => expect(await checkCollectionInvariants(prisma, c.org.id)).toEqual([]);
  const row = (rows: any[], clientId: string) => rows.find((r) => r.clientId === clientId);

  // ═══ Antigüedad y estado de cuenta ══════════════════════════════════════════════════════════════
  describe('antigüedad y estado de cuenta a una fecha de corte', () => {
    it('reconstruye el pasado con las fechas de cada movimiento: una reversa de hoy no reescribe los saldos anteriores', async () => {
      const c = await seed();
      await fees.setFee(c.engA.id, { feeType: 'FIXED', totalAmount: 5000 } as any, c.cae);
      const T = today();
      const a = await invoice(c, 100, { invoiceDate: addDays(T, -100), dueDate: addDays(T, -70) }); // total 113
      const p = await payments.register({ clientId: c.clientA.id, paymentDate: addDays(T, -60), amount: 40, method: 'TRANSFER', applications: [{ invoiceId: a.id, amount: 40 }] } as any, c.manager) as any;
      await credits.register(a.id, { creditNoteNumber: num('05'), issueDate: addDays(T, -30), netAmount: 10, taxAmount: 0, reason: 'Ajuste acordado con el cliente.' } as any, c.cae);
      await writeOffs.register(a.id, { amount: 15, writtenOffOn: addDays(T, -10), reason: 'Se agotaron las gestiones de cobro.' } as any, c.cae);

      const at = async (asOf: string) => (await reports.aging({ asOf } as any, c.manager) as any);
      expect((await at(addDays(T, -101))).clients).toEqual([]);                                  // la factura aún no existía
      expect(row((await at(addDays(T, -65))).clients, c.clientA.id)).toMatchObject({ total: 113, buckets: { D1_30: 113 } }); // vencida hace 5 días
      expect(row((await at(addDays(T, -55))).clients, c.clientA.id).total).toBe(73);              // − cobro de 40 (T−60)
      expect(row((await at(addDays(T, -20))).clients, c.clientA.id).total).toBe(63);              // − nota de crédito de 10 (T−30)
      expect(row((await at(addDays(T, -5))).clients, c.clientA.id)).toMatchObject({ total: 48, buckets: { D61_90: 48 } }); // − castigo de 15 (T−10); al T−5 lleva 65 días vencida
    });

    it('quitar una aplicación HOY sube el saldo de hoy pero no el de ayer', async () => {
      const c = await seed();
      await fees.setFee(c.engA.id, { feeType: 'FIXED', totalAmount: 5000 } as any, c.cae);
      const T = today();
      const a = await invoice(c, 100, { invoiceDate: addDays(T, -20), dueDate: addDays(T, 10) });
      const p = await payments.register({ clientId: c.clientA.id, paymentDate: addDays(T, -15), amount: 113, method: 'TRANSFER', applications: [{ invoiceId: a.id, amount: 113 }] } as any, c.manager) as any;
      const app = await prisma.paymentApplication.findFirstOrThrow({ where: { paymentId: p.id } });
      expect((await reports.aging({} as any, c.manager) as any).clients).toEqual([]);              // saldada
      await payments.unapply(p.id, app.id, { reason: 'El cheque rebotó en el banco' } as any, c.cae);

      const now = await reports.aging({ detail: 'true' } as any, c.manager) as any;
      expect(row(now.clients, c.clientA.id)).toMatchObject({ total: 113, buckets: { CURRENT: 113 } });
      expect(row(now.clients, c.clientA.id).invoices[0]).toMatchObject({ invoiceNumber: a.invoiceNumber, balance: 113, bucket: 'CURRENT', overdueDays: 0 });
      // ayer la factura seguía saldada: la reversa de hoy no cambia el pasado
      expect((await reports.aging({ asOf: addDays(T, -1) } as any, c.manager) as any).clients).toEqual([]);
      // y el cobro anulado/quitado deja saldo a favor: 113 recibidos sin aplicar
      expect(now.unappliedCredit).toBe(113);
      await expectClean(c);
    });

    it('estado de cuenta: líneas con saldo corrido, saldo de apertura con «desde», y el cierre coincide con la antigüedad', async () => {
      const c = await seed();
      await fees.setFee(c.engA.id, { feeType: 'FIXED', totalAmount: 5000 } as any, c.cae);
      const T = today();
      const a = await invoice(c, 100, { invoiceDate: addDays(T, -50), dueDate: addDays(T, -20), withholdings: [{ taxType: 'IVA', amount: 1 }] });
      await payments.register({ clientId: c.clientA.id, paymentDate: addDays(T, -30), amount: 50, method: 'TRANSFER', applications: [{ invoiceId: a.id, amount: 50 }] } as any, c.manager);
      const b = await invoice(c, 200, { invoiceDate: addDays(T, -5), dueDate: addDays(T, 25) }); // 226
      await credits.register(b.id, { creditNoteNumber: num('05'), issueDate: addDays(T, -2), netAmount: 20, taxAmount: 0, reason: 'Ajuste acordado con el cliente.' } as any, c.cae);
      const voidedInv = await invoice(c, 10, { invoiceDate: addDays(T, -40), dueDate: addDays(T, -10) });
      await invoices.void(voidedInv.id, { reason: 'Se emitió con un monto equivocado' } as any, c.cae);

      const st = await reports.statement(c.clientA.id, {} as any, c.manager) as any;
      expect(st.client.id).toBe(c.clientA.id);
      expect(st.reconciles).toBe(true);
      const aging = row((await reports.aging({} as any, c.manager) as any).clients, c.clientA.id);
      expect(st.closingBalance).toBe(aging.total);
      expect(st.closingBalance).toBe(113 - 1 - 50 + 226 - 20);            // 268
      expect(st.lines.map((l: any) => l.kind)).toEqual(expect.arrayContaining(['INVOICE', 'WITHHOLDING', 'APPLICATION', 'CREDIT_NOTE', 'INVOICE_VOIDED']));
      expect(st.lines[st.lines.length - 1].balance).toBe(268);
      expect(st.openInvoices).toHaveLength(2);

      // con «desde» lo anterior se resume en el saldo de apertura
      const from = addDays(T, -10);
      const partial = await reports.statement(c.clientA.id, { from } as any, c.manager) as any;
      expect(partial.openingBalance).toBe(113 - 1 - 50 + 11.3);          // 73.30: la factura A, su retención y el cobro, más la factura anulada HOY (que antes de hoy sí existía)
      expect(partial.lines.every((l: any) => l.date >= from)).toBe(true);
      expect(partial.closingBalance).toBe(268);

      // al pasado: antes de la factura B el cierre era el de A
      const past = await reports.statement(c.clientA.id, { asOf: addDays(T, -20) } as any, c.manager) as any;
      expect(past.closingBalance).toBe(73.3);                              // al día −20 la factura que hoy está anulada todavía se debía
      expect(past.reconciles).toBe(true);
    });

    it('permisos y reglas: gerente o superior, sin fechas futuras, y otra organización no ve nada', async () => {
      const c = await seed();
      await expect(reports.aging({} as any, c.auditor)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(reports.aging({ asOf: addDays(today(), 1) } as any, c.manager)).rejects.toThrow(/futura/);
      await expect(reports.statement(c.clientA.id, { asOf: addDays(today(), 1) } as any, c.manager)).rejects.toThrow(/futura/);
      await expect(reports.statement(c.clientA.id, { from: addDays(today(), 0), asOf: addDays(today(), -3) } as any, c.manager)).rejects.toThrow(/posterior/);
      const other = await seed();
      await fees.setFee(c.engA.id, { feeType: 'FIXED', totalAmount: 5000 } as any, c.cae);
      await invoice(c, 100);
      expect(((await reports.aging({} as any, other.manager)) as any).clients).toEqual([]);
      await expect(reports.statement(c.clientA.id, {} as any, other.manager)).rejects.toThrow(/no encontrado/);
    });

    it('el filtro por cliente y el detalle por factura', async () => {
      const c = await seed();
      await fees.setFee(c.engA.id, { feeType: 'FIXED', totalAmount: 5000 } as any, c.cae);
      await fees.setFee(c.engB.id, { feeType: 'FIXED', totalAmount: 5000 } as any, c.cae);
      await invoice(c, 100);
      await invoice(c, 200, {}, c.engB);
      const all = await reports.aging({} as any, c.manager) as any;
      expect(all.clients).toHaveLength(2);
      expect(all.total).toBe(113 + 226);
      const one = await reports.aging({ clientId: c.clientB.id, detail: 'true' } as any, c.manager) as any;
      expect(one.clients).toHaveLength(1);
      expect(one.clients[0].invoices).toHaveLength(1);
      expect(one.total).toBe(226);
      expect((await reports.aging({} as any, c.manager) as any).clients[0].invoices).toBeUndefined(); // sin «detail» no se manda
    });
  });

  // ═══ Devengado ══════════════════════════════════════════════════════════════════════════════════
  describe('devengado', () => {
    /** Encargo con auditoría real, equipo con presupuesto de horas y un perfil de costo. */
    async function withAudit(c: Ctx, budget: Array<{ userId: string; hours: number | null }>) {
      const audit = await prisma.audit.create({ data: { organizationId: c.org.id, title: 'Auditoría EEFF', type: 'EXTERNAL_FINANCIAL', leadAuditorId: c.manager.id } });
      await prisma.engagement.update({ where: { id: c.engA.id }, data: { auditId: audit.id, status: 'APPROVED' } });
      for (const b of budget) await prisma.auditTeam.create({ data: { auditId: audit.id, userId: b.userId, role: 'AUDITOR', budgetedHours: b.hours } });
      return audit;
    }
    const hours = (c: Ctx, auditId: string, userId: string, h: number, workDate: string, category: any = 'CLIENT_BILLABLE') =>
      prisma.timeEntry.create({ data: { organizationId: c.org.id, userId, auditId, workDate: new Date(`${workDate}T00:00:00Z`), hours: h, category, description: 'trabajo' } });

    it('por horas: avance = horas facturables ÷ presupuesto; sin presupuesto completo es nulo; el informe final firmado lo lleva a 100 %', async () => {
      const c = await seed();
      await fees.setFee(c.engA.id, { feeType: 'FIXED', totalAmount: 1000 } as any, c.cae);
      const audit = await withAudit(c, [{ userId: c.auditor.id, hours: 100 }, { userId: c.staff.id, hours: null }]);
      await hours(c, audit.id, c.auditor.id, 25, addDays(today(), -3));
      await hours(c, audit.id, c.auditor.id, 10, addDays(today(), -2), 'CLIENT_NON_BILLABLE'); // no cuenta
      await invoice(c, 100);

      let v: any = (await fees.getFee(c.engA.id, c.manager) as any).accrual;
      expect(v).toMatchObject({ progressPct: 25, accrued: 250, toInvoice: 150, invoicedNet: 100, billableHours: 25, budgetHours: 100, basis: 'HOURS', missing: null });

      // alguien con horas facturables y SIN presupuesto: el presupuesto no está completo → nulo, no se inventa
      await hours(c, audit.id, c.staff.id, 5, addDays(today(), -1));
      v = (await fees.getFee(c.engA.id, c.manager) as any).accrual;
      expect(v).toMatchObject({ progressPct: null, accrued: null, toInvoice: null, missing: 'NO_BUDGET', billableHours: 30 });
      await prisma.auditTeam.updateMany({ where: { auditId: audit.id, userId: c.staff.id }, data: { budgetedHours: 100 } });
      v = (await fees.getFee(c.engA.id, c.manager) as any).accrual;
      expect(v).toMatchObject({ progressPct: 15, accrued: 150, budgetHours: 200 });

      // al corte de hace 2 días solo cuentan las horas de entonces
      const past: any = await fees.accrualAt(c.engA.id, addDays(today(), -2), c.manager);
      expect(past).toMatchObject({ billableHours: 25, progressPct: 12.5, accrued: 125, invoicedNet: 0 }); // la factura es de hoy
      await expect(fees.accrualAt(c.engA.id, addDays(today(), 1), c.manager)).rejects.toThrow(/futura/);
      await expect(fees.accrualAt(c.engA.id, undefined, c.auditor)).rejects.toBeInstanceOf(ForbiddenException);

      // informe final firmado → 100 % aunque las horas no lleguen al presupuesto
      await prisma.workingPaper.create({ data: { auditId: audit.id, code: 'PT-FIN', indexSection: 'Z', title: 'Informe final', type: 'PLANNING_UNDERSTANDING' as any, isCompletionTrigger: true, status: 'SIGNED_OFF' as any, signedOffAt: new Date() } });
      v = (await fees.getFee(c.engA.id, c.manager) as any).accrual;
      expect(v).toMatchObject({ progressPct: 100, accrued: 1000, toInvoice: 900, basis: 'COMPLETION', completionDone: true });
      // pero al corte de hace 2 días el informe aún no estaba firmado
      expect(((await fees.accrualAt(c.engA.id, addDays(today(), -2), c.manager)) as any).completionDone).toBe(false);
    });

    it('una adenda posterior al corte no cuenta en el honorario de entonces, y una nota de crédito sube lo «por facturar»', async () => {
      const c = await seed();
      await fees.setFee(c.engA.id, { feeType: 'FIXED', totalAmount: 1000, progressMethod: 'MANUAL', manualProgressPct: 50 } as any, c.cae);
      const a = await invoice(c, 400);
      await fees.amendFee(c.engA.id, { date: today(), reason: 'Alcance ampliado', amountDelta: 500 } as any, c.cae);
      let v: any = (await fees.getFee(c.engA.id, c.manager) as any).accrual;
      expect(v).toMatchObject({ feeTotal: 1500, accrued: 750, invoicedNet: 400, toInvoice: 350, basis: 'MANUAL' });
      v = await fees.accrualAt(c.engA.id, addDays(today(), -1), c.manager);
      expect(v.feeTotal).toBe(1000);   // la adenda es de hoy
      expect(v.invoicedNet).toBe(0);   // y la factura también

      await credits.register(a.id, { creditNoteNumber: num('05'), netAmount: 100, taxAmount: 0, reason: 'Ajuste acordado con el cliente.' } as any, c.cae);
      v = (await fees.getFee(c.engA.id, c.manager) as any).accrual;
      expect(v).toMatchObject({ invoicedNet: 300, toInvoice: 450 });
      await expectClean(c);
    });

    it('por hitos: suma las cuotas cumplidas, con su fecha; marcar es de un gerente, no de un auditor', async () => {
      const c = await seed();
      await fees.setFee(c.engA.id, { feeType: 'FIXED', totalAmount: 1000, progressMethod: 'MILESTONES' } as any, c.cae);
      const h1: any = await fees.createItem(c.engA.id, { label: 'Planificación', kind: 'MILESTONE', dueDate: addDays(today(), 10), amount: 300 } as any, c.cae);
      await fees.createItem(c.engA.id, { label: 'Informe', kind: 'MILESTONE', dueDate: addDays(today(), 60), amount: 700 } as any, c.cae);
      expect(((await fees.getFee(c.engA.id, c.manager)) as any).accrual).toMatchObject({ progressPct: 0, accrued: 0, basis: 'MILESTONES' });

      await expect(fees.setItemCompletion(h1.id, today(), c.auditor)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(fees.setItemCompletion(h1.id, addDays(today(), 3), c.manager)).rejects.toThrow(/futura/);
      await fees.setItemCompletion(h1.id, addDays(today(), -4), c.manager);
      expect(((await fees.getFee(c.engA.id, c.manager)) as any).accrual).toMatchObject({ progressPct: 30, accrued: 300 });
      expect(((await fees.accrualAt(c.engA.id, addDays(today(), -5), c.manager)) as any).accrued).toBe(0);   // el hito se cumplió hace 4 días
      expect(((await fees.accrualAt(c.engA.id, addDays(today(), -4), c.manager)) as any).accrued).toBe(300);
      await fees.setItemCompletion(h1.id, null, c.manager);                                                 // desmarcar
      expect(((await fees.getFee(c.engA.id, c.manager)) as any).accrual.accrued).toBe(0);
      const log = await prisma.collectionLog.findMany({ where: { entityId: h1.id, action: 'SCHEDULE_ITEM_UPDATED' } });
      expect(log.some((l) => l.note === 'Hito marcado como cumplido')).toBe(true);
    });

    it('por tiempo sin horas registradas: el devengado es lo facturado (menos notas de crédito) y no hay nada por facturar', async () => {
      const c = await seed();
      await fees.setFee(c.engA.id, { feeType: 'TIME_BASED' } as any, c.cae);
      const a = await invoice(c, 300);
      await credits.register(a.id, { creditNoteNumber: num('05'), netAmount: 50, taxAmount: 0, reason: 'Ajuste acordado con el cliente.' } as any, c.cae);
      expect(((await fees.getFee(c.engA.id, c.manager)) as any).accrual).toMatchObject({ feeType: 'TIME_BASED', accrued: 250, progressPct: null, toInvoice: 0, basis: 'TIME' });
    });

    it('la rentabilidad agrega el margen devengado junto al margen sobre el honorario total', async () => {
      const c = await seed();
      await fees.setFee(c.engA.id, { feeType: 'FIXED', totalAmount: 1000 } as any, c.cae);
      const audit = await withAudit(c, [{ userId: c.auditor.id, hours: 100 }]);
      await prisma.userCostProfile.create({ data: { organizationId: c.org.id, userId: c.auditor.id, year: new Date().getFullYear(), costRatePerHour: 10, monthlySalary: 1000, billableHoursPerYear: 1200 } as any }).catch(() => undefined);
      await hours(c, audit.id, c.auditor.id, 40, addDays(today(), -1));
      const r: any = await profit.getEngagementProfitability(c.engA.id, c.manager);
      expect(r.devengado).toMatchObject({ progressPct: 40, accrued: 400, toInvoice: 400, basis: 'HOURS' });
      // honorario total 1000 vs devengado 400: dos márgenes distintos y los dos presentes
      expect(r.ingreso).toMatchObject({ feeAmount: 1000 });
      expect(r.totales.margenAbsoluto).toBeGreaterThan(r.totales.margenDevengadoAbsoluto);
      expect(r.totales.margenDevengadoAbsoluto).toBe(400 - r.totales.costoTotal);

      // sin presupuesto de horas el margen devengado es nulo y lo dice
      const d = await seed();
      await fees.setFee(d.engA.id, { feeType: 'FIXED', totalAmount: 1000 } as any, d.cae);
      const audit2 = await prisma.audit.create({ data: { organizationId: d.org.id, title: 'x', type: 'EXTERNAL_FINANCIAL', leadAuditorId: d.manager.id } });
      await prisma.engagement.update({ where: { id: d.engA.id }, data: { auditId: audit2.id, status: 'APPROVED' } });
      await hours(d, audit2.id, d.auditor.id, 10, addDays(today(), -1));
      const r2: any = await profit.getEngagementProfitability(d.engA.id, d.manager);
      expect(r2.devengado).toMatchObject({ progressPct: null, accrued: null, missing: 'NO_BUDGET' });
      expect(r2.totales.margenDevengadoAbsoluto).toBeNull();
      // el resumen de toda la organización cuenta solo los encargos con avance calculable
      const org: any = await profit.getOrgWideProfitability(c.org.id);
      expect(org).toMatchObject({ engagementsWithAccrual: 1, totalAccrued: 400 });
      const org2: any = await profit.getOrgWideProfitability(d.org.id);
      expect(org2.engagementsWithAccrual).toBe(0);
    });
  });
});
