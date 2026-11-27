import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuthUser } from '../../auth/jwt.strategy';
import { AuditVisitsService } from './audit-visits.service';
import { CreateBridgeStepsDto, EnableVisitsDto, ImportVisitBalanceDto, UpdateVisitDto } from './dto/visits.dto';

/** Visitas del encargo (planificación, interina y final). Mismo prefijo `audits` que el resto de las rutas del encargo. */
@ApiTags('Visitas de auditoría')
@ApiBearerAuth()
@Controller('audits')
export class AuditVisitsController {
  constructor(private readonly service: AuditVisitsService) {}

  @Get(':id/visits')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Visitas del encargo con el resumen del balance vigente de cada una' })
  list(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.list(id, user);
  }

  @Post(':id/visits')
  @Roles(UserRole.AUDIT_MANAGER)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Activar las visitas del encargo: crea planificación, interina y final con sus fechas de corte' })
  enable(@Param('id') id: string, @Body() dto: EnableVisitsDto, @CurrentUser() user: AuthUser) {
    return this.service.enable(id, dto, user);
  }

  @Get(':id/visits/compare')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Comparar el balance de dos visitas por código de cuenta (nuevas, desaparecidas, en cero, variación)' })
  @ApiQuery({ name: 'from', enum: ['PLANNING', 'INTERIM', 'FINAL'] })
  @ApiQuery({ name: 'to', enum: ['PLANNING', 'INTERIM', 'FINAL'] })
  compare(@Param('id') id: string, @Query('from') from: string, @Query('to') to: string, @CurrentUser() user: AuthUser) {
    return this.service.compare(id, from, to, user);
  }

  @Get(':id/visits/bridge')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Puente interina → final por cuenta: movimiento, esperado de resultados, alertas y pasos ROLLFORWARD sugeridos (referencia, no conclusión)' })
  @ApiQuery({ name: 'pct', required: false, description: 'Variación mínima (%) sobre el esperado para alertar en cuentas de resultados. Por defecto 20.' })
  bridge(@Param('id') id: string, @Query('pct') pct: string | undefined, @CurrentUser() user: AuthUser) {
    return this.service.bridge(id, pct, user);
  }

  @Get(':id/visits/bridge/targets')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Cuadrículas de procedimientos del encargo donde se pueden crear los pasos de período restante' })
  bridgeTargets(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.bridgeTargets(id, user);
  }

  @Post(':id/visits/bridge/steps')
  @Roles(UserRole.AUDITOR)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Aceptar los pasos ROLLFORWARD sugeridos de las cuentas elegidas (el texto lo arma el servidor; uno por cuenta)' })
  createBridgeSteps(@Param('id') id: string, @Body() dto: CreateBridgeStepsDto, @CurrentUser() user: AuthUser) {
    return this.service.createBridgeSteps(id, dto, user);
  }

  @Patch('visits/:visitId')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Cambiar fecha de corte, estado, notas o la base de análisis de una visita' })
  update(@Param('visitId') visitId: string, @Body() dto: UpdateVisitDto, @CurrentUser() user: AuthUser) {
    return this.service.update(visitId, dto, user);
  }

  @Get('visits/:visitId/trial-balance')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Cuentas del balance vigente de una visita (normalizadas: una fila por código)' })
  balanceOf(@Param('visitId') visitId: string, @CurrentUser() user: AuthUser) {
    return this.service.balanceOf(visitId, user);
  }

  @Post('visits/:visitId/trial-balance')
  @Roles(UserRole.AUDITOR)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Cargar el balance de comprobación de una visita (no pisa el anterior: la carga más reciente es la vigente)' })
  importBalance(@Param('visitId') visitId: string, @Body() dto: ImportVisitBalanceDto, @CurrentUser() user: AuthUser) {
    return this.service.importBalance(visitId, dto, user);
  }
}
