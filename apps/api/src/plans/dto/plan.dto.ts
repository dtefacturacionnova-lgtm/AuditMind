import {
  IsString, IsInt, IsOptional, IsNumber, IsDateString, IsArray, Min, Max, ArrayNotEmpty,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

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
