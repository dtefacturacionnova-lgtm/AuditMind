import {
  Controller, Get, Post, Patch, Body, Param, Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { AssessmentsService } from './assessments.service';
import { StandardsService } from './standards.service';
import { StartQaipAssessmentDto, UpdateQaipAssessmentItemDto, DecideQaipAssessmentDto } from './dto/assessment.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../auth/jwt.strategy';

@ApiTags('QAIP y Calidad')
@ApiBearerAuth()
@Controller('qaip')
export class AssessmentsController {
  constructor(
    private readonly service: AssessmentsService,
    private readonly standards: StandardsService,
  ) {}

  @Get('standards')
  @ApiQuery({ name: 'track', required: true, enum: ['IIA_INTERNAL', 'NIGC_EXTERNAL'] })
  @ApiOperation({ summary: 'Catálogo de standards de un track (IIA_INTERNAL o NIGC_EXTERNAL)' })
  listStandards(@Query('track') track: 'IIA_INTERNAL' | 'NIGC_EXTERNAL') {
    return this.standards.listByTrack(track);
  }

  @Get('assessments')
  @ApiQuery({ name: 'track', required: false })
  @ApiOperation({ summary: 'Listar evaluaciones QAIP de la organización' })
  list(@Query('track') track: string | undefined, @CurrentUser() user: AuthUser) {
    return this.service.list(user, track);
  }

  @Get('assessments/:id')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.findOne(id, user);
  }

  @Post('assessments/start')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Iniciar (o recuperar) la autoevaluación del track/período en curso — idempotente' })
  start(@Body() dto: StartQaipAssessmentDto, @CurrentUser() user: AuthUser) {
    return this.service.start(dto, user);
  }

  @Patch('assessment-items/:id')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Calificar un standard individual dentro de una evaluación' })
  updateItem(
    @Param('id') id: string,
    @Body() dto: UpdateQaipAssessmentItemDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.updateItem(id, dto, user);
  }

  @Post('assessments/:id/decide')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Decidir la evaluación: overallResult = peor calificación de todos los standards' })
  decide(
    @Param('id') id: string,
    @Body() dto: DecideQaipAssessmentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.decide(id, dto, user);
  }
}
