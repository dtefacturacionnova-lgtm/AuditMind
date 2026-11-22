import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { randomInt, randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { EXEMPT_PLAN_CODES } from './billing.constants';
import { addMonths } from './entitlements';
import { EntitlementsService } from './entitlements.service';
import { SubscriptionsService } from './subscriptions.service';

const DAY_MS = 24 * 60 * 60 * 1000;
export const PAYMENT_TTL_DAYS = 14;
export const MAX_PENDING_PAYMENTS = 5;
export const MAX_PROOF_BYTES = 5 * 1024 * 1024;
const PROOF_BUCKET = 'audit-files';
const REF_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin I, O, 0, 1: no se confunden al dictarlas

/** Referencia única que el cliente escribe al pagar: AUD-XXXXXX. */
export function newReference(): string {
  return 'AUD-' + Array.from({ length: 6 }, () => REF_ALPHABET[randomInt(REF_ALPHABET.length)]).join('');
}

/** Meses de calendario (mínimo 1) hasta el fin del periodo: una licencia de 3 meses suma 3 aunque tenga 92 días; sin fecha de fin se cobran 12. */
export function monthsUntil(end: Date | null, now: Date = new Date()): number {
  if (!end) return 12;
  let n = 1;
  while (n < 120 && addMonths(now, n) < end) n++;
  return n;
}

/** El tipo real del comprobante por sus primeros bytes (no por la extensión ni por lo que declare el navegador). */
export function sniffProof(buf: Buffer): { ext: 'pdf' | 'jpg' | 'png'; mime: string } | null {
  if (buf.length >= 5 && buf.subarray(0, 5).toString('latin1') === '%PDF-') return { ext: 'pdf', mime: 'application/pdf' };
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: 'jpg', mime: 'image/jpeg' };
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { ext: 'png', mime: 'image/png' };
  return null;
}

export interface CreatePaymentInput {
  kind: 'LICENSE' | 'PACK';
  planCode?: string;
  months?: number;
  packCode?: string;
  method: 'TRANSFER' | 'QR' | 'CASH';
}

