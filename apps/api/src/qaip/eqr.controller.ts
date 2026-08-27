import { Controller, Get, Post, Patch, Body, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { EqrService } from './eqr.service';
import { AssignEqrReviewerDto, UpdateEqrChecklistDto, CompleteEqrDto } from './dto/eqr.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../auth/jwt.strategy';

@ApiTags('QAIP y Calidad')
@ApiBearerAuth()
@Controller('qaip/eqr')
export class EqrController {
  constructor(private readonly service: EqrService) {}

  @Get(':auditId')
  get(@Param('auditId') auditId: string, @CurrentUser() user: AuthUser) {
    return this.service.get(auditId, user);
  }

  @Post(':auditId/require')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Marcar el encargo como que requiere Revisión de Calidad del Encargo (NIGC 2) — bloquea el sign-off final hasta completarse' })
  require(@Param('auditId') auditId: string, @CurrentUser() user: AuthUser) {
    return this.service.require(auditId, user);
  }

  @Patch(':auditId/reviewer')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Asignar el revisor independiente — valida contra el equipo del encargo' })
  assignReviewer(@Param('auditId') auditId: string, @Body() dto: AssignEqrReviewerDto, @CurrentUser() user: AuthUser) {
    return this.service.assignReviewer(auditId, dto, user);
  }

  @Patch(':auditId/checklist')
  @Roles(UserRole.AUDIT_MANAGER)
  updateChecklist(@Param('auditId') auditId: string, @Body() dto: UpdateEqrChecklistDto, @CurrentUser() user: AuthUser) {
    return this.service.updateChecklist(auditId, dto, user);
  }

  @Post(':auditId/complete')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Completar la EQR — desbloquea el sign-off final del encargo' })
  complete(@Param('auditId') auditId: string, @Body() dto: CompleteEqrDto, @CurrentUser() user: AuthUser) {
    return this.service.complete(auditId, dto, user);
  }
}
