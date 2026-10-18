import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ROLE_HIERARCHY } from '../guards/roles.guard';

/**
 * Aislamiento multi-organización (auditoría de seguridad 2026-10-18).
 *
 * Prisma conecta como un rol de base de datos que SALTA el RLS: la única
 * barrera entre organizaciones es el código de los servicios. Todo id que
 * llega del cliente (ruta, cuerpo o query) y se usa para leer, escribir o
 * enlazar otro registro debe validarse contra la organización del usuario
 * ANTES de usarse. Estos helpers cubren el caso de las claves foráneas que
 * llegan en el CUERPO (para ids de la ruta, cada servicio usa su propio
 * `get...OrThrow` con `findFirst({ id, organizationId })` y responde 404).
 */

type FindFirstDelegate = { findFirst(args: any): Promise<unknown> };
type CountDelegate = { count(args: any): Promise<unknown> };

/**
 * Lanza 400 si `id` no existe dentro de `scope` (ej. `{ organizationId }` o
 * `{ plan: { organizationId } }`). No hace nada si `id` viene vacío/null.
 */
export async function assertInOrg(
  delegate: FindFirstDelegate,
  id: string | null | undefined,
  scope: Record<string, unknown>,
  label: string,
): Promise<void> {
  if (!id) return;
  const found = await delegate.findFirst({ where: { id, ...scope }, select: { id: true } });
  if (!found) throw new BadRequestException(`${label} no existe en tu organización.`);
}

/** Igual que assertInOrg pero para una lista de ids (una sola consulta). */
export async function assertAllInOrg(
  delegate: CountDelegate,
  ids: (string | null | undefined)[],
  scope: Record<string, unknown>,
  label: string,
): Promise<void> {
  const unique = [...new Set(ids.filter((v): v is string => !!v))];
  if (unique.length === 0) return;
  const found = Number(await delegate.count({ where: { id: { in: unique }, ...scope } }));
  if (found !== unique.length) throw new BadRequestException(`${label}: uno o más no existen en tu organización.`);
}

export const roleLevel = (role: string | null | undefined): number => ROLE_HIERARCHY[role ?? ''] ?? 0;

/**
 * Nadie puede otorgar un rol más alto que el propio, y SUPER_ADMIN (rol de
 * PLATAFORMA, ve todas las organizaciones) solo lo otorga otro SUPER_ADMIN.
 * Antes, un CAE o ADMIN de cualquier organización podía invitar o ascender a
 * un SUPER_ADMIN y tomar control de toda la plataforma.
 */
export function assertCanGrantRole(requester: { role: string }, role: string): void {
  if (role === 'SUPER_ADMIN' && requester.role !== 'SUPER_ADMIN') {
    throw new ForbiddenException('Solo un Super Admin puede otorgar el rol Super Admin.');
  }
  if (roleLevel(role) > roleLevel(requester.role)) {
    throw new ForbiddenException('No puedes otorgar un rol superior al tuyo.');
  }
}

/**
 * Para cambiar el rol o desactivar a alguien: el objetivo debe tener un rol
 * estrictamente menor al de quien actúa (salvo SUPER_ADMIN) y nadie puede
 * actuar sobre sí mismo (evita auto-ascenso y quedarse fuera por error).
 */
export function assertCanManageUser(requester: { id: string; role: string }, target: { id: string; role: string }): void {
  if (target.id === requester.id) {
    throw new ForbiddenException('No puedes cambiar tu propio rol ni desactivarte a ti mismo.');
  }
  if (requester.role !== 'SUPER_ADMIN' && roleLevel(target.role) >= roleLevel(requester.role)) {
    throw new ForbiddenException('No puedes gestionar a un usuario con un rol igual o superior al tuyo.');
  }
}
