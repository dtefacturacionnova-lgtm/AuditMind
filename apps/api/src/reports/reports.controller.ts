import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../auth/jwt.strategy';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('Reports')
@ApiBearerAuth()
@Controller('reports')
export class ReportsController {
  constructor(private readonly service: ReportsService) {}

  @Get()
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Listar auditorías disponibles para generar informe' })
  listAvailable(@CurrentUser() user: AuthUser) {
    return this.service.listAvailableReports(user);
  }

  @Get('audit/:id')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Datos completos para informe de auditoría' })
  getAuditReport(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.getAuditReport(id, user);
  }
}
