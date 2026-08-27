import { IsString, IsOptional, IsInt, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpsertIndependenceDeclarationDto {
  @ApiPropertyOptional({ description: 'Por defecto, el año en curso' })
  @IsOptional()
  @IsInt()
  year?: number;

  @ApiProperty({ example: 'Declaro que durante el período no tuve conflictos de interés ni amenazas a mi independencia como CAE...' })
  @IsString()
  declarationText: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  documentUrl?: string;
}

export class CreateAuditCharterDto {
  @ApiProperty({ description: 'Contenido del estatuto (misión, autoridad, alcance, independencia)' })
  @IsString()
  content: string;

  @ApiProperty({ example: 'Junta Directiva / Comité de Auditoría' })
  @IsString()
  approvedBy: string;

  @ApiProperty()
  @IsDateString()
  approvedAt: string;

  @ApiProperty()
  @IsDateString()
  effectiveDate: string;
}
