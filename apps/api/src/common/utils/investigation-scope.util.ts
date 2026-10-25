import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '../../auth/jwt.strategy';

/**
 * Modo investigación: una auditoría así solo la ve su equipo, más CAE, ADMIN y SUPER_ADMIN. Es el mismo criterio de
 * `AuditInvestigationAccessService` y de `WorkingPapersService.assertAuditAccess`, en forma reutilizable para:
 *  - filtrar LISTADOS (`visibleAuditWhere`), donde no hay un id de auditoría que validar uno por uno;
 *  - validar un registro que ya trae su auditoría con `isInvestigationMode` y `team` (`assertInvestigationAccess`).
 * Revisión de seguridad F5b (2026-10-19): confirmaciones, papeles y PBC solo filtraban por organización.
 */
export const INVESTIGATION_PRIVILEGED_ROLES: readonly string[] = ['CAE', 'ADMIN', 'SUPER_ADMIN'];

export function seesAllInvestigations(user: Pick<AuthUser, 'role'>): boolean {
  return INVESTIGATION_PRIVILEGED_ROLES.includes(user.role);
}

/** Auditorías de la organización que este usuario puede ver (excluye las en investigación ajenas a su equipo). */
export function visibleAuditWhere(user: Pick<AuthUser, 'id' | 'role' | 'organizationId'>): Prisma.AuditWhereInput {
  if (seesAllInvestigations(user)) return { organizationId: user.organizationId };
  return {
    organizationId: user.organizationId,
    OR: [{ isInvestigationMode: false }, { team: { some: { userId: user.id } } }],
  };
}

/** Lanza 403 si la auditoría está en modo investigación y el usuario no es del equipo ni tiene rol privilegiado. */
export function assertInvestigationAccess(
  audit: { isInvestigationMode: boolean; team: Array<{ userId: string }> },
  user: Pick<AuthUser, 'id' | 'role'>,
): void {
  if (!audit.isInvestigationMode || seesAllInvestigations(user)) return;
  if (!audit.team.some((m) => m.userId === user.id)) throw new ForbiddenException('Acceso restringido — modo investigación');
}

/** Para incluir en las consultas que luego pasan por `assertInvestigationAccess`. */
export const INVESTIGATION_SELECT = { isInvestigationMode: true, team: { select: { userId: true } } } as const;

/**
 * Por id de auditoría: 404 si no es de la organización del usuario, 403 si es una investigación ajena a su equipo.
 * Función suelta (recibe el cliente de Prisma) para los servicios que no pueden inyectar
 * `AuditInvestigationAccessService` sin crear un ciclo de módulos.
 */
export async function assertAuditVisible(
  prisma: Pick<Prisma.TransactionClient, 'audit'>,
  auditId: string,
  user: Pick<AuthUser, 'id' | 'role' | 'organizationId'>,
): Promise<void> {
  const audit = await prisma.audit.findFirst({
    where: { id: auditId, organizationId: user.organizationId },
    select: INVESTIGATION_SELECT,
  });
  if (!audit) throw new NotFoundException('Auditoría no encontrada');
  assertInvestigationAccess(audit, user);
}
