import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, ParseIntPipe, DefaultValuePipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { AuditUniverseService } from './audit-universe.service';
import { CreateAuditableUnitDto as LegacyCreateDto } from './dto/create-auditable-unit.dto';
import { UpdateAuditableUnitDto as LegacyUpdateDto } from './dto/update-auditable-unit.dto';
import {
  CreateAuditProcessDto, UpdateAuditProcessDto,
  CreateAuditableUnitDto, UpdateAuditableUnitDto,
  UpsertAssessmentDto,
} from './dto/auditable-unit.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../auth/jwt.strategy';
import { UserRole } from '@prisma/client';

@ApiTags('Universo de Auditoría')
@ApiBearerAuth()
@Controller('audit-universe')
export class AuditUniverseController {
  constructor(private readonly service: AuditUniverseService) {}

  // ─── AuditEntity (legado) ──────────────────────────────────────────────────

  @Post()
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Crear entidad auditable' })
  create(@Body() dto: LegacyCreateDto, @CurrentUser() user: AuthUser) {
    return this.service.create(dto, user);
  }

  @Get()
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Listar entidades del universo' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  findAll(
    @CurrentUser() user: AuthUser,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('search') search?: string,
  ) {
    return this.service.findAll(user, page, limit, search);
  }

  @Get('risk-summary')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Resumen de riesgos del universo' })
  getRiskSummary(@CurrentUser() user: AuthUser) {
    return this.service.getRiskSummary(user);
  }

  // Static routes MUST come before @Get(':id') to avoid NestJS matching them as params
  @Get('tree')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Árbol jerárquico de entidades (organigrama)' })
  getEntityTree(@CurrentUser() user: AuthUser) {
    return this.service.getEntityTree(user);
  }

  @Get(':id')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Obtener entidad con unidades auditables' })
  findOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.findOne(id, user);
  }

  @Patch(':id')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Actualizar entidad auditable' })
  update(@Param('id') id: string, @Body() dto: LegacyUpdateDto, @CurrentUser() user: AuthUser) {
    return this.service.update(id, dto, user);
  }

  @Delete(':id')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Desactivar entidad auditable' })
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.remove(id, user);
  }

  // ─── AuditProcess ─────────────────────────────────────────────────────────

  @Post('processes')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Crear proceso en el catálogo' })
  createProcess(@Body() dto: CreateAuditProcessDto, @CurrentUser() user: AuthUser) {
    return this.service.createProcess(dto, user);
  }

  @Get('processes/list')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Listar catálogo de procesos' })
  findAllProcesses(@CurrentUser() user: AuthUser) {
    return this.service.findAllProcesses(user);
  }

  @Patch('processes/:id')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Actualizar proceso' })
  updateProcess(@Param('id') id: string, @Body() dto: UpdateAuditProcessDto, @CurrentUser() user: AuthUser) {
    return this.service.updateProcess(id, dto, user);
  }

  @Delete('processes/:id')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Desactivar proceso' })
  removeProcess(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.removeProcess(id, user);
  }

  // ─── AuditableUnit ────────────────────────────────────────────────────────

  @Post('units')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Crear unidad auditable (EntityProcess)' })
  createUnit(@Body() dto: CreateAuditableUnitDto, @CurrentUser() user: AuthUser) {
    return this.service.createUnit(dto, user);
  }

  @Get('units/list')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Listar unidades auditables' })
  @ApiQuery({ name: 'entityId', required: false, type: String })
  @ApiQuery({ name: 'year', required: false, type: Number })
  findAllUnits(
    @CurrentUser() user: AuthUser,
    @Query('entityId') entityId?: string,
    @Query('year', new DefaultValuePipe(0), ParseIntPipe) year?: number,
  ) {
    return this.service.findAllUnits(user, entityId, year || undefined);
  }

  @Patch('units/:id')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Actualizar unidad auditable' })
  updateUnit(@Param('id') id: string, @Body() dto: UpdateAuditableUnitDto, @CurrentUser() user: AuthUser) {
    return this.service.updateUnit(id, dto, user);
  }

  @Delete('units/:id')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Desactivar unidad auditable' })
  removeUnit(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.removeUnit(id, user);
  }

  // ─── Scoring Engine ───────────────────────────────────────────────────────

  @Post('units/:id/assessment')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Guardar/actualizar evaluación de riesgos (scoring multi-factor)' })
  upsertAssessment(@Param('id') id: string, @Body() dto: UpsertAssessmentDto, @CurrentUser() user: AuthUser) {
    return this.service.upsertAssessment(id, dto, user);
  }

  // ─── Plan Builder ─────────────────────────────────────────────────────────

  @Get('plan-candidates')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Candidatas al Plan Anual rankeadas por score' })
  @ApiQuery({ name: 'year', required: false, type: Number })
  getPlanCandidates(
    @CurrentUser() user: AuthUser,
    @Query('year', new DefaultValuePipe(0), ParseIntPipe) year?: number,
  ) {
    return this.service.getPlanCandidates(user, year || undefined);
  }
}
