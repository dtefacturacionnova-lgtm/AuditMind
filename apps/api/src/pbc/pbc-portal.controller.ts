import { Body, Controller, Get, Header, Headers, Post, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import { SkipStorageSigning } from '../common/storage/skip-storage-signing.decorator';
import { PUBLIC_LIMITS, PublicThrottlerGuard } from '../signatures/public-throttle';
import { AddPortalMessageDto, SubmitPortalDto } from './dto/create-pbc-request.dto';
import { PbcService } from './pbc.service';

/**
 * Portal PBC PÚBLICO del auditado (sin login). Mismo trato que la firma por enlace
 * (docs/firma-externa-por-enlace.md §5 y §7):
 *  - el token del enlace va SOLO en la cabecera X-Portal-Token: nunca en la ruta ni en la query, así no llega a los
 *    logs de nginx ni a Referer. En la base solo existe su huella (sha256);
 *  - cada ruta lleva su límite de intentos por IP y responde sin caché;
 *  - fuera de la documentación Swagger.
 * Las rutas viejas `pbc/portal/:token…` (token en la ruta) se eliminaron a propósito.
 * Fuera del interceptor de Storage: lo que escribe el auditado nunca se convierte en un enlace firmado del bucket.
 */
@ApiExcludeController()
@SkipStorageSigning()
@Controller('pbc-portal')
@UseGuards(PublicThrottlerGuard)
export class PbcPortalController {
  constructor(private readonly service: PbcService) {}

  @Public() @Get() @Throttle(PUBLIC_LIMITS.read) @Header('Cache-Control', 'no-store')
  getRequest(@Headers('x-portal-token') token: string) {
    return this.service.findByToken(token);
  }

  @Public() @Post('message') @Throttle(PUBLIC_LIMITS.write) @Header('Cache-Control', 'no-store')
  addMessage(@Headers('x-portal-token') token: string, @Body() dto: AddPortalMessageDto) {
    return this.service.addMessageByToken(token, dto.content, dto.attachmentUrls);
  }

  @Public() @Post('submit') @Throttle(PUBLIC_LIMITS.write) @Header('Cache-Control', 'no-store')
  submit(@Headers('x-portal-token') token: string, @Body() dto: SubmitPortalDto) {
    return this.service.submitByToken(token, dto.fileUrls, dto.auditeeNotes);
  }
}
