import { PartialType, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { OrgAuditModality } from '@prisma/client';
import { CreateOrganizationDto } from './create-organization.dto';

export class UpdateOrganizationDto extends PartialType(CreateOrganizationDto) {
  @ApiPropertyOptional({ enum: OrgAuditModality, example: OrgAuditModality.BOTH })
  @IsOptional()
  @IsEnum(OrgAuditModality)
  auditModality?: OrgAuditModality;
}
