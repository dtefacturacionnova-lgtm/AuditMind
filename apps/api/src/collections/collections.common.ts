import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { CollectionLogAction, OrgAuditModality, Prisma } from '@prisma/client';
import { AuthUser } from '../auth/jwt.strategy';
import { ROLE_HIERARCHY } from '../common/guards/roles.guard';

/**
 * Piezas compartidas de la cobranza: candados, bitácora, permisos y utilidades de fechas.
 *
 * ORDEN ÚNICO DE CANDADOS (docs/cobros-honorarios-diseno.md §4.0) — toda operación los toma en este orden y nunca al revés:
 *   1. el ENCARGO (advisory lock)   — solo las operaciones que tocan honorario, calendario o facturación
 *   2. el COBRO   (FOR UPDATE)
 *   3. las FACTURAS, por id ascendente (FOR UPDATE)
 *   4. cuota / nota de crédito / castigo
 * Lo que se lee para decidir se lee DESPUÉS de tomar el candado (en READ COMMITTED la lectura posterior ve lo ya confirmado).
 */
export type Db = Prisma.TransactionClient;

export const TX_OPTIONS = { timeout: 30_000, maxWait: 10_000 } as const;

export const MANAGER_RANK = ROLE_HIERARCHY.AUDIT_MANAGER;
export const DIRECTION_RANK = ROLE_HIERARCHY.CAE;
export const rankOf = (role: string) => ROLE_HIERARCHY[role] ?? 0;

/** Gerente de auditoría o superior: ve, registra facturas y cobros, aplica y anota retenciones. */
export function assertManager(user: AuthUser) {
  if (rankOf(user.role) < MANAGER_RANK) throw new ForbiddenException('Solo un gerente de auditoría o superior puede hacer esto.');
}

/** Dirección (CAE o superior): honorario, calendario, anulaciones y reversiones. */
export function assertDirection(user: AuthUser) {
  if (rankOf(user.role) < DIRECTION_RANK) throw new ForbiddenException('Solo la dirección puede hacer esto.');
}

export const isDirection = (user: AuthUser) => rankOf(user.role) >= DIRECTION_RANK;

/** Los honorarios se cobran en la modalidad externa: la auditoría interna no se factura (solo existe la planilla de pago). */
export async function assertBillingModule(db: Pick<Db, 'organization'>, organizationId: string) {
  const org = await db.organization.findUnique({ where: { id: organizationId }, select: { auditModality: true } });
  if (!org) throw new NotFoundException('Organización no encontrada');
  if (org.auditModality === OrgAuditModality.INTERNAL) {
    throw new ForbiddenException('El cobro de honorarios no aplica a organizaciones de auditoría interna.');
  }
}

// ── Candados ────────────────────────────────────────────────────────────────
export async function lockEngagement(db: Db, engagementId: string): Promise<void> {
  // ::text porque pg_advisory_xact_lock devuelve `void` y Prisma no sabe leer columnas de ese tipo.
  await db.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`collections:eng:${engagementId}`}))::text AS locked`;
}

/** Bloquea el cobro; devuelve false si no existe. Releer la fila DESPUÉS. */
export async function lockPayment(db: Db, paymentId: string): Promise<boolean> {
  const rows = await db.$queryRaw<{ id: string }[]>`SELECT id FROM client_payments WHERE id = ${paymentId} FOR UPDATE`;
  return rows.length === 1;
}

/** Bloquea las facturas en orden ascendente de id (evita interbloqueos entre operaciones que tocan varias). */
export async function lockInvoices(db: Db, invoiceIds: string[]): Promise<void> {
  const ids = [...new Set(invoiceIds)].sort();
  if (ids.length === 0) return;
  await db.$queryRaw`SELECT id FROM client_invoices WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR UPDATE`;
}

// ── Bitácora (solo se agrega) ───────────────────────────────────────────────
export type CollectionEntity =
  | 'ENGAGEMENT_FEE' | 'FEE_AMENDMENT' | 'SCHEDULE_ITEM' | 'INVOICE' | 'PAYMENT' | 'APPLICATION' | 'WITHHOLDING';

export async function logCollection(db: Db, entry: {
  organizationId: string; entityType: CollectionEntity; entityId: string; action: CollectionLogAction; actorId: string;
  before?: Prisma.InputJsonValue | null; after?: Prisma.InputJsonValue | null; note?: string | null;
}) {
  await db.collectionLog.create({
    data: {
      organizationId: entry.organizationId, entityType: entry.entityType, entityId: entry.entityId, action: entry.action,
      actorId: entry.actorId, before: entry.before ?? Prisma.DbNull, after: entry.after ?? Prisma.DbNull, note: entry.note ?? null,
    },
  });
}

// ── Fechas (YYYY-MM-DD) ─────────────────────────────────────────────────────
export const ymd = (d: Date): string => d.toISOString().slice(0, 10);
export const dateFromYmd = (s: string): Date => new Date(`${s}T00:00:00.000Z`);

/** Fecha de hoy en El Salvador (UTC−6, sin horario de verano). */
export function todayInSalvador(now: Date = new Date()): string {
  return new Date(now.getTime() - 6 * 3_600_000).toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

/** Motivo obligatorio de una anulación o reversión. */
export function assertReason(reason: unknown, label = 'El motivo', min = 10): string {
  const text = typeof reason === 'string' ? reason.trim() : '';
  if (text.length < min) throw new BadRequestException(`${label} es obligatorio (mínimo ${min} caracteres).`);
  return text;
}

/** Códigos de error de Prisma que se traducen a respuestas útiles. */
export function isUniqueViolation(e: unknown): e is Prisma.PrismaClientKnownRequestError {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
}

export function conflict(message: string): never {
  throw new ConflictException(message);
}

/** Json seguro para la bitácora: fechas a ISO y Decimal a texto. */
export function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value, (_k, v) => (v instanceof Prisma.Decimal ? v.toString() : v))) as Prisma.InputJsonValue;
}
