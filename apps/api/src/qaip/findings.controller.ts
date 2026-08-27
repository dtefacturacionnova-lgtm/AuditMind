import {
  Controller, Get, Post, Patch, Body, Param, Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { FindingsService } from './findings.service';
import {
  CreateQaipFindingDto, UpdateQaipFindingStatusDto,
  CreateQaipRootCauseDto, CreateQaipRemediationActionDto, UpdateQaipRemediationActionDto,
} from './dto/finding.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../auth/jwt.strategy';

@ApiTags('QAIP y Calidad')
@ApiBearerAuth()
@Controller('qaip')
export class FindingsController {
  constructor(private readonly service: FindingsService) {}

  @Get('findings')
  @ApiQuery({ name: 'track', required: false })
  @ApiQuery({ name: 'status', required: false })
  list(
    @Query('track') track: string | undefined,
    @Query('status') status: string | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.list(user, track, status);
  }

  @Post('findings')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Registrar un hallazgo de calidad (de una autoevaluación, EQR, Comité, o ad-hoc)' })
  create(@Body() dto: CreateQaipFindingDto, @CurrentUser() user: AuthUser) {
    return this.service.create(dto, user);
  }

  @Patch('findings/:id/status')
  @Roles(UserRole.AUDIT_MANAGER)
  updateStatus(@Param('id') id: string, @Body() dto: UpdateQaipFindingStatusDto, @CurrentUser() user: AuthUser) {
    return this.service.updateStatus(id, dto, user);
  }

  @Post('findings/:id/root-causes')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Documentar la causa raíz del hallazgo (NIGC 1 componente 8 — obligatorio)' })
  addRootCause(@Param('id') id: string, @Body() dto: CreateQaipRootCauseDto, @CurrentUser() user: AuthUser) {
    return this.service.addRootCause(id, dto, user);
  }

  @Post('findings/:id/remediation-actions')
  @Roles(UserRole.AUDIT_MANAGER)
  addRemediationAction(@Param('id') id: string, @Body() dto: CreateQaipRemediationActionDto, @CurrentUser() user: AuthUser) {
    return this.service.addRemediationAction(id, dto, user);
  }

  @Patch('remediation-actions/:id')
  @Roles(UserRole.AUDIT_MANAGER)
  updateRemediationAction(@Param('id') id: string, @Body() dto: UpdateQaipRemediationActionDto, @CurrentUser() user: AuthUser) {
    return this.service.updateRemediationAction(id, dto, user);
  }
}
