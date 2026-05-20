import {
  Controller, Get, Post, Patch, Delete, Body, Param,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PlansService } from './plans.service';
import {
  CreatePlanDto, UpdatePlanDto, CreatePlanItemDto, UpdatePlanItemDto,
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
}
