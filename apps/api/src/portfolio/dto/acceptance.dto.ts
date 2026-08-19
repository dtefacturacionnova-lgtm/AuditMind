import {
  IsString, IsOptional, IsEnum, IsArray, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AcceptanceRating } from '@prisma/client';

export class AcceptanceChecklistItemDto {
  @ApiProperty({ example: '¿Existen amenazas de autorevisión sobre el encargo?' })
  @IsString()
  item: string;

  @ApiPropertyOptional({ example: 'NO' })
  @IsOptional()
  @IsString()
  answer?: string;

  @ApiPropertyOptional({ example: 'La firma no presta servicios contables al cliente.' })
  @IsOptional()
  @IsString()
  comment?: string;
}

/**
 * Actualiza cualquiera de los 4 pares status/notes del Radar de Aceptación
 * (NIA 220 / ISQM 1) y/o el checklist. Todos los campos son opcionales:
 * la pantalla guarda dimensión por dimensión.
 */
export class UpdateAcceptanceCheckDto {
  @ApiPropertyOptional({ enum: AcceptanceRating, description: 'Independencia (NIA 220 / Código IESBA)' })
  @IsOptional()
  @IsEnum(AcceptanceRating)
  independenceStatus?: AcceptanceRating;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  independenceNotes?: string;

  @ApiPropertyOptional({ enum: AcceptanceRating, description: 'Competencia y recursos del equipo' })
  @IsOptional()
  @IsEnum(AcceptanceRating)
  competenceStatus?: AcceptanceRating;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  competenceNotes?: string;

  @ApiPropertyOptional({ enum: AcceptanceRating, description: 'Integridad de la administración' })
  @IsOptional()
  @IsEnum(AcceptanceRating)
  integrityStatus?: AcceptanceRating;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  integrityNotes?: string;

  @ApiPropertyOptional({ enum: AcceptanceRating, description: 'Riesgo del encargo' })
  @IsOptional()
  @IsEnum(AcceptanceRating)
  riskStatus?: AcceptanceRating;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  riskNotes?: string;

  @ApiPropertyOptional({ type: [AcceptanceChecklistItemDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AcceptanceChecklistItemDto)
  checklist?: AcceptanceChecklistItemDto[];
}

export class DecideAcceptanceDto {
  @ApiProperty({
    example: 'Se acepta el encargo: no se identificaron amenazas a la independencia y el equipo cuenta con la competencia requerida.',
    description: 'Justificación profesional de la decisión de aceptación/continuidad',
  })
  @IsString()
  overallJustification: string;
}
