import { Controller, Get, Post, Patch, Body, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { OrganizationsService } from './organizations.service';
import { CreateOrganizationDto, InviteOrgAdminDto } from './dto/create-organization.dto';
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

  @Post(':id/invite-admin')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Invitar a una persona como ADMIN de esta organización (SUPER_ADMIN)',
    description: 'Envía un correo de invitación; la persona define su propia contraseña. Nadie más la ve.',
  })
  inviteAdmin(@Param('id') id: string, @Body() dto: InviteOrgAdminDto) {
    return this.service.inviteAdmin(id, dto);
  }

  @Get('me')
  @Roles(UserRole.READ_ONLY)
  @ApiOperation({ summary: 'Obtener datos básicos de la organización del usuario autenticado' })
  findMine(@CurrentUser() user: AuthUser) {
    return this.service.findMine(user.organizationId);
  }

  @Get(':id')
  @Roles(UserRole.CAE)
  @ApiOperation({ summary: 'Obtener organización por ID' })
  findOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.findOne(id, user);
  }

  @Patch(':id')
  @Roles(UserRole.CAE)
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
