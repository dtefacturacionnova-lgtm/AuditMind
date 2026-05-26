import { IsString, IsOptional, IsBoolean, IsInt, IsNumber, Min, Max, IsEnum } from 'class-validator';

// ─── AuditProcess ─────────────────────────────────────────────────────────────

export class CreateAuditProcessDto {
  @IsString() code: string;
  @IsString() name: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() apqcCode?: string;  // "1.0"…"13.0"
  @IsOptional() @IsInt() sortOrder?: number;
}

export class UpdateAuditProcessDto {
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() apqcCode?: string;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsInt() sortOrder?: number;
}

// ─── AuditableUnit ────────────────────────────────────────────────────────────

export class CreateAuditableUnitDto {
  @IsString() auditEntityId: string;
  @IsString() auditProcessId: string;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() auditType?: string;
  @IsOptional() @IsBoolean() isMandatory?: boolean;
  @IsOptional() @IsString() mandatoryBasis?: string;
  @IsOptional() @IsString() strategicLineId?: string;
  @IsOptional() @IsString() riskType?: string;
  @IsOptional() @IsString() notes?: string;
}

export class UpdateAuditableUnitDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() auditType?: string;
  @IsOptional() @IsBoolean() isMandatory?: boolean;
  @IsOptional() @IsString() mandatoryBasis?: string;
  @IsOptional() @IsString() strategicLineId?: string;
  @IsOptional() @IsString() riskType?: string;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsString() notes?: string;
}

// ─── AuditableUnitAssessment ──────────────────────────────────────────────────

export class UpsertAssessmentDto {
  @IsOptional() @IsInt() @Min(2020) @Max(2099) assessmentYear?: number;

  // Grupo A — Riesgo Residual
  @IsOptional() @IsInt() @Min(1) @Max(5) impactScore?: number;
  @IsOptional() @IsInt() @Min(1) @Max(5) likelihoodScore?: number;
  @IsOptional() @IsInt() @Min(1) @Max(5) controlMaturityScore?: number;

  // Grupo B — Factores Contextuales
  @IsOptional() @IsInt() @Min(1) @Max(5) materialityScore?: number;
  @IsOptional() @IsInt() @Min(1) @Max(5) strategicAlignScore?: number;
  @IsOptional() @IsInt() @Min(1) @Max(5) operationalAlignScore?: number;
  @IsOptional() @IsInt() @Min(1) @Max(5) fraudHistoryScore?: number;
  @IsOptional() @IsInt() @Min(1) @Max(5) managementReqScore?: number;
  @IsOptional() @IsInt() @Min(1) @Max(5) staffTurnoverScore?: number;
  @IsOptional() @IsInt() @Min(1) @Max(5) coverageHistoryScore?: number;

  // Historial
  @IsOptional() @IsString() lastAuditDate?: string;
  @IsOptional() @IsString() lastAuditOpinion?: string;
  @IsOptional() @IsInt() @Min(1) recommendedFreqMonths?: number;

  @IsOptional() @IsString() notes?: string;
}
