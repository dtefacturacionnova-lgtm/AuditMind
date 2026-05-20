import { IsString, IsOptional, IsEmail, IsNumber, Min, Max, IsHexColor } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateOrganizationDto {
  @ApiProperty({ example: 'Empresa ABC S.A.' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ example: '12.345.678-9' })
  @IsOptional()
  @IsString()
  rut?: string;

  @ApiPropertyOptional({ example: 'Retail' })
  @IsOptional()
  @IsString()
  industry?: string;

  @ApiPropertyOptional({ example: 'Chile' })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional({ example: '#0F2D4A' })
  @IsOptional()
  @IsHexColor()
  primaryColor?: string;

  @ApiPropertyOptional({ example: 50 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(500)
  maxUsers?: number;

  @ApiPropertyOptional({ example: 'PROFESSIONAL' })
  @IsOptional()
  @IsString()
  subscriptionTier?: string;
}
