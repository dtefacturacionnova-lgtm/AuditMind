import {
  Controller, Get, Post, Patch, Body, Param,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { AcceptanceService } from './acceptance.service';
import { UpdateAcceptanceCheckDto, DecideAcceptanceDto } from './dto/acceptance.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../auth/jwt.strategy';

@ApiTags('Cartera — Radar de Aceptación (NIA 220 / ISQM 1)')
@ApiBearerAuth()
@Controller('portfolio')
export class AcceptanceController {
  constructor(private readonly service: AcceptanceService) {}

  @Get('acceptance-checks/competence-summary')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({
    summary: 'Resumen real de competencia/CPE/recursos de la firma — evidencia de referencia para la dimensión "Competencia y Recursos" (no fija la calificación)',
  })
  getCompetenceSummary(@CurrentUser() user: AuthUser) {
    return this.service.getCompetenceSummary(user);
  }

  @Post('clients/:id/start-acceptance')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({
    summary: 'Iniciar el Radar de Aceptación del año en curso (idempotente) y pasar el cliente a IN_ACCEPTANCE',
  })
  start(@Param('id') clientId: string, @CurrentUser() user: AuthUser) {
    return this.service.startAcceptance(clientId, user);
  }

  @Patch('acceptance-checks/:id')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Actualizar dimensiones (status/notes) y/o checklist del Radar' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateAcceptanceCheckDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.update(id, dto, user);
  }

  @Post('acceptance-checks/:id/decide')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Decidir aceptación: overallResult = peor de las 5 dimensiones (RED ⇒ cliente DECLINED)' })
  decide(
    @Param('id') id: string,
    @Body() dto: DecideAcceptanceDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.decide(id, dto, user);
  }

  @Post('acceptance-checks/:id/screen-sanctions')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({
    summary: 'Screening de sanciones (OFAC/ONU/UK) sobre el cliente — razón social, representante legal y beneficiarios finales (Art. 15 DDC, Ley PLD/FT/FP)',
  })
  screenSanctions(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.screenSanctions(id, user);
  }
}
