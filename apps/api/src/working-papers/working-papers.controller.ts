import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query,
  ParseIntPipe, DefaultValuePipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { WorkingPapersService } from './working-papers.service';
import { CreateWorkingPaperDto, AddCommentDto, AddTickMarkEntryDto } from './dto/create-working-paper.dto';
import { UpdateWorkingPaperDto, UpdateWorkingPaperStatusDto } from './dto/update-working-paper.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../auth/jwt.strategy';
import { UserRole, WorkingPaperStatus } from '@prisma/client';

@ApiTags('Papeles de Trabajo')
@ApiBearerAuth()
@Controller('working-papers')
export class WorkingPapersController {
  constructor(private readonly service: WorkingPapersService) {}

  // ─── Listados ─────────────────────────────────────────────────────────────────

  @Post()
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Crear papel de trabajo' })
  create(@Body() dto: CreateWorkingPaperDto, @CurrentUser() user: AuthUser) {
    return this.service.create(dto, user);
  }

  @Get('org')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Listar papeles de trabajo de la organización' })
  @ApiQuery({ name: 'auditId', required: false })
  @ApiQuery({ name: 'status',  required: false, enum: WorkingPaperStatus })
  @ApiQuery({ name: 'page',    required: false, type: Number })
  @ApiQuery({ name: 'limit',   required: false, type: Number })
  findAllForOrg(
    @CurrentUser() user: AuthUser,
    @Query('auditId') auditId?: string,
    @Query('status')  status?: WorkingPaperStatus,
    @Query('page',  new DefaultValuePipe(1),  ParseIntPipe) page: number = 1,
    @Query('limit', new DefaultValuePipe(30), ParseIntPipe) limit: number = 30,
  ) {
    return this.service.findAllForOrg(user, page, limit, status, auditId);
  }

  @Get('by-audit/:auditId')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Listar todos los papeles de una auditoría' })
  findAllForAudit(@Param('auditId') auditId: string, @CurrentUser() user: AuthUser) {
    return this.service.findAllForAudit(auditId, user);
  }

  @Get('index/:auditId')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Índice de papeles agrupado por sección (A/B/C/D/E/AD)' })
  getIndex(@Param('auditId') auditId: string, @CurrentUser() user: AuthUser) {
    return this.service.getIndex(auditId, user);
  }

  // ─── Paper CRUD ───────────────────────────────────────────────────────────────

  @Get(':id')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Obtener papel de trabajo completo con tick marks, comentarios y hallazgos' })
  findOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.findOne(id, user);
  }

  @Patch(':id')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Actualizar contenido del papel (guarda snapshot de versión anterior)' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateWorkingPaperDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.update(id, dto, user);
  }

  @Patch(':id/status')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Cambiar estado del papel (DRAFT → IN_REVIEW → APPROVED → FINAL)' })
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateWorkingPaperStatusDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.updateStatus(id, dto, user);
  }

  // ─── Tick marks ───────────────────────────────────────────────────────────────

  @Post(':id/tick-marks')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Agregar marca de auditoría a un papel' })
  addTickMark(
    @Param('id') id: string,
    @Body() dto: AddTickMarkEntryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.addTickMarkEntry(id, dto, user);
  }

  @Delete('tick-marks/:entryId')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Eliminar marca de auditoría' })
  removeTickMark(@Param('entryId') entryId: string, @CurrentUser() user: AuthUser) {
    return this.service.removeTickMarkEntry(entryId, user);
  }

  // ─── Comments ────────────────────────────────────────────────────────────────

  @Post(':id/comments')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Agregar comentario de revisión' })
  addComment(
    @Param('id') id: string,
    @Body() dto: AddCommentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.addComment(id, dto, user);
  }

  @Patch('comments/:commentId/resolve')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Marcar comentario como resuelto' })
  resolveComment(@Param('commentId') commentId: string, @CurrentUser() user: AuthUser) {
    return this.service.resolveComment(commentId, user);
  }

  // ─── Version history ──────────────────────────────────────────────────────────

  @Get(':id/versions')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Historial de versiones del papel' })
  getVersionHistory(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.getVersionHistory(id, user);
  }
}
