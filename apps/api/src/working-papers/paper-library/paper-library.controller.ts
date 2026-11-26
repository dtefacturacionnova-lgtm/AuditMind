import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsArray, IsIn, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { StrictBoolean } from '../../common/validators/strict-boolean.decorator';
import { AuthUser } from '../../auth/jwt.strategy';
import { PaperLibraryAdminService } from './paper-library-admin.service';
import { TECHNIQUES } from './paper-library';

/** Los largos finos los valida el servicio (mensajes en español); aquí solo la forma y un tope para no recibir cuerpos enormes. */
export class PaperLibraryItemDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) title?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) statement?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(4000) development?: string;
  @ApiPropertyOptional({ enum: TECHNIQUES }) @IsOptional() @IsIn(TECHNIQUES as unknown as string[]) technique?: (typeof TECHNIQUES)[number];
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) ref?: string;
  @ApiPropertyOptional({ enum: ['HIGH', 'MEDIUM', 'LOW'] }) @IsOptional() @IsIn(['HIGH', 'MEDIUM', 'LOW']) priority?: 'HIGH' | 'MEDIUM' | 'LOW';
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) @MaxLength(40, { each: true }) auditTypes?: string[];
}

export class BaseOverrideDto {
  @ApiPropertyOptional({ description: 'true = ocultar para la organización; false = volver a mostrar' })
  @IsOptional() @StrictBoolean() hidden?: boolean;

  @ApiPropertyOptional({ type: PaperLibraryItemDto, description: 'Texto completo que reemplaza al del sistema' })
  @IsOptional() @ValidateNested() @Type(() => PaperLibraryItemDto) content?: PaperLibraryItemDto;
}

/**
 * Biblioteca por papel de la organización: ver org-library.ts. Leer lo puede cualquier auditor (la usa «Generar sugerencias»);
 * escribir lo hace el Gerente de Auditoría o superior, igual que la biblioteca de contenido general.
 */
@ApiTags('Biblioteca por papel')
@ApiBearerAuth()
@Controller('paper-library')
export class PaperLibraryController {
  constructor(private readonly service: PaperLibraryAdminService) {}

  @Get()
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Papeles con biblioteca (del sistema o de la organización) y cuántos ajustes tiene cada uno' })
  list(@CurrentUser() user: AuthUser) {
    return this.service.listPapers(user);
  }

  @Get(':paperCode')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Biblioteca efectiva de un papel para la organización (sistema + ajustes), incluidos los ocultos' })
  get(@Param('paperCode') paperCode: string, @CurrentUser() user: AuthUser) {
    return this.service.getPaper(user, paperCode);
  }

  @Post(':paperCode/items')
  @Roles(UserRole.AUDIT_MANAGER)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear un procedimiento propio de la organización en la biblioteca del papel' })
  create(@Param('paperCode') paperCode: string, @Body() dto: PaperLibraryItemDto, @CurrentUser() user: AuthUser) {
    return this.service.createOwn(user, paperCode, dto);
  }

  @Patch('items/:rowId')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Editar un procedimiento propio (los campos no enviados se conservan)' })
  update(@Param('rowId') rowId: string, @Body() dto: PaperLibraryItemDto, @CurrentUser() user: AuthUser) {
    return this.service.updateOwn(user, rowId, dto);
  }

  @Delete('items/:rowId')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Eliminar un procedimiento propio' })
  remove(@Param('rowId') rowId: string, @CurrentUser() user: AuthUser) {
    return this.service.deleteOwn(user, rowId);
  }

  @Put(':paperCode/base/:baseId')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Editar y/u ocultar un procedimiento que trae el sistema, solo para esta organización' })
  override(
    @Param('paperCode') paperCode: string,
    @Param('baseId') baseId: string,
    @Body() dto: BaseOverrideDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.overrideBase(user, paperCode, baseId, dto);
  }

  @Delete(':paperCode/base/:baseId')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Restaurar un procedimiento del sistema: quita la edición y deja de estar oculto' })
  restore(@Param('paperCode') paperCode: string, @Param('baseId') baseId: string, @CurrentUser() user: AuthUser) {
    return this.service.restoreBase(user, paperCode, baseId);
  }
}
