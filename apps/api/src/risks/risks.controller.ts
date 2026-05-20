import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { RisksService, CreateRiskDto, UpdateRiskDto } from './risks.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthUser } from '../auth/jwt.strategy';
import { UserRole } from '@prisma/client';

@ApiTags('Riesgos')
@ApiBearerAuth()
@Controller('risks')
export class RisksController {
  constructor(private readonly service: RisksService) {}

  // ─── Stats ─────────────────────────────────────────────────────────────────
  @Get('stats')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'KPIs del registro de riesgos' })
  stats(@CurrentUser() user: AuthUser) {
    return this.service.stats(user);
  }

  // ─── List ──────────────────────────────────────────────────────────────────
  @Get()
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Listar todos los riesgos de la organización' })
  @ApiQuery({ name: 'auditEntityId', required: false })
  findAll(
    @CurrentUser() user: AuthUser,
    @Query('auditEntityId') auditEntityId?: string,
  ) {
    return this.service.findAll(user, auditEntityId);
  }

  // ─── Get one ───────────────────────────────────────────────────────────────
  @Get(':id')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Obtener un riesgo por ID' })
  findOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.findOne(id, user);
  }

  // ─── Create ────────────────────────────────────────────────────────────────
  @Post()
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Registrar nuevo riesgo' })
  create(@Body() dto: CreateRiskDto, @CurrentUser() user: AuthUser) {
    return this.service.create(dto, user);
  }

  // ─── Update ────────────────────────────────────────────────────────────────
  @Patch(':id')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Actualizar riesgo' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateRiskDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.update(id, dto, user);
  }

  // ─── Delete ────────────────────────────────────────────────────────────────
  @Delete(':id')
  @Roles(UserRole.AUDIT_MANAGER)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar riesgo (AUDIT_MANAGER+)' })
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.remove(id, user);
  }
}
