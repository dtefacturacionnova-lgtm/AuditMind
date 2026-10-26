/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { FeesService } from './fees.service';
import { InvoicesService } from './invoices.service';
import { PaymentsService } from './payments.service';
import { checkCollectionInvariants } from './invariants';
import { todayInSalvador } from './collections.common';
import { EngagementsService } from '../portfolio/engagements.service';
import { AuditsService } from '../audits/audits.service';

process.env.SUPABASE_URL ??= 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'clave-de-prueba';

/**
 * Cobranza contra un Postgres REAL (el mismo SQL de infrastructure/db-migrations). Una base falsa no puede probar los candados,
 * las claves foráneas compuestas, los CHECK ni las carreras entre transacciones, que es donde se pierde el dinero.
 *
 * Se omite sola si no hay base de pruebas. Para correrla:
 *   docker run -d --name auditmind-cobros-test -e POSTGRES_PASSWORD=test -e POSTGRES_DB=cobros_test -p 54329:5432 postgres:17-alpine
 *   (aplicar el esquema base + 2026-10-cobros-0-consultorias.sql + 2026-10-cobros-3a.sql — ver docs/cobros-honorarios-diseno.md §8)
 *   COLLECTIONS_TEST_DATABASE_URL=postgresql://postgres:test@localhost:54329/cobros_test npx jest collections.integration
 */
const URL = process.env.COLLECTIONS_TEST_DATABASE_URL;
const suite = URL ? describe : describe.skip;
// Las carreras entre transacciones reales toman segundos; el límite por defecto de jest (5 s) daría falsos fallos.
jest.setTimeout(120_000);

