import {
  IsString, IsInt, IsOptional, IsNumber, IsDateString, IsArray, Min, Max, ArrayNotEmpty, IsEnum,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TimeEntryCategory } from '@prisma/client';

export class CreatePlanDto {
  @ApiProperty({ example: 2026 })
  @IsInt()
  year: number;

  @ApiProperty({ example: 'Plan Anual de Auditoría 2026' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ example: 1800 })
  @IsOptional()
  @IsNumber()
  totalHours?: number;

  @ApiPropertyOptional({ type: [String], example: ['Fortalecer cobertura de procesos TI'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  objectives?: string[];
}

export class UpdatePlanDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  totalHours?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  objectives?: string[];

  @ApiPropertyOptional({ description: 'Historial de cambios del plan (JSON array)' })
  @IsOptional()
  @IsArray()
  amendments?: any[];
}

export class CreatePlanItemDto {
  @ApiProperty({ example: 'ent-06' })
  @IsString()
  auditEntityId: string;

  @ApiProperty({ example: 320 })
  @IsNumber()
  estimatedHours: number;

  @ApiPropertyOptional({ example: '2026-01-15' })
  @IsOptional()
  @IsDateString()
  tentativeStartDate?: string;

  @ApiPropertyOptional({ example: '2026-03-31' })
  @IsOptional()
  @IsDateString()
  tentativeEndDate?: string;

  @ApiPropertyOptional({ example: 1, description: '1=Alta, 2=Media, 3=Baja' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3)
  priority?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdatePlanItemDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  estimatedHours?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  tentativeStartDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  tentativeEndDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3)
  priority?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: 'Nombre del auditor líder responsable' })
  @IsOptional()
  @IsString()
  responsibleName?: string;

  @ApiPropertyOptional({ description: 'Notas de equipo asignado' })
  @IsOptional()
  @IsString()
  teamNotes?: string;
}

export class CreateTimeEntryDto {
  @ApiProperty()
  @IsOptional()
  @IsString()
  auditId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  planItemId?: string;

  @ApiProperty()
  @IsDateString()
  workDate: string;

  @ApiProperty({ example: 8 })
  @IsNumber()
  hours: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: TimeEntryCategory, description: 'Default: CLIENT_BILLABLE (aplicado por Prisma si no viene)' })
  @IsOptional()
  @IsEnum(TimeEntryCategory)
  category?: TimeEntryCategory;
}

export class ImportFromProjectsDto {
  @ApiProperty({
    type: [String],
    description: 'IDs de los proyectos del Banco a importar al plan',
    example: ['clxyz1', 'clxyz2'],
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  projectIds: string[];
}
