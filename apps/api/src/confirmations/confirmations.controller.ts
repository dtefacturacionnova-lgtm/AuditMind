import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ConfirmationsService } from './confirmations.service';
import {
  CreateConfirmationDto, UpdateConfirmationDto,
  ReceiveResponseDto, ReconcileDto, AltProcedureDto,
} from './dto/create-confirmation.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../auth/jwt.strategy';
import { ConfirmationStatus, UserRole } from '@prisma/client';

@ApiTags('Confirmaciones Externas (NIA 505)')
@ApiBearerAuth()
@Controller('confirmations')
export class ConfirmationsController {
  constructor(private readonly service: ConfirmationsService) {}

  // ── Stats org ──────────────────────────────────────────────────────────────
  @Get('org/stats')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'KPIs de confirmaciones externas de la organización' })
  getOrgStats(@CurrentUser() user: AuthUser) {
    return this.service.getOrgStats(user);
  }

  // ── List org ───────────────────────────────────────────────────────────────
  @Get('org')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Listar todas las confirmaciones de la organización' })
  @ApiQuery({ name: 'status', enum: ConfirmationStatus, required: false })
  @ApiQuery({ name: 'page',   type: Number, required: false })
  @ApiQuery({ name: 'limit',  type: Number, required: false })
  findAllForOrg(
    @CurrentUser() user: AuthUser,
    @Query('status') status?: ConfirmationStatus,
    @Query('page')   page?: string,
    @Query('limit')  limit?: string,
  ) {
    return this.service.findAllForOrg(user, page ? +page : 1, limit ? +limit : 20, status);
  }

  // ── List by audit ──────────────────────────────────────────────────────────
  @Get('by-audit/:auditId')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Listar confirmaciones de una auditoría' })
  findAllForAudit(@Param('auditId') auditId: string, @CurrentUser() user: AuthUser) {
    return this.service.findAllForAudit(auditId, user);
  }

  // ── Get one ────────────────────────────────────────────────────────────────
  @Get(':id')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Obtener detalle de una confirmación' })
  findOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.findOne(id, user);
  }

  // ── Create ─────────────────────────────────────────────────────────────────
  @Post()
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Crear confirmación externa' })
  create(@Body() dto: CreateConfirmationDto, @CurrentUser() user: AuthUser) {
    return this.service.create(dto, user);
  }

  // ── Update ─────────────────────────────────────────────────────────────────
  @Patch(':id')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Editar confirmación (solo DRAFT)' })
  update(@Param('id') id: string, @Body() dto: UpdateConfirmationDto, @CurrentUser() user: AuthUser) {
    return this.service.update(id, dto, user);
  }

  // ── Send ───────────────────────────────────────────────────────────────────
  @Post(':id/send')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Marcar como enviada (DRAFT → SENT)' })
  send(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.send(id, user);
  }

  // ── Receive response ───────────────────────────────────────────────────────
  @Post(':id/receive')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Registrar respuesta recibida (SENT → RECEIVED)' })
  receiveResponse(@Param('id') id: string, @Body() dto: ReceiveResponseDto, @CurrentUser() user: AuthUser) {
    return this.service.receiveResponse(id, dto, user);
  }

  // ── Reconcile ──────────────────────────────────────────────────────────────
  @Post(':id/reconcile')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Conciliar respuesta (RECEIVED → RECONCILED)' })
  reconcile(@Param('id') id: string, @Body() dto: ReconcileDto, @CurrentUser() user: AuthUser) {
    return this.service.reconcile(id, dto, user);
  }

  // ── No response ────────────────────────────────────────────────────────────
  @Post(':id/no-response')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Marcar sin respuesta (SENT → NO_RESPONSE)' })
  markNoResponse(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.markNoResponse(id, user);
  }

  // ── Alt procedure ──────────────────────────────────────────────────────────
  @Post(':id/alt-procedure')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Registrar procedimiento alternativo' })
  altProcedure(@Param('id') id: string, @Body() dto: AltProcedureDto, @CurrentUser() user: AuthUser) {
    return this.service.altProcedure(id, dto, user);
  }

  // ── Delete ─────────────────────────────────────────────────────────────────
  @Delete(':id')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Eliminar confirmación (solo DRAFT)' })
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.remove(id, user);
  }
}
