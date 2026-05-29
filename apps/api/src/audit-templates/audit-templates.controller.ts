import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { AuditTemplatesService } from './audit-templates.service';
import { CreateAuditTemplateDto, UpdateAuditTemplateDto } from './dto/audit-template.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../auth/jwt.strategy';
import { AuditType } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@ApiTags('audit-templates')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('audit-templates')
export class AuditTemplatesController {
  constructor(private readonly service: AuditTemplatesService) {}

  @Get()
  @ApiOperation({ summary: 'Listar plantillas de auditoría (filtrado opcional por tipo)' })
  @ApiQuery({ name: 'auditType', required: false, enum: AuditType })
  findAll(
    @CurrentUser() user: AuthUser,
    @Query('auditType') auditType?: AuditType,
  ) {
    return this.service.findAll(user, auditType);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener una plantilla de auditoría' })
  findOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.findOne(id, user);
  }

  @Post()
  @ApiOperation({ summary: 'Crear nueva plantilla de auditoría' })
  create(@Body() dto: CreateAuditTemplateDto, @CurrentUser() user: AuthUser) {
    return this.service.create(dto, user);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar plantilla de auditoría' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateAuditTemplateDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.update(id, dto, user);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar plantilla de auditoría' })
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.remove(id, user);
  }

  @Post(':id/duplicate')
  @ApiOperation({ summary: 'Duplicar una plantilla de auditoría' })
  duplicate(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.duplicate(id, user);
  }

  @Post(':id/set-default')
  @ApiOperation({ summary: 'Establecer como plantilla predeterminada para sus tipos' })
  setDefault(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.setDefault(id, user);
  }

  @Post('reseed-system')
  @ApiOperation({ summary: 'Restaurar / actualizar plantillas de sistema con el catálogo más reciente' })
  reseedSystem(@CurrentUser() user: AuthUser) {
    return this.service.reseedSystemTemplates(user);
  }
}