/**
 * Pagos con aprobación manual (transferencia, QR 365, efectivo) de licencias y paquetes. El pago nace PENDIENTE con una referencia única; el cliente
 * sube su comprobante; un superadmin lo aprueba y recién entonces se acredita — en UNA transacción y UNA sola vez (la aprobación es condicional y
 * el paquete tiene el pago como clave única).
 */
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger('Payments');
  private readonly storage: SupabaseClient;

  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
    private readonly subscriptions: SubscriptionsService,
  ) {
    this.storage = createClient(process.env.SUPABASE_URL ?? 'http://localhost:54321', process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'no-key', {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }

  // ─── Catálogo de paquetes ───────────────────────────────────────────────────

  /** Paquetes que el cliente puede comprar según su plan (el plan decide si admite paquetes de IA y de espacio). */
  async packsFor(organizationId: string) {
    const [packs, ent] = await Promise.all([
      this.prisma.addonPack.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } }),
      this.entitlements.get(organizationId),
    ]);
    return packs
      .filter((p) => !ent || (p.kind === 'AI' ? ent.limits.packsAi : ent.limits.packsStorage))
      .map((p) => ({ code: p.code, kind: p.kind, name: p.name, quantity: p.quantity, priceUsd: Number(p.priceUsd), recurring: p.recurring }));
  }

  // ─── Cliente ────────────────────────────────────────────────────────────────

  async createRequest(user: { id: string; organizationId: string }, input: CreatePaymentInput) {
    const organizationId = user.organizationId;
    const sub = await this.prisma.billingSubscription.findUnique({ where: { organizationId } });
    if (!sub) throw new NotFoundException('Tu organización aún no tiene un plan: contacta a la plataforma.');
    const pending = await this.prisma.billingPayment.count({ where: { organizationId, status: 'PENDING' } });
    if (pending >= MAX_PENDING_PAYMENTS) throw new ConflictException('Tienes demasiados pagos pendientes. Espera la aprobación o cancela alguno.');

    const snap = (sub.planSnapshot ?? {}) as { code?: string };
    let data: Pick<Prisma.BillingPaymentUncheckedCreateInput, 'kind' | 'planCode' | 'months' | 'packCode' | 'concept' | 'amountUsd'>;

    if (input.kind === 'LICENSE') {
      const code = (input.planCode ?? '').trim().toUpperCase();
      const months = input.months ?? 0;
      if (!code || ![1, 3, 6, 12].includes(months)) throw new BadRequestException('Indica el plan y la duración (1, 3, 6 o 12 meses).');
      if (EXEMPT_PLAN_CODES.includes(code)) throw new BadRequestException('Ese plan no se contrata por pago.');
      const plan = await this.prisma.billingPlan.findUnique({ where: { code }, include: { prices: true } });
      const price = plan?.prices.find((p) => p.months === months && p.active);
      if (!plan || !plan.active || !price) throw new NotFoundException('Ese plan no está disponible para esa duración.');
      const sameContract = snap.code === plan.code && sub.months === months && sub.agreedPriceUsd !== null;
      data = {
        kind: 'LICENSE', planCode: plan.code, months, packCode: null,
        concept: `Licencia ${plan.name} · ${months === 1 ? '1 mes' : months + ' meses'}`,
        amountUsd: sameContract ? sub.agreedPriceUsd! : price.priceUsd,
      };
    } else {
      const pack = await this.prisma.addonPack.findUnique({ where: { code: (input.packCode ?? '').trim().toUpperCase() } });
      if (!pack || !pack.active) throw new NotFoundException('Ese paquete no está disponible.');
      const ent = await this.entitlements.get(organizationId);
      if (ent && !(pack.kind === 'AI' ? ent.limits.packsAi : ent.limits.packsStorage)) throw new ForbiddenException('Tu plan no permite comprar este tipo de paquete.');
      const months = pack.kind === 'STORAGE' ? monthsUntil(sub.currentPeriodEnd) : 0;
      data = {
        kind: 'PACK', planCode: null, months: null, packCode: pack.code,
        concept: pack.kind === 'STORAGE' ? `${pack.name} · ${months} mes(es) hasta tu vencimiento` : pack.name,
        amountUsd: pack.kind === 'STORAGE' ? new Prisma.Decimal(pack.priceUsd).mul(months) : pack.priceUsd,
      };
    }

    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const payment = await this.prisma.billingPayment.create({
          data: {
            organizationId, ...data, method: input.method, reference: newReference(), requestedById: user.id,
            expiresAt: new Date(Date.now() + PAYMENT_TTL_DAYS * DAY_MS),
          },
        });
        await this.prisma.billingEvent.create({ data: { organizationId, actorId: user.id, type: 'PAYMENT_REQUESTED', data: { reference: payment.reference, concept: payment.concept } } });
        return this.present(payment, await this.instructions(input.method));
      } catch (e) {
        if ((e as { code?: string }).code !== 'P2002') throw e; // referencia repetida: se genera otra
      }
    }
    throw new ConflictException('No se pudo generar la referencia de pago. Intenta de nuevo.');
  }

  /** Texto de «cómo pagar» que la plataforma cargó para cada método (QR, TRANSFER, CASH); lo que no sea texto se ignora. */
  private async instructionTexts(): Promise<Record<string, string>> {
    const row = await this.prisma.billingSettings.findUnique({ where: { id: 'default' }, select: { paymentInstructions: true } });
    const all = (row?.paymentInstructions ?? {}) as Record<string, unknown>;
    return Object.fromEntries(Object.entries(all).filter(([, v]) => typeof v === 'string')) as Record<string, string>;
  }

  private async instructions(method: string): Promise<string | null> {
    return (await this.instructionTexts())[method] ?? null;
  }

  private present(p: Prisma.BillingPaymentGetPayload<object>, instructions: string | null = null) {
    return {
      id: p.id, kind: p.kind, planCode: p.planCode, months: p.months, packCode: p.packCode, concept: p.concept, amountUsd: Number(p.amountUsd),
      method: p.method, status: p.status, reference: p.reference, hasProof: !!p.proofPath, proofName: p.proofName, rejectedReason: p.rejectedReason,
      approvedAt: p.approvedAt, expiresAt: p.expiresAt, createdAt: p.createdAt, instructions,
    };
  }

  async listMine(organizationId: string) {
    const rows = await this.prisma.billingPayment.findMany({ where: { organizationId }, orderBy: { createdAt: 'desc' }, take: 50 });
    // Mientras el pago sigue pendiente, el cliente puede volver a ver cómo pagarlo (no solo al pedirlo); en los demás estados ya no hace falta.
    const texts = rows.some((p) => p.status === 'PENDING') ? await this.instructionTexts() : {};
    return rows.map((p) => this.present(p, p.status === 'PENDING' ? (texts[p.method] ?? null) : null));
  }

  async attachProof(organizationId: string, paymentId: string, file: { originalname: string; buffer: Buffer } | undefined) {
    if (!file?.buffer?.length) throw new BadRequestException('Adjunta el comprobante (PDF, JPG o PNG).');
    if (file.buffer.length > MAX_PROOF_BYTES) throw new BadRequestException('El comprobante pesa más de 5 MB.');
    const kind = sniffProof(file.buffer);
    if (!kind) throw new BadRequestException('El comprobante debe ser un PDF, JPG o PNG válido.');
    const payment = await this.prisma.billingPayment.findFirst({ where: { id: paymentId, organizationId } });
    if (!payment) throw new NotFoundException('Pago no encontrado');
    if (payment.status !== 'PENDING') throw new ConflictException('Solo se puede adjuntar el comprobante a un pago pendiente.');
    const path = `billing-payments/${organizationId}/${payment.id}/${randomUUID()}.${kind.ext}`;
    const { error } = await this.storage.storage.from(PROOF_BUCKET).upload(path, file.buffer, { contentType: kind.mime, upsert: false });
    if (error) {
      this.logger.error(`No se pudo guardar el comprobante de ${payment.reference}: ${error.message}`);
      throw new BadRequestException('No se pudo guardar el comprobante. Intenta de nuevo.');
    }
    const name = file.originalname.replace(/[^\w.\- ()áéíóúñÁÉÍÓÚÑ]/g, '_').slice(0, 120);
    const updated = await this.prisma.billingPayment.update({ where: { id: payment.id }, data: { proofPath: path, proofName: name } });
    return this.present(updated);
  }

  async cancel(organizationId: string, paymentId: string) {
    const r = await this.prisma.billingPayment.updateMany({ where: { id: paymentId, organizationId, status: 'PENDING' }, data: { status: 'CANCELLED' } });
    if (r.count !== 1) throw new ConflictException('Solo se puede cancelar un pago pendiente.');
    return { cancelled: true };
  }

  // ─── Superadmin ─────────────────────────────────────────────────────────────

  async listPacks() {
    return this.prisma.addonPack.findMany({ orderBy: { sortOrder: 'asc' } });
  }

  async createPack(input: { code?: string; kind?: 'AI' | 'STORAGE'; name?: string; quantity?: number; priceUsd?: number; recurring?: boolean; active?: boolean; sortOrder?: number }, actorId: string) {
    const code = (input.code ?? '').trim().toUpperCase();
    if (!/^[A-Z0-9_]{3,40}$/.test(code)) throw new BadRequestException('El código del paquete debe tener 3 a 40 letras mayúsculas, números o guion bajo.');
    if (!input.kind || !input.name?.trim() || !input.quantity || input.priceUsd === undefined) throw new BadRequestException('Faltan datos del paquete (tipo, nombre, cantidad y precio).');
    if (await this.prisma.addonPack.findUnique({ where: { code }, select: { id: true } })) throw new ConflictException(`Ya existe el paquete ${code}.`);
    const pack = await this.prisma.addonPack.create({
      data: { code, kind: input.kind, name: input.name.trim(), quantity: input.quantity, priceUsd: input.priceUsd, recurring: input.recurring ?? input.kind === 'STORAGE', active: input.active ?? true, sortOrder: input.sortOrder ?? 0 },
    });
    await this.prisma.billingEvent.create({ data: { actorId, type: 'PACK_CREATED', data: { code } } });
    return pack;
  }

  async updatePack(id: string, input: { name?: string; quantity?: number; priceUsd?: number; recurring?: boolean; active?: boolean; sortOrder?: number }, actorId: string) {
    const pack = await this.prisma.addonPack.findUnique({ where: { id } });
    if (!pack) throw new NotFoundException('Paquete no encontrado');
    if (input.name !== undefined && !input.name.trim()) throw new BadRequestException('El nombre del paquete no puede quedar vacío.');
    // Al aprobar un pago se acredita la cantidad que tenga el paquete EN ESE MOMENTO, mientras que el monto cobrado queda fijo al pedirlo:
    // cambiar la cantidad con pagos pendientes haría que el cliente reciba algo distinto de lo que pagó.
    if (input.quantity !== undefined && input.quantity !== pack.quantity) {
      const pending = await this.prisma.billingPayment.count({ where: { kind: 'PACK', packCode: pack.code, status: 'PENDING' } });
      if (pending > 0) {
        throw new ConflictException(
          `Hay ${pending} pago${pending === 1 ? '' : 's'} pendiente${pending === 1 ? '' : 's'} de este paquete: se acreditan con la cantidad vigente al aprobarse, `
          + 'así que no se puede cambiar la cantidad hasta que se aprueben, se rechacen o venzan. Puedes crear otro paquete con la cantidad nueva y desactivar este.',
        );
      }
    }
    const updated = await this.prisma.addonPack.update({
      where: { id },
      data: {
        ...(input.name !== undefined && { name: input.name.trim() }), ...(input.quantity !== undefined && { quantity: input.quantity }),
        ...(input.priceUsd !== undefined && { priceUsd: input.priceUsd }), ...(input.recurring !== undefined && { recurring: input.recurring }),
        ...(input.active !== undefined && { active: input.active }), ...(input.sortOrder !== undefined && { sortOrder: input.sortOrder }),
      },
    });
    await this.prisma.billingEvent.create({ data: { actorId, type: 'PACK_UPDATED', data: { code: pack.code, fields: Object.keys(input) } } });
    return updated;
  }

  async listAll(filter: { status?: string; organizationId?: string }) {
    const rows = await this.prisma.billingPayment.findMany({
      where: { ...(filter.status && { status: filter.status as never }), ...(filter.organizationId && { organizationId: filter.organizationId }) },
      orderBy: { createdAt: 'desc' }, take: 200,
    });
    const orgs = await this.prisma.organization.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.organizationId))] } }, select: { id: true, name: true } });
    const names = new Map(orgs.map((o) => [o.id, o.name]));
    return rows.map((p) => ({ ...this.present(p), organizationId: p.organizationId, organizationName: names.get(p.organizationId) ?? '—' }));
  }

  async proofUrl(paymentId: string): Promise<{ url: string }> {
    const p = await this.prisma.billingPayment.findUnique({ where: { id: paymentId }, select: { proofPath: true } });
    if (!p?.proofPath) throw new NotFoundException('Este pago no tiene comprobante.');
    const { data, error } = await this.storage.storage.from(PROOF_BUCKET).createSignedUrl(p.proofPath, 300);
    if (error || !data) throw new BadRequestException('No se pudo abrir el comprobante.');
    return { url: data.signedUrl };
  }

  /**
   * Aprueba el pago y acredita su efecto en UNA transacción: la aprobación es CONDICIONAL (solo si sigue pendiente), así que dos aprobaciones a
   * la vez o un reintento no acreditan dos veces; además el paquete tiene el pago como clave única.
   */
  async approve(paymentId: string, actorId: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.billingPayment.updateMany({ where: { id: paymentId, status: 'PENDING' }, data: { status: 'APPROVED', approvedById: actorId, approvedAt: new Date() } });
      if (claimed.count !== 1) throw new ConflictException('Este pago ya fue procesado (aprobado, rechazado, cancelado o vencido).');
      const p = await tx.billingPayment.findUniqueOrThrow({ where: { id: paymentId } });

      if (p.kind === 'LICENSE') {
        const sub = await tx.billingSubscription.findUnique({ where: { organizationId: p.organizationId }, select: { planSnapshot: true } });
        const current = ((sub?.planSnapshot ?? {}) as { code?: string }).code;
        if (current === p.planCode) await this.subscriptions.renew(p.organizationId, p.months ?? undefined, actorId, { paymentId, reference: p.reference }, tx);
        else await this.subscriptions.assign(p.organizationId, { planCode: p.planCode!, months: p.months! }, actorId, tx);
      } else {
        const pack = await tx.addonPack.findUniqueOrThrow({ where: { code: p.packCode! } });
        const sub = await tx.billingSubscription.findUnique({ where: { organizationId: p.organizationId }, select: { currentPeriodEnd: true } });
        const now = new Date();
        await tx.addonPurchase.create({
          data: {
            organizationId: p.organizationId, packId: pack.id, kind: pack.kind, quantity: pack.quantity, remaining: pack.quantity, priceUsd: p.amountUsd,
            // Peticiones de IA: valen 12 meses. Espacio: vale mientras dure la licencia (o 12 meses si no vence).
            expiresAt: pack.kind === 'AI' ? new Date(now.getTime() + 365 * DAY_MS) : sub?.currentPeriodEnd ?? new Date(now.getTime() + 365 * DAY_MS),
            paymentId: p.id,
          },
        });
        await tx.billingEvent.create({ data: { organizationId: p.organizationId, actorId, type: 'PACK_CREDITED', data: { pack: pack.code, reference: p.reference } } });
      }
      await tx.billingEvent.create({ data: { organizationId: p.organizationId, actorId, type: 'PAYMENT_APPROVED', data: { reference: p.reference, amountUsd: Number(p.amountUsd), concept: p.concept } } });
      return p;
    });
    this.entitlements.invalidate(result.organizationId);
    return this.present(await this.prisma.billingPayment.findUniqueOrThrow({ where: { id: paymentId } }));
  }

  async reject(paymentId: string, actorId: string, reason: string) {
    const text = (reason ?? '').trim();
    if (text.length < 3) throw new BadRequestException('Indica el motivo del rechazo.');
    const r = await this.prisma.billingPayment.updateMany({ where: { id: paymentId, status: 'PENDING' }, data: { status: 'REJECTED', rejectedReason: text.slice(0, 500), approvedById: actorId, approvedAt: new Date() } });
    if (r.count !== 1) throw new ConflictException('Este pago ya fue procesado.');
    const p = await this.prisma.billingPayment.findUniqueOrThrow({ where: { id: paymentId } });
    await this.prisma.billingEvent.create({ data: { organizationId: p.organizationId, actorId, type: 'PAYMENT_REJECTED', data: { reference: p.reference, reason: text } } });
    return this.present(p);
  }

  /** Pagos pendientes cuyo plazo pasó → VENCIDO (los comprobantes nunca se borran). */
  async expireOld(now: Date = new Date()): Promise<number> {
    return (await this.prisma.billingPayment.updateMany({ where: { status: 'PENDING', expiresAt: { lt: now } }, data: { status: 'EXPIRED' } })).count;
  }
}
