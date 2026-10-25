import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
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

/** `select` de una auditoría para comprobar organización y modo investigación en una sola consulta. */
export const AUDIT_ACCESS_SELECT = { organizationId: true, ...INVESTIGATION_SELECT } as const;

type UserScope = Pick<AuthUser, 'id' | 'role' | 'organizationId'>;

/**
 * Por id de papel de trabajo: 404 si no es de la organización del usuario, 403 si su auditoría es una investigación ajena
 * a su equipo. Devuelve el id de la auditoría para que quien llama no tenga que volver a cargarla.
 */
export async function assertPaperVisible(
  prisma: Pick<Prisma.TransactionClient, 'workingPaper'>,
  paperId: string,
  user: UserScope,
): Promise<{ id: string; auditId: string }> {
  const paper = await prisma.workingPaper.findUnique({
    where: { id: paperId }, select: { id: true, auditId: true, audit: { select: AUDIT_ACCESS_SELECT } },
  });
  if (!paper || paper.audit.organizationId !== user.organizationId) throw new NotFoundException('Papel de trabajo no encontrado');
  assertInvestigationAccess(paper.audit, user);
  return { id: paper.id, auditId: paper.auditId };
}

/** Texto que ocupa el lugar del título de un encargo que el usuario no puede ver (investigación ajena a su equipo). */
export const RESTRICTED_AUDIT_TITLE = 'Encargo restringido';

/** ¿Puede este usuario ver la auditoría (traída con `isInvestigationMode` y `team`)? Versión sin excepción de `assertInvestigationAccess`. */
export function canSeeAudit(audit: { isInvestigationMode: boolean; team: Array<{ userId: string }> }, user: Pick<AuthUser, 'id' | 'role'>): boolean {
  return !audit.isInvestigationMode || seesAllInvestigations(user) || audit.team.some((m) => m.userId === user.id);
}

/**
 * Para los `include`/`select` a-uno de una auditoría que Prisma no deja filtrar (un ítem de plan, un encargo, una hora):
 * si la investigación es ajena, se devuelve solo el id y un título genérico, nunca estado, horas ni equipo.
 */
export function maskAuditIfHidden<T extends { id: string; isInvestigationMode: boolean; team: Array<{ userId: string }> }>(
  audit: T | null | undefined, user: Pick<AuthUser, 'id' | 'role'>,
): T | { id: string; title: string; restricted: true } | null {
  if (!audit) return null;
  if (canSeeAudit(audit, user)) return audit;
  return { id: audit.id, title: RESTRICTED_AUDIT_TITLE, restricted: true };
}

/**
 * En una investigación solo puede ser RESPONSABLE de un hallazgo o de una acción alguien que ya la puede ver (equipo, CAE,
 * ADMIN o SUPER_ADMIN): si no, esa persona vería después el título del hallazgo en «Mis pendientes» (H36).
 */
export async function assertAssigneeCanSee(
  prisma: Pick<Prisma.TransactionClient, 'user'>,
  assigneeId: string | null | undefined,
  audit: { isInvestigationMode: boolean; team: Array<{ userId: string }> },
): Promise<void> {
  if (!assigneeId || !audit.isInvestigationMode) return;
  if (audit.team.some((m) => m.userId === assigneeId)) return;
  const u = await prisma.user.findUnique({ where: { id: assigneeId }, select: { role: true } });
  if (u && INVESTIGATION_PRIVILEGED_ROLES.includes(u.role)) return;
  throw new BadRequestException('En una investigación solo puede ser responsable alguien del equipo de la auditoría.');
}

/**
 * De estos ids de auditoría, los que el usuario NO puede ver (investigaciones ajenas a su equipo). Para ocultar títulos,
 * descripciones y horas en las listas que mezclan encargos (horas, informes, panel): una sola consulta, sin cargar el equipo.
 */
export async function hiddenAuditIds(
  prisma: Pick<Prisma.TransactionClient, 'audit'>,
  auditIds: Array<string | null | undefined>,
  user: UserScope,
): Promise<Set<string>> {
  const ids = [...new Set(auditIds.filter((v): v is string => !!v))];
  if (ids.length === 0 || seesAllInvestigations(user)) return new Set();
  const rows = await prisma.audit.findMany({
    where: { id: { in: ids }, organizationId: user.organizationId, isInvestigationMode: true, team: { none: { userId: user.id } } },
    select: { id: true },
  });
  return new Set(rows.map((r) => r.id));
}
