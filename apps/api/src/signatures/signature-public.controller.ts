import {
  Body, Controller, Delete, Get, Headers, Header, HttpCode, Param, Post, Req, UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiExcludeController } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import { DeclineDto, OtpVerifyDto, SignDto } from './dto/signature.dto';
import { getClientInfo } from './request-info.util';
import { PUBLIC_LIMITS, PublicThrottlerGuard } from './public-throttle';
import { SignaturePublicService } from './signature-public.service';
import { MAX_ATTACHMENT_BYTES } from './signature-attachments.service';

type Req = { ip?: string; headers?: Record<string, unknown> };

/**
 * Endpoints PÚBLICOS de la firma por enlace (docs/firma-externa-por-enlace.md §9.1). Sin login.
 *  - El token del enlace va en la cabecera X-Signature-Token y la sesión en X-Signature-Session: NUNCA en la
 *    ruta ni en la query (no deben llegar a logs de nginx ni a Referer).
 *  - Cada ruta lleva su límite de intentos por IP (PUBLIC_LIMITS) y responde sin caché.
 *  - Fuera de la documentación Swagger.
 */
@ApiExcludeController()
@Controller('public/signatures')
@UseGuards(PublicThrottlerGuard)
export class SignaturePublicController {
  constructor(private readonly svc: SignaturePublicService) {}

  @Public() @Get('request') @Throttle(PUBLIC_LIMITS.read) @Header('Cache-Control', 'no-store')
  getRequest(@Headers('x-signature-token') token: string) {
    return this.svc.getRequest(token);
  }

  @Public() @Post('otp/send') @HttpCode(200) @Throttle(PUBLIC_LIMITS.otpSend) @Header('Cache-Control', 'no-store')
  sendOtp(@Headers('x-signature-token') token: string, @Req() req: Req) {
    return this.svc.sendOtp(token, getClientInfo(req));
  }

  @Public() @Post('otp/verify') @HttpCode(200) @Throttle(PUBLIC_LIMITS.otpVerify) @Header('Cache-Control', 'no-store')
  verifyOtp(@Headers('x-signature-token') token: string, @Body() dto: OtpVerifyDto, @Req() req: Req) {
    return this.svc.verifyOtp(token, dto.code, getClientInfo(req));
  }

  @Public() @Get('document') @Throttle(PUBLIC_LIMITS.read) @Header('Cache-Control', 'no-store')
  getDocument(@Headers('x-signature-token') token: string, @Headers('x-signature-session') session: string) {
    return this.svc.getDocument(token, session);
  }

  @Public() @Post('attachments') @HttpCode(201) @Throttle(PUBLIC_LIMITS.upload) @Header('Cache-Control', 'no-store')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_ATTACHMENT_BYTES, files: 1 } }))
  uploadAttachment(
    @Headers('x-signature-token') token: string,
    @Headers('x-signature-session') session: string,
    @UploadedFile() file: { originalname: string; buffer: Buffer } | undefined,
    @Req() req: Req,
  ) {
    return this.svc.uploadAttachment(token, session, file, getClientInfo(req));
  }

  @Public() @Delete('attachments/:id') @Throttle(PUBLIC_LIMITS.write) @Header('Cache-Control', 'no-store')
  removeAttachment(@Headers('x-signature-token') token: string, @Headers('x-signature-session') session: string, @Param('id') id: string) {
    return this.svc.removeAttachment(token, session, id);
  }

  @Public() @Post('sign') @HttpCode(200) @Throttle(PUBLIC_LIMITS.write) @Header('Cache-Control', 'no-store')
  sign(@Headers('x-signature-token') token: string, @Headers('x-signature-session') session: string, @Body() dto: SignDto, @Req() req: Req) {
    return this.svc.sign(token, session, dto, getClientInfo(req));
  }

  @Public() @Post('decline') @HttpCode(200) @Throttle(PUBLIC_LIMITS.write) @Header('Cache-Control', 'no-store')
  decline(@Headers('x-signature-token') token: string, @Headers('x-signature-session') session: string, @Body() dto: DeclineDto, @Req() req: Req) {
    return this.svc.decline(token, session, dto, getClientInfo(req));
  }

  @Public() @Get('signed') @Throttle(PUBLIC_LIMITS.read) @Header('Cache-Control', 'no-store')
  getSigned(@Headers('x-signature-token') token: string, @Headers('x-signature-session') session: string) {
    return this.svc.getSigned(token, session);
  }

  /** Verificación pública de un documento por su código (el código va en la ruta: es público por diseño). */
  @Public() @Get('verify/:code') @Throttle(PUBLIC_LIMITS.verify) @Header('Cache-Control', 'no-store')
  verify(@Param('code') code: string) {
    return this.svc.verify(code);
  }
}
