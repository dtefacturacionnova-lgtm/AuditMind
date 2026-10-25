import { Body, Controller, Get, Header, Headers, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import { SkipStorageSigning } from '../common/storage/skip-storage-signing.decorator';
import { OtpVerifyDto } from '../signatures/dto/signature.dto';
import { getClientInfo } from '../signatures/request-info.util';
import { PUBLIC_LIMITS, PublicThrottlerGuard } from '../signatures/public-throttle';
import { AddPortalMessageDto, SubmitPortalDto } from './dto/create-pbc-request.dto';
import { PbcPortalService } from './pbc-portal.service';

type Req = { ip?: string; headers?: Record<string, unknown> };

/**
 * Portal PBC PÚBLICO del auditado (sin login). Mismo trato que la firma por enlace
 * (docs/firma-externa-por-enlace.md §5 y §7, docs/portal-pbc-codigo-por-correo.md):
 *  - el token del enlace va SOLO en la cabecera X-Portal-Token y la sesión en X-Portal-Session: nunca en la ruta ni en la
 *    query, así no llegan a los logs de nginx ni a Referer. En la base solo existe su huella (sha256);
 *  - tener el enlace NO basta: la solicitud, los mensajes y el envío exigen además la sesión que se abre con el código de
 *    6 dígitos que llega al correo registrado. `GET /pbc-portal` solo devuelve la portada (despacho y correo enmascarado);
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
  constructor(private readonly service: PbcPortalService) {}

  @Public() @Get() @Throttle(PUBLIC_LIMITS.read) @Header('Cache-Control', 'no-store')
  getCover(@Headers('x-portal-token') token: string) {
    return this.service.getCover(token);
  }

  @Public() @Post('otp/send') @HttpCode(200) @Throttle(PUBLIC_LIMITS.otpSend) @Header('Cache-Control', 'no-store')
  sendOtp(@Headers('x-portal-token') token: string, @Req() req: Req) {
    return this.service.sendOtp(token, getClientInfo(req));
  }

  @Public() @Post('otp/verify') @HttpCode(200) @Throttle(PUBLIC_LIMITS.otpVerify) @Header('Cache-Control', 'no-store')
  verifyOtp(@Headers('x-portal-token') token: string, @Body() dto: OtpVerifyDto, @Req() req: Req) {
    return this.service.verifyOtp(token, dto.code, getClientInfo(req));
  }

  @Public() @Get('request') @Throttle(PUBLIC_LIMITS.read) @Header('Cache-Control', 'no-store')
  getRequest(@Headers('x-portal-token') token: string, @Headers('x-portal-session') session: string) {
    return this.service.getRequest(token, session);
  }

  @Public() @Post('message') @Throttle(PUBLIC_LIMITS.write) @Header('Cache-Control', 'no-store')
  addMessage(@Headers('x-portal-token') token: string, @Headers('x-portal-session') session: string, @Body() dto: AddPortalMessageDto) {
    return this.service.addMessage(token, session, dto.content, dto.attachmentUrls);
  }

  @Public() @Post('submit') @Throttle(PUBLIC_LIMITS.write) @Header('Cache-Control', 'no-store')
  submit(@Headers('x-portal-token') token: string, @Headers('x-portal-session') session: string, @Body() dto: SubmitPortalDto) {
    return this.service.submit(token, session, dto.fileUrls, dto.auditeeNotes);
  }
}
