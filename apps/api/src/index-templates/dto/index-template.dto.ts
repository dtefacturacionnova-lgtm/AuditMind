import { IsString, IsOptional, IsBoolean, IsArray, MaxLength, ValidateNested } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

// ─── Estructura de carpetas (espejo del DEFAULT_INDEX_TEMPLATE) ───────────────

export class FolderTemplateDto {
  @ApiProperty({ example: 'A-1' })
  @IsString()
  @MaxLength(20)
  ref: string;

  @ApiProperty({ example: 'Comunicación de Auditoría' })
  @IsString()
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  sortOrder?: number;

  @ApiPropertyOptional({ type: () => [FolderTemplateDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FolderTemplateDto)
  children?: FolderTemplateDto[];
}

export class PhaseTemplateDto {
  @ApiProperty({ example: 'PLANNING' })
  @IsString()
  phaseType: string;  // PhaseType enum value

  @ApiProperty({ example: 'Planificación de la Auditoría' })
  @IsString()
  @MaxLength(120)
  name: string;

  @ApiProperty({ example: 0 })
  order: number;

  @ApiProperty({ type: () => [FolderTemplateDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FolderTemplateDto)
  folders: FolderTemplateDto[];
}

// ─── DTOs de plantilla ────────────────────────────────────────────────────────

export class CreateIndexTemplateDto {
  @ApiProperty({ example: 'Auditoría de TI' })
  @IsString()
  @MaxLength(120)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @ApiProperty({ type: () => [PhaseTemplateDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PhaseTemplateDto)
  structure: PhaseTemplateDto[];
}

export class UpdateIndexTemplateDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @ApiPropertyOptional({ type: () => [PhaseTemplateDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PhaseTemplateDto)
  structure?: PhaseTemplateDto[];
}
