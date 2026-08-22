import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export const MAX_DAILY_HOURS = 20;

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
