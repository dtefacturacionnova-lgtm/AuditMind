import {
  IsString, IsInt, IsOptional, IsNumber, IsDateString, IsArray, Min, Max, ArrayNotEmpty, IsEnum, MinLength, MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TimeEntryCategory } from '@prisma/client';

export class CreatePlanDto {
  @ApiProperty({ example: 2026 })
  @IsInt()
  @Min(2000) @Max(2100)
  year: number;

  @ApiProperty({ example: 'Plan Anual de Auditoría 2026' })
  @IsString()
  @MinLength(3)
  name: string;

  @ApiPropertyOptional({ example: 1800 })
  @IsOptional()
  @IsNumber()
  @Min(0)
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
  @MinLength(3)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  totalHours?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  objectives?: string[];
}

/** Registrar un cambio en el historial del plan: el servidor pone la fecha, la persona y su rol (el navegador ya no escribe el historial). */
export class AddPlanAmendmentDto {
  @ApiProperty({ description: 'Qué cambió y por qué' })
  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  description: string;
}

export class CreatePlanItemDto {
  @ApiProperty({ example: 'ent-06' })
  @IsString()
  auditEntityId: string;

  @ApiProperty({ example: 320 })
  @IsNumber()
  @Min(0)
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
  @Min(0)
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

export class LinkAuditDto {
  @ApiProperty({ example: 'audit_123', description: 'Encargo ya existente de la organización a vincular con este ítem del plan' })
  @IsString()
  auditId: string;
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
