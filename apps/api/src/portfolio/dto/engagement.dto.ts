import {
  IsString, IsOptional, IsInt, IsDateString, IsEnum, Min, Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EngagementStatus } from '@prisma/client';

export class CreateEngagementDto {
  @ApiProperty({ example: 'clx0000client' })
  @IsString()
  clientId: string;

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
