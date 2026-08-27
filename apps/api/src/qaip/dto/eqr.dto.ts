import { IsString, IsOptional, IsBoolean, IsEnum, IsArray } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AcceptanceRating } from '@prisma/client';

export class AssignEqrReviewerDto {
  @ApiProperty({ description: 'Usuario independiente del equipo del encargo' })
  @IsString()
  reviewerId: string;

  @ApiPropertyOptional({ description: '¿El revisor fue el socio/gerente de este encargo en algún momento?' })
  @IsOptional()
  @IsBoolean()
  wasEngagementPartner?: boolean;

  @ApiPropertyOptional({ description: 'Obligatorio si wasEngagementPartner=true — justificación del enfriamiento (NIGC 2)' })
  @IsOptional()
  @IsString()
  independenceJustification?: string;
}

export class UpdateEqrChecklistDto {
  @ApiPropertyOptional({ type: [Object] })
  @IsOptional()
  @IsArray()
  checklist?: Array<{ item: string; ok?: boolean; comment?: string }>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class CompleteEqrDto {
  @ApiProperty({ enum: AcceptanceRating })
  @IsEnum(AcceptanceRating)
  result: AcceptanceRating;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
