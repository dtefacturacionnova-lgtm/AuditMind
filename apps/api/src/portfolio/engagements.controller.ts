import {
  Controller, Get, Post, Patch, Body, Param, Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { EngagementsService } from './engagements.service';
import { EngagementProgramService } from './engagement-program.service';
import { CreateEngagementDto, ListEngagementsQueryDto, ProgramQueryDto, UpdateEngagementDto } from './dto/engagement.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../auth/jwt.strategy';

@ApiTags('Cartera — Encargos')
@ApiBearerAuth()
@Controller('portfolio/engagements')
export class EngagementsController {
  constructor(private readonly service: EngagementsService, private readonly programService: EngagementProgramService) {}

  @Post()
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Crear encargo (exige Client.status = ACTIVE)' })
  create(@Body() dto: CreateEngagementDto, @CurrentUser() user: AuthUser) {
    return this.service.create(dto, user);
  }

  @Get('program')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Programa anual de encargos: horas comprometidas por encargo y por persona contra la capacidad neta del equipo' })
  program(@Query() query: ProgramQueryDto, @CurrentUser() user: AuthUser) {
    return this.programService.program(query.year, user);
  }

  @Get()
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Listar encargos, filtrables por clientId y status' })
  findAll(@Query() query: ListEngagementsQueryDto, @CurrentUser() user: AuthUser) {
    return this.service.findAll(user, query.clientId, query.status);
  }

  @Patch(':id')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Editar nombre, fechas previstas, socio a cargo y notas del encargo' })
  update(@Param('id') id: string, @Body() dto: UpdateEngagementDto, @CurrentUser() user: AuthUser) {
    return this.service.update(id, dto, user);
  }

  @Post(':id/approve')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({
    summary: 'Aprobar encargo: crea la Audit real (transaccional) y la vincula al encargo',
  })
  approve(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.approve(id, user);
  }

  @Post(':id/cancel')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Cancelar encargo (rechazado si ya generó una auditoría)' })
  cancel(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.cancel(id, user);
  }
}
