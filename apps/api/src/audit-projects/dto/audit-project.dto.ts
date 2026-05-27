import { IsString, IsOptional, IsNumber, IsBoolean, IsInt, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateAuditProjectDto {
  @ApiProperty() @IsString() correlative: string;
  @ApiProperty() @IsString() name: string;
  @ApiProperty() @IsInt() planYear: number;
  @ApiPropertyOptional() @IsOptional() @IsString() strategicObjectiveId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() strategicLineId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() responsibleEntityId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() supportEntityId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() riskCategory?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;

  // Tab 2 — Grupo A: Riesgo Residual (escala 1-5)
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(5) impactScore?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(5) likelihoodScore?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(5) controlMaturityScore?: number;

  // Tab 2 — Grupo B: Factores Contextuales (escala 1-5)
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(5) materialityScore?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(5) strategicAlignScore?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(5) operationalAlignScore?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(5) fraudHistoryScore?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(5) managementReqScore?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(5) staffTurnoverScore?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(5) coverageHistoryScore?: number;

  // Tab 2 — Campos adicionales del proyecto
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(4) legalRequirement?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() lastAuditOpinion?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() finalRiskScore?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() finalRiskLevel?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() includeInPlan?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() targetPlanYear?: number;

  // Tab 3 — Planificación
  @ApiPropertyOptional() @IsOptional() @IsString() legalBasis?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() frequencyPerYear?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() plannedHours?: number;
  @ApiPropertyOptional() @IsOptional() teamJson?: any;
  @ApiPropertyOptional() @IsOptional() @IsNumber() totalBudget?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() status?: string;
}

export class UpdateAuditProjectDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() planYear?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() strategicObjectiveId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() strategicLineId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() responsibleEntityId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() supportEntityId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() riskCategory?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;

  // Grupo A
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(5) impactScore?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(5) likelihoodScore?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(5) controlMaturityScore?: number;

  // Grupo B
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(5) materialityScore?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(5) strategicAlignScore?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(5) operationalAlignScore?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(5) fraudHistoryScore?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(5) managementReqScore?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(5) staffTurnoverScore?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(5) coverageHistoryScore?: number;

  // Adicionales
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(4) legalRequirement?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() lastAuditOpinion?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() finalRiskScore?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() finalRiskLevel?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() includeInPlan?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() targetPlanYear?: number;

  // Planificación
  @ApiPropertyOptional() @IsOptional() @IsString() legalBasis?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() frequencyPerYear?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() plannedHours?: number;
  @ApiPropertyOptional() @IsOptional() teamJson?: any;
  @ApiPropertyOptional() @IsOptional() @IsNumber() totalBudget?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() status?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean;
}
