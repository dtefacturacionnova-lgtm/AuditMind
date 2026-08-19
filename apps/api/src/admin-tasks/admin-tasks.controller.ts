import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { AdminTasksService } from './admin-tasks.service';
import {
  CreateAdminTaskDto, UpdateAdminTaskDto, UpdateAdminTaskStatusDto, ListAdminTasksQueryDto,
} from './dto/admin-task.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../auth/jwt.strategy';

@ApiTags('Tareas Administrativas')
@ApiBearerAuth()
@Controller('admin-tasks')
export class AdminTasksController {
  constructor(private readonly service: AdminTasksService) {}

  @Post()
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Crear una tarea administrativa (sin encargo ni auditoría)' })
  create(@Body() dto: CreateAdminTaskDto, @CurrentUser() user: AuthUser) {
    return this.service.create(dto, user);
  }

  @Get()
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Listar tareas — quien no es AUDIT_MANAGER+ solo ve las suyas' })
  findAll(@Query() query: ListAdminTasksQueryDto, @CurrentUser() user: AuthUser) {
    return this.service.findAll(query, user);
  }

  @Patch(':id')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Editar título, descripción, responsable o fecha límite' })
  update(@Param('id') id: string, @Body() dto: UpdateAdminTaskDto, @CurrentUser() user: AuthUser) {
    return this.service.update(id, dto, user);
  }

  @Patch(':id/status')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Mover la tarea entre columnas del tablero (Pendiente/En Curso/Hecha/Cancelada)' })
  updateStatus(@Param('id') id: string, @Body() dto: UpdateAdminTaskStatusDto, @CurrentUser() user: AuthUser) {
    return this.service.updateStatus(id, dto.status, user);
  }

  @Delete(':id')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Eliminar una tarea' })
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.remove(id, user);
  }
}
