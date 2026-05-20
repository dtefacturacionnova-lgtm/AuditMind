import {
  IsString, IsOptional, IsEnum, IsArray, IsBoolean, IsObject,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { WorkingPaperType, TickMark } from '@prisma/client';

export class CreateWorkingPaperDto {
  @ApiProperty({ example: 'Evaluación de controles de caja' })
  @IsString()
  title: string;

  @ApiProperty({ enum: WorkingPaperType })
  @IsEnum(WorkingPaperType)
  type: WorkingPaperType;

  @ApiProperty({ example: 'B', description: 'Índice: A, B, C, D, E, AD' })
  @IsString()
  indexSection: string;

  @ApiProperty({ example: 'audit-cuid-here' })
  @IsString()
  auditId: string;

  @ApiPropertyOptional({ example: 'reviewer-cuid-here' })
  @IsOptional()
  @IsString()
  reviewerId?: string;

  @ApiPropertyOptional({
    description: 'Contenido estructurado: {objective, scope, procedures, evidence, observations}',
    example: { objective: 'Verificar controles', scope: 'Ejercicio 2025' },
  })
  @IsOptional()
  @IsObject()
  content?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  conclusion?: string;

  @ApiPropertyOptional({ enum: TickMark, isArray: true })
  @IsOptional()
  @IsArray()
  @IsEnum(TickMark, { each: true })
  tickMarks?: TickMark[];

  @ApiPropertyOptional({ example: ['B-01', 'C-03'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  crossReferences?: string[];

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  aiAssisted?: boolean;
}

export class AddCommentDto {
  @ApiProperty()
  @IsString()
  content: string;
}

export class AddTickMarkEntryDto {
  @ApiProperty({ description: 'Descripción del ítem a marcar' })
  @IsString()
  fieldPath: string;

  @ApiProperty({ enum: TickMark })
  @IsEnum(TickMark)
  tickMark: TickMark;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}
