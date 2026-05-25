import { Controller, Get, Post, Patch, Delete, Body, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CatalogsService } from './catalogs.service';
import {
  CreateEntityTypeDto, UpdateEntityTypeDto,
  CreateProcessCategoryDto, UpdateProcessCategoryDto,
} from './dto/catalogs.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../auth/jwt.strategy';
import { UserRole } from '@prisma/client';

@ApiTags('Catálogos Generales')
@ApiBearerAuth()
@Controller('catalogs')
export class CatalogsController {
  constructor(private readonly service: CatalogsService) {}

  // ─── Entity Types ──────────────────────────────────────────────────────────

  @Get('entity-types')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Listar tipos de entidad del organigrama' })
  getEntityTypes(@CurrentUser() user: AuthUser) {
    return this.service.getEntityTypes(user);
  }

  @Post('entity-types')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Crear tipo de entidad' })
  createEntityType(@Body() dto: CreateEntityTypeDto, @CurrentUser() user: AuthUser) {
    return this.service.createEntityType(dto, user);
  }

  @Patch('entity-types/:id')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Actualizar tipo de entidad' })
  updateEntityType(@Param('id') id: string, @Body() dto: UpdateEntityTypeDto, @CurrentUser() user: AuthUser) {
    return this.service.updateEntityType(id, dto, user);
  }

  @Delete('entity-types/:id')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Desactivar tipo de entidad' })
  deleteEntityType(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.deleteEntityType(id, user);
  }

  // ─── Process Categories ────────────────────────────────────────────────────

  @Get('process-categories')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Listar categorías de procesos' })
  getProcessCategories(@CurrentUser() user: AuthUser) {
    return this.service.getProcessCategories(user);
  }

  @Post('process-categories')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Crear categoría de proceso' })
  createProcessCategory(@Body() dto: CreateProcessCategoryDto, @CurrentUser() user: AuthUser) {
    return this.service.createProcessCategory(dto, user);
  }

  @Patch('process-categories/:id')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Actualizar categoría de proceso' })
  updateProcessCategory(@Param('id') id: string, @Body() dto: UpdateProcessCategoryDto, @CurrentUser() user: AuthUser) {
    return this.service.updateProcessCategory(id, dto, user);
  }

  @Delete('process-categories/:id')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Desactivar categoría de proceso' })
  deleteProcessCategory(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.deleteProcessCategory(id, user);
  }
}
