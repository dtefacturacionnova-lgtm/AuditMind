import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { AuthUser } from '../../auth/jwt.strategy';

export const ROLE_HIERARCHY: Record<string, number> = {
  SUPER_ADMIN: 100,
  ADMIN: 90,
  CAE: 80,
  AUDIT_MANAGER: 70,
  SENIOR_AUDITOR: 60,
  AUDITOR: 50,
  AUDITEE: 20,
  READ_ONLY: 10,
};

/**
 * «Solo lectura» (READ_ONLY, nivel 10) puede CONSULTAR lo que ve un Auditor — nunca modificar nada ni entrar a lo que exige gerente o más
 * (cobranza, cartera, ajustes, respaldos…). Antes su nivel (10) quedaba por debajo de todas las consultas de auditorías, papeles y hallazgos
 * (nivel Auditor, 50): el rol existía pero no podía leer nada. Solo aplica a GET y HEAD; la visibilidad por organización y las investigaciones
 * ocultas se siguen resolviendo en los servicios, igual que para un Auditor.
 */
export const READ_ONLY_ROLE = 'READ_ONLY';
export const SAFE_METHODS: ReadonlySet<string> = new Set(['GET', 'HEAD']);

/** Nivel con el que se evalúa a `role` para una petición con ese método HTTP. */
export function effectiveRoleLevel(role: string, method: string | undefined): number {
  const level = ROLE_HIERARCHY[role] ?? 0;
  if (role === READ_ONLY_ROLE && SAFE_METHODS.has((method ?? '').toUpperCase())) return Math.max(level, ROLE_HIERARCHY.AUDITOR);
  return level;
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) return true;

    const { user, method } = context.switchToHttp().getRequest<{ user: AuthUser; method?: string }>();
    if (!user) return false;

    const userLevel = effectiveRoleLevel(user.role, method);
    const hasAccess = requiredRoles.some(
      (role) => userLevel >= (ROLE_HIERARCHY[role] ?? 0),
    );

    if (!hasAccess) {
      throw new ForbiddenException(
        `Acceso denegado. Se requiere rol: ${requiredRoles.join(' o ')}. Tu rol: ${user.role}`,
      );
    }

    return true;
  }
}
