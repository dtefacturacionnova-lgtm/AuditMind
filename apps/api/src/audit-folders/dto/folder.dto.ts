import {
  IsString, IsOptional, IsInt, IsEnum, IsBoolean, Min, MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PhaseType } from '@prisma/client';

// ─── Fase ────────────────────────────────────────────────────────────────────

export class CreatePhaseDto {
  @ApiProperty({ enum: PhaseType })
  @IsEnum(PhaseType)
  phaseType: PhaseType;

  @ApiProperty({ example: 'Planificación de la Auditoría' })
  @IsString()
  @MaxLength(120)
  name: string;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;

  @ApiPropertyOptional()
  @IsOptional()
  startDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  targetDate?: string;
}

export class UpdatePhaseDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  startDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  targetDate?: string;
}

// ─── Carpeta ──────────────────────────────────────────────────────────────────

export class CreateFolderDto {
  @ApiProperty({ example: 'A-1' })
  @IsString()
  @MaxLength(20)
  ref: string;

  @ApiProperty({ example: 'Comunicación de Auditoría' })
  @IsString()
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'ID de la fase a la que pertenece' })
  @IsOptional()
  @IsString()
  phaseId?: string;

  @ApiPropertyOptional({ description: 'ID de la carpeta padre (para sub-carpetas)' })
  @IsOptional()
  @IsString()
  parentId?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class UpdateFolderDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  ref?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phaseId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  parentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class ReorderFoldersDto {
  @ApiProperty({ description: 'Array of { id, sortOrder } pairs' })
  items: { id: string; sortOrder: number }[];
}
