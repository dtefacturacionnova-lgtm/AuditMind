import {
  IsString, IsInt, IsOptional, IsNumber, IsDateString, IsBoolean, Min, Max,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// ─── HolidayConfig ─────────────────────────────────────────────────────────

export class CreateHolidayDto {
  @ApiProperty({ example: '2026-12-25' })
  @IsDateString()
  date: string;

  @ApiProperty({ example: 'Navidad' })
  @IsString()
  label: string;

  @ApiPropertyOptional({ description: 'Si aplica automáticamente cada año en el mismo mes/día', default: false })
  @IsOptional()
  @IsBoolean()
  recurring?: boolean;
}

export class UpdateHolidayDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  date?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  label?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  recurring?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

// ─── UserAvailabilityProfile ───────────────────────────────────────────────

export class CreateAvailabilityProfileDto {
  @ApiProperty({ example: 'usr_123' })
  @IsString()
  userId: string;

  @ApiProperty({ example: 2026 })
  @IsInt()
  year: number;

  @ApiPropertyOptional({ example: 5, description: 'Días laborales por semana (5 o 6)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(7)
  workingDaysPerWeek?: number;

  @ApiPropertyOptional({ example: 8 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  standardDailyHours?: number;

  @ApiPropertyOptional({ example: 15 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  annualVacationDays?: number;

  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  estimatedSickDays?: number;

  @ApiPropertyOptional({ example: 3 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  estimatedLeaveDays?: number;
}

export class UpdateAvailabilityProfileDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(7)
  workingDaysPerWeek?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  standardDailyHours?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  annualVacationDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  estimatedSickDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  estimatedLeaveDays?: number;
}

// ─── UserCostProfile ────────────────────────────────────────────────────────

export class CreateCostProfileDto {
  @ApiProperty({ example: 'usr_123' })
  @IsString()
  userId: string;

  @ApiProperty({ example: 2026 })
  @IsInt()
  year: number;

  @ApiProperty({ example: 24000 })
  @IsNumber()
  @Min(0)
  annualBaseSalary: number;

  @ApiPropertyOptional({ example: 1500 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  annualBonuses?: number;

  @ApiPropertyOptional({ example: 22, description: '% carga patronal/impuestos sobre planilla' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  payrollTaxRatePct?: number;

  @ApiPropertyOptional({ example: 15, description: '% de costos indirectos (overhead)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  indirectCostRatePct?: number;

  @ApiPropertyOptional({ example: 500 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  otherAnnualCosts?: number;

  @ApiPropertyOptional({ example: 3.0, description: 'Multiplicador sobre el punto de equilibrio' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  targetMultiplier?: number;

  @ApiPropertyOptional({ example: 75, description: '% de utilización objetivo' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  targetUtilizationPct?: number;

  @ApiPropertyOptional({ example: 45, description: 'Tarifa de facturación manual (override)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  effectiveOverrideRate?: number;

  @ApiPropertyOptional({ description: 'Horas netas disponibles a usar si aún no existe UserAvailabilityProfile' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  netAvailableHoursOverride?: number;
}

export class UpdateCostProfileDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  annualBaseSalary?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  annualBonuses?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  payrollTaxRatePct?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  indirectCostRatePct?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  otherAnnualCosts?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  targetMultiplier?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  targetUtilizationPct?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  effectiveOverrideRate?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  netAvailableHoursOverride?: number;
}
