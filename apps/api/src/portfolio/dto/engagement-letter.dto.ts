import { IsString, IsOptional, IsUrl, IsIn, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const REPORTING_FRAMEWORKS = ['NIIF_COMPLETAS', 'NIIF_PYMES', 'OTRO'] as const;
export type ReportingFramework = (typeof REPORTING_FRAMEWORKS)[number];

export class CreateEngagementLetterDto {
  @ApiProperty({ example: 'clx0000proposal', description: 'Propuesta ACCEPTED de la que nace la carta' })
  @IsString()
  proposalId: string;

  @ApiPropertyOptional({
    enum: REPORTING_FRAMEWORKS,
    description: 'Marco de información financiera aplicable (NIA 210.6(a) y 210.10(d)): se nombra en la carta. Si se omite, la carta lo deja para completar.',
  })
  @IsOptional()
  @IsIn(REPORTING_FRAMEWORKS as unknown as string[])
  reportingFramework?: ReportingFramework;

  @ApiPropertyOptional({ description: 'Nombre del marco cuando es «OTRO»' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reportingFrameworkOther?: string;
}

export class UpdateEngagementLetterDto {
  @ApiPropertyOptional({ description: 'Texto de la carta de compromiso (NIA 210)' })
  @IsOptional()
  @IsString()
  content?: string;
}

export class SignEngagementLetterDto {
  @ApiProperty({ example: 'Lic. Roberto Morales' })
  @IsString()
  signedByClientName: string;

  @ApiProperty({ example: 'Representante Legal' })
  @IsString()
  signedByClientRole: string;

  @ApiPropertyOptional({ description: 'URL del PDF firmado escaneado' })
  @IsOptional()
  @IsUrl()
  fileUrl?: string;
}
