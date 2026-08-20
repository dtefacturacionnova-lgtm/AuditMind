import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, HttpCode, HttpStatus,
  UseInterceptors, UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes } from '@nestjs/swagger';
import { IsString, IsArray, IsBoolean, IsNumber, IsOptional, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ProcStatus, StepStatus, StepConclusion, TestType, AuditNature, AuditTiming,
} from '@prisma/client';
import { AuditProceduresService } from './audit-procedures.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../auth/jwt.strategy';

// ─── DTOs ──────────────────────────────────────────────────────────────────

class CreateProcedureDto {
  @ApiProperty()
  @IsString()
  refNumber: string;

  @ApiProperty()
  @IsString()
  description: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  assertions?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  significantRisk?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  rmmLevel?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  rmmRiskRef?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  wpRef?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  sortOrder?: number;
}

class UpdateProcedureDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  refNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  assertions?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  significantRisk?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  rmmLevel?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  rmmRiskRef?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  wpRef?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  conclusionText?: string;

  @ApiPropertyOptional({ enum: ProcStatus })
  @IsOptional()
  @IsEnum(ProcStatus)
  status?: ProcStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  sortOrder?: number;
}

class CreateStepDto {
  @ApiProperty()
  @IsString()
  refNumber: string;

  @ApiProperty()
  @IsString()
  description: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  assertions?: string[];

  @ApiPropertyOptional({ enum: TestType })
  @IsOptional()
  @IsEnum(TestType)
  testType?: TestType;

  @ApiPropertyOptional({ enum: AuditNature })
  @IsOptional()
  @IsEnum(AuditNature)
  nature?: AuditNature;

  @ApiPropertyOptional({ enum: AuditTiming })
  @IsOptional()
  @IsEnum(AuditTiming)
  timing?: AuditTiming;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  extent?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  population?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  performedByName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  performedByInitials?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  performedById?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  datePerformed?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reviewedByName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reviewedByInitials?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reviewedById?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  dateReviewed?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  wpRef?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  resultDescription?: string;

  @ApiPropertyOptional({ enum: StepConclusion })
  @IsOptional()
  @IsEnum(StepConclusion)
  conclusion?: StepConclusion;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  exceptionText?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  exceptionAmount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  difRef?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  hoursPlanned?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  hoursActual?: number;

  @ApiPropertyOptional({ enum: StepStatus })
  @IsOptional()
  @IsEnum(StepStatus)
  status?: StepStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  sortOrder?: number;
}

class UpdateStepDto extends CreateStepDto {}

// ─── Controller ────────────────────────────────────────────────────────────

@ApiTags('Programa de Auditoría — Procedimientos')
@ApiBearerAuth()
@Controller('audit-procedures')
export class AuditProceduresController {
  constructor(private readonly svc: AuditProceduresService) {}

  // Procedures

  @Get('section/:sectionId')
  @ApiOperation({ summary: 'Listar procedimientos de una sección PROCEDURE_GRID' })
  getProcedures(
    @Param('sectionId') sectionId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.svc.getProcedures(sectionId, user);
  }

  @Post('section/:sectionId')
  @ApiOperation({ summary: 'Crear procedimiento (nivel 1)' })
  createProcedure(
    @Param('sectionId') sectionId: string,
    @Body() dto: CreateProcedureDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.svc.createProcedure(sectionId, dto, user);
  }

  @Get('section/:sectionId/audit-papers')
  @ApiOperation({ summary: 'Listar papeles del encargo para referencia cruzada' })
  getAuditPapers(
    @Param('sectionId') sectionId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.svc.getAuditPapersForSection(sectionId, user);
  }

  @Get('section/:sectionId/audit-risks')
  @ApiOperation({ summary: 'Listar riesgos registrados en el encargo (PT-A2 S5) para vincular' })
  getAuditRisks(
    @Param('sectionId') sectionId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.svc.getAuditRisksForSection(sectionId, user);
  }

  @Post('section/:sectionId/ai-suggest')
  @ApiOperation({ summary: 'Generar procedimientos automáticamente con IA (Gemini)' })
  aiSuggest(
    @Param('sectionId') sectionId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.svc.suggestAndCreateProcedures(sectionId, user);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar procedimiento' })
  updateProcedure(
    @Param('id') id: string,
    @Body() dto: UpdateProcedureDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.svc.updateProcedure(id, dto, user);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar procedimiento y sus actividades' })
  deleteProcedure(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.svc.deleteProcedure(id, user);
  }

  // Steps

  @Post(':procedureId/steps')
  @ApiOperation({ summary: 'Crear actividad (nivel 2) en un procedimiento' })
  createStep(
    @Param('procedureId') procedureId: string,
    @Body() dto: CreateStepDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.svc.createStep(procedureId, dto, user);
  }

  @Patch('steps/:stepId')
  @ApiOperation({ summary: 'Actualizar actividad' })
  updateStep(
    @Param('stepId') stepId: string,
    @Body() dto: UpdateStepDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.svc.updateStep(stepId, dto, user);
  }

  @Delete('steps/:stepId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar actividad' })
  deleteStep(
    @Param('stepId') stepId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.svc.deleteStep(stepId, user);
  }

  // Evidence

  @Post('steps/:stepId/evidences')
  @ApiOperation({ summary: 'Subir archivo de evidencia a una actividad' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 25 * 1024 * 1024 } }))
  createEvidence(
    @Param('stepId') stepId: string,
    @UploadedFile() file: { buffer: Buffer; originalname: string; mimetype: string; size: number },
    @CurrentUser() user: AuthUser,
  ) {
    return this.svc.createEvidence(stepId, file, user);
  }

  @Delete('steps/:stepId/evidences/:evidenceId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar archivo de evidencia' })
  deleteEvidence(
    @Param('stepId') stepId: string,
    @Param('evidenceId') evidenceId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.svc.deleteEvidence(evidenceId, stepId, user);
  }
}
