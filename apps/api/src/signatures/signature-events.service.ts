import { Injectable } from '@nestjs/common';
import { Prisma, SignatureEventType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { buildNextEvent, ChainEvent } from './signature-event-chain.util';

export interface NewEvent {
  type: SignatureEventType;
  ip?: string | null;
  userAgent?: string | null;
  actorId?: string | null;
  detail?: Record<string, unknown> | null;
}

/** Tiempo máximo de las transacciones interactivas (lección #32: el default de 5 s se queda corto). */
export const TX_OPTIONS = { timeout: 30_000, maxWait: 10_000 } as const;

/**
 * Escritor de la bitácora encadenada por hash (docs/firma-externa-por-enlace.md §8).
 * `append` SIEMPRE se ejecuta dentro de la transacción que origina el cambio: bloquea la fila de la
 * solicitud (FOR UPDATE), así dos escrituras simultáneas se serializan y `seq` nunca se repite.
 */
@Injectable()
export class SignatureEventsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Bloquea la solicitud hasta el final de la transacción. */
  async lock(tx: Prisma.TransactionClient, requestId: string): Promise<void> {
    await tx.$queryRaw`SELECT "id" FROM "signature_requests" WHERE "id" = ${requestId} FOR UPDATE`;
  }

  async append(tx: Prisma.TransactionClient, requestId: string, ev: NewEvent): Promise<ChainEvent> {
    await this.lock(tx, requestId);
    const last = await tx.signatureEvent.findFirst({
      where: { requestId },
      orderBy: { seq: 'desc' },
      select: { seq: true, hash: true },
    });
    const next = buildNextEvent(requestId, last, {
      type: ev.type,
      at: new Date(),
      ip: ev.ip ?? null,
      userAgent: ev.userAgent ?? null,
      actorId: ev.actorId ?? null,
      detail: ev.detail ?? null,
    });
    await tx.signatureEvent.create({
      data: {
        requestId,
        seq: next.seq,
        type: ev.type,
        at: next.at,
        ip: next.ip ?? null,
        userAgent: next.userAgent ?? null,
        actorId: next.actorId ?? null,
        detail: (ev.detail ?? Prisma.DbNull) as Prisma.InputJsonValue,
        prevHash: next.prevHash,
        hash: next.hash,
      },
    });
    return next;
  }

  /** Para eventos que ocurren fuera de otra transacción (p. ej. un fallo de integridad). */
  async appendStandalone(requestId: string, ev: NewEvent): Promise<ChainEvent> {
    return this.prisma.$transaction((tx) => this.append(tx, requestId, ev), TX_OPTIONS);
  }

  /** Todos los eventos en orden, con la forma que usa `verifyChain`. */
  async listChain(requestId: string): Promise<ChainEvent[]> {
    const rows = await this.prisma.signatureEvent.findMany({ where: { requestId }, orderBy: { seq: 'asc' } });
    return rows.map((r) => ({
      seq: r.seq, type: r.type, at: r.at, ip: r.ip, userAgent: r.userAgent, actorId: r.actorId,
      detail: r.detail, prevHash: r.prevHash, hash: r.hash,
    }));
  }
}
