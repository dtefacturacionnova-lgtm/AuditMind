import {
  IsString, IsOptional, IsEnum, IsBoolean,
  IsNumber, Min, Max, IsDecimal,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FindingSeverity } from '@prisma/client';
import { Type } from 'class-transformer';

export class CreateFindingDto {
  @ApiProperty({ example: 'Falta de segregación de funciones en cuentas por pagar' })
  @IsString()
  title: string;

  @ApiProperty({ enum: FindingSeverity })
  @IsEnum(FindingSeverity)
  severity: FindingSeverity;

  @ApiProperty()
  @IsString()
  auditId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  workingPaperId?: string;

  @ApiProperty({ description: 'Condición: lo que encontramos' })
  @IsString()
  condition: string;

  @ApiProperty({ description: 'Criterio: norma o política aplicable' })
  @IsString()
  criteria: string;

  @ApiProperty({ description: 'Causa: por qué ocurre' })
  @IsString()
  cause: string;

  @ApiProperty({ description: 'Efecto: consecuencia del hallazgo' })
  @IsString()
  effect: string;

  @ApiPropertyOptional({ description: 'Riesgo: impacto potencial' })
  @IsOptional()
  @IsString()
  risk?: string;

  @ApiPropertyOptional({ description: 'Recomendación de auditoría' })
  @IsOptional()
  @IsString()
  recommendation?: string;

  @ApiPropertyOptional({ description: 'Monto del efecto económico' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  effectAmount?: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isMaterial?: boolean;

  @ApiPropertyOptional({ example: 'COSO 2013' })
  @IsOptional()
  @IsString()
  normativeReference?: string;

  @ApiPropertyOptional({ example: 'Principio 10' })
  @IsOptional()
  @IsString()
  normativeArticle?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isRecurring?: boolean;
}

export class UpdateFindingDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ enum: FindingSeverity })
  @IsOptional()
  @IsEnum(FindingSeverity)
  severity?: FindingSeverity;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  condition?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  criteria?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cause?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  effect?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  risk?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  recommendation?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  managementResponse?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  effectAmount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isMaterial?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  normativeReference?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  normativeArticle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isRecurring?: boolean;
}

export class AssignResponsibleDto {
  @ApiProperty()
  @IsString()
  responsibleId: string;

  @ApiProperty({ example: '2026-06-30' })
  @IsString()
  dueDate: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  actionDescription?: string;
}

export class RejectFindingDto {
  @ApiProperty({ description: 'Razón del rechazo con observaciones del revisor' })
  @IsString()
  reason: string;
}
