import { Controller, Get, Post, Patch, Delete, Body, Param, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ContentLibraryKind } from '@prisma/client';
import { ContentLibraryService } from './content-library.service';
import { CreateContentLibraryItemDto, UpdateContentLibraryItemDto } from './dto/content-library-item.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthUser } from '../auth/jwt.strategy';
import { UserRole } from '@prisma/client';

@ApiTags('Biblioteca de Contenido')
@ApiBearerAuth()
@Controller('content-library')
export class ContentLibraryController {
  constructor(private readonly service: ContentLibraryService) {}

  @Get()
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Listar ítems de la biblioteca de contenido de la organización' })
  @ApiQuery({ name: 'kind', required: false, enum: ContentLibraryKind })
  @ApiQuery({ name: 'groupKey', required: false })
  list(
    @CurrentUser() user: AuthUser,
    @Query('kind') kind?: ContentLibraryKind,
    @Query('groupKey') groupKey?: string,
  ) {
    return this.service.list(user, kind, groupKey);
  }

  @Get(':id')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Obtener un ítem por ID' })
  findOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.findOne(id, user);
  }

  @Post()
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Crear ítem de biblioteca (Gerente o superior)' })
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateContentLibraryItemDto, @CurrentUser() user: AuthUser) {
    return this.service.create(dto, user);
  }

  @Patch(':id')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Actualizar ítem de biblioteca' })
  update(@Param('id') id: string, @Body() dto: UpdateContentLibraryItemDto, @CurrentUser() user: AuthUser) {
    return this.service.update(id, dto, user);
  }

  @Delete(':id')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Eliminar ítem de biblioteca (no aplica a ítems de sistema)' })
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.remove(id, user);
  }

  @Post('reseed-system')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Restaurar/actualizar la biblioteca de sistema con el catálogo más reciente' })
  reseedSystem(@CurrentUser() user: AuthUser) {
    return this.service.reseedSystemLibrary(user);
  }
}
