import {
  IsString, IsOptional, IsEnum, IsEmail, IsNumber, IsDateString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ConfirmationType } from '@prisma/client';

export class CreateConfirmationDto {
  @ApiProperty({ enum: ConfirmationType, example: 'BANK' })
  @IsEnum(ConfirmationType)
  type: ConfirmationType;

  @ApiProperty({ example: 'audit-01' })
  @IsString()
  auditId: string;

  @ApiProperty({ example: 'Banco de Chile' })
  @IsString()
  respondentName: string;

  @ApiProperty({ example: 'confirmaciones@bancochile.cl' })
  @IsEmail()
  respondentEmail: string;

  @ApiPropertyOptional({ example: 1500000 })
  @IsOptional()
  @IsNumber()
  amount?: number;

  @ApiPropertyOptional({ example: 'Cta. Cte. 123-456-7' })
  @IsOptional()
  @IsString()
  accountRef?: string;
}

export class UpdateConfirmationDto {
  @ApiPropertyOptional({ example: 'Banco de Chile' })
  @IsOptional()
  @IsString()
  respondentName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  respondentEmail?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  amount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  accountRef?: string;
}

export class ReceiveResponseDto {
  @ApiProperty({ example: 'Confirmamos saldo de $1,250,000 CLP.' })
  @IsString()
  responseContent: string;

  @ApiPropertyOptional({ example: 1250000 })
  @IsOptional()
  @IsNumber()
  responseAmount?: number;
}

export class ReconcileDto {
  @ApiPropertyOptional({ example: 'Diferencia corresponde a comisión bancaria.' })
  @IsOptional()
  @IsString()
  differenceExplanation?: string;
}

export class AltProcedureDto {
  @ApiProperty({ example: 'Se aplicó procedimiento alternativo: revisión de estados de cuenta.' })
  @IsString()
  alternativeProcedure: string;
}
