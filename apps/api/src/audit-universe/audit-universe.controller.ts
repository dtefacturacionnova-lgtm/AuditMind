import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, ParseIntPipe, DefaultValuePipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { AuditUniverseService } from './audit-universe.service';
import { CreateAuditableUnitDto } from './dto/create-auditable-unit.dto';
import { UpdateAuditableUnitDto } from './dto/update-auditable-unit.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../auth/jwt.strategy';
import { UserRole } from '@prisma/client';

@ApiTags('Universo de Auditoría')
@ApiBearerAuth()
@Controller('audit-universe')
export class AuditUniverseController {
  constructor(private readonly service: AuditUniverseService) {}

  @Post()
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Crear unidad auditable' })
  create(@Body() dto: CreateAuditableUnitDto, @CurrentUser() user: AuthUser) {
    return this.service.create(dto, user);
  }

  @Get()
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Listar universo de auditoría' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'riskLevel', required: false, type: String })
  findAll(
    @CurrentUser() user: AuthUser,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('search') search?: string,
    @Query('riskLevel') riskLevel?: string,
  ) {
    return this.service.findAll(user, page, limit, search);
  }

  @Get('risk-summary')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Resumen de riesgos del universo' })
  getRiskSummary(@CurrentUser() user: AuthUser) {
    return this.service.getRiskSummary(user);
  }

  @Get(':id')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Obtener unidad auditable con historial' })
  findOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.findOne(id, user);
  }

  @Patch(':id')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Actualizar unidad auditable' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateAuditableUnitDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.update(id, dto, user);
  }

  @Delete(':id')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Desactivar unidad auditable' })
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.remove(id, user);
  }
}
