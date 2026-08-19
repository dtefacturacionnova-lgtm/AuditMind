import { IsString, IsOptional, IsUrl } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateEngagementLetterDto {
  @ApiProperty({ example: 'clx0000proposal', description: 'Propuesta ACCEPTED de la que nace la carta' })
  @IsString()
  proposalId: string;
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
