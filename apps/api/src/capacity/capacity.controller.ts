import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query, DefaultValuePipe, ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { CapacityService } from './capacity.service';
import {
  CreateHolidayDto, UpdateHolidayDto,
  CreateAvailabilityProfileDto, UpdateAvailabilityProfileDto,
  CreateCostProfileDto, UpdateCostProfileDto,
} from './dto/capacity.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../auth/jwt.strategy';
import { UserRole } from '@prisma/client';

@ApiTags('Capacidad y Costeo')
@ApiBearerAuth()
@Controller('capacity')
export class CapacityController {
  constructor(private readonly service: CapacityService) {}

  // ─── HolidayConfig ─────────────────────────────────────────────────────────

  @Get('holidays')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Listar festivos de la organización' })
  @ApiQuery({ name: 'year', required: false, type: Number })
  getHolidays(
    @Query('year', new DefaultValuePipe(0), ParseIntPipe) year: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.getHolidays(year || undefined, user);
  }

  @Post('holidays')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Crear festivo' })
  createHoliday(@Body() dto: CreateHolidayDto, @CurrentUser() user: AuthUser) {
    return this.service.createHoliday(dto, user);
  }

  @Patch('holidays/:id')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Actualizar festivo' })
  updateHoliday(@Param('id') id: string, @Body() dto: UpdateHolidayDto, @CurrentUser() user: AuthUser) {
    return this.service.updateHoliday(id, dto, user);
  }

  @Delete('holidays/:id')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Eliminar festivo' })
  deleteHoliday(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.deleteHoliday(id, user);
  }

  // ─── UserAvailabilityProfile ───────────────────────────────────────────────

  @Get('availability-profiles/me')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Obtener mi perfil de disponibilidad anual (auto-scope al usuario autenticado)' })
  @ApiQuery({ name: 'year', required: false, type: Number })
  getMyAvailabilityProfile(
    @Query('year', new DefaultValuePipe(0), ParseIntPipe) year: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.getMyAvailabilityProfile(year || undefined, user);
  }

  @Get('availability-profiles')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Listar perfiles de disponibilidad del equipo para un año' })
  @ApiQuery({ name: 'year', required: true, type: Number })
  getTeamAvailabilityProfiles(
    @Query('year', new DefaultValuePipe(0), ParseIntPipe) year: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.getTeamAvailabilityProfiles(year || undefined, user);
  }

  @Post('availability-profiles')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Crear/actualizar (upsert) perfil de disponibilidad anual de un usuario' })
  upsertAvailabilityProfile(@Body() dto: CreateAvailabilityProfileDto, @CurrentUser() user: AuthUser) {
    return this.service.upsertAvailabilityProfile(dto, user);
  }

  @Patch('availability-profiles/:id')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Actualizar perfil de disponibilidad anual' })
  updateAvailabilityProfile(
    @Param('id') id: string, @Body() dto: UpdateAvailabilityProfileDto, @CurrentUser() user: AuthUser,
  ) {
    return this.service.updateAvailabilityProfile(id, dto, user);
  }

  // ─── UserCostProfile ────────────────────────────────────────────────────────

  @Get('cost-profiles/:userId/billing-rate')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Tarifa de facturación sugerida de un usuario (sin desglose de costos)' })
  @ApiQuery({ name: 'year', required: false, type: Number })
  getBillingRate(
    @Param('userId') userId: string,
    @Query('year', new DefaultValuePipe(0), ParseIntPipe) year: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.getBillingRate(userId, year || undefined, user);
  }

  @Get('cost-profiles')
  @Roles(UserRole.CAE)
  @ApiOperation({ summary: 'Listar desglose completo de costeo del equipo para un año' })
  @ApiQuery({ name: 'year', required: true, type: Number })
  getCostProfiles(
    @Query('year', new DefaultValuePipe(0), ParseIntPipe) year: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.getCostProfiles(year || undefined, user);
  }

  @Get('cost-profiles/:userId')
  @Roles(UserRole.CAE)
  @ApiOperation({ summary: 'Desglose completo de costeo de un usuario' })
  @ApiQuery({ name: 'year', required: false, type: Number })
  getCostProfile(
    @Param('userId') userId: string,
    @Query('year', new DefaultValuePipe(0), ParseIntPipe) year: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.getCostProfile(userId, year || undefined, user);
  }

  @Post('cost-profiles')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Crear/actualizar (upsert) perfil de costeo de un usuario' })
  createCostProfile(@Body() dto: CreateCostProfileDto, @CurrentUser() user: AuthUser) {
    return this.service.createCostProfile(dto, user);
  }

  @Patch('cost-profiles/:id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Actualizar perfil de costeo' })
  updateCostProfile(@Param('id') id: string, @Body() dto: UpdateCostProfileDto, @CurrentUser() user: AuthUser) {
    return this.service.updateCostProfile(id, dto, user);
  }
}
