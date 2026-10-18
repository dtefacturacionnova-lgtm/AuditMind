import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, UseGuards, Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import {
  IsString, IsEnum, IsObject, IsOptional, IsNotEmpty,
} from 'class-validator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { DataSourcesService } from './data-sources.service';
import { DataSourceType, ConnectorStatus, UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import type { Request } from 'express';
import type { AuthUser } from '../auth/jwt.strategy';

class CreateDataSourceDto {
  @IsString() @IsNotEmpty() name!: string;
  @IsEnum(DataSourceType)           type!: DataSourceType;
  @IsObject()                       config!: Record<string, unknown>;
}

class UpdateDataSourceDto {
  @IsOptional() @IsString()         name?: string;
  @IsOptional() @IsObject()         config?: Record<string, unknown>;
  @IsOptional() @IsEnum(ConnectorStatus) status?: ConnectorStatus;
}

class RunImportDto {
  @IsOptional() @IsString()         auditId?: string;
  @IsOptional() @IsObject()         options?: Record<string, unknown>;
}

@ApiTags('Data Sources')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Roles(UserRole.AUDITOR)
@Controller('data-sources')
export class DataSourcesController {
  constructor(private readonly service: DataSourcesService) {}

  @Get()
  @ApiOperation({ summary: 'Listar todas las fuentes de datos de la organización' })
  findAll(@Req() req: Request) {
    return this.service.findAll(req.user as AuthUser);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener una fuente de datos con su historial de imports' })
  findOne(@Param('id') id: string, @Req() req: Request) {
    return this.service.findOne(id, req.user as AuthUser);
  }

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Crear una nueva fuente de datos' })
  create(@Body() dto: CreateDataSourceDto, @Req() req: Request) {
    return this.service.create(dto, req.user as AuthUser);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Actualizar configuración o estado de una fuente' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateDataSourceDto,
    @Req() req: Request,
  ) {
    return this.service.update(id, dto, req.user as AuthUser);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Eliminar una fuente de datos' })
  remove(@Param('id') id: string, @Req() req: Request) {
    return this.service.remove(id, req.user as AuthUser);
  }

  @Post(':id/test')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Probar la conectividad de la fuente de datos' })
  test(@Param('id') id: string, @Req() req: Request) {
    return this.service.testConnection(id, req.user as AuthUser);
  }

  @Post(':id/import')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Iniciar una importación de datos (async)' })
  runImport(
    @Param('id') id: string,
    @Body() dto: RunImportDto,
    @Req() req: Request,
  ) {
    return this.service.runImport(id, dto, req.user as AuthUser);
  }

  @Get(':id/imports/:importId')
  @ApiOperation({ summary: 'Consultar estado de una importación' })
  getImportStatus(
    @Param('id') id: string,
    @Param('importId') importId: string,
    @Req() req: Request,
  ) {
    return this.service.getImportStatus(id, importId, req.user as AuthUser);
  }
}
