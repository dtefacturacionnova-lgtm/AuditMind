import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { StorageUrlService } from './storage-url.service';

/**
 * Global: firma las URLs de archivos adjuntos en TODA respuesta JSON y
 * restaura la forma canónica en el cuerpo de las peticiones. Ver
 * StorageUrlService para el porqué (bucket `audit-files` privado).
 */
@Injectable()
export class StorageUrlInterceptor implements NestInterceptor {
  constructor(private readonly storage: StorageUrlService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const req = context.switchToHttp().getRequest<{ body?: unknown }>();
    if (req?.body && typeof req.body === 'object') this.storage.normalizeInbound(req.body);
    return next.handle().pipe(switchMap((data) => this.storage.signResponse(data)));
  }
}
