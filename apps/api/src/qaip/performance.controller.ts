import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { PerformanceService } from './performance.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../auth/jwt.strategy';

@ApiTags('QAIP y Calidad')
@ApiBearerAuth()
@Controller('qaip')
export class PerformanceController {
  constructor(private readonly service: PerformanceService) {}

  @Get('performance')
  @ApiQuery({ name: 'year', required: false })
  @ApiOperation({ summary: 'Tablero de KPIs de desempeño (Std. 12.2) — calculado, sin datos nuevos del usuario' })
  getDashboard(@Query('year') year: string | undefined, @CurrentUser() user: AuthUser) {
    return this.service.getDashboard(user, year ? Number(year) : new Date().getFullYear());
  }
}
