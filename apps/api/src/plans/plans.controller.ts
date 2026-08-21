import {
  Controller, Get, Post, Patch, Delete, Body, Param,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PlansService } from './plans.service';
import {
  CreatePlanDto, UpdatePlanDto, CreatePlanItemDto, UpdatePlanItemDto, ImportFromProjectsDto,
  CreateTimeEntryDto, LinkAuditDto,
} from './dto/plan.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../auth/jwt.strategy';
import { UserRole } from '@prisma/client';

@ApiTags('Planes Anuales de Auditoría')
@ApiBearerAuth()
@Controller('plans')
export class PlansController {
  constructor(private readonly service: PlansService) {}

  @Post()
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Crear plan anual de auditoría' })
  create(@Body() dto: CreatePlanDto, @CurrentUser() user: AuthUser) {
    return this.service.create(dto, user);
  }

  @Get()
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Listar planes de la organización' })
  findAll(@CurrentUser() user: AuthUser) {
    return this.service.findAll(user);
  }

  @Get(':id')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Obtener detalle de un plan' })
  findOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.findOne(id, user);
  }

  @Patch(':id')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Actualizar plan (DRAFT o APPROVED)' })
  update(@Param('id') id: string, @Body() dto: UpdatePlanDto, @CurrentUser() user: AuthUser) {
    return this.service.update(id, dto, user);
  }

  @Post(':id/approve')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Aprobar plan (DRAFT → APPROVED)' })
  approve(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.approve(id, user);
  }

  @Post(':id/activate')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Activar plan (APPROVED → ACTIVE)' })
  activate(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.activate(id, user);
  }

  @Post(':id/close')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Cerrar plan (ACTIVE → CLOSED)' })
  close(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.close(id, user);
  }

  // ── Banco de Proyectos integration ────────────────────────────────────────
  // Static sub-routes MUST come before :id/items to avoid NestJS param collision

  @Get(':id/project-candidates')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Proyectos del Banco candidatos para este plan (includeInPlan + targetPlanYear)' })
  getProjectCandidates(@Param('id') planId: string, @CurrentUser() user: AuthUser) {
    return this.service.getProjectCandidates(planId, user);
  }

  @Post(':id/import-from-projects')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Importar proyectos del Banco de Proyectos al plan' })
  importFromProjects(
    @Param('id') planId: string,
    @Body() dto: ImportFromProjectsDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.importFromProjects(planId, dto, user);
  }

  @Post(':id/items')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Agregar entidad al plan' })
  addItem(
    @Param('id') planId: string,
    @Body() dto: CreatePlanItemDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.addItem(planId, dto, user);
  }

  @Patch(':id/items/:itemId')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Actualizar ítem del plan' })
  updateItem(
    @Param('id') planId: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdatePlanItemDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.updateItem(planId, itemId, dto, user);
  }

  @Delete(':id/items/:itemId')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Quitar entidad del plan' })
  removeItem(
    @Param('id') planId: string,
    @Param('itemId') itemId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.removeItem(planId, itemId, user);
  }

  @Get(':id/linkable-audits')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Encargos de la organización disponibles para vincular a un ítem del plan' })
  getLinkableAudits(@Param('id') planId: string, @CurrentUser() user: AuthUser) {
    return this.service.getLinkableAudits(planId, user);
  }

  @Patch(':id/items/:itemId/link-audit')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Vincular el ítem a un encargo real ya existente — conecta horas reales' })
  linkAudit(
    @Param('id') planId: string,
    @Param('itemId') itemId: string,
    @Body() dto: LinkAuditDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.linkAudit(planId, itemId, dto, user);
  }

  @Delete(':id/items/:itemId/link-audit')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Desvincular el ítem de su encargo' })
  unlinkAudit(
    @Param('id') planId: string,
    @Param('itemId') itemId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.unlinkAudit(planId, itemId, user);
  }

  // ── L2.8: Timesheet ──────────────────────────────────────────────────────────

  @Post('time-entries')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Registrar horas trabajadas (timesheet)' })
  createTimeEntry(@Body() dto: CreateTimeEntryDto, @CurrentUser() user: AuthUser) {
    return this.service.createTimeEntry(dto, user);
  }

  @Get('time-entries/audit/:auditId')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Listar entradas de tiempo de una auditoría' })
  getTimeEntries(@Param('auditId') auditId: string, @CurrentUser() user: AuthUser) {
    return this.service.getTimeEntries(auditId, user);
  }

  @Get('time-entries/plan-item/:planItemId')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Listar entradas de tiempo de un ítem del plan' })
  getPlanItemTimeEntries(@Param('planItemId') planItemId: string, @CurrentUser() user: AuthUser) {
    return this.service.getPlanItemTimeEntries(planItemId, user);
  }

  @Delete('time-entries/:entryId')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Eliminar entrada de tiempo propia' })
  deleteTimeEntry(@Param('entryId') id: string, @CurrentUser() user: AuthUser) {
    return this.service.deleteTimeEntry(id, user);
  }

  // ── L2.7: Findings linked to a Banco de Proyectos project ────────────────────

  @Get('project-findings/:projectId')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Hallazgos históricos de un proyecto del Banco' })
  getProjectFindings(@Param('projectId') projectId: string, @CurrentUser() user: AuthUser) {
    return this.service.getProjectFindings(projectId, user);
  }
}
