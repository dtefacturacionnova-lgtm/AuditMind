import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export const TEAM_ROLES = ['LEAD', 'SUPERVISOR', 'AUDITOR', 'OBSERVER', 'EXPERT'] as const;
export type TeamRole = (typeof TEAM_ROLES)[number];

export class AddTeamMemberDto {
  @ApiProperty({ example: 'usr_123' })
  @IsString()
  userId: string;

  @ApiPropertyOptional({ enum: TEAM_ROLES, default: 'AUDITOR' })
  @IsOptional()
  @IsIn(TEAM_ROLES)
  role?: TeamRole;
}

export class UpdateTeamMemberDto {
  @ApiPropertyOptional({ enum: TEAM_ROLES })
  @IsOptional()
  @IsIn(TEAM_ROLES)
  role?: TeamRole;

  @ApiPropertyOptional({ example: 40, description: 'Horas presupuestadas para esta persona en este encargo — base de "Presupuesto vs. Real"' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  budgetedHours?: number;
}
