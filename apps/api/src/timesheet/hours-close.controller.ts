import { Controller, Get, Post, Put, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { HoursCloseService } from './hours-close.service';
import {
  ClosePeriodDto, CreateAdjustmentDto, DecideAdjustmentDto, HoursCloseSettingsDto, MyPeriodsQueryDto, PeriodQueryDto,
  QueryAdjustmentsDto, RemindPeriodDto, ReopenPeriodDto, PersonPeriodQueryDto,
} from './dto/timesheet.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../auth/jwt.strategy';

/**
 * Cierre de horas por persona y mes. Los auditores registran; un gerente (o superior) cierra, y nadie cierra las propias.
 * El servicio vuelve a comprobar el rol y la regla "quién cierra a quién": el @Roles solo es la primera barrera.
 */
@ApiTags('Timesheet — Cierre de horas')
@ApiBearerAuth()
@Controller('timesheet')
export class HoursCloseController {
  constructor(private readonly service: HoursCloseService) {}

  @Get('periods/settings')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Parámetros del cierre de horas de mi organización' })
  getSettings(@CurrentUser() user: AuthUser) {
    return this.service.getSettings(user);
  }

  @Put('periods/settings')
  @Roles(UserRole.CAE)
  @ApiOperation({ summary: 'Activar o cambiar el cierre de horas (dirección)' })
  updateSettings(@Body() dto: HoursCloseSettingsDto, @CurrentUser() user: AuthUser) {
    return this.service.updateSettings(dto, user);
  }

  @Get('periods/mine')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Estado de cierre de mis meses en un rango (para la captura de horas)' })
  getMyPeriods(@Query() q: MyPeriodsQueryDto, @CurrentUser() user: AuthUser) {
    return this.service.getMyPeriods(q.dateFrom, q.dateTo, user);
  }

  @Get('periods/overview')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Resumen del mes por persona para cerrar: días, horas, avisos y estado' })
  overview(@Query() q: PeriodQueryDto, @CurrentUser() user: AuthUser) {
    return this.service.overview(q.year, q.month, user);
  }

  @Get('periods/entries')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Horas de una persona en un mes (para revisar antes de cerrar; sin costos)' })
  personEntries(@Query() q: PersonPeriodQueryDto, @CurrentUser() user: AuthUser) {
    return this.service.personEntries(q.userId, q.year, q.month, user);
  }

  @Post('periods/close')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Cerrar el mes de una persona (congela costo y tarifa)' })
  close(@Body() dto: ClosePeriodDto, @CurrentUser() user: AuthUser) {
    return this.service.closePeriod(dto, user);
  }

  @Post('periods/reopen')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Reabrir el mes de una persona (con motivo)' })
  reopen(@Body() dto: ReopenPeriodDto, @CurrentUser() user: AuthUser) {
    return this.service.reopenPeriod(dto, user);
  }

  @Post('periods/remind')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Recordar por correo a quienes tienen días sin horas' })
  remind(@Body() dto: RemindPeriodDto, @CurrentUser() user: AuthUser) {
    return this.service.remind(dto, user);
  }

  @Post('adjustments')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Pedir un ajuste de horas de un mes ya cerrado' })
  createAdjustment(@Body() dto: CreateAdjustmentDto, @CurrentUser() user: AuthUser) {
    return this.service.createAdjustment(dto, user);
  }

  @Get('adjustments')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Pedidos de ajuste: los míos, o todos los de la organización si eres gerente' })
  listAdjustments(@Query() q: QueryAdjustmentsDto, @CurrentUser() user: AuthUser) {
    return this.service.listAdjustments(q, user);
  }

  @Post('adjustments/:id/decide')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Aprobar o rechazar un pedido de ajuste' })
  decideAdjustment(@Param('id') id: string, @Body() dto: DecideAdjustmentDto, @CurrentUser() user: AuthUser) {
    return this.service.decideAdjustment(id, dto, user);
  }
}
