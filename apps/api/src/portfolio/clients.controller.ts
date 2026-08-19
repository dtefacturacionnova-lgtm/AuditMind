import {
  Controller, Get, Post, Patch, Body, Param, Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { ClientsService } from './clients.service';
import { CreateClientDto, UpdateClientDto, ListClientsQueryDto } from './dto/client.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../auth/jwt.strategy';

@ApiTags('Cartera — Clientes')
@ApiBearerAuth()
@Controller('portfolio/clients')
export class ClientsController {
  constructor(private readonly service: ClientsService) {}

  @Post()
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Crear prospecto (status = PROSPECT)' })
  create(@Body() dto: CreateClientDto, @CurrentUser() user: AuthUser) {
    return this.service.create(dto, user);
  }

  @Get()
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Listar clientes de la cartera, filtrable por status' })
  findAll(@Query() query: ListClientsQueryDto, @CurrentUser() user: AuthUser) {
    return this.service.findAll(user, query.status);
  }

  @Get(':id')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Detalle del cliente con radar, propuestas, cartas y encargos' })
  findOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.findOne(id, user);
  }

  @Patch(':id')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Editar datos generales del cliente (el status solo cambia vía transiciones)' })
  update(@Param('id') id: string, @Body() dto: UpdateClientDto, @CurrentUser() user: AuthUser) {
    return this.service.update(id, dto, user);
  }
}
