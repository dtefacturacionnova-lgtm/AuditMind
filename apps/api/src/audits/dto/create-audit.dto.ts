import {
  IsString, IsOptional, IsEnum, IsDateString, IsNumber,
  IsBoolean, IsArray, Min, Max, ValidateNested,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AuditType } from '@prisma/client';

export class AuditRiskModelDto {
  @ApiProperty({ example: 0.6, description: 'Riesgo Inherente (0-1)' })
  @IsNumber()
  @Min(0) @Max(1)
  inherentRisk: number;

  @ApiProperty({ example: 0.5, description: 'Riesgo de Control (0-1)' })
  @IsNumber()
  @Min(0) @Max(1)
  controlRisk: number;
}

export class MaterialityDto {
  @ApiProperty({ example: 500000, description: 'Base de materialidad' })
  @IsNumber()
  @Min(0)
  base: number;

  @ApiProperty({ example: 'Activos totales' })
  @IsString()
  baseDescription: string;

  @ApiProperty({ example: 2, description: 'Porcentaje aplicado a la base' })
  @IsNumber()
  @Min(0) @Max(100)
  percentage: number;
}

export class CreateAuditDto {
  @ApiProperty({ example: 'Auditoría Financiera Q1 2026' })
  @IsString()
  title: string;

  @ApiProperty({ enum: AuditType, example: 'FINANCIAL' })
  @IsEnum(AuditType)
  type: AuditType;

  @ApiPropertyOptional({ example: 'EEFF_COMPLETO', description: 'Sub-tipo dentro del tipo principal' })
  @IsOptional()
  @IsString()
  subtype?: string;

  @ApiProperty({ example: 'unit-cuid-here' })
  @IsString()
  auditableUnitId: string;

  @ApiProperty({ example: '2026-03-01' })
  @IsDateString()
  startDate: string;

  @ApiProperty({ example: '2026-04-30' })
  @IsDateString()
  endDate: string;

  @ApiPropertyOptional({ example: 200 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  plannedHours?: number;

  @ApiPropertyOptional({ example: 'HIGH' })
  @IsOptional()
  @IsString()
  riskLevel?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  scope?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  objectives?: string;

  @ApiPropertyOptional({ type: MaterialityDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => MaterialityDto)
  materiality?: MaterialityDto;

  @ApiPropertyOptional({ type: AuditRiskModelDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => AuditRiskModelDto)
  auditRiskModel?: AuditRiskModelDto;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isInvestigationMode?: boolean;

  @ApiPropertyOptional({ example: ['user-cuid-1', 'user-cuid-2'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  teamMemberIds?: string[];

  @ApiPropertyOptional({ description: 'ID de la plantilla AuditTemplate a usar en el scaffold' })
  @IsOptional()
  @IsString()
  templateId?: string;

  @ApiPropertyOptional({
    enum: ['FULL', 'STRUCTURE_ONLY'],
    description: 'FULL (default): crea carpetas + todos los papeles. STRUCTURE_ONLY: solo marca la plantilla, sin crear papeles (se agregan a demanda).',
  })
  @IsOptional()
  @IsIn(['FULL', 'STRUCTURE_ONLY'])
  scaffoldMode?: 'FULL' | 'STRUCTURE_ONLY';
}
