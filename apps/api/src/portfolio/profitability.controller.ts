import { Controller, Get, Param, Query, DefaultValuePipe, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { ProfitabilityService } from './profitability.service';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../auth/jwt.strategy';

/**
 * Rentabilidad por encargo — revela indirectamente la estructura de costos
 * (tasas de costo/hora, derivadas de salarios) del equipo. Mismo nivel de
 * sensibilidad que el desglose completo de costeo ya construido en
 * `apps/api/src/capacity/` (`GET /capacity/cost-profiles*`): gateado a
 * `UserRole.CAE` — la jerarquía acumulativa de `RolesGuard` deja pasar
 * también a ADMIN/SUPER_ADMIN, nadie por debajo.
 */
@ApiTags('Cartera — Rentabilidad')
@ApiBearerAuth()
@Controller('portfolio')
export class ProfitabilityController {
  constructor(private readonly service: ProfitabilityService) {}

  @Get('engagements/:id/profitability')
  @Roles(UserRole.CAE)
  @ApiOperation({
    summary: 'Rentabilidad de un encargo: ingreso vs. costo real por persona/año, margen $ y %',
  })
  getEngagementProfitability(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.getEngagementProfitability(id, user);
  }

  @Get('profitability')
  @Roles(UserRole.CAE)
  @ApiOperation({
    summary: 'Rentabilidad resumida de todos los encargos aprobados de un ejercicio fiscal',
  })
  @ApiQuery({ name: 'year', required: true, type: Number })
  listProfitability(
    @Query('year', new DefaultValuePipe(0), ParseIntPipe) year: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.listProfitability(year || undefined, user);
  }
}
