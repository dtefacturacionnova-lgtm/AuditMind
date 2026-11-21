import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';
import { Observable } from 'rxjs';

export interface RequestContextValue {
  organizationId: string;
  userId: string;
  role: string;
}

const storage = new AsyncLocalStorage<RequestContextValue>();

/** Quién hace la petición en curso (organización y usuario), disponible para cualquier servicio sin pasarlo por parámetro (medición de IA, cuotas). */
export const getRequestContext = (): RequestContextValue | undefined => storage.getStore();

/** Ejecuta `fn` con un contexto explícito (pruebas y tareas internas que actúan en nombre de una organización). */
export const runWithRequestContext = <T>(value: RequestContextValue, fn: () => T): T => storage.run(value, fn);

/**
 * Interceptor global: guarda el usuario autenticado en el contexto mientras se atiende la petición. Va después de los guardianes
 * (por eso `req.user` ya existe). Sin usuario (rutas públicas) no hace nada.
 */
@Injectable()
export class RequestContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const user = context.switchToHttp().getRequest<{ user?: { id: string; organizationId: string; role: string } }>().user;
    if (!user?.organizationId) return next.handle();
    const value: RequestContextValue = { organizationId: user.organizationId, userId: user.id, role: user.role };
    return new Observable((subscriber) => {
      storage.run(value, () => {
        next.handle().subscribe(subscriber);
      });
    });
  }
}
