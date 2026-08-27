import {
  IsString, IsOptional, IsEnum,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  QaipTrack, QaipFindingSource, QaipFindingStatus, FindingSeverity,
  QaipRootCauseCategory, QaipRemediationStatus,
} from '@prisma/client';

export class CreateQaipFindingDto {
  @ApiProperty({ enum: QaipTrack })
  @IsEnum(QaipTrack)
  track: QaipTrack;

  @ApiProperty({ enum: QaipFindingSource })
  @IsEnum(QaipFindingSource)
  source: QaipFindingSource;

  @ApiPropertyOptional({ description: 'Si el hallazgo viene de un standard calificado en una autoevaluación' })
  @IsOptional()
  @IsString()
  assessmentItemId?: string;

  @ApiPropertyOptional({ description: 'Si el hallazgo viene de una Revisión de Calidad del Encargo (EQR)' })
  @IsOptional()
  @IsString()
  engagementId?: string;

  @ApiProperty({ enum: FindingSeverity })
  @IsEnum(FindingSeverity)
  severity: FindingSeverity;

  @ApiProperty({ example: 'La revisión de papeles de trabajo no se completó antes de la firma del informe en 3 de 5 encargos muestreados.' })
  @IsString()
  description: string;
}

export class UpdateQaipFindingStatusDto {
  @ApiProperty({ enum: QaipFindingStatus })
  @IsEnum(QaipFindingStatus)
  status: QaipFindingStatus;
}

export class CreateQaipRootCauseDto {
  @ApiProperty({ enum: QaipRootCauseCategory })
  @IsEnum(QaipRootCauseCategory)
  category: QaipRootCauseCategory;

  @ApiProperty({ example: 'El supervisor asignado tenía 4 encargos simultáneos en el cierre de temporada — presión de tiempo, no falta de conocimiento.' })
  @IsString()
  analysis: string;
}

export class CreateQaipRemediationActionDto {
  @ApiProperty({ example: 'Redistribuir la carga de supervisión en temporada alta y agregar un checkpoint de revisión intermedio.' })
  @IsString()
  description: string;

  @ApiProperty({ description: 'Usuario responsable del plan de acción' })
  @IsString()
  ownerId: string;

  @ApiProperty()
  @IsString()
  dueDate: string;
}

export class UpdateQaipRemediationActionDto {
  @ApiPropertyOptional({ enum: QaipRemediationStatus })
  @IsOptional()
  @IsEnum(QaipRemediationStatus)
  status?: QaipRemediationStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  closureEvidence?: string;
}