suite('cobranza contra Postgres real', () => {
  let prisma: PrismaClient;
  let fees: FeesService;
  let invoices: InvoicesService;
  let payments: PaymentsService;
  let engs: EngagementsService;

  beforeAll(async () => {
    const sep = (URL as string).includes('?') ? '&' : '?';
    prisma = new PrismaClient({ datasourceUrl: `${URL}${sep}connection_limit=12&pool_timeout=30` });
    await prisma.$connect();
    fees = new FeesService(prisma as any);
    invoices = new InvoicesService(prisma as any);
    payments = new PaymentsService(prisma as any);
    engs = new EngagementsService(
      prisma as any,
      { getClientOrThrow: async (id: string) => prisma.client.findUniqueOrThrow({ where: { id } }) } as any,
      { scaffold: async () => undefined } as any,
      { initializeFromAuditTemplateSections: async () => undefined } as any,
    );
  });
  afterAll(async () => { await prisma?.$disconnect(); });

  const today = () => todayInSalvador();
  let seq = 0;

  /** Una organización nueva con dirección, gerente, dos clientes y un encargo por cliente. */
  async function seed(modality: 'EXTERNAL' | 'INTERNAL' = 'EXTERNAL') {
    const tag = `${Date.now().toString(36)}${(seq++).toString(36)}${randomUUID().slice(0, 6)}`;
    const org = await prisma.organization.create({ data: { name: `Org ${tag}`, slug: `org-${tag}`, auditModality: modality } });
    const mk = (role: any, n: string) => prisma.user.create({ data: { organizationId: org.id, supabaseUserId: randomUUID(), email: `${n}-${tag}@t.test`, name: n, role } });
    const [cae, manager, auditor] = await Promise.all([mk('CAE', 'cae'), mk('AUDIT_MANAGER', 'manager'), mk('AUDITOR', 'auditor')]);
    const au = (u: any) => ({ id: u.id, supabaseUserId: u.supabaseUserId, email: u.email, name: u.name, role: u.role, organizationId: org.id, aiAssistantPersonality: 'ATHENA' });
    const client = (n: string) => prisma.client.create({ data: { organizationId: org.id, legalName: `Cliente ${n} ${tag}`, status: 'ACTIVE', createdById: cae.id } });
    const [clientA, clientB] = [await client('A'), await client('B')];
    const eng = (c: any) => prisma.engagement.create({ data: { organizationId: org.id, clientId: c.id, fiscalYear: 2026, fiscalYearEndDate: new Date('2026-12-31'), createdById: cae.id } });
    const [engA, engB] = [await eng(clientA), await eng(clientB)];
    return { org, cae: au(cae), manager: au(manager), auditor: au(auditor), clientA, clientB, engA, engB, tag };
  }
  type Ctx = Awaited<ReturnType<typeof seed>>;

  let nSeq = 0;
  const num = (c: Ctx) => `DTE-03-M001P001-${String(++nSeq).padStart(15, '0')}${c.tag.slice(0, 0)}`;

  async function setFixedFee(c: Ctx, total: number, eng = c.engA) {
    await fees.setFee(eng.id, { feeType: 'FIXED', totalAmount: total } as any, c.cae);
  }
  async function invoice(c: Ctx, net: number, o: Partial<any> = {}, eng = c.engA) {
    return invoices.register({ engagementId: eng.id, invoiceNumber: num(c), documentType: '03', invoiceDate: today(), netAmount: net, taxAmount: Math.round(net * 13) / 100, ...o } as any, c.manager) as Promise<any>;
  }
  const pay = (c: Ctx, clientId: string, amount: number, o: Partial<any> = {}) =>
    payments.register({ clientId, paymentDate: today(), amount, method: 'TRANSFER', ...o } as any, c.manager) as Promise<any>;
  const inv = (id: string) => prisma.clientInvoice.findUniqueOrThrow({ where: { id } });
  const expectClean = async (c: Ctx) => expect(await checkCollectionInvariants(prisma, c.org.id)).toEqual([]);
  const settle = async (ps: Promise<unknown>[]) => (await Promise.allSettled(ps));
  const ok = (rs: PromiseSettledResult<unknown>[]) => rs.filter((r) => r.status === 'fulfilled').length;

  // ── Honorario y calendario ────────────────────────────────────────────────
  describe('honorario y calendario', () => {
    it('reparte el honorario en 12 cuotas exactas, regenera sin perder centavos y respeta las adendas', async () => {
      const c = await seed();
      await setFixedFee(c, 1000);
      await fees.generateSchedule(c.engA.id, { mode: 'EQUAL', count: 12, firstDate: '2026-01-31', everyMonths: 1 } as any, c.cae);
      let items = await prisma.billingScheduleItem.findMany({ where: { engagementId: c.engA.id }, orderBy: { sequence: 'asc' } });
      expect(items).toHaveLength(12);
      expect(items.reduce((s, i) => s + Math.round(Number(i.amount) * 100), 0)).toBe(100000);
      expect(items[1].dueDate.toISOString().slice(0, 10)).toBe('2026-02-28');

      await fees.generateSchedule(c.engA.id, { mode: 'EQUAL', count: 3, firstDate: '2026-06-01', everyMonths: 1 } as any, c.cae);
      items = await prisma.billingScheduleItem.findMany({ where: { engagementId: c.engA.id, status: 'PLANNED' }, orderBy: { sequence: 'asc' } });
      expect(items).toHaveLength(3);
      expect(items[0].sequence).toBe(1); // los borrados no dejan huecos que molesten: la numeración continúa desde el máximo restante (0 → 1)

      await fees.amendFee(c.engA.id, { date: today(), reason: 'Alcance ampliado', amountDelta: 300 } as any, c.cae);
      const view: any = await fees.getFee(c.engA.id, c.manager);
      expect(view.fee.totalAmount).toBe(1300);
      expect(view.fee.originalAmount).toBe(1000);
      expect(view.summary.unscheduled).toBe(300);
      await expect(fees.amendFee(c.engA.id, { date: today(), reason: 'Recorte excesivo', amountDelta: -400 } as any, c.cae)).rejects.toThrow(/recortar/);
      await expectClean(c);
    });

    it('rechaza una cuota que excede lo no programado y el cambio de monto con cuotas existentes', async () => {
      const c = await seed();
      await setFixedFee(c, 500);
      await fees.generateSchedule(c.engA.id, { mode: 'SINGLE', firstDate: '2026-09-01' } as any, c.cae);
      await expect(fees.createItem(c.engA.id, { label: 'Extra', dueDate: '2026-10-01', amount: 1 } as any, c.cae)).rejects.toThrow(/sin programar/);
      await expect(fees.setFee(c.engA.id, { feeType: 'FIXED', totalAmount: 600 } as any, c.cae)).rejects.toThrow(/adenda/);
      await expectClean(c);
    });
  });

  // ── Facturas ──────────────────────────────────────────────────────────────
  describe('facturas registradas', () => {
    it('factura desde una cuota, vence a 30 días, no se repite y al anular libera número y cuota', async () => {
      const c = await seed();
      await setFixedFee(c, 1000);
      await fees.generateSchedule(c.engA.id, { mode: 'EQUAL', count: 2, firstDate: '2026-03-01', everyMonths: 1 } as any, c.cae);
      const item = await prisma.billingScheduleItem.findFirstOrThrow({ where: { engagementId: c.engA.id, sequence: 1 } });
      const number = num(c);
      const i1 = await invoices.register({ engagementId: c.engA.id, scheduleItemId: item.id, invoiceNumber: number, documentType: '03', invoiceDate: '2026-03-02', netAmount: 500, taxAmount: 65 } as any, c.manager) as any;
      expect(i1.totalAmount).toBe(565);
      expect(i1.dueDate).toBe('2026-04-01');
      expect((await prisma.billingScheduleItem.findUniqueOrThrow({ where: { id: item.id } })).status).toBe('INVOICED');

      await expect(invoices.register({ engagementId: c.engA.id, scheduleItemId: item.id, invoiceNumber: num(c), documentType: '03', invoiceDate: '2026-03-02', netAmount: 500 } as any, c.manager)).rejects.toThrow(/cuota/i);
      // el mismo número de control en otra cuota se rechaza por duplicado
      const item2 = await prisma.billingScheduleItem.findFirstOrThrow({ where: { engagementId: c.engA.id, sequence: 2 } });
      await expect(invoices.register({ engagementId: c.engA.id, scheduleItemId: item2.id, invoiceNumber: number, documentType: '03', invoiceDate: '2026-03-02', netAmount: 500 } as any, c.manager)).rejects.toThrow(/número de control/);

      await invoices.void(i1.id, { reason: 'Se emitió con un monto equivocado' }, c.cae);
      expect((await prisma.billingScheduleItem.findUniqueOrThrow({ where: { id: item.id } })).status).toBe('PLANNED');
      const again = await invoices.register({ engagementId: c.engA.id, scheduleItemId: item.id, invoiceNumber: number, documentType: '03', invoiceDate: '2026-03-02', netAmount: 500, taxAmount: 65 } as any, c.manager) as any;
      expect(again.status).toBe('OPEN');
      await expectClean(c);
    });

    it('no deja facturar más que el honorario ni sin honorario ni en una organización de auditoría interna', async () => {
      const c = await seed();
      await expect(invoice(c, 100)).rejects.toThrow(/honorario/);
      await setFixedFee(c, 200);
      await invoice(c, 150);
      await expect(invoice(c, 100)).rejects.toThrow(/supera/);
      const internal = await seed('INTERNAL');
      await expect(fees.getFee(internal.engA.id, internal.manager)).rejects.toThrow(/auditoría interna/);
      await expectClean(c);
    });

    it('un auditor no entra a la cobranza', async () => {
      const c = await seed();
      await expect(fees.getFee(c.engA.id, c.auditor)).rejects.toThrow();
      await expect(invoices.list({} as any, c.auditor)).rejects.toThrow();
    });

    it('con movimientos solo se editan fechas y descripción', async () => {
      const c = await seed();
      await setFixedFee(c, 1000);
      const i1 = await invoice(c, 100);
      await pay(c, c.clientA.id, 50, { applications: [{ invoiceId: i1.id, amount: 50 }] });
      await expect(invoices.update(i1.id, { netAmount: 90 } as any, c.manager)).rejects.toThrow(/solo se pueden editar/);
      const edited = await invoices.update(i1.id, { description: 'Honorarios marzo' } as any, c.manager) as any;
      expect(edited.description).toBe('Honorarios marzo');
      await expectClean(c);
    });
  });

  // ── Cobros y retenciones ──────────────────────────────────────────────────
  describe('cobros, aplicaciones y retenciones', () => {
    it('cobro total salda la factura; quitar la aplicación la reabre; anular el cobro deja todo en cero', async () => {
      const c = await seed();
      await setFixedFee(c, 1000);
      const i1 = await invoice(c, 100); // total 113
      const p: any = await pay(c, c.clientA.id, 113, { applications: [{ invoiceId: i1.id, amount: 113 }] });
      expect((await inv(i1.id)).status).toBe('SETTLED');
      expect(p.appliedAmount).toBe(113);
      const appId = p.applications[0].id;
      await payments.unapply(p.id, appId, { reason: 'Se aplicó a la factura equivocada' }, c.cae);
      expect((await inv(i1.id)).status).toBe('OPEN');
      await payments.apply(p.id, { applications: [{ invoiceId: i1.id, amount: 63 }] } as any, c.manager);
      expect((await inv(i1.id)).status).toBe('PARTIAL');
      await payments.void(p.id, { reason: 'El banco rechazó la transferencia' }, c.cae);
      const after = await inv(i1.id);
      expect(after.status).toBe('OPEN');
      expect(Number(after.paidAmount)).toBe(0);
      await expect(payments.apply(p.id, { applications: [{ invoiceId: i1.id, amount: 1 }] } as any, c.manager)).rejects.toThrow(/anulado/);
      await expectClean(c);
    });

    it('cobrada neta de retención llega a SETTLED, y anular el cobro revierte también la retención', async () => {
      const c = await seed();
      await setFixedFee(c, 1000);
      const i1 = await invoice(c, 100); // 113
      const p: any = await pay(c, c.clientA.id, 111, {
        applications: [{ invoiceId: i1.id, amount: 111 }],
        withholdings: [{ invoiceId: i1.id, taxType: 'IVA', amount: 1 }, { invoiceId: i1.id, taxType: 'RENTA', amount: 1 }],
      });
      const after = await inv(i1.id);
      expect(after.status).toBe('SETTLED');
      expect(Number(after.paidAmount)).toBe(111);
      expect(Number(after.withheldAmount)).toBe(2);
      await payments.void(p.id, { reason: 'Cobro registrado dos veces por error' }, c.cae);
      const reopened = await inv(i1.id);
      expect(reopened.status).toBe('OPEN');
      expect(Number(reopened.withheldAmount)).toBe(0);
      await expectClean(c);
    });

    it('retención al emitir (la del DTE) y retención tardía; revertirla; anular la factura las revierte', async () => {
      const c = await seed();
      await setFixedFee(c, 1000);
      const i1 = await invoice(c, 100, { withholdings: [{ taxType: 'IVA', amount: 1 }] });
      expect(i1.withheldAmount).toBe(1);
      expect(i1.status).toBe('PARTIAL');
      const late: any = await invoices.addWithholding(i1.id, { taxType: 'RENTA', amount: 10, certificateNumber: 'C-1' } as any, c.manager);
      expect(Number((await inv(i1.id)).withheldAmount)).toBe(11);
      await invoices.reverseWithholding(late.id, { reason: 'Comprobante de otro periodo' }, c.cae);
      expect(Number((await inv(i1.id)).withheldAmount)).toBe(1);
      await invoices.void(i1.id, { reason: 'Factura emitida al cliente equivocado' }, c.cae);
      const voided = await inv(i1.id);
      expect(voided.status).toBe('VOID');
      expect(Number(voided.withheldAmount)).toBe(0);
      await expectClean(c);
    });

    it('rechaza lo que rompería una regla: cliente ajeno, organización ajena, anulada, saldo y montos', async () => {
      const c = await seed();
      const other = await seed();
      await setFixedFee(c, 1000); await setFixedFee(c, 1000, c.engB);
      await setFixedFee(other, 1000);
      const iA = await invoice(c, 100);
      const iB = await invoice(c, 100, {}, c.engB);
      const iOther = await invoice(other, 100);
      const pA: any = await pay(c, c.clientA.id, 500);
      expect(pA.unappliedAmount).toBe(500);

      await expect(payments.apply(pA.id, { applications: [{ invoiceId: iB.id, amount: 10 }] } as any, c.manager)).rejects.toThrow(/otro cliente/);
      await expect(payments.apply(pA.id, { applications: [{ invoiceId: iOther.id, amount: 10 }] } as any, c.manager)).rejects.toThrow(/no existe/);
      await expect(payments.apply(pA.id, { applications: [{ invoiceId: iA.id, amount: 113.01 }] } as any, c.manager)).rejects.toThrow(/saldo/);
      await expect(pay(c, c.clientA.id, 10, { applications: [{ invoiceId: iA.id, amount: 20 }] })).rejects.toThrow(/supera/);
      await expect(pay(c, c.clientA.id, 10, { paymentDate: '2999-01-01' })).rejects.toThrow(/futura/);
      await expect(pay(c, c.clientA.id, 10.005)).rejects.toThrow(/decimales/);
      await expect(pay(c, c.clientA.id, 0)).rejects.toThrow();
      // el cobro que falla no deja huellas
      expect(await prisma.clientPayment.count({ where: { organizationId: c.org.id } })).toBe(1);
      await invoices.void(iA.id, { reason: 'Factura duplicada por error' }, c.cae);
      await expect(payments.apply(pA.id, { applications: [{ invoiceId: iA.id, amount: 1 }] } as any, c.manager)).rejects.toThrow(/estado VOID/);
      await expectClean(c);
    });

    it('dinero + retenciones que superan el saldo se rechazan con 422 y no dejan nada escrito', async () => {
      const c = await seed();
      await setFixedFee(c, 1000);
      const i1 = await invoice(c, 100); // 113
      await expect(pay(c, c.clientA.id, 111, {
        applications: [{ invoiceId: i1.id, amount: 111 }],
        withholdings: [{ invoiceId: i1.id, taxType: 'IVA', amount: 1 }, { invoiceId: i1.id, taxType: 'RENTA', amount: 2 }],
      })).rejects.toThrow(/saldo/);
      const after = await inv(i1.id);
      expect(after.status).toBe('OPEN');
      expect(Number(after.paidAmount) + Number(after.withheldAmount)).toBe(0);
      expect(await prisma.clientPayment.count({ where: { organizationId: c.org.id } })).toBe(0);
      expect(await prisma.invoiceWithholding.count({ where: { organizationId: c.org.id } })).toBe(0);
      await expectClean(c);
    });

    it('una factura anulada no muestra saldo por cobrar', async () => {
      const c = await seed();
      await setFixedFee(c, 1000);
      const i1 = await invoice(c, 100);
      const voided: any = await invoices.void(i1.id, { reason: 'Se emitió por error al cliente' }, c.cae);
      expect(voided.status).toBe('VOID');
      expect(voided.balance).toBe(0);
      const view: any = await fees.getFee(c.engA.id, c.manager);
      expect(view.summary.receivable).toBe(0);
    });

    it('reparto automático: la que vence primero primero, y lo que sobra queda a favor', async () => {
      const c = await seed();
      await setFixedFee(c, 3000);
      const late = await invoice(c, 100, { invoiceDate: '2026-01-10' });
      const early = await invoice(c, 100, { invoiceDate: '2026-01-05' });
      const p: any = await pay(c, c.clientA.id, 200, { autoAllocate: true });
      expect((await inv(early.id)).status).toBe('SETTLED');
      expect(Number((await inv(late.id)).paidAmount)).toBe(87);
      expect(p.unappliedAmount).toBe(0);
      await expectClean(c);
    });

    it('un reintento con el mismo identificador devuelve el mismo cobro; con otro contenido, 409', async () => {
      const c = await seed();
      const rid = `req-${randomUUID()}`;
      const a: any = await pay(c, c.clientA.id, 40, { clientRequestId: rid });
      const b: any = await pay(c, c.clientA.id, 40, { clientRequestId: rid });
      expect(b.id).toBe(a.id);
      await expect(pay(c, c.clientA.id, 41, { clientRequestId: rid })).rejects.toThrow(/otro contenido/);
      expect(await prisma.clientPayment.count({ where: { organizationId: c.org.id } })).toBe(1);
    });

    it('editar un cobro: metadatos siempre; el monto solo sin aplicaciones', async () => {
      const c = await seed();
      await setFixedFee(c, 1000);
      const i1 = await invoice(c, 100);
      const p: any = await pay(c, c.clientA.id, 50);
      const e: any = await payments.update(p.id, { amount: 60, reference: 'TRF-9' } as any, c.manager);
      expect(e.amount).toBe(60);
      await payments.apply(p.id, { applications: [{ invoiceId: i1.id, amount: 10 }] } as any, c.manager);
      await expect(payments.update(p.id, { amount: 70 } as any, c.manager)).rejects.toThrow(/aplicaciones/);
      expect(((await payments.update(p.id, { notes: 'ok' } as any, c.manager)) as any).notes).toBe('ok');
      await expectClean(c);
    });
  });

  // ── La base se defiende sola ───────────────────────────────────────────────
  describe('integridad en la base (aunque el código fallara)', () => {
    it('las claves compuestas impiden cruzar clientes y organizaciones, y los CHECK impiden saldos o estados incoherentes', async () => {
      const c = await seed();
      const other = await seed();
      await setFixedFee(c, 1000); await setFixedFee(c, 1000, c.engB);
      const iA = await invoice(c, 100);
      const iB = await invoice(c, 100, {}, c.engB);
      const pA: any = await pay(c, c.clientA.id, 50);
      const mk = (invoiceId: string, clientId: string, organizationId = c.org.id) => prisma.paymentApplication.create({
        data: { organizationId, clientId, paymentId: pA.id, invoiceId, amount: 1, appliedOn: new Date(), createdById: c.cae.id },
      });
      await expect(mk(iB.id, c.clientA.id)).rejects.toThrow(); // factura de otro cliente
      await expect(mk(iA.id, c.clientB.id)).rejects.toThrow(); // cobro de otro cliente
      await expect(mk(iA.id, c.clientA.id, other.org.id)).rejects.toThrow(); // organización ajena
      // factura de un encargo de otro cliente
      await expect(prisma.clientInvoice.create({
        data: { organizationId: c.org.id, clientId: c.clientA.id, engagementId: c.engB.id, invoiceNumber: 'X-1234', documentType: '03', invoiceDate: new Date(), dueDate: new Date(), netAmount: 1, taxAmount: 0, totalAmount: 1, createdById: c.cae.id },
      })).rejects.toThrow();
      // saldo negativo y estado incoherente
      await expect(prisma.clientInvoice.update({ where: { id: iA.id }, data: { paidAmount: 9999, status: 'SETTLED' } })).rejects.toThrow();
      await expect(prisma.clientInvoice.update({ where: { id: iA.id }, data: { status: 'SETTLED' } })).rejects.toThrow();
      await expect(prisma.clientInvoice.update({ where: { id: iA.id }, data: { totalAmount: 5 } })).rejects.toThrow(); // total ≠ neto + IVA
      // un cobro no aplica más de lo recibido
      await expect(prisma.clientPayment.update({ where: { id: pA.id }, data: { appliedAmount: 51 } })).rejects.toThrow();
      // dinero con ON DELETE RESTRICT
      await expect(prisma.clientInvoice.delete({ where: { id: iA.id } })).resolves.toBeDefined(); // sin movimientos sí se puede...
      await expect(prisma.client.delete({ where: { id: c.clientB.id } })).rejects.toThrow(); // ...pero no el cliente que tiene facturas
      await expectClean(c);
    });

    it('la bitácora solo admite INSERT', async () => {
      const c = await seed();
      await setFixedFee(c, 100);
      const log = await prisma.collectionLog.findFirstOrThrow({ where: { organizationId: c.org.id } });
      await expect(prisma.collectionLog.update({ where: { id: log.id }, data: { note: 'x' } })).rejects.toThrow(/solo admite INSERT/);
      await expect(prisma.collectionLog.delete({ where: { id: log.id } })).rejects.toThrow(/solo admite INSERT/);
    });
  });


  // ── Correcciones de la revisión independiente (2026-10-23) ─────────────────
  describe('correcciones de la revisión independiente', () => {
    it('anular una factura por menos que su cuota no devuelve más de lo que cabe en el honorario', async () => {
      const c = await seed();
      await setFixedFee(c, 1000);
      await fees.generateSchedule(c.engA.id, { mode: 'SINGLE', firstDate: '2026-06-01' } as any, c.cae); // una cuota de 1000
      const item = await prisma.billingScheduleItem.findFirstOrThrow({ where: { engagementId: c.engA.id } });
      const i1 = await invoices.register({ engagementId: c.engA.id, scheduleItemId: item.id, invoiceNumber: num(c), documentType: '03', invoiceDate: today(), netAmount: 600, taxAmount: 0 } as any, c.manager) as any;
      await fees.generateSchedule(c.engA.id, { mode: 'SINGLE', firstDate: '2026-09-01', replacePlanned: false, label: 'Resto' } as any, c.cae); // los 400 que faltan
      await invoices.void(i1.id, { reason: 'Factura emitida con monto equivocado' }, c.cae);
      const back = await prisma.billingScheduleItem.findUniqueOrThrow({ where: { id: item.id } });
      expect(back.status).toBe('PLANNED');
      expect(Number(back.amount)).toBe(600); // vuelve solo por lo que cabe: 1000 − 400 ya programados
      await expectClean(c);
    });

    it('al anular, la cuota vuelve solo por lo que cabe aunque el resto del honorario ya se haya facturado libre', async () => {
      const d = await seed();
      await setFixedFee(d, 1000);
      await fees.generateSchedule(d.engA.id, { mode: 'SINGLE', firstDate: '2026-06-01' } as any, d.cae);
      const it2 = await prisma.billingScheduleItem.findFirstOrThrow({ where: { engagementId: d.engA.id } });
      const j1 = await invoices.register({ engagementId: d.engA.id, scheduleItemId: it2.id, invoiceNumber: num(d), documentType: '03', invoiceDate: today(), netAmount: 600, taxAmount: 0 } as any, d.manager) as any;
      await invoice(d, 400, { taxAmount: 0 }); // los 400 sobrantes se facturaron libres
      await invoices.void(j1.id, { reason: 'Factura emitida con monto equivocado' }, d.cae);
      // se anularon 600 y hay 400 facturados: del honorario de 1000 caben 600, no los 1000 originales de la cuota
      const back = await prisma.billingScheduleItem.findUniqueOrThrow({ where: { id: it2.id } });
      expect(back.status).toBe('PLANNED');
      expect(Number(back.amount)).toBe(600);
      await expectClean(d);
    });

    it('editar el honorario sin cambiar el monto conserva el vínculo con la propuesta', async () => {
      const c = await seed();
      const proposal = await prisma.proposal.create({ data: { organizationId: c.org.id, clientId: c.clientA.id, year: 2026, feeAmount: 1000, feeCurrency: 'USD', createdById: c.cae.id } });
      const letter = await prisma.engagementLetter.create({ data: { organizationId: c.org.id, clientId: c.clientA.id, proposalId: proposal.id, year: 2026, content: 'x', status: 'SIGNED', createdById: c.cae.id } });
      await prisma.engagement.update({ where: { id: c.engA.id }, data: { engagementLetterId: letter.id } });
      const engA2 = await prisma.engagement.create({ data: { organizationId: c.org.id, clientId: c.clientA.id, fiscalYear: 2027, fiscalYearEndDate: new Date('2027-12-31'), engagementLetterId: letter.id, createdById: c.cae.id } });
      await fees.setFee(c.engA.id, { feeType: 'FIXED', importFromProposal: true } as any, c.cae);
      await expect(fees.setFee(engA2.id, { feeType: 'FIXED', importFromProposal: true } as any, c.cae)).rejects.toThrow(/propuesta/);
      // la pantalla manda el monto en toda edición: cambiar solo los días de crédito NO debe soltar la propuesta
      await fees.setFee(c.engA.id, { feeType: 'FIXED', totalAmount: 1000, paymentTermDays: 45 } as any, c.cae);
      const view: any = await fees.getFee(c.engA.id, c.manager);
      expect(view.fee.source).toBe('PROPOSAL');
      expect(view.fee.proposalId).toBe(proposal.id);
      await expect(fees.setFee(engA2.id, { feeType: 'FIXED', importFromProposal: true } as any, c.cae)).rejects.toThrow(/propuesta/);
      await expectClean(c);
    });

    it('un reintento con otras retenciones o sin aplicaciones NO se toma por repetición', async () => {
      const c = await seed();
      await setFixedFee(c, 5000);
      const i1 = await invoice(c, 500, { taxAmount: 0 });
      const rid = `req-${randomUUID()}`;
      const base = { applications: [{ invoiceId: i1.id, amount: 400 }], withholdings: [{ invoiceId: i1.id, taxType: 'RENTA', amount: 50 }], clientRequestId: rid };
      const a: any = await pay(c, c.clientA.id, 400, base);
      expect(((await pay(c, c.clientA.id, 400, base)) as any).id).toBe(a.id); // idéntico → repetición
      await expect(pay(c, c.clientA.id, 400, { ...base, withholdings: [{ invoiceId: i1.id, taxType: 'IVA', amount: 11.3 }, { invoiceId: i1.id, taxType: 'RENTA', amount: 50 }] })).rejects.toThrow(/otro contenido/);
      await expect(pay(c, c.clientA.id, 400, { clientRequestId: rid })).rejects.toThrow(/otro contenido/); // sin aplicaciones
      expect(await prisma.invoiceWithholding.count({ where: { organizationId: c.org.id } })).toBe(1);
      await expectClean(c);
    });

    it('un cobro anulado no muestra saldo a favor', async () => {
      const c = await seed();
      const p: any = await pay(c, c.clientA.id, 250);
      expect(p.unappliedAmount).toBe(250);
      const voided: any = await payments.void(p.id, { reason: 'La transferencia fue rechazada' }, c.cae);
      expect(voided.unappliedAmount).toBe(0);
      expect(voided.status).toBe('VOID');
      expect(((await payments.list({ unapplied: 'true' } as any, c.manager)) as any).total).toBe(0);
    });

    it('el número de control no entra dos veces con otra capitalización', async () => {
      const c = await seed();
      await setFixedFee(c, 5000);
      const number = 'DTE-03-M001P001-000000000000777';
      await invoice(c, 100, { invoiceNumber: number });
      await expect(invoice(c, 100, { invoiceNumber: number.toLowerCase() })).rejects.toThrow(/número de control/);
      await expectClean(c);
    });

    it('aprobar la misma consultoría varias veces a la vez crea una sola auditoría', async () => {
      const c = await seed();
      const cons: any = await engs.create({ clientId: c.clientA.id, kind: 'CONSULTING', title: 'Asesoría tributaria', fiscalYear: 2026, fiscalYearEndDate: '2026-12-31' } as any, c.cae);
      const rs = await settle([1, 2, 3].map(() => engs.approve(cons.id, c.cae)));
      expect(ok(rs)).toBe(1);
      expect(await prisma.audit.count({ where: { organizationId: c.org.id } })).toBe(1);
      expect(await prisma.auditEntity.count({ where: { organizationId: c.org.id } })).toBe(1);
      expect(await prisma.auditPhase.count({ where: { audit: { organizationId: c.org.id } } })).toBe(3);
    });

    it('dos encargos del mismo cliente aprobados a la vez comparten un solo espejo del cliente', async () => {
      const c = await seed();
      const e1: any = await engs.create({ clientId: c.clientA.id, kind: 'CONSULTING', title: 'Consultoría uno', fiscalYear: 2026, fiscalYearEndDate: '2026-12-31' } as any, c.cae);
      const e2: any = await engs.create({ clientId: c.clientA.id, kind: 'CONSULTING', title: 'Consultoría dos', fiscalYear: 2026, fiscalYearEndDate: '2026-12-31' } as any, c.cae);
      const rs = await settle([engs.approve(e1.id, c.cae), engs.approve(e2.id, c.cae)]);
      expect(ok(rs)).toBe(2);
      expect(await prisma.auditEntity.count({ where: { organizationId: c.org.id } })).toBe(1);
    });

    it('cancelar mientras se registra una factura: nunca queda un encargo cancelado con factura vigente', async () => {
      for (let n = 0; n < 5; n++) {
        const c = await seed();
        await setFixedFee(c, 1000);
        await fees.generateSchedule(c.engA.id, { mode: 'EQUAL', count: 2, firstDate: '2026-07-01', everyMonths: 1 } as any, c.cae);
        await settle([engs.cancel(c.engA.id, c.cae), invoice(c, 100)]);
        const e = await prisma.engagement.findUniqueOrThrow({ where: { id: c.engA.id } });
        const live = await prisma.clientInvoice.count({ where: { engagementId: c.engA.id, status: { not: 'VOID' } } });
        expect(e.status === 'CANCELLED' && live > 0).toBe(false);
        if (e.status === 'CANCELLED') expect(await prisma.billingScheduleItem.count({ where: { engagementId: c.engA.id, status: 'PLANNED' } })).toBe(0);
        await expectClean(c);
      }
    });

    it('cancelar un encargo sin facturas cancela sus cuotas y deja rastro de cada una', async () => {
      const c = await seed();
      await setFixedFee(c, 1000);
      await fees.generateSchedule(c.engA.id, { mode: 'EQUAL', count: 3, firstDate: '2026-07-01', everyMonths: 1 } as any, c.cae);
      await engs.cancel(c.engA.id, c.cae);
      expect(await prisma.billingScheduleItem.count({ where: { engagementId: c.engA.id, status: 'CANCELLED' } })).toBe(3);
      expect(await prisma.collectionLog.count({ where: { organizationId: c.org.id, action: 'SCHEDULE_ITEM_CANCELLED', note: 'Encargo cancelado' } })).toBe(3);
      const d = await seed();
      await setFixedFee(d, 1000);
      await invoice(d, 100);
      await expect(engs.cancel(d.engA.id, d.cae)).rejects.toThrow(/facturas registradas/);
    });

    it('un encargo cancelado libera el ejercicio: se puede crear otro, pero no dos vigentes (ni por la base)', async () => {
      const c = await seed();
      await engs.cancel(c.engA.id, c.cae);
      const again: any = await engs.create({ clientId: c.clientA.id, fiscalYear: 2026, fiscalYearEndDate: '2026-12-31' } as any, c.manager);
      expect(again.status).toBe('DRAFT');
      await expect(engs.create({ clientId: c.clientA.id, fiscalYear: 2026, fiscalYearEndDate: '2026-12-31' } as any, c.manager)).rejects.toThrow(/Ya existe un encargo/);
      // el índice de la base lo impone aunque la API se saltara la validación
      await expect(prisma.engagement.create({
        data: { organizationId: c.org.id, clientId: c.clientA.id, fiscalYear: 2026, fiscalYearEndDate: new Date('2026-12-31'), createdById: c.cae.id },
      })).rejects.toThrow();
      // una consultoría no compite con la auditoría
      await expect(engs.create({ clientId: c.clientA.id, fiscalYear: 2026, fiscalYearEndDate: '2026-12-31', kind: 'CONSULTING', title: 'Asesoría' } as any, c.manager)).resolves.toBeDefined();
    });

    it('cancelar la auditoría de un encargo cancela también el encargo y sus cuotas; con facturas vigentes se rechaza sin cambiar nada', async () => {
      const audits = new AuditsService(prisma as any, {} as any, {} as any, {} as any);
      const withAudit = async (c: Ctx) => {
        const a = await prisma.audit.create({ data: { organizationId: c.org.id, title: 'Auditoría EEFF', type: 'EXTERNAL_FINANCIAL', leadAuditorId: c.manager.id, status: 'PLANNING' } });
        await prisma.engagement.update({ where: { id: c.engA.id }, data: { auditId: a.id, status: 'APPROVED' } });
        return a;
      };
      const c = await seed();
      await setFixedFee(c, 1000);
      await fees.generateSchedule(c.engA.id, { mode: 'EQUAL', count: 3, firstDate: '2026-07-01', everyMonths: 1 } as any, c.cae);
      const a = await withAudit(c);
      await audits.updateStatus(a.id, { status: 'CANCELLED' } as any, c.cae);
      expect((await prisma.audit.findUniqueOrThrow({ where: { id: a.id } })).status).toBe('CANCELLED');
      expect((await prisma.engagement.findUniqueOrThrow({ where: { id: c.engA.id } })).status).toBe('CANCELLED');
      expect(await prisma.billingScheduleItem.count({ where: { engagementId: c.engA.id, status: 'CANCELLED' } })).toBe(3);
      expect(await prisma.collectionLog.count({ where: { organizationId: c.org.id, action: 'SCHEDULE_ITEM_CANCELLED', note: 'Auditoría cancelada' } })).toBe(3);
      // el ejercicio queda libre para volver a abrirlo
      await expect(engs.create({ clientId: c.clientA.id, fiscalYear: 2026, fiscalYearEndDate: '2026-12-31' } as any, c.manager)).resolves.toBeDefined();
      await expectClean(c);

      // con una factura vigente no se cancela ni la auditoría ni el encargo
      const d = await seed();
      await setFixedFee(d, 1000);
      await invoice(d, 100);
      const b = await withAudit(d);
      await expect(audits.updateStatus(b.id, { status: 'CANCELLED' } as any, d.cae)).rejects.toThrow(/facturas registradas/);
      expect((await prisma.audit.findUniqueOrThrow({ where: { id: b.id } })).status).toBe('PLANNING');
      expect((await prisma.engagement.findUniqueOrThrow({ where: { id: d.engA.id } })).status).toBe('APPROVED');

      // una auditoría sin encargo (interna, por ejemplo) se cancela como siempre
      const free = await prisma.audit.create({ data: { organizationId: d.org.id, title: 'Interna', type: 'EXTERNAL', leadAuditorId: d.manager.id, status: 'PLANNING' } });
      await audits.updateStatus(free.id, { status: 'CANCELLED' } as any, d.cae);
      expect((await prisma.audit.findUniqueOrThrow({ where: { id: free.id } })).status).toBe('CANCELLED');
    });

    it('el reparto automático descuenta las retenciones del mismo pago', async () => {
      const c = await seed();
      await setFixedFee(c, 5000);
      const a = await invoice(c, 500, { invoiceDate: '2026-01-05', taxAmount: 65 }); // 565, vence primero
      const b = await invoice(c, 1000, { invoiceDate: '2026-02-05', taxAmount: 130 }); // 1130
      await pay(c, c.clientA.id, 1000, { autoAllocate: true, withholdings: [{ invoiceId: a.id, taxType: 'RENTA', amount: 50 }] });
      expect(Number((await inv(a.id)).paidAmount)).toBe(515);
      expect(Number((await inv(a.id)).withheldAmount)).toBe(50);
      expect((await inv(a.id)).status).toBe('SETTLED');
      expect(Number((await inv(b.id)).paidAmount)).toBe(485);
      await expectClean(c);
    });

    it('reparto automático con retención en una factura fuera de las candidatas, contra otro cobro: sin interbloqueos', async () => {
      for (let n = 0; n < 6; n++) {
        const c = await seed();
        await setFixedFee(c, 9000);
        await invoice(c, 100, { taxAmount: 0 });
        const i2 = await invoice(c, 100, { taxAmount: 0 });
        const i3 = await invoice(c, 100, { taxAmount: 0 });
        const p2 = await pay(c, c.clientA.id, 50);
        const rs = await settle([
          pay(c, c.clientA.id, 40, { autoAllocate: true, withholdings: [{ invoiceId: i2.id, taxType: 'IVA', amount: 1 }] }),
          payments.apply(p2.id, { applications: [{ invoiceId: i2.id, amount: 20 }, { invoiceId: i3.id, amount: 20 }] } as any, c.manager),
        ]);
        const deadlock = rs.filter((r) => r.status === 'rejected').some((r: any) => /deadlock|40P01/i.test(String(r.reason?.message ?? r.reason)));
        expect(deadlock).toBe(false);
        await expectClean(c);
      }
    });

    it('el reporte de retenciones y el filtro de saldo a favor paginan con total exacto', async () => {
      const c = await seed();
      await setFixedFee(c, 9000);
      const invs: any[] = [];
      for (let i = 0; i < 5; i++) invs.push(await invoice(c, 100, { taxAmount: 0 }));
      for (const i of invs) await invoices.addWithholding(i.id, { taxType: 'IVA', amount: 1 } as any, c.manager);
      const page1: any = await invoices.listWithholdings({ page: 1, pageSize: 2 } as any, c.manager);
      expect(page1.items).toHaveLength(2);
      expect(page1.total).toBe(5);
      expect(page1.totalAmount).toBe(5);
      const last: any = await invoices.listWithholdings({ page: 3, pageSize: 2 } as any, c.manager);
      expect(last.items).toHaveLength(1);
      for (let i = 0; i < 5; i++) await pay(c, c.clientA.id, 10 + i);
      const unapplied: any = await payments.list({ unapplied: 'true', page: 2, pageSize: 2 } as any, c.manager);
      expect(unapplied.total).toBe(5);
      expect(unapplied.items).toHaveLength(2);
    });

    it('el detalle de la factura y del cobro incluye los movimientos de sus aplicaciones y retenciones', async () => {
      const c = await seed();
      await setFixedFee(c, 1000);
      const i1 = await invoice(c, 100, { taxAmount: 0, withholdings: [{ taxType: 'IVA', amount: 1 }] });
      const p: any = await pay(c, c.clientA.id, 50, { applications: [{ invoiceId: i1.id, amount: 50 }] });
      const detail: any = await invoices.get(i1.id, c.manager);
      const actions = detail.log.map((l: any) => l.action);
      expect(actions).toEqual(expect.arrayContaining(['INVOICE_REGISTERED', 'WITHHOLDING_ADDED', 'PAYMENT_APPLIED']));
      const pd: any = await payments.get(p.id, c.manager);
      expect(pd.log.map((l: any) => l.action)).toEqual(expect.arrayContaining(['PAYMENT_REGISTERED', 'PAYMENT_APPLIED']));
    });
  });

  // ── Carreras ──────────────────────────────────────────────────────────────
  describe('concurrencia', () => {
    it('8 cobros simultáneos sobre una factura de 113: solo caben los que suman hasta 113, jamás sobrepasa', async () => {
      const c = await seed();
      await setFixedFee(c, 1000);
      const i1 = await invoice(c, 100); // 113
      const ps = await Promise.all(Array.from({ length: 8 }, () => pay(c, c.clientA.id, 30)));
      const rs = await settle(ps.map((p) => payments.apply(p.id, { applications: [{ invoiceId: i1.id, amount: 30 }] } as any, c.manager)));
      expect(ok(rs)).toBe(3); // 30×3 = 90; el cuarto sumaría 120 > 113 y los 23 que quedan no alcanzan para otro de 30
      const after = await inv(i1.id);
      expect(Number(after.paidAmount)).toBe(90);
      expect(after.status).toBe('PARTIAL');
      await expectClean(c);
    });

    it('dos cobros simultáneos por el saldo completo: gana uno, el otro recibe 422', async () => {
      const c = await seed();
      await setFixedFee(c, 1000);
      const i1 = await invoice(c, 100);
      const [p1, p2] = await Promise.all([pay(c, c.clientA.id, 113), pay(c, c.clientA.id, 113)]);
      const rs = await settle([
        payments.apply(p1.id, { applications: [{ invoiceId: i1.id, amount: 113 }] } as any, c.manager),
        payments.apply(p2.id, { applications: [{ invoiceId: i1.id, amount: 113 }] } as any, c.manager),
      ]);
      expect(ok(rs)).toBe(1);
      expect(Number((await inv(i1.id)).paidAmount)).toBe(113);
      await expectClean(c);
    });

    it('la misma aplicación quitada dos veces a la vez: una sola surte efecto', async () => {
      const c = await seed();
      await setFixedFee(c, 1000);
      const i1 = await invoice(c, 100);
      const p: any = await pay(c, c.clientA.id, 113, { applications: [{ invoiceId: i1.id, amount: 113 }] });
      const appId = p.applications[0].id;
      const rs = await settle([1, 2, 3, 4].map(() => payments.unapply(p.id, appId, { reason: 'Quitar la aplicación por error' }, c.cae)));
      expect(ok(rs)).toBe(1);
      expect(Number((await inv(i1.id)).paidAmount)).toBe(0);
      await expectClean(c);
    });

    it('anular un cobro mientras se aplica otro a la misma factura: el saldo siempre cuadra', async () => {
      const c = await seed();
      await setFixedFee(c, 1000);
      const i1 = await invoice(c, 100);
      const p1: any = await pay(c, c.clientA.id, 100, { applications: [{ invoiceId: i1.id, amount: 100 }] });
      const p2: any = await pay(c, c.clientA.id, 113);
      await settle([
        payments.void(p1.id, { reason: 'Transferencia devuelta por el banco' }, c.cae),
        payments.apply(p2.id, { applications: [{ invoiceId: i1.id, amount: 113 }] } as any, c.manager),
      ]);
      await expectClean(c);
    });

    it('anular la factura mientras llega un cobro: o se anula o se cobra, nunca las dos', async () => {
      for (let n = 0; n < 4; n++) {
        const c = await seed();
        await setFixedFee(c, 1000);
        const i1 = await invoice(c, 100);
        const p: any = await pay(c, c.clientA.id, 113);
        const rs = await settle([
          invoices.void(i1.id, { reason: 'Factura emitida por error' }, c.cae),
          payments.apply(p.id, { applications: [{ invoiceId: i1.id, amount: 113 }] } as any, c.manager),
        ]);
        expect(ok(rs)).toBeGreaterThanOrEqual(1);
        const after = await inv(i1.id);
        expect(after.status === 'VOID' ? Number(after.paidAmount) : 113).toBe(after.status === 'VOID' ? 0 : 113);
        await expectClean(c);
      }
    });

    it('el mismo número de control registrado a la vez: solo una factura vigente', async () => {
      const c = await seed();
      await setFixedFee(c, 5000);
      const number = num(c);
      const rs = await settle(Array.from({ length: 6 }, () => invoice(c, 100, { invoiceNumber: number })));
      expect(ok(rs)).toBe(1);
      expect(await prisma.clientInvoice.count({ where: { organizationId: c.org.id, invoiceNumber: number } })).toBe(1);
      await expectClean(c);
    });

    it('facturar libre y regenerar el calendario a la vez nunca comprometen más que el honorario', async () => {
      for (let n = 0; n < 3; n++) {
        const c = await seed();
        await setFixedFee(c, 1000);
        await fees.generateSchedule(c.engA.id, { mode: 'EQUAL', count: 4, firstDate: '2026-02-01', everyMonths: 1 } as any, c.cae);
        await settle([
          invoice(c, 400),
          fees.generateSchedule(c.engA.id, { mode: 'EQUAL', count: 5, firstDate: '2026-06-01', everyMonths: 1 } as any, c.cae),
          invoice(c, 400),
          fees.createItem(c.engA.id, { label: 'Extra', dueDate: '2026-12-01', amount: 100 } as any, c.cae),
        ]);
        await expectClean(c);
      }
    });

    it('10 facturas libres simultáneas de 300 con honorario de 1000: caben exactamente 3', async () => {
      const c = await seed();
      await setFixedFee(c, 1000);
      const rs = await settle(Array.from({ length: 10 }, () => invoice(c, 300, { taxAmount: 0 })));
      expect(ok(rs)).toBe(3);
      const view: any = await fees.getFee(c.engA.id, c.manager);
      expect(view.summary.invoicedNet).toBe(900);
      await expectClean(c);
    });

    it('8 cuotas a mano simultáneas de 400 con honorario de 1000 sin programar: caben exactamente 2', async () => {
      const c = await seed();
      await setFixedFee(c, 1000);
      const rs = await settle(Array.from({ length: 8 }, (_, i) => fees.createItem(c.engA.id, { label: `Cuota ${i}`, dueDate: '2026-12-01', amount: 400 } as any, c.cae)));
      expect(ok(rs)).toBe(2);
      await expectClean(c);
    });

    it('adendas a la baja simultáneas nunca dejan el honorario por debajo de lo facturado', async () => {
      const c = await seed();
      await setFixedFee(c, 1000);
      await invoice(c, 300, { taxAmount: 0 });
      const rs = await settle(Array.from({ length: 4 }, () => fees.amendFee(c.engA.id, { date: today(), reason: 'Recorte del alcance', amountDelta: -300 } as any, c.cae)));
      expect(ok(rs)).toBe(2); // 1000 → 700 → 400; un tercer recorte dejaría 100, por debajo de los 300 ya facturados
      const view: any = await fees.getFee(c.engA.id, c.manager);
      expect(view.fee.totalAmount).toBe(400);
      await expectClean(c);
    });

    it('4 regeneraciones simultáneas del calendario dejan UN calendario que suma el honorario', async () => {
      const c = await seed();
      await setFixedFee(c, 1200);
      await settle(Array.from({ length: 4 }, () => fees.generateSchedule(c.engA.id, { mode: 'EQUAL', count: 3, firstDate: '2026-06-01', everyMonths: 1 } as any, c.cae)));
      const planned = await prisma.billingScheduleItem.findMany({ where: { engagementId: c.engA.id, status: 'PLANNED' } });
      expect(planned.reduce((s, i) => s + Math.round(Number(i.amount) * 100), 0)).toBe(120000);
      await expectClean(c);
    });

    it('el mismo cobro con el mismo identificador enviado 6 veces a la vez crea uno solo', async () => {
      const c = await seed();
      const rid = `req-${randomUUID()}`;
      const rs = await settle(Array.from({ length: 6 }, () => pay(c, c.clientA.id, 77, { clientRequestId: rid })));
      expect(ok(rs)).toBe(6);
      expect(await prisma.clientPayment.count({ where: { organizationId: c.org.id } })).toBe(1);
    });
  });
});
