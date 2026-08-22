import {
  Controller, Get, Post, Delete, Body, Param, Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { TimesheetService } from './timesheet.service';
import {
  CreateTimesheetEntryDto, BulkCreateTimesheetEntryDto,
  QueryTimesheetEntriesDto, QueryTimesheetReportDto,
} from './dto/timesheet.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../auth/jwt.strategy';

@ApiTags('Timesheet — Captura General de Horas')
@ApiBearerAuth()
@Controller('timesheet')
export class TimesheetController {
  constructor(private readonly service: TimesheetService) {}

  @Post('entries')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Registrar una entrada de horas (cualquier categoría)' })
  createEntry(@Body() dto: CreateTimesheetEntryDto, @CurrentUser() user: AuthUser) {
    return this.service.createEntry(dto, user);
  }

  @Post('entries/bulk')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Registrar varias entradas de horas en lote (ej. captura semanal)' })
  createEntriesBulk(@Body() dto: BulkCreateTimesheetEntryDto, @CurrentUser() user: AuthUser) {
    return this.service.createEntriesBulk(dto, user);
  }

  @Get('entries')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Listar mis propias entradas de horas (con filtros)' })
  getMyEntries(@Query() query: QueryTimesheetEntriesDto, @CurrentUser() user: AuthUser) {
    return this.service.getMyEntries(query, user);
  }

  @Delete('entries/:id')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Eliminar una entrada de horas propia' })
  deleteEntry(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.deleteEntry(id, user);
  }

  @Get('my-assignments')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Encargos activos asignados al usuario (para el selector semanal)' })
  getMyAssignments(@CurrentUser() user: AuthUser) {
    return this.service.getMyAssignments(user);
  }

  @Get('report')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Reporte consolidado de horas (por usuario, encargo, plan o fecha)' })
  getReport(@Query() query: QueryTimesheetReportDto, @CurrentUser() user: AuthUser) {
    return this.service.getReport(query, user);
  }

  @Get('distribution')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Distribución de horas de una persona en 3 secciones (a clientes/administrativas/otras) con %, para un rango de fechas' })
  getDistribution(
    @Query('userId') userId: string | undefined,
    @Query('dateFrom') dateFrom: string,
    @Query('dateTo') dateTo: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.getDistribution(userId, dateFrom, dateTo, user);
  }

  @Get('attendance')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Calendario diario de un mes: horas a encargos, administrativas, ausencias y festivos' })
  getAttendance(
    @Query('userId') userId: string | undefined,
    @Query('year') year: string,
    @Query('month') month: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.getAttendance(userId, Number(year), Number(month), user);
  }
}
