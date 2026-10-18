import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsEnum, IsString, MaxLength, MinLength } from 'class-validator';
import { SignatureDocumentType, UserRole } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthUser } from '../auth/jwt.strategy';
import { CreateSignatureRequestDto, ResendSignatureRequestDto, RevokeSignatureRequestDto } from './dto/signature.dto';
import { getClientInfo } from './request-info.util';
import { SignatureRequestsService } from './signature-requests.service';

class ListSignatureRequestsQuery {
  @IsEnum(SignatureDocumentType) documentType!: SignatureDocumentType;
  @IsString() @MinLength(1) @MaxLength(64) targetId!: string;
}

type Req = { ip?: string; headers?: Record<string, unknown> };

/** Endpoints INTERNOS (con sesión) de la firma por enlace — docs/firma-externa-por-enlace.md §9.2. */
@ApiTags('Firma por enlace')
@ApiBearerAuth()
@Controller('signature-requests')
@Roles(UserRole.AUDITOR)
export class SignatureRequestsController {
  constructor(private readonly svc: SignatureRequestsService) {}

  @Post()
  @ApiOperation({ summary: 'Enviar un documento a firma por enlace (el rol mínimo depende del tipo de documento)' })
  create(@Body() dto: CreateSignatureRequestDto, @CurrentUser() user: AuthUser, @Req() req: Req) {
    return this.svc.create(user, dto, getClientInfo(req));
  }

  @Get()
  @ApiOperation({ summary: 'Solicitudes de firma de un documento, con su bitácora' })
  list(@Query() q: ListSignatureRequestsQuery, @CurrentUser() user: AuthUser) {
    return this.svc.list(user, q.documentType, q.targetId);
  }

  @Get(':id')
  get(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: AuthUser) {
    return this.svc.get(user, id);
  }

  @Post(':id/resend')
  @ApiOperation({ summary: 'Reenviar: rota el enlace (el anterior deja de servir) y vuelve a enviar el correo' })
  resend(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: ResendSignatureRequestDto, @CurrentUser() user: AuthUser, @Req() req: Req) {
    return this.svc.resend(user, id, dto, getClientInfo(req));
  }

  @Post(':id/revoke')
  @ApiOperation({ summary: 'Revocar una solicitud pendiente' })
  revoke(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: RevokeSignatureRequestDto, @CurrentUser() user: AuthUser, @Req() req: Req) {
    return this.svc.revoke(user, id, dto.reason, getClientInfo(req));
  }

  @Post(':id/reseal')
  @ApiOperation({ summary: 'Reintentar el sellado de una solicitud firmada' })
  reseal(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: AuthUser) {
    return this.svc.reseal(user, id);
  }

  @Get(':id/file/:kind')
  @ApiOperation({ summary: 'Enlace de 10 min a un archivo: original | signed | attachment:<id> | quarantine:<id> (gerente)' })
  file(@Param('id', new ParseUUIDPipe()) id: string, @Param('kind') kind: string, @CurrentUser() user: AuthUser) {
    return this.svc.getFile(user, id, kind);
  }

  @Get(':id/integrity')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Verificar la integridad: bitácora encadenada, huellas de los PDF y cabeza de la cadena' })
  integrity(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: AuthUser) {
    return this.svc.integrity(user, id);
  }
}
