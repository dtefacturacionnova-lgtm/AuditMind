import {
  Controller, Post, Patch, Body, Param,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { ProposalsService } from './proposals.service';
import { CreateProposalDto, UpdateProposalDto } from './dto/proposal.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../auth/jwt.strategy';

@ApiTags('Cartera — Propuestas')
@ApiBearerAuth()
@Controller('portfolio/proposals')
export class ProposalsController {
  constructor(private readonly service: ProposalsService) {}

  @Post()
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({
    summary: 'Crear propuesta (exige Radar de Aceptación del año en GREEN o YELLOW)',
  })
  create(@Body() dto: CreateProposalDto, @CurrentUser() user: AuthUser) {
    return this.service.create(dto, user);
  }

  @Post(':id/generate-draft')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Generar borrador IA de la propuesta (fallback a plantilla si la IA no responde)' })
  generateDraft(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.generateDraft(id, user);
  }

  @Patch(':id')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Editar la propuesta (incluye finalContent) antes de enviarla' })
  update(@Param('id') id: string, @Body() dto: UpdateProposalDto, @CurrentUser() user: AuthUser) {
    return this.service.update(id, dto, user);
  }

  @Post(':id/send')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Enviar propuesta (DRAFT → SENT)' })
  send(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.send(id, user);
  }

  @Post(':id/accept')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Registrar aceptación del cliente (SENT → ACCEPTED)' })
  accept(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.accept(id, user);
  }

  @Post(':id/reject')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Registrar rechazo del cliente (SENT → REJECTED, cliente vuelve a IN_ACCEPTANCE)' })
  reject(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.reject(id, user);
  }
}
