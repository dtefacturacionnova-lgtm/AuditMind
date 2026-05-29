import {
  Controller, Get, Post, Patch, Body, Param,
  Query, ParseIntPipe, DefaultValuePipe,
} from '@nestjs/common';
import { IsString, IsOptional, IsBoolean } from 'class-validator';

class RollForwardDto {
  @IsString() title!: string;
  @IsOptional() @IsString() startDate?: string;
  @IsOptional() @IsString() endDate?: string;
  @IsOptional() @IsBoolean() carryOpenFindings?: boolean;
}
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { AuditsService } from './audits.service';
import { CreateAuditDto } from './dto/create-audit.dto';
import { UpdateAuditDto, UpdateAuditStatusDto } from './dto/update-audit.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../auth/jwt.strategy';
import { UserRole } from '@prisma/client';

@ApiTags('Auditorías')
@ApiBearerAuth()
@Controller('audits')
export class AuditsController {
  constructor(private readonly service: AuditsService) {}

  @Post()
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Crear nueva auditoría' })
  create(@Body() dto: CreateAuditDto, @CurrentUser() user: AuthUser) {
    return this.service.create(dto, user);
  }

  @Get()
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Listar auditorías' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiQuery({ name: 'type',    required: false, type: String })
  @ApiQuery({ name: 'subtype', required: false, type: String })
  findAll(
    @CurrentUser() user: AuthUser,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('search')  search?:  string,
    @Query('status')  status?:  string,
    @Query('type')    type?:    string,
    @Query('subtype') subtype?: string,
  ) {
    return this.service.findAll(user, page, limit, search, status, type, subtype);
  }

  @Get(':id')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Obtener auditoría con detalle completo' })
  findOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.findOne(id, user);
  }

  @Get(':id/progress')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Progreso de la auditoría' })
  getProgress(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.getProgress(id, user);
  }

  @Patch(':id')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Actualizar auditoría' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateAuditDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.update(id, dto, user);
  }

  @Patch(':id/status')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Cambiar estado de auditoría con validación de transición' })
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateAuditStatusDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.updateStatus(id, dto, user);
  }

  // ─── F6.1 Roll-forward ────────────────────────────────────────────────────────
  @Post(':id/roll-forward')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'F6.1 — Roll-forward: crea nueva auditoría copiando estructura de la anterior' })
  rollForward(
    @Param('id') id: string,
    @Body() dto: RollForwardDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.rollForward(id, dto, user);
  }
}
