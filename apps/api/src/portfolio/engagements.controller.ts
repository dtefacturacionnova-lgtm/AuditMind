import {
  Controller, Get, Post, Body, Param, Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { EngagementsService } from './engagements.service';
import { CreateEngagementDto, ListEngagementsQueryDto } from './dto/engagement.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../auth/jwt.strategy';

@ApiTags('Cartera — Encargos')
@ApiBearerAuth()
@Controller('portfolio/engagements')
export class EngagementsController {
  constructor(private readonly service: EngagementsService) {}

  @Post()
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Crear encargo (exige Client.status = ACTIVE)' })
  create(@Body() dto: CreateEngagementDto, @CurrentUser() user: AuthUser) {
    return this.service.create(dto, user);
  }

  @Get()
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Listar encargos, filtrables por clientId y status' })
  findAll(@Query() query: ListEngagementsQueryDto, @CurrentUser() user: AuthUser) {
    return this.service.findAll(user, query.clientId, query.status);
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
