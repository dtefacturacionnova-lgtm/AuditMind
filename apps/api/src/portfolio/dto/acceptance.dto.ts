import {
  IsString, IsOptional, IsEnum, IsArray, ValidateNested, IsNotEmpty, MinLength, MaxLength, IsIn, Matches,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AcceptanceRating } from '@prisma/client';
import { StrictBoolean } from '../../common/validators/strict-boolean.decorator';
import { CHECKLIST_KEYS, ChecklistStatus, PREDECESSOR_OUTCOMES, PredecessorOutcome } from '../acceptance-checklist.util';

export class AcceptanceChecklistItemDto {
  @ApiPropertyOptional({ enum: CHECKLIST_KEYS, description: 'Ítem fijo del Radar (auditor predecesor, conflictos, servicios previos). Sin clave = ítem libre.' })
  @IsOptional()
  @IsIn(CHECKLIST_KEYS)
  key?: string;

  @ApiProperty({ example: '¿Existen amenazas de autorevisión sobre el encargo?' })
  @IsString()
  @MaxLength(1000)
  item: string;

  @ApiPropertyOptional({ enum: ['PENDING', 'DONE', 'NOT_APPLICABLE'] })
  @IsOptional()
  @IsIn(['PENDING', 'DONE', 'NOT_APPLICABLE'])
  status?: ChecklistStatus;

  @ApiPropertyOptional({ example: '2026-10-20', description: 'Fecha de la solicitud al auditor predecesor' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'La fecha debe tener el formato AAAA-MM-DD.' })
  date?: string;

  @ApiPropertyOptional({ example: 'NO' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  answer?: string;

  @ApiPropertyOptional({ example: 'La firma no presta servicios contables al cliente.' })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  comment?: string;

  @ApiPropertyOptional({ example: 'Pérez & Asociados', description: 'Auditor o firma predecesora a quien se le escribió (solo PREDECESSOR).' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  predecessorFirm?: string;

  @ApiPropertyOptional({ description: 'El cliente autorizó la comunicación con su auditor anterior (solo PREDECESSOR).' })
  @IsOptional()
  @StrictBoolean()
  clientAuthorized?: boolean;

  @ApiPropertyOptional({ enum: PREDECESSOR_OUTCOMES, description: 'Resultado de la comunicación (solo PREDECESSOR).' })
  @IsOptional()
  @IsIn(PREDECESSOR_OUTCOMES)
  outcome?: PredecessorOutcome;

  @ApiPropertyOptional({ example: '2026-10-25', description: 'Fecha de la respuesta del auditor predecesor (solo PREDECESSOR).' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'La fecha debe tener el formato AAAA-MM-DD.' })
  responseDate?: string;
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

  @ApiPropertyOptional({ enum: AcceptanceRating, description: 'Sanciones / PLD (Ley PLD/FT/FP, Decreto 426/2025) — solo aplica si el despacho es sujeto obligado para este cliente (Art. 7.7)' })
  @IsOptional()
  @IsEnum(AcceptanceRating)
  sanctionsStatus?: AcceptanceRating;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sanctionsNotes?: string;

  @ApiPropertyOptional({ type: [AcceptanceChecklistItemDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AcceptanceChecklistItemDto)
  checklist?: AcceptanceChecklistItemDto[];
}

/**
 * Decidir el Radar. Acepta también las 5 calificaciones y sus notas tal como están en pantalla: se guardan junto con la decisión
 * en una sola operación (antes se decidía con lo último GUARDADO, así que un cambio sin guardar se perdía y la pantalla seguía
 * mostrando otra cosa junto al semáforo).
 */
export class DecideAcceptanceDto extends UpdateAcceptanceCheckDto {
  @ApiProperty({
    example: 'Se acepta el encargo: no se identificaron amenazas a la independencia y el equipo cuenta con la competencia requerida.',
    description: 'Justificación profesional de la decisión de aceptación/continuidad',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(10, { message: 'La justificación debe tener al menos 10 caracteres.' })
  overallJustification: string;
}

/** Revisión de UNA coincidencia del screening de sanciones: falso positivo o confirmada, siempre con el motivo. */
export class ReviewScreeningMatchDto {
  @ApiProperty({ description: 'Momento del screening revisado (`screenedAt`): si se volvió a correr, hay que recargar.' })
  @IsString()
  @IsNotEmpty()
  screenedAt: string;

  @ApiProperty({ description: 'Clave de la coincidencia (la entrega el servidor en `sanctionsScreeningResult.matches`).' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(600)
  matchKey: string;

  @ApiProperty({ enum: ['FALSE_POSITIVE', 'CONFIRMED'] })
  @IsIn(['FALSE_POSITIVE', 'CONFIRMED'])
  decision: 'FALSE_POSITIVE' | 'CONFIRMED';

  @ApiProperty({ description: 'Por qué se descarta (homónimo, otra fecha de nacimiento, otro país…) o qué se hizo al confirmarla.' })
  @IsString()
  @IsNotEmpty()
  @MinLength(10, { message: 'El motivo debe tener al menos 10 caracteres.' })
  @MaxLength(2000)
  reason: string;
}

/** Reabrir un Radar ya decidido (solo CAE o superior): deja constancia del motivo. */
export class ReopenAcceptanceDto {
  @ApiProperty({ description: 'Por qué se reabre la decisión (cambió la información, error en la evaluación…)' })
  @IsString()
  @IsNotEmpty()
  @MinLength(10, { message: 'El motivo debe tener al menos 10 caracteres.' })
  reason: string;
}
