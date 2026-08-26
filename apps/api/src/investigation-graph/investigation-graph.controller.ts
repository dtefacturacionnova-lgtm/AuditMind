import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { UserRole } from '@prisma/client';
import { InvestigationGraphService } from './investigation-graph.service';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../auth/jwt.strategy';

class MergeEntitiesBody {
  @IsString()
  loserEntityId: string;

  @IsString()
  survivorEntityId: string;
}

@ApiTags('Grafo de Evidencia')
@ApiBearerAuth()
@Controller('investigation-graph')
export class InvestigationGraphController {
  constructor(private readonly svc: InvestigationGraphService) {}

  @Get('audit-graph/:auditId')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Fase 1 — Grafo de entidades/relaciones extraído de FieldEvidence para un encargo' })
  getAuditGraph(@Param('auditId') auditId: string, @CurrentUser() user: AuthUser) {
    return this.svc.getAuditGraph(auditId, user);
  }

  @Post('audit-graph/:auditId/merge')
  @Roles(UserRole.SENIOR_AUDITOR)
  @ApiOperation({ summary: 'Fase 2a — Fusionar dos entidades duplicadas (mismo tipo): reasigna menciones/relaciones y elimina la entidad perdedora' })
  mergeEntities(
    @Param('auditId') auditId: string,
    @Body() body: MergeEntitiesBody,
    @CurrentUser() user: AuthUser,
  ) {
    return this.svc.mergeEntities(auditId, body.loserEntityId, body.survivorEntityId, user);
  }
}
