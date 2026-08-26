import {
  IsString, IsOptional, IsBoolean, IsArray, IsEnum, ValidateNested, IsIn,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AuditType, WorkingPaperType, WpKind } from '@prisma/client';
import { Type } from 'class-transformer';

export class PaperLinkDefDto {
  @ApiProperty({ example: 'A-02', description: 'code o paperCode del papel fuente' })
  @IsString()
  sourceCode: string;

  @ApiProperty({ example: 'A-04', description: 'code o paperCode del papel destino' })
  @IsString()
  targetCode: string;

  @ApiProperty({ example: 'S3', description: 'Clave de sección fuente' })
  @IsString()
  sourceField: string;

  @ApiProperty({ example: 'S2', description: 'Clave de sección destino' })
  @IsString()
  targetField: string;

  @ApiPropertyOptional({ enum: ['DIRECT', 'AGGREGATED', 'AI_GENERATED'] })
  @IsOptional()
  @IsIn(['DIRECT', 'AGGREGATED', 'AI_GENERATED'])
  mappingType?: 'DIRECT' | 'AGGREGATED' | 'AI_GENERATED';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;
}

export class SectionChildDto {
  @ApiProperty({ example: 'A1' })
  @IsString()
  ref: string;

  @ApiProperty({ example: 'Subcarpeta' })
  @IsString()
  name: string;
}

export class SectionDefDto {
  @ApiProperty({ example: 'A' })
  @IsString()
  ref: string;

  @ApiProperty({ example: 'Planificación y Entendimiento del Negocio' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ example: 'PLANNING' })
  @IsOptional()
  @IsString()
  phaseType?: string;

  @ApiPropertyOptional({ type: [SectionChildDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SectionChildDto)
  children?: SectionChildDto[];
}

export class PaperDefDto {
  @ApiProperty({ example: 'A-01' })
  @IsString()
  code: string;

  @ApiProperty({ example: 'A' })
  @IsString()
  indexSection: string;

  @ApiProperty({ example: 'Orden de Trabajo' })
  @IsString()
  title: string;

  @ApiProperty({ enum: WorkingPaperType })
  @IsEnum(WorkingPaperType)
  type: WorkingPaperType;

  @ApiProperty({ enum: WpKind })
  @IsEnum(WpKind)
  wpKind: WpKind;

  @ApiPropertyOptional({ example: 'PT-A1' })
  @IsOptional()
  @IsString()
  paperCode?: string;
}

export class CreateAuditTemplateDto {
  @ApiProperty({ example: 'Auditoría AML - PLD' })
  @IsString()
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ type: [String], enum: AuditType, isArray: true })
  @IsArray()
  auditTypes: AuditType[];

  @ApiProperty({ type: [PaperDefDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PaperDefDto)
  papers: PaperDefDto[];

  @ApiPropertyOptional({ type: [SectionDefDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SectionDefDto)
  sections?: SectionDefDto[];

  @ApiPropertyOptional({ type: [PaperLinkDefDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PaperLinkDefDto)
  links?: PaperLinkDefDto[];

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class UpdateAuditTemplateDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ type: [String], enum: AuditType, isArray: true })
  @IsOptional()
  @IsArray()
  auditTypes?: AuditType[];

  @ApiPropertyOptional({ type: [PaperDefDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PaperDefDto)
  papers?: PaperDefDto[];

  @ApiPropertyOptional({ type: [SectionDefDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SectionDefDto)
  sections?: SectionDefDto[];

  @ApiPropertyOptional({ type: [PaperLinkDefDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PaperLinkDefDto)
  links?: PaperLinkDefDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
