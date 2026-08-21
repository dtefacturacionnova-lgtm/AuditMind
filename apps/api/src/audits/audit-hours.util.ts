import { PrismaService } from '../prisma/prisma.service';

/**
 * Recalcula `Audit.actualHours` desde la suma real de `TimeEntry.hours` de ese
 * encargo. Se llama después de CUALQUIER alta/baja de TimeEntry con `auditId`
 * (hay dos rutas de escritura: `TimesheetService` y `PlansService` — ambas
 * deben invocar esto). Antes de esto, `actualHours` era un campo desnormalizado
 * que nada recalculaba y quedaba muerto en cualquier encargo real (ver
 * docs del análisis "Horas y Rentabilidad", sección 5).
 *
 * No se usa `Prisma.$transaction` porque una demora aquí no debe bloquear ni
 * revertir la escritura del TimeEntry en sí — si esto falla, el número queda
 * un tick desactualizado hasta la siguiente entrada, nunca corrompe datos.
 */
export async function recalculateAuditActualHours(
  prisma: PrismaService,
  auditId: string | null | undefined,
): Promise<void> {
  if (!auditId) return;
  const result = await prisma.timeEntry.aggregate({
    where: { auditId },
    _sum: { hours: true },
  });
  await prisma.audit.update({
    where: { id: auditId },
    data: { actualHours: result._sum.hours ?? 0 },
  }).catch(() => { /* el Audit pudo haberse borrado entre medio — no fatal */ });
}
