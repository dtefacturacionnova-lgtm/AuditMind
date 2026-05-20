import {
  Controller, Get, Patch, Delete, Body, Param,
  Query, ParseIntPipe, DefaultValuePipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { UpdateUserDto, UpdateUserRoleDto } from './dto/update-user.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../auth/jwt.strategy';
import { UserRole } from '@prisma/client';

@ApiTags('Usuarios')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly service: UsersService) {}

  @Get()
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Listar usuarios de la organización' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  findAll(
    @CurrentUser() user: AuthUser,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('search') search?: string,
  ) {
    return this.service.findAll(user, page, limit, search);
  }

  @Get('me')
  @ApiOperation({ summary: 'Perfil del usuario actual' })
  getMe(@CurrentUser() user: AuthUser) {
    return this.service.findOne(user.id, user);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Actualizar perfil propio' })
  updateMe(@CurrentUser() user: AuthUser, @Body() dto: UpdateUserDto) {
    return this.service.updateMe(user.id, dto);
  }

  @Get(':id')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Obtener usuario por ID' })
  findOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.findOne(id, user);
  }

  @Patch(':id/role')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Cambiar rol de usuario (ADMIN/CAE)' })
  updateRole(
    @Param('id') id: string,
    @Body() dto: UpdateUserRoleDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.updateRole(id, dto, user);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Desactivar usuario' })
  deactivate(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.deactivate(id, user);
  }
}
