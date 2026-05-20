import {
  Controller, Get, Post, Patch, Body, Param, Query, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { IsString, IsBoolean, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FindingsService } from './findings.service';
import {
  CreateFindingDto, UpdateFindingDto,
  AssignResponsibleDto, RejectFindingDto,
} from './dto/create-finding.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../auth/jwt.strategy';
import { UserRole } from '@prisma/client';

class AddCommentDto {
  @ApiProperty()
  @IsString()
  content: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isInternal?: boolean;
}

@ApiTags('Hallazgos')
@ApiBearerAuth()
@Controller('findings')
export class FindingsController {
  constructor(private readonly service: FindingsService) {}

  // ─── Create ────────────────────────────────────────────────────────────────
  @Post()
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Crear hallazgo (score de calidad automático)' })
  create(@Body() dto: CreateFindingDto, @CurrentUser() user: AuthUser) {
    return this.service.create(dto, user);
  }

  // ─── List ──────────────────────────────────────────────────────────────────
  @Get('by-audit/:auditId')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Listar hallazgos de una auditoría' })
  @ApiQuery({ name: 'severity', required: false })
  @ApiQuery({ name: 'status', required: false })
  findAllForAudit(
    @Param('auditId') auditId: string,
    @CurrentUser() user: AuthUser,
    @Query('severity') severity?: string,
    @Query('status') status?: string,
  ) {
    return this.service.findAllForAudit(auditId, user, severity, status);
  }

  @Get('org')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Listar todos los hallazgos de la organización (con paginación)' })
  @ApiQuery({ name: 'severity', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  findAllForOrg(
    @CurrentUser() user: AuthUser,
    @Query('severity') severity?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.findAllForOrg(user, {
      severity,
      status,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
    });
  }

  @Get('overdue')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Hallazgos vencidos de la organización (dashboard CAE)' })
  getOverdue(@CurrentUser() user: AuthUser) {
    return this.service.getOverdueByOrg(user);
  }

  @Get('recurring')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Hallazgos recurrentes de la organización' })
  getRecurring(@CurrentUser() user: AuthUser) {
    return this.service.getRecurringFindings(user);
  }

  @Get('summary/:auditId')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Resumen estadístico de hallazgos de una auditoría' })
  getSummary(@Param('auditId') auditId: string, @CurrentUser() user: AuthUser) {
    return this.service.getSummaryByAudit(auditId, user);
  }

  @Get(':id')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Obtener hallazgo completo con acciones y comentarios' })
  findOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.findOne(id, user);
  }

  // ─── Update ────────────────────────────────────────────────────────────────
  @Patch(':id')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Actualizar hallazgo (recalcula score automáticamente)' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateFindingDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.update(id, dto, user);
  }

  // ─── Workflow ──────────────────────────────────────────────────────────────
  @Patch(':id/submit')
  @Roles(UserRole.AUDITOR)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Enviar a revisión (requiere score ≥ 60)' })
  submitForReview(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.submitForReview(id, user);
  }

  @Patch(':id/approve')
  @Roles(UserRole.AUDIT_MANAGER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Aprobar hallazgo (solo Gerente/CAE/Admin)' })
  approve(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.approve(id, user);
  }

  @Patch(':id/reject')
  @Roles(UserRole.AUDIT_MANAGER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rechazar hallazgo con observaciones (solo Gerente/CAE/Admin)' })
  reject(
    @Param('id') id: string,
    @Body() dto: RejectFindingDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.reject(id, dto, user);
  }

  @Patch(':id/assign')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Asignar responsable y fecha límite (solo hallazgos APPROVED)' })
  assignResponsible(
    @Param('id') id: string,
    @Body() dto: AssignResponsibleDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.assignResponsible(id, dto, user);
  }

  @Patch(':id/close')
  @Roles(UserRole.AUDIT_MANAGER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cerrar hallazgo (requiere evidencia de remediación)' })
  close(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.close(id, user);
  }

  // ─── Comments ─────────────────────────────────────────────────────────────
  @Post(':id/comments')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Agregar comentario o nota interna al hallazgo' })
  addComment(
    @Param('id') id: string,
    @Body() dto: AddCommentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.addComment(id, dto.content, dto.isInternal ?? false, user);
  }

  // ─── Maintenance ──────────────────────────────────────────────────────────
  @Post('admin/process-overdue')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '[Admin] Procesar vencidos y escalar (normalmente un cron job)' })
  processOverdue(@CurrentUser() user: AuthUser) {
    return this.service.processOverdueEscalation(user.organizationId);
  }
}
