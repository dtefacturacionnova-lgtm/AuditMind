import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query,
  ParseIntPipe, DefaultValuePipe,
} from '@nestjs/common';
import { IsString, IsIn, IsOptional } from 'class-validator';

class SignOffDto {
  @IsString() @IsIn(['prepare', 'review', 'signoff']) level!: 'prepare' | 'review' | 'signoff';
}

class LinkPbcDto {
  @IsString() pbcId!: string;
}

class AssistSectionDto {
  @IsOptional() @IsString() userPrompt?: string;
}

class RestoreVersionDto {
  @IsOptional() @IsString() reason?: string;
}

class AppendProcedureDto {
  @IsOptional() @IsString() procedure?: string;   // legacy (sugerencias)
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() statement?: string;
  @IsOptional() @IsString() development?: string;
  @IsOptional() @IsString() area?: string;
  @IsOptional() @IsString() niaRef?: string;
}

class UpdateProcedureDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() statement?: string;
  @IsOptional() @IsString() development?: string;
  @IsOptional() @IsString() area?: string;
  @IsOptional() @IsString() niaRef?: string;
}

class ImproveTextDto {
  @IsString() text!: string;
  @IsOptional() @IsString() fieldType?: string;
  @IsOptional() @IsString() paperTitle?: string;
  @IsOptional() @IsString() paperType?: string;
}

class DraftProcedureDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() statement?: string;
  @IsOptional() @IsString() paperTitle?: string;
  @IsOptional() @IsString() paperType?: string;
  @IsOptional() @IsString() paperCode?: string;
  @IsOptional() @IsString() auditType?: string;
}
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { WorkingPapersService } from './working-papers.service';
import { CreateWorkingPaperDto, AddCommentDto, AddTickMarkEntryDto } from './dto/create-working-paper.dto';
import { UpdateWorkingPaperDto, UpdateWorkingPaperStatusDto } from './dto/update-working-paper.dto';
import { UpdateSectionValueDto, CreatePaperLinkDto, CreatePaperReferenceDto } from './dto/paper-section.dto';
import { PaperSectionsService } from './paper-sections.service';
import { PaperGraphService } from './paper-graph.service';
import { PaperQualityService } from './paper-quality.service';
import { PaperLiveService } from './paper-live.service';
import { CrossAuditLearningService } from './cross-audit-learning.service';
import { PaperReferencesService } from './paper-references.service';
import { PaperVersionsService } from './paper-versions.service';
import { AiService } from '../ai/ai.service';
import { PdfService } from '../pdf/pdf.service';
import { renderWorkingPaperBody } from '../pdf/pdf-templates';
import type { Response } from 'express';
import { Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../auth/jwt.strategy';
import { UserRole, WorkingPaperStatus } from '@prisma/client';

@ApiTags('Papeles de Trabajo')
@ApiBearerAuth()
@Controller('working-papers')
export class WorkingPapersController {
  constructor(
    private readonly service:          WorkingPapersService,
    private readonly sectionsService:  PaperSectionsService,
    private readonly graphService:     PaperGraphService,
    private readonly qualityService:   PaperQualityService,
    private readonly liveService:      PaperLiveService,
    private readonly crossAudit:       CrossAuditLearningService,
    private readonly references:       PaperReferencesService,
    private readonly versionsService:  PaperVersionsService,
    private readonly aiService:        AiService,
    private readonly pdfService:       PdfService,
  ) {}

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

  @Get('audit-materialidad/:auditId')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Obtener MG/ME/UAE del papel PT-A4 para una auditoría (para semáforo B-00 S6)' })
  getMaterialidad(@Param('auditId') auditId: string, @CurrentUser() user: AuthUser) {
    return this.sectionsService.getMaterialidadByAudit(auditId, user);
  }

  @Get('catalogue')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Catálogo de plantillas de papeles disponibles, opcionalmente filtrado por tipo de auditoría' })
  @ApiQuery({ name: 'auditType', required: false })
  getCatalogue(@Query('auditType') auditType?: string) {
    return this.service.getCatalogue(auditType);
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

  @Delete(':id')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Eliminar papel de trabajo (cascada: secciones, versiones, comentarios, marcas)' })
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.remove(id, user);
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

  // ─── PI.5 — Version history MASTER ────────────────────────────────────────

  @Get(':id/versions')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'PI.5 — Historial de versiones con metadata (autor, razón, conteo cambios)' })
  listVersions(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.versionsService.listVersions(id, user);
  }

  @Get(':id/versions/compare')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'PI.5 — Diff word-level entre dos versiones (to=0 → versión actual del papel)' })
  compareVersions(
    @Param('id') id: string,
    @Query('from') from: string,
    @Query('to')   to:   string,
    @CurrentUser() user: AuthUser,
  ) {
    const fromN = parseInt(from, 10);
    const toN   = parseInt(to,   10);
    return this.versionsService.compareVersions(id, fromN, toN, user);
  }

  @Get(':id/versions/:versionId')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'PI.5 — Obtener snapshot completo de una versión' })
  getVersion(
    @Param('id') id: string,
    @Param('versionId') versionId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.versionsService.getVersion(id, versionId, user);
  }

  @Post(':id/versions/:versionId/restore')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'PI.5 — Restaurar el papel a un snapshot anterior (crea nueva versión)' })
  restoreVersion(
    @Param('id') id: string,
    @Param('versionId') versionId: string,
    @Body() dto: RestoreVersionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.versionsService.restoreVersion(id, versionId, dto.reason, user);
  }

  // ─── Intelligent Papers: Sections ─────────────────────────────────────────

  @Get(':id/sections')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Obtener todas las secciones de un papel inteligente (ordenadas por sortOrder)' })
  getSections(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.sectionsService.getSections(id, user);
  }

  @Patch(':id/sections/:sectionKey')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Actualizar el valor de una sección (dispara propagación al grafo)' })
  updateSection(
    @Param('id')         id:         string,
    @Param('sectionKey') sectionKey: string,
    @Body()              dto:        UpdateSectionValueDto,
    @CurrentUser()       user:       AuthUser,
  ) {
    return this.sectionsService.updateSection(id, sectionKey, dto.value, user);
  }

  @Post(':id/propagate-trial-balance')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Propagar totales de B-00 S2 (Clasificador) a cédulas sumarias B-01..B-06 (determinista, sin IA)' })
  propagateTrialBalance(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.sectionsService.propagateTrialBalance(id, user);
  }

  @Post(':id/sections/init/:templateKey')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Inicializar secciones de un papel desde una plantilla (PT-A1, PT-A2, PT-A4, PT-MEMO, PT-PROG)' })
  initFromTemplate(
    @Param('id')          id:          string,
    @Param('templateKey') templateKey: string,
    @CurrentUser()        user:        AuthUser,
  ) {
    return this.sectionsService.initFromTemplate(id, templateKey, user);
  }

  // ─── PI.3: AI assistant por sección ──────────────────────────────────────
  @Post(':id/sections/:sectionKey/assist')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'PI.3 — Pedir a la IA una sugerencia para una sección específica (no sobreescribe el valor)' })
  assistSection(
    @Param('id')         id:         string,
    @Param('sectionKey') sectionKey: string,
    @Body()              dto:        AssistSectionDto,
    @CurrentUser()       user:       AuthUser,
  ) {
    return this.sectionsService.assistSection(id, sectionKey, user, dto.userPrompt);
  }

  // ─── PI.7c: COSO 2013 auto-assessment ────────────────────────────────────
  @Post(':id/coso-assess')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'PI.7c — Generar evaluación COSO 2013 con IA usando contexto del expediente' })
  runCosoAssess(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.sectionsService.runCosoAssess(id, user);
  }

  // ─── PI.2: Cascade invalidation por sección ──────────────────────────────
  @Get(':id/stale-sections')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'PI.2 — Listar las secciones desactualizadas de un papel (con razón y timestamp)' })
  getStaleSections(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.sectionsService.getStaleSections(id, user);
  }

  @Post(':id/sections/:sectionKey/confirm')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'PI.2 — Confirmar que la sección sigue vigente (limpia flag isStale sin cambiar el valor)' })
  confirmSection(
    @Param('id')         id:         string,
    @Param('sectionKey') sectionKey: string,
    @CurrentUser()       user:       AuthUser,
  ) {
    return this.sectionsService.confirmSection(id, sectionKey, user);
  }

  // ─── Intelligent Papers: Graph ────────────────────────────────────────────

  @Get(':id/graph')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Vista del grafo de conocimiento para un papel (fuentes + dependientes)' })
  getGraph(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.graphService.getGraphForPaper(id, user);
  }

  @Get('audit-graph/:auditId')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'PI.4 — Grafo completo de papeles + links para toda una auditoría' })
  getAuditGraph(@Param('auditId') auditId: string, @CurrentUser() user: AuthUser) {
    return this.graphService.getAuditGraph(auditId, user);
  }

  @Post(':id/links')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Crear un vínculo de datos entre dos papeles' })
  createLink(
    @Param('id')   id:   string,
    @Body()        dto:  CreatePaperLinkDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.graphService.createLink(id, dto, user);
  }

  // ─── Intelligent Papers: Master consolidation ─────────────────────────────

  @Post(':id/consolidate')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Disparar consolidación IA de un papel MASTER (pone en REGENERATING, emite evento al módulo AI)' })
  consolidate(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.consolidateMasterPaper(id, user);
  }

  // ─── Sprint 3: Semantic quality gate ──────────────────────────────────────

  @Post(':id/quality-check')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Ejecutar gate de calidad semántica con IA sobre un papel inteligente' })
  runQualityCheck(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.qualityService.runQualityCheck(id, user);
  }

  // ─── Sprint 3: LIVE paper dashboard ───────────────────────────────────────

  @Get(':id/live-stats')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Estadísticas en tiempo real para un papel LIVE (papeles, hallazgos, presupuesto, equipo)' })
  getLiveStats(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.liveService.getLiveStats(id, user);
  }

  // ─── Sprint 3: Cross-audit learning ───────────────────────────────────────

  @Post('by-audit/:auditId/ai-suggestions')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Generar sugerencias de procedimientos IA (opcionalmente contextualizadas a un papel)' })
  generateAiSuggestions(
    @Param('auditId') auditId: string,
    @Body() body: { paperId?: string },
    @CurrentUser() user: AuthUser,
  ) {
    return this.crossAudit.generateSuggestions(auditId, user, body?.paperId);
  }

  // ─── Aplicar un procedimiento sugerido al papel actual ─────────────────────
  @Post(':id/append-procedure')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Agregar un procedimiento (de las sugerencias IA) a la sección de procedimientos del papel' })
  appendProcedure(
    @Param('id') id: string,
    @Body() dto: AppendProcedureDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.appendProcedure(id, dto, user);
  }

  @Patch(':id/procedures/:procedureId')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Actualizar campos de un procedimiento (title/statement/development)' })
  updateProcedure(
    @Param('id') id: string,
    @Param('procedureId') procedureId: string,
    @Body() dto: UpdateProcedureDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.updateProcedure(id, procedureId, dto, user);
  }

  @Delete(':id/procedures/:procedureId')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Quitar un procedimiento del papel' })
  removeProcedure(
    @Param('id') id: string,
    @Param('procedureId') procedureId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.removeProcedure(id, procedureId, user);
  }

  // ─── Adjuntar archivo de soporte a una SECCIÓN ─────────────────────────────
  @Post(':id/sections/:sectionKey/attachments')
  @Roles(UserRole.AUDITOR)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 25 * 1024 * 1024 } }))
  @ApiOperation({ summary: 'Subir un documento de soporte a una sección (máx 25MB)' })
  attachToSection(
    @Param('id') id: string,
    @Param('sectionKey') sectionKey: string,
    @UploadedFile() file: { buffer: Buffer; originalname: string; mimetype: string; size: number },
    @CurrentUser() user: AuthUser,
  ) {
    if (!file) throw new Error('No se recibió archivo');
    return this.service.attachToSection(id, sectionKey, file, user);
  }

  @Delete(':id/sections/:sectionKey/attachments/:attachmentId')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Quitar un documento de soporte de una sección' })
  removeSectionAttachment(
    @Param('id') id: string,
    @Param('sectionKey') sectionKey: string,
    @Param('attachmentId') attachmentId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.removeSectionAttachment(id, sectionKey, attachmentId, user);
  }

  // ─── F3: Adjuntar archivo de soporte a un procedimiento ────────────────────
  @Post(':id/procedures/:procedureId/attachments')
  @Roles(UserRole.AUDITOR)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 25 * 1024 * 1024 } }))
  @ApiOperation({ summary: 'Subir un documento de soporte a un procedimiento (máx 25MB)' })
  attachToProcedure(
    @Param('id') id: string,
    @Param('procedureId') procedureId: string,
    @UploadedFile() file: { buffer: Buffer; originalname: string; mimetype: string; size: number },
    @CurrentUser() user: AuthUser,
  ) {
    if (!file) throw new Error('No se recibió archivo');
    return this.service.attachToProcedure(id, procedureId, file, user);
  }

  @Delete(':id/procedures/:procedureId/attachments/:attachmentId')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Quitar un documento de soporte de un procedimiento' })
  removeAttachment(
    @Param('id') id: string,
    @Param('procedureId') procedureId: string,
    @Param('attachmentId') attachmentId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.removeAttachment(id, procedureId, attachmentId, user);
  }

  // ─── F4: Evidencia documental (STANDARD papers) ────────────────────────────
  @Post(':id/document-evidence/:rowId/attachments')
  @Roles(UserRole.AUDITOR)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 25 * 1024 * 1024 } }))
  @ApiOperation({ summary: 'Subir un archivo de evidencia a una fila de documento (máx 25MB)' })
  attachToDocumentEvidence(
    @Param('id') id: string,
    @Param('rowId') rowId: string,
    @UploadedFile() file: { buffer: Buffer; originalname: string; mimetype: string; size: number },
    @CurrentUser() user: AuthUser,
  ) {
    if (!file) throw new Error('No se recibió archivo');
    return this.service.attachToDocumentEvidence(id, rowId, file, user);
  }

  @Delete(':id/document-evidence/:rowId/attachments/:attachmentId')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Quitar un archivo de evidencia de una fila de documento' })
  removeDocumentEvidenceAttachment(
    @Param('id') id: string,
    @Param('rowId') rowId: string,
    @Param('attachmentId') attachmentId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.removeDocumentEvidenceAttachment(id, rowId, attachmentId, user);
  }

  // ─── F5b: Obtener cuentas del TB de B-00 para importar a la analítica ───────
  @Get(':id/tb-accounts')
  @Roles(UserRole.AUDITOR, UserRole.SENIOR_AUDITOR, UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Devuelve cuentas clasificadas del B-00 para importar a la analítica' })
  getTbAccountsForPaper(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.getTbAccountsForPaper(id, user);
  }

  // ─── F5: Analítica de cuentas (ACCOUNT_SCHEDULE) ─────────────────────────
  @Post(':id/account-schedule/:rowId/attachments')
  @Roles(UserRole.AUDITOR)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 25 * 1024 * 1024 } }))
  @ApiOperation({ summary: 'Subir adjunto a una fila de cédula analítica (ACCOUNT_SCHEDULE, máx 25MB)' })
  attachToAccountSchedule(
    @Param('id') id: string,
    @Param('rowId') rowId: string,
    @UploadedFile() file: { buffer: Buffer; originalname: string; mimetype: string; size: number },
    @CurrentUser() user: AuthUser,
  ) {
    if (!file) throw new Error('No se recibió archivo');
    return this.service.attachToAccountSchedule(id, rowId, file, user);
  }

  @Delete(':id/account-schedule/:rowId/attachments/:attachmentId')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Quitar adjunto de una fila de cédula analítica' })
  removeAccountScheduleAttachment(
    @Param('id') id: string,
    @Param('rowId') rowId: string,
    @Param('attachmentId') attachmentId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.removeAccountScheduleAttachment(id, rowId, attachmentId, user);
  }

  // ─── F3: Referencias cruzadas — vincular procedimiento con otro papel ──────
  @Post(':id/procedures/:procedureId/cross-refs')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Vincular un procedimiento con otro papel de trabajo (referencia cruzada)' })
  addCrossRef(
    @Param('id') id: string,
    @Param('procedureId') procedureId: string,
    @Body() body: { targetPaperId: string },
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.addCrossRefToProcedure(id, procedureId, body.targetPaperId, user);
  }

  @Delete(':id/procedures/:procedureId/cross-refs/:targetPaperId')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Quitar una referencia cruzada de un procedimiento' })
  removeCrossRef(
    @Param('id') id: string,
    @Param('procedureId') procedureId: string,
    @Param('targetPaperId') targetPaperId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.removeCrossRefFromProcedure(id, procedureId, targetPaperId, user);
  }

  // ─── IA: mejorar redacción de un texto de procedimiento ────────────────────
  @Post('ai/improve-text')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Mejorar la redacción de un texto (título/enunciado/desarrollo) con IA' })
  improveText(@Body() body: ImproveTextDto) {
    return this.aiService.improveProcedureText({ ...body });
  }

  // ─── IA: generar desarrollo de un procedimiento ────────────────────────────
  @Post('ai/draft-procedure')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Generar el desarrollo de un procedimiento con IA (desde título + enunciado)' })
  draftProcedure(@Body() body: DraftProcedureDto) {
    return this.aiService.draftProcedure({ ...body });
  }

  // ─── PDF profesional del papel de trabajo ──────────────────────────────────
  @Get(':id/pdf')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Descargar el papel de trabajo completo en PDF profesional' })
  async getPaperPdf(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
  ) {
    const wp = await this.service.findOne(id, user);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = wp as any;

    // Versiones (PI.5) para la hoja de Historial
    const versions = await this.versionsService.listVersions(id, user).catch(() => []);

    // Firmante (signed off) + PBC links para la hoja de Revisión
    const pbcLinks = await this.service.getPbcLinksForPdf(id).catch(() => []);
    const signedOffName = w.signedOffById
      ? await this.service.getUserName(w.signedOffById).catch(() => null)
      : null;

    const body = renderWorkingPaperBody({
      paper: {
        code:         w.code,
        paperCode:    w.paperCode,
        title:        w.title,
        type:         w.type,
        wpKind:       w.wpKind,
        status:       w.status,
        indexSection: w.indexSection,
        qualityScore: w.qualityScore,
        conclusion:   w.conclusion,
        narrative:    w.narrative,
        preparedBy:   w.preparedBy ? { name: w.preparedBy.name } : null,
        reviewedBy:   w.reviewedBy ? { name: w.reviewedBy.name } : null,
        preparedAt:   w.preparedAt?.toISOString?.() ?? null,
        reviewedAt:   w.reviewedAt?.toISOString?.() ?? null,
        version:      w.version,
        audit:        { title: w.audit?.title ?? '' },
        sections:     (w.sections ?? []).map((s: Record<string, unknown>) => ({
          sectionKey: s.sectionKey, label: s.label, value: s.value, fieldType: s.fieldType,
          attachments: Array.isArray(s.attachments) ? s.attachments : [],
        })),
        content:      w.content,
        // Grafo
        sourceLinks:  (w.sourceLinks ?? []).map((l: Record<string, any>) => ({
          targetCode: l.target?.code, targetTitle: l.target?.title,
          sourceField: l.sourceField, targetField: l.targetField, mappingType: l.mappingType,
        })),
        targetLinks:  (w.targetLinks ?? []).map((l: Record<string, any>) => ({
          sourceCode: l.source?.code, sourceTitle: l.source?.title,
          sourceField: l.sourceField, targetField: l.targetField, mappingType: l.mappingType,
        })),
        // Revisión
        comments:     (w.comments ?? []).map((c: Record<string, any>) => ({
          content: c.content, createdAt: c.createdAt?.toISOString?.() ?? null, resolved: c.resolved,
        })),
        // Historial
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        versions:     (versions as any[]).map(v => ({
          version: v.version, changedAt: v.changedAt, changedBy: v.changedBy,
          reason: v.reason, wordCount: v.wordCount,
        })),
        // Revisión enriquecida
        qualityReport: w.qualityReport ?? null,
        signOff: {
          preparedByName:  w.preparedBy?.name ?? null,
          preparedAt:      w.preparedAt?.toISOString?.() ?? null,
          reviewedByName:  w.reviewedBy?.name ?? null,
          reviewedAt:      w.reviewedAt?.toISOString?.() ?? null,
          signedOffByName: signedOffName,
          signedOffAt:     w.signedOffAt?.toISOString?.() ?? null,
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        pbcLinks: (pbcLinks as any[]).map(p => ({ code: p.code, title: p.title, status: p.status })),
      },
    });

    const footerNote = [
      w.paperCode ?? w.code,
      w.audit?.title,
      w.preparedBy?.name ? `Elaborado por: ${w.preparedBy.name}` : null,
    ].filter(Boolean).join(' — ');

    const pdf = await this.pdfService.generateBranded({
      title:    `${w.paperCode ?? w.code} — ${w.title}`,
      subtitle: `Papel de Trabajo · ${w.audit?.title ?? ''}`,
      body,
      options:  { printPageNumbers: true, format: 'A4', footerNote },
    });

    const filename = `auditmind_papel_${(w.paperCode ?? w.code ?? id).replace(/[^\w-]/g, '_')}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdf.length);
    res.send(pdf);
  }

  // ─── Gap 3: @mention references ───────────────────────────────────────────

  @Get('mention-index/:auditId')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Índice de papeles+secciones para el autocomplete @mention (por auditoría)' })
  getMentionIndex(@Param('auditId') auditId: string, @CurrentUser() user: AuthUser) {
    return this.references.getMentionIndex(auditId, user);
  }

  @Get(':id/references')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Listar referencias @mention que parten de este papel' })
  getReferences(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.references.getReferencesForPaper(id, user);
  }

  @Post(':id/references')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Registrar una referencia @mention desde una sección de este papel' })
  createReference(
    @Param('id')   id:   string,
    @Body()        dto:  CreatePaperReferenceDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.references.createReference(id, dto, user);
  }

  // ─── F6.6 Checkout / collaborative lock ──────────────────────────────────────

  @Post(':id/checkout')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'F6.6 — Marcar papel de trabajo como "abierto para edición" por el usuario actual' })
  checkout(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.checkout(id, user);
  }

  @Post(':id/checkin')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'F6.6 — Liberar el lock de edición del papel de trabajo' })
  checkin(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.checkin(id, user);
  }

  // ─── F6.2 Sign-off matrix ─────────────────────────────────────────────────────

  @Post(':id/sign')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'F6.2 — Firmar papel de trabajo (prepare | review | signoff)' })
  signOff(
    @Param('id')   id:   string,
    @Body()        dto:  SignOffDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.signOff(id, dto.level, user);
  }

  @Get('sign-off-matrix/:auditId')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'F6.2 — Matriz de firmas de todos los papeles de una auditoría' })
  getSignOffMatrix(@Param('auditId') auditId: string, @CurrentUser() user: AuthUser) {
    return this.service.getSignOffMatrix(auditId, user);
  }

  // ─── F6.3 PBC ↔ Workpaper links ──────────────────────────────────────────────

  @Get(':id/pbc-links')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'F6.3 — Listar solicitudes PBC vinculadas y disponibles para un papel' })
  getPbcLinks(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.getPbcLinks(id, user);
  }

  @Post(':id/pbc-links')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'F6.3 — Vincular una solicitud PBC a este papel de trabajo' })
  linkPbc(
    @Param('id')   id:   string,
    @Body()        dto:  LinkPbcDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.linkPbc(id, dto.pbcId, user);
  }

  @Delete('pbc-links/:linkId')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'F6.3 — Desvincular solicitud PBC de papel de trabajo' })
  unlinkPbc(@Param('linkId') linkId: string, @CurrentUser() user: AuthUser) {
    return this.service.unlinkPbc(linkId, user);
  }
}
