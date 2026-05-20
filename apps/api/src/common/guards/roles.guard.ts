import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { AuthUser } from '../../auth/jwt.strategy';

const ROLE_HIERARCHY: Record<string, number> = {
  SUPER_ADMIN: 100,
  ADMIN: 90,
  CAE: 80,
  AUDIT_MANAGER: 70,
  SENIOR_AUDITOR: 60,
  AUDITOR: 50,
  AUDITEE: 20,
  READ_ONLY: 10,
};

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) return true;

    const { user } = context.switchToHttp().getRequest<{ user: AuthUser }>();
    if (!user) return false;

    const userLevel = ROLE_HIERARCHY[user.role] ?? 0;
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
