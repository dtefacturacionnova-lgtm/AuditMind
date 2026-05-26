import { Controller, Get, Post, Patch, Delete, Body, Param } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { StrategicService } from './strategic.service';
import { CreateObjectiveDto, UpdateObjectiveDto, CreateLineDto, UpdateLineDto } from './dto/strategic.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../auth/jwt.strategy';
import { UserRole } from '@prisma/client';

@ApiTags('Plan Estratégico')
@ApiBearerAuth()
@Controller('strategic')
export class StrategicController {
  constructor(private readonly service: StrategicService) {}

  @Get('objectives')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Listar objetivos estratégicos con líneas' })
  getObjectives(@CurrentUser() user: AuthUser) {
    return this.service.getObjectives(user);
  }

  @Post('objectives')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Crear objetivo estratégico' })
  createObjective(@Body() dto: CreateObjectiveDto, @CurrentUser() user: AuthUser) {
    return this.service.createObjective(dto, user);
  }

  @Patch('objectives/:id')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Actualizar objetivo estratégico' })
  updateObjective(@Param('id') id: string, @Body() dto: UpdateObjectiveDto) {
    return this.service.updateObjective(id, dto);
  }

  @Delete('objectives/:id')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Eliminar objetivo estratégico' })
  deleteObjective(@Param('id') id: string) {
    return this.service.deleteObjective(id);
  }

  @Post('lines')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Crear línea estratégica' })
  createLine(@Body() dto: CreateLineDto, @CurrentUser() user: AuthUser) {
    return this.service.createLine(dto, user);
  }

  @Patch('lines/:id')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Actualizar línea estratégica' })
  updateLine(@Param('id') id: string, @Body() dto: UpdateLineDto) {
    return this.service.updateLine(id, dto);
  }

  @Delete('lines/:id')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Eliminar línea estratégica' })
  deleteLine(@Param('id') id: string) {
    return this.service.deleteLine(id);
  }
}
