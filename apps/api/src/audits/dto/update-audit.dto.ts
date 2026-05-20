import { PartialType, OmitType } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { AuditStatus } from '@prisma/client';
import { CreateAuditDto } from './create-audit.dto';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class UpdateAuditDto extends PartialType(
  OmitType(CreateAuditDto, ['auditableUnitId'] as const),
) {}

export class UpdateAuditStatusDto {
  @ApiProperty({ enum: AuditStatus })
  @IsEnum(AuditStatus)
  status: AuditStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  comment?: string;
}
