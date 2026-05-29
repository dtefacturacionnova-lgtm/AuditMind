import {
  IsString, IsOptional, IsBoolean, IsArray, IsEnum, ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AuditType, WorkingPaperType, WpKind } from '@prisma/client';
import { Type } from 'class-transformer';

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
  @ApiProperty({ example: 'Auditoría AML - LCDA' })
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

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
