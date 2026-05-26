import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, ParseIntPipe, DefaultValuePipe, HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { AuditProjectsService } from './audit-projects.service';
import { CreateAuditProjectDto, UpdateAuditProjectDto } from './dto/audit-project.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../auth/jwt.strategy';
import { UserRole } from '@prisma/client';

@ApiTags('Banco de Proyectos')
@ApiBearerAuth()
@Controller('audit-projects')
export class AuditProjectsController {
  constructor(private readonly service: AuditProjectsService) {}

  @Get('stats')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Get project statistics' })
  getStats(@CurrentUser() user: AuthUser) {
    return this.service.getStats(user);
  }

  @Get()
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'List all audit projects' })
  @ApiQuery({ name: 'year',      required: false, type: Number })
  @ApiQuery({ name: 'riskLevel', required: false, type: String })
  @ApiQuery({ name: 'search',    required: false, type: String })
  findAll(
    @CurrentUser() user: AuthUser,
    @Query('year',      new DefaultValuePipe(0), ParseIntPipe) year?: number,
    @Query('riskLevel') riskLevel?: string,
    @Query('search')    search?: string,
  ) {
    return this.service.findAll(user, year || undefined, riskLevel, search);
  }

  @Post('sync-coverage')
  @Roles(UserRole.AUDIT_MANAGER)
  @HttpCode(200)
  @ApiOperation({ summary: 'Sync lastAuditAge from real closed audit history' })
  syncCoverage(@CurrentUser() user: AuthUser) {
    return this.service.syncCoverage(user);
  }

  @Get(':id')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Get single audit project' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Create audit project' })
  create(@Body() dto: CreateAuditProjectDto, @CurrentUser() user: AuthUser) {
    return this.service.create(dto, user);
  }

  @Patch(':id')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Update audit project' })
  update(@Param('id') id: string, @Body() dto: UpdateAuditProjectDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Delete audit project' })
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
