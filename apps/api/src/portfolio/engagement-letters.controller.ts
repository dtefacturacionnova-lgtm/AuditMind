import {
  Controller, Post, Patch, Body, Param,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { EngagementLettersService } from './engagement-letters.service';
import {
  CreateEngagementLetterDto, UpdateEngagementLetterDto, SignEngagementLetterDto,
} from './dto/engagement-letter.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../auth/jwt.strategy';

@ApiTags('Cartera — Cartas de Compromiso (NIA 210)')
@ApiBearerAuth()
@Controller('portfolio/engagement-letters')
export class EngagementLettersController {
  constructor(private readonly service: EngagementLettersService) {}

  @Post()
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Emitir carta de compromiso desde una propuesta ACCEPTED' })
  create(@Body() dto: CreateEngagementLetterDto, @CurrentUser() user: AuthUser) {
    return this.service.create(dto, user);
  }

  @Patch(':id')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Editar el texto de la carta antes de firmarla' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateEngagementLetterDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.update(id, dto, user);
  }

  @Post(':id/sign')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Registrar la firma del cliente (→ SIGNED, cliente pasa a ACTIVE)' })
  sign(
    @Param('id') id: string,
    @Body() dto: SignEngagementLetterDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.sign(id, dto, user);
  }
}
