import { Controller, Get, Post, Patch, Body, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { OrganizationsService } from './organizations.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../auth/jwt.strategy';
import { UserRole } from '@prisma/client';

@ApiTags('Organizaciones')
@ApiBearerAuth()
@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly service: OrganizationsService) {}

  @Post()
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Crear organización (SUPER_ADMIN)' })
  create(@Body() dto: CreateOrganizationDto) {
    return this.service.create(dto);
  }

  @Get()
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Listar todas las organizaciones (SUPER_ADMIN)' })
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Obtener organización por ID' })
  findOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.findOne(id, user);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Actualizar organización' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateOrganizationDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.update(id, dto, user);
  }

  @Get(':id/stats')
  @Roles(UserRole.CAE)
  @ApiOperation({ summary: 'Estadísticas de la organización' })
  getStats(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.getStats(id, user);
  }
}
