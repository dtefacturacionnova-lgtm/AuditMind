import {
  IsString, IsOptional, IsEnum, IsDateString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { QaipTrack, QaipAssessmentKind, AcceptanceRating } from '@prisma/client';

export class StartQaipAssessmentDto {
  @ApiProperty({ enum: QaipTrack })
  @IsEnum(QaipTrack)
  track: QaipTrack;

  @ApiPropertyOptional({ enum: QaipAssessmentKind, default: 'AUTOEVALUACION' })
  @IsOptional()
  @IsEnum(QaipAssessmentKind)
  kind?: QaipAssessmentKind;

  @ApiPropertyOptional({ example: '2026', description: 'Por defecto, el año en curso' })
  @IsOptional()
  @IsString()
  period?: string;

  @ApiPropertyOptional({ description: 'Nombre del evaluador — solo EQA_EXTERNA/SAIV' })
  @IsOptional()
  @IsString()
  assessorName?: string;
}

export class UpdateQaipAssessmentItemDto {
  @ApiPropertyOptional({ enum: AcceptanceRating })
  @IsOptional()
  @IsEnum(AcceptanceRating)
  rating?: AcceptanceRating;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  evidence?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class DecideQaipAssessmentDto {
  @ApiProperty({ example: 'Se declara conformidad sustancial con las Normas Globales del IIA para el período 2026.' })
  @IsString()
  overallJustification: string;

  @ApiPropertyOptional({ description: 'Próxima EQA/evaluación externa (Std. 8.4: cada 5 años)' })
  @IsOptional()
  @IsDateString()
  nextDueAt?: string;
}
