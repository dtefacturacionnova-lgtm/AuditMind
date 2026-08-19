import {
  IsString, IsOptional, IsNumber, IsDateString, IsArray, ValidateNested, Min, Length,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ProposalTeamMemberDto {
  @ApiProperty({ example: 'Lic. Ana Portillo' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ example: 'Socio de encargo' })
  @IsOptional()
  @IsString()
  role?: string;

  @ApiPropertyOptional({ example: 120 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  hours?: number;
}

export class CreateProposalDto {
  @ApiProperty({ example: 'clx0000client' })
  @IsString()
  clientId: string;

  @ApiPropertyOptional({ example: 'Auditoría de estados financieros del ejercicio 2026 conforme a NIA.' })
  @IsOptional()
  @IsString()
  scope?: string;

  @ApiPropertyOptional({ example: '2026-01-01' })
  @IsOptional()
  @IsDateString()
  fiscalPeriodStart?: string;

  @ApiPropertyOptional({ example: '2026-12-31' })
  @IsOptional()
  @IsDateString()
  fiscalPeriodEnd?: string;

  @ApiPropertyOptional({ example: 12500 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  feeAmount?: number;

  @ApiPropertyOptional({ example: 'USD' })
  @IsOptional()
  @IsString()
  @Length(3, 3)
  feeCurrency?: string;

  @ApiPropertyOptional({ type: [ProposalTeamMemberDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProposalTeamMemberDto)
  teamJson?: ProposalTeamMemberDto[];
}

export class UpdateProposalDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  scope?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  fiscalPeriodStart?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  fiscalPeriodEnd?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  feeAmount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(3, 3)
  feeCurrency?: string;

  @ApiPropertyOptional({ type: [ProposalTeamMemberDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProposalTeamMemberDto)
  teamJson?: ProposalTeamMemberDto[];

  @ApiPropertyOptional({ description: 'Texto final de la propuesta, editado por el auditor' })
  @IsOptional()
  @IsString()
  finalContent?: string;

  @ApiPropertyOptional({ description: 'Borrador IA (normalmente se genera vía /generate-draft)' })
  @IsOptional()
  @IsString()
  aiDraftContent?: string;
}
