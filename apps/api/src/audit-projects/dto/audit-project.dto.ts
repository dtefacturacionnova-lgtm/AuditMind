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
  // Tab 2
  @ApiPropertyOptional() @IsOptional() @IsNumber() areaScore?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(4) strategicImpact?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(4) operationalImpact?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(4) legalRequirement?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(4) lastAuditAge?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(4) riskPerception?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() finalRiskScore?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() finalRiskLevel?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() includeInPlan?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() targetPlanYear?: number;
  // Tab 3
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
  @ApiPropertyOptional() @IsOptional() @IsNumber() areaScore?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(4) strategicImpact?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(4) operationalImpact?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(4) legalRequirement?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(4) lastAuditAge?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(4) riskPerception?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() finalRiskScore?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() finalRiskLevel?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() includeInPlan?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() targetPlanYear?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() legalBasis?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() frequencyPerYear?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() plannedHours?: number;
  @ApiPropertyOptional() @IsOptional() teamJson?: any;
  @ApiPropertyOptional() @IsOptional() @IsNumber() totalBudget?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() status?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean;
}
