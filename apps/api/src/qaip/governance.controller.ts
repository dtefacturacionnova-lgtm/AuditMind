import { Controller, Get, Post, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { GovernanceService } from './governance.service';
import { UpsertIndependenceDeclarationDto, CreateAuditCharterDto } from './dto/governance.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../auth/jwt.strategy';

@ApiTags('QAIP y Calidad')
@ApiBearerAuth()
@Controller('qaip')
export class GovernanceController {
  constructor(private readonly service: GovernanceService) {}

  @Get('independence-declarations')
  listIndependence(@CurrentUser() user: AuthUser) {
    return this.service.listIndependenceDeclarations(user);
  }

  @Post('independence-declarations')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Firmar (o actualizar) la declaración de independencia del año en curso' })
  upsertIndependence(@Body() dto: UpsertIndependenceDeclarationDto, @CurrentUser() user: AuthUser) {
    return this.service.upsertIndependenceDeclaration(dto, user);
  }

  @Get('charters')
  listCharters(@CurrentUser() user: AuthUser) {
    return this.service.listCharters(user);
  }

  @Post('charters')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Aprobar una nueva versión del estatuto de auditoría' })
  createCharter(@Body() dto: CreateAuditCharterDto, @CurrentUser() user: AuthUser) {
    return this.service.createCharter(dto, user);
  }
}
