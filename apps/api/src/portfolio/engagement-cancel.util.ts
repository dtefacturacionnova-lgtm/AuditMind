import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ClientInvoiceStatus, EngagementStatus, Prisma, ScheduleItemStatus } from '@prisma/client';
import { lockEngagement, logCollection } from '../collections/collections.common';

/**
 * Cancela un encargo dentro de la transacción de quien llama. Lo usan dos caminos:
 *  - Cartera: cancelar un encargo todavía sin auditoría (`viaAudit: false`).
 *  - Auditorías: al cancelar la auditoría de un encargo (`viaAudit: true`), el encargo se cancela con ella. Antes quedaba
 *    «Aprobado» con una auditoría muerta y ese cliente no podía volver a tener su ejercicio.
 *
 * Un encargo con facturas vigentes no se cancela (el dinero ya está registrado): primero se anulan en Cobranza. Las cuotas aún
 * sin facturar se cancelan con él, para que no queden cobros programados de un encargo muerto. Todo bajo el candado del encargo
 * (el mismo que toman registrar factura y generar calendario) y releyendo el estado después de tomarlo.
 */
export async function cancelEngagementInTx(
  tx: Prisma.TransactionClient,
  engagementId: string,
  user: { id: string; organizationId: string },
  opts: { viaAudit: boolean },
) {
  await lockEngagement(tx, engagementId);
  const fresh = await tx.engagement.findUnique({ where: { id: engagementId }, select: { status: true, auditId: true } });
  if (!fresh) throw new NotFoundException('Encargo no encontrado');
  if (fresh.auditId && !opts.viaAudit) {
    throw new BadRequestException(
      'El encargo ya generó una auditoría real; no se puede cancelar desde Cartera. ' +
      'Use el flujo de cancelación de auditorías (PATCH /audits/:id/status → CANCELLED).',
    );
  }
  if (fresh.status === EngagementStatus.CANCELLED) {
    if (opts.viaAudit) return null; // ya estaba cancelado: nada que hacer
    throw new BadRequestException('El encargo ya está cancelado.');
  }

  const invoices = await tx.clientInvoice.count({ where: { engagementId, status: { not: ClientInvoiceStatus.VOID } } });
  if (invoices > 0) {
    throw new BadRequestException(
      opts.viaAudit
        ? 'La auditoría pertenece a un encargo con facturas registradas: anúlalas en Cobranza antes de cancelarla.'
        : 'El encargo tiene facturas registradas: anúlalas en Cobranza antes de cancelarlo.',
    );
  }

  const planned = await tx.billingScheduleItem.findMany({ where: { engagementId, status: ScheduleItemStatus.PLANNED } });
  if (planned.length) {
    await tx.billingScheduleItem.updateMany({ where: { id: { in: planned.map((p) => p.id) } }, data: { status: ScheduleItemStatus.CANCELLED } });
    for (const item of planned) {
      await logCollection(tx, {
        organizationId: user.organizationId, entityType: 'SCHEDULE_ITEM', entityId: item.id, action: 'SCHEDULE_ITEM_CANCELLED', actorId: user.id,
        before: { status: 'PLANNED', amount: item.amount.toString() }, after: { status: 'CANCELLED' },
        note: opts.viaAudit ? 'Auditoría cancelada' : 'Encargo cancelado',
      });
    }
  }
  return tx.engagement.update({ where: { id: engagementId }, data: { status: EngagementStatus.CANCELLED } });
}
