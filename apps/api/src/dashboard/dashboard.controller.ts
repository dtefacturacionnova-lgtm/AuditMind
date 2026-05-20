import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../auth/jwt.strategy';
import { UserRole } from '@prisma/client';

@ApiTags('Dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  @Get('kpis')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'KPIs principales del dashboard' })
  getKpis(@CurrentUser() user: AuthUser) {
    return this.service.getKpis(user);
  }

  @Get('timeline')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Línea de tiempo de auditorías activas (próximos 3 meses)' })
  getTimeline(@CurrentUser() user: AuthUser) {
    return this.service.getAuditTimeline(user);
  }

  @Get('recent-findings')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Hallazgos abiertos más recientes' })
  getRecentFindings(@CurrentUser() user: AuthUser) {
    return this.service.getRecentFindings(user);
  }

  @Get('upcoming-deadlines')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Vencimientos próximos (PBC, auditorías, recomendaciones)' })
  getUpcomingDeadlines(@CurrentUser() user: AuthUser) {
    return this.service.getUpcomingDeadlines(user);
  }

  @Get('manager')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Dashboard gerencial: carga equipo, aprobaciones, escalamientos' })
  getManagerDashboard(@CurrentUser() user: AuthUser) {
    return this.service.getManagerDashboard(user);
  }

  @Get('my-work')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Dashboard auditor: mis auditorías, hallazgos, PBC, papeles' })
  getMyWorkload(@CurrentUser() user: AuthUser) {
    return this.service.getMyWorkload(user);
  }
}
