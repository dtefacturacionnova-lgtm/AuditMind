import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { StorageUrlService } from './storage-url.service';
import { SKIP_STORAGE_SIGNING_KEY } from './skip-storage-signing.decorator';

/**
 * Global: firma las URLs de archivos adjuntos en TODA respuesta JSON y
 * restaura la forma canónica en el cuerpo de las peticiones. Ver
 * StorageUrlService para el porqué (bucket `audit-files` privado).
 * Las rutas marcadas con @SkipStorageSigning() (públicas, sin sesión) quedan fuera.
 */
@Injectable()
export class StorageUrlInterceptor implements NestInterceptor {
  constructor(private readonly storage: StorageUrlService, private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_STORAGE_SIGNING_KEY, [context.getHandler(), context.getClass()]);
    if (skip) return next.handle();
    const req = context.switchToHttp().getRequest<{ body?: unknown; user?: { id?: string; role?: string; organizationId?: string } }>();
    if (req?.body && typeof req.body === 'object') this.storage.normalizeInbound(req.body);
    const scope = { organizationId: req?.user?.organizationId ?? null, userId: req?.user?.id ?? null, role: req?.user?.role ?? null };
    return next.handle().pipe(switchMap((data) => this.storage.signResponse(data, scope)));
  }
}
