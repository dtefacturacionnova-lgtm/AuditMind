import {
  IsString, IsOptional, IsInt, IsDateString, IsEnum, Min, Max, MinLength, MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EngagementKind, EngagementStatus } from '@prisma/client';

export class CreateEngagementDto {
  @ApiProperty({ example: 'clx0000client' })
  @IsString()
  clientId: string;

  @ApiPropertyOptional({
    enum: EngagementKind, default: EngagementKind.AUDIT,
    description: 'AUDIT (por defecto) o CONSULTING. Una consultoría lleva encargo, horas y costos como la auditoría, con menos rigor.',
  })
  @IsOptional()
  @IsEnum(EngagementKind)
  kind?: EngagementKind;

  @ApiPropertyOptional({
    example: 'Asesoría tributaria 2026',
    description: 'Nombre visible del encargo. Obligatorio en las consultorías.',
  })
  @IsOptional()
  @IsString()
  @MinLength(3) @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ example: 'clx0000letter' })
  @IsOptional()
  @IsString()
  engagementLetterId?: string;

  @ApiProperty({ example: 2026 })
  @Type(() => Number)
  @IsInt()
  @Min(1900) @Max(2200)
  fiscalYear: number;

  @ApiProperty({ example: '2026-12-31' })
  @IsDateString()
  fiscalYearEndDate: string;

  @ApiPropertyOptional({ example: '2027-01-15' })
  @IsOptional()
  @IsDateString()
  plannedStartDate?: string;

  @ApiPropertyOptional({ example: '2027-03-31' })
  @IsOptional()
  @IsDateString()
  plannedEndDate?: string;

  @ApiPropertyOptional({ description: 'Socio a cargo del encargo (User.id)' })
  @IsOptional()
  @IsString()
  leadPartnerId?: string;

  @ApiPropertyOptional({
    description:
      'AuditTemplate.id a usar al aprobar. Si se omite, approve() resuelve la plantilla de sistema code=AUDIT_EXTERNAL_FINANCIAL_V1.',
  })
  @IsOptional()
  @IsString()
  templateId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

/** Edición de un encargo todavía sin auditoría real: solo datos descriptivos, nunca cliente, ejercicio ni tipo. */
export class UpdateEngagementDto {
  @ApiPropertyOptional({ example: 'Asesoría tributaria 2026' })
  @IsOptional()
  @IsString()
  @MinLength(3) @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ example: '2027-01-15' })
  @IsOptional()
  @IsDateString()
  plannedStartDate?: string;

  @ApiPropertyOptional({ example: '2027-03-31' })
  @IsOptional()
  @IsDateString()
  plannedEndDate?: string;

  @ApiPropertyOptional({ description: 'Socio a cargo del encargo (User.id)' })
  @IsOptional()
  @IsString()
  leadPartnerId?: string;

  @ApiPropertyOptional({ description: 'Carta de compromiso FIRMADA del cliente que respalda el encargo (solo mientras es borrador)' })
  @IsOptional()
  @IsString()
  engagementLetterId?: string;

  @ApiPropertyOptional({ example: '2026-06-30', description: 'Cierre del ejercicio (solo mientras es borrador; debe caer en el ejercicio del encargo)' })
  @IsOptional()
  @IsDateString()
  fiscalYearEndDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class ProgramQueryDto {
  @ApiPropertyOptional({ example: 2027, description: 'Año en que se trabaja (el de la capacidad del equipo). Por defecto, el año en curso.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  year?: number;
}

export class ListEngagementsQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  clientId?: string;

  @ApiPropertyOptional({ enum: EngagementStatus })
  @IsOptional()
  @IsEnum(EngagementStatus)
  status?: EngagementStatus;
}
