/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { ForbiddenException } from '@nestjs/common';
import { FeesService } from './fees.service';
import { InvoicesService } from './invoices.service';
import { PaymentsService } from './payments.service';
import { CreditNotesService } from './credit-notes.service';
import { WriteOffsService } from './write-offs.service';
import { CollectionNotesService } from './collection-notes.service';
import { checkCollectionInvariants } from './invariants';
import { todayInSalvador, addDays } from './collections.common';

/**
 * Cobranza fase 3d — notas de crédito, castigos y gestión de cobro — contra un Postgres REAL (el mismo SQL de infrastructure/db-migrations).
 *
 *   COLLECTIONS_TEST_DATABASE_URL=postgresql://postgres:test@localhost:54329/cobros_test npx jest collections-3d
 */
const URL = process.env.COLLECTIONS_TEST_DATABASE_URL;
const suite = URL ? describe : describe.skip;
jest.setTimeout(120_000);

suite('cobranza 3d contra Postgres real', () => {
  let prisma: PrismaClient;
  let fees: FeesService; let invoices: InvoicesService; let payments: PaymentsService;
  let credits: CreditNotesService; let writeOffs: WriteOffsService; let notes: CollectionNotesService;

  beforeAll(async () => {
    const sep = (URL as string).includes('?') ? '&' : '?';
    prisma = new PrismaClient({ datasourceUrl: `${URL}${sep}connection_limit=12&pool_timeout=30` });
    await prisma.$connect();
    fees = new FeesService(prisma as any); invoices = new InvoicesService(prisma as any); payments = new PaymentsService(prisma as any);
    credits = new CreditNotesService(prisma as any); writeOffs = new WriteOffsService(prisma as any); notes = new CollectionNotesService(prisma as any);
  });
  afterAll(async () => { await prisma?.$disconnect(); });

  const today = () => todayInSalvador();
  let seq = 0;

  /** Una organización nueva con dirección, gerente, auditor, dos clientes y un encargo por cliente. */
  async function seed() {
    const tag = `${Date.now().toString(36)}${(seq++).toString(36)}${randomUUID().slice(0, 6)}`;
    const org = await prisma.organization.create({ data: { name: `Org ${tag}`, slug: `org-${tag}`, auditModality: 'EXTERNAL' } });
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
  const num = (kind = '03') => `DTE-${kind}-M001P001-${String(++nSeq).padStart(15, '0')}`;
  const setFee = (c: Ctx, total: number, eng = c.engA) => fees.setFee(eng.id, { feeType: 'FIXED', totalAmount: total } as any, c.cae);
  const invoice = (c: Ctx, net: number, o: any = {}, eng = c.engA) =>
    invoices.register({ engagementId: eng.id, invoiceNumber: num(), documentType: '03', invoiceDate: today(), netAmount: net, taxAmount: Math.round(net * 13) / 100, ...o } as any, c.manager) as Promise<any>;
  const pay = (c: Ctx, clientId: string, amount: number, o: any = {}) =>
    payments.register({ clientId, paymentDate: today(), amount, method: 'TRANSFER', ...o } as any, c.manager) as Promise<any>;
  const credit = (c: Ctx, invoiceId: string, net: number, o: any = {}, who: any = c.cae) =>
    credits.register(invoiceId, { creditNoteNumber: num('05'), netAmount: net, taxAmount: 0, reason: 'Ajuste acordado con el cliente por horas no trabajadas.', ...o } as any, who) as Promise<any>;
  const writeOff = (c: Ctx, invoiceId: string, amount: number, o: any = {}, who: any = c.cae) =>
    writeOffs.register(invoiceId, { amount, reason: 'Se agotaron las gestiones de cobro: el cliente cerró operaciones.', ...o } as any, who) as Promise<any>;
  const inv = (id: string) => prisma.clientInvoice.findUniqueOrThrow({ where: { id } });
  const expectClean = async (c: Ctx) => expect(await checkCollectionInvariants(prisma, c.org.id)).toEqual([]);
  const settle = async (ps: Promise<unknown>[]) => Promise.allSettled(ps);
  const ok = (rs: PromiseSettledResult<unknown>[]) => rs.filter((r) => r.status === 'fulfilled').length;

  // ═══ Notas de crédito ═══════════════════════════════════════════════════════════════════════════
  describe('notas de crédito', () => {
    it('bajan el saldo de la factura y lo facturado del encargo, libran espacio del honorario y no reabren la cuota', async () => {
      const c = await seed();
      await setFee(c, 1000);
      await fees.generateSchedule(c.engA.id, { mode: 'EQUAL', count: 2, firstDate: '2026-07-01', everyMonths: 1 } as any, c.cae);
      const item = await prisma.billingScheduleItem.findFirstOrThrow({ where: { engagementId: c.engA.id }, orderBy: { sequence: 'asc' } });
      const a = await invoices.register({ engagementId: c.engA.id, scheduleItemId: item.id, invoiceNumber: num(), documentType: '03', invoiceDate: today(), netAmount: 500, taxAmount: 65 } as any, c.manager) as any;
      expect(a.balance).toBe(565);

      const note = await credit(c, a.id, 100, { taxAmount: 13 });
      expect(note).toMatchObject({ status: 'ACTIVE', totalAmount: 113 });
      expect(await inv(a.id)).toMatchObject({ status: 'PARTIAL' });
      expect(Number((await inv(a.id)).creditedAmount)).toBe(113);

      const view: any = await fees.getFee(c.engA.id, c.manager);
      expect(view.summary).toMatchObject({ invoicedNet: 400, credited: 113 }); // 500 − 100
      // la cuota sigue facturada
      expect((await prisma.billingScheduleItem.findUniqueOrThrow({ where: { id: item.id } })).status).toBe('INVOICED');
      // el espacio liberado permite facturar más: la cuota pendiente es de 500 y ahora caben 100 más sin adenda
      const extra = await invoice(c, 100);
      expect(extra.status).toBe('OPEN');
      await expectClean(c);

      // nota por todo lo que queda de saldo → SETTLED
      const rest = await credit(c, a.id, 400, { taxAmount: 52 });
      expect(rest.totalAmount).toBe(452);
      expect((await inv(a.id)).status).toBe('SETTLED');
      await expectClean(c);
    });

    it('reglas: solo la dirección, no más que el saldo (dice cómo seguir si ya cobró), no más neto que la factura, número único, tipo de DTE y fechas', async () => {
      const c = await seed();
      await setFee(c, 2000);
      const a = await invoice(c, 100); // total 113
      await expect(credit(c, a.id, 10, {}, c.manager)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(credit(c, a.id, 10, {}, c.auditor)).rejects.toBeInstanceOf(ForbiddenException);

      await pay(c, c.clientA.id, 113, { autoAllocate: true });
      expect((await inv(a.id)).status).toBe('SETTLED');
      await expect(credit(c, a.id, 10)).rejects.toThrow(/saldada/);

      const b = await invoice(c, 100);
      await pay(c, c.clientA.id, 60, { applications: [{ invoiceId: b.id, amount: 60 }] });
      await expect(credit(c, b.id, 100, { taxAmount: 13 })).rejects.toThrow(/quita primero la aplicación/); // 113 > saldo 53
      await expect(credit(c, b.id, 50)).resolves.toBeDefined();                                              // 50 ≤ 53
      await expect(credit(c, b.id, 4)).rejects.toThrow(/supera el saldo/);                                    // 4 > 3

      const d = await invoice(c, 100);
      const n1 = await credit(c, d.id, 60, { creditNoteNumber: 'DTE-05-M001P001-000000000000777' });
      await expect(credit(c, d.id, 10, { creditNoteNumber: 'dte-05-m001p001-000000000000777' })).rejects.toThrow(/número de control/); // mayúsculas/minúsculas
      await expect(credit(c, d.id, 50, { taxAmount: 0 })).rejects.toThrow(/acreditarían/);                                           // 60 + 50 > neto 100
      await expect(credit(c, d.id, 10, { creditNoteNumber: num('03') })).rejects.toThrow(/indica el tipo 03/);
      await expect(credit(c, d.id, 10, { issueDate: addDays(today(), 2) })).rejects.toThrow(/futura/);
      await expect(credit(c, d.id, 10, { issueDate: addDays(today(), -5) })).rejects.toThrow(/anterior a la factura/);
      await expect(credit(c, d.id, 10, { reason: 'corto' })).rejects.toThrow(/motivo/);
      // otra organización no la ve
      const other = await seed();
      await expect(credit(other, d.id, 10, {}, other.cae)).rejects.toThrow(/no encontrada/);
      expect(n1.status).toBe('ACTIVE');
      await expectClean(c);
    });

    it('anular una nota devuelve el saldo, se rechaza si rompe el calendario, y la factura no se anula mientras tenga notas vigentes', async () => {
      const c = await seed();
      await setFee(c, 1000);
      const a = await invoice(c, 800);
      const n = await credit(c, a.id, 300);
      await expect(invoices.void(a.id, { reason: 'Se emitió con un monto equivocado' } as any, c.cae)).rejects.toThrow(/notas de crédito vigentes/);

      // lo facturado quedó en 500: se factura otra de 500 y el honorario queda lleno
      await invoice(c, 500);
      await expect(credits.void(n.id, { reason: 'La nota se emitió por error' } as any, c.cae)).rejects.toThrow(/por encima del honorario/);
      expect((await inv(a.id)).status).toBe('PARTIAL');

      // en otro encargo sin ese problema, anular la nota restaura todo
      const d = await seed();
      await setFee(d, 1000);
      const x = await invoice(d, 400);
      const nx = await credit(d, x.id, 100);
      await expect(credits.void(nx.id, { reason: 'x' } as any, d.cae)).rejects.toThrow(/motivo/);
      await expect(credits.void(nx.id, { reason: 'La nota se emitió por error' } as any, d.manager)).rejects.toBeInstanceOf(ForbiddenException);
      const voided = await credits.void(nx.id, { reason: 'La nota se emitió por error' } as any, d.cae);
      expect(voided.status).toBe('VOID');
      expect(await inv(x.id)).toMatchObject({ status: 'OPEN' });
      expect(Number((await inv(x.id)).creditedAmount)).toBe(0);
      await expect(credits.void(nx.id, { reason: 'La nota se emitió por error' } as any, d.cae)).rejects.toThrow(/ya está anulada/);
      // el número queda libre y la factura ya se puede anular
      await expect(credit(d, x.id, 100, { creditNoteNumber: nx.creditNoteNumber })).resolves.toBeDefined();
      await expectClean(c); await expectClean(d);
    });

    it('una nota de crédito contra un cobro sobre la misma factura: gana uno y el saldo nunca queda negativo', async () => {
      for (let n = 0; n < 4; n++) {
        const c = await seed();
        await setFee(c, 1000);
        const a = await invoice(c, 100); // 113
        const p = await pay(c, c.clientA.id, 113);
        const rs = await settle([credit(c, a.id, 100, { taxAmount: 13 }), payments.apply(p.id, { applications: [{ invoiceId: a.id, amount: 113 }] } as any, c.manager)]);
        expect(ok(rs)).toBe(1);
        const row = await inv(a.id);
        expect(row.status).toBe('SETTLED');
        await expectClean(c);
      }
    });

    it('varias notas simultáneas: caben solo las que no pasan del saldo ni del neto de la factura', async () => {
      const c = await seed();
      await setFee(c, 1000);
      const a = await invoice(c, 100); // total 113, neto 100
      const rs = await settle([1, 2, 3, 4, 5].map(() => credit(c, a.id, 40)));
      expect(ok(rs)).toBe(2); // 40 + 40 = 80 ≤ 100; la tercera sería 120
      expect(Number((await inv(a.id)).creditedAmount)).toBe(80);
      await expectClean(c);
    });

    it('la base impone la separación entre clientes y los CHECK aunque el servicio fallara', async () => {
      const c = await seed();
      await setFee(c, 1000);
      const a = await invoice(c, 100);
      const base = { organizationId: c.org.id, invoiceId: a.id, engagementId: c.engA.id, creditNoteNumber: num('05'), issueDate: new Date(), reason: 'Ajuste acordado con el cliente.', createdById: c.cae.id };
      // cliente que no es el de la factura
      await expect(prisma.clientCreditNote.create({ data: { ...base, clientId: c.clientB.id, netAmount: 10, taxAmount: 0, totalAmount: 10 } })).rejects.toThrow();
      // encargo que no es el de la factura
      await expect(prisma.clientCreditNote.create({ data: { ...base, clientId: c.clientA.id, engagementId: c.engB.id, netAmount: 10, taxAmount: 0, totalAmount: 10 } })).rejects.toThrow();
      // total que no es neto + IVA
      await expect(prisma.clientCreditNote.create({ data: { ...base, clientId: c.clientA.id, netAmount: 10, taxAmount: 1, totalAmount: 10 } })).rejects.toThrow();
      // la correcta entra
      await expect(prisma.clientCreditNote.create({ data: { ...base, clientId: c.clientA.id, netAmount: 10, taxAmount: 0, totalAmount: 10 } })).resolves.toBeDefined();
    });
  });

  // ═══ Castigos ═══════════════════════════════════════════════════════════════════════════════════
  describe('castigos de incobrables', () => {
    it('son parciales de verdad: bajan el saldo sin tocar lo cobrado, se revierten, y no se pasa del saldo', async () => {
      const c = await seed();
      await setFee(c, 1000);
      const a = await invoice(c, 100); // 113
      await pay(c, c.clientA.id, 40, { applications: [{ invoiceId: a.id, amount: 40 }] });
      await expect(writeOff(c, a.id, 80)).rejects.toThrow(/supera el saldo/); // saldo 73
      await expect(writeOff(c, a.id, 30, {}, c.manager)).rejects.toBeInstanceOf(ForbiddenException);

      const w = await writeOff(c, a.id, 30);
      expect(w).toMatchObject({ status: 'ACTIVE', amount: 30 });
      let row = await inv(a.id);
      expect(Number(row.writtenOffAmount)).toBe(30);
      expect(Number(row.paidAmount)).toBe(40); // lo cobrado no se toca
      expect(row.status).toBe('PARTIAL');

      const rest = await writeOff(c, a.id, 43); // el resto del saldo
      expect((await inv(a.id)).status).toBe('SETTLED');
      await expect(invoices.void(a.id, { reason: 'Se emitió con un monto equivocado' } as any, c.cae)).rejects.toThrow(/cobros aplicados|castigos/);

      await expect(writeOffs.reverse(w.id, { reason: 'x' } as any, c.cae)).rejects.toThrow(/motivo/);
      await expect(writeOffs.reverse(w.id, { reason: 'El cliente pagó lo castigado' } as any, c.manager)).rejects.toBeInstanceOf(ForbiddenException);
      const rev = await writeOffs.reverse(w.id, { reason: 'El cliente pagó lo castigado' } as any, c.cae);
      expect(rev.status).toBe('REVERSED');
      row = await inv(a.id);
      expect(Number(row.writtenOffAmount)).toBe(43);
      expect(row.status).toBe('PARTIAL');
      await expect(writeOffs.reverse(w.id, { reason: 'El cliente pagó lo castigado' } as any, c.cae)).rejects.toThrow(/ya fue revertido/);
      await writeOffs.reverse(rest.id, { reason: 'El cliente pagó lo castigado' } as any, c.cae);
      expect((await inv(a.id)).status).toBe('PARTIAL');
      await expect(writeOff(c, a.id, 5, { writtenOffOn: addDays(today(), 3) })).rejects.toThrow(/futura/);
      await expectClean(c);
    });

    it('un castigo contra un cobro sobre la misma factura: el saldo nunca queda negativo', async () => {
      for (let n = 0; n < 4; n++) {
        const c = await seed();
        await setFee(c, 1000);
        const a = await invoice(c, 100);
        const p = await pay(c, c.clientA.id, 113);
        const rs = await settle([writeOff(c, a.id, 113), payments.apply(p.id, { applications: [{ invoiceId: a.id, amount: 113 }] } as any, c.manager)]);
        expect(ok(rs)).toBe(1);
        expect((await inv(a.id)).status).toBe('SETTLED');
        await expectClean(c);
      }
    });

    it('varios castigos simultáneos: caben exactamente los que no pasan del saldo', async () => {
      const c = await seed();
      await setFee(c, 1000);
      const a = await invoice(c, 100); // 113
      const rs = await settle([1, 2, 3, 4, 5, 6].map(() => writeOff(c, a.id, 30)));
      expect(ok(rs)).toBe(3); // 90 ≤ 113; el cuarto sería 120
      expect(Number((await inv(a.id)).writtenOffAmount)).toBe(90);
      await expectClean(c);
    });

    it('revertir un castigo mientras se cobra la factura: el saldo siempre cuadra', async () => {
      for (let n = 0; n < 3; n++) {
        const c = await seed();
        await setFee(c, 1000);
        const a = await invoice(c, 100);
        const w = await writeOff(c, a.id, 113);
        const p = await pay(c, c.clientA.id, 113);
        // revertir devuelve 113 de saldo y cobrar necesita ese saldo: cualquier orden es válida, pero el total nunca pasa de 113
        await settle([writeOffs.reverse(w.id, { reason: 'El cliente pagó lo castigado' } as any, c.cae), payments.apply(p.id, { applications: [{ invoiceId: a.id, amount: 113 }] } as any, c.manager)]);
        const row = await inv(a.id);
        expect(Number(row.paidAmount) + Number(row.writtenOffAmount)).toBeLessThanOrEqual(113);
        await expectClean(c);
      }
    });
  });

  // ═══ Gestión de cobro ═══════════════════════════════════════════════════════════════════════════
  describe('gestión de cobro', () => {
    it('agrega contactos con promesa, valida fechas y vínculos, y respeta autor y dirección al corregir o borrar', async () => {
      const c = await seed();
      await setFee(c, 1000);
      const a = await invoice(c, 100);
      const other = await invoice(c, 100, {}, c.engA);
      void other;
      const b = await (async () => { await setFee(c, 1000, c.engB); return invoice(c, 100, {}, c.engB); })();

      const n1: any = await notes.create({ clientId: c.clientA.id, invoiceId: a.id, method: 'CALL', note: 'Se habló con contabilidad', contactName: 'Ana', promiseDate: addDays(today(), 5), promiseAmount: 50, nextFollowUpOn: addDays(today(), 6) } as any, c.manager);
      expect(n1).toMatchObject({ promiseStatus: 'PENDING', promiseAmount: 50, invoiceNumber: a.invoiceNumber, createdByName: 'manager', promiseOverdue: false });

      await expect(notes.create({ clientId: c.clientA.id, invoiceId: b.id, method: 'CALL', note: 'x de otro cliente' } as any, c.manager)).rejects.toThrow(/no es de este cliente/);
      await expect(notes.create({ clientId: c.clientA.id, engagementId: c.engB.id, method: 'CALL', note: 'encargo ajeno' } as any, c.manager)).rejects.toThrow(/no es de este cliente/);
      await expect(notes.create({ clientId: c.clientA.id, method: 'CALL', note: 'sin fecha de promesa', promiseAmount: 10 } as any, c.manager)).rejects.toThrow(/fecha de la promesa/);
      await expect(notes.create({ clientId: c.clientA.id, method: 'CALL', note: 'futuro', contactedOn: addDays(today(), 1) } as any, c.manager)).rejects.toThrow(/futura/);
      await expect(notes.create({ clientId: c.clientA.id, method: 'CALL', note: 'seguimiento antes', nextFollowUpOn: addDays(today(), -1) } as any, c.manager)).rejects.toThrow(/anterior al contacto/);
      await expect(notes.create({ clientId: c.clientA.id, method: 'CALL', note: 'auditor', } as any, c.auditor)).rejects.toBeInstanceOf(ForbiddenException);

      // el autor o la dirección corrigen; otro gerente no
      const manager2 = await prisma.user.create({ data: { organizationId: c.org.id, supabaseUserId: randomUUID(), email: `m2-${c.tag}@t.test`, name: 'm2', role: 'AUDIT_MANAGER' } });
      const m2 = { ...c.manager, id: manager2.id, name: 'm2' };
      await expect(notes.update(n1.id, { note: 'Texto corregido de la llamada' } as any, m2)).rejects.toBeInstanceOf(ForbiddenException);
      const edited: any = await notes.update(n1.id, { note: 'Texto corregido de la llamada', nextFollowUpOn: '' } as any, c.manager);
      expect(edited).toMatchObject({ note: 'Texto corregido de la llamada', nextFollowUpOn: null });
      const upd = await prisma.collectionLog.findFirstOrThrow({ where: { entityId: n1.id, action: 'COLLECTION_NOTE_UPDATED' } });
      expect((upd.before as any).note).toBe('Se habló con contabilidad'); // la versión anterior queda en la bitácora

      // estado de la promesa
      expect((await notes.setPromiseStatus(n1.id, { status: 'KEPT' } as any, c.manager)).promiseStatus).toBe('KEPT');
      const plain: any = await notes.create({ clientId: c.clientA.id, method: 'EMAIL', note: 'Solo un correo' } as any, c.manager);
      await expect(notes.setPromiseStatus(plain.id, { status: 'KEPT' } as any, c.manager)).rejects.toThrow(/no tiene una promesa/);

      // borrar: otro gerente no; la dirección sí, con rastro
      await expect(notes.remove(plain.id, m2)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(notes.remove(plain.id, c.cae)).resolves.toEqual({ deleted: true });
      const del = await prisma.collectionLog.findFirstOrThrow({ where: { entityId: plain.id, action: 'COLLECTION_NOTE_DELETED' } });
      expect((del.before as any).note).toBe('Solo un correo');

      const list: any = await notes.list({ clientId: c.clientA.id } as any, c.manager);
      expect(list.items.map((i: any) => i.id)).toEqual([n1.id]);
      await expectClean(c);
    });

    it('sugiere «posible cumplida» cuando los cobros posteriores cubren lo prometido y marca la promesa vencida', async () => {
      const c = await seed();
      await setFee(c, 1000);
      await invoice(c, 100);
      const n: any = await notes.create({
        clientId: c.clientA.id, method: 'CALL', note: 'Prometió pagar', contactedOn: addDays(today(), -10), promiseDate: addDays(today(), -3), promiseAmount: 80,
      } as any, c.manager);
      expect(n).toMatchObject({ promiseOverdue: true, possiblyKept: false });
      await pay(c, c.clientA.id, 50);
      expect((await notes.list({ clientId: c.clientA.id } as any, c.manager) as any).items[0].possiblyKept).toBe(false);
      await pay(c, c.clientA.id, 40);
      expect((await notes.list({ clientId: c.clientA.id } as any, c.manager) as any).items[0].possiblyKept).toBe(true);
      // y NO cambia solo el estado
      expect((await prisma.collectionNote.findUniqueOrThrow({ where: { id: n.id } })).promiseStatus).toBe('PENDING');
    });

    it('alertas: promesas vencidas, seguimientos solo de la última nota, y facturas vencidas sin gestión reciente', async () => {
      const c = await seed();
      await setFee(c, 5000);
      const due = addDays(today(), -40);
      const overdue1 = await invoice(c, 100, { invoiceDate: addDays(today(), -70), dueDate: due });
      const overdue2 = await invoice(c, 100, { invoiceDate: addDays(today(), -70), dueDate: due });
      const current = await invoice(c, 100); // vence en 30 días: no avisa

      // sin ninguna gestión: las dos vencidas avisan
      let al: any = await notes.alerts({} as any, c.manager);
      expect(al.unattendedInvoices.map((i: any) => i.id).sort()).toEqual([overdue1.id, overdue2.id].sort());
      expect(al.unattendedInvoices.find((i: any) => i.id === current.id)).toBeUndefined();
      expect(al.unattendedInvoices[0].overdueDays).toBe(40);

      // una gestión de la factura 1 la saca de la lista; una general del cliente saca las dos
      await notes.create({ clientId: c.clientA.id, invoiceId: overdue1.id, method: 'CALL', note: 'Se llamó por la factura 1', nextFollowUpOn: today() } as any, c.manager);
      al = await notes.alerts({} as any, c.manager);
      expect(al.unattendedInvoices.map((i: any) => i.id)).toEqual([overdue2.id]);
      expect(al.followUps).toHaveLength(1); // seguimiento para hoy
      await notes.create({ clientId: c.clientA.id, method: 'EMAIL', note: 'Correo general al cliente' } as any, c.manager);
      al = await notes.alerts({} as any, c.manager);
      expect(al.unattendedInvoices).toEqual([]);
      expect(al.followUps).toEqual([]); // el seguimiento quedó atendido por una nota más reciente del cliente

      // promesa vencida
      await notes.create({ clientId: c.clientA.id, method: 'CALL', note: 'Prometió pagar el viernes', contactedOn: addDays(today(), -9), promiseDate: addDays(today(), -4), promiseAmount: 100 } as any, c.manager);
      al = await notes.alerts({} as any, c.manager);
      expect(al.overduePromises).toHaveLength(1);
      expect(al.counts).toMatchObject({ overduePromises: 1, followUps: 0, unattendedInvoices: 0 });

      // la ventana de «sin gestión» se puede acortar: con 0 días... (mínimo 1) y gestión de hace más de la ventana vuelve a avisar
      const old = await seed();
      await setFee(old, 1000);
      const oi = await invoice(old, 100, { invoiceDate: addDays(today(), -70), dueDate: addDays(today(), -40) });
      await notes.create({ clientId: old.clientA.id, invoiceId: oi.id, method: 'CALL', note: 'Gestión antigua', contactedOn: addDays(today(), -20) } as any, old.manager);
      expect((await notes.alerts({} as any, old.manager) as any).counts.unattendedInvoices).toBe(1);        // 20 días > 15
      expect((await notes.alerts({ staleDays: 30 } as any, old.manager) as any).counts.unattendedInvoices).toBe(0);
      // otra organización no ve nada de esta
      expect((await notes.alerts({} as any, c.manager) as any).counts.unattendedInvoices).toBe(0);
      await expect(notes.alerts({} as any, c.auditor)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('la base exige que la factura y el encargo de la nota sean del cliente, y que la promesa tenga fecha y estado juntos', async () => {
      const c = await seed();
      await setFee(c, 1000);
      const a = await invoice(c, 100);
      const base = { organizationId: c.org.id, contactedOn: new Date(), method: 'CALL' as const, note: 'nota de prueba', createdById: c.cae.id };
      await expect(prisma.collectionNote.create({ data: { ...base, clientId: c.clientB.id, invoiceId: a.id } })).rejects.toThrow();
      await expect(prisma.collectionNote.create({ data: { ...base, clientId: c.clientA.id, engagementId: c.engB.id } })).rejects.toThrow();
      await expect(prisma.collectionNote.create({ data: { ...base, clientId: c.clientA.id, promiseDate: new Date() } })).rejects.toThrow();          // fecha sin estado
      await expect(prisma.collectionNote.create({ data: { ...base, clientId: c.clientA.id, promiseAmount: 10 } })).rejects.toThrow();                // monto sin promesa
      await expect(prisma.collectionNote.create({ data: { ...base, clientId: c.clientA.id, promiseDate: new Date(), promiseStatus: 'PENDING', promiseAmount: 0 } })).rejects.toThrow();
      await expect(prisma.collectionNote.create({ data: { ...base, clientId: c.clientA.id, invoiceId: a.id } })).resolves.toBeDefined();
    });
  });
});
