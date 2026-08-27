import { Controller, Get, Post, Patch, Delete, Body, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CompetenciesService } from './competencies.service';
import {
  CreateCertificationDto, CreateCompetencyDto, UpdateCompetencyDto, CreateCpeRecordDto,
} from './dto/competency.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../auth/jwt.strategy';

@ApiTags('QAIP y Calidad — Competencias/CPE')
@ApiBearerAuth()
@Controller('qaip/competencies')
export class CompetenciesController {
  constructor(private readonly service: CompetenciesService) {}

  @Get()
  @ApiOperation({ summary: 'Roster de competencias/CPE de toda la firma (AUDIT_MANAGER+)' })
  getRoster(@CurrentUser() user: AuthUser) {
    return this.service.getRoster(user);
  }

  @Get('me')
  @ApiOperation({ summary: 'Mi propio perfil de competencias/CPE' })
  getMyProfile(@CurrentUser() user: AuthUser) {
    return this.service.getProfile(user.id, user);
  }

  @Get(':userId')
  @ApiOperation({ summary: 'Perfil de competencias/CPE de un usuario (propio o, con rol AUDIT_MANAGER+, cualquiera de la organización)' })
  getProfile(@Param('userId') userId: string, @CurrentUser() user: AuthUser) {
    return this.service.getProfile(userId, user);
  }

  @Post(':userId/certifications')
  @ApiOperation({ summary: 'Registrar una certificación profesional (CIA, CISA, CFE, ...)' })
  addCertification(
    @Param('userId') userId: string,
    @Body() dto: CreateCertificationDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.addCertification(userId, dto, user);
  }

  @Delete('certifications/:id')
  removeCertification(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.removeCertification(id, user);
  }

  @Post(':userId/skills')
  @ApiOperation({ summary: 'Registrar un área de competencia (matriz de habilidades)' })
  addCompetency(
    @Param('userId') userId: string,
    @Body() dto: CreateCompetencyDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.addCompetency(userId, dto, user);
  }

  @Patch('skills/:id')
  updateCompetency(
    @Param('id') id: string,
    @Body() dto: UpdateCompetencyDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.updateCompetency(id, dto, user);
  }

  @Delete('skills/:id')
  removeCompetency(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.removeCompetency(id, user);
  }

  @Post(':userId/cpe')
  @ApiOperation({ summary: 'Registrar horas de educación profesional continua (CPE)' })
  addCpeRecord(
    @Param('userId') userId: string,
    @Body() dto: CreateCpeRecordDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.addCpeRecord(userId, dto, user);
  }

  @Delete('cpe/:id')
  removeCpeRecord(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.removeCpeRecord(id, user);
  }
}
