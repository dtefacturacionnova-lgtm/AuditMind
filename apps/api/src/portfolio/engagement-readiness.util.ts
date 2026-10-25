import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AcceptanceRating, ClientStatus, EngagementLetterStatus, Prisma } from '@prisma/client';
import { EXTERNAL_FINANCIAL_TEMPLATE_CODE, EXTERNAL_FINANCIAL_TEMPLATE_NAME } from '../audit-templates/system-template-codes';

/**
 * Reglas de negocio de «Aprobar encargo» (revisión de Cartera, 2026-10-25). Antes bastaba con que el cliente estuviera ACTIVO
 * al CREAR el encargo; al aprobar no se volvía a mirar nada, así que se creaba la auditoría real sin carta de compromiso firmada
 * (NIA 210.9), sin evaluación de continuidad del ejercicio (NIA 220 / ISQM 1) y aunque el cliente ya estuviera Declinado.
 */

/** Roles que pueden ser socio/gerente a cargo de un encargo. */
export const PARTNER_ROLES = ['AUDIT_MANAGER', 'CAE', 'ADMIN', 'SUPER_ADMIN'] as const;

const ACCEPTABLE = new Set<AcceptanceRating>([AcceptanceRating.GREEN, AcceptanceRating.YELLOW]);

type Db = Pick<Prisma.TransactionClient, 'client' | 'engagementLetter' | 'acceptanceCheck'>;

export interface ReadyToApprove {
  /** Carta de compromiso firmada que respalda el encargo (la vinculada, o la última firmada del cliente). */
  letterId: string;
}

/**
 * Verifica, antes de crear la auditoría real, que el cliente siga activo, que haya una carta de compromiso FIRMADA y que la
 * evaluación de aceptación/continuidad más reciente esté decidida en Verde o Amarillo y sea del ejercicio (o posterior).
 * Devuelve la carta que respalda el encargo para vincularla si el encargo no la traía.
 */
export async function assertReadyToApprove(
  db: Db,
  engagement: { clientId: string; fiscalYear: number; engagementLetterId: string | null },
): Promise<ReadyToApprove> {
  const client = await db.client.findUnique({ where: { id: engagement.clientId }, select: { status: true, legalName: true } });
  if (!client) throw new NotFoundException('Cliente no encontrado');
  if (client.status === ClientStatus.DECLINED) {
    throw new BadRequestException(`El cliente «${client.legalName}» fue declinado en la evaluación de aceptación: no se puede aprobar el encargo.`);
  }
  if (client.status !== ClientStatus.ACTIVE) {
    throw new BadRequestException(
      `El cliente «${client.legalName}» no está activo (estado ${client.status}): completa la aceptación, la propuesta y la firma de la carta antes de aprobar el encargo.`,
    );
  }

  const letter = engagement.engagementLetterId
    ? await db.engagementLetter.findFirst({
        where: { id: engagement.engagementLetterId, clientId: engagement.clientId },
        select: { id: true, status: true },
      })
    : await db.engagementLetter.findFirst({
        where: { clientId: engagement.clientId, status: EngagementLetterStatus.SIGNED },
        orderBy: { signedAt: 'desc' },
        select: { id: true, status: true },
      });
  if (!letter || letter.status !== EngagementLetterStatus.SIGNED) {
    throw new BadRequestException(
      'Falta la carta de compromiso firmada del cliente (NIA 210): no se puede aprobar el encargo ni empezar la auditoría sin acordar los términos por escrito.',
    );
  }

  const check = await db.acceptanceCheck.findFirst({
    where: { clientId: engagement.clientId, decidedAt: { not: null } },
    orderBy: { year: 'desc' },
    select: { year: true, overallResult: true },
  });
  if (!check) {
    throw new BadRequestException('Falta la evaluación de aceptación del cliente (NIA 220 / ISQM 1): decide el Radar antes de aprobar el encargo.');
  }
  if (!ACCEPTABLE.has(check.overallResult)) {
    throw new BadRequestException('La última evaluación de aceptación del cliente no habilita el encargo (resultado Rojo).');
  }
  if (check.year < engagement.fiscalYear) {
    throw new BadRequestException(
      `Falta la evaluación de continuidad del cliente para el ejercicio ${engagement.fiscalYear}: la última decidida es la de ${check.year}. ` +
      'Inicia y decide el Radar de Aceptación de este año antes de aprobar.',
    );
  }
  return { letterId: letter.id };
}

/** Inicio del período auditado: el día siguiente al cierre del ejercicio anterior (no siempre el 1 de enero). */
export function auditPeriodStartFor(fiscalYearEnd: Date): Date {
  const y = fiscalYearEnd.getUTCFullYear() - 1;
  const m = fiscalYearEnd.getUTCMonth();
  let prevEnd = new Date(Date.UTC(y, m, fiscalYearEnd.getUTCDate()));
  if (prevEnd.getUTCMonth() !== m) prevEnd = new Date(Date.UTC(y, m + 1, 0)); // 29-feb en un año sin bisiesto
  return new Date(prevEnd.getTime() + 86_400_000);
}

/** La fecha de cierre del ejercicio debe caer en el ejercicio que se dice auditar (el ejercicio se nombra por el año en que cierra). */
export function assertFiscalYearEnd(fiscalYear: number, fiscalYearEndDate: string | Date): void {
  const end = new Date(fiscalYearEndDate);
  if (Number.isNaN(end.getTime())) throw new BadRequestException('La fecha de cierre del ejercicio no es válida.');
  if (end.getUTCFullYear() !== fiscalYear) {
    throw new BadRequestException(
      `La fecha de cierre (${end.toISOString().slice(0, 10)}) no corresponde al ejercicio ${fiscalYear}: el ejercicio se nombra por el año en que cierra.`,
    );
  }
}

/**
 * Plantilla de «Auditoría Financiera Externa v1.0» de la organización: por su código estable y, si la organización se sembró antes
 * de que existiera el código, por su nombre de plantilla de sistema (y se le escribe el código para la próxima vez).
 */
export async function findExternalFinancialTemplateId(
  db: Pick<Prisma.TransactionClient, 'auditTemplate'>,
  organizationId: string,
): Promise<string | null> {
  const byCode = await db.auditTemplate.findFirst({
    where: { organizationId, code: EXTERNAL_FINANCIAL_TEMPLATE_CODE }, select: { id: true },
  });
  if (byCode) return byCode.id;
  const byName = await db.auditTemplate.findFirst({
    where: { organizationId, isSystem: true, name: EXTERNAL_FINANCIAL_TEMPLATE_NAME }, select: { id: true },
  });
  if (!byName) return null;
  await db.auditTemplate.update({ where: { id: byName.id }, data: { code: EXTERNAL_FINANCIAL_TEMPLATE_CODE } }).catch(() => undefined);
  return byName.id;
}
