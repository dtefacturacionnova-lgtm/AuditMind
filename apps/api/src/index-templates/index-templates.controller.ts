import {
  Controller, Get, Post, Patch, Delete, Body, Param, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IndexTemplatesService } from './index-templates.service';
import { CreateIndexTemplateDto, UpdateIndexTemplateDto } from './dto/index-template.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthUser } from '../auth/jwt.strategy';
import { UserRole } from '@prisma/client';

@ApiTags('Plantillas de Índice')
@ApiBearerAuth()
@Controller('index-templates')
export class IndexTemplatesController {
  constructor(private readonly service: IndexTemplatesService) {}

  @Get()
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Listar plantillas de índice de la organización' })
  getTemplates(@CurrentUser() user: AuthUser) {
    return this.service.getTemplates(user);
  }

  @Get(':id')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Obtener plantilla por ID' })
  getTemplate(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.getTemplate(id, user);
  }

  @Post()
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Crear nueva plantilla de índice (Gerente o superior)' })
  @HttpCode(HttpStatus.CREATED)
  createTemplate(@Body() dto: CreateIndexTemplateDto, @CurrentUser() user: AuthUser) {
    return this.service.createTemplate(dto, user);
  }

  @Patch(':id')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Actualizar plantilla de índice' })
  updateTemplate(
    @Param('id') id: string,
    @Body() dto: UpdateIndexTemplateDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.updateTemplate(id, dto, user);
  }

  @Delete(':id')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Eliminar plantilla (no aplica a plantillas del sistema)' })
  @HttpCode(HttpStatus.OK)
  deleteTemplate(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.deleteTemplate(id, user);
  }

  @Post(':id/set-default')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Establecer como plantilla por defecto' })
  setDefault(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.setDefault(id, user);
  }
}
