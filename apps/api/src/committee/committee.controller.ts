import { Controller, Get, Post, Patch, Query, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CommitteeService } from './committee.service';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../auth/jwt.strategy';
import { UserRole } from '@prisma/client';
import { PeriodType } from './period.util';

@ApiTags('Comité de Auditoría')
@ApiBearerAuth()
@Controller('committee')
export class CommitteeController {
  constructor(private readonly service: CommitteeService) {}

  @Get('dashboard')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Dashboard enriquecido del Comité de Auditoría por período' })
  getDashboard(
    @CurrentUser() user: AuthUser,
    @Query('periodType') periodType: string,
    @Query('period') period?: string,
  ) {
    return this.service.getDashboard(user, periodType, period);
  }

  @Get('periods')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Últimos períodos disponibles para el selector, con su estado congelado/en vivo' })
  listPeriods(
    @CurrentUser() user: AuthUser,
    @Query('periodType') periodType: string,
  ) {
    const type: PeriodType = ['MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL'].includes(periodType)
      ? (periodType as PeriodType) : 'QUARTERLY';
    return this.service.listPeriods(user, type);
  }

  @Post('snapshot')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Cerrar y congelar el corte del período actual para presentarlo al comité' })
  publishSnapshot(
    @CurrentUser() user: AuthUser,
    @Body() body: { periodType: string; period: string },
  ) {
    return this.service.publishSnapshot(user, body.periodType, body.period);
  }

  @Get('settings')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Frecuencia de corte configurada para el Comité' })
  async getSettings(@CurrentUser() user: AuthUser) {
    return { cutFrequency: await this.service.getCutFrequency(user.organizationId) };
  }

  @Patch('settings')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Configurar la frecuencia de corte del Comité' })
  async updateSettings(
    @CurrentUser() user: AuthUser,
    @Body() body: { cutFrequency: PeriodType },
  ) {
    await this.service.setCutFrequency(user.organizationId, body.cutFrequency);
    return { cutFrequency: body.cutFrequency };
  }
}
