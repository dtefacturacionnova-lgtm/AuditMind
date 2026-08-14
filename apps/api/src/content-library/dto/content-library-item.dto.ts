import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsArray, IsInt, IsEnum } from 'class-validator';
import { ContentLibraryKind } from '@prisma/client';

export class CreateContentLibraryItemDto {
  @ApiProperty({ enum: ContentLibraryKind })
  @IsEnum(ContentLibraryKind)
  kind: ContentLibraryKind;

  @ApiProperty({ description: 'Código de agrupación — código de papel (C-01) o sectionKey COSO (S1-S5)' })
  @IsString()
  groupKey: string;

  @ApiPropertyOptional({ description: 'Etiqueta legible del grupo, ej. "Caja y Bancos (NIA 505)"' })
  @IsOptional()
  @IsString()
  groupLabel?: string;

  @ApiProperty({ description: 'Procedimiento completo, o nombre del principio COSO' })
  @IsString()
  itemLabel: string;

  @ApiPropertyOptional({ description: 'Técnica de auditoría — solo procedimientos sustantivos' })
  @IsOptional()
  @IsString()
  itemSubtitle?: string;

  @ApiPropertyOptional({ type: [String], description: 'Preguntas del principio — solo preguntas COSO' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  itemDetails?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class UpdateContentLibraryItemDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  groupKey?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  groupLabel?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  itemLabel?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  itemSubtitle?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  itemDetails?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  sortOrder?: number;
}
