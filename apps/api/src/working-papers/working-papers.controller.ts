import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query,
  ParseIntPipe, DefaultValuePipe,
} from '@nestjs/common';
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

  // ─── Intelligent Papers: Graph ────────────────────────────────────────────

  @Get(':id/graph')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Vista del grafo de conocimiento para un papel (fuentes + dependientes)' })
  getGraph(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.graphService.getGraphForPaper(id, user);
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
  @ApiOperation({ summary: 'Generar sugerencias de procedimientos IA basadas en el historial de hallazgos de la entidad' })
  generateAiSuggestions(@Param('auditId') auditId: string, @CurrentUser() user: AuthUser) {
    return this.crossAudit.generateSuggestions(auditId, user);
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
}
