import { IsString, IsInt, IsNumber, IsOptional, IsDateString, Min, Max, IsIn } from 'class-validator';
import { CertificationType } from '@prisma/client';

export class CreateCertificationDto {
  @IsIn(Object.values(CertificationType))
  type: CertificationType;

  @IsOptional() @IsString()
  certNumber?: string;

  @IsDateString()
  issuedAt: string;

  @IsOptional() @IsDateString()
  expiresAt?: string;

  @IsOptional() @IsString()
  verificationUrl?: string;
}

export class CreateCompetencyDto {
  @IsString()
  area: string;

  @IsInt() @Min(1) @Max(5)
  expertiseLevel: number;

  @IsOptional() @IsInt() @Min(0)
  yearsExperience?: number;
}

export class UpdateCompetencyDto {
  @IsOptional() @IsInt() @Min(1) @Max(5)
  expertiseLevel?: number;

  @IsOptional() @IsInt() @Min(0)
  yearsExperience?: number;
}

export class CreateCpeRecordDto {
  @IsInt()
  year: number;

  @IsIn(['etica', 'tecnica', 'liderazgo'])
  category: string;

  @IsNumber() @Min(0.25)
  hours: number;

  @IsString()
  description: string;

  @IsDateString()
  completedAt: string;
}
