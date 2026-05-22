import {
  IsString, IsOptional, IsEnum, IsBoolean, IsInt, IsNotEmpty,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MappingType, FieldType } from '@prisma/client';

// ─── PaperSection DTOs ────────────────────────────────────────────────────────

export class UpdateSectionValueDto {
  @ApiProperty({ description: 'Nuevo valor de la sección (cualquier tipo JSON)' })
  @IsNotEmpty()
  value: unknown;
}

export class InitFromTemplateDto {
  // Intentionally empty — templateKey comes from URL param
}

// ─── PaperLink DTOs ───────────────────────────────────────────────────────────

export class CreatePaperLinkDto {
  @ApiProperty({ description: 'ID del papel fuente (que genera el dato)' })
  @IsString()
  sourceId: string;

  @ApiProperty({ description: 'Campo de sección fuente, e.g. "S3.riskLevel"' })
  @IsString()
  sourceField: string;

  @ApiProperty({ description: 'Campo de sección destino, e.g. "S2.inherentRisk"' })
  @IsString()
  targetField: string;

  @ApiPropertyOptional({ enum: MappingType, default: MappingType.DIRECT })
  @IsOptional()
  @IsEnum(MappingType)
  mappingType?: MappingType;

  @ApiPropertyOptional({ description: 'Descripción human-readable del flujo de datos' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

// ─── SectionTemplate (used internally by paper-templates.ts) ─────────────────

export interface SectionTemplate {
  sectionKey:   string;
  label:        string;
  description?: string;
  fieldType:    FieldType;
  options?:     string[];     // For ENUM_SELECT
  isRequired:   boolean;
  isAutoFilled: boolean;
  sourceRef?:   string;       // "paperCode::sectionKey" if auto-filled
  sortOrder:    number;
  aiHint?:      string;
  defaultValue?: unknown;
}
