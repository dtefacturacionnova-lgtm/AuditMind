import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { WorkingPaperStatus } from '@prisma/client';
import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateWorkingPaperDto } from './create-working-paper.dto';

export class UpdateWorkingPaperDto extends PartialType(
  OmitType(CreateWorkingPaperDto, ['auditId', 'indexSection'] as const),
) {}

export class UpdateWorkingPaperStatusDto {
  @ApiProperty({ enum: WorkingPaperStatus })
  @IsEnum(WorkingPaperStatus)
  status: WorkingPaperStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reviewNotes?: string;
}
