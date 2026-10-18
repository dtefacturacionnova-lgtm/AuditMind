import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export const MAX_DAILY_HOURS = 20;

/**
 * Cada registro debe traer horas POSITIVAS y razonables. Antes no había mínimo:
 * un valor negativo esquivaba el tope diario y restaba horas reales del encargo
 * (auditoría de seguridad 2026-10-18).
 */
export function assertValidHours(hours: number): void {
  if (!Number.isFinite(hours) || hours <= 0 || hours > MAX_DAILY_HOURS) {
    throw new BadRequestException(`Las horas deben ser mayores que 0 y no más de ${MAX_DAILY_HOURS} por registro.`);
  }
}

/**
 * El encargo y el ítem de plan al que se cargan horas deben ser de la
 * organización del usuario — si no, se podía inflar `actualHours` (y la
 * rentabilidad) de un encargo de OTRA organización.
 */
export async function assertTimeAnchorsInOrg(
  prisma: PrismaService,
  organizationId: string,
  anchors: { auditId?: string | null; planItemId?: string | null }[],
): Promise<void> {
  const auditIds = [...new Set(anchors.map((a) => a.auditId).filter((v): v is string => !!v))];
  const planItemIds = [...new Set(anchors.map((a) => a.planItemId).filter((v): v is string => !!v))];
  if (auditIds.length > 0) {
    const n = await prisma.audit.count({ where: { id: { in: auditIds }, organizationId } });
    if (n !== auditIds.length) throw new BadRequestException('El encargo indicado no existe en tu organización.');
  }
  if (planItemIds.length > 0) {
    const n = await prisma.auditPlanItem.count({ where: { id: { in: planItemIds }, plan: { organizationId } } });
    if (n !== planItemIds.length) throw new BadRequestException('El ítem de plan indicado no existe en tu organización.');
  }
}

function dayRange(dateKey: string): { gte: Date; lt: Date } {
  const gte = new Date(`${dateKey}T00:00:00.000Z`);
  const lt = new Date(gte);
  lt.setUTCDate(lt.getUTCDate() + 1);
  return { gte, lt };
}

/**
 * Tope de 20h por USUARIO por día — suma TODO lo que esa persona registre ese
 * día, sin importar en cuántos encargos/categorías lo reparta (una persona no
 * puede trabajar físicamente más que eso en 24h). Se valida contra lo ya
 * guardado en BD + lo que se está por agregar — nunca contra un solo registro
 * aislado.
 */
export async function assertDailyHoursCap(
  prisma: PrismaService,
  userId: string,
  hoursByDate: Map<string, number>,
): Promise<void> {
  for (const [dateKey, additional] of hoursByDate) {
    const existing = await prisma.timeEntry.aggregate({
      where: { userId, workDate: dayRange(dateKey) },
      _sum: { hours: true },
    });
    const total = (existing._sum.hours ?? 0) + additional;
    if (total > MAX_DAILY_HOURS) {
      throw new BadRequestException(
        `No se pueden registrar más de ${MAX_DAILY_HOURS}h en un mismo día — el ${dateKey} quedarían ${total.toFixed(1)}h en total.`,
      );
    }
  }
}
