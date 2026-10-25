import { BadRequestException, ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { ClientInvoiceStatus } from '@prisma/client';
import { formatMoney, parseMoneyInput } from './money.util';
import { isCollectable } from './balance.util';

/**
 * Aplicación de un cobro a facturas — reglas puras (sin base de datos). Adaptado de `ar-payment-allocation.ts` de Nexus
 * Finance (ids cuid en lugar de UUID, estados OPEN/PARTIAL, orden por VENCIMIENTO y todo en centavos). La autoridad final son
 * los servicios, que repiten estas comprobaciones con las filas bloqueadas; aquí se evita crear el cobro para fallar al aplicarlo.
 */

export interface AllocatableInvoice {
  id: string;
  invoiceNumber: string;
  /** YYYY-MM-DD */
  dueDate: string;
  balanceCents: number;
}

export interface ApplicationInput {
  invoiceId: string;
  amountCents: number;
}

export interface InvoiceForCheck {
  id: string;
  invoiceNumber: string;
  clientId: string;
  status: ClientInvoiceStatus;
  balanceCents: number;
}

const ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
export const isId = (v: unknown): v is string => typeof v === 'string' && ID_RE.test(v);

export const sumApplications = (apps: ApplicationInput[]) => apps.reduce((s, a) => s + a.amountCents, 0);

/**
 * Reparte `amountCents` entre las facturas, la que vence primero primero (a igual vencimiento, por número en orden natural).
 * Cada factura recibe a lo sumo su saldo; lo que sobra queda sin aplicar (saldo a favor).
 */
export function allocateOldestFirst(
  amountCents: number,
  invoices: AllocatableInvoice[],
): { applications: ApplicationInput[]; appliedCents: number; unappliedCents: number } {
  const start = Math.max(0, amountCents);
  let remaining = start;
  const sorted = [...invoices].sort((a, b) =>
    a.dueDate === b.dueDate
      ? a.invoiceNumber.localeCompare(b.invoiceNumber, 'es', { numeric: true })
      : a.dueDate < b.dueDate ? -1 : 1);

  const applications: ApplicationInput[] = [];
  for (const inv of sorted) {
    if (remaining <= 0) break;
    if (inv.balanceCents <= 0) continue;
    const take = Math.min(remaining, inv.balanceCents);
    applications.push({ invoiceId: inv.id, amountCents: take });
    remaining -= take;
  }
  return { applications, appliedCents: start - remaining, unappliedCents: remaining };
}

/**
 * Normaliza lo que llega en el cuerpo: lista de { invoiceId, amount } con ids válidos, montos positivos de a lo sumo 2
 * decimales y sin facturas repetidas. Ausente o vacío significa «sin aplicación».
 */
export function parseApplications(raw: unknown): ApplicationInput[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) throw new BadRequestException('Las aplicaciones deben ser una lista de { invoiceId, amount }.');
  const seen = new Set<string>();
  const out: ApplicationInput[] = [];
  for (const item of raw) {
    const invoiceId = (item as { invoiceId?: unknown } | null)?.invoiceId;
    if (!isId(invoiceId)) throw new BadRequestException('Cada aplicación necesita un invoiceId válido.');
    if (seen.has(invoiceId)) throw new BadRequestException('Una misma factura no puede aparecer dos veces en la aplicación.');
    seen.add(invoiceId);
    out.push({ invoiceId, amountCents: parseMoneyInput((item as { amount?: unknown }).amount, 'El monto a aplicar') });
  }
  return out;
}

/**
 * Revisión de una aplicación: las facturas deben existir, ser del cliente del cobro, estar OPEN o PARTIAL, no recibir más que
 * su saldo, y el total no pasar de lo que le queda por aplicar al cobro. Devuelve el total aplicado en centavos.
 */
export function checkApplications(args: {
  unappliedCents: number;
  clientId: string;
  applications: ApplicationInput[];
  invoices: InvoiceForCheck[];
}): number {
  const byId = new Map(args.invoices.map((i) => [i.id, i]));
  let total = 0;
  for (const app of args.applications) {
    const inv = byId.get(app.invoiceId);
    if (!inv) throw new NotFoundException('Una de las facturas no existe en esta organización.');
    if (inv.clientId !== args.clientId) {
      throw new UnprocessableEntityException(`La factura ${inv.invoiceNumber} pertenece a otro cliente.`);
    }
    if (!isCollectable(inv.status)) {
      throw new ConflictException(`La factura ${inv.invoiceNumber} está en estado ${inv.status}: solo se cobran facturas abiertas o con saldo pendiente.`);
    }
    if (app.amountCents > inv.balanceCents) {
      throw new UnprocessableEntityException(
        `El abono de ${formatMoney(app.amountCents)} a la factura ${inv.invoiceNumber} supera su saldo (${formatMoney(inv.balanceCents)}).`,
      );
    }
    total += app.amountCents;
  }
  if (total > args.unappliedCents) {
    throw new UnprocessableEntityException(
      `Lo aplicado a facturas (${formatMoney(total)}) supera lo que le queda por aplicar al cobro (${formatMoney(args.unappliedCents)}).`,
    );
  }
  return total;
}

/**
 * Una factura no puede quedar con saldo negativo: dinero aplicado + retenciones nuevas ≤ saldo vigente.
 * Se llama por factura, con la fila ya bloqueada.
 */
export function assertWithinBalance(args: { invoiceNumber: string; balanceCents: number; moneyCents: number; withholdingCents: number }) {
  const need = args.moneyCents + args.withholdingCents;
  if (need > args.balanceCents) {
    throw new UnprocessableEntityException(
      `La factura ${args.invoiceNumber} tiene saldo de ${formatMoney(args.balanceCents)} y se intenta descontar ${formatMoney(need)} ` +
      `(${formatMoney(args.moneyCents)} cobrados + ${formatMoney(args.withholdingCents)} retenidos).`,
    );
  }
}
