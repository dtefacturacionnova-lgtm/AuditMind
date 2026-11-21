import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';
import { AuthUser } from '../auth/jwt.strategy';
import { BillingSettingsService } from './billing-settings.service';
import { EntitlementsService } from './entitlements.service';
import { hasEntitlement } from './entitlements';
import { isAllowedWhileReadOnly, resolveRouteEntitlement } from './route-entitlements';

const pathOf = (meta: unknown): string => {
  const first = Array.isArray(meta) ? meta[0] : meta;
  return typeof first === 'string' ? first.replace(/^\/+|\/+$/g, '') : '';
};

/**
 * Guardián global de plan (va DESPUÉS de JwtAuthGuard y RolesGuard):
 *  1. Vigencia: con la licencia vencida (solo lectura) solo pasan consultas, iniciar sesión, pagar y exportar → 402 LICENCIA_VENCIDA.
 *  2. Módulo/función: el controlador debe estar incluido en el plan → 403 MODULO_NO_INCLUIDO.
 * No hace nada sin usuario (rutas públicas), para el SUPER_ADMIN (plataforma), con el interruptor en OFF, ni para organizaciones exentas
 * (Piloto / Interno) o sin suscripción. En OBSERVE solo registra lo que habría bloqueado.
 */
@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(
    private readonly settings: BillingSettingsService,
    private readonly entitlements: EntitlementsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const req = context.switchToHttp().getRequest<{ user?: AuthUser; method: string }>();
    const user = req.user;
    if (!user || user.role === 'SUPER_ADMIN') return true;

    const { enforcementMode } = await this.settings.get();
    if (enforcementMode === 'OFF') return true;
    const ent = await this.entitlements.get(user.organizationId);
    if (!ent || ent.exempt) return true;

    const controllerPath = pathOf(Reflect.getMetadata(PATH_METADATA, context.getClass()));
    const handlerPath = pathOf(Reflect.getMetadata(PATH_METADATA, context.getHandler()));
    const fullPath = [controllerPath, handlerPath].filter(Boolean).join('/');

    if (ent.readOnly && !isAllowedWhileReadOnly(req.method, fullPath)) {
      this.entitlements.violate(
        enforcementMode, user.organizationId, 402, 'LICENCIA_VENCIDA',
        'Tu licencia venció: la cuenta está en solo lectura. Puedes consultar y exportar; renueva para volver a crear y editar. No se borró nada.',
        { status: ent.status },
      );
    }

    const key = resolveRouteEntitlement(controllerPath);
    if (key && key !== 'CORE' && !hasEntitlement(ent, key)) {
      this.entitlements.violate(
        enforcementMode, user.organizationId, 403, 'MODULO_NO_INCLUIDO',
        `Este módulo no está incluido en tu plan ${ent.planName}.`, { module: key },
      );
    }
    return true;
  }
}
