import {
  Controller, Get, Post, Patch, Body, Param, Query, ParseIntPipe, DefaultValuePipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { PbcService } from './pbc.service';
import {
  CreatePbcRequestDto, AddPortalMessageDto, SubmitPortalDto,
  AddAuditorMessageDto,
} from './dto/create-pbc-request.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../auth/jwt.strategy';
import { PbcRequestStatus, UserRole } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class ReviewPbcDto {
  @ApiProperty({ enum: [PbcRequestStatus.ACCEPTED, PbcRequestStatus.REJECTED] })
  @IsEnum(PbcRequestStatus)
  status: PbcRequestStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

@ApiTags('Portal PBC')
@Controller('pbc')
export class PbcController {
  constructor(private readonly service: PbcService) {}

  // ─── Endpoints autenticados ───────────────────────────────────────────────────

  @Post()
  @ApiBearerAuth()
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Crear solicitud PBC al auditado' })
  create(@Body() dto: CreatePbcRequestDto, @CurrentUser() user: AuthUser) {
    return this.service.create(dto, user);
  }

  @Get('org')
  @ApiBearerAuth()
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Listar todas las solicitudes PBC de la organización' })
  @ApiQuery({ name: 'status', required: false, enum: PbcRequestStatus })
  @ApiQuery({ name: 'page',   required: false, type: Number })
  @ApiQuery({ name: 'limit',  required: false, type: Number })
  findAllForOrg(
    @CurrentUser() user: AuthUser,
    @Query('status') status?: PbcRequestStatus,
    @Query('page',  new DefaultValuePipe(1),  ParseIntPipe) page: number = 1,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number = 20,
  ) {
    return this.service.findAllForOrg(user, page, limit, status);
  }

  @Get('by-audit/:auditId')
  @ApiBearerAuth()
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Listar solicitudes PBC de una auditoría' })
  findAllForAudit(@Param('auditId') auditId: string, @CurrentUser() user: AuthUser) {
    return this.service.findAllForAudit(auditId, user);
  }

  @Get('stats/:auditId')
  @ApiBearerAuth()
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Estadísticas PBC de una auditoría' })
  getStats(@Param('auditId') auditId: string, @CurrentUser() user: AuthUser) {
    return this.service.getStats(auditId, user);
  }

  @Get(':id')
  @ApiBearerAuth()
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Obtener solicitud PBC por ID (auditor)' })
  findOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.findOneForAuditor(id, user);
  }

  @Post(':id/message')
  @ApiBearerAuth()
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Auditor agrega mensaje al hilo de la solicitud' })
  addAuditorMessage(
    @Param('id') id: string,
    @Body() dto: AddAuditorMessageDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.addAuditorMessage(id, user, dto.content, dto.attachmentUrls);
  }

  @Patch(':id/review')
  @ApiBearerAuth()
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Revisar y aceptar/rechazar respuesta del auditado' })
  review(
    @Param('id') id: string,
    @Body() dto: ReviewPbcDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.review(id, dto.status, dto.notes, user);
  }

  @Post(':id/regenerate-token')
  @ApiBearerAuth()
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Regenerar token del portal' })
  regenerateToken(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.regenerateToken(id, user);
  }

  @Post('admin/mark-overdue')
  @ApiBearerAuth()
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Marcar como vencidas las solicitudes expiradas' })
  markOverdue(@CurrentUser() _user: AuthUser) {
    return this.service.markOverdue();
  }

  // ─── Endpoints públicos del portal (sin autenticación) ───────────────────────

  @Get('portal/:token')
  @Public()
  @ApiOperation({ summary: '[Portal] Obtener solicitud por token (sin autenticación)' })
  findByToken(@Param('token') token: string) {
    return this.service.findByToken(token);
  }

  @Post('portal/:token/message')
  @Public()
  @ApiOperation({ summary: '[Portal] Auditado envía mensaje en el hilo' })
  addMessageByToken(
    @Param('token') token: string,
    @Body() dto: AddPortalMessageDto,
  ) {
    return this.service.addMessageByToken(token, dto.content, dto.attachmentUrls);
  }

  @Post('portal/:token/submit')
  @Public()
  @ApiOperation({ summary: '[Portal] Auditado envía su respuesta final (marca SUBMITTED)' })
  submitByToken(@Param('token') token: string, @Body() dto: SubmitPortalDto) {
    return this.service.submitByToken(token, dto.fileUrls, dto.auditeeNotes);
  }
}
