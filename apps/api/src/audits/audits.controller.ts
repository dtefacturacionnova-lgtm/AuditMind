import {
  Controller, Get, Post, Patch, Delete, Body, Param,
  Query, ParseIntPipe, DefaultValuePipe,
  UseInterceptors, UploadedFile, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { IsString, IsOptional, IsBoolean, IsArray, ValidateNested, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';

class RollForwardDto {
  @IsString() title!: string;
  @IsOptional() @IsString() startDate?: string;
  @IsOptional() @IsString() endDate?: string;
  @IsOptional() @IsBoolean() carryOpenFindings?: boolean;
}

class TbAccountDto {
  @IsString() code!: string;
  @IsString() name!: string;
  @IsNumber() @Min(0) debit!: number;
  @IsNumber() @Min(0) credit!: number;
  @IsNumber() balance!: number;
}

class ImportTrialBalanceDto {
  @IsString() filename!: string;
  @IsString() periodLabel!: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => TbAccountDto) accounts!: TbAccountDto[];
}

class LinkTbDto {
  @IsString() paperId!: string;
  @IsArray() @IsString({ each: true }) accountCodes!: string[];
  @IsOptional() @IsString() note?: string;
}
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { AuditsService } from './audits.service';
import { CreateAuditDto } from './dto/create-audit.dto';
import { UpdateAuditDto, UpdateAuditStatusDto } from './dto/update-audit.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../auth/jwt.strategy';
import { UserRole } from '@prisma/client';

@ApiTags('Auditorías')
@ApiBearerAuth()
@Controller('audits')
export class AuditsController {
  constructor(private readonly service: AuditsService) {}

  @Post()
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Crear nueva auditoría' })
  create(@Body() dto: CreateAuditDto, @CurrentUser() user: AuthUser) {
    return this.service.create(dto, user);
  }

  @Get()
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Listar auditorías' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiQuery({ name: 'type',    required: false, type: String })
  @ApiQuery({ name: 'subtype', required: false, type: String })
  findAll(
    @CurrentUser() user: AuthUser,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('search')  search?:  string,
    @Query('status')  status?:  string,
    @Query('type')    type?:    string,
    @Query('subtype') subtype?: string,
  ) {
    return this.service.findAll(user, page, limit, search, status, type, subtype);
  }

  @Get(':id')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Obtener auditoría con detalle completo' })
  findOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.findOne(id, user);
  }

  @Get(':id/progress')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Progreso de la auditoría' })
  getProgress(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.getProgress(id, user);
  }

  @Patch(':id')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Actualizar auditoría' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateAuditDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.update(id, dto, user);
  }

  @Patch(':id/status')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Cambiar estado de auditoría con validación de transición' })
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateAuditStatusDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.updateStatus(id, dto, user);
  }

  // ─── F6.1 Roll-forward ────────────────────────────────────────────────────────
  @Post(':id/roll-forward')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'F6.1 — Roll-forward: crea nueva auditoría copiando estructura de la anterior' })
  rollForward(
    @Param('id') id: string,
    @Body() dto: RollForwardDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.rollForward(id, dto, user);
  }

  // ─── F6.7 Trial Balance ───────────────────────────────────────────────────────
  @Post(':id/trial-balance')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'F6.7 — Importar balance de comprobación CSV (parsed client-side)' })
  importTrialBalance(
    @Param('id') id: string,
    @Body() dto: ImportTrialBalanceDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.importTrialBalance(id, dto, user);
  }

  @Get(':id/trial-balance')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'F6.7 — Listar balances de comprobación de una auditoría' })
  listTrialBalances(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.listTrialBalances(id, user);
  }

  @Get('trial-balance/:tbId')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'F6.7 — Obtener balance de comprobación completo con cuentas' })
  getTrialBalance(@Param('tbId') tbId: string, @CurrentUser() user: AuthUser) {
    return this.service.getTrialBalance(tbId, user);
  }

  @Post('trial-balance/:tbId/link')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'F6.7 — Vincular cuentas del balance a un papel de trabajo' })
  linkTrialBalance(
    @Param('tbId') tbId: string,
    @Body() dto: LinkTbDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.linkTrialBalanceToPaper(tbId, dto.paperId, dto.accountCodes, dto.note, user);
  }

  @Delete('trial-balance/:tbId')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'F6.7 — Eliminar balance de comprobación' })
  deleteTrialBalance(@Param('tbId') tbId: string, @CurrentUser() user: AuthUser) {
    return this.service.deleteTrialBalance(tbId, user);
  }

  // ─── PI.7b — Benford analysis sobre Trial Balance ─────────────────────────
  @Post('trial-balance/:tbId/benford')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'PI.7b — Ejecutar análisis de Ley de Benford sobre los saldos del TB' })
  runBenfordOnTrialBalance(@Param('tbId') tbId: string, @CurrentUser() user: AuthUser) {
    return this.service.runBenfordOnTrialBalance(tbId, user);
  }

  @Get('trial-balance/:tbId/benford')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'PI.7b — Obtener el último resultado Benford persistido' })
  getBenfordResult(@Param('tbId') tbId: string, @CurrentUser() user: AuthUser) {
    return this.service.getBenfordResult(tbId, user);
  }

  // ─── PI.7d — AI Tests Orchestrator ────────────────────────────────────────
  @Post(':id/run-ai-tests')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'PI.7d — Ejecutar todas las pruebas IA disponibles sobre esta auditoría' })
  runAiTests(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.runAiTests(id, user);
  }

  @Get(':id/ai-tests-report')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'PI.7d — Obtener el último reporte de pruebas IA persistido' })
  getAiTestsReport(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.getAiTestsReport(id, user);
  }

  // ─── Papeles disponibles desde plantilla ─────────────────────────────────────

  @Get(':id/available-template-papers')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Lista los papeles de la plantilla que aún no se han creado en la auditoría' })
  getAvailableTemplatePapers(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.getAvailableTemplatePapers(id, user);
  }

  @Post(':id/add-template-paper')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Agrega un papel específico desde la plantilla al expediente' })
  addTemplatePaper(
    @Param('id') id: string,
    @Body() body: { code: string },
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.addPaperFromTemplate(id, body.code, user);
  }

  // ─── Documentos de soporte — Auditorías Imprevistas ──────────────────────────

  @Get(':id/request-documents')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Listar documentos de soporte de la solicitud imprevista' })
  listRequestDocuments(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.listRequestDocuments(id, user);
  }

  @Post(':id/request-documents')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({
    summary: 'Subir documento de soporte para auditoría imprevista',
    description: 'multipart/form-data: campo "file" (PDF/Word/Excel/imagen). Campo opcional "description".',
  })
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  async addRequestDocument(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('description') description: string | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    if (!file) throw new BadRequestException('Campo "file" requerido');
    return this.service.addRequestDocument(id, file, description, user);
  }

  @Delete(':id/request-documents/:docId')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Eliminar documento de soporte de la solicitud imprevista' })
  removeRequestDocument(
    @Param('id') id: string,
    @Param('docId') docId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.removeRequestDocument(id, docId, user);
  }
}
